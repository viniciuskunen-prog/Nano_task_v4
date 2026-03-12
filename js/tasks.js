import { sb } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { awardXP } from './xp.js';
import { checkBadges } from './badges.js';
import { pomodoroState, pomodoroReset, stopPomodoro, unlinkTask, updatePomodoroUI } from './pomodoro.js';

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
export async function saveTask({ id, title, note, date, priority, tags, subtasks, recurrence = 'none', column_id = null }) {
  const now = new Date().toISOString();
  const taskData = { title, note, date: date || null, priority, tags, recurrence };

  try {
    if (id) {
      let didUpdate = false;
      try {
        const { error } = await sb.from('tasks').update(taskData).eq('id', id);
        if (error) throw error;
      } catch (e) {
        if (e.message && e.message.includes('recurrence')) {
          const safeData = { title, note, date: date || null, priority, tags };
          await sb.from('tasks').update(safeData).eq('id', id);
        } else {
          throw e;
        }
      }

      const t = state.tasks.find(t => t.id === id);
      if (t) Object.assign(t, taskData);

      const existingSubs = t?.subtasks || [];
      const existingIds = existingSubs.map(s => s.id);
      const keepIds = subtasks.filter(s => s.id).map(s => s.id);
      const toDelete = existingIds.filter(i => !keepIds.includes(i));

      if (toDelete.length > 0) {
        await sb.from('subtasks').delete().in('id', toDelete);
      }

      const toUpdate = subtasks.filter(s => s.id && existingIds.includes(s.id));
      const toInsert = subtasks.filter(s => !s.id);

      // Handle updates in parallel
      await Promise.all(toUpdate.map((s, i) =>
        sb.from('subtasks').update({
          title: s.title, done: s.done, date: s.date || date, tags: s.tags?.length ? s.tags : tags, position: i
        }).eq('id', s.id)
      ));

      // Handle bulk insert for new subtasks
      if (toInsert.length > 0) {
        const insertData = toInsert.map((s, i) => ({
          task_id: id, user_id: state.currentUser.id,
          title: s.title, done: false,
          date: s.date || date, tags: s.tags?.length ? s.tags : tags, position: toUpdate.length + i,
        }));
        const { data: newSubs } = await sb.from('subtasks').insert(insertData).select();

        // Update original subtasks array with new data (to get IDs)
        if (newSubs) {
          let insertIdx = 0;
          for (let i = 0; i < subtasks.length; i++) {
            if (!subtasks[i].id) {
              subtasks[i] = { ...newSubs[insertIdx] };
              insertIdx++;
            }
          }
        }
      }

      if (t) t.subtasks = subtasks;
      toast('Atualizada ✦');
    } else {
      let newTask;
      const targetColumnId = column_id || state.columns?.[0]?.id || null;
      let targetPosition = 0;
      
      if (targetColumnId) {
        const colTasks = state.tasks.filter(t => t.column_id === targetColumnId);
        targetPosition = colTasks.length;
      }
      
      try {
        const { data, error } = await sb.from('tasks').insert({
          ...taskData, 
          user_id: state.currentUser.id, 
          done: false, 
          created_at: now,
          column_id: targetColumnId,
          position: targetPosition
        }).select().single();
        if (error) throw error;
        newTask = data;
      } catch (e) {
        if (e.message && e.message.includes('recurrence')) {
          const safeData = { title, note, date: date || null, priority, tags };
          const { data, error } = await sb.from('tasks').insert({
            ...safeData, 
            user_id: state.currentUser.id, 
            done: false, 
            created_at: now,
            column_id: targetColumnId,
            position: targetPosition
          }).select().single();
          if (error) throw error;
          newTask = data;
          newTask.recurrence = recurrence; // keep local state
        } else throw e;
      }

      if (newTask) {
        let insertedSubs = [];
        if (subtasks.length > 0) {
          const subsToInsert = subtasks.map((s, i) => ({
            task_id: newTask.id, user_id: state.currentUser.id,
            title: s.title, done: false,
            date: s.date || date, tags: s.tags?.length ? s.tags : tags, position: i,
          }));
          const { data: subs, error: subError } = await sb.from('subtasks').insert(subsToInsert).select();
          if (subError) console.error('[tasks] erro nas subtasks do create:', subError);
          insertedSubs = subs || [];
        }
        state.tasks.unshift({ 
          ...newTask, 
          tags: newTask.tags || [], 
          subtasks: insertedSubs
        });
        toast('Criada ✦');
      }
    }
  } catch (err) {
    console.error('[tasks] erro em saveTask:', err);
    toast('Erro ao salvar', '⚠');
    throw err;
  }
}

const deleteTimers = new Map();
const deletedTasksMap = new Map();

