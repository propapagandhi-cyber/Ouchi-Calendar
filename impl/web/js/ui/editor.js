// Event detail / event editor / task editor sheets (spec/software.md B-1, B-2, B-3).
import { h, openSheet, closeSheet, toast } from './dom.js';
import { icon } from './icons.js';
import { whoTags } from './views.js';
import { EVENT_DEFAULTS, FAMILY_COLOR } from '../config.js';
import {
  fmtJa, fmtJaFull, weekday, WEEKDAY_JA, parse, addMinutes, timeToMin, addMonths, addDays, todayStr,
} from '../dateutil.js';
import { describeRepeat, occTimeLabel, nthOf } from '../recurrence.js';
import { splitAt } from '../eventops.js';

// ---------- small form parts ----------

function field(label, ...children) {
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), ...children);
}

function switchRow(label, checked, onChange) {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch',
    role: 'switch',
    checked,
    onchange: (e) => onChange(e.target.checked),
  });
  return h('label', { class: 'switch-row' }, h('span', {}, label), input);
}

function segButton(label, pressed, onClick, extraClass = '') {
  return h('button', {
    type: 'button',
    class: `seg ${extraClass}`,
    'aria-pressed': String(!!pressed),
    onclick: onClick,
  }, label);
}

function errText() {
  return h('p', { class: 'field-err', hidden: true, role: 'alert' });
}

