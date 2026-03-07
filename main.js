import { state } from './state.js';
import { toast } from './utils.js';
import { initAuth, showScreen, doLogin, doRegister, doGoogleLogin, doForgot, doLogout } from './auth.js';
import { saveTask, deleteTask, toggleSubtask, completeWithSubs, deleteGroup, deleteSubtag, handleTaskCompletion, reopenTask } from './tasks.js';
import { render, renderTasks } from './render.js';
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
  openProfile, closeProfile
} from './ui.js';


const byId = id => document.getElementById(id);

function bind(id, event, handler) {
  const el = byId(id);
  if (!el) return;
  el.addEventListener(event, handler);
}


// ───────────────── AUTH ─────────────────

bind('login-btn','click',doLogin);
bind('register-btn','click',doRegister);
bind('forgot-btn','click',doForgot);

bind('btn-google-login','click',doGoogleLogin);
bind('btn-google-register','click',doGoogleLogin);

bind('btn-go-register','click',()=>showScreen('register'));
bind('btn-go-login','click',()=>showScreen('login'));
bind('btn-go-login-2','click',()=>showScreen('login'));
bind('btn-forgot','click',()=>showScreen('forgot'));

bind('login-pass','keydown',e=>{ if(e.key==='Enter') doLogin(); });
bind('login-email','keydown',e=>{ if(e.key==='Enter') doLogin(); });


// ───────────────── APP BUTTONS ─────────────────

bind('btn-logout','click',doLogout);
bind('add-task-btn','click',()=>openTaskModal());
bind('btn-profile','click',openProfile);
bind('btn-close-profile','click',closeProfile);

bind('btn-prefs','click',openPrefs);
bind('btn-backup','click',exportBackup);
bind('btn-new-group','click',openGroupModal);

bind('search-input','input',renderTasks);


// ───────────────── NAV ─────────────────

document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
  el.addEventListener('click',()=>setSmartView(el.dataset.view,el));
});

document.querySelectorAll('.chip[data-pri]').forEach(el=>{
  el.addEventListener('click',()=>setPri(el.dataset.pri,el));
});


// ───────────────── TASK CONTAINER ─────────────────

bind('task-container','click',async e=>{

  const actionEl = e.target.closest('[data-action]');
  if(!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if(action !== 'edit') e.stopPropagation();

  switch(action){

    case 'toggle-done':{

      const result = await handleTaskCompletion(id);

      if(result.status==='pending_subtasks'){
        openCompleteModal(id);
      }

      else if(result.status==='already_completed'){
        const reopened = await reopenTask(id);

        if(reopened){
          render();
          toast('Tarefa reaberta');
        }
        else{
          toast('Tarefa já concluída');
        }
      }

      else if(result.status==='completed'){
        playSound('check');
        render();
        toast('Concluída!');
      }

      break;
    }


    case 'edit':{

      const t = state.tasks.find(t=>t.id===id);
      if(t) openTaskModal(t);

      break;
    }


    case 'delete':{

      try{
        const deleted = await deleteTask(id);
        if(deleted) render();
      }
      catch{
        toast('Erro ao remover','⚠');
      }

      break;
    }


    case 'toggle-timer':{

      toggleTimer(id);
      break;
    }


    case 'expand':{

      if(state.expandedTasks.has(id))
        state.expandedTasks.delete(id);
      else
        state.expandedTasks.add(id);

      renderTasks();

      break;
    }


    case 'toggle-subtask':{

      const taskId = actionEl.dataset.taskId;
      const subId = actionEl.dataset.subId;

      try{
        await toggleSubtask(taskId,subId);
        playSound('check');
        render();
      }
      catch{
        toast('Erro ao salvar','⚠');
      }

      break;
    }


    case 'link-pomo':{

      const { pomodoroState } = await import('./pomodoro.js');

      if(pomodoroState.linkedTaskId === id){
        pomodoroState.linkedTaskId = null;
        toast('Pomodoro desvinculado');
      }
      else{
        pomodoroState.linkedTaskId = id;
        const t = state.tasks.find(t=>t.id===id);
        toast(`🍅 Vinculado: ${t?.title?.substring(0,30)||''}`);
      }

      localStorage.setItem('pomodoroState',JSON.stringify(pomodoroState));

      const { updatePomodoroLinked } = await import('./pomodoro.js');
      updatePomodoroLinked();

      render();

      break;
    }

  }

});


// ───────────────── TAG SIDEBAR ─────────────────

bind('tag-sidebar','click',async e=>{

  const isDelBtn = e.target.classList.contains('tg-del');

  if(isDelBtn){

    e.stopPropagation();

    const tag = e.target.dataset.delSubtag;
    const gid = e.target.dataset.delGroup;

    if(tag){

      if(!confirm(`Remover a tag "${tag}"?`)) return;
      await deleteSubtag(gid,tag);

    }else{

      const g = state.groups.find(g=>g.id===gid);
      if(!confirm(`Excluir o grupo "${g?.name}"?`)) return;
      await deleteGroup(gid);

    }

    render();
    return;
  }

  const addEl = e.target.closest('[data-add-subtag]');
  const toggleEl = e.target.closest('[data-group-toggle]');
  const tagEl = e.target.closest('[data-tag]');

  if(addEl){ addSubtagPrompt(addEl.dataset.addSubtag); return; }
  if(toggleEl){ toggleGroup(toggleEl.dataset.groupToggle); return; }
  if(tagEl){ setTagView(tagEl.dataset.tag); }

});


// ───────────────── TASK MODAL ─────────────────

bind('btn-save-task','click',async ()=>{

  const { eTags,ePri,eSubtasks } = getModalState();

  const title = byId('tm-title').value.trim();

  if(!title){
    toast('Título obrigatório','⚠');
    return;
  }

  try{

    await saveTask({

      id: byId('tm-id').value || null,
      title,
      note: byId('tm-note').value,
      date: byId('tm-date').value || null,
      priority:ePri,
      tags:eTags,
      subtasks:eSubtasks

    });

    closeTaskModal();
    render();

  }
  catch{
    toast('Erro ao salvar tarefa','⚠');
  }

});

bind('btn-cancel-task','click',closeTaskModal);
bind('tm-title','input',checkMeetingTitle);
bind('btn-open-calendar','click',openCalendar);

bind('btn-add-subtask','click',()=>addSubtaskModal());

bind('stm-input','keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    addSubtaskModal();
  }
});

