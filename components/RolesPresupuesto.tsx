"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { etiquetarPartidas } from "@/app/actions";
import { useAviso } from "@/components/useConfirmar";
import {
  agruparPorRol, unionesSugeridas, filasPorPersona, totalItem, etapaDe,
  type ItemRol, type GrupoRol,
} from "@/lib/rolesPresupuesto";
import { ROLES_EQUIPO } from "@/lib/rolesEquipo";

/* ══════════════════════════════════════════════════════════════════════════
   CUÁNTO LE TOCA A CADA UNO — y cuánto le falta cobrar

   El presupuesto está ordenado como lo pide DAFO: por etapa y por rubro. Para
   girar un recibo hace falta lo contrario —cuánto suma UNA persona en todo el
   proyecto—, y eso hoy se saca sumando líneas a mano de tres bloques
   distintos. Es lo que tiene parado el giro de los RHE de PO-001.

   Aquí: cada rol con su total presupuestado, lo que ya se le giró y la
   diferencia. Con el desglose por etapa, porque la alarma no dice «giren los
   RHE», dice «giren los de PRE-PRODUCCIÓN».

   ── LO QUE ESTA PANTALLA NO HACE ──
   No gira nada ni escribe un recibo: eso sigue en su sitio, con su número y su
   PDF. Esto solo contesta la pregunta previa, que es la que costaba media hora
   y un error de suma.
   ══════════════════════════════════════════════════════════════════════════ */

const S = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
/* La etapa sin su número («2 PRE PRODUCCIÓN» → «PRE PRODUCCIÓN»): el número
   ordena en el formulario y aquí solo estorba. */
const etapaCorta = (e: string) => e.replace(/^\d+\s*/, "");

