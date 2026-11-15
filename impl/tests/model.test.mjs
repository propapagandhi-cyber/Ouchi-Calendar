import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, merge, emptyData, upsert, softDelete, canonicalJSON, liveMembers } from '../web/js/model.js';
import { skipDate, unskipDate, splitAt, truncateBefore, detachOccurrence } from '../web/js/eventops.js';
import { expand } from '../web/js/recurrence.js';

const base = () => emptyData();
const event = (id, updatedAt, extra = {}) => ({ id, title: id, members: ['m1'], date: '2026-11-15', updatedAt, ...extra });

test('emptyData has the three default members', () => {
  assert.deepEqual(liveMembers(emptyData()).map((m) => m.name), ['ママ', '長男', '次男']);
});

test('normalize drops invalid records and keeps unknown fields', () => {
  const d = normalize({ events: [{ id: 'a', date: 'bad' }, { id: 'b', date: '2026-11-15', future: 1 }], extra: 'x' });
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].future, 1);
  assert.equal(d.extra, 'x');
  assert.equal(d.events[0].start, '10:00');
  assert.equal(d.events[0].end, '11:00');
});

test('merge keeps records added on either side', () => {
  const a = { ...base(), events: [event('e_a', 10)] };
  const b = { ...base(), events: [event('e_b', 20)] };
  const m = merge(a, b);
  assert.deepEqual(m.events.map((e) => e.id), ['e_a', 'e_b']);
});

test('merge picks the newer updatedAt for the same record', () => {
  const a = { ...base(), events: [event('e1', 10, { title: 'old' })] };
  const b = { ...base(), events: [event('e1', 20, { title: 'new' })] };
  assert.equal(merge(a, b).events[0].title, 'new');
  assert.equal(merge(b, a).events[0].title, 'new');
});

test('tombstones win when newer and are pruned after retention', () => {
  const now = Date.UTC(2026, 10, 15);
  const a = { ...base(), events: [event('e1', now - 1000)] };
  const b = { ...base(), events: [event('e1', now, { deleted: true })] };
  assert.equal(merge(a, b, now).events[0].deleted, true);
  const old = { ...base(), events: [event('e1', now - 61 * 86400000, { deleted: true })] };
  assert.equal(merge(old, base(), now).events.length, 0);
});

test('upsert bumps updatedAt above the previous version even with a slow clock', () => {
  let d = { ...base(), events: [event('e1', 5000)] };
  d = upsert(d, 'events', { ...d.events[0], title: 'x' }, 1000);
  assert.ok(d.events[0].updatedAt > 5000);
  d = softDelete(d, 'events', 'e1', 1000);
  assert.equal(d.events[0].deleted, true);
});

test('canonicalJSON is key-order independent', () => {
  assert.equal(canonicalJSON({ b: 1, a: { d: 2, c: 3 } }), canonicalJSON({ a: { c: 3, d: 2 }, b: 1 }));
});

// ---- event operations (B-2) ----

const weekly = () =>
  normalize({
    events: [{
      id: 'e1', title: 'ピアノ', members: ['m2'], date: '2026-11-04', start: '16:00', end: '17:00',
      repeat: { freq: 'weekly', weekdays: [3] },
      skipDates: ['2026-11-11', '2026-12-02'],
      overrides: { '2026-11-18': { start: '17:00', end: '18:00' }, '2026-12-09': { start: '15:00', end: '16:00' } },
    }],
  }).events[0];

test('skipDate / unskipDate', () => {
  const e = skipDate(weekly(), '2026-11-18');
  assert.ok(e.skipDates.includes('2026-11-18'));
  assert.equal(e.overrides['2026-11-18'], undefined);
  assert.ok(!unskipDate(e, '2026-11-18').skipDates.includes('2026-11-18'));
});

test('splitAt moves later exceptions to the new series', () => {
  const { head, tail } = splitAt(weekly(), '2026-11-25', 'e2');
  assert.equal(head.repeat.until, '2026-11-24');
  assert.deepEqual(head.skipDates, ['2026-11-11']);
  assert.deepEqual(Object.keys(head.overrides), ['2026-11-18']);
  assert.equal(tail.id, 'e2');
  assert.equal(tail.date, '2026-11-25');
  assert.deepEqual(tail.skipDates, ['2026-12-02']);
  assert.deepEqual(Object.keys(tail.overrides), ['2026-12-09']);
  const occ = expand([head, { ...tail, start: '18:00', end: '19:00' }], '2026-11-01', '2026-12-16', {});
  assert.deepEqual(occ.map((o) => `${o.date} ${o.start}`), [
    '2026-11-04 16:00', '2026-11-18 17:00', '2026-11-25 18:00', '2026-12-09 15:00', '2026-12-16 18:00',
  ]);
});

test('splitAt on the first occurrence leaves no head', () => {
  assert.equal(splitAt(weekly(), '2026-11-04', 'e2').head, null);
  assert.equal(truncateBefore(weekly(), '2026-11-04'), null);
});

test('detachOccurrence moves one date to another day', () => {
  const { series, single } = detachOccurrence(weekly(), '2026-11-25', 'e3', { date: '2026-11-26' });
  assert.ok(series.skipDates.includes('2026-11-25'));
  assert.equal(single.date, '2026-11-26');
  assert.equal(single.repeat, null);
  assert.equal(single.title, 'ピアノ');
});
