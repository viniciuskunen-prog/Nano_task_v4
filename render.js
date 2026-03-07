import { state } from './state.js';
import { MONTHS } from './config.js';
import { todayStr, tomorrowStr, weekStr, tagColor, fmtDate, dateStatus, formatTimer, businessHours, fmtHours, getWeeksOfMonth } from './utils.js';
import { timerState, pomodoroState, updatePomodoroLinked, updatePomoStats } from './pomodoro.js';

// ── MAIN RENDER ───────────────────────────────────────────
export function render() {
  if (state.view.type === 'smart' && state.view.value === 'report') {
    updateCounts();
    renderSidebar();
    renderReport();
  } else {
    renderTasks(); // handles updateCounts + renderSidebar internally
  }
  updatePomodoroLinked();
}

// ── COUNTS ────────────────────────────────────────────────
export function updateCounts() {
  const today = todayStr();
  const tom   = tomorrowStr();
  const week  = weekStr();
  const all   = state.tasks;
  document.getElementById('c-all').textContent     = all.filter(t => !t.done).length;
  document.getElementById('c-today').textContent   = all.filter(t => !t.done && t.date === today).length;
  document.getElementById('c-upcoming').textContent= all.filter(t => !t.done && t.date >= tom && t.date <= week).length;
  document.getElementById('c-overdue').textContent = all.filter(t => !t.done && t.date && t.date < today).length;
  document.getElementById('c-done').textContent    = all.filter(t => t.done).length;
  const done = all.filter(t => t.done).length;
  document.getElementById('prog-txt').textContent = `${done} / ${all.length}`;
  document.getElementById('prog-bar').style.width = all.length ? `${(done / all.length) * 100}%` : '0%';
}

// ── SIDEBAR ───────────────────────────────────────────────
export function renderSidebar() {
  const el = document.getElementById('tag-sidebar');
  el.innerHTML = state.groups.map(g => {
    const open = state.expanded.has(g.id);
    const gc = state.tasks.filter(t => !t.done && (t.tags || []).includes(g.name)).length;
    const children = (g.children || []).map(c => {
      const cc = state.tasks.filter(t => !t.done && (t.tags || []).includes(c)).length;
      const ac = state.view.type === 'tag' && state.view.value === c;
      return `<div class="tg-child ${ac ? 'active' : ''}" data-tag="${c}">
        <span class="dot" style="background:${g.color}88"></span>${c}
        ${cc ? `<span class="cnt">${cc}</span>` : ''}
        <span class="tg-del" data-del-subtag="${c}" data-del-group="${g.id}" title="Remover tag">✕</span>
      </div>`;
    }).join('');
    return `<div>
      <div class="tg-header" data-group-toggle="${g.id}">
        <span class="tg-arrow ${open ? 'open' : ''}">▶</span>
        <span class="dot" style="background:${g.color}"></span>
        <span class="tg-name" data-tag="${g.name}">${g.name}</span>
        ${gc ? `<span class="tg-cnt">${gc}</span>` : ''}
        <span class="tg-del" data-del-group="${g.id}" title="Excluir grupo">✕</span>
      </div>
      <div class="tg-children" style="display:${open ? 'block' : 'none'}">
        ${children}
        <div class="add-sub" data-add-subtag="${g.id}">+ sub-tag</div>
      </div>
    </div>`;
  }).join('');
}

