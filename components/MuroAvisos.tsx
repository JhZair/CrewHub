"use client";
import { useEffect, useState, type ReactNode } from "react";

/* MURO DE AVISOS.
 *
 * Un aviso no es un caso: no se resuelve, RIGE. Es una instrucción que importa
 * hasta que otra la reemplaza («Hoy grabamos a las 6, traigan baterías»). Metido
 * en la lista de casos se perdía —lo apagaba «mis asuntos», lo escondía un
 * filtro por estado, se hundía bajo 50 tareas—. Aquí tiene su pared: separado,
 * arriba, siempre a la vista. Nadie debería enterarse tarde de un aviso.
 *
 * Plegable con memoria (por ámbito): arranca abierto —para eso es un muro— pero
 * quien ya los leyó puede plegarlo y se recuerda. Presentacional en el resto:
 * recibe las tarjetas YA renderizadas en el servidor (mismas que la lista) y
 * solo las enmarca. Reutilizable en cualquier ámbito (perfil, proyecto, feed…),
 * que es a donde va a migrar la regla.
 */
export default function MuroAvisos({ avisos, id, titulo = "📢 Avisos", abiertoPorDefecto = true }: {
  avisos: ReactNode[];
  /** Clave de memoria del plegado, única por ámbito. */
  id: string;
  titulo?: string;
  abiertoPorDefecto?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [listo, setListo] = useState(false);
  const llave = `plg:muro:${id}`;
  useEffect(() => {
    try { const v = localStorage.getItem(llave); if (v !== null) setAbierto(v === "1"); } catch { /* da igual */ }
    setListo(true);
  }, [llave]);
  const alternar = () => {
    const n = !abierto;
    setAbierto(n);
    try { localStorage.setItem(llave, n ? "1" : "0"); } catch { /* da igual */ }
  };

  if (!avisos.length) return null;
  return (
    /* `muro-avisos` y no `muro`: esa clase la usaba TAMBIEN el muro de notas
       de una ficha (components/MuroProyecto), y como esta regla va despues en
       la hoja, su marco violeta se pintaba alrededor de aquel muro entero. */
    <section className={`muro-avisos ${abierto ? "on" : ""}`}>
      <button className="muro-h" onClick={alternar} aria-expanded={abierto}
        title={abierto ? "Plegar avisos" : "Ver avisos"}>
        <span className="plg-flecha">{abierto ? "▾" : "▸"}</span>
        <span className="muro-tit">{titulo}</span>
        <span className="muro-n">{avisos.length}</span>
        <span className="muro-sub">rigen hasta que otro los reemplace</span>
      </button>
      <div className="muro-body" hidden={!abierto} style={listo ? undefined : { visibility: "hidden" }}>
        {avisos}
      </div>
    </section>
  );
}
