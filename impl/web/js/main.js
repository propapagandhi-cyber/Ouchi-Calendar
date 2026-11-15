// App bootstrap: state, data mutations, rendering and sync wiring.
import { APP, FONT_SCALES, FAMILY_COLOR, MEMBER_PALETTE, SYNC, UI } from './config.js';
import {
  todayStr, addDays, addMonths, startOfWeek, fmtYM, fmtJa, parse, startOfMonth,
} from './dateutil.js';
import { isHoliday } from './holidays.js';
import { expand } from './recurrence.js';
import {
  emptyData, normalize, merge, upsert, softDelete, findRecord, live, liveMembers, uid, COLLECTIONS, canonicalJSON,
} from './model.js';
import { skipDate, truncateBefore, splitAt, setOverride, detachOccurrence } from './eventops.js';
import { local } from './store/local.js';
import { GitHubClient } from './store/github.js';
import { SyncEngine, SyncController, syncMessage } from './store/sync.js';
import { h, toast, closeSheet, sheetDepth } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { renderMonth, renderWeek, renderDay, renderTasks } from './ui/views.js';
import { openEventDetail, openEventEditor, openTaskEditor } from './ui/editor.js';
import { openSettings } from './ui/settings.js';

const VIEWS = {
  month: { label: '月', icon: 'month', render: renderMonth },
  week: { label: '週', icon: 'week', render: renderWeek },
  day: { label: '日', icon: 'day', render: renderDay },
  tasks: { label: 'やること', icon: 'tasks', render: renderTasks },
};

const deviceLabel = /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'pc';

