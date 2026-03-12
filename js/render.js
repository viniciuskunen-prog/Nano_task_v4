import { state } from './state.js';
import { MONTHS } from './config.js';
import { todayStr, tomorrowStr, weekStr, tagColor, fmtDate, dateStatus, formatTimer, businessHours, fmtHours, getWeeksOfMonth, escapeHTML } from './utils.js';
import { timerState, pomodoroState, updatePomoStats } from './pomodoro.js';
import { updateTaskPosition } from './tasks.js';
import { renderReportUI } from './report.js';

// ── MAIN RENDER ───────────────────────────────────────────
export function render() {
  updateSubscriptionUI();
  if (state.view.type === 'smart' && state.view.value === 'report') {
    updateCounts();
    renderSidebar();
    renderReport();
  } else if (state.view.type === 'smart' && state.view.value === 'tutorial') {
    renderTutorial();
  } else {
    renderTasks(); // handles updateCounts + renderSidebar internally
  }
}

export function updateSubscriptionUI() {
  const profile = state.profile;
  const bannerContainer = document.getElementById('trial-banner-container');
  const restrictedView = document.getElementById('restricted-view');

  if (!profile) return;

  // 1. Mostrar OVERLAY DE BLOQUEIO se estiver bloqueado
  if (restrictedView) {
    if (profile.isBlocked) {
      restrictedView.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      restrictedView.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  // 2. Mostrar BANNER DE TRIAL se não for assinado e o trial ainda estiver ativo
  if (!bannerContainer) return;
  if (!profile.isTrialActive || profile.subscription_status === 'active') {
    bannerContainer.innerHTML = '';
  } else {
    const days = profile.trialDaysLeft;

    // O banner aparece no 3º dia de uso (ou seja, quando restam 5 dias ou menos)
    if (days > 5) {
      bannerContainer.innerHTML = '';
    } else {
      const isUrgent = days <= 1;
      const bannerClass = isUrgent ? 'trial-banner red' : 'trial-banner yellow';
      const textMsg = isUrgent
        ? `Seu teste grátis acaba em <strong>${days === 1 ? '1 dia' : 'algumas horas'}</strong>! Assine para não perder o acesso.`
        : `Você está no período de teste grátis. Restam <strong>${days} dias</strong>.`;

      bannerContainer.innerHTML = `
        <div class="${bannerClass}">
          <div class="trial-banner-icon">${isUrgent ? '⚠️' : '🔔'}</div>
          <div class="trial-banner-text">
            ${textMsg}
          </div>
          <button class="trial-banner-btn" onclick="window.openCheckout?.('annual')">Assinar</button>
        </div>
      `;
    }
  }
}

// ── COUNTS ────────────────────────────────────────────────
export function updateCounts() {
  const today = todayStr();
  const tom = tomorrowStr();
  const week = weekStr();
  const all = state.tasks;
  document.getElementById('c-all').textContent = all.filter(t => !t.done).length;
  document.getElementById('c-today').textContent = all.filter(t => !t.done && t.date === today).length;
  document.getElementById('c-upcoming').textContent = all.filter(t => !t.done && t.date >= tom && t.date <= week).length;
  document.getElementById('c-overdue').textContent = all.filter(t => !t.done && t.date && t.date < today).length;
  document.getElementById('c-done').textContent = all.filter(t => t.done).length;
  const done = all.filter(t => t.done).length;
  document.getElementById('prog-txt').textContent = `${done} / ${all.length}`;
  document.getElementById('prog-bar').style.width = all.length ? `${(done / all.length) * 100}%` : '0%';
}

// ── SIDEBAR ───────────────────────────────────────────────
export function renderSidebar() {
  const el = document.getElementById('tag-sidebar');
  el.innerHTML = state.groups.map(g => {
    const open = state.expanded.has(g.id);
    const gc = state.tasks.filter(t => !t.done && (t.tags || []).some(tag => tag === g.name || tag === `${g.name}:${g.name}`)).length;
    const children = (g.children || []).map(c => {
      const cc = state.tasks.filter(t => !t.done && (t.tags || []).some(tag => tag === c || tag === `${g.name}:${c}`)).length;
      const ac = state.view.type === 'tag' && state.view.value === c;
      return `<div class="tg-child ${ac ? 'active' : ''}" data-tag="${escapeHTML(c)}">
        <span class="dot" style="background:${g.color}88"></span>${escapeHTML(c)}
        ${cc ? `<span class="cnt">${cc}</span>` : ''}
        <span class="tg-del" data-del-subtag="${c}" data-del-group="${g.id}" title="Remover tag">✕</span>
      </div>`;
    }).join('');
    return `<div>
      <div class="tg-header" data-group-toggle="${g.id}">
        <span class="tg-arrow ${open ? 'open' : ''}">▶</span>
        <span class="dot" style="background:${g.color}"></span>
        <span class="tg-name" data-tag="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span>
        ${gc ? `<span class="tg-cnt">${gc}</span>` : ''}
        <span class="tg-del" data-del-group="${g.id}" title="Excluir grupo">✕</span>
      </div>
      <div class="tg-children" style="display:${open ? 'block' : 'none'}">
        ${children}
        <div class="add-sub" data-add-subtag="${g.id}">+ sub-tag</div>
      </div>
    </div>`;
  }).join('');

  // Update Group Filter Dropdown
  const groupSelect = document.getElementById('group-filter-select');
  if (groupSelect) {
    const currentVal = groupSelect.value;
    const optionsHtml = `<option value="all">Todos os Grupos</option>` + state.groups.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join('');
    if (groupSelect.innerHTML !== optionsHtml) {
      groupSelect.innerHTML = optionsHtml;
      groupSelect.value = state.groups.some(g => g.id === currentVal) ? currentVal : 'all';
    }
  }
}

// ── DAILY & GENERAL WIDGET UPDATES ────────────────────────
export function updateRightPanelWidgets() {
  // General Progress
  const allTasks = state.tasks;
  const doneAll = allTasks.filter(t => t.done).length;
  const totalAll = allTasks.length;
  const genPct = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0;

  const progTxt = document.getElementById('prog-txt');
  const progBar = document.getElementById('prog-bar');
  if (progTxt) progTxt.textContent = `${doneAll} / ${totalAll} (${genPct}%)`;
  if (progBar) progBar.style.width = `${genPct}%`;

  // Daily Tasks
  const today = todayStr();
  const todayTasks = allTasks.filter(t => t.date === today);
  const doneToday = todayTasks.filter(t => t.done).length;
  const totalToday = todayTasks.length;

  const pct = totalToday > 0 ? doneToday / totalToday : 0;

  const circle = document.getElementById('daily-progress');
  if (circle) {
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - pct * circumference;
    circle.style.strokeDashoffset = offset;
  }

  const textEl = document.getElementById('daily-text');
  if (textEl) textEl.textContent = `${doneToday}/${totalToday}`;

  const msgEl = document.getElementById('daily-msg');
  if (msgEl) {
    if (totalToday === 0) {
      msgEl.textContent = 'Tranquilo por hoje!';
    } else if (doneToday === totalToday) {
      msgEl.textContent = 'Dia concluído! 🎉';
    } else if (pct >= 0.5) {
      msgEl.textContent = 'Passamos da metade!';
    } else {
      msgEl.textContent = 'Bora começar!';
    }
  }

  // Update XP in the right panel
  import('./xp.js').then(m => {
    const { xpCurrentLevel, xpNextLevel, progressPercent, level } = m.getLevelFromXP(state.profile.xp_total || 0);
    const xpPercentEl = document.getElementById('xp-bar-percent');
    const xpProgressEl = document.getElementById('xp-bar-progress');
    const xpLevelEl = document.getElementById('xp-bar-level');

    if (xpPercentEl) xpPercentEl.textContent = `${progressPercent}%`;
    if (xpProgressEl) xpProgressEl.style.width = `${progressPercent}%`;
    if (xpLevelEl) xpLevelEl.textContent = `Nível ${level}`;
  }).catch(() => { });

  renderMiniCalendar();
}

export function renderTasks() {
  updateCounts();
  renderSidebar();
  updateRightPanelWidgets();
  
  const listContainer = document.getElementById('task-container');
  const boardContainer = document.getElementById('board-container');

  if (state.displayMode === 'board') {
    if (listContainer) listContainer.style.display = 'none';
    if (boardContainer) boardContainer.style.display = 'flex';
    renderBoard();
    return;
  } else {
    if (listContainer) listContainer.style.display = 'block';
    if (boardContainer) boardContainer.style.display = 'none';
  }
  
  const filtered = getFiltered();
  const searchInput = document.getElementById('search-input');
  const search = searchInput?.value.trim() || '';
  const container = listContainer;

  // QUICK ADD HEADER (Only in List Mode)
  const quickAddHtml = `
    <div class="quick-add-container">
      <input type="text" id="quick-add-input" placeholder="Digite uma tarefa e pressione Enter" class="quick-add-input">
    </div>
  `;

  if (!filtered.length) {
    if (search) {
      container.innerHTML = quickAddHtml + `<div class="empty">
        <div class="empty-icon"><i data-lucide="search-x"></i></div>
        <p>Nenhuma tarefa encontrada</p>
        <button class="btn-clear-search" id="btn-clear-search">Limpar busca</button>
      </div>`;
    } else {
      container.innerHTML = quickAddHtml + `<div class="empty-state-card">
        <div class="empty-icon-wrap"><i data-lucide="sparkles"></i></div>
        <h3>Sua lista está vazia</h3>
        <p>Que tal começar criando sua primeira tarefa?</p>
        <button class="btn-primary" onclick="openTaskModal()">Criar tarefa</button>
      </div>`;
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = quickAddHtml;

  const grps = {};
  filtered.forEach(t => { const k = t.date || '__'; if (!grps[k]) grps[k] = []; grps[k].push(t); });
  const keys = Object.keys(grps).sort((a, b) => {
    if (a === '__') return 1; if (b === '__') return -1; return a.localeCompare(b);
  });

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

  container.innerHTML = keys.map(k => {
    const label = k === '__' ? 'Sem data' : k === todayStr() ? 'Hoje' : k === tomorrowStr() ? 'Amanhã' : fmtDate(k);
    const sortedTasks = grps[k].sort((a, b) => {
      // Done tasks go to bottom within the group if they were mixed (though usually they are filtered or in 'Done' view)
      if (a.done !== b.done) return a.done ? 1 : -1;
      // Sort by priority map
      return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    });

    return `<div class="tgrp">
      <div class="tgrp-label">${label}</div>
      ${sortedTasks.map(renderTask).join('')}
    </div>`;
  }).join('');

  updateRightPanelWidgets();
}

export function renderBoard() {
  const filtered = getFiltered();
  const container = document.getElementById('board-container');
  if (!container) return;

  console.log('renderBoard state.columns:', state.columns);
  
  if (!state.columns || state.columns.length === 0) {
    container.innerHTML = '<div class="board-loading" style="padding: 24px 32px; color: var(--text-muted); font-size: 14px; width: 100%; text-align: center;">Carregando colunas...</div>';
    return;
  }

  if (filtered.length === 0 && (document.getElementById('search-input')?.value.trim())) {
    container.innerHTML = `<div class="board-empty-state">
      <div class="empty-icon"><i data-lucide="search-x"></i></div>
      <p>Nenhuma tarefa encontrada na busca</p>
      <button class="btn-clear-search" id="btn-clear-search-board">Limpar busca</button>
    </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const cols = state.columns;

  container.innerHTML = cols.map(col => {
    const colTasks = filtered.filter(t => t.column_id === col.id);
    
    if (state.taskSortMode === 'date') {
      colTasks.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });
    } else if (state.taskSortMode === 'priority') {
      const priMap = { high: 0, medium: 1, low: 2, none: 3 };
      colTasks.sort((a, b) => (priMap[a.priority] || 3) - (priMap[b.priority] || 3));
    } else if (state.taskSortMode === 'tag') {
      colTasks.sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
    } else {
      colTasks.sort((a, b) => (a.position || 0) - (b.position || 0));
    }

    return `<div class="board-column" data-col-id="${col.id}">
      <div class="board-column-header">
        <span class="board-col-title" data-rename-col="${col.id}">${escapeHTML(col.name)}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <select class="board-col-sort" title="Ordenar por">
            <option value="manual" ${state.taskSortMode === 'manual' ? 'selected' : ''}>Manual</option>
            <option value="date" ${state.taskSortMode === 'date' ? 'selected' : ''}>Data</option>
            <option value="priority" ${state.taskSortMode === 'priority' ? 'selected' : ''}>Prioridade</option>
            <option value="tag" ${state.taskSortMode === 'tag' ? 'selected' : ''}>Tag</option>
          </select>
          <span class="board-col-count">${colTasks.length}</span>
          <button class="board-col-delete" data-delete-col="${col.id}" title="Excluir coluna"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
        </div>
      </div>
      <div class="board-column-tasks ${colTasks.length === 0 ? 'is-empty' : ''}" id="board-col-tasks-${col.id}" data-col-id="${col.id}">
        ${colTasks.map(renderTask).join('')}
      </div>
      <button class="board-add-task" data-add-task="${col.id}">
        <i data-lucide="plus"></i> Nova tarefa
      </button>
    </div>`;
  }).join('');
  
  const boardAddContent = state.columns.length < 8 ? `
    <div class="board-add-column" id="btn-add-column">
      <i data-lucide="plus"></i> Nova coluna
    </div>
  ` : '';
  container.innerHTML += boardAddContent;

  if (window.lucide) window.lucide.createIcons();
  
  if (state.displayMode === 'board' && typeof Sortable !== 'undefined' && state.taskSortMode === 'manual') {
    document.querySelectorAll('.board-column-tasks').forEach(container => {
      new Sortable(container, {
        group: "tasks",
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: async (evt) => {
          const taskId = evt.item.dataset.id;
          const toColId = evt.to.dataset.colId;
          const fromColId = evt.from.dataset.colId;

          if (!taskId || !toColId) return;

          const task = state.tasks.find(t => t.id === taskId);
          if (!task) return;

          const updates = [];

          // 1. Usar ordem do DOM como fonte de verdade (evita inconsistência com posições
          //    corrompidas no banco). Sortable já reordenou os elementos no DOM.
          const toChildren = [...evt.to.querySelectorAll('[data-id]')];
          toChildren.forEach((el, i) => {
            const t = state.tasks.find(t => t.id === el.dataset.id);
            if (!t) return;
            const prevPosition = t.position;
            t.column_id = toColId;
            t.position = i;
            if (t.id === taskId || prevPosition !== i) {
              updates.push(updateTaskPosition(t.id, toColId, i));
            }
          });

          // 2. Se moveu entre colunas, reindexar coluna de origem pela ordem do DOM
          if (fromColId !== toColId) {
            const fromChildren = [...evt.from.querySelectorAll('[data-id]')];
            fromChildren.forEach((el, i) => {
              const t = state.tasks.find(t => t.id === el.dataset.id);
              if (!t) return;
              if (t.position !== i) {
                t.position = i;
                updates.push(updateTaskPosition(t.id, fromColId, i));
              }
            });

            // Atualizar contadores visuais
            const fromColEl = evt.from.closest('.board-column');
            if (fromColEl) {
              const fromCount = fromColEl.querySelector('.board-col-count');
              if (fromCount) fromCount.textContent = fromChildren.length;
            }
          }

          const toColEl = evt.to.closest('.board-column');
          if (toColEl) {
            const toCount = toColEl.querySelector('.board-col-count');
            if (toCount) toCount.textContent = toChildren.length;
          }

          if (updates.length > 0) {
            await Promise.all(updates);
          }
        }
      });
    });
  }

  updateRightPanelWidgets();
}

function renderTask(t) {
  const ds = dateStatus(t.date);
  const pc = t.priority === 'high' ? 'ph' : t.priority === 'medium' ? 'pm' : t.priority === 'low' ? 'pl' : '';
  const subs = t.subtasks || [];
  const subsDone = subs.filter(s => s.done).length;
  const hasSubs = subs.length > 0;
  const subsProg = hasSubs ? Math.round((subsDone / subs.length) * 100) : 0;
  const isExpanded = state.expandedTasks.has(t.id);
  const isRunning = timerState.taskId === t.id && timerState.running;
  const elapsed = timerState.taskId === t.id
    ? timerState.elapsed + (timerState.running ? Math.floor((Date.now() - timerState.startedAt) / 1000) : 0)
    : (t.time_spent || 0);

  const tags = (t.tags || []).map(tag => {
    const c = tagColor(tag);
    const displayName = tag.includes(':') ? tag.split(':')[1] : tag;
    return `<span class="tbadge" style="color:${c};border-color:${c}40;background:${c}12;">${escapeHTML(displayName)}</span>`;
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
          <span class="sub-title ${s.done ? 'done' : ''}">${escapeHTML(s.title)}</span>
        </div>`).join('')}
    </div>` : '';

  return `<div class="task-item ${t.done ? 'done' : ''} ${pc}" id="task-${t.id}" data-id="${t.id}">
    <div class="task-main" data-action="edit" data-id="${t.id}">
      <div class="checkbox ${t.done ? 'checked' : ''}" data-action="toggle-done" data-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-title">${escapeHTML(t.title)}</div>
        ${t.note ? `<div class="task-note">${escapeHTML(t.note)}</div>` : ''}
        <div class="task-meta">
          ${t.date ? `<span class="task-date ${ds}">◷ ${fmtDate(t.date)}</span>` : ''}
          ${hasSubs ? `<button class="expand-btn" data-action="expand" data-id="${t.id}">
            ⊟ ${subsDone}/${subs.length} ${isExpanded ? '▲' : '▼'}
          </button>` : ''}
          ${tags}
          ${t.recurrence && t.recurrence !== 'none' ? `<span class="tbadge" style="color:#ffffff;background:var(--accent);border-color:var(--accent);">↻ ${t.recurrence === 'daily' ? 'Diária' : t.recurrence === 'weekly' ? 'Semanal' : 'Mensal'}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-timer-btn ${isRunning ? 'running' : ''}" data-action="toggle-timer" data-id="${t.id}">
          <i data-lucide="${isRunning ? 'pause' : 'play'}"></i> ${elapsed > 0 ? ' ' + formatTimer(elapsed) : ''}
        </button>
        <button class="icon-btn dup" data-action="duplicate" data-id="${t.id}" title="Duplicar Tarefa"><i data-lucide="copy"></i></button>
        <button class="icon-btn del" data-action="delete" data-id="${t.id}"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    ${subtasksHtml}
  </div>`;
}

export function getFiltered() {
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const today = todayStr();
  const tom = tomorrowStr();
  const week = weekStr();

  const groupSelect = document.getElementById('group-filter-select');
  const groupFilter = groupSelect ? groupSelect.value : 'all';

  let list = state.tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search)) return false;
    if (state.priFilter !== 'all' && t.priority !== state.priFilter) return false;
    if (groupFilter !== 'all') {
      const g = state.groups.find(gr => gr.id === groupFilter);
      if (g) {
        if (!t.tags || !t.tags.some(tag => tag === g.name || tag.startsWith(`${g.name}:`))) {
          return false;
        }
      }
    }
    return true;
  });

  if (state.view.type === 'smart') {
    switch (state.view.value) {
      case 'all': list = list.filter(t => !t.done); break;
      case 'today': list = list.filter(t => !t.done && t.date === today); break;
      case 'upcoming': list = list.filter(t => !t.done && t.date >= tom && t.date <= week); break;
      case 'overdue': list = list.filter(t => !t.done && t.date && t.date < today); break;
      case 'done': list = list.filter(t => t.done); break;
    }
  } else {
    list = list.filter(t => !t.done && (t.tags || []).some(tag => tag === state.view.value || tag.endsWith(`:${state.view.value}`)));
  }

  return list;
}

