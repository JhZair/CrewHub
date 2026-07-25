/* CrewHub+ — service worker de notificaciones push.
   Recibe el push del servidor y lo muestra; al tocarla, abre el caso. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "CrewHub+", {
      body: d.cuerpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag || undefined,          // agrupa repetidas del mismo caso
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
