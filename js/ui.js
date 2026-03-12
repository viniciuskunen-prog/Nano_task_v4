import { COLORS } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { savePrefs, saveGroup, addSubtag } from './tasks.js';
import { pomodoroReset, pomodoroState, updateNotifBtn } from './pomodoro.js';
import { openProfile, closeProfile } from './profile.js';
import { getLevelFromXP } from './xp.js';
import { render, renderTasks, renderReport, renderTutorial, renderTagPicker, renderSubtaskModal } from './render.js';

// ── TASK MODAL STATE ──────────────────────────────────────
export let eTags = [];
export let ePri = 'none';
export let eSubtasks = [];

export let eRecurrence = 'none';

// Getter so main.js can read current modal state without re-import
export function getModalState() {
    return { eTags, ePri, eSubtasks, eRecurrence: document.getElementById('tm-recurrence')?.value || 'none' };
}

// ── VIEWS ─────────────────────────────────────────────────
const VIEW_TITLES = {
    all: 'Tarefas',
    today: 'Hoje',
    upcoming: 'Próximos 7 dias',
    overdue: 'Atrasadas',
    done: 'Concluídas',
    report: 'Relatório Mensal',
    tutorial: 'Guia do App',
};

function refreshLucide() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

export function setSmartView(value, el) {
    state.view = { type: 'smart', value };

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el?.classList.add('active');

    document.getElementById('view-title').textContent = VIEW_TITLES[value] || value;

    const isReport = value === 'report';
    const isTutorial = value === 'tutorial';

    const tc = document.getElementById('task-container');
    const bc = document.getElementById('board-container');
    
    if (isReport || isTutorial) {
        if (tc) tc.classList.add('hidden');
        if (bc) bc.classList.add('hidden');
    } else if (state.displayMode === 'board') {
        if (tc) tc.classList.add('hidden');
        if (bc) bc.classList.remove('hidden');
    } else {
        if (tc) tc.classList.remove('hidden');
        if (bc) bc.classList.add('hidden');
    }
    document.getElementById('report-container').classList.toggle('hidden', !isReport);

    const tutorialContainer = document.getElementById('tutorial-container');
    if (tutorialContainer) tutorialContainer.classList.toggle('hidden', !isTutorial);

    document.getElementById('filters-bar').classList.toggle('hidden', !!(isReport || isTutorial));
    document.getElementById('search-wrap').classList.toggle('hidden', !!(isReport || isTutorial));
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) viewToggle.classList.toggle('hidden', !!(isReport || isTutorial));
    document.getElementById('add-task-btn').classList.toggle('hidden', !!(isReport || isTutorial));

    if (isReport) renderReport();
    else if (isTutorial) renderTutorial();
    else renderTasks();

    localStorage.setItem('currentView', JSON.stringify(state.view));
    refreshLucide();
}

export function setTagView(tagName) {
    state.view = { type: 'tag', value: tagName };

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById('view-title').textContent = tagName;
    const tc = document.getElementById('task-container');
    const bc = document.getElementById('board-container');
    if (state.displayMode === 'board') {
        if (tc) tc.classList.add('hidden');
        if (bc) bc.classList.remove('hidden');
    } else {
        if (tc) tc.classList.remove('hidden');
        if (bc) bc.classList.add('hidden');
    }
    document.getElementById('report-container').classList.add('hidden');
    document.getElementById('filters-bar').classList.remove('hidden');
    document.getElementById('search-wrap').classList.remove('hidden');
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) viewToggle.classList.remove('hidden');
    document.getElementById('add-task-btn').classList.remove('hidden');

    renderTasks();
    localStorage.setItem('currentView', JSON.stringify(state.view));
    refreshLucide();
}

export function setPri(p, el) {
    state.priFilter = p;

    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el?.classList.add('active');

    renderTasks();
    refreshLucide();
}

export function changeMonth(dir) {
    state.reportMonth.m += dir;

    if (state.reportMonth.m < 0) {
        state.reportMonth.m = 11;
        state.reportMonth.y--;
    }
    if (state.reportMonth.m > 11) {
        state.reportMonth.m = 0;
        state.reportMonth.y++;
    }

    renderReport();
    refreshLucide();
}

