"use client";
import { comprobarEquipo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIAS_RONDA, diasSinVer, enRonda, fueraDeRonda } from "@/lib/estadosEquipo";

/* ── «VISTO» — el sello de la ronda ──
 *
 * Dice una sola cosa: «puse los ojos encima de este equipo hoy, existe y está
 * bien». No es un estado ni una revisión técnica; es el acuse de que alguien lo
 * miró. Un inventario sin esto es una lista de lo que se compró, no de lo que
 * hay — y la diferencia aparece el día que se va a cargar la camioneta.
 *
 * ── POR QUÉ EL BOTÓN NO GRITA SIEMPRE ──
 * Antes salía encendido en TODAS las filas menos en las vistas hoy, así que una
 * búsqueda de veintiséis resultados eran veintiséis botones de colores llamando
 * la atención a la vez — y de esos, quizá tres tenían algo que pedir. Un aviso
 * que sale siempre no es un aviso: es el fondo de pantalla, y enseña a no mirar
 * justo cuando alguno sí importa.
 *
 * Ahora la fuerza del botón sigue a la MISMA regla que el chip «sin ver» de la
 * lista (`tocaRonda`, en lib/estadosEquipo.ts): encendido solo si nunca se vio
 * o si pasaron más de noventa días. Al día, sigue estando —se puede marcar
 * visto cuando a uno le dé la gana— pero en gris, sin reclamar nada.
 *
 * Lo que NO se hizo: esconderlo y sacarlo al pasar el ratón. Un botón que hay
 * que descubrir no existe para quien no sabe que está — la lección que ya
 * estaba escrita en components/Copiar.tsx.
 */
export default function BotonComprobar({ equipoId, ultima, estado, compacto = false }: {
  equipoId: string; ultima: string | null;
  /** El estado del equipo: decide si el sello tiene sentido siquiera. */
  estado?: string | null;
  compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const marcar = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (ocupado) return;
    setOcupado(true); setError("");
    const res = await comprobarEquipo(equipoId);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  /* ── LO QUE NO SE PUEDE VER, NO SE SELLA ──
     Un equipo dado por perdido no admite un «lo miré y está conforme»: si de
     verdad apareció, lo que hay que registrar es que apareció —cambiarle el
     estado—, y no un sello que dejaría en la ficha «visto hoy» junto a
     «Perdido».
     No se calla el hueco: en la vista de la ronda se dice por qué no hay
     botón. En la lista compacta no hace falta, porque la insignia del estado
     está pegada al lado diciendo «Perdido» con todas sus letras. */
  if (!enRonda(estado)) {
    if (compacto) return null;
    return (
      <span style={{ color: "var(--dim)", fontSize: 11, fontStyle: "italic" }}
        title="El sello de la ronda afirma que el equipo existe y está conforme, y sobre este estado eso no se puede afirmar.">
        {fueraDeRonda(estado)}
      </span>
    );
  }

  const d = diasSinVer(ultima);
  /* «Comprobado» era la palabra de un control de calidad: sugiere que se revisó
     que funciona. Lo que de verdad se hace es mirarlo y confirmar que está —y
     eso, en una palabra, es «visto». */
  const visto = d === null
    ? { txt: "nunca visto", color: "var(--red)" }
    : d > DIAS_RONDA
      ? { txt: `visto hace ${d} días`, color: "var(--yellow)" }
      : { txt: d === 0 ? "visto hoy" : `visto hace ${d} día${d === 1 ? "" : "s"}`, color: "var(--green)" };

  const toca = d === null || d > DIAS_RONDA;
  /* Al día, el botón es de servicio y no una alarma: gris, del color de lo que
     está ahí por si acaso. */
  const col = toca ? visto.color : "var(--dim)";

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }} title={error}>⚠</span>}
      {!compacto && <span style={{ color: visto.color, fontSize: 11.5 }}>{visto.txt}</span>}
      {d !== 0 && (
        <button className="btn btn-ghost" disabled={ocupado} onClick={marcar}
          title={`${visto.txt} — márcalo como visto hoy`}
          style={{ padding: "3px 10px", fontSize: 11.5, color: col, borderColor: `${col}55`,
            opacity: toca ? 1 : .7 }}>
          {ocupado ? "..." : "👁 Visto"}
        </button>
      )}
      {d === 0 && <span title="Visto hoy" style={{ fontSize: 13 }}>✅</span>}
    </span>
  );
}
