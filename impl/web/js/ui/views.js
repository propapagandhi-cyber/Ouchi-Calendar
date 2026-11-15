// Main views: month / week / day / tasks (spec/software.md §画面, B-1, B-3).
import { h } from './dom.js';
import { icon } from './icons.js';
import { UI } from '../config.js';
import {
  monthGrid, parse, weekday, WEEKDAY_JA, fmtJa, fmtMDW, todayStr, addDays, startOfWeek, rangeDays,
} from '../dateutil.js';
import { holidayName } from '../holidays.js';
import { occTimeLabel, isAllDayLike } from '../recurrence.js';
import { fmtTime } from '../dateutil.js';

function groupByDate(occs) {
  const map = new Map();
  for (const o of occs) {
    if (!map.has(o.date)) map.set(o.date, []);
    map.get(o.date).push(o);
  }
  return map;
}

function dayClass(ds) {
  const wd = weekday(ds);
  if (wd === 0 || holidayName(ds)) return 'sun';
  if (wd === 6) return 'sat';
  return '';
}

// ---- shared parts ----

export function whoTags(app, memberIds) {
  return h('span', { class: 'tags' },
    app.whoList(memberIds).map((w) => h('span', { class: 'tag', style: { '--c': w.color } }, w.name)));
}

function timeCell(o) {
  if (isAllDayLike(o)) return h('span', { class: 'occ-time allday' }, '終日');
  if (o.multi) return h('span', { class: 'occ-time' }, occTimeLabel(o));
  return h('span', { class: 'occ-time' },
    h('span', { class: 't1' }, fmtTime(o.start)),
    o.end ? h('span', { class: 't2' }, `〜${fmtTime(o.end)}`) : null);
}

export function occRow(app, o) {
  return h('button', {
    class: 'occ',
    style: { '--c': app.colorOf(o.members) },
    onclick: () => app.openEventDetail(o),
    'aria-label': `${occTimeLabel(o)} ${o.title} ${app.whoList(o.members).map((w) => w.name).join('、')}`,
  },
  timeCell(o),
  h('span', { class: 'occ-main' },
    h('span', { class: 'occ-title' }, o.title || '（タイトルなし）'),
    h('span', { class: 'occ-meta' },
      whoTags(app, o.members),
      o.recurring ? icon('repeat', 'sm muted') : null,
      o.memo ? icon('memo', 'sm muted') : null)));
}

function dueLabel(t) {
  if (!t.due) return null;
  const today = todayStr();
  let text = `${fmtMDW(t.due)}まで`;
  let cls = 'due';
  if (!t.done && t.due < today) {
    text += '（すぎています）';
    cls += ' overdue';
  } else if (t.due === today) {
    text = '今日まで';
    cls += ' today';
  } else if (t.due === addDays(today, 1)) {
    text = '明日まで';
  }
  return h('span', { class: cls }, text);
}

export function taskRow(app, t, { showWho = true } = {}) {
  return h('div', { class: `task ${t.done ? 'done' : ''}` },
    h('button', {
      class: 'task-check',
      role: 'checkbox',
      'aria-checked': String(t.done),
      'aria-label': `${t.title}を${t.done ? '未完了にもどす' : '完了にする'}`,
      onclick: () => app.toggleTask(t.id),
    }, icon('check')),
    h('button', { class: 'task-body', onclick: () => app.openTaskEditor(t) },
      h('span', { class: 'task-title' }, t.title),
      h('span', { class: 'task-meta' }, dueLabel(t), showWho ? whoTags(app, t.members) : null)));
}

function tasksBlock(app, ds) {
  const tasks = app.tasksDueOn(ds);
  if (!tasks.length) return null;
  return h('div', { class: 'panel-tasks' },
    h('h3', { class: 'sub-title' }, icon('tasks', 'sm'), 'この日までのやること'),
    tasks.map((t) => taskRow(app, t)));
}

function addHereButton(app, ds, label = 'この日に予定を追加') {
  return h('button', { class: 'btn btn-soft add-here', onclick: () => app.openEventEditor({ mode: 'new', date: ds }) },
    icon('plus'), label);
}

function dayTags(ds) {
  const hol = holidayName(ds);
  return [
    ds === todayStr() ? h('span', { class: 'today-tag' }, '今日') : null,
    hol ? h('span', { class: 'hol-tag' }, hol) : null,
  ];
}

// ---- month ----

export function renderMonth(app) {
  const sel = app.state.date;
  const ws = app.prefs.weekStart;
  const days = monthGrid(sel, ws);
  const byDate = groupByDate(app.occurrences(days[0], days.at(-1)));
  const month = parse(sel).m;
  const today = todayStr();

  const dow = h('div', { class: 'dow-row', 'aria-hidden': 'true' },
    [...Array(7)].map((_, i) => {
      const w = (ws + i) % 7;
      return h('div', { class: `dow ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}` }, WEEKDAY_JA[w]);
    }));

  const grid = h('div', { class: 'month-grid' },
    days.map((ds) => {
      const list = byDate.get(ds) || [];
      const shown = list.slice(0, UI.monthMaxItems);
      const more = list.length - shown.length;
      const hol = holidayName(ds);
      const cls = ['mcell', dayClass(ds),
        parse(ds).m !== month ? 'other' : '', ds === today ? 'today' : '', ds === sel ? 'selected' : '']
        .filter(Boolean).join(' ');
      return h('button', {
        class: cls,
        onclick: () => app.selectDate(ds),
        'aria-label': `${fmtJa(ds)}${hol ? ` ${hol}` : ''} 予定${list.length}件`,
        'aria-pressed': String(ds === sel),
      },
      h('span', { class: 'mnum' }, parse(ds).d),
      hol ? h('span', { class: 'mhol' }, hol) : null,
      shown.map((o) => h('span', { class: 'mchip', style: { '--c': app.colorOf(o.members) } }, o.title || '・')),
      more > 0 ? h('span', { class: 'mmore' }, `ほか${more}`) : null);
    }));

  const occs = byDate.get(sel) || [];
  const panel = h('section', { class: 'day-panel', 'aria-label': `${fmtJa(sel)}の予定` },
    h('h2', { class: 'panel-title' }, h('span', {}, fmtJa(sel)), dayTags(sel)),
    occs.length
      ? h('div', { class: 'occ-list' }, occs.map((o) => occRow(app, o)))
      : h('p', { class: 'empty' }, '予定はありません'),
    tasksBlock(app, sel),
    addHereButton(app, sel));

  return h('div', { class: 'view view-month' }, h('div', { class: 'month' }, dow, grid), panel);
}

