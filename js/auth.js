import { sb } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { render } from './render.js';
import { updatePomodoroUI, pomodoroState, updatePomoStats } from './pomodoro.js';
import { loadColumns } from './tasks.js';

// ── SCREENS ───────────────────────────────────────────────
export function showScreen(name) {
  ['login', 'register', 'forgot'].forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('hidden', s !== name);
  });
}

function showAppView(visible) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('auth-view').classList.toggle('hidden', visible);
  document.getElementById('app-view').classList.toggle('hidden', !visible);

  const fab = document.getElementById('fab-add-task');
  if (fab) fab.classList.toggle('hidden', !visible);
}

// ── AUTH ACTIONS ──────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  err.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { err.textContent = error.message; err.classList.add('show'); }
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

export async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const passConfirm = document.getElementById('reg-pass-confirm').value;
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('register-error');
  const suc = document.getElementById('register-success');

  err.classList.remove('show'); suc.classList.remove('show');

  if (!name) { err.textContent = 'Digite seu nome.'; err.classList.add('show'); return; }
  if (pass !== passConfirm) { err.textContent = 'As senhas não coincidem.'; err.classList.add('show'); return; }

  btn.disabled = true; btn.textContent = 'Criando conta...';
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name },
        emailRedirectTo: redirectTo
      }
    });
    if (error) {
      if (error.message.includes("rate limit")) err.textContent = "Muitas tentativas em pouco tempo. Por favor, aguarde alguns minutos e tente novamente.";
      else err.textContent = error.message;
      err.classList.add('show');
    }
    else { suc.textContent = 'Conta criada! Verifique seu email para confirmar.'; suc.classList.add('show'); }
  } finally {
    btn.disabled = false; btn.textContent = 'Criar conta';
  }
}

export async function doGoogleLogin() {
  const btn = document.querySelector('.google-btn:not(.hidden)') || document.getElementById('btn-google-login');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecionando...'; }
  
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo } 
    });
    if (error) throw error;
  } catch (err) {
    console.error('[auth] Erro Google Login:', err);
    toast('Erro ao conectar com Google', '⚠');
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

export async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const err = document.getElementById('forgot-error');
  const suc = document.getElementById('forgot-success');
  err.classList.remove('show'); suc.classList.remove('show');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) { err.textContent = error.message; err.classList.add('show'); }
  else { suc.textContent = 'Link enviado! Verifique seu email.'; suc.classList.add('show'); }
}

export async function doLogout() {
  if (!confirm('Sair da conta?')) return;
  try {
    await Promise.race([
      sb.auth.signOut({ scope: 'local' }),
      new Promise((_, r) => setTimeout(() => r('timeout'), 2000)),
    ]);
  } catch (err) {
    console.warn('[auth] Aviso ao deslogar:', err);
  }
  state.currentUser = null;
  state.tasks = []; state.groups = []; state.profile = {};
  showAppView(false);
  showScreen('login');
}