function showErr(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

/** Member chips (multi-select) with a "みんな" shortcut. */
function memberPicker(app, selected, onChange) {
  const wrap = h('div', { class: 'chip-row' });
  const render = () => {
    const ms = app.members();
    const allOn = ms.length > 1 && ms.every((m) => selected.has(m.id));
    wrap.replaceChildren(
      ...ms.map((m) => h('button', {
        type: 'button',
        class: 'pchip',
        style: { '--c': m.color },
        'aria-pressed': String(selected.has(m.id)),
        onclick: () => {
          if (selected.has(m.id)) selected.delete(m.id);
          else selected.add(m.id);
          render();
          onChange?.();
        },
      }, selected.has(m.id) ? icon('check', 'sm') : null, m.name)),
      ms.length > 1
        ? h('button', {
          type: 'button',
          class: 'pchip',
          style: { '--c': FAMILY_COLOR },
          'aria-pressed': String(allOn),
          onclick: () => {
            if (allOn) selected.clear();
            else ms.forEach((m) => selected.add(m.id));
            render();
            onChange?.();
          },
        }, allOn ? icon('check', 'sm') : null, 'みんな')
        : null,
    );
  };
  render();
  wrap.refresh = render;
  return wrap;
}

function sheetHeader(title) {
  return h('div', { class: 'sheet-head' },
    h('h2', { class: 'sheet-title' }, title),
    h('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: () => closeSheet() }, icon('close')));
}

function footer(...buttons) {
  return h('div', { class: 'sheet-foot' }, ...buttons);
}

// ---------- event detail ----------

export function openEventDetail(app, occ) {
  openSheet((entry) => detailView(app, occ, entry), { label: occ.title });
}

function detailRow(iconName, ...content) {
  return h('div', { class: 'detail-row' }, icon(iconName, 'muted'), h('div', { class: 'detail-val' }, ...content));
}

function detailView(app, occ, entry) {
  const ev = app.getEvent(occ.eventId);
  if (!ev) return h('div', { class: 'sheet-body' }, h('p', {}, 'この予定は見つかりませんでした。'));
  const when = occ.multi
    ? `${fmtJa(occ.multi.first)} 〜 ${fmtJa(occ.multi.last)}${ev.allDay ? '' : `（${occTimeLabel({ ...occ, multi: null })}）`}`
    : `${fmtJa(occ.date)}　${occTimeLabel(occ)}`;

  const onChange = () => {
    if (!ev.repeat) {
      entry.replace(eventEditorView(app, { mode: 'series', eventId: ev.id }), { full: true, dismissable: false });
      return;
    }
    entry.replace(chooserView('どの予定を変更しますか？', [
      { label: 'この日だけ', sub: `${fmtJa(occ.date)}の1回だけ変えます`, onClick: () => toEditor('single') },
      { label: 'この日から先すべて', sub: `${fmtJa(occ.date)}から先をまとめて変えます`, onClick: () => toEditor(occ.date === ev.date ? 'series' : 'following') },
      { label: 'すべて', sub: 'くりかえし全体を変えます（お休みの日の確認もここ）', onClick: () => toEditor('series') },
    ], back));
  };
  const toEditor = (mode) =>
    entry.replace(eventEditorView(app, { mode, eventId: ev.id, occDate: occ.date }), { full: true, dismissable: false });

  const onDelete = () => {
    if (!ev.repeat) {
      app.deleteEvent(ev.id);
      return;
    }
    entry.replace(chooserView('どの予定を削除しますか？', [
      { label: 'この日だけ（お休みにする）', sub: `${fmtJa(occ.date)}の1回だけ消します`, onClick: () => app.skipOccurrence(ev.id, occ.date) },
      { label: 'この日から先すべて', sub: `${fmtJa(occ.date)}から先を消します（前の分は残ります）`, onClick: () => app.deleteFollowing(ev.id, occ.date), danger: true },
      { label: 'すべて', sub: 'くりかえし全体を消します', onClick: () => app.deleteEvent(ev.id), danger: true },
    ], back));
  };
  const back = () => entry.replace(detailView(app, occ, entry));

  return h('div', { class: 'sheet-body detail', style: { '--c': app.colorOf(occ.members) } },
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-bar', 'aria-hidden': 'true' }),
      h('h2', { class: 'detail-title' }, occ.title || '（タイトルなし）')),
    h('div', { class: 'detail-rows' },
      detailRow('clock', when),
      detailRow('people', whoTags(app, occ.members)),
      ev.repeat ? detailRow('repeat', describeRepeat(ev), occ.overridden ? h('span', { class: 'note' }, '（この日は変更あり）') : null) : null,
      occ.memo ? detailRow('memo', h('span', { class: 'memo-text' }, occ.memo)) : null),
    h('div', { class: 'btn-stack' },
      ev.repeat
        ? h('button', { class: 'btn btn-primary', onclick: () => app.skipOccurrence(ev.id, occ.date) }, 'この日はお休みにする')
        : null,
      h('button', { class: 'btn btn-soft', onclick: onChange }, icon('pencil'), '変更する'),
      h('button', { class: 'btn btn-soft danger-text', onclick: onDelete }, icon('trash'), '削除する'),
      h('button', { class: 'btn btn-ghost', onclick: () => closeSheet() }, '閉じる')));
}

function chooserView(title, options, back) {
  return h('div', { class: 'sheet-body' },
    h('h2', { class: 'sheet-title center' }, title),
    h('div', { class: 'btn-stack' },
      options.map((o) => h('button', { class: `btn btn-choice ${o.danger ? 'danger-text' : ''}`, onclick: o.onClick },
        h('span', { class: 'btn-label' }, o.label),
        o.sub ? h('span', { class: 'btn-sub' }, o.sub) : null)),
      h('button', { class: 'btn btn-ghost', onclick: back }, 'もどる')));
}

// ---------- event editor ----------

const REPEAT_KINDS = [
  ['none', 'しない'], ['daily', '毎日'], ['weekly', '毎週'],
  ['biweekly', '2週ごと'], ['monthly', '毎月'], ['yearly', '毎年'],
];

function repeatKind(r) {
  if (!r) return 'none';
  if (r.freq === 'weekly') return r.interval === 2 ? 'biweekly' : 'weekly';
  return r.freq;
}

export function openEventEditor(app, opts) {
  openSheet(() => eventEditorView(app, opts), { full: true, dismissable: false, label: '予定の入力' });
}

function eventEditorView(app, opts) {
  const { mode } = opts; // new | series | single | following
  const ev = opts.eventId ? app.getEvent(opts.eventId) : null;
  const occDate = opts.occDate;

  let src;
  if (mode === 'new') {
    const start = EVENT_DEFAULTS.startTime;
    src = {
      title: '', members: opts.members || [], date: opts.date, endDate: null, allDay: false,
      start, end: addMinutes(start, EVENT_DEFAULTS.durationMin), memo: '', repeat: null, skipDates: [], skipRanges: [],
    };
  } else if (mode === 'single') {
    src = { ...ev, ...(ev.overrides?.[occDate] || {}), date: occDate, endDate: null, repeat: null };
  } else if (mode === 'following') {
    src = splitAt(ev, occDate, 'tmp').tail;
  } else {
    src = ev;
  }

  const f = {
    title: src.title,
    members: new Set(src.members),
    date: src.date,
    multi: !!src.endDate,
    endDate: src.endDate || src.date,
    allDay: !!src.allDay,
    start: src.start,
    end: src.end,
    memo: src.memo || '',
    kind: repeatKind(src.repeat),
    weekdays: new Set(src.repeat?.weekdays?.length ? src.repeat.weekdays : [weekday(src.date)]),
    monthlyMode: src.repeat?.monthlyMode || 'day',
    untilOn: !!src.repeat?.until,
    until: src.repeat?.until || addMonths(src.date, 3),
    skipHolidays: !!src.repeat?.skipHolidays,
    skipRanges: [...(src.skipRanges || [])],
    skipDates: [...(src.skipDates || [])],
    newRange: { from: '', to: '', label: '' },
  };
  const canRepeat = mode !== 'single';

  const titles = {
    new: '予定を追加', series: ev?.repeat ? 'くりかえし予定を変更' : '予定を変更',
    single: `${fmtJa(occDate || '')}だけ変更`, following: `${fmtJa(occDate || '')}から先を変更`,
  };

  // --- who ---
  const errWho = errText();
  const who = memberPicker(app, f.members, () => showErr(errWho, ''));

  // --- what ---
  const errTitle = errText();
  const titleInput = h('input', {
    type: 'text', class: 'input', value: f.title, maxlength: '60', enterkeyhint: 'done',
    placeholder: '例：サッカー、歯医者、参観日', 'aria-label': 'なにをする？',
    oninput: (e) => {
      f.title = e.target.value;
      showErr(errTitle, '');
    },
  });
  const recent = app.recentTitles().filter((t) => t !== f.title);
  const quick = recent.length
    ? h('div', { class: 'quick' },
      h('div', { class: 'quick-label' }, 'よく使う予定'),
      h('div', { class: 'chip-row' },
        recent.map((t) => h('button', {
          type: 'button',
          class: 'qchip',
          onclick: () => {
            f.title = t;
            titleInput.value = t;
            showErr(errTitle, '');
            if (mode === 'new') {
              const last = app.lastEventWithTitle(t);
              if (last) {
                f.members.clear();
                last.members.forEach((m) => f.members.add(m));
                who.refresh();
                f.allDay = last.allDay;
                f.start = last.start;
                f.end = last.end;
                renderWhen();
              }
            }
          },
        }, t))))
    : null;

  // --- when ---
  const whenBox = h('div', { class: 'when' });
  const errWhen = errText();
  function renderWhen() {
    const dateInput = h('input', {
      type: 'date', class: 'input', value: f.date, 'aria-label': '日にち',
      onchange: (e) => {
        if (!e.target.value) {
          e.target.value = f.date;
          return;
        }
        const oldWd = weekday(f.date);
        f.date = e.target.value;
        if (f.endDate < f.date) f.endDate = f.date;
        if (f.weekdays.size === 1 && f.weekdays.has(oldWd)) f.weekdays = new Set([weekday(f.date)]);
        renderWhen();
        renderRepeat();
      },
    });
    const parts = [
      h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, f.multi ? 'はじまりの日' : '日にち'), dateInput),
    ];
    if (f.kind === 'none' && mode !== 'single') {
      parts.push(switchRow('何日かつづく（旅行など）', f.multi, (v) => { f.multi = v; renderWhen(); }));
      if (f.multi) {
        parts.push(h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'おわりの日'),
          h('input', {
            type: 'date', class: 'input', value: f.endDate, min: f.date, 'aria-label': 'おわりの日',
            onchange: (e) => { f.endDate = e.target.value || f.date; },
          })));
      }
    }
    parts.push(switchRow('終日（時間を決めない）', f.allDay, (v) => { f.allDay = v; renderWhen(); }));
    if (!f.allDay) {
      const endInput = h('input', {
        type: 'time', class: 'input', value: f.end, 'aria-label': 'おわる時間',
        onchange: (e) => { f.end = e.target.value || f.end; showErr(errWhen, ''); },
      });
      const startInput = h('input', {
        type: 'time', class: 'input', value: f.start, 'aria-label': 'はじまる時間',
        onchange: (e) => {
          const old = f.start;
          f.start = e.target.value || old;
          const dur = timeToMin(f.end) - timeToMin(old);
          f.end = addMinutes(f.start, dur > 0 ? dur : EVENT_DEFAULTS.durationMin);
          endInput.value = f.end;
        },
      });
      parts.push(h('div', { class: 'time-row' },
        h('label', { class: 'time-cell' }, h('span', { class: 'row-label' }, 'はじまり'), startInput),
        h('span', { class: 'time-sep' }, '〜'),
        h('label', { class: 'time-cell' }, h('span', { class: 'row-label' }, 'おわり'), endInput)));
    }
    whenBox.replaceChildren(...parts);
  }
  renderWhen();

  // --- repeat ---
  const repeatBox = h('div', { class: 'repeat' });
  const errRepeat = errText();
  function renderRepeat() {
    const kinds = h('div', { class: 'seg-grid' },
      REPEAT_KINDS.map(([k, label]) => segButton(label, f.kind === k, () => {
        f.kind = k;
        if (k !== 'none') f.multi = false;
        renderRepeat();
        renderWhen();
      })));
    const parts = [kinds];
    if (f.kind === 'weekly' || f.kind === 'biweekly') {
      parts.push(h('div', { class: 'sub-field' },
        h('div', { class: 'quick-label' }, '曜日（いくつでも選べます）'),
        h('div', { class: 'wd-row' },
          [0, 1, 2, 3, 4, 5, 6].map((i) => (app.prefs.weekStart + i) % 7).map((w) => h('button', {
            type: 'button',
            class: `wdchip ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}`,
            'aria-pressed': String(f.weekdays.has(w)),
            'aria-label': `${WEEKDAY_JA[w]}曜日`,
            onclick: () => {
              if (f.weekdays.has(w)) {
                if (f.weekdays.size > 1) f.weekdays.delete(w);
              } else f.weekdays.add(w);
              renderRepeat();
            },
          }, WEEKDAY_JA[w])))));
    }
    if (f.kind === 'monthly') {
      const { d } = parse(f.date);
      const nth = nthOf(f.date);
      const wd = WEEKDAY_JA[weekday(f.date)];
      parts.push(h('div', { class: 'sub-field seg-col' },
        segButton(`毎月 ${d}日`, f.monthlyMode === 'day', () => { f.monthlyMode = 'day'; renderRepeat(); }),
        segButton(nth === -1 ? `毎月 最終${wd}曜日` : `毎月 第${nth}${wd}曜日`, f.monthlyMode === 'nth', () => { f.monthlyMode = 'nth'; renderRepeat(); })));
    }
    if (f.kind !== 'none') {
      parts.push(h('div', { class: 'sub-field' },
        h('div', { class: 'quick-label' }, 'いつまで？'),
        h('div', { class: 'seg-grid two' },
          segButton('ずっと', !f.untilOn, () => { f.untilOn = false; renderRepeat(); }),
          segButton('おわりの日を決める', f.untilOn, () => { f.untilOn = true; renderRepeat(); })),
        f.untilOn
          ? h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'この日まで'),
            h('input', {
              type: 'date', class: 'input', value: f.until, min: f.date, 'aria-label': 'くりかえしのおわりの日',
              onchange: (e) => { f.until = e.target.value || f.until; showErr(errRepeat, ''); },
            }))
          : null));
      parts.push(switchRow('祝日はお休み', f.skipHolidays, (v) => { f.skipHolidays = v; }));
      parts.push(skipRangeBlock());
      if (mode === 'series' && f.skipDates.length) parts.push(skipDatesBlock());
    }
    repeatBox.replaceChildren(...parts);
  }

  function skipRangeBlock() {
    const list = f.skipRanges.map((r, i) => h('div', { class: 'skip-item' },
      h('span', {}, `${r.label ? `${r.label}：` : ''}${fmtJa(r.from)} 〜 ${fmtJa(r.to)}`),
      h('button', {
        type: 'button', class: 'btn-mini',
        onclick: () => { f.skipRanges.splice(i, 1); renderRepeat(); },
      }, '取り消す')));
    const nr = f.newRange;
    const err = errText();
    return h('div', { class: 'sub-field skip-box' },
      h('div', { class: 'quick-label' }, 'お休み期間（夏休みなど、まとめてお休み）'),
      ...list,
      h('details', { class: 'add-range', open: nr.from || nr.to ? true : null },
        h('summary', {}, '＋ お休み期間を追加'),
        h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'なまえ'),
          h('input', { type: 'text', class: 'input', value: nr.label, placeholder: '例：夏休み', oninput: (e) => { nr.label = e.target.value; } })),
        h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'この日から'),
          h('input', { type: 'date', class: 'input', value: nr.from, onchange: (e) => { nr.from = e.target.value; } })),
        h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'この日まで'),
          h('input', { type: 'date', class: 'input', value: nr.to, onchange: (e) => { nr.to = e.target.value; } })),
        err,
        h('button', {
          type: 'button', class: 'btn btn-soft',
          onclick: () => {
            if (!nr.from || !nr.to) return showErr(err, '日にちを2つとも選んでください');
            if (nr.to < nr.from) return showErr(err, '「この日まで」が「この日から」より前になっています');
            f.skipRanges.push({ from: nr.from, to: nr.to, label: nr.label.trim() });
            f.skipRanges.sort((a, b) => (a.from < b.from ? -1 : 1));
            f.newRange = { from: '', to: '', label: '' };
            renderRepeat();
          },
        }, 'この期間をお休みにする')));
  }

  function skipDatesBlock() {
    return h('div', { class: 'sub-field skip-box' },
      h('div', { class: 'quick-label' }, 'お休みにした日'),
      f.skipDates.map((ds) => h('div', { class: 'skip-item' },
        h('span', {}, fmtJaFull(ds)),
        h('button', {
          type: 'button', class: 'btn-mini',
          onclick: () => { f.skipDates = f.skipDates.filter((x) => x !== ds); renderRepeat(); },
        }, 'もとに戻す'))));
  }
  if (canRepeat) renderRepeat();

  // --- memo ---
  const memoInput = h('textarea', {
    class: 'input textarea', rows: '3', placeholder: '持ち物・場所など（なくてもOK）', 'aria-label': 'メモ',
    oninput: (e) => { f.memo = e.target.value; },
  });
  memoInput.value = f.memo;

  // --- save ---
  function buildRepeat() {
    if (f.kind === 'none') return null;
    const base = { interval: 1, until: f.untilOn ? f.until : null, skipHolidays: f.skipHolidays };
    switch (f.kind) {
      case 'daily': return { ...base, freq: 'daily' };
      case 'weekly':
      case 'biweekly':
        return { ...base, freq: 'weekly', interval: f.kind === 'biweekly' ? 2 : 1, weekdays: [...f.weekdays].sort() };
      case 'monthly':
        return f.monthlyMode === 'nth'
          ? { ...base, freq: 'monthly', monthlyMode: 'nth', nth: nthOf(f.date) }
          : { ...base, freq: 'monthly', monthlyMode: 'day' };
      case 'yearly': return { ...base, freq: 'yearly' };
      default: return null;
    }
  }

  function save() {
    const title = f.title.trim();
    let ok = true;
    if (!f.members.size) { showErr(errWho, 'だれの予定か選んでください'); ok = false; }
    if (!title) { showErr(errTitle, 'なにをするか入力してください'); ok = false; }
    if (canRepeat && f.kind !== 'none' && f.untilOn && f.until < f.date) {
      showErr(errRepeat, '「この日まで」が始まりの日より前になっています');
      ok = false;
    }
    if (!ok) {
      body.querySelector('.field-err:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (!f.allDay && timeToMin(f.end) <= timeToMin(f.start)) f.end = addMinutes(f.start, EVENT_DEFAULTS.durationMin);
    const order = app.members().map((m) => m.id);
    const fields = {
      title,
      members: order.filter((id) => f.members.has(id)),
      allDay: f.allDay,
      start: f.start,
      end: f.end,
      memo: f.memo.trim(),
    };
    const repeat = canRepeat ? buildRepeat() : null;
    const endDate = repeat || !f.multi || f.endDate <= f.date ? null : f.endDate;
    const skipRanges = repeat ? f.skipRanges : [];

    if (mode === 'new') {
      app.createEvent({ ...fields, date: f.date, endDate, repeat, skipDates: [], skipRanges, overrides: {} });
    } else if (mode === 'series') {
      app.updateEvent({ ...ev, ...fields, date: f.date, endDate, repeat, skipRanges, skipDates: repeat ? f.skipDates : [] });
    } else if (mode === 'single') {
      app.changeOccurrence(ev.id, occDate, { ...fields, date: f.date });
    } else if (mode === 'following') {
      app.changeFollowing(ev.id, occDate, { ...fields, date: f.date, repeat, skipRanges, skipDates: f.skipDates });
    }
  }

  const body = h('div', { class: 'sheet-body form' },
    field(h('span', {}, icon('people', 'sm'), 'だれの予定？'), who, errWho),
    field(h('span', {}, icon('pencil', 'sm'), 'なにをする？'), titleInput, errTitle, quick),
    field(h('span', {}, icon('clock', 'sm'), 'いつ？'), whenBox, errWhen),
    canRepeat ? field(h('span', {}, icon('repeat', 'sm'), 'くりかえし'), repeatBox, errRepeat) : null,
    field(h('span', {}, icon('memo', 'sm'), 'メモ'), memoInput));

  return h('div', { class: 'editor' },
    sheetHeader(titles[mode]),
    body,
    footer(
      h('button', { class: 'btn btn-ghost', onclick: () => closeSheet() }, 'やめる'),
      h('button', { class: 'btn btn-primary', onclick: save }, '保存する')));
}

// ---------- task editor ----------

export function openTaskEditor(app, task, { members = [] } = {}) {
  openSheet(() => taskEditorView(app, task, members), { full: true, dismissable: false, label: 'やることの入力' });
}

function taskEditorView(app, task, defaultMembers) {
  const isNew = !task;
  const today = todayStr();
  const f = {
    title: task?.title || '',
    members: new Set(task ? task.members : defaultMembers),
    due: task?.due || null,
  };
  const dueMode = () => (!f.due ? 'none' : f.due === today ? 'today' : f.due === addDays(today, 1) ? 'tomorrow' : 'date');

  const errWho = errText();
  const errTitle = errText();
  const who = memberPicker(app, f.members, () => showErr(errWho, ''));
  const titleInput = h('input', {
    type: 'text', class: 'input', value: f.title, maxlength: '80', enterkeyhint: 'done',
    placeholder: '例：上履きを持っていく、集金袋', 'aria-label': 'やること',
    oninput: (e) => { f.title = e.target.value; showErr(errTitle, ''); },
  });

  const dueBox = h('div', {});
  const renderDue = () => {
    const m = dueMode();
    dueBox.replaceChildren(
      h('div', { class: 'seg-grid four' },
        segButton('なし', m === 'none', () => { f.due = null; renderDue(); }),
        segButton('今日', m === 'today', () => { f.due = today; renderDue(); }),
        segButton('明日', m === 'tomorrow', () => { f.due = addDays(today, 1); renderDue(); }),
        segButton('日にち', m === 'date', () => { f.due = f.due && m === 'date' ? f.due : addDays(today, 2); renderDue(); })),
      m === 'date'
        ? h('div', { class: 'row-2' }, h('span', { class: 'row-label' }, 'この日まで'),
          h('input', { type: 'date', class: 'input', value: f.due, onchange: (e) => { f.due = e.target.value || f.due; } }))
        : null);
  };
  renderDue();

  const save = () => {
    const title = f.title.trim();
    let ok = true;
    if (!f.members.size) { showErr(errWho, 'だれのやることか選んでください'); ok = false; }
    if (!title) { showErr(errTitle, 'やることを入力してください'); ok = false; }
    if (!ok) return;
    const order = app.members().map((m) => m.id);
    const rec = { ...(task || {}), title, members: order.filter((id) => f.members.has(id)), due: f.due };
    app.saveTask(rec, isNew);
  };

  return h('div', { class: 'editor' },
    sheetHeader(isNew ? 'やることを追加' : 'やることを変更'),
    h('div', { class: 'sheet-body form' },
      field(h('span', {}, icon('people', 'sm'), 'だれの？'), who, errWho),
      field(h('span', {}, icon('pencil', 'sm'), 'やること'), titleInput, errTitle),
      field(h('span', {}, icon('clock', 'sm'), 'いつまで？'), dueBox),
      !isNew
        ? h('button', { class: 'btn btn-soft danger-text', onclick: () => app.deleteTask(task.id) }, icon('trash'), 'このやることを削除する')
        : null),
    footer(
      h('button', { class: 'btn btn-ghost', onclick: () => closeSheet() }, 'やめる'),
      h('button', { class: 'btn btn-primary', onclick: save }, '保存する')));
}

export { toast };
