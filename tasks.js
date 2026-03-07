import { sb } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { awardXP } from './xp.js';
import { checkBadges } from './badges.js';
import { pomodoroState, pomodoroReset, stopPomodoro, unlinkTask, updatePomodoroUI } from './pomodoro.js';

const completionInFlight = new Set();

// ── ACTIVITY LOGGING ──────────────────────────
export async function logActivity(type, xpValue = 0) {
  try {
    await sb.from('activity_log').insert({
      user_id: state.currentUser.id,
      type,
      xp: xpValue,
    });
  } catch (e) {
    console.error('[tasks] erro ao registrar atividade:', e);
  }
}

// ── TASKS ─────────────────────────────────────────────────
export async function saveTask({ id, title, note, date, priority, tags, subtasks }) {
  const now = new Date().toISOString();
  const taskData = { title, note, date: date || null, priority, tags };

  if (id) {
    await sb.from('tasks').update(taskData).eq('id', id);
    const t = state.tasks.find(t => t.id === id);
    if (t) Object.assign(t, taskData);

    const existingSubs = t?.subtasks || [];
    const existingIds = existingSubs.map(s => s.id);
    const keepIds = subtasks.filter(s => s.id).map(s => s.id);
    const toDelete = existingIds.filter(i => !keepIds.includes(i));

    await Promise.all(toDelete.map(sid => sb.from('subtasks').delete().eq('id', sid)));

    for (let i = 0; i < subtasks.length; i++) {
      const s = subtasks[i];
      if (!s.date && date) s.date = date;
      if (!s.tags?.length) s.tags = tags;
      if (s.id && existingIds.includes(s.id)) {
        await sb.from('subtasks').update({
          title: s.title, done: s.done, date: s.date, tags: s.tags, position: i
        }).eq('id', s.id);
      } else {
        const { data } = await sb.from('subtasks').insert({
          task_id: id, user_id: state.currentUser.id,
          title: s.title, done: false,
          date: s.date || date, tags: s.tags?.length ? s.tags : tags, position: i,
        }).select().single();
        if (data) subtasks[i] = { ...data };
      }
    }
    if (t) t.subtasks = subtasks;
    toast('Atualizada ✦');
  } else {
    const { data: newTask } = await sb.from('tasks').insert({
      ...taskData, user_id: state.currentUser.id, done: false, created_at: now,
    }).select().single();

    if (newTask) {
      const subsToInsert = subtasks.map((s, i) => ({
        task_id: newTask.id, user_id: state.currentUser.id,
        title: s.title, done: false,
        date: s.date || date, tags: s.tags?.length ? s.tags : tags, position: i,
      }));
      let insertedSubs = [];
      if (subsToInsert.length) {
        const { data: subs } = await sb.from('subtasks').insert(subsToInsert).select();
        insertedSubs = subs || [];
      }
      state.tasks.unshift({ ...newTask, tags: newTask.tags || [], subtasks: insertedSubs });
      toast('Criada ✦');
    }
  }
}

export async function deleteTask(id) {
  if (!confirm('Delete this task?')) return false;

  // Proteger Pomodoro: se tarefa está vinculada, parar e desvincular
  if (pomodoroState.linkedTaskId === id) {
    stopPomodoro();
    pomodoroReset();
    unlinkTask();
  }
  
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) throw error;
  state.tasks = state.tasks.filter(t => t.id !== id);
  toast('Removida', '✕');
  return true;
}

export async function toggleDone(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return false;
  
  // Detectar primeira conclusão real: done era false E completed_at era null
  // Isso previne XP infinito na Fase 3 (XP concedido apenas na primeira conclusão)
  const wasFirstCompletion = t.done === false && t.completed_at === null;
  
  t.done = !t.done;
  const now = new Date().toISOString();
  t.completed_at = t.done ? now : null;
  
  // Marcar internamente primeira conclusão para uso do sistema de XP
  t.firstCompletion = wasFirstCompletion && t.done;
  
  await sb.from('tasks').update({ done: t.done, completed_at: t.completed_at }).eq('id', id);
  
  // Conceder XP ao concluir tarefa pela primeira vez
  if (t.firstCompletion) {
    await awardXP('task_complete', id);
    await logActivity('task_completed', 4); // task_complete = 4 XP
    await checkBadges('task_complete');
  }
  
  // Se a tarefa vinculada ao pomodoro foi concluída, parar o pomodoro
  if (t.done && pomodoroState.linkedTaskId === id) {
    stopPomodoro();
    pomodoroReset();
    unlinkTask();
  }
  
  return t.done;
}

export async function completeTask(id) {
  const t = state.tasks.find(task => task.id === id);
  if (!t) return false;

  // Guard clause: impede múltiplos cliques em tarefa já concluída
  if (t.done) return false;

  const wasFirstCompletion = t.completed_at === null;
  t.done = true;
  const now = new Date().toISOString();
  t.completed_at = now;
  t.firstCompletion = wasFirstCompletion;

  await sb.from('tasks').update({ done: true, completed_at: now }).eq('id', id);

  if (t.firstCompletion) {
    await awardXP('task_complete', id);
    await logActivity('task_completed', 4);
    await checkBadges('task_complete');
  }

  if (pomodoroState.linkedTaskId === id) {
    stopPomodoro();
    pomodoroReset();
    unlinkTask();
  }

  return true;
}

