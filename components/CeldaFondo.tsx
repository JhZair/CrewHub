/* Una celda de la franja de arriba del fondo. Vivía dentro de la página; sale
   a su propio archivo porque ahora la pinta el layout, y el layout y la página
   no pueden compartir funciones locales. */
export default function CeldaFondo({ k, v, sub, destacado, alerta }: {
  k: string; v: string;
  /** Segunda línea, chica: lo que matiza la cifra («a 5 personas»). Sin ella,
   *  o cabía en el rótulo o se perdía. */
  sub?: string;
  destacado?: boolean; alerta?: boolean;
}) {
  return (
    <div className="fondo-celda">
      <span className="fondo-celda-k">{k}</span>
      <span className="fondo-celda-v" style={{
        color: alerta ? "var(--yellow)" : destacado ? "var(--teal)" : "var(--text)",
        fontWeight: destacado ? 700 : 600,
      }}>{v}</span>
      {sub && <span className="fondo-celda-sub">{sub}</span>}
    </div>
  );
}
