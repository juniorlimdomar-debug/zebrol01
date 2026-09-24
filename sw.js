const CACHE = 'zebrol-shell-offline-v2';
const FILES = ['index.html','offline-store.js','offline-register.js','manifest.webmanifest','icon-192.png','icon-512.png',
  'vendor/tailwind.js','vendor/react.js','vendor/react-dom.js','vendor/babel.js',
  'vendor/firebase-app.js','vendor/firebase-auth.js','vendor/firebase-firestore.js'];
const urls = FILES.map(file => new URL(file,self.registration.scope).href);
self.addEventListener('install',event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(urls.map(url => new Request(url,{ cache: 'reload' })));
    // Initial installation activates immediately. Later versions wait for old
    // tabs to close, preventing a mixed-version page during an offline save.
  })());
});
self.addEventListener('activate',event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('zebrol-shell-offline-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const home = new URL('index.html',scope).href;
  const navigation = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL(home).pathname);
  const target = navigation ? home : url.href;
  // Cache ONLY the finite app shell. Never cache Firebase replies, photos,
  // authentication endpoints, arbitrary navigations or user data here.
  if(!urls.includes(target)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(target);
    if(cached) return cached;
    return fetch(event.request);
  })());
});
