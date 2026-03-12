import { sb } from './config.js';
import { state } from './state.js';
import { fmtHours, tagColor, escapeHTML } from './utils.js';
import { getLevelFromXP } from './xp.js';

export async function getReportStats() {
    const userId = state.currentUser.id;
    const now = new Date();

    // We want data for the last 7 days for the weekly chart
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // 1. Fetch XP Events (for timeline and XP stats)
    const { data: xpEvents, error: xpErr } = await sb.from('xp_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    // 2. Fetch recent activities for timeline (limit 15)
    const recentXp = (xpEvents || []).slice(0, 15);

    // 3. Calculate weekly data (last 7 days including today)
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

        const dayTasks = state.tasks.filter(t => t.done && t.completed_at && t.completed_at.startsWith(dayStr)).length;
        const dayXp = (xpEvents || []).filter(e => e.created_at.startsWith(dayStr)).reduce((acc, e) => acc + e.points, 0);

        weeklyData.push({ dayLabel, dayTasks, dayXp, date: dayStr });
    }

    // 4. Main metrics
    const totalDone = state.tasks.filter(t => t.done).length;
    const totalPomos = state.profile.pomo_sessions || 0;
    const totalXp = state.profile.xp_total || 0;

    // Total focus time from tasks (time_spent is in seconds)
    const totalSeconds = state.tasks.reduce((acc, t) => acc + (t.time_spent || 0), 0);
    const totalFocusHours = Math.floor(totalSeconds / 3600);
    const focusTimeFormatted = totalFocusHours > 0 ? `${totalFocusHours}h` : `${Math.floor(totalSeconds / 60)}m`;

    // 5. Heatmap Data (Últimos 90 dias)
    const heatmapData = {};
    for (let i = 89; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        heatmapData[dayStr] = 0;
    }
    
    // Contar tarefas concluidas
    state.tasks.forEach(t => {
        if (t.done && t.completed_at) {
            const dayStr = t.completed_at.substring(0, 10);
            if (heatmapData[dayStr] !== undefined) {
                heatmapData[dayStr]++;
            }
        }
    });

    return {
        metrics: [
            { label: 'XP Total', value: totalXp, icon: 'zap', color: 'var(--yellow)' },
            { label: 'Tarefas', value: totalDone, icon: 'check-circle', color: 'var(--accent)' },
            { label: 'Pomodoros', value: totalPomos, icon: 'timer', color: 'var(--red)' },
            { label: 'Tempo Foco', value: focusTimeFormatted, icon: 'clock', color: 'var(--green)' }
        ],
        weeklyData,
        recentXp,
        totalSeconds,
        totalXp,
        heatmapData
    };
}

