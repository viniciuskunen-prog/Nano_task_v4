import { sb } from './config.js';
import { state } from './state.js';
import { push as pushNotification } from './notifications.js';
import { calculateStreak } from './utils.js';

// ── BADGE ENGINE ──────────────────────────
// Detecta condições e desbloqueia badges
// Chamada após eventos significativos: task_complete, pomodoro_complete, level_up

export async function checkBadges(triggerType, context = {}) {
  if (!state.currentUser) return;
  
  switch (triggerType) {
    case 'task_complete':
      await checkMilestones();
      await checkProductivity();
      await checkPunctuality();
      await checkStreaks();
      await checkTagMaster();
      break;
    case 'subtask_complete':
      await checkSubtaskArchitect();
      break;
    case 'pomodoro_complete':
      await checkPomodoro();
      await checkStreaks();
      break;
    case 'level_up':
      await checkLevels(context.newLevel);
      break;
  }
}

// ── HELPER: Desbloquear Badge ──────────────
// badge_id em user_badges referencia slug em badge_definitions
async function unlockBadge(slug) {
  try {
    await sb.from('user_badges').insert({
      user_id: state.currentUser.id,
      badge_id: slug,  // Referencia badge_definitions(slug)
      unlocked_at: new Date().toISOString()
    });
    
    // Buscar detalhes da badge para notificação
    const { data: badgeInfo } = await sb.from('badge_definitions')
      .select('name, description, icon, rarity')
      .eq('slug', slug)
      .single();
    
    if (badgeInfo) {
      pushNotification({
        type: 'badge',
        badge: badgeInfo
      });
    }
  } catch (e) {
    // Silencioso se badge já existe (unique constraint)
  }
}

// ── MILESTONES ────────────────────────────
async function checkMilestones() {
  const completed = state.tasks.filter(t => t.done).length;
  
  if (completed === 1) {
    await unlockBadge('first_task');
  }
}

// ── PRODUCTIVITY: Volume de Tarefas ───────
async function checkProductivity() {
  const completed = state.tasks.filter(t => t.done).length;
  
  if (completed >= 50) {
    await unlockBadge('complete_50');
  }
  if (completed >= 250) {
    await unlockBadge('complete_250');
  }
  if (completed >= 1000) {
    await unlockBadge('complete_1000');
  }
}

// ── PUNCTUALITY: No Prazo ────────────────
async function checkPunctuality() {
  const onTime = state.tasks.filter(t => t.done && t.date && new Date(t.completed_at).toISOString().split('T')[0] <= t.date).length;
  
  if (onTime >= 50) {
    await unlockBadge('on_time_50');
  }
  if (onTime >= 200) {
    await unlockBadge('on_time_200');
  }
}

// ── POMODORO ─────────────────────────────
async function checkPomodoro() {
  const { data: events } = await sb.from('xp_events')
    .select('id')
    .eq('user_id', state.currentUser.id)
    .eq('type', 'pomodoro_complete');
  
  const count = events?.length || 0;
  
  if (count >= 50) {
    await unlockBadge('pomo_50');
  }
  if (count >= 200) {
    await unlockBadge('pomo_200');
  }
  if (count >= 1000) {
    await unlockBadge('pomo_1000');
  }
}

// ── STREAK: Dias Consecutivos ────────────
async function checkStreaks() {
  const streak = calculateStreak();
  
  if (streak >= 7) {
    await unlockBadge('streak_7');
  }
  if (streak >= 30) {
    await unlockBadge('streak_30');
  }
  if (streak >= 100) {
    await unlockBadge('streak_100');
  }
}

// ── SUBTASKS ──────────────────────────────
async function checkSubtaskArchitect() {
  const taskWithMultipleSubs = state.tasks.filter(t => (t.subtasks || []).length >= 5 && t.done);
  
  if (taskWithMultipleSubs.length >= 100) {
    await unlockBadge('subtask_architect');
  }
}

// ── TAG MASTER ─────────────────────────────
export async function checkTagMaster() {
  if (state.groups.length >= 10) {
    await unlockBadge('tag_master');
  }
}

// ── LEVELS ────────────────────────────────
async function checkLevels(newLevel) {
  if (newLevel >= 10) {
    await unlockBadge('level_10');
  }
  if (newLevel >= 25) {
    await unlockBadge('level_25');
  }
  if (newLevel >= 50) {
    await unlockBadge('level_50');
  }
}

// ── LOAD BADGES ────────────────────────────
// Carrega badges desbloqueadas do usuário
// badge_id em user_badges referencia slug em badge_definitions
export async function loadUserBadges() {
  try {
    const { data } = await sb.from('user_badges')
      .select('badge_id, unlocked_at')
      .eq('user_id', state.currentUser.id)
      .order('unlocked_at', { ascending: false });
    
    // Retornar com propriedade 'slug' para manter compatibilidade
    return (data || []).map(b => ({
      slug: b.badge_id,  // badge_id = slug de badge_definitions
      unlocked_at: b.unlocked_at
    }));
  } catch (e) {
    console.error('[badges] erro ao carregar:', e);
    return [];
  }
}
