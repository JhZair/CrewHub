"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TablaVistas from "@/components/TablaVistas";
import { sumarPersonalFondo } from "@/app/actions";
import { ROLES_EQUIPO as ROLES } from "@/lib/rolesEquipo";

/* ── EXPLORAR EL DIRECTORIO PARA SUMAR AL FONDO ──
 *
 * Sumar personal se hacía con un buscador por nombre. Sirve cuando ya sabes a
 * quién quieres; no sirve para la pregunta que de verdad se hace al armar un
 * equipo: «¿qué sonidistas de Cusco tenemos?», «¿a quiénes del equipo técnico
 * no hemos llamado todavía?». Filtrar por tipo, equipo, región o especialidad
 * ya existía —en /personas, pestaña Tabla— y no había forma de llegar a ello
 * desde aquí sin abandonar el fondo.
 *
 * Este componente NO reimplementa la tabla: abre la misma, en modo selección.
 * Las columnas, los operadores y hasta las vistas guardadas del equipo son las
 * de /personas, porque son literalmente el mismo componente.
 *
 * ── SE QUEDA ABIERTO ──
 * Sumar a alguien no cierra el pop-up. Armar un equipo son cinco o seis
 * personas del mismo filtro, y cerrar tras cada una obligaría a repetir el
 * filtro seis veces. La fila se marca ✔ en el sitio y se sigue.
 */
export default function SumarPersonalFondo({
  postulacionId, personas, vistas, yaEstan,
}: {
  postulacionId: string;
  /** Las filas completas del directorio: las mismas que /personas. */
  personas: any[];
  vistas: any[];
  /** Quién está ya en el fondo — por recibo, por postulación o a mano. */
  yaEstan: string[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargo, setCargo] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  /* Los sumados en ESTA sesión del pop-up. `router.refresh()` acabará trayendo
     la lista de verdad, pero tarda un viaje al servidor: sin esto, el ✔ no
     aparecería hasta un segundo después del clic y daría la sensación de que
     no pasó nada — o peor, invitaría a pulsar dos veces. */
  const [nuevos, setNuevos] = useState<string[]>([]);

  const sumar = async (fila: any) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await sumarPersonalFondo(postulacionId, fila.id, cargo, nota);
    setOcupado(false);
    if (r?.error) { setError(`${fila.nombre}: ${r.error}`); return; }
    setNuevos(s => [...s, fila.id]);
    router.refresh();
  };

  const cerrar = () => {
    setAbierto(false); setError("");
    /* El cargo y la nota NO se conservan entre aperturas: se escribieron para
       una tanda concreta («traductora de las entrevistas») y arrastrarlos a la
       siguiente los pegaría a quien no le tocan, en silencio. */
    setCargo(""); setNota(""); setNuevos([]);
  };

  return (
    <>
      <button className="btn btn-ghost" style={{ padding: "4px 11px", fontSize: 12 }}
        onClick={() => setAbierto(true)}>＋ Sumar</button>

      {abierto && (
        <div className="modal-fondo" onClick={cerrar}>
          <div className="modal-caja modal-ancho" onClick={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>👥 Sumar personal al fondo</b>
              <button className="modal-x" onClick={cerrar}>✕</button>
            </div>

            {/* ── EL CARGO SE ESCRIBE ANTES, NO DESPUÉS ──
                Se aplica a todo lo que sumes mientras esté escrito. Es lo que
                convierte «buscar y añadir» en un gesto: filtras «sonidista»,
                escribes el cargo una vez y sumas a los tres con un clic cada
                uno. Puede quedar vacío —el cargo se corrige luego en la fila,
                con el ✎— pero pedirlo aquí es lo que evita una lista de doce
                personas sin cargo que nadie vuelve a repasar. */}
            <div className="spf-cab">
              <datalist id="roles-sumar">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
              <label className="spf-lbl">Cargo en este fondo</label>
              <input list="roles-sumar" className="ent-lote-inp" style={{ width: 210 }}
                value={cargo} onChange={e => setCargo(e.target.value)}
                placeholder="Sonidista, Traductora…" />
              <input className="ent-lote-inp" style={{ flex: 1, minWidth: 200 }}
                value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Por qué (opcional): «traductora de las entrevistas»" />
              <span className="spf-ayuda">
                se aplica a quien sumes ahora · se corrige después en su fila
              </span>
            </div>

            {error && <div className="err-inline">⚠ {error}</div>}

            <TablaVistas entidad="persona" filas={personas} vistas={vistas}
              seleccion={{
                yaEstan: [...yaEstan, ...nuevos],
                onElegir: sumar,
                ocupado,
                yaTxt: "Ya está en el personal de este fondo",
                addTxt: "Sumar al personal de este fondo",
              }} />
          </div>
        </div>
      )}
    </>
  );
}