document.querySelectorAll('.pri-btn[data-pri]').forEach(btn=>{
  btn.addEventListener('click',()=>selPri(btn.dataset.pri));
});

bind('tag-picker','click',e=>{
  const el = e.target.closest('[data-pick-tag]');
  if(el) toggleTag(el.dataset.pickTag);
});

bind('sel-tags','click',e=>{
  const el = e.target.closest('[data-pick-tag]');
  if(el) toggleTag(el.dataset.pickTag);
});

bind('stm-list','click',e=>{
  const el = e.target.closest('[data-remove-sub]');
  if(el) removeSubtaskModal(parseInt(el.dataset.removeSub));
});


// ───────────────── COMPLETE MODAL ─────────────────

let completeModalBusy=false;

async function runCompleteAction(allDone){

  if(completeModalBusy) return;

  completeModalBusy=true;

  const completeAllBtn=byId('btn-complete-all');
  const promoteSubsBtn=byId('btn-promote-subs');

  if(completeAllBtn) completeAllBtn.disabled=true;
  if(promoteSubsBtn) promoteSubsBtn.disabled=true;

  try{

    closeOverlay('complete-overlay');

    const completed=await completeWithSubs(allDone);

    if(completed && allDone) playSound('check');
    if(completed) render();

  }
  finally{

    if(completeAllBtn) completeAllBtn.disabled=false;
    if(promoteSubsBtn) promoteSubsBtn.disabled=false;

    completeModalBusy=false;

  }

}

bind('btn-complete-all','click',async()=>{
  await runCompleteAction(true);
});

bind('btn-promote-subs','click',async()=>{
  await runCompleteAction(false);
});

bind('btn-cancel-complete','click',()=>closeOverlay('complete-overlay'));


// ───────────────── GROUP MODAL ─────────────────

bind('btn-save-group','click',doSaveGroup);
bind('btn-cancel-group','click',closeGroupModal);

bind('gm-colors','click',e=>{
  const el=e.target.closest('[data-color]');
  if(el) pickGroupColor(el.dataset.color,el);
});


// ───────────────── PREFS ─────────────────

bind('btn-save-prefs','click',doSavePrefs);
bind('btn-cancel-prefs','click',closePrefs);

bind('notif-perm-btn','click',requestNotifPerm);

bind('pref-accent','click',e=>{
  const el=e.target.closest('[data-accent]');
  if(el) pickAccent(el.dataset.accent,el);
});

document.querySelectorAll('#pref-days .day-btn').forEach(btn=>{
  btn.addEventListener('click',()=>btn.classList.toggle('active'));
});


// ───────────────── POMODORO ─────────────────

bind('pomo-play-btn','click',pomodoroToggle);
bind('pomo-reset-btn','click',pomodoroReset);
bind('pomo-skip-btn','click',pomodoroSkip);
bind('pomo-linked-task','click',unlinkPomodoro);


// ───────────────── REPORT ─────────────────

bind('report-container','click',e=>{
  const btn=e.target.closest('[data-month]');
  if(btn) changeMonth(parseInt(btn.dataset.month));
});


// ───────────────── KEYBOARD ─────────────────

document.addEventListener('keydown',e=>{

  if(!state.currentUser) return;

  if(e.key==='Escape'){
    document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));
  }

  if(e.key==='n' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){
    openTaskModal();
  }

});


// ───────────────── BOOT ─────────────────

initAuth();