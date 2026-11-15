// Sync engine (fetch -> merge -> write with optimistic lock) and its scheduler.
import { SYNC } from '../config.js';
import { merge, normalize, canonicalJSON } from '../model.js';
import { SyncError } from './github.js';

export class SyncEngine {
  constructor(client, { maxRetries = SYNC.maxRetries, now = () => Date.now() } = {}) {
    this.client = client;
    this.maxRetries = maxRetries;
    this.now = now;
  }

  /**
   * One sync round. getLocal() returns the current local data.
   * Resolves { merged, wrote }. Throws SyncError on failure.
   */
  async run(getLocal) {
    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const remote = await this.client.get();
      const remoteData = remote.data ? normalize(remote.data) : null;
      const merged = merge(getLocal(), remoteData, this.now());
      if (remoteData && canonicalJSON(merged) === canonicalJSON(remoteData)) {
        return { merged, wrote: false };
      }
      try {
        await this.client.put(merged, remote.sha);
        return { merged, wrote: true };
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'conflict') {
          lastError = e;
          continue;
        }
        throw e;
      }
    }
    throw lastError || new SyncError('conflict');
  }
}

/**
 * Decides when to sync and reports status. Host callbacks:
 *  getData(): local data, getVersion(): local edit counter,
 *  onMerged(merged): apply merged data locally, onClean(): mark no pending local edits,
 *  onStatus({ state, kind, at }): state = idle | syncing | ok | error
 */
export class SyncController {
  constructor({ engine, getData, getVersion, onMerged, onClean, onStatus, timers = globalThis }) {
    Object.assign(this, { engine, getData, getVersion, onMerged, onClean, onStatus, timers });
    this.running = false;
    this.again = false;
    this.timer = null;
    this.status = { state: 'idle', kind: null, at: 0 };
  }

  setStatus(s) {
    this.status = { ...this.status, ...s };
    this.onStatus?.(this.status);
  }

  schedule(delay = SYNC.debounceMs) {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.syncNow();
    }, delay);
  }

  async syncNow() {
    if (this.running) {
      this.again = true;
      return this.status;
    }
    this.running = true;
    this.setStatus({ state: 'syncing' });
    const versionAtStart = this.getVersion();
    try {
      const { merged } = await this.engine.run(this.getData);
      this.onMerged(merged);
      if (this.getVersion() === versionAtStart) this.onClean?.();
      else this.again = true;
      this.setStatus({ state: 'ok', kind: null, at: Date.now() });
    } catch (e) {
      const kind = e instanceof SyncError ? e.kind : 'unknown';
      this.setStatus({ state: 'error', kind });
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(300);
      }
    }
    return this.status;
  }

  stop() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Japanese message for a sync problem (shown in the banner / settings). */
export function syncMessage(status) {
  if (!status || status.state !== 'error') return '';
  switch (status.kind) {
    case 'offline':
      return 'インターネットにつながっていません。つながったら自動で送ります。';
    case 'auth':
      return '接続できません（接続コードの期限切れかもしれません）。設定の「同期」を確認してください。';
    case 'forbidden':
      return '保存する権限がありません。接続コードの設定を確認してください。';
    case 'ratelimit':
      return '少し時間をおいてから、もう一度同期します。';
    case 'notfound':
      return 'データの保存先が見つかりません。設定の「同期」を確認してください。';
    case 'format':
      return '保存先のデータが読めませんでした。設定する人に連絡してください。';
    default:
      return '同期できませんでした。しばらくしてからもう一度ためします。';
  }
}
