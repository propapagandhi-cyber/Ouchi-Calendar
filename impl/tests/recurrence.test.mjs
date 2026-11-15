// Acceptance for spec/software.md B-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand, describeRepeat, occTimeLabel, nthOf } from '../web/js/recurrence.js';
import { isHoliday } from '../web/js/holidays.js';
import { normalize } from '../web/js/model.js';
import { monthGrid, startOfWeek, addMonths } from '../web/js/dateutil.js';

const ev = (over) =>
  normalize({
    events: [{ id: 'e1', title: 'サッカー', members: ['m2'], date: '2026-11-07', start: '10:00', end: '12:00', ...over }],
  }).events[0];

const dates = (e, from, to) => expand([e], from, to, { isHoliday }).map((o) => o.date);

test('B-2.1 weekly Saturday', () => {
  const e = ev({ repeat: { freq: 'weekly', weekdays: [6] } });
  assert.deepEqual(dates(e, '2026-11-01', '2026-11-30'), ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']);
});

test('B-2.2 skip one date', () => {
  const e = ev({ repeat: { freq: 'weekly', weekdays: [6] }, skipDates: ['2026-11-21'] });
  assert.deepEqual(dates(e, '2026-11-01', '2026-11-30'), ['2026-11-07', '2026-11-14', '2026-11-28']);
});

test('B-2.3 skip holidays', () => {
  const e = ev({ date: '2026-09-07', repeat: { freq: 'weekly', weekdays: [1], skipHolidays: true } });
  assert.deepEqual(dates(e, '2026-09-01', '2026-09-30'), ['2026-09-07', '2026-09-14', '2026-09-28']);
});

test('B-2.4 skip range (winter break)', () => {
  const e = ev({
    date: '2026-12-02',
    repeat: { freq: 'weekly', weekdays: [3] },
    skipRanges: [{ from: '2026-12-24', to: '2027-01-07', label: '冬休み' }],
  });
  assert.deepEqual(dates(e, '2026-12-01', '2027-01-20'), ['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23', '2027-01-13', '2027-01-20']);
});

test('B-2.5 override one occurrence', () => {
  const e = ev({
    repeat: { freq: 'weekly', weekdays: [6] },
    overrides: { '2026-11-14': { title: '練習試合', allDay: false, start: '13:00', end: '15:00', memo: '', members: ['m2'] } },
  });
  const occ = expand([e], '2026-11-01', '2026-11-30', { isHoliday });
  const o14 = occ.find((o) => o.date === '2026-11-14');
  const o21 = occ.find((o) => o.date === '2026-11-21');
  assert.equal(o14.start, '13:00');
  assert.equal(o14.title, '練習試合');
  assert.equal(o14.overridden, true);
  assert.equal(o21.start, '10:00');
  assert.equal(o21.title, 'サッカー');
});

test('B-2.6 every 2 weeks on Sat+Sun keeps weekends together', () => {
  const e = ev({ repeat: { freq: 'weekly', interval: 2, weekdays: [6, 0] } });
  assert.deepEqual(dates(e, '2026-11-01', '2026-12-06'), ['2026-11-07', '2026-11-08', '2026-11-21', '2026-11-22', '2026-12-05', '2026-12-06']);
});

test('B-2.7 monthly nth weekday and day-of-month', () => {
  const nth = ev({ date: '2026-11-14', repeat: { freq: 'monthly', monthlyMode: 'nth', nth: 2 } });
  assert.deepEqual(dates(nth, '2026-11-01', '2027-01-31'), ['2026-11-14', '2026-12-12', '2027-01-09']);
  const d31 = ev({ date: '2026-10-31', repeat: { freq: 'monthly', monthlyMode: 'day' } });
  assert.deepEqual(dates(d31, '2026-10-01', '2026-12-31'), ['2026-10-31', '2026-12-31']);
  const last = ev({ date: '2026-11-28', repeat: { freq: 'monthly', monthlyMode: 'nth', nth: -1 } });
  assert.deepEqual(dates(last, '2026-11-01', '2027-01-31'), ['2026-11-28', '2026-12-26', '2027-01-30']);
});

test('B-2.8 until is inclusive', () => {
  const e = ev({ date: '2026-11-18', repeat: { freq: 'daily', until: '2026-11-20' } });
  assert.deepEqual(dates(e, '2026-11-01', '2026-11-30'), ['2026-11-18', '2026-11-19', '2026-11-20']);
});

test('yearly repeat', () => {
  const e = ev({ date: '2020-05-10', allDay: true, repeat: { freq: 'yearly' } });
  assert.deepEqual(dates(e, '2026-01-01', '2027-12-31'), ['2026-05-10', '2027-05-10']);
});

test('B-1.5 multi-day event spans each day with first/last labels', () => {
  const e = ev({ date: '2026-11-20', endDate: '2026-11-22', start: '09:00', end: '17:00' });
  const occ = expand([e], '2026-11-01', '2026-11-30', { isHoliday });
  assert.deepEqual(occ.map((o) => o.date), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(occ.map(occTimeLabel), ['9:00〜', '終日', '〜17:00']);
});

test('occurrences sort all-day first then by time', () => {
  const a = ev({ id: 'a', title: 'B', date: '2026-11-15', start: '09:00' });
  const b = ev({ id: 'b', title: 'A', date: '2026-11-15', allDay: true });
  const c = ev({ id: 'c', title: 'C', date: '2026-11-15', start: '08:30' });
  const occ = expand([a, b, c], '2026-11-15', '2026-11-15', {});
  assert.deepEqual(occ.map((o) => o.eventId), ['b', 'c', 'a']);
});

test('deleted events are not expanded', () => {
  const e = ev({ deleted: true });
  assert.deepEqual(dates(e, '2026-11-01', '2026-11-30'), []);
});

test('describeRepeat', () => {
  assert.equal(describeRepeat(ev({ repeat: { freq: 'weekly', weekdays: [6] } })), '毎週 土曜日');
  assert.equal(
    describeRepeat(ev({ repeat: { freq: 'weekly', interval: 2, weekdays: [0, 6], skipHolidays: true } })),
    '2週ごと 土・日曜日（祝日はお休み）',
  );
  assert.equal(describeRepeat(ev({ date: '2026-11-14', repeat: { freq: 'monthly', monthlyMode: 'nth', nth: 2 } })), '毎月 第2土曜日');
  assert.equal(describeRepeat(ev({ repeat: { freq: 'daily', until: '2027-03-31' } })), '毎日（2027年3月31日(水)まで）');
});

test('nthOf', () => {
  assert.equal(nthOf('2026-11-14'), 2);
  assert.equal(nthOf('2026-11-29'), -1);
});

test('month grid covers full weeks', () => {
  const g = monthGrid('2026-11-15', 0);
  assert.equal(g[0], '2026-11-01');
  assert.equal(g.length % 7, 0);
  assert.equal(g.at(-1), '2026-12-05');
  assert.equal(monthGrid('2026-11-15', 1)[0], '2026-10-26');
  assert.equal(startOfWeek('2026-11-15', 1), '2026-11-09');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});
