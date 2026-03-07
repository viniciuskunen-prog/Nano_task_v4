import { state } from './state.js';
import { toast } from './utils.js';
import { initAuth, showScreen, doLogin, doRegister, doGoogleLogin, doForgot, doLogout } from './auth.js';
import { saveTask, deleteTask, toggleDone, toggleSubtask, completeWithSubs, deleteGroup, deleteSubtag } from './tasks.js';
import { render, renderTasks, getFiltered } from './render.js';
import { toggleTimer, pomodoroToggle, pomodoroReset, pomodoroSkip, unlinkPomodoro, playSound, requestNotifPerm } from './pomodoro.js';
import {
  setSmartView, setTagView, setPri, changeMonth,
  toggleGroup, addSubtagPrompt,
  openTaskModal, closeTaskModal, selPri, toggleTag, addSubtaskModal, removeSubtaskModal, checkMeetingTitle, openCalendar,
  openCompleteModal, closeOverlay,
  openGroupModal, closeGroupModal, pickGroupColor, doSaveGroup,
  openPrefs, closePrefs, pickAccent, doSavePrefs,
  exportBackup, updateXPBar,
  getModalState,
  openProfile, closeProfile,
} from './ui.js';

// ── AUTH BUTTONS ──────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('register-btn').addEventListener('click', doRegister);
document.getElementById('forgot-btn').addEventListener('click', doForgot);
document.getElementById('btn-google-login').addEventListener('click', doGoogleLogin);
document.getElementById('btn-google-register').addEventListener('click', doGoogleLogin);
document.getElementById('btn-go-register').addEventListener('click', () => showScreen('register'));
document.getElementById('btn-go-login').addEventListener('click', () => showScreen('login'));
document.getElementById('btn-go-login-2').addEventListener('click', () => showScreen('login'));
document.getElementById('btn-forgot').addEventListener('click', () => showScreen('forgot'));

// Enter key on auth inputs
document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-email').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ── APP BUTTONS ───────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', doLogout);
document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
document.getElementById('btn-profile').addEventListener('click', openProfile);
document.getElementById('btn-close-profile').addEventListener('click', closeProfile);
document.getElementById('btn-prefs').addEventListener('click', openPrefs);
document.getElementById('btn-backup').addEventListener('click', exportBackup);
document.getElementById('btn-new-group').addEventListener('click', openGroupModal);
document.getElementById('search-input').addEventListener('input', renderTasks);

// ── NAV ITEMS ─────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => setSmartView(el.dataset.view, el));
});

// ── PRIORITY CHIPS ────────────────────────────────────────
document.querySelectorAll('.chip[data-pri]').forEach(el => {
  el.addEventListener('click', () => setPri(el.dataset.pri, el));
});

// ── TASK CONTAINER (event delegation) ────────────────────
document.getElementById('task-container').addEventListener('click', async e => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id     = actionEl.dataset.id;

  // Prevent task-main "edit" from firing when clicking child buttons
  if (action !== 'edit') e.stopPropagation();

  switch (action) {
    case 'toggle-done': {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id);
      if (!t) return;
      if (t.done) {
        // Re-opening a completed task
        await toggleDone(id);
        render();
        toast('Reaberta');
      } else {
        const pending = (t.subtasks || []).filter(s => !s.done);
        if (pending.length) { openCompleteModal(id); }
        else { await toggleDone(id); playSound('check'); render(); toast('Concluída!'); }
      }
      break;
    }
    case 'edit': {
      const t = state.tasks.find(t => t.id === id);
      if (t) openTaskModal(t);
      break;
    }
    case 'delete': {
      e.stopPropagation();
      try { await deleteTask(id); render(); } catch (_) { toast('Erro ao remover', '⚠'); }
      break;
    }
    case 'toggle-timer': {
      e.stopPropagation();
      toggleTimer(id);
      break;
    }
    case 'expand': {
      e.stopPropagation();
      if (state.expandedTasks.has(id)) state.expandedTasks.delete(id); else state.expandedTasks.add(id);
      renderTasks();
      break;
    }
    case 'toggle-subtask': {
      e.stopPropagation();
      const taskId = actionEl.dataset.taskId;
      const subId  = actionEl.dataset.subId;
      try { await toggleSubtask(taskId, subId); playSound('check'); render(); } catch (_) { toast('Erro ao salvar', '⚠'); }
      break;
    }
    case 'link-pomo': {
      e.stopPropagation();
      const { pomodoroState } = await import('./pomodoro.js');
      if (pomodoroState.linkedTaskId === id) {
        pomodoroState.linkedTaskId = null;
        toast('Pomodoro desvinculado');
      } else {
        pomodoroState.linkedTaskId = id;
        const t = state.tasks.find(t => t.id === id);
        toast(`🍅 Vinculado: ${t?.title?.substring(0, 30) || ''}`);
      }
      localStorage.setItem('pomodoroState', JSON.stringify(pomodoroState));
      const { updatePomodoroLinked } = await import('./pomodoro.js');
      updatePomodoroLinked();
      render();
      break;
    }
  }
});

