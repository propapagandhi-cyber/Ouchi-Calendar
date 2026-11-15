// Settings sheet: text size, week start, members, sync (connection code), backup.
import { h, openSheet, closeSheet, confirmSheet, toast } from './dom.js';
import { icon } from './icons.js';
import { APP, FONT_SCALES, MEMBER_PALETTE } from '../config.js';
import { encodeConnectionCode, decodeConnectionCode } from '../store/github.js';
import { syncMessage } from '../store/sync.js';

function section(title, ...children) {
  return h('section', { class: 'set-section' }, h('h3', { class: 'set-title' }, title), ...children);
}

function seg(label, pressed, onClick) {
  return h('button', { type: 'button', class: 'seg', 'aria-pressed': String(!!pressed), onclick: onClick }, label);
}

export function openSettings(app) {
  openSheet((entry) => {
    const root = h('div', { class: 'editor' });
    const render = () => root.replaceChildren(settingsView(app, render));
    entry.rerender = render;
    app.onSettingsChange = render;
    render();
    return root;
  }, {
    full: true,
    dismissable: false,
    label: '設定',
    onClose: () => { app.onSettingsChange = null; },
  });
}

function settingsView(app, rerender) {
  return h('div', {},
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, '設定'),
      h('button', { class: 'icon-btn', 'aria-label': '閉じる', onclick: () => closeSheet() }, icon('close'))),
    h('div', { class: 'sheet-body form' },
      displaySection(app, rerender),
      membersSection(app, rerender),
      syncSection(app, rerender),
      installSection(app),
      backupSection(app),
      h('p', { class: 'version' }, `${APP.name}　バージョン ${APP.version}`)),
    h('div', { class: 'sheet-foot' }, h('button', { class: 'btn btn-primary', onclick: () => closeSheet() }, '閉じる')));
}

function displaySection(app, rerender) {
  return section('表示',
    h('div', { class: 'quick-label' }, '文字の大きさ'),
    h('div', { class: 'seg-grid three' },
      Object.entries(FONT_SCALES).map(([k, v]) => seg(v.label, app.prefs.fontScale === k, () => {
        app.setPref('fontScale', k);
        rerender();
      }))),
    h('div', { class: 'quick-label' }, '週のはじまり'),
    h('div', { class: 'seg-grid two' },
      seg('日曜日', app.prefs.weekStart === 0, () => { app.setPref('weekStart', 0); rerender(); }),
      seg('月曜日', app.prefs.weekStart === 1, () => { app.setPref('weekStart', 1); rerender(); })));
}

function membersSection(app, rerender) {
  const members = app.members();
  return section('家族のメンバー',
    h('p', { class: 'help' }, '名前と色を変えられます（例：お子さんの名前に）。'),
    members.map((m) => memberRow(app, m, rerender)),
    h('button', {
      class: 'btn btn-soft',
      onclick: () => {
        app.addMember();
        rerender();
      },
    }, icon('plus'), 'メンバーを追加'));
}

function memberRow(app, m, rerender) {
  const palette = h('div', { class: 'palette', hidden: true },
    MEMBER_PALETTE.map((c) => h('button', {
      type: 'button',
      class: 'swatch',
      style: { '--c': c },
      'aria-label': `色 ${c}`,
      'aria-pressed': String(c.toLowerCase() === m.color.toLowerCase()),
      onclick: () => {
        app.updateMember({ ...m, color: c });
        rerender();
      },
    })));
  const nameInput = h('input', {
    type: 'text', class: 'input', value: m.name, maxlength: '12', 'aria-label': `${m.name}の名前`,
    onchange: (e) => {
      const name = e.target.value.trim();
      if (!name) {
        e.target.value = m.name;
        return;
      }
      app.updateMember({ ...m, name });
      toast('名前を変えました');
    },
  });
  return h('div', { class: 'member-edit' },
    h('div', { class: 'member-line' },
      h('button', {
        type: 'button',
        class: 'swatch big',
        style: { '--c': m.color },
        'aria-label': `${m.name}の色を変える`,
        onclick: () => { palette.hidden = !palette.hidden; },
      }),
      nameInput,
      h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `${m.name}を削除`,
        onclick: async () => {
          if (app.members().length <= 1) {
            toast('メンバーは1人以上必要です');
            return;
          }
          if (app.isMemberUsed(m.id)) {
            toast(`${m.name}の予定・やることが残っているので削除できません`, { ms: 4000 });
            return;
          }
          if (await confirmSheet(`${m.name}を削除しますか？`, { ok: '削除する', danger: true })) {
            app.deleteMember(m.id);
            rerender();
          }
        },
      }, icon('trash'))),
    palette);
}

