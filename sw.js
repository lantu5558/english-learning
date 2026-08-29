const CACHE = 'lebao-v4';
// 动态计算基准路径，兼容根目录和子目录部署（如 /english-learning/）
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const ASSETS = [BASE, BASE + 'index.html', BASE + 'manifest.json', BASE + 'icon.svg'];

// 音视频后缀：这些一律不进 Cache Storage
const MEDIA_RE = /\.(mp4|m3u8|ts|mp3|m4a|aac|wav|ogg|webm|flv|mov|mkv)(\?|$)/i;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 页面本身网络优先，并且强制绕过 HTTP 缓存（GitHub Pages 对 html 有 10 分钟强缓存，
  // 不绕过的话刚部署的新代码要等十分钟才能在手机/平板上生效）。失败才用离线缓存。
  const isPage = e.request.mode === 'navigate' || url.pathname === BASE || url.pathname === BASE + 'index.html';
  if (isPage) {
    const fresh = new URL(e.request.url);
    fresh.searchParams.set('_swt', String(Date.now()));
    const req = new Request(fresh.toString(), { cache: 'no-store', redirect: 'follow', credentials: 'omit' });
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(BASE + 'index.html', clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(BASE + 'index.html'))
    );
    return;
  }

  // 视频/音频直接走网络，不缓存。
  // 原因：整段 mp4 塞进 Cache Storage 会几十兆几十兆地涨，很快就触发配额上限，
  // 连带把页面和图标的离线缓存也挤掉。视频本来就是在线看的，缓存下来没意义。
  // （destination 在老 WebView 里可能为空，所以再用后缀兜一层）
  const dest = e.request.destination || '';
  if (dest === 'video' || dest === 'audio' || MEDIA_RE.test(url.pathname)) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 504 })));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      if (e.request.method === 'GET' && res.status === 200) {
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(BASE + 'index.html')))
  );
});
