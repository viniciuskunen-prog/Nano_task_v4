const CACHE_NAME = 'nanotask-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './profile.css',
    './notifications.css',
    './js/main.js',
    './js/config.js',
    './js/auth.js',
    './js/state.js',
    './js/render.js',
    './js/ui.js',
    './js/tasks.js',
    './js/utils.js',
    './js/pomodoro.js',
    './js/xp.js',
    './js/badges.js',
    './js/lucide.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
