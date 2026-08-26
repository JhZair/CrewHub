"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { etiquetarPartidas } from "@/app/actions";
import { useAviso } from "@/components/useConfirmar";
import {
  agruparPorRol, unionesSugeridas, filasPorPersona, totalItem, etapaDe, normalizarRol,
  type ItemRol, type GrupoRol, type FilaRol,
} from "@/lib/rolesPresupuesto";
import { ROLES_EQUIPO } from "@/lib/rolesEquipo";
import { colorEtapaPresu, ordenEtapaPresu } from "@/lib/rubros";
import { fechaCorta } from "@/lib/fechas";

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

/* ── EL CHIP DE UNA ETAPA, CON SU COLOR ──
   Tres chips grises seguidos hay que LEERLOS para saber cuál es cuál; con el
   color de su etapa se reconocen de un vistazo, y es el MISMO ámbar del rodaje
   que ya usan el cronograma y la agenda (ver lib/rubros → colorEtapaPresu).

   Tenue a propósito: la fila tiene tres cifras que sí hay que leer, y un chip
   de 10px a todo color se las come. Si la etapa no se reconoce —«Otros», un
   rubro que no está en ningún árbol DAFO— se queda apagado: pintarlo del gris
   de preproducción diría que es preproducción. */
/** Cuánto suma una fila EN una etapa. Con `null` (todas), su total. */
const montoEnEtapa = (f: FilaRol, etapa: string | null): number =>
  etapa === null ? f.presupuestado
    : f.grupos.reduce((s, g) =>
      s + g.porEtapa.reduce((t, e) => t + (e.etapa === etapa ? e.total : 0), 0), 0);

function ChipEtapa({ etapa, children }: { etapa: string; children: React.ReactNode }) {
  const c = colorEtapaPresu(etapa);
  return (
    <span className={`rp-etapa${c ? " rp-etapa-c" : ""}`}
      style={c ? ({ ["--rp-et" as any]: c }) : undefined}>{children}</span>
  );
}