export function setDisplayMode(mode, force = false) {
    if (!force && state.displayMode === mode) return;
    state.displayMode = mode;
    localStorage.setItem('viewMode', mode);
    
    document.getElementById('btn-view-list')?.classList.toggle('active', mode === 'list');
    document.getElementById('btn-view-board')?.classList.toggle('active', mode === 'board');
    
    const isReport = state.view.value === 'report';
    const isTutorial = state.view.value === 'tutorial';
    
    const tc = document.getElementById('task-container');
    const bc = document.getElementById('board-container');
    
    if (isReport || isTutorial) {
        if (tc) tc.classList.add('hidden');
        if (bc) bc.classList.add('hidden');
    } else if (mode === 'board') {
        if (tc) tc.classList.add('hidden');
        if (bc) bc.classList.remove('hidden');
        console.log("Set display mode to board. BC classes:", bc.className);
    } else {
        if (tc) tc.classList.remove('hidden');
        if (bc) bc.classList.add('hidden');
    }
    
    render();
    refreshLucide();
}

// ── SIDEBAR ───────────────────────────────────────────────
export function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (sb) sb.classList.toggle('open');
}

export function toggleRightPanel() {
    const rp = document.querySelector('.right-panel');
    if (rp) rp.classList.toggle('open');
}

export function toggleGroup(id) {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);

    render();
    refreshLucide();
}

export async function addSubtagPrompt(gid) {
    const name = prompt('Nome da sub-tag:');
    if (!name?.trim()) return;

    await addSubtag(gid, name.trim());
    render();
    refreshLucide();
}

// ── TASK MODAL ────────────────────────────────────────────
export function openTaskModal(task = null, columnId = null) {
    try {
        eTags = task ? [...(task.tags || [])] : [];
        ePri = task?.priority || 'none';
        eSubtasks = task ? JSON.parse(JSON.stringify(task.subtasks || [])) : [];

        document.getElementById('tm-id').value = task?.id || '';
        document.getElementById('tm-column-id').value = columnId || '';
        document.getElementById('tm-heading').textContent = task ? 'Editar Tarefa' : 'Nova Tarefa';
        document.getElementById('tm-title').value = task?.title || '';
        document.getElementById('tm-note').value = task?.note || '';
        document.getElementById('tm-date').value = task?.date || '';
        let recurrenceSelect = document.getElementById('tm-recurrence');
        if (recurrenceSelect) {
            recurrenceSelect.value = task?.recurrence || 'none';
        }
        document.getElementById('stm-input').value = '';
        document.getElementById('meeting-banner')?.classList.add('hidden');

        document.querySelectorAll('.pri-btn').forEach(b => {
            b.classList.toggle('sel', b.dataset.pri === ePri);
        });

        renderTagPicker(eTags);
        renderSubtaskModal(eSubtasks);

        if (task) checkMeetingTitle();
    } catch (err) {
        console.error('[ui] Erro ao preparar modal de tarefa:', err);
    }

    openOverlay('task-overlay');
    refreshLucide();

    setTimeout(() => {
        const titleInput = document.getElementById('tm-title');
        if (titleInput) titleInput.focus();
    }, 100);
}

export function closeTaskModal() {
    closeOverlay('task-overlay');
}

export function selPri(p) {
    ePri = p;

    document.querySelectorAll('.pri-btn').forEach(b => {
        b.classList.toggle('sel', b.dataset.pri === p);
    });
}

export function toggleTag(tag) {
    if (eTags.includes(tag)) eTags = eTags.filter(t => t !== tag);
    else eTags.push(tag);

    renderTagPicker(eTags);
    refreshLucide();
}

export function addSubtaskModal() {
    const inp = document.getElementById('stm-input');
    const val = inp.value.trim();

    if (!val) return;

    eSubtasks.push({
        id: null,
        title: val,
        done: false,
        tags: [],
        date: null,
    });

    inp.value = '';
    renderSubtaskModal(eSubtasks);
    refreshLucide();
}

export function removeSubtaskModal(i) {
    eSubtasks.splice(i, 1);
    renderSubtaskModal(eSubtasks);
    refreshLucide();
}