export default function RolesPresupuesto({
  postulacionId, items, personas, rhe, esAdmin,
}: {
  postulacionId: string;
  items: ItemRol[];
  personas: { id: string; nombre: string; alias?: string | null }[];
  /** Los recibos ya girados en ESTE fondo. Solo se usa persona y monto: un
   *  recibo no dice a qué rol pertenece. */
  rhe: { persona_id: string | null; monto: number | null }[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const nombreDe = useMemo(
    () => new Map(personas.map(p => [p.id, p.alias || p.nombre])),
    [personas]);

  /* Lo girado por persona. Se suma UNA vez, aquí, y de ahí sale tanto la
     columna «girado» como el «falta»: dos recorridos distintos del mismo dato
     acaban dando dos cifras. */
  const giradoPorPersona = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rhe || []) {
      if (!r.persona_id) continue;
      m.set(r.persona_id, (m.get(r.persona_id) || 0) + (Number(r.monto) || 0));
    }
    return m;
  }, [rhe]);

  const grupos = useMemo(() => agruparPorRol(items || []), [items]);
  const sugerencias = useMemo(() => unionesSugeridas(grupos), [grupos]);
  const filas = useMemo(
    () => filasPorPersona(grupos, id => giradoPorPersona.get(id) || 0),
    [grupos, giradoPorPersona]);

  const totalPre = filas.reduce((s, f) => s + f.presupuestado, 0);
  /* Lo girado a quien NO tiene partida: la diferencia entre todos los recibos
     del fondo y los que sí caen en una fila. */
  const sinPartida = useMemo(() => {
    const asignadas = new Set(filas.map(f => f.personaId).filter(Boolean) as string[]);
    let n = 0;
    for (const [id, monto] of giradoPorPersona.entries()) if (!asignadas.has(id)) n += monto;
    return n;
  }, [filas, giradoPorPersona]);

  const correr = async (fn: () => Promise<any>) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r: any = await fn();
      if (r?.error) { avisar(r.error); return; }
      router.refresh();
    } catch { avisar("No se pudo guardar."); }
    finally { setOcupado(false); }
  };

  /* `rol === undefined` = no se toca la etiqueta. El desplegable de persona
     pasaba el título del PRIMER grupo, y en una fila que junta dos roles de la
     misma persona eso los fundía de verdad en el jsonb —y se llevaba por
     delante la etiqueta que el segundo tuviera puesta a mano—. Reelegir a la
     misma persona bastaba para disparar la fusión. */
  const etiquetar = (gs: GrupoRol[], rol: string | null | undefined, personaId?: string | null) =>
    correr(() => etiquetarPartidas(
      postulacionId, gs.flatMap(g => g.items.map(i => i.id)), rol, personaId));

  if (!items?.length) {
    return <p className="rp-vacio">Este fondo todavía no tiene partidas de presupuesto.</p>;
  }

  return (
    <div className="rp">
      {aviso}
      <div className="rp-cab">
        <b>💼 Cuánto le toca a cada uno</b>
        <span className="rp-dim">
          {filas.length} rol(es) · {S(totalPre)} presupuestado
        </span>
      </div>

      {/* ── LAS UNIONES SE PROPONEN, NO SE HACEN ──
          Sumar dos líneas que no son de la misma persona es un recibo mal
          girado, y un recibo mal girado es plata que hay que devolver. Así que
          la máquina acota y decide quien sabe. */}
      {esAdmin && sugerencias.length > 0 && (
        <div className="rp-sug">
          {sugerencias.map(([a, b], i) => (
            <div key={i} className="rp-sug-fila">
              <span>
                ¿<b>{a.titulo}</b> ({S(a.total)}) y <b>{b.titulo}</b> ({S(b.total)}) son el mismo?
              </span>
              <button className="btn btn-ghost rp-btn" disabled={ocupado}
                title={`Las ${a.items.length + b.items.length} líneas pasan a llamarse «${a.titulo}»`}
                onClick={() => etiquetar([a, b], a.titulo)}>
                sí, unir como «{a.titulo}»
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rp-tabla">
        <div className="rp-fila rp-head">
          <span>Rol</span>
          <span>Persona</span>
          <span className="rp-num">Presupuestado</span>
          <span className="rp-num">Girado</span>
          <span className="rp-num">Falta</span>
        </div>

        {filas.map(f => {
          const clave = f.grupos.map(g => g.clave).join("|");
          const mezclado = f.grupos.some(g => g.personas.length > 1);
          return (
            <div key={clave}>
              <div className="rp-fila">
                <button type="button" className="rp-tit" aria-expanded={abierto === clave}
                  onClick={() => setAbierto(abierto === clave ? null : clave)}
                  title="Ver las partidas que suman este total">
                  <span className="rp-flecha">{abierto === clave ? "▾" : "▸"}</span>
                  {f.titulo}
                  <span className="rp-lineas">{f.grupos.reduce((s, g) => s + g.items.length, 0)} líneas</span>
                  {/* Las etapas, que es lo que pregunta la alarma. */}
                  {f.grupos.flatMap(g => g.porEtapa).map((e, i) => (
                    <span key={i} className="rp-etapa">{etapaCorta(e.etapa)} {S(e.total)}</span>
                  ))}
                </button>

                {/* Sin persona no hay recibos que buscar: el desplegable ES la
                    acción que hace útil la fila. */}
                <span>
                  {esAdmin ? (
                    <select className="rp-sel" disabled={ocupado}
                      value={f.personaId || ""}
                      aria-label={`¿Quién cobra «${f.titulo}»?`}
                      onChange={e => etiquetar(f.grupos, undefined, e.target.value || null)}>
                      <option value="">— ¿quién lo cobra? —</option>
                      {personas.map(p => (
                        <option key={p.id} value={p.id}>{p.alias || p.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="rp-dim">{f.personaId ? nombreDe.get(f.personaId) : "—"}</span>
                  )}
                </span>

                <span className="rp-num">
                  {S(f.presupuestado)}
                  {/* Un recibo pagado con contrapartida no se rinde a DAFO: no
                      cambia lo que la persona cobra, pero sí de qué bolsillo
                      sale, y eso decide si el PDF va al expediente. */}
                  {f.otras > 0 && (
                    <span className="rp-otras" title="De ese total, lo que pone otra fuente (contrapartida)">
                      {S(f.otras)} de otra fuente
                    </span>
                  )}
                </span>
                {/* «—» y no «S/ 0» mientras no se sepa quién cobra: un cero
                    aquí se leería como «no ha cobrado nada», que es una
                    afirmación, y el sistema no la puede hacer. */}
                <span className="rp-num">{f.girado === null ? <i className="rp-dim">—</i> : S(f.girado)}</span>
                <span className={`rp-num${f.falta !== null && f.falta > 0 ? " rp-falta" : ""}`}>
                  {f.falta === null ? <i className="rp-dim">—</i>
                    : f.falta > 0 ? S(f.falta)
                      : f.falta < 0 ? <span className="rp-exceso" title="Se giró más de lo presupuestado para este rol">+{S(-f.falta)}</span>
                        : "✓"}
                  {/* Con contrapartida, «falta» no es lo que se puede girar
                      contra el estímulo: una parte la pone otro bolsillo, y
                      girarla del fondo se pasa del rubro al rendir. */}
                  {f.falta !== null && f.otras > 0 && (
                    <span className="rp-otras" title="Descontando lo que pone la otra fuente">
                      {S(Math.max(0, f.presupuestado - f.otras - (f.girado || 0)))} del estímulo
                    </span>
                  )}
                </span>
              </div>

              {mezclado && (
                <div className="rp-nota">
                  ⚠ Estas líneas tienen asignadas personas distintas: son dos roles metidos en uno.
                  Sepáralos etiquetando cada partida abajo.
                </div>
              )}
              {f.grupos.length > 1 && (
                <div className="rp-nota">
                  Dos roles de la misma persona, sumados: un recibo no dice a qué rol pertenece,
                  así que lo girado es el total suyo en este fondo.
                </div>
              )}

              {abierto === clave && (
                <div className="rp-detalle">
                  {f.grupos.flatMap(g => g.items).map((it, i) => (
                    /* `it.id` puede faltar en un presupuesto viejo cargado por
                       SQL: sin el índice, dos líneas sin id comparten clave. */
                    <div key={it.id || `s-${i}`} className="rp-linea">
                      <span className="rp-id">{it.id}</span>
                      <span className="rp-concepto">{it.concepto}</span>
                      <span className="rp-etapa">{etapaCorta(etapaDe(it))}</span>
                      <span className="rp-dim">{it.cantidad} {it.unidad} × {S(it.costo_unit)}</span>
                      <span className="rp-num">{S(totalItem(it))}</span>
                    </div>
                  ))}
                  {/* Un formulario POR GRUPO, no uno por fila: cuando la fila
                      junta dos roles de la misma persona, escribir «Directora ·
                      Editora» en las líneas de ambos los fundiría en uno. */}
                  {esAdmin && f.grupos.map(g => (
                    <form key={g.clave} className="rp-etq" onSubmit={e => {
                      e.preventDefault();
                      const v = new FormData(e.currentTarget).get("rol");
                      etiquetar([g], String(v || "").trim());
                    }}>
                      <label className="rp-dim" htmlFor={`rol-${g.clave}`}>Llamar a este rol</label>
                      <input id={`rol-${g.clave}`} name="rol" list="roles-presu" defaultValue={g.titulo}
                        className="rp-input" placeholder="Directora, Sonidista…" />
                      <button className="btn btn-ghost rp-btn" disabled={ocupado} type="submit">Guardar</button>
                      <span className="rp-dim">
                        Se escribe en sus {g.items.length} línea(s): vacío vuelve a agrupar por el concepto.
                      </span>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <datalist id="roles-presu">
        {ROLES_EQUIPO.map(r => <option key={r} value={r} />)}
      </datalist>

      {/* ── LO QUE SE GIRÓ Y NO CUADRA CON NINGUNA PARTIDA ──
          La tabla solo suma los recibos de las personas asignadas a un rol. Si
          alguien cobró sin tener partida, su plata no aparece en ninguna fila
          y la columna «girado» suma menos que la rendición — sin decir por qué.
          Se dice. */}
      {sinPartida > 0 && (
        <p className="rp-sobra">
          ⚠ {S(sinPartida)} girados a personas que no están asignadas a ninguna partida.
          No entran en ninguna fila de arriba: asigna su rol para que cuadren.
        </p>
      )}

      <p className="rp-pie">
        El presupuesto no distingue personas: el rol sale del texto de cada partida y se puede
        corregir. Lo <b>girado</b> es la suma de los RHE de esa persona en este fondo —incluye
        cualquier rol suyo—, y no descuenta retenciones: es el bruto, igual que el presupuesto.
      </p>
    </div>
  );
}
