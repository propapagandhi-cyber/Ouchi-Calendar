// Pure transformations on a single event for recurring-exception operations (spec B-2).
import { addDays } from './dateutil.js';

const filterDates = (arr, pred) => (arr || []).filter(pred);

function filterOverrides(ov, pred) {
  const out = {};
  for (const [ds, v] of Object.entries(ov || {})) if (pred(ds)) out[ds] = v;
  return out;
}

/** Suppress one occurrence ("この日はお休み"). */
export function skipDate(ev, ds) {
  const skipDates = [...new Set([...(ev.skipDates || []), ds])].sort();
  const overrides = filterOverrides(ev.overrides, (d) => d !== ds);
  return { ...ev, skipDates, overrides };
}

/** Restore a suppressed occurrence. */
export function unskipDate(ev, ds) {
  return { ...ev, skipDates: filterDates(ev.skipDates, (d) => d !== ds) };
}

/** Change one occurrence in place ("この日だけ変更", same date). */
export function setOverride(ev, ds, fields) {
  return { ...ev, overrides: { ...(ev.overrides || {}), [ds]: { ...fields } } };
}

/**
 * End the series the day before ds. Returns null when ds is on/before the first occurrence
 * (i.e. nothing would remain: the caller should delete the whole event).
 */
export function truncateBefore(ev, ds) {
  if (!ev.repeat || ds <= ev.date) return null;
  const until = addDays(ds, -1);
  const curUntil = ev.repeat.until;
  return {
    ...ev,
    repeat: { ...ev.repeat, until: curUntil && curUntil < until ? curUntil : until },
    skipDates: filterDates(ev.skipDates, (d) => d < ds),
    skipRanges: (ev.skipRanges || [])
      .filter((r) => r.from < ds)
      .map((r) => (r.to >= ds ? { ...r, to: until } : r)),
    overrides: filterOverrides(ev.overrides, (d) => d < ds),
  };
}

/**
 * Split a series at ds ("この日以降を変更"). head = original ending before ds (or null if ds is the
 * first occurrence), tail = new series starting at ds carrying later exceptions.
 */
export function splitAt(ev, ds, newId) {
  const head = truncateBefore(ev, ds);
  const tail = {
    ...ev,
    id: newId,
    date: ds,
    repeat: { ...ev.repeat },
    skipDates: filterDates(ev.skipDates, (d) => d >= ds),
    skipRanges: (ev.skipRanges || [])
      .filter((r) => r.to >= ds)
      .map((r) => (r.from < ds ? { ...r, from: ds } : r)),
    overrides: filterOverrides(ev.overrides, (d) => d >= ds),
    updatedAt: 0,
  };
  return { head, tail };
}

/** Move one occurrence to another date: skip it in the series and create a one-off copy. */
export function detachOccurrence(ev, ds, newId, fields) {
  const series = skipDate(ev, ds);
  const single = {
    id: newId,
    title: ev.title,
    members: ev.members,
    allDay: ev.allDay,
    start: ev.start,
    end: ev.end,
    memo: ev.memo,
    ...fields,
    endDate: null,
    repeat: null,
    skipDates: [],
    skipRanges: [],
    overrides: {},
    updatedAt: 0,
    deleted: false,
  };
  return { series, single };
}