function syncSection(app, rerender) {
  const conn = app.conn;
  const status = app.syncStatus;
  const children = [];

  if (!conn) {
    children.push(
      h('p', { class: 'help' }, '今は、この端末の中だけに保存しています。家族の端末と同じ予定を見るには、設定する人から受け取った「接続コード」を貼り付けてください。'),
    );
    const area = h('textarea', { class: 'input textarea mono', rows: '3', placeholder: 'OUCHI1: で始まる接続コード', 'aria-label': '接続コード' });
    const err = h('p', { class: 'field-err', hidden: true, role: 'alert' });
    const btn = h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        err.hidden = true;
        let parsed;
        try {
          parsed = decodeConnectionCode(area.value);
        } catch {
          err.textContent = '接続コードの形がちがうようです。もう一度コピーして貼り付けてください。';
          err.hidden = false;
          return;
        }
        btn.disabled = true;
        btn.textContent = '接続しています…';
        const result = await app.connect(parsed);
        if (result.ok) {
          toast('接続しました');
          rerender();
        } else {
          btn.disabled = false;
          btn.textContent = '接続する';
          err.textContent = syncMessage({ state: 'error', kind: result.kind });
          err.hidden = false;
        }
      },
    }, '接続する');
    children.push(area, err, btn);
  } else {
    const last = status.at ? new Date(status.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const stateText = {
      syncing: '同期しています…',
      ok: `同期できています（最後：${last}）`,
      error: syncMessage(status),
      idle: '待機中',
    }[status.state] || '';
    children.push(
      h('p', { class: `sync-state ${status.state}` }, icon(status.state === 'error' ? 'alert' : 'cloud', 'sm'), stateText),
      h('p', { class: 'help mono' }, `保存先：${conn.owner}/${conn.repo}`),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn btn-soft', onclick: async () => { await app.syncNow(); rerender(); } }, '今すぐ同期する'),
        h('button', {
          class: 'btn btn-ghost danger-text',
          onclick: async () => {
            if (await confirmSheet('接続を解除しますか？', {
              ok: '解除する', danger: true,
              detail: 'この端末の予定は残りますが、家族の端末とは同期しなくなります。',
            })) {
              app.disconnect();
              rerender();
            }
          },
        }, '接続を解除する')));
  }

  children.push(connectionCodeMaker());
  return section('同期（家族の端末と共有）', ...children);
}

function connectionCodeMaker() {
  const owner = h('input', { type: 'text', class: 'input', placeholder: 'GitHub のユーザー名', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'GitHub のユーザー名' });
  const repo = h('input', { type: 'text', class: 'input', value: 'Ouchi-Calendar-data', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'データ用リポジトリ名' });
  const token = h('input', { type: 'password', class: 'input', placeholder: 'github_pat_…', autocomplete: 'off', 'aria-label': 'トークン' });
  const out = h('textarea', { class: 'input textarea mono', rows: '3', readOnly: true, hidden: true, 'aria-label': '作った接続コード' });
  const copyBtn = h('button', {
    class: 'btn btn-soft',
    hidden: true,
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(out.value);
        toast('コピーしました');
      } catch {
        out.select();
        toast('コードを長押ししてコピーしてください');
      }
    },
  }, 'コードをコピー');
  const err = h('p', { class: 'field-err', hidden: true });
  return h('details', { class: 'maker' },
    h('summary', {}, '接続コードを作る（設定する人向け）'),
    h('p', { class: 'help' }, 'データ用の非公開リポジトリと、そのリポジトリだけに「Contents: 読み書き」を許可したトークンを用意してから入力します（手順は docs/setup.md）。'),
    h('label', { class: 'row-2' }, h('span', { class: 'row-label' }, 'ユーザー名'), owner),
    h('label', { class: 'row-2' }, h('span', { class: 'row-label' }, 'リポジトリ'), repo),
    h('label', { class: 'row-2' }, h('span', { class: 'row-label' }, 'トークン'), token),
    err,
    h('button', {
      class: 'btn btn-soft',
      onclick: () => {
        if (!owner.value.trim() || !repo.value.trim() || !token.value.trim()) {
          err.textContent = '3つとも入力してください';
          err.hidden = false;
          return;
        }
        err.hidden = true;
        out.value = encodeConnectionCode({ owner: owner.value, repo: repo.value, token: token.value });
        out.hidden = false;
        copyBtn.hidden = false;
        token.value = '';
      },
    }, '接続コードを作る'),
    out,
    copyBtn,
    h('p', { class: 'help warn' }, '接続コードはパスワードと同じです。家族以外には送らないでください。'));
}

function installSection(app) {
  if (!app.installPrompt) return null;
  return section('ホーム画面',
    h('p', { class: 'help' }, 'ホーム画面にアイコンを置くと、アプリのようにすぐ開けます。'),
    h('button', {
      class: 'btn btn-soft',
      onclick: async () => {
        const p = app.installPrompt;
        app.installPrompt = null;
        p.prompt();
        await p.userChoice.catch(() => null);
      },
    }, 'ホーム画面に追加する'));
}

function backupSection(app) {
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        app.importData(json);
        toast('読み込みました');
      } catch {
        toast('ファイルを読み込めませんでした');
      }
      e.target.value = '';
    },
  });
  return section('バックアップ',
    h('p', { class: 'help' }, '予定をファイルに保存したり、保存したファイルから戻したりできます（今の予定に追加されます）。'),
    h('div', { class: 'btn-stack' },
      h('button', { class: 'btn btn-soft', onclick: () => app.exportData() }, 'ファイルに書き出す'),
      h('button', { class: 'btn btn-soft', onclick: () => fileInput.click() }, 'ファイルから読み込む')),
    fileInput);
}
