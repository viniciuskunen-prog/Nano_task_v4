import { COLORS } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { savePrefs, saveGroup, addSubtag } from './tasks.js';
import { pomodoroReset, pomodoroState, updateNotifBtn } from './pomodoro.js';
import { render, renderTasks, renderTagPicker, renderSubtaskModal, renderReport } from './render.js';
import { openProfile, closeProfile } from './profile.js';
import { getLevelFromXP } from './xp.js';

// ── TASK MODAL STATE ──────────────────────────────────────
export let eTags = [];
export let ePri = 'none';
export let eSubtasks = [];

// Getter so main.js can read current modal state without re-import
export function getModalState() {
    return { eTags, ePri, eSubtasks };
}

// ── VIEWS ─────────────────────────────────────────────────
const VIEW_TITLES = {
    all: 'Todas as Tarefas',
    today: 'Hoje',
    upcoming: 'Próximos 7 dias',
    overdue: 'Atrasadas',
    done: 'Concluídas',
    report: 'Relatório Mensal',
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
    document.getElementById('task-container').classList.toggle('hidden', isReport);
    document.getElementById('report-container').classList.toggle('hidden', !isReport);
    document.getElementById('filters-bar').classList.toggle('hidden', isReport);
    document.getElementById('search-wrap').classList.toggle('hidden', isReport);
    document.getElementById('add-task-btn').classList.toggle('hidden', isReport);

    if (isReport) renderReport();
    else renderTasks();

    refreshLucide();
}

export function setTagView(tagName) {
    state.view = { type: 'tag', value: tagName };

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById('view-title').textContent = tagName;
    document.getElementById('task-container').classList.remove('hidden');
    document.getElementById('report-container').classList.add('hidden');
    document.getElementById('filters-bar').classList.remove('hidden');
    document.getElementById('search-wrap').classList.remove('hidden');
    document.getElementById('add-task-btn').classList.remove('hidden');

    renderTasks();
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

// ── SIDEBAR ───────────────────────────────────────────────
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
export function openTaskModal(task = null) {
    eTags = task ? [...(task.tags || [])] : [];
    ePri = task?.priority || 'none';
    eSubtasks = task ? JSON.parse(JSON.stringify(task.subtasks || [])) : [];

    document.getElementById('tm-id').value = task?.id || '';
    document.getElementById('tm-heading').textContent = task ? 'Editar Tarefa' : 'Nova Tarefa';
    document.getElementById('tm-title').value = task?.title || '';
    document.getElementById('tm-note').value = task?.note || '';
    document.getElementById('tm-date').value = task?.date || '';
    document.getElementById('stm-input').value = '';
    document.getElementById('meeting-banner').classList.add('hidden');

    document.querySelectorAll('.pri-btn').forEach(b => {
        b.classList.toggle('sel', b.dataset.pri === ePri);
    });

    renderTagPicker(eTags);
    renderSubtaskModal(eSubtasks);

    if (task) checkMeetingTitle();

    openOverlay('task-overlay');
    refreshLucide();

    setTimeout(() => {
        document.getElementById('tm-title')?.focus();
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
    document.getElementById('pref-company').value = state.profile.company_name || '';
    document.getElementById('pref-lang').value = state.profile.language || 'pt-BR';
    document.getElementById('pref-start').value = state.profile.work_start || '09:00';
    document.getElementById('pref-end').value = state.profile.work_end || '18:00';
    document.getElementById('pref-pomo-duration').value = state.profile.pomo_duration || 25;
    document.getElementById('pref-break-duration').value = state.profile.break_duration || 5;
    document.getElementById('pref-sound').checked = state.profile.sound_enabled !== false;
    document.getElementById('pref-date-format').value = state.profile.date_format || 'DD/MM';

    const workDays = state.profile.work_days || [1, 2, 3, 4, 5];
    document.querySelectorAll('#pref-days .day-btn').forEach(btn => {
        btn.classList.toggle('active', workDays.includes(parseInt(btn.dataset.day)));
    });

    const acc = state.profile.accent_color || '#351cd4';
    document.getElementById('pref-accent').innerHTML = COLORS.map(c =>
        `<div class="cpick ${c === acc ? 'sel' : ''}" style="background:${c}" data-accent="${c}"></div>`
    ).join('');

    const tzSel = document.getElementById('pref-timezone');
    if (!tzSel.options.length) {
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

    tzSel.value = state.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

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
        company_name: document.getElementById('pref-company').value,
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
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        document.addEventListener('click', e => {
            if (!sidebar.classList.contains('open')) return;

            if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    const fab = document.getElementById('fab-add-task');
    if (fab) {
        fab.addEventListener('click', () => openTaskModal());
    }
});

// Re-exportar funções de profile.js para manter compatibilidade
export { openProfile, closeProfile } from './profile.js';