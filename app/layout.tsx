import "./globals.css";
import type { Metadata, Viewport } from "next";
import BotonNuevoCaso from "@/components/BotonNuevoCaso";
import CampanitaGlobal from "@/components/CampanitaGlobal";
import BuscadorFlotante from "@/components/BuscadorFlotante";
import BancoTrabajo from "@/components/BancoTrabajo";

export const metadata: Metadata = {
  title: "CrewHub+ by KAWSAY",
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
        <BancoTrabajo />
        <BuscadorFlotante />
        <CampanitaGlobal />
        <BotonNuevoCaso />
      </body>
    </html>
  );
}
