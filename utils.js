import { state } from './state.js';

// ── DATE HELPERS ──────────────────────────────────────────
export const todayStr    = () => new Date().toISOString().split('T')[0];
export const tomorrowStr = () => new Date(Date.now() + 864e5).toISOString().split('T')[0];
export const weekStr     = () => new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];

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
  if (d <= new Date(Date.now() + 3 * 864e5).toISOString().split('T')[0]) return 'soon';
  return '';
}

// ── TAG HELPERS ───────────────────────────────────────────
export function tagColor(name) {
  for (const g of state.groups) {
    if (g.name === name) return g.color;
    if ((g.children || []).includes(name)) return g.color + 'cc';
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
  const we = parseInt((state.profile.work_end   || '18:00').split(':')[0]);
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

export function calculateStreak(tasks = state.tasks) {
  const completedDates = tasks
    .filter(t => t.done && t.completed_at)
    .map(t => new Date(t.completed_at).toISOString().split('T')[0]);

  const dates = [...new Set(completedDates)].sort().reverse();
  let streak = 0;
  let checkDate = new Date().toISOString().split('T')[0];

  for (const date of dates) {
    if (date !== checkDate) break;
    streak++;
    checkDate = new Date(new Date(date).getTime() - 864e5).toISOString().split('T')[0];
  }

  return streak;
}

// ── TOAST ─────────────────────────────────────────────────
export function toast(msg, icon = '✦') {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
