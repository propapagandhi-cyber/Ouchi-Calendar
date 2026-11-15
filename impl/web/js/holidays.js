// Japanese national holidays, computed locally (spec/software.md §祝日).
import { ymd, addDays, weekday } from './dateutil.js';

const cache = new Map();

function nthWeekday(y, m, wd, n) {
  const first = weekday(ymd(y, m, 1));
  const d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
  return ymd(y, m, d);
}

// Approximation formulas valid for 1980-2099.
function vernalEquinoxDay(y) {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function autumnalEquinoxDay(y) {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function compute(y) {
  const h = new Map();
  const add = (m, d, name) => h.set(ymd(y, m, d), name);

  add(1, 1, '元日');
  h.set(nthWeekday(y, 1, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  else if (y >= 1989 && y <= 2018) add(12, 23, '天皇誕生日');
  add(3, vernalEquinoxDay(y), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y === 2020) {
    add(7, 23, '海の日');
    add(7, 24, 'スポーツの日');
    add(8, 10, '山の日');
  } else if (y === 2021) {
    add(7, 22, '海の日');
    add(7, 23, 'スポーツの日');
    add(8, 8, '山の日');
  } else {
    h.set(nthWeekday(y, 7, 1, 3), '海の日');
    add(8, 11, '山の日');
    h.set(nthWeekday(y, 10, 1, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
  }
  h.set(nthWeekday(y, 9, 1, 3), '敬老の日');
  add(9, autumnalEquinoxDay(y), '秋分の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  // Citizens' holiday: a non-holiday weekday sandwiched between two national holidays.
  const national = [...h.keys()];
  for (const ds of national) {
    const mid = addDays(ds, 1);
    if (!h.has(mid) && h.has(addDays(ds, 2)) && weekday(mid) !== 0) {
      h.set(mid, '国民の休日');
    }
  }

  // Substitute holiday: a national holiday on Sunday moves to the next non-holiday day.
  for (const ds of national) {
    if (weekday(ds) !== 0) continue;
    let d = addDays(ds, 1);
    while (h.has(d)) d = addDays(d, 1);
    h.set(d, '振替休日');
  }
  return h;
}

export function holidaysOfYear(y) {
  if (!cache.has(y)) cache.set(y, compute(y));
  return cache.get(y);
}

/** Holiday name for the date, or null. */
export function holidayName(ds) {
  const y = Number(ds.slice(0, 4));
  return holidaysOfYear(y).get(ds) ?? null;
}

export function isHoliday(ds) {
  return holidayName(ds) !== null;
}
