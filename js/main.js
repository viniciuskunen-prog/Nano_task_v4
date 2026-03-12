import { openProfile, closeProfile, openEditProfile, closeEditProfile, saveEditProfile } from "./profile.js";
import { state } from './state.js';
import { toast } from './utils.js';
import { initAuth, showScreen, doLogin, doRegister, doGoogleLogin, doForgot, doLogout } from './auth.js';
import { saveTask, deleteTask, toggleDone, toggleSubtask, completeWithSubs, deleteGroup, deleteSubtag, duplicateTask, createColumn, renameColumn, deleteColumn } from './tasks.js';
import { render, renderTasks, getFiltered } from './render.js';
import { toggleTimer, pomodoroToggle, pomodoroReset, pomodoroSkip, unlinkPomodoro, playSound, requestNotifPerm } from './pomodoro.js';
import {
  setSmartView, setTagView, setPri, changeMonth,
  toggleGroup, addSubtagPrompt,
  openTaskModal, closeTaskModal, selPri, toggleTag, addSubtaskModal, removeSubtaskModal, checkMeetingTitle, openCalendar,
  openCompleteModal, closeOverlay,
  openGroupModal, closeGroupModal, pickGroupColor, doSaveGroup,
  openPrefs, closePrefs, pickAccent, doSavePrefs,
  exportBackup,
  getModalState,
  toggleSidebar, toggleRightPanel, setDisplayMode,
  applyTheme
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
document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
document.getElementById('right-menu-toggle').addEventListener('click', toggleRightPanel);
document.getElementById('btn-close-right')?.addEventListener('click', toggleRightPanel);
document.getElementById('btn-logout').addEventListener('click', doLogout);
document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
document.getElementById('btn-profile').addEventListener('click', openProfile);
document.getElementById('btn-close-profile').addEventListener('click', closeProfile);
document.body.addEventListener('click', (e) => {
  if (e.target.closest('#btn-open-edit-profile')) openEditProfile();
  if (e.target.closest('#btn-cancel-edit-profile')) closeEditProfile();
  if (e.target.closest('#btn-save-edit-profile')) saveEditProfile();
});

document.getElementById('btn-prefs').addEventListener('click', openPrefs);
document.getElementById('btn-backup').addEventListener('click', exportBackup);
document.getElementById('btn-new-group').addEventListener('click', openGroupModal);
document.getElementById('search-input').addEventListener('input', renderTasks);
document.getElementById('group-filter-select').addEventListener('change', renderTasks);

// ── NAV ITEMS ─────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', () => {
    setSmartView(el.dataset.view, el);
    // Close sidebar on mobile after clicking
    if (window.innerWidth <= 768) toggleSidebar();
  });
});

// ── VIEW TOGGLE ───────────────────────────────────────────
document.getElementById('btn-view-list')?.addEventListener('click', () => setDisplayMode('list'));
document.getElementById('btn-view-board')?.addEventListener('click', () => setDisplayMode('board'));

// ── PRIORITY CHIPS ────────────────────────────────────────
document.querySelectorAll('.chip[data-pri]').forEach(el => {
  el.addEventListener('click', () => setPri(el.dataset.pri, el));
});

// ── TASK CONTAINER (event delegation) ────────────────────
function handleTaskClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  // Prevent task-main "edit" from firing when clicking child buttons
  if (action !== 'edit') e.stopPropagation();

  switch (action) {
    case 'toggle-done': {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id);
      if (!t) return;
      if (t.done) {
        // Re-opening a completed task
        toggleDone(id).then(() => { render(); toast('Reaberta'); });
      } else {
        const pending = (t.subtasks || []).filter(s => !s.done);
        if (pending.length) { openCompleteModal(id); }
        else { toggleDone(id).then(() => { playSound('check'); render(); toast('Concluída!'); }); }
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
      deleteTask(id).then(render).catch(err => { console.error('[main] Erro ao remover tarefa', err); toast('Erro ao remover', '⚠'); });
      break;
    }
    case 'duplicate': {
      e.stopPropagation();
      duplicateTask(id).then(render).catch(err => { console.error('[main] Erro ao duplicar tarefa', err); toast('Erro ao duplicar', '⚠'); });
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
      const subId = actionEl.dataset.subId;
      toggleSubtask(taskId, subId).then(() => { playSound('check'); render(); }).catch(err => { console.error('[main] Erro ao alternar subtarefa', err); toast('Erro ao salvar', '⚠'); });
      break;
    }
  }
}

