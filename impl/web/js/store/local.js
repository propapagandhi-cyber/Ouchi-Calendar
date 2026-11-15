// Device-local persistence (localStorage). Every access is guarded: storage may be unavailable.
import { STORAGE_KEYS, PREF_DEFAULTS } from '../config.js';

function read(key, fallback) {
  try {
    const s = globalThis.localStorage?.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const local = {
  loadData: () => read(STORAGE_KEYS.data, null),
  saveData: (data) => write(STORAGE_KEYS.data, data),

  loadMeta: () => ({ dirty: false, lastSyncAt: 0, ...read(STORAGE_KEYS.meta, {}) }),
  saveMeta: (meta) => write(STORAGE_KEYS.meta, meta),

  loadConn: () => read(STORAGE_KEYS.conn, null),
  saveConn: (conn) => write(STORAGE_KEYS.conn, conn),
  clearConn: () => remove(STORAGE_KEYS.conn),

  loadPrefs: () => ({ ...PREF_DEFAULTS, ...read(STORAGE_KEYS.prefs, {}) }),
  savePrefs: (prefs) => write(STORAGE_KEYS.prefs, prefs),
};