// ── DATA LOADING ──────────────────────────────────────────
async function ensureProfileExists() {
  const userId = state.currentUser.id;
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  // Com o trigger handle_new_user_profile, o perfil é criado automaticamente
  // Apenas carregamos e verificamos se existe
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found (pode acontecer se trigger ainda não foi acionado)
    console.error('[auth] erro ao carregar perfil:', error);
    throw new Error(`Falha ao carregar perfil: ${error.message}`);
  }

  if (error?.code === 'PGRST116') {
    // Perfil não encontrado - criar manualmente como fallback
    console.warn('[auth] Perfil não encontrado, criando manualmente...');
    const { error: createError } = await sb.from('profiles').insert({
      id: userId,
      full_name: state.currentUser.user_metadata?.full_name || 'Usuário',
      xp_total: 0,
      accent_color: '#351cd4',
      trial_ends_at: trialEndsAt.toISOString()
    });

    if (createError) {
      console.error('[auth] Erro ao criar perfil:', createError);
      state.profile = { id: userId, xp_total: 0 };
      return;
    }

    // Carregar o perfil recém-criado
    const { data: newProfile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    state.profile = newProfile || { id: userId, xp_total: 0 };
  } else {
    state.profile = data;
  }

  // Lógica de correção para trial nulo (contas legadas)
  if (state.profile && !state.profile.trial_ends_at && state.profile.subscription_status !== 'active') {
    const { data: updated } = await sb.from('profiles')
      .update({ trial_ends_at: trialEndsAt.toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (updated) state.profile = updated;
  }

  checkSubscriptionStatus();
}

function checkSubscriptionStatus() {
  if (!state.profile) return;

  const now = new Date();
  const trialEnd = state.profile.trial_ends_at ? new Date(state.profile.trial_ends_at) : null;
  const isPaid = state.profile.subscription_status === 'active';

  state.profile.isTrialActive = trialEnd && trialEnd > now;
  state.profile.trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;
  state.profile.isBlocked = !isPaid && (!trialEnd || trialEnd <= now);

  if (state.profile.isBlocked) {
    // Redirecionar ou mostrar overlay de bloqueio (pode ser implementado na UI)
    console.warn('[auth] acesso bloqueado: trial expirado');
  }
}

async function loadTasksFromDB() {
  const { data: t } = await sb.from('tasks').select('*').eq('user_id', state.currentUser.id).order('position');
  const { data: s } = await sb.from('subtasks').select('*').eq('user_id', state.currentUser.id).order('position');
  state.tasks = (t || []).map(task => ({
    ...task,
    tags: task.tags || [],
    subtasks: (s || []).filter(sub => sub.task_id === task.id).map(sub => ({ ...sub, tags: sub.tags || [] })),
  }));
}

export async function loadAll() {
  console.log('[auth] loadAll starting...');
  try {
    const meta = state.currentUser.user_metadata || {};
    const name = meta.full_name || meta.name || state.currentUser.email.split('@')[0];
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    console.log('[auth] loading profile, tags, tasks, columns...');
    const [profileRes, tagsRes, tasksRes, columnsRes] = await Promise.allSettled([
      ensureProfileExists(),
      sb.from('tag_groups').select('*').eq('user_id', state.currentUser.id).order('position'),
      loadTasksFromDB(),
      loadColumns()
    ]);
    console.log('[auth] data loading complete');

    if (profileRes.status === 'rejected') {
      console.error('[loadAll] profile error:', profileRes.reason);
      state.profile = { id: state.currentUser.id, xp_total: 0 };
    }

    if (tagsRes.status === 'fulfilled') {
      state.groups = tagsRes.value?.data || [];
      state.expanded = new Set(state.groups.map(g => g.id));
    }

    if (tasksRes.status === 'rejected') {
      console.error('[loadAll] tasks error:', tasksRes.reason);
      toast('Erro ao carregar tarefas', '⚠');
    }

    if (columnsRes.status === 'rejected') {
      console.error('[loadAll] columns error:', columnsRes.reason);
      toast('Erro ao carregar quadro Kanban', '⚠');
      state.columns = state.columns || [];
    }

    if (state.columns && state.columns.length > 0) {
      const firstColumn = state.columns[0];
      state.tasks.forEach(task => {
        if (!task.column_id) {
          task.column_id = firstColumn.id;
        }
      });
    }

    if (state.profile.accent_color) {
      document.documentElement.style.setProperty('--accent', state.profile.accent_color);
    }

    if (pomodoroState.duration === 1500 && state.profile.pomo_duration) {
      pomodoroState.duration = parseInt(state.profile.pomo_duration) * 60;
      pomodoroState.remaining = pomodoroState.duration;
    }

    updatePomodoroUI();
    render();
    updatePomoStats();

    // Atualizar barra de XP no sidebar
    try {
      const { updateXPBar } = await import('./ui.js');
      updateXPBar();
    } catch (err) { console.warn('[auth] Erro ao carregar XP Bar', err); }
  } catch (e) {
    console.error('[loadAll]', e);
    toast('Erro ao carregar dados', '⚠');
  }
}

// ── INIT ──────────────────────────────────────────────────
async function handleURLCallbacks() {
  const url = new URL(window.location.href);
  const hasError =
    url.searchParams.has('error') ||
    url.searchParams.has('error_description') ||
    url.searchParams.has('error_code') ||
    window.location.hash.includes('error=');

  if (hasError) {
    // Limpar a URL removendo os parâmetros de erro. 
    // Usamos o pathname atual para manter a navegação correta.
    const cleanUrl = window.location.origin + window.location.pathname;
    history.replaceState({}, document.title, cleanUrl);
    console.log('[auth] URL de erro detectada e limpa.');
  }
}

export async function initAuth() {
  await handleURLCallbacks();

  // safety timeout to hide loading screen if something hangs
  const safetyTimer = setTimeout(() => document.getElementById('loading').classList.add('hidden'), 5000);

  console.log('[auth] checking session...');
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    
    if (error) throw error;

    clearTimeout(safetyTimer);
    document.getElementById('loading').classList.add('hidden');

    if (session?.user) {
      state.currentUser = session.user;
      showAppView(true);
      console.log('[auth] logged in as', session.user.email);
      await loadAll();
    } else {
      state.currentUser = null;
      showAppView(false);
      showScreen('login');
      console.log('[auth] no session, showing login');
    }
  } catch (err) {
    console.error('[auth] CRITICAL ERROR IN INIT:', err);
    document.getElementById('loading').classList.add('hidden');
    showScreen('login');
  }

  // 2. Escuta apenas eventos futuros (login manual, logout)
  sb.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth] event:', event);
    
    if (event === 'SIGNED_IN' && session?.user) {
      if (state.currentUser?.id === session.user.id) return; // evitar re-load desnecessário
      
      state.currentUser = session.user;
      showAppView(true);
      try { await loadAll(); } catch (err) { console.error('[auth] Erro em loadAll', err); }
    } else if (event === 'SIGNED_OUT') {
      state.currentUser = null;
      showAppView(false);
      showScreen('login');
    }
  });

  // Second safety for slower connections/renders
  setTimeout(() => {
    const loader = document.getElementById('loading');
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('hidden');
    }
  }, 8000);
}
