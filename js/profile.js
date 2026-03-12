import { sb } from './config.js';
import { state } from './state.js';
import { loadUserBadges, checkBadges } from './badges.js';
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

    // Sincronizar badges (catch-up para badges antigas ou critérios já atingidos)
    await checkBadges('sync');

    // Recarregar após sync para garantir que a UI mostre as novas badges
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
  // Priorizar nome salvo na tabela 'profiles', fallback para metadata
  const name = state.profile.full_name || meta.full_name || meta.name || state.currentUser.email.split('@')[0];

  const avatarEl = document.getElementById('profile-avatar');
  const nameEl = document.getElementById('profile-user-name');
  const emailEl = document.getElementById('profile-user-email');

  // Renderizar avatar (imagem ou inicial)
  renderAvatar(avatarEl, name);

  if (nameEl) {
    nameEl.innerHTML = `<span class="name-val">${name}</span> <i data-lucide="edit-3" style="width:12px;height:12px;opacity:0.5;cursor:pointer;"></i>`;
    const valSpan = nameEl.querySelector('.name-val');
    const editIcon = nameEl.querySelector('i');

    const startEdit = () => {
      const current = valSpan.textContent;
      nameEl.innerHTML = `<input type="text" class="name-input" value="${current}">`;
      const input = nameEl.querySelector('input');
      input.focus();
      input.select();

      const saveEdit = async () => {
        const newVal = input.value.trim();
        if (newVal && newVal !== current) {
          await updateUserName(newVal);
          openProfile(); // Re-render
        } else {
          openProfile(); // Cancel
        }
      };

      input.onblur = saveEdit;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') openProfile();
      };
    };

    valSpan.onclick = startEdit;
    editIcon.onclick = startEdit;
  }

  if (emailEl) emailEl.textContent = state.currentUser.email;

  const xpInfo = getLevelFromXP(state.profile.xp_total || 0);
  const badgeNames = await fetchBadgeNames();

  // Renderizar conteúdo
  renderProfileContent(xpInfo, badgeNames);

  // Setup para upload de avatar
  setupAvatarUpload(avatarEl, name);

  // Abrir overlay
  overlay.classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function closeProfile() {
  const overlay = document.getElementById('profile-overlay');
  if (overlay) overlay.classList.remove('open');
}

function renderAvatar(el, name) {
  if (!el) return;
  if (state.profile.avatar_url) {
    el.innerHTML = `<img src="${state.profile.avatar_url}" alt="${name}">`;
  } else {
    el.innerHTML = `<span>${name.charAt(0).toUpperCase()}</span>`;
  }
}

async function updateUserName(newName) {
  const { toast } = await import('./utils.js');
  try {
    const userId = state.currentUser.id;

    // 1. Atualizar tabela profiles
    await sb.from('profiles').update({ full_name: newName }).eq('id', userId);

    // 2. Atualizar user_metadata (opcional mas bom para consistência)
    await sb.auth.updateUser({ data: { full_name: newName } });

    // 3. Atualizar estado local
    state.profile.full_name = newName;

    // 4. Atualizar UI da sidebar
    const sidebarName = document.getElementById('user-name');
    if (sidebarName) sidebarName.textContent = newName;

    toast('Nome atualizado! ✦');
  } catch (e) {
    console.error('[profile] erro ao atualizar nome:', e);
    toast('Erro ao salvar nome', 'alert-circle');
  }
}

