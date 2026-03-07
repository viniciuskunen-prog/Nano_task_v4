import { sb } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { render } from './render.js';
import { updatePomodoroUI, pomodoroState, updatePomoStats } from './pomodoro.js';

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
}

// ── AUTH ACTIONS ──────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) { err.textContent = error.message; err.classList.add('show'); }
}

export async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const btn   = document.getElementById('register-btn');
  const err   = document.getElementById('register-error');
  const suc   = document.getElementById('register-success');
  err.classList.remove('show'); suc.classList.remove('show');
  if (!name) { err.textContent = 'Digite seu nome.'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Criando conta...';
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
  btn.disabled = false; btn.textContent = 'Criar conta';
  if (error) { err.textContent = error.message; err.classList.add('show'); }
  else { suc.textContent = 'Conta criada! Verifique seu email para confirmar.'; suc.classList.add('show'); }
}

export async function doGoogleLogin() {
  const redirectTo = window.location.origin + window.location.pathname;
  await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

export async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const err   = document.getElementById('forgot-error');
  const suc   = document.getElementById('forgot-success');
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
  } catch (_) {}
  state.currentUser = null;
  state.tasks = []; state.groups = []; state.profile = {};
  showAppView(false);
  showScreen('login');
}

// ── DATA LOADING ──────────────────────────────────────────
async function ensureProfileExists() {
  const userId = state.currentUser.id;
  
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error?.code === 'PGRST116') {
    // Perfil não existe, criar novo
    const { data: newProfile, error: insertError } = await sb
      .from('profiles')
      .insert({
        id: userId,
        xp_total: 0,
        pomo_sessions: 0,
        accent_color: '#351cd4'
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('[auth] erro ao criar perfil:', insertError);
      state.profile = { id: userId, xp_total: 0 };
      return;
    }
    state.profile = newProfile;
  } else if (error) {
    console.error('[auth] erro ao carregar perfil:', error);
    state.profile = { id: userId, xp_total: 0 };
  } else {
    state.profile = data || { id: userId, xp_total: 0 };
  }
}

async function loadTasksFromDB() {
  const { data: t } = await sb.from('tasks').select('*').eq('user_id', state.currentUser.id).order('created_at', { ascending: false });
  const { data: s } = await sb.from('subtasks').select('*').eq('user_id', state.currentUser.id).order('position');
  state.tasks = (t || []).map(task => ({
    ...task,
    tags: task.tags || [],
    subtasks: (s || []).filter(sub => sub.task_id === task.id).map(sub => ({ ...sub, tags: sub.tags || [] })),
  }));
}

export async function loadAll() {
  try {
    const meta = state.currentUser.user_metadata || {};
    const name = meta.full_name || meta.name || state.currentUser.email.split('@')[0];
    document.getElementById('user-name').textContent   = name;
    document.getElementById('user-email').textContent  = state.currentUser.email;
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();

    const [profileRes, tagsRes, tasksRes] = await Promise.allSettled([
      ensureProfileExists(),
      sb.from('tag_groups').select('*').eq('user_id', state.currentUser.id).order('position'),
      loadTasksFromDB(),
    ]);

    if (profileRes.status === 'rejected') {
      console.error('[loadAll] profile error:', profileRes.reason);
      state.profile = { id: state.currentUser.id, xp_total: 0 };
    }

    if (tagsRes.status === 'fulfilled') {
      state.groups   = tagsRes.value?.data || [];
      state.expanded = new Set(state.groups.map(g => g.id));
    }

    if (tasksRes.status === 'rejected') {
      console.error('[loadAll] tasks error:', tasksRes.reason);
      toast('Erro ao carregar tarefas', '⚠');
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
    } catch (_) {}
  } catch (e) {
    console.error('[loadAll]', e);
    toast('Erro ao carregar dados', '⚠');
  }
}

// ── INIT ──────────────────────────────────────────────────
export async function initAuth() {
  // 1. Verifica sessão existente diretamente (sem race condition)
  const { data: { session } } = await sb.auth.getSession();

  document.getElementById('loading').classList.add('hidden');

  if (session?.user) {
    state.currentUser = session.user;
    showAppView(true);
    try { await loadAll(); } catch (_) { toast('Erro ao carregar', '⚠'); }
  } else {
    showAppView(false);
    showScreen('login');
  }

  // 2. Escuta apenas eventos futuros (login manual, logout)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && !state.currentUser) {
      state.currentUser = session.user;
      showAppView(true);
      try { await loadAll(); } catch (_) { toast('Erro ao carregar', '⚠'); }
    } else if (event === 'SIGNED_OUT') {
      state.currentUser = null;
      showAppView(false);
      showScreen('login');
    }
  });
}
