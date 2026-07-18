import "./globals.css";
import type { Metadata, Viewport } from "next";
import BotonNuevoCaso from "@/components/BotonNuevoCaso";
import CampanitaGlobal from "@/components/CampanitaGlobal";
import BuscadorFlotante from "@/components/BuscadorFlotante";
import BancoTrabajo from "@/components/BancoTrabajo";
import QuienEstaGlobal from "@/components/QuienEstaGlobal";

/* EL TÍTULO DE CADA PESTAÑA
   Aquí vivía el único `title` de toda la app, así que las diez pestañas que
   el equipo tiene abiertas a la vez se llamaban igual y había que hacer clic
   para saber cuál era cuál. Ahora cada ruta pone el suyo y esto es solo el
   respaldo.

   `template` pone «· CrewHub+» DETRÁS, nunca delante: Chrome recorta el
   título por el final, así que un prefijo se come lo único que distingue una
   pestaña de otra. Con diez abiertas se lee «📢 Llegó not…» — y con eso
   basta. El sufijo solo se ve en el historial y los marcadores, que es
   exactamente donde sirve. */
export const metadata: Metadata = {
  title: {
    default: "CrewHub+ by KAWSAY",
    template: "%s · CrewHub+",
  },
  description: "El centro operativo del equipo: publicaciones, casos y seguimiento.",
  applicationName: "CrewHub+",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CrewHub+" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <QuienEstaGlobal />
        <BancoTrabajo />
        <BuscadorFlotante />
        <CampanitaGlobal />
        <BotonNuevoCaso />
      </body>
    </html>
  );
}
