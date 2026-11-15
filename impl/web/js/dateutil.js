// Date helpers operating on 'YYYY-MM-DD' strings. Internally uses UTC to avoid DST issues.

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const pad = (n) => String(n).padStart(2, '0');

export function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parse(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return { y, m, d };
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isTimeStr(s) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

function toUTC(ds) {
  const { y, m, d } = parse(ds);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

const DAY_MS = 86400000;

export function addDays(ds, n) {
  return fromUTC(toUTC(ds) + n * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function weekday(ds) {
  return new Date(toUTC(ds)).getUTCDay();
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(ds, n) {
  const { y, m, d } = parse(ds);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function startOfMonth(ds) {
  const { y, m } = parse(ds);
  return ymd(y, m, 1);
}

export function endOfMonth(ds) {
  const { y, m } = parse(ds);
  return ymd(y, m, daysInMonth(y, m));
}

export function startOfWeek(ds, weekStart = 0) {
  const off = (weekday(ds) - weekStart + 7) % 7;
  return addDays(ds, -off);
}

/** Monday-based week index, used for "every 2 weeks" so that Sat+Sun stay in the same week. */
export function mondayWeekIndex(ds) {
  const monday = startOfWeek(ds, 1);
  return Math.floor(toUTC(monday) / (7 * DAY_MS));
}

/** Dates shown in a month grid (full weeks covering the month). */
export function monthGrid(ds, weekStart = 0) {
  const first = startOfMonth(ds);
  const last = endOfMonth(ds);
  const start = startOfWeek(first, weekStart);
  const out = [];
  let cur = start;
  while (cur <= last || out.length % 7 !== 0) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function rangeDays(from, to) {
  const out = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

export function todayStr(now = new Date()) {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function addMinutes(t, n) {
  return minToTime(timeToMin(t) + n);
}

// ---- display ----

export function fmtMD(ds) {
  const { m, d } = parse(ds);
  return `${m}/${d}`;
}

export function fmtMDW(ds) {
  return `${fmtMD(ds)}(${WEEKDAY_JA[weekday(ds)]})`;
}

export function fmtJa(ds) {
  const { m, d } = parse(ds);
  return `${m}月${d}日(${WEEKDAY_JA[weekday(ds)]})`;
}

export function fmtJaFull(ds) {
  const { y, m, d } = parse(ds);
  return `${y}年${m}月${d}日(${WEEKDAY_JA[weekday(ds)]})`;
}

export function fmtYM(ds) {
  const { y, m } = parse(ds);
  return `${y}年${m}月`;
}

/** "9:05" style (no leading zero on hour) for compact display. */
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${Number(h)}:${m}`;
}
