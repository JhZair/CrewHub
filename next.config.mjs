/** @type {import('next').NextConfig} */

/* ── QUIÉN PUEDE EMBEBER ESTA APLICACIÓN ──
   El Monitor mete CrewHub dentro de dos iframes suyos, y desde ahora un marco
   con `name="crewhub-panel…"` obtiene los controles de trabajo (el ＋, la
   campanita, el buscador; ver lib/panel.ts). Ese nombre lo pone quien crea el
   iframe, así que sin esta cabecera cualquier sitio podría embeber CrewHub,
   ponerle el nombre y enseñar sus botones dentro de una página ajena — con la
   sesión de quien mira.
   `frame-ancestors 'self'`: solo nos embebemos nosotros. El propio Monitor
   sigue funcionando porque es el mismo origen. */
const nextConfig = {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        // Para los navegadores que aún no miran `frame-ancestors`.
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    }];
  },
};
export default nextConfig;