export function checkMeetingTitle() {
    const kw = [
        'reunião',
        'meeting',
        'call',
        'sync',
        'standup',
        'stand-up',
        'entrevista',
        'apresentação',
        'demo',
        'review',
        'alinhamento',
    ];

    const title = (document.getElementById('tm-title')?.value || '').toLowerCase();

    document.getElementById('meeting-banner')
        ?.classList.toggle('hidden', !kw.some(k => title.includes(k)));
}

export function openCalendar() {
    const title = encodeURIComponent(document.getElementById('tm-title').value);
    const note = encodeURIComponent(document.getElementById('tm-note').value || '');
    const dateVal = document.getElementById('tm-date').value;

    const dates = dateVal
        ? `&dates=${dateVal.replace(/-/g, '')}/${dateVal.replace(/-/g, '')}`
        : '';

    window.open(
        `https://calendar.google.com/calendar/r/eventedit?text=${title}&details=${note}${dates}`,
        '_blank'
    );
}

// ── COMPLETE MODAL ────────────────────────────────────────
export function openCompleteModal(id) {
    state.pendingCompleteId = id;
    openOverlay('complete-overlay');
}

// ── GROUP MODAL ───────────────────────────────────────────
let selGroupColor = COLORS[0];

export function openGroupModal() {
    selGroupColor = COLORS[0];

    document.getElementById('gm-name').value = '';
    document.getElementById('gm-children').value = '';

    document.getElementById('gm-colors').innerHTML = COLORS.map(c =>
        `<div class="cpick ${c === selGroupColor ? 'sel' : ''}" style="background:${c}" data-color="${c}"></div>`
    ).join('');

    openOverlay('group-overlay');
}

export function closeGroupModal() {
    closeOverlay('group-overlay');
}

export function pickGroupColor(c, el) {
    selGroupColor = c;

    document.querySelectorAll('#gm-colors .cpick').forEach(d => d.classList.remove('sel'));
    el.classList.add('sel');
}

export async function doSaveGroup() {
    const name = document.getElementById('gm-name').value.trim();

    if (!name) {
        toast('Nome obrigatório', '⚠');
        return;
    }

    const children = document.getElementById('gm-children')
        .value
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

    await saveGroup({
        name,
        color: selGroupColor,
        children,
    });

    closeGroupModal();
    render();
    refreshLucide();
}

// ── PREFS MODAL ───────────────────────────────────────────
export function openPrefs() {
    document.getElementById('pref-lang').value = state.profile.language || 'pt-BR';
    document.getElementById('pref-start').value = state.profile.work_start || '09:00';
    document.getElementById('pref-end').value = state.profile.work_end || '18:00';
    document.getElementById('pref-pomo-duration').value = state.profile.pomo_duration || 25;
    document.getElementById('pref-break-duration').value = state.profile.break_duration || 5;
    document.getElementById('pref-sound').checked = state.profile.sound_enabled !== false;
    document.getElementById('pref-date-format').value = state.profile.date_format || 'DD/MM';
    document.getElementById('pref-theme').value = localStorage.getItem('theme') || 'system';

    const workDays = state.profile.work_days || [1, 2, 3, 4, 5];
    document.querySelectorAll('#pref-days .day-btn').forEach(btn => {
        btn.classList.toggle('active', workDays.includes(parseInt(btn.dataset.day)));
    });

    const acc = state.profile.accent_color || '#351cd4';
    document.getElementById('pref-accent').innerHTML = COLORS.map(c =>
        `<div class="cpick ${c === acc ? 'sel' : ''}" style="background:${c}" data-accent="${c}"></div>`
    ).join('');

    const tzSel = document.getElementById('pref-timezone');
    if (tzSel && !tzSel.options.length) {
        const tzs = Intl.supportedValuesOf?.('timeZone') || [
            'America/Sao_Paulo',
            'America/New_York',
            'Europe/London',
            'UTC',
        ];

        tzs.forEach(tz => {
            const opt = document.createElement('option');
            opt.value = tz;
            opt.textContent = tz;
            tzSel.appendChild(opt);
        });
    }

    if (tzSel) tzSel.value = state.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    updateNotifBtn();
    openOverlay('prefs-overlay');
    refreshLucide();
}

