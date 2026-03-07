export const state = {
  currentUser: null,
  profile: {},
  groups: [],
  tasks: [],
  view: { type: 'smart', value: 'all' },
  priFilter: 'all',
  expanded: new Set(),
  expandedTasks: new Set(),
  reportMonth: { y: new Date().getFullYear(), m: new Date().getMonth() },
  pendingCompleteId: null,
};
