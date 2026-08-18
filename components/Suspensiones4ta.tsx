"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarSuspension4ta, quitarSuspension4ta } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import CampoAdjunto from "@/components/CampoAdjunto";
import LinkVerificable from "@/components/LinkVerificable";

/* ── SUSPENSIÓN DE 4ta, UNA POR AÑO ──
 *
 * La suspensión de retenciones de 4ta categoría se pide a SUNAT con el
 * Formulario 1609 y CADUCA cada 31 de diciembre. No es un atributo de la
 * persona: es un permiso anual, y la pregunta que hay que poder contestar al
 * rendir no es «¿está suspendida?» sino «¿lo estaba el año de este recibo?».
 *
 * La ficha guardaba una sola constancia y un solo año. Con eso, alguien con la
 * de 2026 y un recibo de 2024 se veía cubierto y no lo estaba: el 8 % de ese
 * recibo lo acaba poniendo la asociación. Medido en PO-003, la diferencia
 * entre creerle a una columna y mirar el historial era S/ 46,000 de falsa
 * alarma en un sentido y S/ 9,970 de hueco real en el otro.
 *
 * Aquí se cargan todas. Los dos campos de arriba —«año vigente» y
 * «constancia»— quedaron derivados de esta lista y salen en gris: los
 * recalcula un disparador con el año más alto.
 */

const hoyAnio = new Date().getFullYear();

export type Susp = {
  id: string; anio: number;
  url?: string | null; operacion?: string | null;
  presentado?: string | null; nota?: string | null;
  creado_en?: string | null;
  creado?: { nombre: string | null } | { nombre: string | null }[] | null;
};

/* PostgREST devuelve la relación como objeto o como arreglo según cómo la
   resuelva. Leer solo una de las dos formas deja la procedencia en blanco sin
   que nada falle — y un hueco se lee como «nadie la subió». */
const autor = (s: Susp) => {
  const p: any = s.creado;
  return (Array.isArray(p) ? p[0] : p)?.nombre || null;
};

const cuandoLargo = (t?: string | null) => {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
};

/* ── LA PROCEDENCIA, Y EL CASO EN QUE NO HAY PERSONA ──
 * `LinkVerificable` la pinta a la izquierda de la banda, junto al veredicto,
 * porque las dos contestan la misma pregunta: ¿de dónde salió esto y me puedo
 * fiar?
 * Sin autor NO se deja en blanco. Un hueco se lee como «no se sabe», y aquí sí
 * se sabe: las veinticinco constancias de PO-003 entraron por carga directa a
 * la base, no por este formulario. Son dos cosas distintas y la segunda explica
 * por qué no hay nombre. */
const procedencia = (s: Susp) => {
  const quien = autor(s);
  const cuando = cuandoLargo(s.creado_en);
  if (!quien && !cuando) return null;
  return quien
    ? `subida por ${quien}${cuando ? ` · ${cuando}` : ""}`
    : `carga directa${cuando ? ` · ${cuando}` : ""}`;
};

const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/* ── LA CLAVE DEL VEREDICTO, UNA POR AÑO ──
 * `link_verificaciones` indexa por (entidad, campo), y `campo` es texto libre
 * —ya hay precedente con `objeto:<id>`—. Con una clave por año, revisar la
 * constancia de 2025 no toca la de 2026: son dos documentos distintos y cada
 * uno se revisa por su cuenta.
 * Antes esto vivía arriba, sobre `suspension_4ta_url`, que es la columna
 * DERIVADA: se revisaba «la constancia» sin decir de qué año, y al llegar la
 * del año siguiente el veredicto se volvía sobre un documento que ya no era el
 * mismo. */
export const CAMPO_VERIF_4TA = (anio: number) => `suspension_4ta:${anio}`;

