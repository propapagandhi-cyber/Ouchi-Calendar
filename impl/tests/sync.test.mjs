// Acceptance for spec/software.md B-4 with a mock GitHub client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../web/js/store/sync.js';
import {
  SyncError, GitHubClient, encodeConnectionCode, decodeConnectionCode, utf8ToB64, b64ToUtf8,
} from '../web/js/store/github.js';
import { emptyData, upsert } from '../web/js/model.js';

class MockClient {
  constructor(remote = null) {
    this.remote = remote; // { data, sha }
    this.puts = 0;
    this.conflictsLeft = 0;
  }
  async get() {
    return this.remote ? structuredClone(this.remote) : { data: null, sha: null };
  }
  async put(data, sha) {
    if (this.conflictsLeft > 0) {
      this.conflictsLeft--;
      // someone else wrote in between
      const other = upsert(this.remote.data, 'events', { id: 'e_other', title: 'other', members: ['m1'], date: '2026-11-20' }, 500);
      this.remote = { data: other, sha: this.remote.sha + 'x' };
      throw new SyncError('conflict');
    }
    if ((this.remote?.sha ?? null) !== sha) throw new SyncError('conflict');
    this.puts++;
    this.remote = { data: structuredClone(data), sha: `sha${this.puts}` };
    return this.remote.sha;
  }
}

const withEvent = (data, id, ts) => upsert(data, 'events', { id, title: id, members: ['m1'], date: '2026-11-15' }, ts);

test('B-4.1 creates the file when the remote does not exist', async () => {
  const client = new MockClient(null);
  const local = withEvent(emptyData(), 'e_local', 100);
  const { wrote } = await new SyncEngine(client).run(() => local);
  assert.equal(wrote, true);
  assert.deepEqual(client.remote.data.events.map((e) => e.id), ['e_local']);
});

test('B-4.2 independent additions on both sides are kept', async () => {
  const client = new MockClient({ data: withEvent(emptyData(), 'e_remote', 100), sha: 's0' });
  const local = withEvent(emptyData(), 'e_local', 200);
  const { merged, wrote } = await new SyncEngine(client).run(() => local);
  assert.equal(wrote, true);
  assert.deepEqual(merged.events.map((e) => e.id), ['e_local', 'e_remote']);
  assert.deepEqual(client.remote.data.events.map((e) => e.id), ['e_local', 'e_remote']);
});

test('B-4.3 newer edit of the same record wins', async () => {
  const remoteData = upsert(emptyData(), 'events', { id: 'e1', title: 'remote', members: ['m1'], date: '2026-11-15' }, 100);
  const localData = upsert(emptyData(), 'events', { id: 'e1', title: 'local', members: ['m1'], date: '2026-11-15' }, 300);
  const client = new MockClient({ data: remoteData, sha: 's0' });
  const { merged } = await new SyncEngine(client).run(() => localData);
  assert.equal(merged.events[0].title, 'local');
});

test('B-4.4 one conflict is retried and succeeds', async () => {
  const client = new MockClient({ data: emptyData(), sha: 's0' });
  client.conflictsLeft = 1;
  const local = withEvent(emptyData(), 'e_local', 200);
  const { wrote, merged } = await new SyncEngine(client).run(() => local);
  assert.equal(wrote, true);
  assert.deepEqual(merged.events.map((e) => e.id), ['e_local', 'e_other']);
});

test('B-4.5 no write when nothing changed', async () => {
  const data = withEvent(emptyData(), 'e1', 100);
  const client = new MockClient({ data, sha: 's0' });
  const { wrote } = await new SyncEngine(client).run(() => data);
  assert.equal(wrote, false);
  assert.equal(client.puts, 0);
});

test('connection code round-trip', () => {
  const code = encodeConnectionCode({ owner: 'me', repo: 'Ouchi-Calendar-data', token: 'github_pat_TEST' });
  assert.ok(code.startsWith('OUCHI1:'));
  const conn = decodeConnectionCode(`  ${code.slice(0, 10)}\n${code.slice(10)} `);
  assert.deepEqual(conn, { owner: 'me', repo: 'Ouchi-Calendar-data', token: 'github_pat_TEST', branch: 'main', path: 'data.json' });
  assert.throws(() => decodeConnectionCode('hello'), (e) => e.kind === 'format');
});

test('utf8 base64 round-trip', () => {
  const s = 'サッカー⚽ 上履き';
  assert.equal(b64ToUtf8(utf8ToB64(s)), s);
});

test('GitHubClient maps HTTP errors and decodes content', async () => {
  const conn = { owner: 'o', repo: 'r', token: 't', branch: 'main', path: 'data.json' };
  const json = (status, body) => ({ status, ok: status < 300, headers: new Map(), json: async () => body, text: async () => JSON.stringify(body) });
  const payload = { schema: 1, events: [], tasks: [], members: [] };
  let client = new GitHubClient(conn, { fetchImpl: async () => json(200, { sha: 'abc', content: utf8ToB64(JSON.stringify(payload)) }) });
  assert.deepEqual(await client.get(), { data: payload, sha: 'abc' });

  client = new GitHubClient(conn, { fetchImpl: async () => json(401, {}) });
  await assert.rejects(client.get(), (e) => e.kind === 'auth');

  client = new GitHubClient(conn, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(client.get(), (e) => e.kind === 'offline');

  // file missing but repo exists -> empty
  client = new GitHubClient(conn, { fetchImpl: async (url) => (url.includes('/contents/') ? json(404, {}) : json(200, {})) });
  assert.deepEqual(await client.get(), { data: null, sha: null });

  client = new GitHubClient(conn, { fetchImpl: async () => json(409, {}) });
  await assert.rejects(client.put(payload, 'x'), (e) => e.kind === 'conflict');
});
