import { state } from './state.js';
import { saveTaskTime, logActivity } from './tasks.js';
import { formatTimer, toast } from './utils.js';
import { awardXP } from './xp.js';
import { checkBadges } from './badges.js';

const POMO_CIRC = 213.6;

// ── TIMER STATE ───────────────────────────────────────────
export const timerState = JSON.parse(
  localStorage.getItem('timerState') ||
  '{"taskId":null,"running":false,"startedAt":null,"elapsed":0}'
);

let timerInterval = null;

// ── POMODORO STATE ────────────────────────────────────────
export const pomodoroState = JSON.parse(
  localStorage.getItem('pomodoroState') ||
  '{"mode":"work","duration":1500,"remaining":1500,"running":false,"linkedTaskId":null,"sessions":0}'
);

// Daily stats — reset when day changes
function getTodayKey() { return new Date().toISOString().split('T')[0]; }
function getDailyStats() {
  const raw = JSON.parse(localStorage.getItem('pomoDaily') || '{}');
  if (raw.date !== getTodayKey()) return { date: getTodayKey(), pomos: 0, breaks: 0, byTask: {} };
  return raw;
}
function saveDailyStats(s) { localStorage.setItem('pomoDaily', JSON.stringify(s)); }
export function getDailyStatsPublic() { return getDailyStats(); }

// Pause pomodoro on reload — never auto-resume
if (pomodoroState.running) {
  pomodoroState.running = false;
  savePomodoroState();
}

let pomodoroInterval = null;

// ── POMODORO CONTROLS ─────────────────────────────────────
export function pomodoroToggle() {
  if (pomodoroState.running) {
    pomodoroState.running = false;
    clearInterval(pomodoroInterval); pomodoroInterval = null;
    // Pause linked task timer too
    if (pomodoroState.linkedTaskId && timerState.taskId === pomodoroState.linkedTaskId && timerState.running) {
      timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
      timerState.running = false; timerState.startedAt = null;
      saveTimerState();
    }
  } else {
    startPomodoro();
  }
  updatePomodoroUI();
  savePomodoroState();
}

export function startPomodoro() {
  if (pomodoroState.running) return;

  // Validar tarefa vinculada antes de iniciar
  if (pomodoroState.linkedTaskId) {
    const linkedTask = state.tasks.find(t => t.id === pomodoroState.linkedTaskId);
    if (!linkedTask || linkedTask.done) {
      pomodoroReset();
      unlinkTask();
      return;
    }
  }

  pomodoroState.running = true;
  pomodoroInterval = setInterval(pomodoroTick, 1000);

  // Start linked task timer too
  if (pomodoroState.linkedTaskId) {
    const id = pomodoroState.linkedTaskId;
    if (timerState.taskId !== id) {
      const t = state.tasks.find(t => t.id === id);
      timerState.taskId = id;
      timerState.elapsed = t?.time_spent || 0;
    }
    timerState.running = true;
    timerState.startedAt = Date.now();
    saveTimerState();
    startTimerTick();
  }
}

export function pomodoroReset() {
  clearInterval(pomodoroInterval); pomodoroInterval = null;
  pomodoroState.running = false;
  pomodoroState.mode = 'work';
  pomodoroState.duration = getPomoDuration();
  pomodoroState.remaining = pomodoroState.duration;
  // Pause linked task timer on reset
  if (timerState.running && timerState.taskId === pomodoroState.linkedTaskId) {
    timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
    timerState.running = false; timerState.startedAt = null;
    saveTimerState();
  }
  updatePomodoroUI();
  savePomodoroState();
}

export function pomodoroSkip() {
  pomodoroComplete();
}

export function stopPomodoro() {
  pomodoroState.running = false;
  clearInterval(pomodoroInterval); pomodoroInterval = null;
  if (timerState.running && timerState.taskId === pomodoroState.linkedTaskId) {
    timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
    timerState.running = false; timerState.startedAt = null;
    saveTimerState();
  }
  updatePomodoroUI();
  savePomodoroState();
}

export function unlinkTask() {
  pomodoroState.linkedTaskId = null;
  updatePomodoroUI();
  savePomodoroState();
}

function pomodoroTick() {
  if (pomodoroState.remaining <= 0) { pomodoroComplete(); return; }
  pomodoroState.remaining--;
  updatePomodoroUI();
  savePomodoroState();
}