export function closePrefs() {
    closeOverlay('prefs-overlay');
}

export function pickAccent(c, el) {
    document.querySelectorAll('#pref-accent .cpick').forEach(d => d.classList.remove('sel'));
    el.classList.add('sel');

    document.documentElement.style.setProperty('--accent', c);
    state.profile.accent_color = c;
}

export async function doSavePrefs() {
    const days = [];

    document.querySelectorAll('#pref-days .day-btn').forEach(btn => {
        if (btn.classList.contains('active')) {
            days.push(parseInt(btn.dataset.day));
        }
    });

    const newPomoDur = parseInt(document.getElementById('pref-pomo-duration').value);

    const updates = {
        language: document.getElementById('pref-lang').value,
        work_start: document.getElementById('pref-start').value,
        work_end: document.getElementById('pref-end').value,
        work_days: days,
        accent_color: state.profile.accent_color || '#351cd4',
        pomo_duration: newPomoDur,
        break_duration: parseInt(document.getElementById('pref-break-duration').value),
        sound_enabled: document.getElementById('pref-sound').checked,
        date_format: document.getElementById('pref-date-format').value,
        timezone: document.getElementById('pref-timezone').value,
    };

    const theme = document.getElementById('pref-theme').value;
    applyTheme(theme);

    await savePrefs(updates);

    if (newPomoDur * 60 !== pomodoroState.duration && pomodoroState.mode === 'work') {
        pomodoroReset();
    }

    closePrefs();
    toast('Preferências salvas ✦');
}

// ── BACKUP ────────────────────────────────────────────────
export function exportBackup() {
    const data = {
        tasks: state.tasks,
        groups: state.groups,
        profile: state.profile,
        exportedAt: new Date().toISOString(),
    };

    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = `nanotask-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    toast('Backup salvo ✦');
}

// ── XP BAR (SIDEBAR) ──────────────────────────────────────
export function updateXPBar() {
    const xpInfo = getLevelFromXP(state.profile.xp_total || 0);
    const progressEl = document.getElementById('xp-bar-progress');
    const percentEl = document.getElementById('xp-bar-percent');

    if (progressEl) progressEl.style.width = xpInfo.progressPercent + '%';
    if (percentEl) percentEl.textContent = xpInfo.progressPercent + '%';
}

// ── OVERLAY HELPERS ───────────────────────────────────────
export function openOverlay(id) {
    document.getElementById(id)?.classList.add('open');
}

export function closeOverlay(id) {
    document.getElementById(id)?.classList.remove('open');
}

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────
// Usa event delegation para funcionar mesmo após o app-view sair do estado hidden
document.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('#menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    if (menuBtn) {
        sidebar.classList.toggle('open');
        return;
    }

    // Fecha ao clicar fora
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

const fab = document.getElementById('fab-add-task');
if (fab) {
    fab.addEventListener('click', () => openTaskModal());
}

// ── SUBSCRIPTION EVENTS ──
window.openCheckout = (plan = 'annual') => {
    const urls = {
        monthly: 'https://pay.kiwify.com.br/NBsRV6r',
        annual: 'https://pay.kiwify.com.br/4jJUC9R'
    };
    const baseUrl = urls[plan] || urls.annual;
    const emailParam = state.profile?.email || state.currentUser?.email || '';

    // Passa o e-mail pela URL para que o Checkout já abra preenchido e evite erros no webhook!
    const finalUrl = emailParam ? `${baseUrl}?email=${encodeURIComponent(emailParam)}` : baseUrl;
    window.open(finalUrl, '_blank');
};

document.getElementById('btn-subscribe-now')?.addEventListener('click', () => {
    window.openCheckout('annual');
});

document.getElementById('btn-logout-restricted')?.addEventListener('click', () => {
    document.getElementById('btn-logout')?.click();
});

// Re-exportar funções de profile.js para manter compatibilidade
export { openProfile, closeProfile, openEditProfile, closeEditProfile, saveEditProfile } from './profile.js';

export function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
}