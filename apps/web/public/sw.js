/* Service worker: offline shell + web push for the daily check-in reminder.
 * iOS requires 16.4+ AND add-to-home-screen for push; when unavailable the
 * flow degrades to staff-assisted mode, which is a first-class path. */

const CACHE = "strainx-shell-v1";
const SHELL = ["/checkin", "/trends", "/companion", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((hit) => hit || caches.match("/checkin")),
        ),
    );
  }
});

self.addEventListener("push", (event) => {
  const shownAt = Date.now();
  event.waitUntil(
    self.registration.showNotification("오늘의 기록", {
      body: "오늘 기분이 어떠세요? 눌러서 알려주세요.",
      icon: "/icons/icon-192.png",
      data: { shownAt },
      tag: "daily-checkin",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // nt=<timestamp> lets the page compute latency_s (notification -> completion).
  const url = `/checkin?nt=${event.notification.data?.shownAt ?? Date.now()}`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) { w.navigate(url); return w.focus(); }
      }
      return clients.openWindow(url);
    }),
  );
});
