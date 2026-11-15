// Single source of configuration values. Transcribed from spec/software.md §設定値.
// Do not hardcode these values elsewhere.

export const APP = Object.freeze({
  name: 'おうちカレンダー',
  version: '0.2.0',
});

export const SCHEMA_VERSION = 1;

export const DEFAULT_MEMBERS = Object.freeze([
  { id: 'm1', name: 'ママ', color: '#E64980', order: 0 },
  { id: 'm2', name: '長男', color: '#1C7ED6', order: 1 },
  { id: 'm3', name: '次男', color: '#2F9E44', order: 2 },
]);

export const FAMILY_COLOR = '#F08C00';

export const MEMBER_PALETTE = Object.freeze([
  '#E64980', '#1C7ED6', '#2F9E44', '#7048E8',
  '#F08C00', '#0C8599', '#A0522D', '#5C6670',
]);

export const EVENT_DEFAULTS = Object.freeze({
  startTime: '10:00',
  durationMin: 60,
});

export const PREF_DEFAULTS = Object.freeze({
  weekStart: 0, // 0 = Sunday, 1 = Monday
  fontScale: 'normal',
  view: 'month',
  filter: 'all',
});

export const FONT_SCALES = Object.freeze({
  normal: { label: 'ふつう', px: 17 },
  large: { label: '大きい', px: 20 },
  xlarge: { label: 'とても大きい', px: 23 },
});

export const UI = Object.freeze({
  monthMaxItems: 3,
  quickTitleCount: 8,
  undoMs: 8000,
  toastMs: 2500,
});

export const SYNC = Object.freeze({
  apiBase: 'https://api.github.com',
  branch: 'main',
  path: 'data.json',
  debounceMs: 1500,
  pollMs: 120000,
  maxRetries: 3,
  tombstoneDays: 60,
  requestTimeoutMs: 15000,
});

export const STORAGE_KEYS = Object.freeze({
  data: 'ouchi.data.v1',
  meta: 'ouchi.meta.v1',
  conn: 'ouchi.conn.v1',
  prefs: 'ouchi.prefs.v1',
});

export const CONNECTION_CODE_PREFIX = 'OUCHI1:';
