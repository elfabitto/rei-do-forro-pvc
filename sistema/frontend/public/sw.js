/*
 * Service worker do Rei do Forro — só para as notificações (Web Push).
 * Não guarda cache das telas: o sistema precisa de internet de qualquer jeito.
 *
 * O servidor empurra {titulo, mensagem, link, id}; tocar na notificação abre
 * (ou traz para frente) o sistema já na tela do aviso.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let d = {};
  try { d = evento.data ? evento.data.json() : {}; } catch { d = { titulo: evento.data?.text() }; }
  evento.waitUntil(
    self.registration.showNotification(d.titulo || "Rei do Forro", {
      body: d.mensagem || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: d.id ? `rf-${d.id}` : undefined,
      data: { link: d.link || "/" },
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.link || "/", self.location.origin).href;
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) {
        await j.focus();
        if ("navigate" in j) await j.navigate(destino).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
