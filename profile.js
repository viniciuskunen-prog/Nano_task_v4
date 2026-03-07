import { sb } from './config.js';
import { state } from './state.js';
import { loadUserBadges } from './badges.js';
import { getLevelFromXP } from './xp.js';

// ── PROFILE STATE ──────────────────────────
export const profileState = {
  userBadges: [],
  activityHistory: []
};

// ── CALCULAR ESTATÍSTICAS ──────────────────
function calcStats() {
  const tasksCompleted = state.tasks.filter(t => t.done).length;
  
  const totalSeconds = state.tasks.reduce((acc, t) => acc + (t.time_spent || 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const focusedTime = hours > 0 ? `${hours}h` : '<1h';
  
  const pomodorosCompleted = state.profile.pomo_sessions || 0;
  
  const currentStreak = calculateStreak();
  
  return {
    tasksCompleted,
    focusedTime,
    pomodorosCompleted,
    currentStreak: `${currentStreak}d`
  };
}

function calculateStreak() {
  const completed = state.tasks
    .filter(t => t.done && t.completed_at)
    .map(t => new Date(t.completed_at).toISOString().split('T')[0]);
  const dates = [...new Set(completed)].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let checkDate = today;
  for (const date of dates) {
    if (date === checkDate) {
      streak++;
      checkDate = new Date(new Date(date).getTime() - 864e5)
        .toISOString()
        .split('T')[0];
    } else {
      break;
    }
  }
  return streak;
}

// ── CARREGAR DADOS DO PERFIL ───────────────
export async function loadProfileData() {
  try {
    // Carregar badges do usuário
    profileState.userBadges = await loadUserBadges();
    
    // Carregar histórico de atividade recente (xp_events como fonte única)
    const { data: events } = await sb.from('xp_events')
      .select('type, points, created_at')
      .eq('user_id', state.currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    profileState.activityHistory = events || [];
  } catch (e) {
    console.error('[profile] erro ao carregar dados:', e);
  }
}

// ── ABRIR MODAL DE PERFIL ──────────────────
export async function openProfile() {
  await loadProfileData();
  
  const overlay = document.getElementById('profile-overlay');
  if (!overlay) return;
  
  // Preencher dados do usuário
  const meta = state.currentUser.user_metadata || {};
  const name = meta.full_name || meta.name || state.currentUser.email.split('@')[0];
  const avatarEl = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-user-name');
  const emailEl = document.getElementById('profile-user-email');
  
  // Renderizar avatar (imagem ou inicial)
  if (avatarEl) {
    if (state.profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${state.profile.avatar_url}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }
  }
  
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = state.currentUser.email;
  
  const xpInfo = getLevelFromXP(state.profile.xp_total || 0);
  const badgeNames = await fetchBadgeNames();
  
  // Renderizar conteúdo
  renderProfileContent(xpInfo, badgeNames);
  
  // Setup para upload de avatar
  setupAvatarUpload(avatarEl, name);
  
  // Abrir overlay
  overlay.classList.add('open');
}

export function closeProfile() {
  const overlay = document.getElementById('profile-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ── RENDERIZAR CONTEÚDO DO PERFIL ─────────
async function renderProfileContent(xpInfo, badgeNames) {
  const content = document.getElementById('profile-content');
  if (!content) return;
  
  // Seção de XP e Nível
  const xpSection = `
    <div class="profile-section">
      <div class="profile-section-title">Progressão</div>
      
      <div class="xp-card">
        <div class="xp-header">
          <span class="xp-level">Nível <span class="xp-level-val">${xpInfo.level}</span></span>
          <span class="xp-total">${state.profile.xp_total || 0} XP</span>
        </div>
        
        <div class="xp-bar-wrap">
          <div class="xp-bar">
            <div class="xp-fill" style="width: ${xpInfo.progressPercent}%"></div>
          </div>
          <div class="xp-label">${xpInfo.progressPercent}%</div>
        </div>
        
        <div class="xp-info">
          <span class="xp-needed">+${xpInfo.xpNextLevel - xpInfo.xpCurrentLevel} XP para nível ${xpInfo.level + 1}</span>
          <span class="xp-calc">${xpInfo.xpCurrentLevel} / ${xpInfo.xpNextLevel} XP</span>
        </div>
      </div>
    </div>
  `;
  
  // Seção de Badges
  // allBadges = lista completa de badge_definitions
  // unlockedSlugs = badges desbloqueadas do usuário (de user_badges)
  const allBadges = Object.entries(badgeNames);
  const unlockedSlugs = profileState.userBadges.map(b => b.slug);
  
  const badgesHTML = allBadges.map(([slug, info]) => {
    const isUnlocked = unlockedSlugs.includes(slug);
    const lockedClass = isUnlocked ? '' : 'locked';
    
    return `
      <div class="badge-item ${lockedClass}" title="${isUnlocked ? info.name : '?'}">
        <div class="badge-item-icon">${isUnlocked ? info.icon : '?'}</div>
        <div class="badge-item-name">${isUnlocked ? info.name : 'Bloqueada'}</div>
        ${isUnlocked ? `<div class="badge-item-rarity ${info.rarity}"></div>` : ''}
      </div>
    `;
  }).join('');
  
  const badgesSection = `
    <div class="profile-section">
      <div class="profile-section-title">Badges (${unlockedSlugs.length}/${allBadges.length})</div>
      <div class="badges-grid">${badgesHTML}</div>
    </div>
  `;
  
  // Seção de Histórico de XP
  const historyHTML = profileState.activityHistory.length 
    ? profileState.activityHistory.map(evt => {
        const date = new Date(evt.created_at);
        const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const typeLabel = formatEventType(evt.type);
        return `
          <div class="history-item">
            <span class="history-type">${typeLabel}</span>
            <span class="history-time">${time}</span>
            <span class="history-points">+${evt.points} XP</span>
          </div>
        `;
      }).join('')
    : '<div class="history-empty">Sem eventos recentes</div>';
  
  const historySection = `
    <div class="profile-section">
      <div class="profile-section-title">Histórico Recente</div>
      <div class="history-list">${historyHTML}</div>
    </div>
  `;
  
  // Seção de Estatísticas
  const stats = calcStats();
  const statsSection = `
    <div class="profile-section">
      <div class="profile-section-title">Estatísticas</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${stats.tasksCompleted}</div>
          <div class="stat-label">Tarefas concluídas</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.pomodorosCompleted}</div>
          <div class="stat-label">Pomodoros feitos</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.focusedTime}</div>
          <div class="stat-label">Tempo focado</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.currentStreak}</div>
          <div class="stat-label">Streak atual</div>
        </div>
      </div>
    </div>
  `;
  
  content.innerHTML = xpSection + statsSection + badgesSection + historySection;
}

// ── HELPERS ────────────────────────────────
// Fetch todas as badges disponíveis de badge_definitions
async function fetchBadgeNames() {
  try {
    // Consulta badge_definitions para obter lista completa
    const { data } = await sb.from('badge_definitions').select('slug, name, icon, rarity');
    
    // Criar map por slug para fácil lookup: { slug: { name, icon, rarity } }
    const map = {};
    data?.forEach(b => {
      map[b.slug] = { name: b.name, icon: b.icon, rarity: b.rarity };
    });
    return map;
  } catch (e) {
    console.error('[profile] erro ao carregar badges:', e);
    return {};
  }
}

function formatEventType(type) {
  const types = {
    'task_complete': 'Tarefa Concluída',
    'task_on_time': 'Tarefa no Prazo',
    'subtask_complete': 'Subtarefa Concluída',
    'pomodoro_complete': 'Pomodoro Concluído',
    // Fallback para tipos antigos (compatibilidade)
    'task_completed': 'Tarefa Concluída',
    'subtask_completed': 'Subtarefa Concluída',
    'pomodoro_finished': 'Pomodoro Concluído'
  };
  return types[type] || type;
}

// ── AVATAR UPLOAD ──────────────────────────
function setupAvatarUpload(avatarEl, name) {
  // Remover listener anterior se existir
  if (avatarEl._uploadListener) {
    avatarEl.removeEventListener('click', avatarEl._uploadListener);
  }
  
  avatarEl._uploadListener = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) uploadAvatar(file, avatarEl, name);
    };
    input.click();
  };
  
  avatarEl.style.cursor = 'pointer';
  avatarEl.addEventListener('click', avatarEl._uploadListener);
}

async function uploadAvatar(file, avatarEl, name) {
  try {
    // Validação de tamanho (2MB)
    if (file.size > 2 * 1024 * 1024) {
      console.warn('[profile] arquivo maior que 2MB');
      return;
    }

    // Validação de tipo (apenas imagens)
    if (!file.type.startsWith('image/')) {
      console.warn('[profile] arquivo não é imagem');
      return;
    }

    const userId = state.currentUser.id;
    const fileName = `${userId}.png`;
    
    // Upload para Supabase Storage
    const { data, error } = await sb.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });
    
    if (error) throw error;
    
    // Gerar URL pública
    const { data: { publicUrl } } = sb.storage
      .from('avatars')
      .getPublicUrl(fileName);
    
    // Salvar URL em profiles
    await sb.from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);
    
    // Atualizar estado local
    state.profile.avatar_url = publicUrl;
    
    // Renderizar novo avatar no modal
    avatarEl.innerHTML = `<img src="${publicUrl}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;

    // Atualizar avatar na sidebar também
    const sidebarAvatar = document.getElementById('user-avatar');
    if (sidebarAvatar) {
      sidebarAvatar.innerHTML = `<img src="${publicUrl}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
  } catch (e) {
    console.error('[profile] erro ao upload avatar:', e);
  }
}
