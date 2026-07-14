import { ReactNode } from "react";

/* Alerta estándar de la ficha: banner con tono (roja/ambar/verde/azul),
   título y detalle opcional. Un solo lenguaje visual para todos los avisos. */

const TONOS: Record<string, { c: string; b: string; g: string }> = {
  roja:  { c: "var(--red)",    b: "rgba(255,77,94,.4)",  g: "rgba(255,77,94,.08)" },
  ambar: { c: "var(--yellow)", b: "rgba(244,180,0,.4)",  g: "rgba(244,180,0,.08)" },
  verde: { c: "var(--green)",  b: "rgba(46,204,113,.4)", g: "rgba(46,204,113,.08)" },
  azul:  { c: "var(--blue)",   b: "rgba(59,130,246,.4)", g: "rgba(59,130,246,.08)" },
};

export default function Alerta({ tono = "ambar", titulo, detalle, children }: {
  tono?: "roja" | "ambar" | "verde" | "azul";
  titulo: ReactNode; detalle?: ReactNode; children?: ReactNode;
}) {
  const t = TONOS[tono] || TONOS.ambar;
  return (
    <div className="card" style={{ margin: "0 0 12px", padding: "10px 14px", borderColor: t.b, background: `linear-gradient(90deg,${t.g},transparent 65%)` }}>
      <span style={{ color: t.c, fontSize: 13, fontWeight: 600 }}>{titulo}</span>
      {detalle && <span style={{ color: "var(--muted)", fontSize: 12.5, display: "block", marginTop: 3 }}>{detalle}</span>}
      {children}
    </div>
  );
}
