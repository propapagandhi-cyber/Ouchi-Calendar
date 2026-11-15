// Data schema, normalization (migration), merge and record helpers.
// spec/interface/data-schema.md
import { DEFAULT_MEMBERS, SCHEMA_VERSION, EVENT_DEFAULTS, SYNC } from './config.js';
import { isDateStr, isTimeStr, addMinutes } from './dateutil.js';

export const COLLECTIONS = ['members', 'events', 'tasks'];

export function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function emptyData() {
  return {
    schema: SCHEMA_VERSION,
    members: DEFAULT_MEMBERS.map((m) => ({ ...m, updatedAt: 0, deleted: false })),
    events: [],
    tasks: [],
  };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const hasId = (r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id;
const uniqSortedDates = (arr) =>
  Array.isArray(arr) ? [...new Set(arr.filter(isDateStr))].sort() : [];

function normMember(m, i) {
  return {
    ...m,
    name: String(m.name ?? '').trim() || `メンバー${i + 1}`,
    color: typeof m.color === 'string' ? m.color : '#5C6670',
    order: Number.isFinite(m.order) ? m.order : i,
    updatedAt: Number(m.updatedAt) || 0,
    deleted: !!m.deleted,
  };
}

function normRepeat(r) {
  if (!r || typeof r !== 'object') return null;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return null;
  const out = {
    ...r,
    interval: r.freq === 'weekly' && Number(r.interval) === 2 ? 2 : 1,
    until: isDateStr(r.until) ? r.until : null,
    skipHolidays: !!r.skipHolidays,
  };
  if (r.freq === 'weekly') {
    out.weekdays = Array.isArray(r.weekdays)
      ? [...new Set(r.weekdays.map(Number).filter((w) => w >= 0 && w <= 6))].sort()
      : [];
  }
  if (r.freq === 'monthly') {
    out.monthlyMode = r.monthlyMode === 'nth' ? 'nth' : 'day';
    if (out.monthlyMode === 'nth') {
      const n = Number(r.nth);
      out.nth = n === -1 || (n >= 1 && n <= 4) ? n : 1;
    }
  }
  return out;
}

function normTimes(e) {
  const start = isTimeStr(e.start) ? e.start : EVENT_DEFAULTS.startTime;
  let end = isTimeStr(e.end) ? e.end : addMinutes(start, EVENT_DEFAULTS.durationMin);
  return { start, end };
}

function normEvent(e) {
  const { start, end } = normTimes(e);
  const repeat = normRepeat(e.repeat);
  const overrides = {};
  if (e.overrides && typeof e.overrides === 'object') {
    for (const [ds, ov] of Object.entries(e.overrides)) {
      if (isDateStr(ds) && ov && typeof ov === 'object') overrides[ds] = ov;
    }
  }
  return {
    ...e,
    title: String(e.title ?? ''),
    members: Array.isArray(e.members) ? e.members.filter((x) => typeof x === 'string') : [],
    date: e.date,
    endDate: !repeat && isDateStr(e.endDate) && e.endDate > e.date ? e.endDate : null,
    allDay: !!e.allDay,
    start,
    end,
    memo: String(e.memo ?? ''),
    repeat,
    skipDates: uniqSortedDates(e.skipDates),
    skipRanges: Array.isArray(e.skipRanges)
      ? e.skipRanges.filter((r) => r && isDateStr(r.from) && isDateStr(r.to) && r.from <= r.to)
      : [],
    overrides,
    updatedAt: Number(e.updatedAt) || 0,
    deleted: !!e.deleted,
  };
}

function normTask(t) {
  return {
    ...t,
    title: String(t.title ?? ''),
    members: Array.isArray(t.members) ? t.members.filter((x) => typeof x === 'string') : [],
    due: isDateStr(t.due) ? t.due : null,
    done: !!t.done,
    doneAt: t.done ? Number(t.doneAt) || null : null,
    updatedAt: Number(t.updatedAt) || 0,
    deleted: !!t.deleted,
  };
}

/** Validate and migrate raw data into the current schema. Unknown fields are preserved. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();
  const out = { ...raw, schema: SCHEMA_VERSION };
  const members = Array.isArray(raw.members) ? raw.members.filter(hasId) : [];
  out.members = (members.length ? members : emptyData().members).map(normMember).sort(byId);
  out.events = (Array.isArray(raw.events) ? raw.events : [])
    .filter((e) => hasId(e) && isDateStr(e.date))
    .map(normEvent)
    .sort(byId);
  out.tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).filter(hasId).map(normTask).sort(byId);
  return out;
}

function mergeCollection(a = [], b = []) {
  const map = new Map();
  for (const r of a) map.set(r.id, r);
  for (const r of b) {
    const cur = map.get(r.id);
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) map.set(r.id, r);
  }
  return [...map.values()].sort(byId);
}

function pruneTombstones(list, now) {
  const limit = SYNC.tombstoneDays * 86400000;
  return list.filter((r) => !(r.deleted && now - (r.updatedAt || 0) > limit));
}

/** Record-level last-writer-wins merge of two datasets (either may be null). */
export function merge(a, b, now = Date.now()) {
  if (!a && !b) return emptyData();
  if (!a) return normalize(b);
  if (!b) return normalize(a);
  const na = normalize(a);
  const nb = normalize(b);
  const out = { ...nb, ...na, schema: SCHEMA_VERSION };
  for (const c of COLLECTIONS) {
    out[c] = pruneTombstones(mergeCollection(na[c], nb[c]), now);
  }
  if (!out.members.some((m) => !m.deleted)) out.members = emptyData().members;
  return out;
}

/** JSON with recursively sorted object keys: stable for comparison and git diffs. */
export function canonicalJSON(value, space = 0) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) {
        if (v[k] !== undefined) o[k] = sortKeys(v[k]);
      }
      return o;
    }
    return v;
  };
  return JSON.stringify(sortKeys(value), null, space);
}

// ---- record helpers (return new data objects; never mutate input) ----

export function findRecord(data, coll, id) {
  return data[coll].find((r) => r.id === id) || null;
}

export function live(data, coll) {
  return data[coll].filter((r) => !r.deleted);
}

export function liveMembers(data) {
  return live(data, 'members').sort((a, b) => a.order - b.order || byId(a, b));
}

/** Insert or replace a record, bumping updatedAt so the edit wins over the version it was based on. */
export function upsert(data, coll, rec, now = Date.now()) {
  const prev = findRecord(data, coll, rec.id);
  const updatedAt = Math.max(now, (prev?.updatedAt || 0) + 1, (rec.updatedAt || 0) + 1);
  const list = data[coll].filter((r) => r.id !== rec.id);
  list.push({ ...rec, updatedAt });
  return { ...data, [coll]: list.sort(byId) };
}

export function softDelete(data, coll, id, now = Date.now()) {
  const prev = findRecord(data, coll, id);
  if (!prev) return data;
  return upsert(data, coll, { ...prev, deleted: true }, now);
}
