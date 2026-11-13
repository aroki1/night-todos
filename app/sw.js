/* sw.js — cache-first app shell. Bump VERSION on every release. All paths relative (works under a subpath). */
const VERSION = 'ns-v11-20261114';
const SHELL = [
  './',
  './fonts/IBMPlexMono-Medium.woff2',
  './fonts/IBMPlexMono-Regular.woff2',
  './icons/apple-touch-icon-180.png',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './index.html',
  './manifest.webmanifest',
  './src/choreo/create.js',
  './src/choreo/expire.js',
  './src/choreo/finish.js',
  './src/choreo/ritual.js',
  './src/choreo/undo.js',
  './src/dev/hooks.js',
  './src/dev/selftest.js',
  './src/framebuffer.js',
  './src/main.js',
  './src/math.js',
  './src/model/parser.js',
  './src/model/placement.js',
  './src/model/store.js',
  './src/model/timeline.js',
  './src/model/week.js',
  './src/platform.js',
  './src/render/compose.js',
  './src/render/ritual.js',
  './src/render/text.js',
  './src/sky/clock.js',
  './src/sky/clouds.js',
  './src/sky/components.js',
  './src/sky/events.js',
  './src/sky/moon.js',
  './src/sky/past.js',
  './src/sky/sky.js',
  './src/tokens.js',
  './src/ui/bar.js',
  './src/ui/keys.js',
  './src/ui/pointer.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ns-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