document.getElementById('task-container').addEventListener('click', handleTaskClick);
document.getElementById('board-container')?.addEventListener('click', async e => {
  const addColBtn = e.target.closest('#btn-add-column');
  if (addColBtn) {
    const name = prompt('Nome da nova coluna:');
    if (name && name.trim()) {
      const success = await createColumn(name.trim());
      if (success) render();
    }
    return;
  }
  
  const renameColBtn = e.target.closest('[data-rename-col]');
  if (renameColBtn) {
    const colId = renameColBtn.dataset.renameCol;
    const col = state.columns.find(c => c.id === colId);
    if (!col) return;
    const newName = prompt('Renomear coluna:', col.name);
    if (newName && newName.trim() && newName.trim() !== col.name) {
      const success = await renameColumn(colId, newName.trim());
      if (success) render();
    }
    return;
  }
  
  const addTaskBtn = e.target.closest('[data-add-task]');
  if (addTaskBtn) {
    openTaskModal(null, addTaskBtn.dataset.addTask);
    return;
  }
  
  const delColBtn = e.target.closest('[data-delete-col]');
  if (delColBtn) {
    const colId = delColBtn.dataset.deleteCol;
    if (confirm("Deseja excluir esta coluna? As tarefas serão realocadas para a primeira coluna existente.")) {
      const success = await deleteColumn(colId);
      if (success) render();
    }
    return;
  }

  handleTaskClick(e);
});

document.getElementById('board-container')?.addEventListener('change', e => {
  const sortSel = e.target.closest('.board-col-sort');
  if (sortSel) {
    state.taskSortMode = sortSel.value;
    localStorage.setItem('taskSortMode', sortSel.value);
    render();
  }
});

// ── QUICK ADD & SEARCH CLEAR (Event Delegation) ───────────
document.addEventListener('keydown', e => {
  if (e.target.id === 'quick-add-input' && e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return;
    saveTask({
      title: val,
      priority: 'none',
      tags: [],
      subtasks: []
    }).then(() => {
      e.target.value = '';
      render();
    });
  }
});

document.addEventListener('click', e => {
  if (e.target.id === 'btn-clear-search' || e.target.id === 'btn-clear-search-board') {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
      render();
    }
  }
});

// ── INLINE COLUMN RENAME ──────────────────────────────────
document.addEventListener('dblclick', e => {
  const titleEl = e.target.closest('.board-col-title');
  if (!titleEl) return;
  
  const colId = titleEl.dataset.renameCol;
  const col = state.columns.find(c => c.id === colId);
  if (!col) return;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'board-col-rename-input';
  input.value = col.name;
  
  const finish = async () => {
    const newName = input.value.trim();
    if (newName && newName !== col.name) {
      await renameColumn(colId, newName);
      render();
    } else {
      titleEl.style.display = 'block';
      input.remove();
    }
  };
  
  input.onblur = finish;
  input.onkeydown = e => {
    if (e.key === 'Enter') finish();
    if (e.key === 'Escape') {
      titleEl.style.display = 'block';
      input.remove();
    }
  };
  
  titleEl.style.display = 'none';
  titleEl.parentNode.insertBefore(input, titleEl);
  input.focus();
  input.select();
});

// ── TAG SIDEBAR (event delegation) ───────────────────────
document.getElementById('tag-sidebar').addEventListener('click', async e => {
  const delSubEl = e.target.closest('[data-del-subtag]');
  const delGrpEl = e.target.closest('[data-del-group]');
  const addEl = e.target.closest('[data-add-subtag]');
  const toggleEl = e.target.closest('[data-group-toggle]');
  const tagEl = e.target.closest('[data-tag]');

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
  if (addEl) { addSubtagPrompt(addEl.dataset.addSubtag); return; }
  if (toggleEl) { toggleGroup(toggleEl.dataset.groupToggle); return; }
  if (tagEl) { setTagView(tagEl.dataset.tag); }
});

// ── TASK MODAL ────────────────────────────────────────────
document.getElementById('btn-save-task').addEventListener('click', async () => {
  const { eTags, ePri, eSubtasks, eRecurrence } = getModalState();
  const title = document.getElementById('tm-title').value.trim();
  if (!title) { toast('Título obrigatório', '⚠'); return; }
  try {
    await saveTask({
      id: document.getElementById('tm-id').value || null,
      title,
      note: document.getElementById('tm-note').value,
      date: document.getElementById('tm-date').value || null,
      priority: ePri,
      tags: eTags,
      subtasks: eSubtasks,
      recurrence: eRecurrence,
      column_id: document.getElementById('tm-column-id').value || null,
    });
    closeTaskModal();
    render();
  } catch (err) { console.error('[main] Erro ao salvar tarefa', err); toast('Erro ao salvar tarefa', '⚠'); }
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
applyTheme(localStorage.getItem('theme') || 'system');
setDisplayMode(state.displayMode, true);
initAuth();

document.getElementById('pref-theme')?.addEventListener('change', (e) => {
  applyTheme(e.target.value);
});
