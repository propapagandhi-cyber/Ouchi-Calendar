// Expand events into per-day occurrences, applying repeat rules and exceptions.
// spec/software.md B-2, spec/interface/data-schema.md.
import {
  addDays, diffDays, weekday, parse, daysInMonth, mondayWeekIndex,
  WEEKDAY_JA, fmtJaFull, fmtTime,
} from './dateutil.js';

/** nth weekday-of-month for a date: 1..4, or -1 for the 5th (treated as "last"). */
export function nthOf(ds) {
  const n = Math.ceil(parse(ds).d / 7);
  return n >= 5 ? -1 : n;
}

/** True if the repeat pattern (ignoring exceptions) produces an occurrence on ds. */
export function matchesPattern(ev, ds) {
  const r = ev.repeat;
  if (!r || ds < ev.date) return false;
  if (r.until && ds > r.until) return false;
  switch (r.freq) {
    case 'daily':
      return diffDays(ev.date, ds) % (r.interval || 1) === 0;
    case 'weekly': {
      const wds = r.weekdays && r.weekdays.length ? r.weekdays : [weekday(ev.date)];
      if (!wds.includes(weekday(ds))) return false;
      const interval = r.interval || 1;
      if (interval === 1) return true;
      const diff = mondayWeekIndex(ds) - mondayWeekIndex(ev.date);
      return diff % interval === 0;
    }
    case 'monthly': {
      const t = parse(ds);
      if (r.monthlyMode === 'nth') {
        if (weekday(ds) !== weekday(ev.date)) return false;
        const nth = r.nth ?? nthOf(ev.date);
        if (nth === -1) return t.d + 7 > daysInMonth(t.y, t.m);
        return Math.ceil(t.d / 7) === nth;
      }
      return t.d === parse(ev.date).d;
    }
    case 'yearly': {
      const s = parse(ev.date);
      const t = parse(ds);
      return s.m === t.m && s.d === t.d;
    }
    default:
      return false;
  }
}

/** Why an occurrence is suppressed ('date' | 'range' | 'holiday'), or null. */
export function skipReason(ev, ds, isHoliday) {
  if (ev.skipDates && ev.skipDates.includes(ds)) return 'date';
  if (ev.skipRanges && ev.skipRanges.some((r) => r.from <= ds && ds <= r.to)) return 'range';
  if (ev.repeat && ev.repeat.skipHolidays && isHoliday && isHoliday(ds)) return 'holiday';
  return null;
}

function makeOccurrence(ev, ds, override, span) {
  const base = override ? { ...ev, ...override } : ev;
  const occ = {
    key: `${ev.id}@${ds}`,
    eventId: ev.id,
    date: ds,
    title: base.title,
    members: base.members,
    allDay: !!base.allDay,
    start: base.start,
    end: base.end,
    memo: base.memo || '',
    recurring: !!ev.repeat,
    overridden: !!override,
    multi: null,
  };
  if (span && span.first !== span.last) {
    occ.multi = {
      first: span.first,
      last: span.last,
      isFirst: ds === span.first,
      isLast: ds === span.last,
      index: diffDays(span.first, ds) + 1,
      total: diffDays(span.first, span.last) + 1,
    };
  }
  return occ;
}

/** Occurrences of the given (live) events between from..to inclusive, sorted. */
export function expand(events, from, to, { isHoliday } = {}) {
  const out = [];
  for (const ev of events) {
    if (ev.deleted || !ev.date) continue;
    if (ev.repeat) {
      const start = ev.date > from ? ev.date : from;
      const until = ev.repeat.until;
      const end = until && until < to ? until : to;
      for (let ds = start; ds <= end; ds = addDays(ds, 1)) {
        if (!matchesPattern(ev, ds)) continue;
        if (skipReason(ev, ds, isHoliday)) continue;
        const ov = ev.overrides ? ev.overrides[ds] : null;
        out.push(makeOccurrence(ev, ds, ov || null, null));
      }
    } else {
      const last = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
      if (last < from || ev.date > to) continue;
      const s = ev.date > from ? ev.date : from;
      const e = last < to ? last : to;
      for (let ds = s; ds <= e; ds = addDays(ds, 1)) {
        out.push(makeOccurrence(ev, ds, null, { first: ev.date, last }));
      }
    }
  }
  return out.sort(compareOccurrences);
}

/** Treat all-day and middle days of multi-day events as "all day" for ordering/labels. */
export function isAllDayLike(occ) {
  if (occ.allDay) return true;
  return !!(occ.multi && !occ.multi.isFirst && !occ.multi.isLast);
}

function sortTime(occ) {
  if (isAllDayLike(occ)) return -1;
  if (occ.multi && !occ.multi.isFirst) return 0; // last day: from midnight
  return occ.start ? Number(occ.start.replace(':', '')) : 0;
}

export function compareOccurrences(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = sortTime(a);
  const tb = sortTime(b);
  if (ta !== tb) return ta - tb;
  return (a.title || '').localeCompare(b.title || '', 'ja');
}

/** Short time label for an occurrence, e.g. "10:00〜12:00", "終日", "10:00〜" (first day of multi). */
export function occTimeLabel(occ) {
  if (occ.allDay) return '終日';
  if (occ.multi) {
    if (occ.multi.isFirst) return `${fmtTime(occ.start)}〜`;
    if (occ.multi.isLast) return `〜${fmtTime(occ.end)}`;
    return '終日';
  }
  return occ.end ? `${fmtTime(occ.start)}〜${fmtTime(occ.end)}` : fmtTime(occ.start);
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function weekdaysLabel(wds) {
  const sorted = WEEKDAY_ORDER.filter((w) => wds.includes(w));
  return sorted.map((w) => WEEKDAY_JA[w]).join('・') + '曜日';
}

/** Japanese description of the repeat rule, e.g. "毎週 土曜日（祝日はお休み）". */
export function describeRepeat(ev) {
  const r = ev.repeat;
  if (!r) return '';
  const { m, d } = parse(ev.date);
  let s;
  switch (r.freq) {
    case 'daily':
      s = '毎日';
      break;
    case 'weekly': {
      const wds = r.weekdays && r.weekdays.length ? r.weekdays : [weekday(ev.date)];
      s = `${(r.interval || 1) === 2 ? '2週ごと' : '毎週'} ${weekdaysLabel(wds)}`;
      break;
    }
    case 'monthly':
      if (r.monthlyMode === 'nth') {
        const nth = r.nth ?? nthOf(ev.date);
        const wd = WEEKDAY_JA[weekday(ev.date)];
        s = nth === -1 ? `毎月 最終${wd}曜日` : `毎月 第${nth}${wd}曜日`;
      } else {
        s = `毎月 ${d}日`;
      }
      break;
    case 'yearly':
      s = `毎年 ${m}月${d}日`;
      break;
    default:
      s = 'くりかえし';
  }
  const notes = [];
  if (r.skipHolidays) notes.push('祝日はお休み');
  if (r.until) notes.push(`${fmtJaFull(r.until)}まで`);
  return notes.length ? `${s}（${notes.join('・')}）` : s;
}