export async function deleteTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;

  deletedTasksMap.set(id, { ...t });
  state.tasks = state.tasks.filter(t => t.id !== id);
  
  const { render } = await import('./render.js');
  render();

  toast('Tarefa removida', 'trash-2', {
    label: 'Desfazer',
    callback: () => {
      const timer = deleteTimers.get(id);
      if (timer) clearTimeout(timer);
      
      const restoredTask = deletedTasksMap.get(id);
      if (restoredTask) {
        state.tasks.unshift(restoredTask);
        deletedTasksMap.delete(id);
        deleteTimers.delete(id);
        render();
        toast('Tarefa restaurada');
      }
    }
  });

  if (deleteTimers.has(id)) clearTimeout(deleteTimers.get(id));
  
  const timer = setTimeout(async () => {
    deleteTimers.delete(id);
    deletedTasksMap.delete(id);

    // Proteger Pomodoro: se tarefa está vinculada, parar e desvincular
    if (pomodoroState.linkedTaskId === id) {
      stopPomodoro();
      pomodoroReset();
      unlinkTask();
    }

    try {
      const { error } = await sb.from('tasks').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('[tasks] Erro na deleção definitiva:', err);
    }
  }, 5000);

  deleteTimers.set(id, timer);
}

export async function updateTaskPosition(taskId, newColId, newPosition) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return;

  t.column_id = newColId;
  t.position = newPosition;

  try {
    await sb.from('tasks').update({ column_id: newColId, position: newPosition }).eq('id', taskId);
  } catch (err) {
    console.error('[tasks] erro em updateTaskPosition:', err);
    toast('Erro ao mover tarefa', '⚠');
  }
}

export async function toggleDone(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return false;

  // Detectar primeira conclusão real: completed_at ainda não foi setado
  // Isso previne XP infinito: completed_at é preservado na reabertura e nunca zerado
  const wasFirstCompletion = !t.completed_at;

  t.done = !t.done;
  const now = new Date().toISOString();
  if (t.done && !t.completed_at) {
    t.completed_at = now; // só seta na primeira conclusão; reabertura não zera
  }

  // XP only granted if it's the first time completing
  let awardedXp = false;
  if (wasFirstCompletion && t.done) {
    awardedXp = true;
  }

  // Ao reabrir, não sobrescreve completed_at no banco (mantém marcador permanente)
  const dbUpdate = t.done
    ? { done: true, completed_at: t.completed_at }
    : { done: false };
  await sb.from('tasks').update(dbUpdate).eq('id', id);

  // Conceder XP ao concluir tarefa pela primeira vez
  if (awardedXp) {
    Promise.all([
      awardXP('task_complete', id),
      logActivity('task_completed', 4), // task_complete = 4 XP
      checkBadges('task_complete')
    ]).catch(err => console.warn('[tasks] Erro na requisição XP:', err));
  }

  // Se a tarefa vinculada ao pomodoro foi concluída, parar o pomodoro
  if (t.done && pomodoroState.linkedTaskId === id) {
    stopPomodoro();
    pomodoroReset();
    unlinkTask();
  }

  if (t.done) {
    await handleRecurrence(t);
  }

  return t.done;
}

export async function completeWithSubs(allDone) {
  const t = state.tasks.find(t => t.id === state.pendingCompleteId);
  if (!t) return;
  const now = new Date().toISOString();
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

  t.done = true; t.completed_at = now;

  // Log activity and grant XP if it's the first time
  if (!t.firstCompletion) {
    t.firstCompletion = true;
    Promise.all([
      awardXP('task_complete', t.id),
      logActivity('task_completed', 4),
      checkBadges('task_complete')
    ]).catch(err => console.warn('[tasks] Erro na XP via modal:', err));
  }

  await sb.from('tasks').update({ done: true, completed_at: now }).eq('id', t.id);
  state.pendingCompleteId = null;

  await handleRecurrence(t);
  toast('Tarefa concluída ✦');
}

// ── SUBTASKS ──────────────────────────────────────────────
export async function toggleSubtask(taskId, subId) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return;
  const s = t.subtasks.find(s => s.id === subId);
  if (!s) return;

  // Detectar primeira conclusão real: completed_at ainda não foi setado
  // Isso previne XP infinito: completed_at é preservado na reabertura e nunca zerado
  const wasFirstCompletion = !s.completed_at;

  s.done = !s.done;
  const now = new Date().toISOString();
  if (s.done && !s.completed_at) {
    s.completed_at = now; // só seta na primeira conclusão; reabertura não zera
  }
  const subDbUpdate = s.done
    ? { done: true, completed_at: s.completed_at }
    : { done: false };
  await sb.from('subtasks').update(subDbUpdate).eq('id', subId);

  // Conceder XP apenas na primeira conclusão real (rodando em background para não bloquear a UI)
  if (wasFirstCompletion && s.done) {
    Promise.all([
      awardXP('subtask_complete', subId),
      logActivity('subtask_completed', 1), // subtask_complete = 1 XP
      checkBadges('subtask_complete')
    ]).catch(err => console.warn('[tasks] Erro silencioso ao conceder XP da subtarefa:', err));
  }

  const allDone = t.subtasks.every(sub => sub.done);
  if (allDone && !t.done) {
    t.done = true;
    const isFirstTaskCompletion = !t.completed_at;
    if (!t.completed_at) {
      t.completed_at = now; // só seta na primeira conclusão; preservado ao reabrir
    }
    if (isFirstTaskCompletion) {
      Promise.all([
        awardXP('task_complete', taskId),
        logActivity('task_completed', 4),
        checkBadges('task_complete')
      ]).catch(err => console.warn('[tasks] Erro silencioso ao conceder XP da tarefa via subtarefas:', err));
    }

    await sb.from('tasks').update({ done: true, completed_at: t.completed_at }).eq('id', taskId);
    toast('Todas subtarefas concluídas! ✦');

    // Proteger Pomodoro: se tarefa foi concluída automaticamente
    if (pomodoroState.linkedTaskId === taskId) {
      pomodoroReset();
      unlinkTask();
    }

    await handleRecurrence(t);
  }
}

