import type { Metadata } from "next";

/* Igual que en /login: la página es client component y no puede exportar
   `metadata`, así que el título vive en su layout. */
export const metadata: Metadata = { title: "📡 Monitor" };

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