// ── TASK LIST ─────────────────────────────────────────────
export function renderTasks() {
  updateCounts();
  renderSidebar();
  const filtered = getFiltered();
  const container = document.getElementById('task-container');

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">
      <div class="empty-icon">◈</div>
      <p>Nenhuma tarefa</p>
      <span>Pressione N para criar</span>
    </div>`;
    return;
  }

  const grps = {};
  filtered.forEach(t => { const k = t.date || '__'; if (!grps[k]) grps[k] = []; grps[k].push(t); });
  const keys = Object.keys(grps).sort((a, b) => {
    if (a === '__') return 1; if (b === '__') return -1; return a.localeCompare(b);
  });

  container.innerHTML = keys.map(k => {
    const label = k === '__' ? 'Sem data' : k === todayStr() ? 'Hoje' : k === tomorrowStr() ? 'Amanhã' : fmtDate(k);
    return `<div class="tgrp">
      <div class="tgrp-label">${label}</div>
      ${grps[k].map(renderTask).join('')}
    </div>`;
  }).join('');
}

function renderTask(t) {
  const ds  = dateStatus(t.date);
  const pc  = t.priority === 'high' ? 'ph' : t.priority === 'medium' ? 'pm' : t.priority === 'low' ? 'pl' : '';
  const subs = t.subtasks || [];
  const subsDone = subs.filter(s => s.done).length;
  const hasSubs = subs.length > 0;
  const subsProg = hasSubs ? Math.round((subsDone / subs.length) * 100) : 0;
  const isExpanded = state.expandedTasks.has(t.id);
  const isRunning = timerState.taskId === t.id && timerState.running;
  const isLinked  = pomodoroState.linkedTaskId === t.id;
  const elapsed = timerState.taskId === t.id
    ? timerState.elapsed + (timerState.running ? Math.floor((Date.now() - timerState.startedAt) / 1000) : 0)
    : (t.time_spent || 0);

  const tags = (t.tags || []).map(tag => {
    const c = tagColor(tag);
    return `<span class="tbadge" style="color:${c};border-color:${c}40;background:${c}12;">${tag}</span>`;
  }).join('');

  const subtasksHtml = hasSubs && isExpanded ? `
    <div class="subtasks-wrap">
      <div class="sub-prog-row">
        <div class="sub-prog-bar"><div class="sub-prog-fill" style="width:${subsProg}%"></div></div>
        <span class="sub-prog-txt">${subsDone}/${subs.length}</span>
      </div>
      ${subs.map(s => `
        <div class="subtask-row">
          <div class="sub-check ${s.done ? 'checked' : ''}" data-action="toggle-subtask" data-task-id="${t.id}" data-sub-id="${s.id}">${s.done ? '✓' : ''}</div>
          <span class="sub-title ${s.done ? 'done' : ''}">${s.title}</span>
        </div>`).join('')}
    </div>` : '';

  return `<div class="task-item ${t.done ? 'done' : ''} ${pc}" id="task-${t.id}">
    <div class="task-main" data-action="edit" data-id="${t.id}">
      <div class="checkbox ${t.done ? 'checked' : ''}" data-action="toggle-done" data-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-title">${t.title}</div>
        ${t.note ? `<div class="task-note">${t.note}</div>` : ''}
        <div class="task-meta">
          ${t.date ? `<span class="task-date ${ds}">◷ ${fmtDate(t.date)}</span>` : ''}
          ${hasSubs ? `<button class="expand-btn" data-action="expand" data-id="${t.id}">
            ⊟ ${subsDone}/${subs.length} ${isExpanded ? '▲' : '▼'}
          </button>` : ''}
          ${tags}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-timer-btn ${isRunning ? 'running' : ''}" data-action="toggle-timer" data-id="${t.id}">
          ${isRunning ? '⏸' : '⏱'}${elapsed > 0 ? ' ' + formatTimer(elapsed) : ''}
        </button>
        <button class="task-pomo-btn ${isLinked ? 'linked' : ''}" data-action="link-pomo" data-id="${t.id}" title="${isLinked ? 'Desvincular do Pomodoro' : 'Vincular ao Pomodoro'}">🍅</button>
        <button class="icon-btn del" data-action="delete" data-id="${t.id}">✕</button>
      </div>
    </div>
    ${subtasksHtml}
  </div>`;
}

export function getFiltered() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const today  = todayStr();
  const tom    = tomorrowStr();
  const week   = weekStr();

  let list = state.tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search)) return false;
    if (state.priFilter !== 'all' && t.priority !== state.priFilter) return false;
    return true;
  });

  if (state.view.type === 'smart') {
    switch (state.view.value) {
      case 'all':      list = list.filter(t => !t.done); break;
      case 'today':    list = list.filter(t => !t.done && t.date === today); break;
      case 'upcoming': list = list.filter(t => !t.done && t.date >= tom && t.date <= week); break;
      case 'overdue':  list = list.filter(t => !t.done && t.date && t.date < today); break;
      case 'done':     list = list.filter(t => t.done); break;
    }
  } else {
    list = list.filter(t => !t.done && (t.tags || []).includes(state.view.value));
  }

  return list;
}

// ── REPORT ────────────────────────────────────────────────
export function renderReport() {
  const { y, m } = state.reportMonth;
  const monthStart = new Date(y, m, 1);
  const monthEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999);

  const monthTasks = state.tasks.filter(t => {
    if (!t.completed_at) return false;
    const d = new Date(t.completed_at);
    return d >= monthStart && d <= monthEnd;
  });

  const total  = monthTasks.length;
  const onTime = monthTasks.filter(t => t.date && new Date(t.completed_at).toISOString().split('T')[0] <= t.date).length;
  const late   = monthTasks.filter(t => t.date && new Date(t.completed_at).toISOString().split('T')[0] > t.date).length;
  const times  = monthTasks.filter(t => t.completed_at && t.created_at)
    .map(t => businessHours(t.created_at, t.completed_at)).filter(h => h > 0);
  const avgTime = times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : 0;
  const weeks = getWeeksOfMonth(y, m);

  const tagMap = {};
  monthTasks.forEach(t => (t.tags || []).forEach(tag => {
    if (!tagMap[tag]) tagMap[tag] = { count: 0, times: [] };
    tagMap[tag].count++;
    const h = businessHours(t.created_at, t.completed_at);
    if (h > 0) tagMap[tag].times.push(h);
  }));
  const tagRanking = Object.entries(tagMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const maxCount = tagRanking[0]?.[1].count || 1;

  document.getElementById('report-container').innerHTML = `
    <div class="report-header">
      <button class="month-btn" data-month="-1">‹</button>
      <div class="month-label">${MONTHS[m]} ${y}</div>
      <button class="month-btn" data-month="1">›</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${total}</div><div class="stat-lbl">Concluídas</div><div class="stat-sub">no mês</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--green)">${onTime}</div><div class="stat-lbl">No prazo</div><div class="stat-sub">${total ? Math.round((onTime / total) * 100) : 0}%</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--red)">${late}</div><div class="stat-lbl">Em atraso</div><div class="stat-sub">${total ? Math.round((late / total) * 100) : 0}%</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--yellow)">${fmtHours(avgTime)}</div><div class="stat-lbl">Tempo médio</div><div class="stat-sub">horas úteis</div></div>
    </div>
    <div class="week-section">
      <div class="week-title">Por semana</div>
      ${weeks.map((w, i) => {
        const wt = monthTasks.filter(t => { const d = new Date(t.completed_at); return d >= w.start && d <= w.end; });
        const wo = wt.filter(t => t.date && new Date(t.completed_at).toISOString().split('T')[0] <= t.date).length;
        const wl = wt.filter(t => t.date && new Date(t.completed_at).toISOString().split('T')[0] > t.date).length;
        const d1 = `${w.start.getDate().toString().padStart(2,'0')}/${(w.start.getMonth()+1).toString().padStart(2,'0')}`;
        const d2 = `${w.end.getDate().toString().padStart(2,'0')}/${(w.end.getMonth()+1).toString().padStart(2,'0')}`;
        return `<div style="margin-bottom:16px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-dim);margin-bottom:8px;">Semana ${i+1} — ${d1} a ${d2}</div>
          <div class="week-cards">
            <div class="week-card"><div class="wc-val" style="color:var(--accent)">${wt.length}</div><div class="wc-lbl">Concluídas</div></div>
            <div class="week-card"><div class="wc-val" style="color:var(--green)">${wo}</div><div class="wc-lbl">No prazo</div></div>
            <div class="week-card"><div class="wc-val" style="color:var(--red)">${wl}</div><div class="wc-lbl">Em atraso</div></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${tagRanking.length ? `<div class="week-section"><div class="week-title">Ranking de Tags</div>
      ${tagRanking.map(([tag, data], i) => {
        const c = tagColor(tag);
        const avg = data.times.length ? Math.round((data.times.reduce((a, b) => a + b, 0) / data.times.length) * 10) / 10 : 0;
        return `<div class="tag-rank-row">
          <span class="tr-num">${i+1}</span>
          <span class="dot" style="background:${c}"></span>
          <span style="flex:1;font-size:13px;font-weight:600;">${tag}</span>
          <div class="tr-bar-wrap"><div class="tr-bar" style="background:${c};width:${Math.round((data.count/maxCount)*100)}%"></div></div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);">${data.count}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim);margin-left:8px;">${avg ? fmtHours(avg) + ' avg' : '—'}</span>
        </div>`;
      }).join('')}
    </div>` : ''}
    ${total === 0 ? `<div class="empty"><div class="empty-icon">◑</div><p>Sem dados para ${MONTHS[m]}</p><span>Conclua tarefas para ver o relatório</span></div>` : ''}`;
}

// ── TAG PICKER (modal) ────────────────────────────────────
export function renderTagPicker(eTags) {
  document.getElementById('tag-picker').innerHTML = state.groups.map(g => {
    const pSel = eTags.includes(g.name);
    const children = (g.children || []).map(c => {
      const s = eTags.includes(c);
      return `<div class="tp-child ${s ? 'sel' : ''}" data-pick-tag="${c}">
        <span class="tp-check">${s ? '✓' : ''}</span>
        <span class="dot" style="background:${g.color}88"></span>${c}
      </div>`;
    }).join('');
    return `<div>
      <div class="tp-parent" data-pick-tag="${g.name}">
        <span class="dot" style="background:${g.color}"></span>
        <span style="flex:1">${g.name}</span>
        ${pSel ? '<span style="color:var(--accent);font-size:11px;">✓</span>' : ''}
      </div>${children}
    </div>`;
  }).join('');
  renderSelTags(eTags);
}

export function renderSelTags(eTags) {
  document.getElementById('sel-tags').innerHTML = eTags.map(t => {
    const c = tagColor(t);
    return `<span class="stag" style="background:${c}18;color:${c};border:1px solid ${c}40;" data-pick-tag="${t}">${t} <span class="x">×</span></span>`;
  }).join('');
}

export function renderSubtaskModal(eSubtasks) {
  document.getElementById('stm-list').innerHTML = eSubtasks.map((s, i) => `
    <div class="stm-row">
      <span style="color:var(--text-dim);font-size:11px;">⊟</span>
      <span class="stm-title">${s.title}</span>
      <span class="stm-del" data-remove-sub="${i}">✕</span>
    </div>`).join('');
}