// ── TAG SIDEBAR (event delegation) ───────────────────────
document.getElementById('tag-sidebar').addEventListener('click', async e => {
  const delSubEl  = e.target.closest('[data-del-subtag]');
  const delGrpEl  = e.target.closest('[data-del-group]');
  const addEl     = e.target.closest('[data-add-subtag]');
  const toggleEl  = e.target.closest('[data-group-toggle]');
  const tagEl     = e.target.closest('[data-tag]');

  // Check directly on the clicked element to avoid closest() walking up
  const isDelBtn = e.target.classList.contains('tg-del');
  if (isDelBtn) {
    e.stopPropagation();
    const tag = e.target.dataset.delSubtag;
    const gid = e.target.dataset.delGroup;
    if (tag) {
      if (!confirm(`Remover a tag "${tag}"?`)) return;
      await deleteSubtag(gid, tag);
    } else {
      const g = state.groups.find(g => g.id === gid);
      if (!confirm(`Excluir o grupo "${g?.name}"?`)) return;
      await deleteGroup(gid);
    }
    render();
    return;
  }
  if (addEl)    { addSubtagPrompt(addEl.dataset.addSubtag); return; }
  if (toggleEl) { toggleGroup(toggleEl.dataset.groupToggle); return; }
  if (tagEl)    { setTagView(tagEl.dataset.tag); }
});

// ── TASK MODAL ────────────────────────────────────────────
document.getElementById('btn-save-task').addEventListener('click', async () => {
  const { eTags, ePri, eSubtasks } = getModalState();
  const title = document.getElementById('tm-title').value.trim();
  if (!title) { toast('Título obrigatório', '⚠'); return; }
  try {
    await saveTask({
      id:       document.getElementById('tm-id').value || null,
      title,
      note:     document.getElementById('tm-note').value,
      date:     document.getElementById('tm-date').value || null,
      priority: ePri,
      tags:     eTags,
      subtasks: eSubtasks,
    });
    closeTaskModal();
    render();
  } catch (_) { toast('Erro ao salvar tarefa', '⚠'); }
});

document.getElementById('btn-cancel-task').addEventListener('click', closeTaskModal);
document.getElementById('tm-title').addEventListener('input', checkMeetingTitle);
document.getElementById('btn-open-calendar').addEventListener('click', openCalendar);

document.getElementById('btn-add-subtask').addEventListener('click', () => {
  addSubtaskModal();
  // Re-render with updated eSubtasks (imported live from ui.js on next call)
});

document.getElementById('stm-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addSubtaskModal(); }
});

// Priority buttons in task modal
document.querySelectorAll('.pri-btn[data-pri]').forEach(btn => {
  btn.addEventListener('click', () => selPri(btn.dataset.pri));
});

// Tag picker in task modal (event delegation)
document.getElementById('tag-picker').addEventListener('click', e => {
  const el = e.target.closest('[data-pick-tag]');
  if (el) toggleTag(el.dataset.pickTag);
});

document.getElementById('sel-tags').addEventListener('click', e => {
  const el = e.target.closest('[data-pick-tag]');
  if (el) toggleTag(el.dataset.pickTag);
});

// Subtask remove buttons (event delegation on stm-list)
document.getElementById('stm-list').addEventListener('click', e => {
  const el = e.target.closest('[data-remove-sub]');
  if (el) removeSubtaskModal(parseInt(el.dataset.removeSub));
});

// ── COMPLETE MODAL ────────────────────────────────────────
document.getElementById('btn-complete-all').addEventListener('click', async () => {
  closeOverlay('complete-overlay');
  await completeWithSubs(true);
  playSound('check');
  render();
});

document.getElementById('btn-promote-subs').addEventListener('click', async () => {
  closeOverlay('complete-overlay');
  await completeWithSubs(false);
  render();
});

document.getElementById('btn-cancel-complete').addEventListener('click', () => closeOverlay('complete-overlay'));

// ── GROUP MODAL ───────────────────────────────────────────
document.getElementById('btn-save-group').addEventListener('click', doSaveGroup);
document.getElementById('btn-cancel-group').addEventListener('click', closeGroupModal);

document.getElementById('gm-colors').addEventListener('click', e => {
  const el = e.target.closest('[data-color]');
  if (el) pickGroupColor(el.dataset.color, el);
});

// ── PREFS MODAL ───────────────────────────────────────────
document.getElementById('btn-save-prefs').addEventListener('click', doSavePrefs);
document.getElementById('btn-cancel-prefs').addEventListener('click', closePrefs);
document.getElementById('notif-perm-btn').addEventListener('click', requestNotifPerm);

document.getElementById('pref-accent').addEventListener('click', e => {
  const el = e.target.closest('[data-accent]');
  if (el) pickAccent(el.dataset.accent, el);
});

document.querySelectorAll('#pref-days .day-btn').forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

// ── POMODORO ──────────────────────────────────────────────
document.getElementById('pomo-play-btn').addEventListener('click', pomodoroToggle);
document.getElementById('pomo-reset-btn').addEventListener('click', pomodoroReset);
document.getElementById('pomo-skip-btn').addEventListener('click', pomodoroSkip);
document.getElementById('pomo-linked-task').addEventListener('click', unlinkPomodoro);

// ── REPORT (event delegation on report container) ─────────
document.getElementById('report-container').addEventListener('click', e => {
  const btn = e.target.closest('[data-month]');
  if (btn) changeMonth(parseInt(btn.dataset.month));
});

// ── KEYBOARD SHORTCUTS ────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!state.currentUser) return;
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
  if (e.key === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    openTaskModal();
  }
});

// ── BOOT ──────────────────────────────────────────────────
initAuth();