// ── RECURRENCE & DUPLICATE ────────────────────────────────
export async function handleRecurrence(t) {
  if (t.recurrence && t.recurrence !== 'none') {
    let newDate = null;
    if (t.date) {
      const d = new Date(t.date);
      const [year, month, day] = t.date.split('-');
      d.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));

      if (t.recurrence === 'daily') d.setDate(d.getDate() + 1);
      if (t.recurrence === 'weekly') d.setDate(d.getDate() + 7);
      if (t.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);

      const newY = d.getFullYear();
      const newM = String(d.getMonth() + 1).padStart(2, '0');
      const newD = String(d.getDate()).padStart(2, '0');
      newDate = `${newY}-${newM}-${newD}`;
    }

    const duplicatedSubtasks = (t.subtasks || []).map(s => ({
      title: s.title, done: false, date: newDate || s.date, tags: s.tags,
    }));

    await saveTask({
      id: null,
      title: t.title,
      note: t.note,
      date: newDate,
      priority: t.priority,
      tags: t.tags,
      subtasks: duplicatedSubtasks,
      recurrence: t.recurrence
    });
  }
}

export async function duplicateTask(id) {
  const t = state.tasks.find(task => task.id === id);
  if (!t) return false;

  const duplicatedSubtasks = (t.subtasks || []).map(s => ({
    title: s.title,
    done: false,
    date: s.date,
    tags: s.tags,
  }));

  await saveTask({
    id: null,
    title: t.title + ' [COPIA]',
    note: t.note,
    date: t.date,
    priority: t.priority,
    tags: t.tags,
    subtasks: duplicatedSubtasks,
    recurrence: t.recurrence || 'none'
  });

  toast('Tarefa duplicada ⎘');
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

// ── BOARD COLUMNS ─────────────────────────────────────────

export async function loadColumns() {
  const { data, error } = await sb
    .from('columns')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('position', { ascending: true });

  if (error) {
    console.error('[columns] erro ao carregar colunas:', error);
    return;
  }

  // se não existir nenhuma coluna cria a padrão
  if (!data || data.length === 0) {
    const { data: newCol, error: createErr } = await sb
      .from('columns')
      .insert({
        user_id: state.currentUser.id,
        name: 'Tarefas',
        position: 0
      })
      .select()
      .single();

    if (!createErr && newCol) {
      state.columns = [newCol];
    }
    return;
  }

  state.columns = data;
}

export async function createColumn(name) {
  if (state.columns.length >= 8) {
    toast('Limite de 8 colunas atingido', '⚠');
    return false;
  }

  const { data, error } = await sb.from('columns')
    .insert({
      user_id: state.currentUser.id,
      name,
      position: state.columns.length
    })
    .select()
    .single();

  if (error) {
    console.error('[columns] erro ao criar coluna:', error);
    toast('Erro ao criar coluna', '⚠');
    return false;
  }

  state.columns.push(data);
  return true;
}

export async function renameColumn(columnId, newName) {
  const { error } = await sb
    .from('columns')
    .update({ name: newName })
    .eq('id', columnId);

  if (error) {
    console.error('[columns] erro ao renomear:', error);
    toast('Erro ao renomear coluna', '⚠');
    return false;
  }

  const col = state.columns.find(c => c.id === columnId);
  if (col) col.name = newName;
  
  return true;
}

export async function deleteColumn(columnId) {
  if (state.columns.length <= 1) {
    toast('Você precisa ter pelo menos uma coluna', '⚠');
    return false;
  }

  const firstColumn = state.columns.find(c => c.id !== columnId) || state.columns[0];
  const tasksToMove = state.tasks.filter(t => t.column_id === columnId);
  const existingInDest = state.tasks.filter(t => t.column_id === firstColumn.id);
  const basePosition = existingInDest.length;

  for (let i = 0; i < tasksToMove.length; i++) {
    const t = tasksToMove[i];
    t.column_id = firstColumn.id;
    t.position = basePosition + i;
    await sb
      .from('tasks')
      .update({ column_id: firstColumn.id, position: basePosition + i })
      .eq('id', t.id);
  }

  const { error } = await sb
    .from('columns')
    .delete()
    .eq('id', columnId);

  if (error) {
    console.error('[columns] erro ao deletar coluna:', error);
    toast('Erro ao deletar coluna', '⚠');
    return false;
  }

  state.columns = state.columns.filter(c => c.id !== columnId);
  return true;
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
  try { await sb.from('tasks').update({ time_spent: seconds }).eq('id', taskId); } catch (err) { console.warn('[tasks] Erro em saveTaskTime', err); }
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
