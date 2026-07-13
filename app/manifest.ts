import type { MetadataRoute } from "next";

/* Manifest PWA: hace a CrewHub+ instalable como app propia (ventana e
   ícono aparte del navegador). display_override "tabbed" permite, en
   navegadores que lo soportan, tener varias pestañas dentro de la app
   (inicio, tablero, pantalla); si no, cae a "standalone". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CrewHub+ by KAWSAY",
    short_name: "CrewHub+",
    description: "El centro operativo del equipo: publicaciones, casos vivos y seguimiento.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // "tabbed" aún no está en los tipos de Next, pero el navegador lo soporta.
    display_override: ["tabbed", "standalone"] as any,
    orientation: "any",
    lang: "es",
    dir: "ltr",
    background_color: "#08080f",
    theme_color: "#08080f",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Tablero Kanban", short_name: "Tablero", url: "/tablero" },
      { name: "Pantalla TV", short_name: "Pantalla", url: "/pantalla" },
      { name: "Pulso", short_name: "Pulso", url: "/pulso" },
    ],
  };
}
