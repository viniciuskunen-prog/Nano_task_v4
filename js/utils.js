import { state } from './state.js';

// ── DATE HELPERS ──────────────────────────────────────────
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const tomorrowStr = () => {
  const d = new Date(Date.now() + 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const weekStr = () => {
  const d = new Date(Date.now() + 7 * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

export function fmtDate(d) {
  if (!d) return '';
  if (d === todayStr()) return 'Hoje';
  if (d === tomorrowStr()) return 'Amanhã';
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

export function dateStatus(d) {
  if (!d) return '';
  const today = todayStr();
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  const soon = new Date(); soon.setDate(soon.getDate() + 3);
  const soonStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
  if (d <= soonStr) return 'soon';
  return '';
}

// ── TAG HELPERS ───────────────────────────────────────────
export function tagColor(name) {
  const [groupPart] = name.includes(':') ? name.split(':') : [name];
  for (const g of state.groups) {
    if (g.name === groupPart) return g.color;
    if ((g.children || []).includes(groupPart)) return g.color + 'cc';
  }
  return '#6b6b88';
}

// ── TIMER ─────────────────────────────────────────────────
export function formatTimer(s) {
  if (!s || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── REPORT HELPERS ────────────────────────────────────────
export function businessHours(start, end) {
  if (!start || !end) return 0;
  const ws = parseInt((state.profile.work_start || '09:00').split(':')[0]);
  const we = parseInt((state.profile.work_end || '18:00').split(':')[0]);
  const wd = state.profile.work_days || [1, 2, 3, 4, 5];
  let hours = 0;
  let cur = new Date(start);
  const endDate = new Date(end);
  if (isNaN(cur) || isNaN(endDate) || endDate <= cur) return 0;
  let iter = 0;
  while (cur < endDate && iter++ < 366) {
    if (wd.includes(cur.getDay())) {
      const ds = new Date(cur); ds.setHours(ws, 0, 0, 0);
      const de = new Date(cur); de.setHours(we, 0, 0, 0);
      const s = Math.max(cur, ds), e = Math.min(endDate, de);
      if (e > s) hours += (e - s) / 3600000;
    }
    cur = new Date(cur); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return Math.round(hours * 10) / 10;
}

export function fmtHours(h) {
  if (h === 0) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  return `${h}h`;
}

export function getWeeksOfMonth(y, m) {
  const weeks = [];
  const last = new Date(y, m + 1, 0);
  let cur = new Date(y, m, 1);
  while (cur <= last) {
    const wStart = new Date(cur);
    const wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
    if (wEnd > last) wEnd.setTime(last.getTime());
    weeks.push({ start: new Date(wStart), end: new Date(wEnd) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ── TOAST ─────────────────────────────────────────────────
let toastTimeout;
export function toast(msg, icon = 'check-circle', action = null) {
  const el = document.getElementById('toast');
  if (!el) return;

  clearTimeout(toastTimeout);
  
  el.innerHTML = `<span><i data-lucide="${escapeHTML(icon)}"></i></span> ${escapeHTML(msg)}`;
  
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.onclick = (e) => {
      e.stopPropagation();
      action.callback();
      el.classList.remove('show');
    };
    el.appendChild(btn);
  }

  el.classList.add('show');
  if (window.lucide) window.lucide.createIcons();
  
  toastTimeout = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
}
