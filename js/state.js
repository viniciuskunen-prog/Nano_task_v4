export const state = {
  currentUser: null,
  profile: {},
  groups: [],
  tasks: [],
  view: (() => {
    try {
      const saved = localStorage.getItem('currentView');
      return saved ? JSON.parse(saved) : { type: 'smart', value: 'all' };
    } catch {
      return { type: 'smart', value: 'all' };
    }
  })(),
  priFilter: 'all',
  expanded: new Set(),
  expandedTasks: new Set(),
  unlockedBadges: new Set(),
  reportMonth: { y: new Date().getFullYear(), m: new Date().getMonth() },
  pendingCompleteId: null,
  displayMode: localStorage.getItem('viewMode') || 'list',
  taskSortMode: localStorage.getItem('taskSortMode') || 'manual',
  columns: [],
};
