import { sb } from './config.js'
import { state } from './state.js'
import { checkBadges } from './badges.js'
import { push as pushNotification } from './notifications.js'

// Importação dinâmica para evitar circular dependency
let updateXPBar = null;
async function getUpdateXPBar() {
    if (!updateXPBar) {
        const uiModule = await import('./ui.js');
        updateXPBar = uiModule.updateXPBar;
    }
    return updateXPBar;
}

/*
XP TABLE

type → tipo do evento
points → pontos ganhos
task_id → opcional
created_at → timestamp
*/

const XP_VALUES = {
    task_complete: 4,
    task_on_time: 2,
    subtask_complete: 1,
    pomodoro_complete: 1
}

export async function awardXP(type, taskId = null) {

    const points = XP_VALUES[type]
    if (!points) return

    const userId = state.currentUser?.id
    if (!userId) return

    const now = new Date().toISOString()

    // registrar evento
    await sb.from('xp_events').insert({
        user_id: userId,
        type,
        points,
        task_id: taskId,
        created_at: now
    })

    // atualizar XP total local
    state.profile.xp_total = (state.profile.xp_total || 0) + points

    // salvar no Supabase
    await sb.from('profiles')
        .update({ xp_total: state.profile.xp_total })
        .eq('id', userId)

    // Ler valor do banco para sincronizar (evita perda em race condition)
    const { data: profile } = await sb.from('profiles')
        .select('xp_total')
        .eq('id', userId)
        .single()

    if (profile?.xp_total !== undefined) {
        state.profile.xp_total = profile.xp_total
    }

    // Criar animação flutuante de XP (Floating XP)
    createFloatingXP(points, taskId);

    // Atualizar barra de XP no sidebar
    const updateXPBarFn = await getUpdateXPBar();
    if (updateXPBarFn) updateXPBarFn();

    await checkLevelUp()
}

async function checkLevelUp() {

    const xp = state.profile.xp_total || 0
    const { level: newLevel } = getLevelFromXP(xp)

    // Calcular nível anterior para comparação
    const prevXp = Math.max(0, xp - 1)
    const { level: prevLevel } = getLevelFromXP(prevXp)

    if (newLevel > prevLevel) {

        // Nível é calculado dinamicamente, não armazenar
        // Apenas notificar e verificar badges

        // Notificar level up
        pushNotification({ type: 'level', level: newLevel })

        // Verificar badges de nível
        await checkBadges('level_up', { newLevel })
    }
}

// ── CALCULAR NÍVEL A PARTIR DE XP ─────────
export function getLevelFromXP(xp) {
    const xpTotal = xp || 0;
    const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 150)) + 1);

    // XP necessário para atingir o nível atual (usa level-1 porque o nível começa em 1)
    const xpForCurrentLevel = 150 * (level - 1) * (level - 1);
    // XP necessário para atingir o próximo nível
    const xpForNextLevel = 150 * level * level;
    // XP ganho neste nível
    const xpInCurrentLevel = xpTotal - xpForCurrentLevel;
    // XP necessário para próximo nível neste nível
    const xpNeededInLevel = xpForNextLevel - xpForCurrentLevel;

    return {
        level,
        xpCurrentLevel: xpInCurrentLevel,
        xpNextLevel: xpNeededInLevel,
        progressPercent: Math.min(100, Math.round((xpInCurrentLevel / xpNeededInLevel) * 100))
    };
}

// ── FLOATING XP ANIMATION ─────────
function createFloatingXP(points, taskId) {
    const xpEl = document.createElement('div');
    xpEl.className = 'floating-xp';
    xpEl.textContent = `+${points} XP`;

    let targetEl = null;
    if (taskId) {
        // Tenta achar o checkbox da tarefa
        targetEl = document.querySelector(`#task-${taskId} .checkbox`);
    }

    // Fallback: se não achar a tarefa, joga no meio da tela no topo
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        xpEl.style.left = `${rect.left + rect.width / 2}px`;
        xpEl.style.top = `${rect.top}px`;
    } else {
        xpEl.style.left = '50%';
        xpEl.style.top = '20%';
        xpEl.style.transform = 'translate(-50%, 0)';
    }

    document.body.appendChild(xpEl);

    // Forçar reflow para animar
    void xpEl.offsetWidth;
    xpEl.classList.add('animate');

    setTimeout(() => {
        if (xpEl.parentNode) xpEl.parentNode.removeChild(xpEl);
    }, 1500);
}