export async function handleTaskCompletion(id) {
  const t = state.tasks.find(task => task.id === id);
  if (!t) return { status: 'not_found' };

  if (t.done) {
    return { status: 'already_completed' };
  }

  const pending = (t.subtasks || []).filter(s => !s.done);
  if (pending.length) {
    return { status: 'pending_subtasks' };
  }

  const completed = await completeTask(id);
  return { status: completed ? 'completed' : 'noop' };
}

export async function completeWithSubs(allDone) {
  const pendingId = state.pendingCompleteId;
  if (!pendingId) return false;
  if (completionInFlight.has(pendingId)) return false;

  const t = state.tasks.find(t => t.id === pendingId);
  if (!t) {
    state.pendingCompleteId = null;
    return false;
  }

  completionInFlight.add(pendingId);
  const now = new Date().toISOString();
  try {
    const pendingSubs = (t.subtasks || []).filter(s => !s.done);

    if (allDone) {
      await Promise.all(pendingSubs.map(s => {
        s.done = true; s.completed_at = now;
        return sb.from('subtasks').update({ done: true, completed_at: now }).eq('id', s.id);
      }));
    } else {
      const results = await Promise.all(pendingSubs.map(s =>
        sb.from('tasks').insert({
          user_id: state.currentUser.id, title: s.title, note: '',
          date: s.date || t.date, priority: 'none',
          tags: s.tags?.length ? s.tags : t.tags, done: false, created_at: now,
        }).select().single()
      ));
      for (const { data } of results) {
        if (data) state.tasks.unshift({ ...data, tags: data.tags || [], subtasks: [] });
      }
      await Promise.all(pendingSubs.map(s => sb.from('subtasks').delete().eq('id', s.id)));
      t.subtasks = t.subtasks.filter(sub => !pendingSubs.find(p => p.id === sub.id));
    }

    await completeTask(t.id);
    state.pendingCompleteId = null;
    toast('Tarefa concluída ✦');
    return true;
  } finally {
    completionInFlight.delete(pendingId);
  }
}

// ── SUBTASKS ──────────────────────────────────────────────
export async function toggleSubtask(taskId, subId) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return;
  const s = t.subtasks.find(s => s.id === subId);
  if (!s) return;

  // Detectar primeira conclusão real: done era false E completed_at era null
  // Isso previne XP infinito (só concede XP na primeira conclusão real)
  const wasFirstCompletion = s.done === false && s.completed_at === null;

  s.done = !s.done;
  const now = new Date().toISOString();
  s.completed_at = s.done ? now : null;
  await sb.from('subtasks').update({ done: s.done, completed_at: s.completed_at }).eq('id', subId);

  // Conceder XP apenas na primeira conclusão real
  if (wasFirstCompletion && s.done) {
    await awardXP('subtask_complete', subId);
    await logActivity('subtask_completed', 1); // subtask_complete = 1 XP
    await checkBadges('subtask_complete');
  }

  const allDone = t.subtasks.every(sub => sub.done);
  if (allDone && !t.done) {
    const completed = await completeTask(taskId);
    if (completed) toast('Todas subtarefas concluídas! ✦');
    
    // Proteger Pomodoro: se tarefa foi concluída automaticamente
    if (pomodoroState.linkedTaskId === taskId) {
      pomodoroReset();
      unlinkTask();
    }
  }
}

// ── GROUPS ────────────────────────────────────────────────
export async function saveGroup({ name, color, children }) {
  const { data } = await sb.from('tag_groups').insert({
    user_id: state.currentUser.id, name, color, children, position: state.groups.length,
  }).select().single();
  if (data) { state.groups.push(data); state.expanded.add(data.id); }
  toast('Grupo criado ✦');
}

export async function addSubtag(gid, tagName) {
  const g = state.groups.find(g => g.id === gid);
  if (!g || (g.children || []).includes(tagName)) return;
  g.children = [...(g.children || []), tagName];
  await sb.from('tag_groups').update({ children: g.children }).eq('id', gid);
}

// ── PREFERENCES ───────────────────────────────────────────
export async function savePrefs(updates) {
  await sb.from('profiles').upsert({ id: state.currentUser.id, ...updates });
  Object.assign(state.profile, updates);
}

// ── TIMER PERSISTENCE ─────────────────────────────────────
export async function saveTaskTime(taskId, seconds) {
  const t = state.tasks.find(t => t.id === taskId);
  if (t) t.time_spent = seconds;
  try { await sb.from('tasks').update({ time_spent: seconds }).eq('id', taskId); } catch (_) {}
}

// ── DELETE GROUP / TAG ────────────────────────────────────
export async function deleteGroup(gid) {
  await sb.from('tag_groups').delete().eq('id', gid);
  state.groups = state.groups.filter(g => g.id !== gid);
}

export async function deleteSubtag(gid, tagName) {
  const g = state.groups.find(g => g.id === gid);
  if (!g) return;
  g.children = (g.children || []).filter(c => c !== tagName);
  await sb.from('tag_groups').update({ children: g.children }).eq('id', gid);
}