async function pomodoroComplete() {
  clearInterval(pomodoroInterval); pomodoroInterval = null;
  pomodoroState.running = false;

  // Validação: Pomodoro só é válido se pelo menos 90% do tempo foi realmente executado
  // Evita farming de XP (Fase 3) e garante que sessões de foco sejam reais
  const elapsed = pomodoroState.duration - pomodoroState.remaining;
  const minValidTime = pomodoroState.duration * 0.9;
  if (elapsed < minValidTime) {
    // Tempo insuficiente: cancelar conclusão e apenas resetar o Pomodoro
    pomodoroReset();
    return;
  }

  playSound('pomo_done');

  // Conceder XP ao concluir pomodoro válido
  if (pomodoroState.linkedTaskId) {
    await awardXP('pomodoro_complete', pomodoroState.linkedTaskId);
  }

  if (pomodoroState.mode === 'work') {
    pomodoroState.sessions++;
    
    // Registrar atividade e conceder XP
    await logActivity('pomodoro_finished', 1); // pomodoro_complete = 1 XP
    
    // Verificar badges de pomodoro (após atualizar contador)
    await checkBadges('pomodoro_complete');
    stopLinkedTaskTimer();
    toast('Pomodoro concluído! 🍅');
    sendNotification('Pomodoro concluído!', 'Hora de descansar.');
    // Update daily stats
    const ds = getDailyStats();
    ds.pomos++;
    if (pomodoroState.linkedTaskId) {
      ds.byTask[pomodoroState.linkedTaskId] = (ds.byTask[pomodoroState.linkedTaskId] || 0) + 1;
    }
    saveDailyStats(ds);
    updatePomoStats();
    const longBreak = pomodoroState.sessions % 4 === 0;
    pomodoroState.mode = longBreak ? 'long_break' : 'short_break';
    pomodoroState.duration = getBreakDuration(longBreak);
  } else {
    toast('Pausa finalizada! Foco! ✦');
    sendNotification('Pausa finalizada!', 'Hora de focar.');
    const ds2 = getDailyStats(); ds2.breaks++; saveDailyStats(ds2); updatePomoStats();
    pomodoroState.mode = 'work';
    pomodoroState.duration = getPomoDuration();
  }

  pomodoroState.remaining = pomodoroState.duration;
  updatePomodoroUI();
  savePomodoroState();
}

function stopLinkedTaskTimer() {
  if (!pomodoroState.linkedTaskId) return;
  if (timerState.taskId !== pomodoroState.linkedTaskId || !timerState.running) return;

  timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
  timerState.running = false;
  timerState.startedAt = null;
  clearInterval(timerInterval);
  timerInterval = null;

  const t = state.tasks.find(task => task.id === timerState.taskId);
  if (t) {
    t.time_spent = timerState.elapsed;
    saveTaskTime(t.id, t.time_spent);
  }

  const timerBtn = document.querySelector(`#task-${timerState.taskId} .task-timer-btn`);
  if (timerBtn) {
    timerBtn.className = 'task-timer-btn';
    timerBtn.innerHTML = `⏱ ${formatTimer(timerState.elapsed)}`;
  }

  saveTimerState();
}

export function unlinkPomodoro() {
  pomodoroState.linkedTaskId = null;
  savePomodoroState();
  updatePomodoroLinked();
}

// ── POMODORO UI ───────────────────────────────────────────
export function updatePomodoroUI() {
  const { remaining, duration, mode, running } = pomodoroState;
  const m = Math.floor(remaining / 60), s = remaining % 60;

  const timeEl = document.getElementById('pomo-time');
  if (timeEl) timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const fillEl = document.getElementById('pomo-progress');
  if (fillEl) {
    fillEl.style.strokeDashoffset = POMO_CIRC * (1 - (duration > 0 ? remaining / duration : 0));
    fillEl.className.baseVal = mode === 'work' ? 'pomo-fill' : 'pomo-fill break';
  }

  const badge = document.getElementById('pomo-mode-badge');
  if (badge) {
    badge.textContent = mode === 'work' ? 'Foco' : mode === 'long_break' ? 'Pausa longa' : 'Pausa';
    badge.className = 'pomo-mode-badge' + (mode !== 'work' ? ' break' : '');
  }

  const playBtn = document.getElementById('pomo-play-btn');
  if (playBtn) { playBtn.textContent = running ? '⏸' : '▶'; playBtn.classList.toggle('active', running); }
}

export function updatePomodoroLinked() {
  const el = document.getElementById('pomo-linked-task');
  if (!el) return;
  if (pomodoroState.linkedTaskId) {
    const t = state.tasks.find(t => t.id === pomodoroState.linkedTaskId);
    // Se tarefa foi deletada ou não existe mais, desvincular
    if (!t && pomodoroState.linkedTaskId) {
      unlinkTask();
      return;
    }
    const title = t ? t.title.substring(0, 26) + (t.title.length > 26 ? '…' : '') : '';
    el.textContent = t ? `◎ ${title}` : '— sem tarefa vinculada';
  } else {
    el.textContent = '— sem tarefa vinculada';
  }
  updatePomoStats();
}

