import { state } from './state.js';

// ── NOTIFICATION MANAGER ──────────────────
const MAX_VISIBLE = 3;
const queue = [];
const active = [];
let xpGroupTimer = null;
let badgeGroupTimer = null;
let pendingXP = 0;

function ensureStack() {
  if (!document.getElementById('notification-stack')) {
    const stack = document.createElement('div');
    stack.id = 'notification-stack';
    document.body.appendChild(stack);
  }
}

export function push(notification) {
  ensureStack();
  
  // Agrupamento de XP (500ms)
  if (notification.type === 'xp') {
    pendingXP += notification.value;
    clearTimeout(xpGroupTimer);
    xpGroupTimer = setTimeout(() => {
      queue.push({ type: 'xp', value: pendingXP });
      pendingXP = 0;
      processQueue();
    }, 500);
    return;
  }
  
  // Agrupamento de badges
  if (notification.type === 'badge') {
    clearTimeout(badgeGroupTimer);
    const existing = queue.find(n => n.type === 'badges');
    if (existing) {
      existing.badges.push(notification.badge);
    } else {
      queue.push({ type: 'badges', badges: [notification.badge] });
    }
    badgeGroupTimer = setTimeout(() => processQueue(), 300);
    return;
  }
  
  queue.push(notification);
  processQueue();
}

function processQueue() {
  while (active.length < MAX_VISIBLE && queue.length > 0) {
    const notif = queue.shift();
    render(notif);
  }
}

function render(notif) {
  const stack = document.getElementById('notification-stack');
  const card = document.createElement('div');
  card.className = 'notification-card';
  
  if (notif.type === 'xp') {
    card.innerHTML = `<div class="notif-xp">+${notif.value} XP ✦</div>`;
  } else if (notif.type === 'level') {
    card.innerHTML = `<div class="notif-level">🎉 Nível ${notif.level}!</div>`;
  } else if (notif.type === 'badges') {
    const count = notif.badges.length;
    if (count === 1) {
      const b = notif.badges[0];
      card.innerHTML = `<div class="notif-badge"><span>${b.icon}</span> ${b.name}</div>`;
    } else {
      card.innerHTML = `<div class="notif-badge">🏆 ${count} badges desbloqueadas!</div>`;
    }
  }
  
  stack.appendChild(card);
  active.push({ notif, card });
  
  const duration = notif.type === 'badges' ? 5000 : 3000;
  setTimeout(() => {
    card.classList.add('notif-exit');
    setTimeout(() => {
      card.remove();
      const index = active.findIndex(n => n.card === card);
      if (index !== -1) active.splice(index, 1);
      processQueue();
    }, 300);
  }, duration);
}