export async function renderReportUI() {
    const container = document.getElementById('report-container');
    if (!container) return;

    // Show loading state
    container.innerHTML = `<div class="report-loading"><div class="spinner"></div><p>Gerando relatório...</p></div>`;

    const stats = await getReportStats();
    const xpInfo = getLevelFromXP(stats.totalXp);

    let html = `
        <div class="report-view-wrapper fade-in">
            <!-- 1. MÉTRICAS PRINCIPAIS -->
            <div class="report-grid-metrics">
                ${stats.metrics.map(m => `
                    <div class="report-metric-card">
                        <div class="rmc-icon" style="background: ${m.color}20; color: ${m.color}">
                            <i data-lucide="${m.icon}"></i>
                        </div>
                        <div class="rmc-content">
                            <div class="rmc-val">${m.value}</div>
                            <div class="rmc-lbl">${m.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="report-row-secondary">
                <!-- 2. GRÁFICO SEMANAL -->
                <div class="report-chart-section">
                    <div class="report-section-title">Produtividade Semanal</div>
                    <div class="weekly-chart">
                        ${stats.weeklyData.map(d => {
        const maxTasks = Math.max(...stats.weeklyData.map(w => w.dayTasks), 1);
        const height = Math.max(5, (d.dayTasks / maxTasks) * 100);
        return `
                                <div class="chart-col">
                                    <div class="chart-bar-wrap">
                                        <div class="chart-bar" style="height: ${height}%" title="${d.dayTasks} tarefas"></div>
                                    </div>
                                    <div class="chart-label">${d.dayLabel}</div>
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>

                <!-- 3. PROGRESSO DE FOCO -->
                <div class="report-focus-section">
                    <div class="report-section-title">Meta de Foco</div>
                    <div class="focus-progress-container">
                        <div class="focus-ring-wrap">
                            <svg class="focus-ring-svg" viewBox="0 0 100 100">
                                <circle class="focus-ring-track" cx="50" cy="50" r="45" />
                                <circle class="focus-ring-fill" cx="50" cy="50" r="45" style="stroke-dashoffset: ${283 - (283 * Math.min(stats.totalSeconds / 14400, 1))}" />
                            </svg>
                            <div class="focus-ring-content">
                                <div class="frc-val">${Math.round(Math.min((stats.totalSeconds / 14400) * 100, 100))}%</div>
                                <div class="frc-sub">da meta</div>
                            </div>
                        </div>
                        <div class="focus-stats">
                            <div class="fs-item">
                                <span class="fs-label">Realizado</span>
                                <span class="fs-val">${Math.floor(stats.totalSeconds / 3600)}h ${Math.floor((stats.totalSeconds % 3600) / 60)}m</span>
                            </div>
                            <div class="fs-item">
                                <span class="fs-label">Meta Diária (4h)</span>
                                <span class="fs-val">4h 00m</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. TIMELINE DE ATIVIDADES -->
            <div class="report-timeline-section">
                <div class="report-section-title">Atividades Recentes</div>
                <div class="timeline-list">
                    ${stats.recentXp.length ? stats.recentXp.map(evt => {
        const date = new Date(evt.created_at);
        const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const { icon, label, color } = getEventDetails(evt.type);
        return `
                            <div class="timeline-item">
                                <div class="tl-icon" style="background: ${color}20; color: ${color}">
                                    <i data-lucide="${icon}"></i>
                                </div>
                                <div class="tl-body">
                                    <div class="tl-title">${label}</div>
                                    <div class="tl-meta">${day} às ${time} • <span class="tl-pts">+${evt.points} XP</span></div>
                                </div>
                            </div>
                        `;
    }).join('') : '<div class="empty-msg">Nenhuma atividade recente encontrada.</div>'}
                </div>
            </div>
            
            <!-- 5. HEATMAP DE ATIVIDADE -->
            <div class="report-heatmap-section">
                <div class="report-section-title">Nível de Atividade (Últimos 90 dias)</div>
                <div class="heatmap-grid">
                    ${Object.entries(stats.heatmapData).map(([date, count]) => {
                        let level = 0;
                        if (count > 0 && count < 3) level = 1;
                        else if (count >= 3 && count < 6) level = 2;
                        else if (count >= 6) level = 3;
                        
                        const dateObj = new Date(date + 'T12:00:00'); 
                        const dateStr = dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
                        const tooltip = count === 0 ? `Nenhuma tarefa em ${dateStr}` : `${count} tarefa${count > 1 ? 's' : ''} em ${dateStr}`;
                        
                        return `<div class="heatmap-cell level-${level}" title="${tooltip}"></div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

function getEventDetails(type) {
    const map = {
        'task_complete': { icon: 'check-circle', label: 'Tarefa Concluída', color: 'var(--accent)' },
        'task_on_time': { icon: 'calendar', label: 'Concluída no Prazo', color: 'var(--green)' },
        'subtask_complete': { icon: 'list', label: 'Subtarefa Finalizada', color: 'var(--accent-hover)' },
        'pomodoro_complete': { icon: 'timer', label: 'Sessão Pomodoro', color: 'var(--red)' },
        'level_up': { icon: 'trending-up', label: 'Novo Nível Atingido!', color: 'var(--yellow)' },
        'badge_unlock': { icon: 'award', label: 'Medalha Desbloqueada', color: 'var(--yellow)' }
    };
    return map[type] || { icon: 'activity', label: 'Atividade', color: 'var(--text-muted)' };
}
