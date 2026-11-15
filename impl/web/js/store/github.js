// GitHub Contents API client for data.json (spec/interface/data-schema.md §同期).
import { SYNC, CONNECTION_CODE_PREFIX } from '../config.js';
import { canonicalJSON } from '../model.js';

export class SyncError extends Error {
  /** kind: offline | auth | forbidden | ratelimit | notfound | conflict | server | format | unknown */
  constructor(kind, message = kind, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

// ---- base64 helpers (UTF-8 safe) ----

export function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const toB64Url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
};

// ---- connection code ----

export function encodeConnectionCode({ owner, repo, token, branch, path }) {
  const obj = { o: owner.trim(), r: repo.trim(), t: token.trim() };
  if (branch && branch !== SYNC.branch) obj.b = branch;
  if (path && path !== SYNC.path) obj.p = path;
  return CONNECTION_CODE_PREFIX + toB64Url(utf8ToB64(JSON.stringify(obj)));
}

export function decodeConnectionCode(code) {
  const s = String(code || '').replace(/\s+/g, '');
  if (!s.startsWith(CONNECTION_CODE_PREFIX)) throw new SyncError('format');
  let obj;
  try {
    obj = JSON.parse(b64ToUtf8(fromB64Url(s.slice(CONNECTION_CODE_PREFIX.length))));
  } catch {
    throw new SyncError('format');
  }
  if (!obj || !obj.o || !obj.r || !obj.t) throw new SyncError('format');
  return {
    owner: obj.o,
    repo: obj.r,
    token: obj.t,
    branch: obj.b || SYNC.branch,
    path: obj.p || SYNC.path,
  };
}

// ---- client ----

function classify(res) {
  const s = res.status;
  if (s === 401) return new SyncError('auth', 'unauthorized', s);
  if (s === 403 || s === 429) {
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    return new SyncError(remaining === '0' || s === 429 ? 'ratelimit' : 'forbidden', 'forbidden', s);
  }
  if (s === 404) return new SyncError('notfound', 'not found', s);
  if (s === 409 || s === 422) return new SyncError('conflict', 'conflict', s);
  if (s >= 500) return new SyncError('server', 'server error', s);
  return new SyncError('unknown', `http ${s}`, s);
}

export class GitHubClient {
  constructor(conn, { fetchImpl, deviceLabel = 'web', timeoutMs = SYNC.requestTimeoutMs } = {}) {
    this.conn = conn;
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.deviceLabel = deviceLabel;
    this.timeoutMs = timeoutMs;
  }

  get repoUrl() {
    const { owner, repo } = this.conn;
    return `${SYNC.apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  get fileUrl() {
    const path = this.conn.path.split('/').map(encodeURIComponent).join('/');
    return `${this.repoUrl}/contents/${path}`;
  }

  async request(method, url, body, accept = 'application/vnd.github+json') {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    try {
      return await this.fetch(url, {
        method,
        cache: 'no-store',
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.conn.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl?.signal,
      });
    } catch (e) {
      throw new SyncError('offline', e?.message || 'network error');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Returns { data, sha }; data/sha are null when the file does not exist yet. */
  async get() {
    const url = `${this.fileUrl}?ref=${encodeURIComponent(this.conn.branch)}`;
    const res = await this.request('GET', url);
    if (res.status === 404) {
      const repoRes = await this.request('GET', this.repoUrl);
      if (!repoRes.ok) throw classify(repoRes);
      return { data: null, sha: null };
    }
    if (!res.ok) throw classify(res);
    const json = await res.json();
    let text;
    if (json.content) {
      text = b64ToUtf8(json.content);
    } else {
      // Files over 1MB come without inline content; fetch the raw body instead.
      const raw = await this.request('GET', url, null, 'application/vnd.github.raw+json');
      if (!raw.ok) throw classify(raw);
      text = await raw.text();
    }
    try {
      return { data: JSON.parse(text), sha: json.sha };
    } catch {
      throw new SyncError('format', 'data.json is not valid JSON');
    }
  }

  /** Writes data; returns the new sha. Throws SyncError('conflict') on sha mismatch. */
  async put(data, sha) {
    const body = {
      message: `update data (${this.deviceLabel})`,
      content: utf8ToB64(canonicalJSON(data, 2) + '\n'),
      branch: this.conn.branch,
    };
    if (sha) body.sha = sha;
    const res = await this.request('PUT', this.fileUrl, body);
    if (!res.ok) throw classify(res);
    const json = await res.json();
    return json?.content?.sha ?? null;
  }
}
