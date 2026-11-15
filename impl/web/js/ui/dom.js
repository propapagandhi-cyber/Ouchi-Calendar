// Small DOM helpers: element builder, bottom sheets wired to the Back button, toasts.
import { UI } from '../config.js';

/** Create an element. props: class, style(obj), dataset, on<Event>, aria-*, and properties. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'readOnly'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// ---- sheets ----
// Each open sheet pushes one history entry so Android "Back" closes the top sheet only.

const stack = [];
let pendingClose = [];

export function sheetDepth() {
  return stack.length;
}

/**
 * Open a sheet. build(entry) returns the content node.
 * entry.replace(node, {full}) swaps content without touching history.
 */
export function openSheet(build, { full = false, label = '', onClose = null, dismissable = true } = {}) {
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const layer = h('div', { class: 'sheet-layer' }, backdrop, panel);
  const entry = {
    layer,
    panel,
    onClose,
    dismissable,
    replace(node, opts = {}) {
      if ('full' in opts) layer.classList.toggle('full', !!opts.full);
      if ('dismissable' in opts) entry.dismissable = opts.dismissable;
      panel.replaceChildren(node);
      panel.scrollTop = 0;
    },
  };
  layer.classList.toggle('full', full);
  backdrop.addEventListener('click', () => {
    if (entry.dismissable && stack.at(-1) === entry) closeSheet();
  });
  stack.push(entry);
  history.pushState({ sheet: stack.length }, '');
  document.body.append(layer);
  document.body.classList.add('sheet-open');
  entry.replace(build(entry));
  requestAnimationFrame(() => layer.classList.add('open'));
  return entry;
}

/** Close the top n sheets. Resolves after the DOM is updated. */
export function closeSheet(n = 1) {
  const count = Math.min(n, stack.length);
  if (!count) return Promise.resolve();
  return new Promise((resolve) => {
    pendingClose.push(resolve);
    history.go(-count);
  });
}

function removeEntry(entry) {
  entry.layer.classList.remove('open');
  entry.layer.classList.add('closing');
  setTimeout(() => entry.layer.remove(), 220);
  try {
    entry.onClose?.();
  } catch (e) {
    console.error(e);
  }
}

window.addEventListener('popstate', (ev) => {
  const depth = ev.state?.sheet || 0;
  while (stack.length > depth) removeEntry(stack.pop());
  if (!stack.length) document.body.classList.remove('sheet-open');
  const waiters = pendingClose;
  pendingClose = [];
  waiters.forEach((r) => r());
});

// A reload while a sheet was open leaves a stale history entry: reset it.
if (history.state?.sheet) history.replaceState({ sheet: 0 }, '');

/** Ask a yes/no question in a sheet. Resolves true/false. */
export function confirmSheet(message, { ok = 'はい', cancel = 'やめる', danger = false, detail = '' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => {
      if (answered) return;
      answered = true;
      closeSheet().then(() => resolve(v));
    };
    openSheet(
      () =>
        h('div', { class: 'sheet-body' },
          h('p', { class: 'confirm-msg' }, message),
          detail ? h('p', { class: 'confirm-detail' }, detail) : null,
          h('div', { class: 'btn-stack' },
            h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => answer(true) }, ok),
            h('button', { class: 'btn btn-ghost', onclick: () => answer(false) }, cancel),
          ),
        ),
      { label: message, onClose: () => { if (!answered) { answered = true; resolve(false); } } },
    );
  });
}

// ---- toast ----

let toastTimer = null;

export function toast(message, { actionLabel = '', onAction = null, ms } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  const children = [h('span', { class: 'toast-msg' }, message)];
  if (actionLabel && onAction) {
    children.push(
      h('button', {
        class: 'toast-action',
        onclick: () => {
          hideToast();
          onAction();
        },
      }, actionLabel),
    );
  }
  el.replaceChildren(...children);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms ?? (onAction ? UI.undoMs : UI.toastMs));
}

export function hideToast() {
  document.getElementById('toast')?.classList.remove('show');
}