export default function RolesPresupuesto({
  postulacionId, items, personas, rhe, esAdmin, referencia,
}: {
  postulacionId: string;
  items: ItemRol[];
  personas: { id: string; nombre: string; alias?: string | null }[];
  /** Los recibos ya girados en ESTE fondo. Solo se usa persona y monto: un
   *  recibo no dice a qué rol pertenece. */
  rhe: { persona_id: string | null; monto: number | null }[];
  esAdmin: boolean;
  /** De qué presupuesto salen estas cifras. Se dice en pantalla: quien gira un
   *  recibo tiene que saber si está mirando lo aprobado o un borrador. */
  referencia?: {
    /** `true` = hay versión vigente CON ítems y es la que se lee. */
    vigente: boolean;
    etiqueta?: string | null;
    fecha?: string | null;
    /** En qué se diferencia hoy el presupuesto vivo de esta foto. Sale de
     *  `comparaConVivo`: partida a partida, no por el total. */
    cambios?: { nuevas: number; nuevasTotal: number; cambiadas: number; quitadas: number; hay: boolean };
  };
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* Setenta y siete roles no se leen: se busca en ellos. */
  const [q, setQ] = useState("");
  /* La etapa elegida, o `null` para todas. La alarma no dice «giren los RHE»,
     dice «giren los de PRE-PRODUCCIÓN». */
  const [etapa, setEtapa] = useState<string | null>(null);

  const nombreDe = useMemo(
    () => new Map(personas.map(p => [p.id, p.alias || p.nombre])),
    [personas]);

  /* ── ORDENADAS POR LO QUE SE VE ──
     La lista llega ordenada por el NOMBRE COMPLETO («MARÍA ÁGUEDA VARGAS…»)
     pero en el desplegable se lee el ALIAS («AguedaVargas»), así que Águeda
     aparecía entre María y Marina: un desplegable de cien personas ordenado por
     un texto que no está en pantalla es un desplegable en el que se busca a
     ojo. Y con `localeCompare` en español, para que las tildes y la Ñ caigan
     donde uno las busca. */
  const personasOrd = useMemo(
    () => [...personas].sort((a, b) =>
      (a.alias || a.nombre).localeCompare(b.alias || b.nombre, "es", { sensitivity: "base" })),
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

  /* ── LAS ETAPAS QUE HAY, CON SU PLATA ──
     Salen del propio presupuesto y no de un catálogo: si este fondo no tiene
     postproducción, esa pestaña no debe existir. En el orden del formulario
     DAFO, que es el que llevan delante («2 PRE PRODUCCIÓN»). */
  const etapas = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grupos)
      for (const e of g.porEtapa) m.set(e.etapa, (m.get(e.etapa) || 0) + e.total);
    return [...m.entries()].map(([nombre, total]) => ({ nombre, total }))
      /* Una etapa que suma cero no da trabajo a nadie: su botón dejaría la
         lista vacía (el filtro pide plata > 0) sin explicar por qué. Pasa de
         verdad: una línea a medio llenar, con cantidad 0, ya crea la etapa. */
      .filter(e => e.total > 0)
      /* En el orden del formulario DAFO —1 generales, 2 pre, 3 producción,
         4 post—, no en el alfabético, que pone la post antes del rodaje. */
      .sort((a, b) => ordenEtapaPresu(a.nombre) - ordenEtapaPresu(b.nombre)
        || a.nombre.localeCompare(b.nombre, "es"));
  }, [grupos]);

  /* ── EL BUSCADOR ──
     Por el rol, por la persona y por el CONCEPTO de sus líneas: quien busca
     «cámara» puede estar buscando el operador o el alquiler, y quien busca
     «Katy» no sabe cómo se llama su rol. Se compara sin tildes ni mayúsculas
     con la misma función que agrupa —dos formas de normalizar acabarían
     encontrando cosas distintas—. */
  const filtradas = useMemo(() => {
    const t = normalizarRol(q);
    const porEtapa = etapa === null ? filas
      /* Una fila entra si tiene plata EN esa etapa. Con `> 0` y no «aparece en
         porEtapa»: una partida de importe cero no da trabajo a nadie en esa
         etapa, y llenaría la lista de filas que no se pueden girar. */
      : filas.filter(f => f.grupos.some(g =>
        g.porEtapa.some(e => e.etapa === etapa && e.total > 0)));
    const texto = !t ? porEtapa : porEtapa.filter(f =>
      normalizarRol(f.titulo).includes(t)
      || (f.personaId && normalizarRol(nombreDe.get(f.personaId) || "").includes(t))
      || f.grupos.some(g => g.items.some(i => normalizarRol(i.concepto).includes(t)))
      || f.grupos.some(g => g.porEtapa.some(e => normalizarRol(e.etapa).includes(t))));
    /* Con una etapa elegida, mandan las de MÁS plata EN ESA ETAPA: el orden por
       total del proyecto pondría arriba a quien casi no trabaja en ella. */
    return etapa === null ? texto
      : [...texto].sort((a, b) => montoEnEtapa(b, etapa) - montoEnEtapa(a, etapa));
  }, [filas, q, etapa, nombreDe]);

  /* El total es SIEMPRE el del presupuesto entero, con filtro o sin él: un
     total que cambia al escribir en un buscador es un total que nadie puede
     usar para cuadrar. Lo que filtra el buscador es qué filas se ven. */
  const totalPre = filas.reduce((s, f) => s + f.presupuestado, 0);
  /* Lo de la etapa elegida sale de la MISMA cuenta que pinta su chip: dos
     sumas del mismo dinero acaban dando dos cifras. */
  const totalEtapa = etapas.find(e => e.nombre === etapa)?.total ?? 0;
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
      /* Guardó, pero no del todo: hay partidas que ya no están en el vivo. Se
         refresca igual —lo que se pudo escribir está escrito— y se dice. */
      if (r?.aviso) avisar(r.aviso);
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
          {q || etapa ? `${filtradas.length} de ${filas.length} rol(es)` : `${filas.length} rol(es)`}
          {" · "}{S(totalPre)} presupuestado
          {/* Con una etapa elegida se dicen las DOS cifras: la de la etapa es
              la que se va a girar, la del proyecto es contra la que se cuadra.
              Enseñar solo una de las dos obliga a quitar el filtro para saber
              dónde está parado. */}
          {etapa !== null && ` · ${S(totalEtapa)} en ${etapaCorta(etapa).toLowerCase()}`}
        </span>
        <span style={{ flex: 1 }} />
        <span className="rp-buscar">
          <input value={q} onChange={e => setQ(e.target.value)}
            className="rp-input" type="search"
            aria-label="Buscar un rol, una persona o una partida"
            placeholder="Buscar rol, persona o partida…" />
          {q && (
            <button type="button" className="rp-x" title="Limpiar" onClick={() => setQ("")}>✕</button>
          )}
        </span>
      </div>

      {/* ── DE QUÉ PRESUPUESTO SALEN ESTAS CIFRAS ──
          Contra la versión vigente se rinde y se gira: es la que se envía a
          DAFO. Quien está por girar un recibo tiene que poder ver, sin salir de
          aquí, si está mirando lo aprobado o un borrador. */}
      {referencia && (
        <p className="rp-pie rp-ref">
          {referencia.vigente
            ? <>Cifras de la <b>versión vigente</b>
              {referencia.etiqueta ? ` «${referencia.etiqueta}»` : ""}
              {referencia.fecha ? `, del ${fechaCorta(referencia.fecha)}` : ""}
              {" "}— la que se envió a DAFO. Los roles y el «lo cobra» se guardan en el presupuesto vivo.</>
            : <>Todavía no hay versión vigente: estas cifras salen del <b>presupuesto vivo</b>,
              que se sigue editando. Congela una versión antes de girar contra ella.</>}
        </p>
      )}
      {/* ── EL BORRADOR YA NO ES LO APROBADO ──
          No es un error —es el estado normal mientras se prepara una
          modificación—, pero girar sin saberlo sí lo sería. Y se avisa aunque
          el TOTAL no cambie: una modificación DAFO mueve plata entre rubros con
          el estímulo fijo, así que comparar sumas diría «todo igual» justo aquí.
          Las partidas NUEVAS se nombran aparte porque tienen consecuencia: no
          salen en ninguna fila de abajo —esta foto no las tiene— y si alguien ya
          cobró por ellas, su plata aparece como «girado de más» o como «sin
          partida», que son dos acusaciones falsas. */}
      {referencia?.vigente && referencia.cambios?.hay && (
        <p className="rp-sobra">
          ⚠ El presupuesto vivo ya no es igual a la versión vigente:
          {" "}{[
            referencia.cambios.nuevas ? `${referencia.cambios.nuevas} partida(s) nueva(s) por ${S(referencia.cambios.nuevasTotal)}` : "",
            referencia.cambios.cambiadas ? `${referencia.cambios.cambiadas} con otro importe` : "",
            referencia.cambios.quitadas ? `${referencia.cambios.quitadas} borrada(s)` : "",
          ].filter(Boolean).join(" · ")}.
          {" "}Aquí se ve <b>lo aprobado</b>; hay una modificación sin congelar.
          {referencia.cambios.nuevas > 0 && " Lo nuevo no entra en ninguna fila: si alguien ya cobró por eso, saldrá como girado de más o sin partida."}
        </p>
      )}

      {/* ── POR ETAPA ──
          La alarma no dice «giren los RHE», dice «giren los de PRE-PRODUCCIÓN».
          Las etapas salen del propio presupuesto, con su color de siempre. */}
      {etapas.length > 1 && (
        <div className="rp-etapas" role="group" aria-label="Filtrar por etapa">
          {/* `aria-pressed`: encendido y apagado se distinguen por el color, y
              el color no lo anuncia un lector de pantalla. */}
          <button type="button" className={`rp-et-b${etapa === null ? " on" : ""}`}
            aria-pressed={etapa === null} onClick={() => setEtapa(null)}>
            todas <span className="rp-et-n">{S(totalPre)}</span>
          </button>
          {etapas.map(e => (
            <button key={e.nombre} type="button"
              className={`rp-et-b${etapa === e.nombre ? " on" : ""}`}
              aria-pressed={etapa === e.nombre}
              style={{ ["--rp-et" as any]: colorEtapaPresu(e.nombre) || "var(--dim)" }}
              onClick={() => setEtapa(etapa === e.nombre ? null : e.nombre)}
              title={`Ver solo los roles con partidas en ${etapaCorta(e.nombre).toLowerCase()}`}>
              {etapaCorta(e.nombre).toLowerCase()} <span className="rp-et-n">{S(e.total)}</span>
            </button>
          ))}
        </div>
      )}
      {/* ── LO QUE EL FILTRO NO PUEDE HACER ──
          Un RHE guarda persona y monto; no dice a qué etapa pertenece. Así que
          «girado» y «falta» siguen siendo del fondo entero aunque se mire una
          sola etapa. Decirlo es la diferencia entre una lista útil y una resta
          inventada. */}
      {etapa !== null && (
        <p className="rp-pie">
          Presupuestado, girado y falta son del <b>fondo entero</b>: un recibo no dice a qué
          etapa pertenece. La etapa filtra qué roles se ven —y su chip de color dice cuánto
          suma cada uno en ella—.
        </p>
      )}

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
              {/* ── DECIR QUE NO TAMBIÉN ES UNA DECISIÓN ──
                  «Operador de cámara 01» y «02» son dos personas, y la
                  sugerencia volvía a salir en cada visita: una lista que
                  pregunta lo mismo cada día se cierra sin leer, y ahí dentro se
                  pierde la que sí importaba. Descartar deja a cada grupo con SU
                  nombre escrito —y un grupo con nombre puesto a mano ya no se
                  propone—, así que la respuesta se guarda igual que el sí. */}
              <button className="btn btn-ghost rp-btn" disabled={ocupado}
                title="Cada uno se queda como está, con su propio nombre, y deja de proponerse"
                onClick={() => correr(async () => {
                  const r1: any = await etiquetarPartidas(
                    postulacionId, a.items.map(i => i.id), a.titulo);
                  if (r1?.error) return r1;
                  return etiquetarPartidas(postulacionId, b.items.map(i => i.id), b.titulo);
                })}>
                no, son distintos
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

        {filtradas.map(f => {
          const clave = f.grupos.map(g => g.clave).join("|");
          const mezclado = f.grupos.some(g => g.personas.length > 1);
          return (
            <div key={clave}>
              <div className="rp-fila">
                {/* ── DOS RENGLONES, NO UNA RETAHÍLA ──
                    Estaba todo en línea —flecha, nombre, «3 líneas» y los chips
                    de etapa— y con un concepto largo («Composición de música
                    original (composición y producción…)») la celda envolvía en
                    tres renglones, empujaba la flecha arriba sola y descuadraba
                    la fila entera. Arriba el NOMBRE, en una sola línea; debajo
                    lo que lo acompaña. */}
                <button type="button" className="rp-tit" aria-expanded={abierto === clave}
                  onClick={() => setAbierto(abierto === clave ? null : clave)}
                  title={`${f.titulo} — ver las partidas que suman este total`}>
                  <span className="rp-flecha">{abierto === clave ? "▾" : "▸"}</span>
                  <span className="rp-tit-txt">
                    <span className="rp-tit-nom">{f.titulo}</span>
                    <span className="rp-tit-meta">
                      <span className="rp-lineas">{f.grupos.reduce((s, g) => s + g.items.length, 0)} líneas</span>
                      {/* Las etapas, que es lo que pregunta la alarma. */}
                      {f.grupos.flatMap(g => g.porEtapa).map((e, i) => (
                        <ChipEtapa key={i} etapa={e.etapa}>{etapaCorta(e.etapa)} {S(e.total)}</ChipEtapa>
                      ))}
                    </span>
                  </span>
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
                      {personasOrd.map(p => (
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
                      <ChipEtapa etapa={etapaDe(it)}>{etapaCorta(etapaDe(it))}</ChipEtapa>
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
                      {/* ── Y LA PERSONA, TAMBIÉN POR GRUPO ──
                          El desplegable de arriba es de la FILA, y una fila
                          puede juntar tres roles de la misma persona: cambiar
                          ahí los cambiaba los tres a la vez. Para quitarle UNO
                          a alguien —«esta composición no la hace Frank»— no
                          había manera; había que desasignarlo de todo y volver
                          a asignar lo demás. */}
                      <label className="rp-dim" htmlFor={`per-${g.clave}`}>lo cobra</label>
                      <select id={`per-${g.clave}`} className="rp-sel rp-sel-min" disabled={ocupado}
                        value={g.personas.length === 1 ? g.personas[0] : ""}
                        onChange={e => etiquetar([g], undefined, e.target.value || null)}>
                        <option value="">— nadie por ahora —</option>
                        {personasOrd.map(p => (
                          <option key={p.id} value={p.id}>{p.alias || p.nombre}</option>
                        ))}
                      </select>
                      <span className="rp-dim">
                        Afecta a sus {g.items.length} línea(s).
                      </span>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Vacío por el buscador, por la etapa o por los dos: el mensaje dice
            cuál de los tres, porque quitar el filtro equivocado deja la
            pantalla igual de vacía y parece que está rota. */}
        {!filtradas.length && (q || etapa) && (
          <div className="rp-vacio" style={{ padding: "10px 4px" }}>
            {q && etapa ? <>Ningún rol de {etapaCorta(etapa).toLowerCase()} dice «{q}».</>
              : q ? <>Ningún rol, persona ni partida dice «{q}».</>
                : <>Ningún rol tiene partidas en {etapaCorta(etapa || "").toLowerCase()}.</>}
          </div>
        )}
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