export default function Suspensiones4ta({ personaId, filas, puedeEditar, error, verifDe }: {
  personaId: string;
  filas: Susp[];
  puedeEditar: boolean;
  error?: string | null;
  /** Los veredictos ya cargados, indexados por `campo` (ver CAMPO_VERIF_4TA). */
  verifDe?: Record<string, any>;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const vacio = { id: null as string | null, anio: String(hoyAnio), url: "", operacion: "", presentado: "" };
  const [f, setF] = useState(vacio);

  const orden = [...filas].sort((a, b) => b.anio - a.anio);
  /* El año en curso es el que importa hoy: si no está, no se retiene el 8 % en
     ningún recibo que se gire ahora mismo. Se dice arriba y no fila por fila
     porque es una ausencia, y una ausencia no tiene fila donde vivir. */
  const faltaEsteAnio = !filas.some(s => s.anio === hoyAnio);

  const guardar = async () => {
    if (ocupado) return;
    avisar(""); setOcupado(true);
    const r: any = await guardarSuspension4ta({ ...f, personaId });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setF(vacio); setAbierto(false); router.refresh();
  };

  const quitar = async (s: Susp) => {
    if (!(await pedir(
      <>Se quitará la constancia de <b>{s.anio}</b>. El PDF sigue en Drive; lo que
        se borra es el registro de que esa persona estuvo suspendida ese año.</>,
      { titulo: "Quitar constancia", aceptar: "Quitar", peligro: true }))) return;
    setOcupado(true); avisar("");
    const r: any = await quitarSuspension4ta(s.id, personaId);
    setOcupado(false);
    if (r?.error) avisar(r.error); else router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  if (error) {
    return (
      <div className="empty" style={{ color: "var(--yellow)", fontSize: 12.5 }}>
        {/does not exist|42P01/.test(error)
          ? "Falta correr db/suspension-4ta-anios.sql en Supabase."
          : `No se pudo leer el historial de suspensiones: ${error}`}
      </div>
    );
  }

  return (
    <>
      {dialogo}{aviso}
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          {filas.length} {filas.length === 1 ? "constancia" : "constancias"}
        </span>
        {faltaEsteAnio && (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}
            title={`Sin constancia de ${hoyAnio}. Cualquier recibo que se gire este año debería llevar el 8 % de retención mientras no se tramite.`}>
            ⚠ falta la de {hoyAnio}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {puedeEditar && !abierto && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => { setF(vacio); setAbierto(true); }}>＋ Añadir año</button>
        )}
      </div>

      {abierto && puedeEditar && (
        <div className="card" style={{ marginBottom: 10, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input value={f.anio} onChange={e => setF({ ...f, anio: e.target.value })}
              placeholder="Año" inputMode="numeric" style={{ ...inp, width: 80 }} />
            {/* El número de operación es lo que permite comprobarla en SUNAT sin
                abrir el PDF, y lo que distingue una constancia de su
                reimpresión. Por eso tiene campo propio y no va en la nota. */}
            <input value={f.operacion} onChange={e => setF({ ...f, operacion: e.target.value })}
              placeholder="N.º de operación" inputMode="numeric" style={{ ...inp, width: 150 }} />
            <input type="date" value={f.presentado}
              onChange={e => setF({ ...f, presentado: e.target.value })}
              title="Fecha de presentación del Formulario 1609"
              style={{ ...inp, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <CampoAdjunto valor={f.url} onCambio={v => setF({ ...f, url: v })}
              placeholder="Constancia: pega el PDF, arrástralo o escribe el enlace de Drive" />
            <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "6px 14px" }}
              onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={() => { setAbierto(false); setF(vacio); }}>Cancelar</button>
          </div>
        </div>
      )}

      {orden.length === 0 ? (
        <div className="empty" style={{ fontSize: 12.5 }}>
          Sin constancias. Mientras no haya una del año en curso, a esta persona
          hay que retenerle el 8 % en cada recibo.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {orden.map(s => (
            /* ── DOS RENGLONES EXPLÍCITOS, NO UNO QUE SE PARTE SOLO ──
               Antes esto era una sola fila con `flex-wrap`, y la banda de
               revisión llevaba `width:100%` para bajar a su línea. Funcionaba
               hasta que la cabecera se llenaba —una nota larga bastaba— y
               entonces la ✕ era lo primero en caerse a un renglón suelto, a la
               izquierda del todo y lejos de su fila. Un botón de borrar
               flotando sin contexto es de las pocas cosas que conviene que
               NUNCA se muevan de sitio.
               Ahora la fila es una columna de dos partes fijas: la cabecera no
               envuelve —lo que sobra lo cede la nota, encogiéndose— y la banda
               va debajo por estructura, no por un truco de ancho. */
            <div key={s.id} className="s4-fila">
              <div className="s4-cab">
                <b style={{ color: s.anio === hoyAnio ? "var(--green)" : "var(--text)" }}>
                  {s.anio}
                </b>
                {s.operacion && (
                  <span className="s4-op" title="Número de operación del Formulario 1609">
                    op. {s.operacion}
                  </span>
                )}
                {s.presentado && <span className="s4-dim">{dmy(s.presentado)}</span>}
                {/* La nota es lo único elástico de la cabecera: es lo que puede
                    faltar sin que se pierda nada, y el texto entero está en el
                    título. */}
                {s.nota && <span className="s4-nota" title={s.nota}>{s.nota}</span>}
                <span style={{ flex: 1, minWidth: 0 }} />
                {!s.url && (
                  <span className="s4-falta"
                    title="Declarado el año, pero sin la constancia adjunta. Ante una observación, el año solo no prueba nada.">
                    sin constancia
                  </span>
                )}
                {puedeEditar && (
                  <button onClick={() => quitar(s)} disabled={ocupado} title={`Quitar la constancia de ${s.anio}`}
                    className="s4-quitar">✕</button>
                )}
              </div>

              {/* ── ABRIR Y REVISAR, EN LA FILA DEL AÑO QUE LE TOCA ──
                  Esto estaba arriba, colgado de la columna derivada: enseñaba
                  el PDF del año más reciente y el veredicto no decía de qué año
                  era. Con dos constancias, revisabas «la constancia» y al año
                  siguiente ese ✓ quedaba sobre un documento distinto sin que
                  nada avisara.
                  `franja` y no la tarjeta con miniatura: aquí la fila ya es
                  corta y una miniatura por año convertiría una lista en una
                  galería. */}
              {s.url && (
                <LinkVerificable tipo="persona" id={personaId}
                  campo={CAMPO_VERIF_4TA(s.anio)} url={s.url}
                  etiqueta={`Constancia 4ta ${s.anio}`} icono="🧾" franja
                  origen={procedencia(s)}
                  verif={verifDe?.[CAMPO_VERIF_4TA(s.anio)]} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