export function updatePomoStats() {
  const ds = getDailyStats();
  const todayEl = document.getElementById('pomo-count-today');
  const breaksEl = document.getElementById('pomo-breaks-today');
  const taskEl = document.getElementById('pomo-count-task');
  const taskStatEl = document.getElementById('pomo-task-stat');
  if (todayEl) todayEl.textContent = ds.pomos;
  if (breaksEl) breaksEl.textContent = ds.breaks;
  if (taskEl && taskStatEl) {
    const linked = pomodoroState.linkedTaskId;
    if (linked && ds.byTask[linked]) {
      taskEl.textContent = ds.byTask[linked];
      taskStatEl.classList.remove('hidden');
    } else {
      taskStatEl.classList.add('hidden');
    }
  }
}

// ── TASK TIMER ────────────────────────────────────────────
export function toggleTimer(taskId) {
  if (timerState.taskId === taskId && timerState.running) {
    // Pause
    timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
    timerState.running = false; timerState.startedAt = null;
    clearInterval(timerInterval); timerInterval = null;
    saveTimerState();
    const el = document.querySelector(`#task-${taskId} .task-timer-btn`);
    if (el) { el.className = 'task-timer-btn'; el.innerHTML = `⏱ ${formatTimer(timerState.elapsed)}`; }
  } else {
    // Switch task if needed
    if (timerState.taskId && timerState.taskId !== taskId && timerState.running) {
      timerState.elapsed += Math.floor((Date.now() - timerState.startedAt) / 1000);
      saveTaskTime(timerState.taskId, timerState.elapsed);
    }
    if (timerState.taskId !== taskId) {
      const t = state.tasks.find(t => t.id === taskId);
      timerState.taskId = taskId;
      timerState.elapsed = t?.time_spent || 0;
    }
    timerState.running = true;
    timerState.startedAt = Date.now();

    // Auto-link to pomodoro
    if (!pomodoroState.linkedTaskId) { pomodoroState.linkedTaskId = taskId; updatePomodoroLinked(); }

    saveTimerState();
    startTimerTick();
    const el = document.querySelector(`#task-${taskId} .task-timer-btn`);
    if (el) el.className = 'task-timer-btn running';
  }
}

function startTimerTick() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!timerState.running || !timerState.taskId) return;
    const el = document.querySelector(`#task-${timerState.taskId} .task-timer-btn`);
    if (el) {
      const elapsed = timerState.elapsed + Math.floor((Date.now() - timerState.startedAt) / 1000);
      el.innerHTML = `⏸ ${formatTimer(elapsed)}`;
    }
  }, 1000);
}

function saveTimerState() {
  localStorage.setItem('timerState', JSON.stringify(timerState));
}

// Resume tick if timer was running on page load
if (timerState.running && timerState.taskId) startTimerTick();

// ── HELPERS ───────────────────────────────────────────────
function getPomoDuration() { return (parseInt(state.profile.pomo_duration) || 25) * 60; }
function getBreakDuration(long) {
  return long ? (parseInt(state.profile.break_long_duration) || 15) * 60
              : (parseInt(state.profile.break_duration) || 5) * 60;
}

function savePomodoroState() {
  localStorage.setItem('pomodoroState', JSON.stringify(pomodoroState));
}

// ── AUDIO ─────────────────────────────────────────────────
export function playSound(type) {
  if (state.profile.sound_enabled === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'check' ? [[0, 660], [0.1, 880]] : [[0, 528], [0.2, 528], [0.4, 528]];
    notes.forEach(([t, freq]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.2, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch (_) {}
}

// ── NOTIFICATIONS ─────────────────────────────────────────
export function requestNotifPerm() {
  if (!('Notification' in window)) { toast('Browser não suporta notificações', '⚠'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? 'Notificações ativadas ✦' : 'Permissão negada', p === 'granted' ? '✦' : '⚠');
    updateNotifBtn();
  });
}

export function updateNotifBtn() {
  const btn = document.getElementById('notif-perm-btn');
  if (!btn || !('Notification' in window)) return;
  const p = Notification.permission;
  btn.textContent = p === 'granted' ? '✓ Notificações ativas' : p === 'denied' ? '✕ Bloqueado no browser' : 'Ativar notificações';
  btn.disabled = p === 'denied';
}

function sendNotification(title, body) {
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/favicon.ico' }); } catch (_) {}
}