// ---- week ----

export function renderWeek(app) {
  const start = startOfWeek(app.state.date, app.prefs.weekStart);
  const days = rangeDays(start, addDays(start, 6));
  const byDate = groupByDate(app.occurrences(start, days[6]));
  const today = todayStr();

  return h('div', { class: 'view view-week' },
    days.map((ds) => {
      const list = byDate.get(ds) || [];
      const tasks = app.tasksDueOn(ds);
      const hol = holidayName(ds);
      return h('section', { class: `wrow ${dayClass(ds)} ${ds === today ? 'today' : ''}` },
        h('button', {
          class: 'wdate',
          onclick: () => app.openDay(ds),
          'aria-label': `${fmtJa(ds)}を日表示で見る`,
        },
        h('span', { class: 'wd-num' }, parse(ds).d),
        h('span', { class: 'wd-w' }, WEEKDAY_JA[weekday(ds)]),
        ds === today ? h('span', { class: 'wd-today' }, '今日') : null),
        h('div', { class: 'witems' },
          hol ? h('div', { class: 'whol' }, hol) : null,
          list.map((o) => occRow(app, o)),
          tasks.map((t) => taskRow(app, t)),
          !list.length && !tasks.length
            ? h('button', { class: 'wempty', onclick: () => app.openEventEditor({ mode: 'new', date: ds }) }, '＋ 予定を追加')
            : null));
    }));
}

// ---- day ----

function dayCard(app, o, column) {
  const multi = o.members.length > 1;
  const who = app.whoList(o.members);
  const color = who.length === 1 && who[0].name === 'みんな' ? who[0].color : column.color;
  return h('button', {
    class: 'dcard',
    style: { '--c': color },
    onclick: () => app.openEventDetail(o),
  },
  h('span', { class: 'dcard-time' }, occTimeLabel(o), o.recurring ? icon('repeat', 'xs') : null),
  h('span', { class: 'dcard-title' }, o.title || '（タイトルなし）'),
  multi ? whoTags(app, o.members) : null,
  o.memo ? h('span', { class: 'dcard-memo' }, o.memo) : null);
}

export function renderDay(app) {
  const ds = app.state.date;
  const occs = app.occurrences(ds, ds);
  const cols = app.visibleMembers();
  const tags = dayTags(ds).filter(Boolean);

  return h('div', { class: 'view view-day' },
    tags.length ? h('div', { class: 'day-head' }, tags) : null,
    h('div', { class: `day-cols cols-${Math.min(cols.length, 4)}` },
      cols.map((m) => {
        const list = occs.filter((o) => o.members.includes(m.id));
        return h('section', { class: 'dcol', style: { '--c': m.color }, 'aria-label': `${m.name}の予定` },
          h('h2', { class: 'dcol-head' }, m.name),
          list.length ? list.map((o) => dayCard(app, o, m)) : h('p', { class: 'empty small' }, '予定なし'));
      })),
    tasksBlock(app, ds),
    addHereButton(app, ds));
}

// ---- tasks ----

const byDue = (a, b) => {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.id < b.id ? -1 : 1;
};

export function renderTasks(app) {
  const tasks = app.visibleTasks();
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const filter = app.state.filter;
  const sections = [];

  if (filter === 'all') {
    const members = app.members();
    const isAll = (t) => members.length > 1 && members.every((m) => t.members.includes(m.id));
    const family = open.filter(isAll);
    if (family.length) sections.push({ name: 'みんな', color: app.familyColor, list: family, family: true });
    for (const m of members) {
      const list = open.filter((t) => !isAll(t) && t.members.includes(m.id));
      sections.push({ name: m.name, color: m.color, list });
    }
  } else {
    const m = app.memberMap().get(filter);
    sections.push({ name: m ? m.name : '', color: m ? m.color : '#888', list: open, single: true });
  }

  return h('div', { class: 'view view-tasks' },
    !open.length ? h('p', { class: 'empty big' }, 'やることはありません。下の「＋ やること」で追加できます。') : null,
    sections
      .filter((s) => s.list.length)
      .map((s) => h('section', { class: 'task-group', style: { '--c': s.color } },
        h('h2', { class: 'task-group-head' }, s.name, h('span', { class: 'count' }, `${s.list.length}件`)),
        s.list.map((t) => taskRow(app, t, { showWho: !s.family && (s.single || t.members.length > 1) })))),
    done.length
      ? h('details', { class: 'done-box' },
        h('summary', {}, `おわったこと（${done.length}）`),
        done.map((t) => taskRow(app, t)),
        h('button', { class: 'btn btn-ghost danger-text', onclick: () => app.clearDoneTasks(done.map((t) => t.id)) },
          icon('trash'), 'おわったことを全部消す'))
      : null);
}