const app = {
  data: normalize(local.loadData() || emptyData()),
  meta: local.loadMeta(),
  prefs: local.loadPrefs(),
  conn: local.loadConn(),
  version: 0,
  syncStatus: { state: 'idle', kind: null, at: 0 },
  sync: null,
  installPrompt: null,
  onSettingsChange: null,
  familyColor: FAMILY_COLOR,
  state: { view: 'month', date: todayStr(), filter: 'all' },

  // ---------- derived ----------
  members() {
    return liveMembers(this.data);
  },
  memberMap() {
    return new Map(this.members().map((m) => [m.id, m]));
  },
  visibleMembers() {
    const f = this.state.filter;
    const ms = this.members();
    return f === 'all' ? ms : ms.filter((m) => m.id === f);
  },
  isVisible(memberIds) {
    return this.state.filter === 'all' || memberIds.includes(this.state.filter);
  },
  /** [{name,color}] for display. All members -> "みんな". */
  whoList(memberIds) {
    const ms = this.members();
    if (ms.length > 1 && ms.every((m) => memberIds.includes(m.id))) return [{ name: 'みんな', color: FAMILY_COLOR }];
    const map = this.memberMap();
    const list = memberIds.map((id) => map.get(id)).filter(Boolean).sort((a, b) => a.order - b.order);
    return list.length ? list : [{ name: '（だれか）', color: '#868E96' }];
  },
  colorOf(memberIds) {
    return this.whoList(memberIds)[0].color;
  },
  occurrences(from, to) {
    const events = live(this.data, 'events').filter((e) => this.isVisible(e.members));
    return expand(events, from, to, { isHoliday }).filter((o) => this.isVisible(o.members));
  },
  visibleTasks() {
    return live(this.data, 'tasks').filter((t) => this.isVisible(t.members));
  },
  tasksDueOn(ds) {
    return this.visibleTasks().filter((t) => t.due === ds && !t.done);
  },
  getEvent(id) {
    const e = findRecord(this.data, 'events', id);
    return e && !e.deleted ? e : null;
  },
  recentTitles() {
    const seen = new Set();
    const out = [];
    const events = live(this.data, 'events').sort((a, b) => b.updatedAt - a.updatedAt);
    for (const e of events) {
      const t = e.title.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
      if (out.length >= UI.quickTitleCount) break;
    }
    return out;
  },
  lastEventWithTitle(title) {
    return live(this.data, 'events')
      .filter((e) => e.title.trim() === title)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  },
  isMemberUsed(id) {
    return live(this.data, 'events').some((e) => e.members.includes(id))
      || live(this.data, 'tasks').some((t) => t.members.includes(id));
  },

  // ---------- data mutation ----------
  /** Apply a new dataset produced by upsert/softDelete. Optionally toast with undo. */
  commit(next, { message = '', undo = false } = {}) {
    const prev = this.data;
    this.setData(next, true);
    if (message) {
      if (undo) toast(message, { actionLabel: '元に戻す', onAction: () => this.undo(prev, next) });
      else toast(message);
    }
  },
  setData(next, isLocalEdit) {
    this.data = next;
    local.saveData(next);
    if (isLocalEdit) {
      this.version++;
      this.meta.dirty = true;
      local.saveMeta(this.meta);
      this.sync?.schedule();
    }
    this.render();
    this.onSettingsChange?.();
  },
  /** Restore records changed between prev and next (records touched by one commit). */
  undo(prev, next) {
    let d = this.data;
    for (const c of COLLECTIONS) {
      const prevMap = new Map(prev[c].map((r) => [r.id, r]));
      for (const r of next[c]) {
        const p = prevMap.get(r.id);
        if (!p) d = softDelete(d, c, r.id);
        else if (p !== r) d = upsert(d, c, p);
      }
    }
    this.commit(d, { message: '元に戻しました' });
  },

  createEvent(fields) {
    const rec = { id: uid('e'), deleted: false, ...fields };
    closeSheet().then(() => this.commit(upsert(this.data, 'events', rec), { message: '保存しました', undo: true }));
    if (fields.date) this.state.date = fields.date;
  },
  updateEvent(rec) {
    closeSheet().then(() => this.commit(upsert(this.data, 'events', rec), { message: '保存しました', undo: true }));
  },
  skipOccurrence(id, ds) {
    const ev = this.getEvent(id);
    if (!ev) return;
    closeSheet().then(() => this.commit(upsert(this.data, 'events', skipDate(ev, ds)), {
      message: `${fmtJa(ds)}をお休みにしました`, undo: true,
    }));
  },
  changeOccurrence(id, ds, fields) {
    const ev = this.getEvent(id);
    if (!ev) return;
    const { date, ...rest } = fields;
    let next;
    if (date === ds) {
      next = upsert(this.data, 'events', setOverride(ev, ds, rest));
    } else {
      const { series, single } = detachOccurrence(ev, ds, uid('e'), fields);
      next = upsert(upsert(this.data, 'events', series), 'events', single);
    }
    closeSheet().then(() => this.commit(next, { message: '保存しました', undo: true }));
  },
  changeFollowing(id, ds, fields) {
    const ev = this.getEvent(id);
    if (!ev) return;
    const { head, tail } = splitAt(ev, ds, uid('e'));
    let next = this.data;
    next = head ? upsert(next, 'events', head) : softDelete(next, 'events', ev.id);
    next = upsert(next, 'events', { ...tail, ...fields });
    closeSheet().then(() => this.commit(next, { message: '保存しました', undo: true }));
  },
  deleteFollowing(id, ds) {
    const ev = this.getEvent(id);
    if (!ev) return;
    const head = truncateBefore(ev, ds);
    const next = head ? upsert(this.data, 'events', head) : softDelete(this.data, 'events', id);
    closeSheet().then(() => this.commit(next, { message: '削除しました', undo: true }));
  },
  deleteEvent(id) {
    closeSheet().then(() => this.commit(softDelete(this.data, 'events', id), { message: '削除しました', undo: true }));
  },

  saveTask(rec, isNew) {
    const r = isNew ? { id: uid('t'), done: false, doneAt: null, deleted: false, ...rec } : rec;
    closeSheet().then(() => this.commit(upsert(this.data, 'tasks', r), { message: '保存しました', undo: !isNew }));
  },
  toggleTask(id) {
    const t = findRecord(this.data, 'tasks', id);
    if (!t) return;
    const done = !t.done;
    this.commit(upsert(this.data, 'tasks', { ...t, done, doneAt: done ? Date.now() : null }), {
      message: done ? 'おわりにしました' : 'もどしました', undo: done,
    });
  },
  deleteTask(id) {
    closeSheet().then(() => this.commit(softDelete(this.data, 'tasks', id), { message: '削除しました', undo: true }));
  },
  clearDoneTasks(ids) {
    let d = this.data;
    for (const id of ids) d = softDelete(d, 'tasks', id);
    this.commit(d, { message: 'おわったことを消しました', undo: true });
  },

  addMember() {
    const ms = this.members();
    const used = new Set(ms.map((m) => m.color.toLowerCase()));
    const color = MEMBER_PALETTE.find((c) => !used.has(c.toLowerCase())) || MEMBER_PALETTE[0];
    const order = ms.length ? Math.max(...ms.map((m) => m.order)) + 1 : 0;
    this.commit(upsert(this.data, 'members', { id: uid('m'), name: `メンバー${ms.length + 1}`, color, order, deleted: false }));
  },
  updateMember(m) {
    this.commit(upsert(this.data, 'members', m));
  },
  deleteMember(id) {
    if (this.state.filter === id) this.setFilter('all');
    this.commit(softDelete(this.data, 'members', id), { message: '削除しました' });
  },

  exportData() {
    const blob = new Blob([canonicalJSON(this.data, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ouchi-calendar-${todayStr().replace(/-/g, '')}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
  importData(raw) {
    const merged = merge(this.data, normalize(raw));
    // Bump imported records so they propagate on next sync.
    this.setData(merged, true);
  },

  // ---------- prefs / navigation ----------
  setPref(key, value) {
    this.prefs = { ...this.prefs, [key]: value };
    local.savePrefs(this.prefs);
    applyFontScale();
    this.render();
  },
  setView(v) {
    this.state.view = v;
    this.setPref('view', v);
    window.scrollTo({ top: 0 });
  },
  setFilter(f) {
    this.state.filter = f;
    this.setPref('filter', f);
  },
  selectDate(ds) {
    this.state.date = ds;
    this.render();
  },
  openDay(ds) {
    this.state.date = ds;
    this.setView('day');
  },
  go(delta) {
    const { view, date } = this.state;
    if (view === 'month') {
      const target = startOfMonth(addMonths(date, delta));
      const today = todayStr();
      this.state.date = startOfMonth(today) === target ? today : target;
    } else if (view === 'week') {
      this.state.date = addDays(date, 7 * delta);
    } else if (view === 'day') {
      this.state.date = addDays(date, delta);
    }
    this.render();
  },
  goToday() {
    this.state.date = todayStr();
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ---------- sheets ----------
  openEventDetail(occ) {
    openEventDetail(this, occ);
  },
  openEventEditor(opts) {
    const f = this.state.filter;
    openEventEditor(this, { members: f === 'all' ? [] : [f], ...opts });
  },
  openTaskEditor(task) {
    const f = this.state.filter;
    openTaskEditor(this, task || null, { members: f === 'all' ? [] : [f] });
  },

  // ---------- sync ----------
  startSync() {
    this.sync?.stop();
    this.sync = null;
    if (!this.conn) {
      this.syncStatus = { state: 'idle', kind: null, at: 0 };
      return;
    }
    const client = new GitHubClient(this.conn, { deviceLabel });
    this.sync = new SyncController({
      engine: new SyncEngine(client),
      getData: () => this.data,
      getVersion: () => this.version,
      onMerged: (merged) => {
        const next = merge(this.data, merged);
        if (canonicalJSON(next) !== canonicalJSON(this.data)) this.setData(next, false);
      },
      onClean: () => {
        this.meta.dirty = false;
        this.meta.lastSyncAt = Date.now();
        local.saveMeta(this.meta);
      },
      onStatus: (s) => {
        this.syncStatus = s;
        renderBanner();
        this.onSettingsChange?.();
      },
    });
    this.sync.syncNow();
  },
  async syncNow() {
    if (this.sync) return this.sync.syncNow();
    return null;
  },
  async connect(conn) {
    const engine = new SyncEngine(new GitHubClient(conn, { deviceLabel }));
    try {
      const { merged } = await engine.run(() => this.data);
      this.conn = conn;
      local.saveConn(conn);
      this.setData(merge(this.data, merged), false);
      this.startSync();
      return { ok: true };
    } catch (e) {
      return { ok: false, kind: e.kind || 'unknown' };
    }
  },
  disconnect() {
    this.conn = null;
    local.clearConn();
    this.startSync();
    renderBanner();
  },

  render() {
    render();
  },
};

// ---------- rendering ----------

const $ = (id) => document.getElementById(id);

function applyFontScale() {
  const fs = FONT_SCALES[app.prefs.fontScale] || FONT_SCALES.normal;
  document.documentElement.style.fontSize = `${fs.px}px`;
}

function periodLabel() {
  const { view, date } = app.state;
  if (view === 'month') return fmtYM(date);
  if (view === 'week') {
    const s = startOfWeek(date, app.prefs.weekStart);
    const e = addDays(s, 6);
    const ps = parse(s);
    const pe = parse(e);
    return ps.m === pe.m ? `${ps.m}月${ps.d}日〜${pe.d}日` : `${ps.m}/${ps.d}〜${pe.m}/${pe.d}`;
  }
  if (view === 'day') return fmtJa(date);
  return 'やること';
}

function renderTopbar() {
  const isTasks = app.state.view === 'tasks';
  const prevLabel = { month: '前の月', week: '前の週', day: '前の日' }[app.state.view];
  const nextLabel = { month: '次の月', week: '次の週', day: '次の日' }[app.state.view];
  $('topbar').replaceChildren(
    isTasks ? h('span', { class: 'nav-spacer' }) : h('button', { class: 'nav-btn', 'aria-label': prevLabel, onclick: () => app.go(-1) }, icon('left')),
    h('h1', { class: 'period' }, periodLabel()),
    isTasks ? h('span', { class: 'nav-spacer' }) : h('button', { class: 'nav-btn', 'aria-label': nextLabel, onclick: () => app.go(1) }, icon('right')),
    h('div', { class: 'top-actions' },
      isTasks ? null : h('button', { class: 'today-btn', onclick: () => app.goToday() }, '今日'),
      h('button', { class: 'set-btn', onclick: () => openSettings(app), 'aria-label': '設定' }, icon('gear'), h('span', { class: 'set-label' }, '設定'))),
  );
}

function renderFilter() {
  const members = app.members();
  if (app.state.filter !== 'all' && !members.some((m) => m.id === app.state.filter)) app.state.filter = 'all';
  const chip = (id, name, color) => h('button', {
    class: 'fchip',
    style: { '--c': color },
    'aria-pressed': String(app.state.filter === id),
    onclick: () => app.setFilter(id),
  }, name);
  $('filterbar').replaceChildren(
    h('span', { class: 'sr-only' }, 'だれの予定を表示するか'),
    chip('all', 'みんな', FAMILY_COLOR),
    ...members.map((m) => chip(m.id, m.name, m.color)),
  );
}

function renderBanner() {
  const el = $('banner');
  const msg = app.conn ? syncMessage(app.syncStatus) : '';
  el.hidden = !msg;
  el.replaceChildren(icon('alert', 'sm'), h('span', {}, msg));
}

function renderTabbar() {
  $('tabbar').replaceChildren(
    ...Object.entries(VIEWS).map(([key, v]) => h('button', {
      class: 'tab',
      'aria-current': app.state.view === key ? 'page' : null,
      onclick: () => app.setView(key),
    }, icon(v.icon), h('span', { class: 'tab-label' }, v.label))),
  );
}

function renderFab() {
  const isTasks = app.state.view === 'tasks';
  const fab = $('fab');
  fab.replaceChildren(icon('plus'), h('span', {}, isTasks ? 'やること' : '予定'));
  fab.setAttribute('aria-label', isTasks ? 'やることを追加' : '予定を追加');
  fab.onclick = () => (isTasks ? app.openTaskEditor(null) : app.openEventEditor({ mode: 'new', date: app.state.date }));
}

function render() {
  renderTopbar();
  renderFilter();
  renderBanner();
  renderTabbar();
  renderFab();
  const view = VIEWS[app.state.view] || VIEWS.month;
  $('main').replaceChildren(view.render(app));
  document.title = APP.name;
}

// ---------- gestures ----------

function setupSwipe() {
  const main = $('main');
  let sx = 0;
  let sy = 0;
  let tracking = false;
  main.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || app.state.view === 'tasks') return;
    tracking = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) app.go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ---------- boot ----------

function boot() {
  app.state.view = VIEWS[app.prefs.view] ? app.prefs.view : 'month';
  app.state.filter = app.prefs.filter || 'all';
  applyFontScale();
  render();
  setupSwipe();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    app.installPrompt = e;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Date may have changed while the app was in the background.
      if (sheetDepth() === 0) render();
      app.sync?.schedule(200);
    }
  });
  window.addEventListener('online', () => app.sync?.schedule(200));
  setInterval(() => {
    if (document.visibilityState === 'visible') app.sync?.syncNow();
  }, SYNC.pollMs);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw register failed', e));
  }
  app.startSync();
}

boot();

// Exposed for debugging in the browser console only.
window.__ouchi = app;
