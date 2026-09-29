// Service Worker: เก็บไฟล์ทั้งหมดไว้ในเครื่อง ให้เปิดใช้งานแบบออฟไลน์ได้
// เมื่อแก้ไฟล์ใด ๆ ให้เปลี่ยนเลข VERSION เพื่อให้ผู้ใช้ได้ไฟล์ใหม่
const VERSION = "v1";
const CACHE = `mini-paint-${VERSION}`;
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/style.css",
  "./js/main.js", "./js/drawing.js", "./js/tools.js", "./js/history.js", "./js/storage.js", "./js/pwa.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// กลยุทธ์: cache-first, ถ้าไม่มีค่อยไปเอาจากเน็ตแล้วเก็บเพิ่ม
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => e.request.mode === "navigate" ? caches.match("./index.html") : undefined))
  );
});
