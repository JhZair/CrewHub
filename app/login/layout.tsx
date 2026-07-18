import type { Metadata } from "next";

/* Este layout existe SOLO por el título de la pestaña: /login es un client
   component («use client») y un client component no puede exportar
   `metadata` — Next lo recoge en el servidor, antes de que exista el
   navegador. El layout sí es de servidor, así que aquí sí. */
export const metadata: Metadata = { title: "Entrar" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
