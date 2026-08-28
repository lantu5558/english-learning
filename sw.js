const CACHE = 'lebao-v2';
// 动态计算基准路径，兼容根目录和子目录部署（如 /english-learning/）
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const ASSETS = [BASE, BASE + 'index.html', BASE + 'manifest.json', BASE + 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 页面本身网络优先，保证各设备能拿到最新版代码；失败才用缓存
  const isPage = e.request.mode === 'navigate' || url.pathname === BASE || url.pathname === BASE + 'index.html';
  if (isPage) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(BASE + 'index.html', clone));
        return res;
      }).catch(() => caches.match(BASE + 'index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      if (e.request.method === 'GET' && res.status === 200) {
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(BASE + 'index.html')))
  );
});
