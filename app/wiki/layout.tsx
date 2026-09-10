import type { Metadata } from "next";
import "./wiki.css";
import WikiShell from "@/components/wiki/WikiShell";
import { EstilosAreas } from "@/components/wiki/Piezas";
import { listarAreas } from "@/lib/wiki/datos";

/* ══════════════════════════════════════════════════════════════════════════
   📖 /wiki — LA WIKI TÉCNICA DE REALIZACIÓN AUDIOVISUAL

   Layout propio (guía, sección 9): no reutiliza la navegación ni el aspecto
   del panel de gestión. `wiki.css` va con prefijo `.wk` y oculta los
   flotantes del zócalo mientras se está aquí.

   ⚠ Sin `loading.tsx`: ver components/Enlace.tsx y middleware.ts.
   Cada página comprueba la sesión por su cuenta (regla de la casa).
   ══════════════════════════════════════════════════════════════════════════ */
export const metadata: Metadata = { title: { default: "📖 Wiki", template: "%s · Wiki" } };

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const areas = await listarAreas();
  return (
    <>
      <EstilosAreas areas={areas} />
      <WikiShell>{children}</WikiShell>
    </>
  );
}