// ── REPORT ────────────────────────────────────────────────
export function renderReport() {
  renderReportUI();
}

// ── TAG PICKER (modal) ────────────────────────────────────
export function renderTagPicker(eTags) {
  document.getElementById('tag-picker').innerHTML = (state.groups || []).map(g => {
    if (!g) return '';
    const pSel = eTags.includes(g.name);
    const children = (g.children || []).map(c => {
      const fullTagName = `${g.name}:${c}`;
      const s = eTags.includes(fullTagName);
      return `<div class="tp-child ${s ? 'sel' : ''}" data-pick-tag="${fullTagName}">
        <span class="tp-check">${s ? '✓' : ''}</span>
        <span class="dot" style="background:${g.color}88"></span>${escapeHTML(c)}
      </div>`;
    }).join('');
    return `<div>
      <div class="tp-parent" data-pick-tag="${g.name}:${g.name}">
        <span class="dot" style="background:${g.color}"></span>
        <span style="flex:1">${escapeHTML(g.name)}</span>
        ${pSel ? '<span style="color:var(--accent);font-size:11px;">✓</span>' : ''}
      </div>${children}
    </div>`;
  }).join('');
  renderSelTags(eTags);
}

export function renderSelTags(eTags) {
  document.getElementById('sel-tags').innerHTML = eTags.map(t => {
    const c = tagColor(t);
    return `<span class="stag" style="background:${c}18;color:${c};border:1px solid ${c}40;" data-pick-tag="${escapeHTML(t)}">${escapeHTML(t)} <span class="x">×</span></span>`;
  }).join('');
}

