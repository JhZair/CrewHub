import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CrewHub+ by KAWSAY",
  description: "El centro operativo del equipo: publicaciones, casos y seguimiento.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
