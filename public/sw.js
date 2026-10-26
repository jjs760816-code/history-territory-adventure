const CACHE = 'jams-shell-v1';
const SHELL = ['/offline.html','/assets/pwa/icon-192.png','/assets/pwa/icon-512.png','/assets/pwa/apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('jams-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  // Accounts, API responses, game state and third-party resources are never cached.
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html').then(response => response || new Response('인터넷 연결을 확인해 주세요.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
  }else if(SHELL.includes(url.pathname)){
    event.respondWith(caches.match(request).then(response => response || fetch(request)));
  }
});
