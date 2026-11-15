import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysOfYear, holidayName } from '../web/js/holidays.js';

const list = (y) => [...holidaysOfYear(y).keys()].sort();

test('2026 holidays (incl. substitute and citizens holiday)', () => {
  assert.deepEqual(list(2026), [
    '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29',
    '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23',
  ]);
  assert.equal(holidayName('2026-05-06'), '振替休日');
  assert.equal(holidayName('2026-09-22'), '国民の休日');
  assert.equal(holidayName('2026-09-23'), '秋分の日');
});

test('2025 holidays', () => {
  assert.deepEqual(list(2025), [
    '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23', '2025-02-24', '2025-03-20',
    '2025-04-29', '2025-05-03', '2025-05-04', '2025-05-05', '2025-05-06', '2025-07-21',
    '2025-08-11', '2025-09-15', '2025-09-23', '2025-10-13', '2025-11-03', '2025-11-23',
    '2025-11-24',
  ]);
});

test('2027 vernal equinox on Sunday gets a substitute holiday', () => {
  assert.equal(holidayName('2027-03-21'), '春分の日');
  assert.equal(holidayName('2027-03-22'), '振替休日');
});

test('normal days are not holidays', () => {
  assert.equal(holidayName('2026-11-15'), null);
  assert.equal(holidayName('2026-12-25'), null);
});
