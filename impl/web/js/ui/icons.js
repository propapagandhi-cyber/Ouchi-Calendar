// Inline SVG icons (static markup only, never user input).
const PATHS = {
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  month: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v3M16 3v3M8 13h1M11.5 13h1M15 13h1M8 16.5h1M11.5 16.5h1M15 16.5h1"/>',
  week: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v3M16 3v3M7 13.5h10M7 17h10"/>',
  day: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/><text x="12" y="18.3" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">1</text>',
  tasks: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
  memo: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2a4.5 4.5 0 0 1 5.5 4.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  trash: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 3L8 18.5z"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}