// ── RENDERIZAR CONTEÚDO DO PERFIL ─────────
async function renderProfileContent(xpInfo, badgeNames) {
  const content = document.getElementById('profile-content');
  if (!content) return;

  // Seção de XP e Nível
  const xpSection = `
    <div class="profile-section">
      <div class="profile-section-title">Progressão</div>
      
      <div class="xp-card" style="margin-bottom: 12px;">
        <div class="prog-label" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 600;">
          <span>Progresso Global</span>
          <span id="prog-txt">${state.tasks.filter(t => t.done).length} / ${state.tasks.length}</span>
        </div>
        <div class="prog-wrap" style="height: 10px; background: var(--border); border-radius: 5px; overflow: hidden;">
          <div class="prog-bar" id="prog-bar" style="height: 100%; width: ${state.tasks.length > 0 ? Math.round((state.tasks.filter(t => t.done).length / state.tasks.length) * 100) : 0}%; background: var(--accent); transition: width 0.3s ease;"></div>
        </div>
      </div>

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
  const allBadges = Object.entries(badgeNames);
  const unlockedSlugs = profileState.userBadges.map(b => b.slug);

  console.log('[profile] rendering badges:', { total: allBadges.length, unlocked: unlockedSlugs.length });

  const badgesHTML = allBadges.map(([slug, info]) => {
    const isUnlocked = unlockedSlugs.includes(slug);
    const lockedClass = isUnlocked ? '' : 'locked';

    // Garantir que temos um nome e uma descrição para o tooltip
    const bName = info.name || 'Badge';
    const bDesc = info.description || 'Segredo...';
    const tooltip = `${bName}: ${bDesc}`;

    return `
      <div class="badge-item ${lockedClass}" title="${tooltip}">
        <div class="badge-item-icon">${isUnlocked ? (info.icon || '🏆') : '🔒'}</div>
        <div class="badge-item-name">${isUnlocked ? bName : 'Bloqueada'}</div>
        ${isUnlocked && info.rarity ? `<div class="badge-item-rarity ${info.rarity}"></div>` : ''}
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
    const { data, error } = await sb.from('badge_definitions').select('slug, name, icon, rarity, description');
    if (error) throw error;

    console.log('[profile] badges fetched:', data?.length || 0);

    const map = {};
    data?.forEach(b => {
      map[b.slug] = {
        name: b.name,
        icon: b.icon,
        rarity: b.rarity,
        description: b.description
      };
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
  const { toast } = await import('./utils.js');
  try {
    // Validação de tamanho (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast('Arquivo muito grande! Máximo 2MB', 'alert-circle');
      return;
    }

    const userId = state.currentUser.id;
    const cleanFileName = `${userId}.png`;

    toast('Enviando...', 'info');

    // Upload para Supabase Storage
    const { data, error } = await sb.storage
      .from('avatars')
      .upload(cleanFileName, file, { upsert: true });

    if (error) throw error;

    // Gerar URL pública
    const { data: { publicUrl } } = sb.storage
      .from('avatars')
      .getPublicUrl(cleanFileName);

    // Adicionar cache busting na URL salva para forçar o navegador a recarregar
    const finalUrl = `${publicUrl}?t=${Date.now()}`;

    // Salvar URL em profiles
    await sb.from('profiles')
      .update({ avatar_url: finalUrl })
      .eq('id', userId);

    // Atualizar estado local
    state.profile.avatar_url = finalUrl;

    // Renderizar novo avatar no modal
    renderAvatar(avatarEl, name);

    // Atualizar avatar na sidebar também
    const sidebarAvatar = document.getElementById('user-avatar');
    renderAvatar(sidebarAvatar, name);

    toast('Foto atualizada! ✨');
  } catch (e) {
    console.error('[profile] erro ao upload avatar:', e);
    toast('Erro ao enviar foto', 'alert-circle');
  }
}

// ── EDIT PROFILE MODAL ─────────────────────
export function openEditProfile() {
  document.getElementById('ep-name').value = state.profile.full_name || state.currentUser?.user_metadata?.full_name || state.currentUser?.email.split('@')[0] || '';
  document.getElementById('ep-company').value = state.profile.company_name || '';
  document.getElementById('ep-profession').value = state.profile.profession || '';
  document.getElementById('ep-instagram').value = state.profile.instagram_handle || '';
  document.getElementById('ep-objective').value = state.profile.usage_objective || '';
  document.getElementById('ep-birthdate').value = state.profile.birth_date || '';
  document.getElementById('ep-marketing').checked = state.profile.accept_marketing_emails || false;

  handleAgeCheck(); // Check age when opening modal

  // Listen to birthdate changes to automatically update marketing checkbox
  document.getElementById('ep-birthdate').addEventListener('change', handleAgeCheck);

  document.getElementById('edit-profile-overlay').classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function closeEditProfile() {
  document.getElementById('edit-profile-overlay').classList.remove('open');
  document.getElementById('ep-birthdate').removeEventListener('change', handleAgeCheck);
}

function handleAgeCheck() {
  const birthdateStr = document.getElementById('ep-birthdate').value;
  const marketingCheck = document.getElementById('ep-marketing');

  if (birthdateStr) {
    const age = calculateAge(new Date(birthdateStr));
    if (age < 18) {
      marketingCheck.checked = false;
      marketingCheck.disabled = true;
      marketingCheck.parentElement.style.opacity = '0.5';
      marketingCheck.parentElement.title = 'Apenas maiores de 18 anos podem receber e-mails de marketing.';
    } else {
      marketingCheck.disabled = false;
      marketingCheck.parentElement.style.opacity = '1';
      marketingCheck.parentElement.title = '';
    }
  } else {
    marketingCheck.disabled = false;
    marketingCheck.parentElement.style.opacity = '1';
    marketingCheck.parentElement.title = '';
  }
}

function calculateAge(birthday) {
  const ageDifMs = Date.now() - birthday.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export async function saveEditProfile() {
  const { toast } = await import('./utils.js');

  const updates = {
    full_name: document.getElementById('ep-name').value.trim(),
    company_name: document.getElementById('ep-company').value.trim(),
    profession: document.getElementById('ep-profession').value.trim(),
    instagram_handle: document.getElementById('ep-instagram').value.trim(),
    usage_objective: document.getElementById('ep-objective').value,
    birth_date: document.getElementById('ep-birthdate').value || null,
    accept_marketing_emails: document.getElementById('ep-marketing').checked,
  };

  // Only update consent date if it changed from false to true
  if (updates.accept_marketing_emails && !state.profile.accept_marketing_emails) {
    updates.email_consent_date = new Date().toISOString();
  } else if (!updates.accept_marketing_emails) {
    updates.email_consent_date = null;
  }

  try {
    const userId = state.currentUser.id;
    await sb.from('profiles').update(updates).eq('id', userId);

    // Update local state
    Object.assign(state.profile, updates);

    // Update user name in Sidebar if changed
    const sidebarName = document.getElementById('user-name');
    if (sidebarName) sidebarName.textContent = updates.full_name || state.currentUser.email.split('@')[0];

    // Re-render profile modal if open
    closeEditProfile();
    openProfile();
    toast('Perfil atualizado com sucesso! ✦');
  } catch (error) {
    console.error('[profile] erro ao salvar perfil editado:', error);
    toast('Erro ao atualizar perfil', 'alert-circle');
  }
}
