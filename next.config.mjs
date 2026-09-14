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
  /* ⚠ `pdf-parse` FUERA DEL EMPAQUETADO DEL SERVIDOR.
     Arrastra `pdfjs`, que trae binarios, `eval` y rutas de trabajador que se
     resuelven en tiempo de ejecución. Empaquetado por webpack se rompe de la
     peor manera: compila sin una queja y revienta al abrir el primer PDF, ya
     en producción. Como externo, Node lo carga de `node_modules` tal cual.
     Solo afecta al servidor: esto no cruza al navegador. */
  /* ⚠ `experimental.serverComponentsExternalPackages` y NO
     `serverExternalPackages`. El segundo es el nombre de Next 15 y este
     proyecto va por 14.2.15: allí la clave no existe, y Next NO falla — avisa
     («Unrecognized key(s) in object») y sigue compilando como si nada. O sea
     que el build sale en verde con el paquete empaquetado igualmente, y la
     avería aparece al abrir el primer PDF, en producción.
     El día que se suba a Next 15 hay que renombrarla: allí esta se ignora
     —también en silencio— y vuelve el mismo problema por el otro lado. */
  experimental: { serverComponentsExternalPackages: ["pdf-parse"] },
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