export function renderSubtaskModal(eSubtasks) {
  document.getElementById('stm-list').innerHTML = eSubtasks.map((s, i) => `
    <div class="stm-row">
      <span style="color:var(--text-dim);font-size:11px;">⊟</span>
      <span class="stm-title">${escapeHTML(s.title)}</span>
      <span class="stm-del" data-remove-sub="${i}">✕</span>
    </div>`).join('');
}

// ── TUTORIAL / GUIA DO APP ─────────────────────────────────────
export function renderTutorial() {
  const container = document.getElementById('tutorial-container');
  if (!container) return;

  container.innerHTML = `
    <div class="tutorial-wrapper">
      <div class="tutorial-header">
        <div class="tut-icon-wrap"><i data-lucide="book-open"></i></div>
        <h2>Central de Ajuda NanoTask</h2>
        <p>Tudo o que você precisa saber para se tornar um mestre da produtividade gamificada.</p>
      </div>

      <div class="tut-grid">
        <!-- Seção 1: Navegação e Visão Geral -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="layout"></i>
            <h3>Navegação & Visão Geral</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Menu Visão Geral:</strong> Acesse rapidamente suas tarefas filtradas por tempo: 
                <br>• <i data-lucide="calendar" style="width:12px"></i> <strong>Hoje:</strong> Foco no agora.
                <br>• <i data-lucide="clock" style="width:12px"></i> <strong>Próximas:</strong> Planejamento futuro.
                <br>• <i data-lucide="alert-triangle" style="width:12px"></i> <strong>Atrasadas:</strong> O que precisa de atenção urgente.</li>
              <li><strong>Contador de Progresso:</strong> No painel direito, o círculo dinâmico mostra quantas tarefas você concluiu no dia (ex: 2/5). Quando bater a meta, você ganha um bônus de satisfação!</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-progress-circle">
                <svg viewBox="0 0 36 36"><path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/><path class="circle" stroke-dasharray="75, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg>
                <div class="anim-text">3/4</div>
              </div>
              <div class="anim-label">Meta do Dia</div>
            </div>
          </div>
        </div>

        <!-- Seção 2: Tarefas e Sub-tarefas -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="list-checks"></i>
            <h3>Tarefas & Sub-tarefas</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Sub-tarefas:</strong> Dentro de cada tarefa, você pode criar uma lista de passos. Cada sub-tarefa concluída dá <strong>+1 XP</strong>.</li>
              <li><strong>Google Agenda:</strong> Ao digitar palavras como "Reunião" ou "Call", um botão de sincronia aparece! Clique para agendar no seu Google Calendar em um segundo.</li>
              <li><strong>Recorrência:</strong> Configure tarefas que se repetem (Diário, Semanal). O sistema cria a próxima assim que você conclui a atual.</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-task-list">
                <div class="anim-task-item"><div class="anim-check"></div> Projeto Alpha</div>
                <div class="anim-subtask-item checked"><div class="anim-check-small"></div> Passo 1 <span class="xp-pop">+1XP</span></div>
                <div class="anim-subtask-item"><div class="anim-check-small"></div> Passo 2</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Seção 3: Personalização e Perfil -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="user-cog"></i>
            <h3>Perfil & Preferências</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Sua Evolução:</strong> No rodapé do menu lateral, clique em <strong>Perfil</strong> para ver seu nível total e total de XP acumulado.</li>
              <li><strong>Preferências:</strong> Altere a cor de destaque (Accent Color) de todo o app para combinar com seu estilo. Ajuste também o som e notificações.</li>
              <li><strong>Backup:</strong> Nunca perca seus dados. Use a função **Backup** para exportar um arquivo seguro com todas as suas tarefas e grupos.</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-profile-card">
                <div class="anim-avatar">N</div>
                <div class="anim-xp-bar"><div class="anim-xp-fill"></div></div>
                <div class="anim-lvl">Nível 12</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Seção 4: Gamificação Avançada -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="flame"></i>
            <h3>Gamificação & Foco</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Foco Pomodoro:</strong> O timer não é só um relógio. Ele sincroniza com sua tarefa ativa. Concluir um foco sem pausas irregulares garante <strong>+1 XP</strong> e medalhas.</li>
              <li><strong>Tags Inteligentes:</strong> Use o filtro no topo para focar em contextos específicos (ex: só "Trabalho"). Isso ajuda a manter o foco profundo (Deep Work).</li>
              <li><strong>Streaks:</strong> Mantenha a meta diária batida para desbloquear selos de consistência.</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-pomodoro">
                <div class="anim-timer-text">25:00</div>
                <div class="anim-pomo-btn"><i data-lucide="play" style="width:12px"></i></div>
              </div>
              <div class="xp-badge">MEDALHA DESBLOQUEADA</div>
            </div>
          </div>
        </div>

        <!-- Seção 5: Quadro Kanban & Produtividade Visual -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="layout-dashboard"></i>
            <h3>Quadro Kanban & Visual</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Modo Quadro:</strong> Alterne entre Lista e Quadro (Kanban) no topo da tela. No Quadro, você pode arrastar tarefas entre colunas para mudar o status.</li>
              <li><strong>Personalização:</strong> Crie novas colunas, renomeie-as com um clique duplo e organize seu fluxo de trabalho como preferir.</li>
              <li><strong>Timer Integrado:</strong> Cada tarefa no quadro e na lista possui seu próprio cronômetro individual para você saber exatamente onde investe seu tempo.</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-board">
                <div class="anim-board-col">
                  <div class="anim-board-card moving"></div>
                  <div class="anim-board-card"></div>
                </div>
                <div class="anim-board-col">
                  <div class="anim-board-card"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Seção 6: Busca Inteligente & Atalhos -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="search"></i>
            <h3>Agilidade & Atalhos</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Quick Add (Adição Rápida):</strong> Na visão de lista, basta digitar no campo flutuante e apertar <kbd>Enter</kbd> para criar uma tarefa instantaneamente.</li>
              <li><strong>Atalhos Globais:</strong> Pressione <kbd>N</kbd> em qualquer lugar para abrir o modal de nova tarefa. Use <kbd>ESC</kbd> para fechar qualquer janela aberta.</li>
              <li><strong>Filtros de Prioridade:</strong> Use os chips de prioridade no topo para limpar o ruído e focar apenas no que é Crítico, Médio ou Baixo.</li>
            </ul>
            <div class="tut-anim-container">
              <div class="anim-quick-add">
                <div class="anim-input-sim">
                  <div class="anim-typing-text">Enviar proposta...</div>
                </div>
                <div class="anim-new-task-pop">
                  <div class="anim-check"></div> Enviar proposta
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Seção 7: Relatórios & PWA -->
        <div class="tut-card">
          <div class="tut-card-head">
            <i data-lucide="bar-chart-horizontal"></i>
            <h3>Analytics & Versão Mobile</h3>
          </div>
          <div class="tut-card-body">
            <ul>
              <li><strong>Relatório Mensal:</strong> Acompanhe seu desempenho histórico. Veja quais dias foram mais produtivos e quantas tarefas você concluiu no mês.</li>
              <li><strong>Instale como App (PWA):</strong> O NanoTask funciona offline! No Chrome ou Safari, use "Adicionar à Tela de Início" para ter uma experiência de aplicativo nativo no celular.</li>
              <li><strong>Sincronização Nuvem:</strong> Seus dados são salvos em tempo real no Supabase, garantindo que você nunca perca seu progresso, trocando de dispositivo.</li>
            </ul>
            <div class="tut-anim-container" style="flex-direction: row; gap: 30px;">
              <div class="anim-chart">
                <div class="anim-chart-bar" style="height:40%; animation-delay: 0.1s"></div>
                <div class="anim-chart-bar" style="height:70%; animation-delay: 0.3s"></div>
                <div class="anim-chart-bar" style="height:50%; animation-delay: 0.5s"></div>
                <div class="anim-chart-bar" style="height:90%; animation-delay: 0.7s"></div>
              </div>
              <div class="anim-pwa-wrap">
                <div class="anim-phone">
                  <div class="anim-phone-btn"><i data-lucide="download" style="width:14px"></i></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

export function renderMiniCalendar() {
  try {
    const container = document.getElementById('mini-calendar');
    if (!container) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const monthName = now.toLocaleString('pt-BR', { month: 'long' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysHead = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    let html = `
      <div class="pomo-header">
        <span class="pomo-label"><i data-lucide="calendar"></i> ${monthName} ${year}</span>
      </div>
      <div class="mc-grid">
        ${daysHead.map(d => `<div class="mc-day-head">${d}</div>`).join('')}
    `;

    for (let i = 0; i < (firstDay === 0 ? 0 : firstDay); i++) {
      html += `<div class="mc-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === today;
      html += `<div class="mc-day ${isToday ? 'today' : ''}">${d}</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.warn('[render] error in renderMiniCalendar', err);
  }
}
