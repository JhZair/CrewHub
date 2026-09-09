"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { ensamblar, desensamblar } from "@/app/actions";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";
import { soles } from "@/lib/compras";
/* ⚠ De `lib/ensamblados` y NO de `lib/equipamientoDatos`. Estas dos son
   VALORES, no tipos, y este archivo es de cliente: colgando del módulo que
   habla con la base, el build de Next lo rechaza —arrastra `next/headers`— y
   `tsc` no lo ve, así que pasa limpio y revienta al compilar. */
import { valorDeNodo, piezasDeNodo, type NodoEns, type SueltaEns } from "@/lib/ensamblados";

/* ══════════════════════════════════════════════════════════════════════════
   🔧 ENSAMBLADOS — DE QUÉ ESTÁ HECHA CADA COSA

   El tercer eje del inventario tenía su relación en la base y su panel en la
   ficha de cada equipo, pero no tenía pantalla: «¿qué ensamblados hay
   armados?» solo se contestaba abriendo el inventario y entrando uno por uno.
   Con ciento doce piezas montadas eso no lo hace nadie.

   ── UNA TARJETA POR ANFITRIÓN, NO UNA FILA POR PIEZA ──
   Las 112 piezas ya se pueden listar: es el filtro «Ensamblados» del
   inventario. Lo que no existía es la otra pregunta, que es la que se hace en
   voz alta: «el monopod de paneo son siete piezas». Por eso lo que se pinta es
   el CONJUNTO, y las piezas dentro de él.

   Y ANIDADO, porque la realidad lo está: un rig entra dentro de un monopod y
   lleva sus propios tornillos. Una lista plana de dos niveles habría mentido
   sobre lo que hay que desarmar para sacar una pieza.

   ── EL VALOR SE SUMA, NO SE GUARDA ──
   «7 piezas · S/ 340» se calcula bajando por todo el árbol. El ensamblado no
   se compró, se armó: cada pieza sigue contando su precio en el patrimonio y
   aquí solo se enseña el total del conjunto, así que el inventario no cuenta
   nada dos veces.

   ⚠ Y NO da lo mismo que la ficha del equipo. `Ensamblado` suma solo los hijos
   DIRECTOS —`piezasMontadas` no baja de nivel—, así que del mismo rig la ficha
   puede decir «3 piezas · S/ 120» y esta pantalla «7 piezas · S/ 340». Las dos
   son ciertas y contestan preguntas distintas: allí «qué le atornillé a esto»,
   aquí «qué hay que desarmar para dejarlo suelto». Se dice porque dos números
   distintos del mismo equipo, sin nadie que lo explique, se leen como un fallo.

   Y hay un TERCER número que tampoco cuadra a propósito: el filtro
   «Ensamblados · 112» del inventario cuenta equipos en estado «ensamblado»;
   el «N pieza(s) dentro» de aquí cuenta descendientes con puntero. Se separan
   justo en lo que no encaja —una pieza en reparación montada suma aquí y no
   allí; una huérfana suma allí y no aquí— y eso es lo que el bloque de avisos
   de arriba enseña con nombre y apellido.

   ── MONTAR Y DESMONTAR AQUÍ, Y POR LOTE ──
   Armar algo son siete piezas seguidas. Hacerlo desde la ficha obliga a entrar
   al anfitrión, buscar cada pieza y repetir; aquí se marcan las siete y se
   montan de una. Las acciones son las MISMAS que usa la ficha —`ensamblar` y
   `desensamblar`, que ya reciben una lista—, así que las reglas (no montar
   algo prestado, no meter un equipo dentro de sí mismo, no pisar «en
   reparación» al soltar) están escritas una sola vez y valen en los dos sitios.
   Lo que SÍ es de aquí es qué se ofrece: la lista blanca de `arbolEnsamblados`,
   porque una acción que rechaza con un error es peor experiencia que una lista
   que no ofrece lo imposible.
   ══════════════════════════════════════════════════════════════════════════ */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Los mismos tres estados que `arbolEnsamblados` deja montar, y por el mismo
   motivo: lo que está en la calle, de baja o perdido no se atornilla. Aquí hace
   falta porque un anfitrión puede llegar por `raices`, que no pasa por aquel
   filtro. Una lista blanca, nunca una de exclusiones. */
const MONTABLES = new Set(["disponible", "no_aparece", "en_reparacion"]);

/** Todo lo que cuelga de un nodo, aplanado. Lo usan el buscador —que tiene que
 *  mirar dentro de las piezas, no solo el título de la tarjeta— y el marcado
 *  de «todas las de esta tarjeta». */
function aplanar(n: NodoEns): NodoEns[] {
  return n.piezas.flatMap(p => [p, ...aplanar(p)]);
}

type Cand = {
  id: string; folio: string | null; nombre: string;
  categoria: string | null; subcategoria: string | null;
  estado: string | null; cartel: string | null; valor: number | null;
};

/* ── LA MINIATURA, IGUAL EN TODAS PARTES ── */
function Mini({ url }: { url: string | null }) {
  return (
    <span className="kit-pz-img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : <span>🎥</span>}
    </span>
  );
}

/* ── UNA PIEZA DENTRO DEL ÁRBOL ──
   `nivel` solo empuja el sangrado. No se usa una lista anidada de verdad
   (`<ul>` dentro de `<ul>`) porque cada renglón lleva su casilla y su enlace, y
   lo que hace falta es que las casillas queden ALINEADAS entre niveles para
   poder marcarlas de un pasada; con listas anidadas cada nivel movería su
   casilla, que es justo lo que hay que evitar cuando se marcan siete. */
function Pieza({ n, nivel, sel, alterna }: {
  n: NodoEns; nivel: number;
  sel: Set<string>; alterna: (id: string) => void;
}) {
  return (
    <Fragment>
      <label className={`ens-fila${sel.has(n.id) ? " marcada" : ""}`}>
        <input type="checkbox" checked={sel.has(n.id)} onChange={() => alterna(n.id)} />
        {/* El sangrado va en un hueco propio y no en un `padding-left` de la
            fila: con padding, el fondo de la fila marcada empezaría más adentro
            en cada nivel y la lista se leería como escalones de colores. */}
        {nivel > 0 && <span className="ens-sangria" style={{ width: nivel * 16 }} aria-hidden />}
        <Mini url={n.cartel} />
        {n.folio && <span className="badge kit-folio">{n.folio}</span>}
        <Link href={`/entidad/equipamiento/${n.id}`} className="ens-nom"
          title={`Abrir la ficha de ${n.nombre}`}>{n.nombre}</Link>
        {/* El estado solo cuando NO es el normal aquí dentro. «Ensamblado» en
            una lista de ensamblados es el título repetido en cada renglón. */}
        {n.estado && n.estado !== "ensamblado" && (
          <span className="ens-est" style={{ color: colorEstadoEq(n.estado) }}>
            {txtEstadoEq(n.estado)}
          </span>
        )}
        {n.valor ? <span className="ens-val">{soles(n.valor)}</span> : null}
      </label>
      {n.piezas.map(h => (
        <Pieza key={h.id} n={h} nivel={nivel + 1} sel={sel} alterna={alterna} />
      ))}
    </Fragment>
  );
}

export default function PanelEnsamblados({ raices, sueltas, candidatos, cortado }: {
  raices: NodoEns[];
  sueltas: SueltaEns[];
  candidatos: Cand[];
  /** Si el inventario llegó al tope de la API. Cambia lo que significa una
   *  pieza «perdida»: no es la base rota, es media lista que no llegó. */
  cortado: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** Id del anfitrión al que se van a montar piezas, o `"_nuevo"` para elegirlo
   *  dentro del pop-up. `null` = cerrado. */
  const [montando, setMontando] = useState<string | null>(null);
  /* ── PLEGADAS DE ENTRADA ──
     Son cuarenta y cuatro y van a ser más: abiertas, la pantalla es un muro de
     ciento catorce renglones y el índice —que es para lo que se entra: «¿qué
     tengo armado?»— queda enterrado. Cerradas, la tarjeta ya contesta con su
     título: qué es, cuántas piezas y cuánto vale.
     ⚠ El conjunto es de ABIERTAS y no de cerradas, a propósito: con un set de
     cerradas, cada ensamblado nuevo nacería abierto y la lista volvería sola al
     muro a medida que crece.
     ⚠ Acumula ids de ensamblados que ya se desarmaron y no se poda: nadie
     recorre el conjunto —cada tarjeta pregunta por el suyo con `has`, y el
     botón de arriba pregunta por las que se VEN—, así que un id muerto no
     puede pintar ni contar nada. Podarlo pediría un efecto sobre `raices` para
     no arreglar ningún síntoma. Cuando lo tuvo —la etiqueta salía de
     `abiertos.size`— sí mentía, y eso es lo que se corrigió allí. */
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternaCaja = (id: string) => setAbiertos(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");

  const alterna = (id: string) => setSel(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  /* El buscador mira DENTRO: se busca «zapata» y tiene que salir el monopod que
     la lleva, no una lista vacía. Una tarjeta entra si coincide su anfitrión o
     cualquiera de sus piezas, y entonces se pinta ENTERA — enseñar solo la
     pieza que coincide sería devolver otra vez la lista plana que esta pantalla
     viene a sustituir. */
  /* Una sola función de coincidencia para las dos cosas que preguntan lo mismo
     —qué tarjetas se ven y cuáles se abren solas—: escritas dos veces, divergen
     a la primera corrección. */
  const casa = (r: NodoEns, ps: string[], soloDentro = false) => {
    const nodos = soloDentro ? aplanar(r) : [r, ...aplanar(r)];
    const txt = nrm(nodos
      .map(n => `${n.folio || ""} ${n.nombre} ${n.categoria || ""} ${n.subcategoria || ""}`).join(" "));
    return ps.every(p => txt.includes(p));
  };

  const vistas = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    if (!ps.length) return raices;
    return raices.filter(r => casa(r, ps));
  }, [raices, filtro]);

  /* ⚠ Buscar ABRE, no pisa. Estuvo como `abierta = !!filtro || abiertos.has(id)`
     y era un atajo con tres consecuencias: el botón de plegar de cada tarjeta
     dejaba de hacer nada visible mientras se buscaba —pero SÍ tocaba `abiertos`,
     así que al borrar el filtro aparecían tarjetas plegadas que nadie plegó—, y
     «abrir/cerrar todas» decía cosas que no pasaban. Un estado que se pinta de
     una forma y se guarda de otra siempre acaba así.
     Ahora `abiertos` es la única verdad y el buscador solo AÑADE: al teclear se
     abren las que coinciden POR DENTRO, que son las que si no dirían «está en
     alguno de estos» sin decir en cuál. Las que coinciden por el nombre del
     anfitrión no se abren: ahí la tarjeta ya contesta con su título. */
  const alFiltrar = (q: string) => {
    setFiltro(q);
    const ps = nrm(q).split(/\s+/).filter(Boolean);
    if (!ps.length) return;
    const porDentro = raices.filter(r => casa(r, ps) && casa(r, ps, true)).map(r => r.id);
    if (porDentro.length) setAbiertos(s => new Set([...s, ...porDentro]));
  };

  const totalPiezas = useMemo(() => raices.reduce((s, r) => s + piezasDeNodo(r), 0), [raices]);
  const todasAbiertas = vistas.length > 0 && vistas.every(r => abiertos.has(r.id));

  async function correr(fn: () => Promise<any>, alTerminar?: () => void) {
    setOcupado(true); setErr("");
    /* ⚠ `finally`, no una línea después del `await`: si la acción REVIENTA
       —red caída, sesión vencida— sin esto el panel se queda trabado en
       «guardando» para siempre y hay que recargar. */
    try {
      const r = await fn();
      if (r?.error) { setErr(r.error); return; }
      alTerminar?.();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "No se pudo completar.");
    } finally { setOcupado(false); }
  }

  /* ⚠ Solo lo que se VE. Era `[...sel]` a secas, y el buscador no lo tocaba:
     marcabas ocho, escribías «monopod», quedaban dos tarjetas en pantalla… y la
     barra seguía diciendo «8» y desmontaba ocho, seis de ellas de ensamblados
     que en ese momento no estaban a la vista. Un botón que actúa sobre lo que
     no se está mirando. Además `sel` sobrevive a un `router.refresh()`, así que
     puede llevar ids que ya no están montados. */
  const marcadas = useMemo(
    () => vistas.flatMap(r => aplanar(r)).filter(p => sel.has(p.id)).map(p => p.id),
    [vistas, sel],
  );

  return (
    <>
      {/* ── LO QUE NO CUADRA, ARRIBA Y EN AMARILLO ──
          Antes que el árbol: son las filas que el árbol NO puede pintar, y si
          fueran al final nadie bajaría hasta ellas. Un inventario que se calla
          lo que no encaja es el que enseña a ignorar los avisos. */}
      {sueltas.length > 0 && (
        <div className="card ens-avisos">
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>
            ⚠ {sueltas.length} {sueltas.length === 1 ? "pieza no encaja" : "piezas no encajan"} en ningún ensamblado
          </b>
          <div className="ens-avisos-lista">
            {sueltas.map(s => (
              <div key={s.id} className="ens-suelta">
                <Mini url={s.cartel} />
                {s.folio && <span className="badge kit-folio">{s.folio}</span>}
                <Link href={`/entidad/equipamiento/${s.id}`} className="ens-nom">{s.nombre}</Link>
                <span className="ens-porque">
                  {s.falla === "huerfana"
                    ? "dice que está montada y no dice dentro de qué"
                    : s.falla === "ciclo"
                    ? "está montada dentro de sí misma — hay un bucle"
                    : cortado
                    /* Con el inventario cortado, acusar a la base sería mentir:
                       el anfitrión existe y no llegó en esta tanda. */
                    ? "apunta a un equipo que no llegó: el inventario está cortado"
                    : "apunta a un equipo que ya no está"}
                </span>
                {s.piezas.length > 0 && (
                  <span className="ens-porque">· y lleva {s.piezas.length} dentro</span>
                )}
                <button type="button" className="dato-btn" disabled={ocupado}
                  title="Soltarla: vuelve a estar disponible y sin anfitrión"
                  onClick={() => correr(() => desensamblar([s.id]))}>soltar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="ens-cab">
          <b style={{ fontSize: 14 }}>
            🔧 {raices.length} ensamblado{raices.length === 1 ? "" : "s"}
            <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {totalPiezas} pieza(s) dentro</span>
          </b>
          <span className="spacer" />
          <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
            value={filtro} onChange={e => alFiltrar(e.target.value)} />
          {/* ⚠ Mira las que se VEN, no `abiertos.size`. Con el tamaño del
              conjunto, abrir UNA de cuarenta y cuatro ya ponía «cerrar todas»
              —y la acción que hace falta en ese momento es la contraria—; y
              peor: `abiertos` guarda ids de ensamblados que ya se desarmaron,
              así que podía decir «cerrar todas» con las cuarenta y cuatro
              cerradas. Preguntando por lo visible, la etiqueta no puede
              mentir. Y se pinta también buscando: ahora el buscador solo
              añade, así que cerrar y abrir siguen haciendo lo que dicen. */}
          {vistas.length > 1 && (
            <button type="button" className="dato-btn"
              onClick={() => setAbiertos(s => {
                const n = new Set(s);
                if (todasAbiertas) vistas.forEach(r => n.delete(r.id));
                else vistas.forEach(r => n.add(r.id));
                return n;
              })}>
              {todasAbiertas ? "cerrar todas" : "abrir todas"}
            </button>
          )}
          {/* Sin `setSel(new Set())`: lo marcado es para DESMONTAR, y ponerse a
              armar otra cosa no lo cancela. Borrarlo aquí tiraba en silencio lo
              que el usuario llevaba marcado. */}
          <button type="button" className="btn" onClick={() => setMontando("_nuevo")}>
            🔧 Armar
          </button>
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}

        {raices.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 10, lineHeight: 1.55 }}>
            No hay nada armado todavía. «Armar» monta varias piezas dentro de un
            equipo: mientras estén montadas no se prestan sueltas, porque para
            sacarlas hace falta un destornillador.
          </div>
        )}
        {raices.length > 0 && vistas.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 10 }}>
            Nada coincide con esa búsqueda.
          </div>
        )}

        <div className="ens-tarjetas">
          {vistas.map(r => {
            const dentro = aplanar(r);
            const marcadasAqui = dentro.filter(p => sel.has(p.id));
            const abierta = abiertos.has(r.id);
            return (
              <div key={r.id} className={`ens-tarjeta${abierta ? " abierta" : ""}`}>
                <div className="ens-titulo">
                  {/* Un BOTÓN de verdad y no un `div` con `onClick`: se enfoca
                      con el Tab, se activa con Enter y dice si está abierto.
                      Se lleva la miniatura, el folio y el nombre para que el
                      área de clic sea media fila y no una flecha de diez
                      píxeles — con cuarenta y cuatro tarjetas eso se nota.
                      ⚠ Por eso el nombre va en `<b>` y no en un `<Link>`: el
                      modelo de contenido de `<button>` no admite descendientes
                      interactivos, así que un ancla dentro es HTML inválido —y
                      un lector de pantalla se encuentra dos controles anidados
                      sin saber cuál anunciar—. El navegador NO lo reacomoda: se
                      queda anidado y roto en silencio, que es lo peor de los dos
                      mundos. La ficha se abre con el ↗ de la derecha. */}
                  <button type="button" className="ens-plegar" aria-expanded={abierta}
                    onClick={() => alternaCaja(r.id)}
                    /* El nombre va SIEMPRE en el `title`: es lo único que deja
                       leer entero un nombre largo, que el ellipsis corta. */
                    title={abierta ? `Ocultar las piezas de «${r.nombre}»`
                      : `Ver las ${piezasDeNodo(r)} piezas de «${r.nombre}»`}>
                    <span className="panel-flecha" aria-hidden>{abierta ? "▾" : "▸"}</span>
                    <Mini url={r.cartel} />
                    {r.folio && <span className="badge kit-folio">{r.folio}</span>}
                    <b className="ens-nom-g">{r.nombre}</b>
                  </button>
                  <span className="ens-resumen">
                    {piezasDeNodo(r)} pieza(s) · {soles(valorDeNodo(r))}
                  </span>
                  {/* Prestado: se dice ARRIBA, en el título. Es lo que decide si
                      se puede tocar hoy — no está aquí, está en una mochila. */}
                  {r.quien && <span className="ens-quien">lo tiene {r.quien}</span>}
                  {/* ⚠ Lo marcado se dice en la CABECERA cuando está cerrada.
                      Si no, marcas cinco piezas, pliegas, y la barra de abajo
                      ofrece desmontar cinco que ya no se ven por ningún lado. */}
                  {!abierta && marcadasAqui.length > 0 && (
                    <span className="ens-marcadas">{marcadasAqui.length} marcada(s)</span>
                  )}
                  <span className="spacer" />
                  <Link href={`/entidad/equipamiento/${r.id}`} className="dato-btn"
                    title={`Abrir la ficha de ${r.nombre}`}>↗ ficha</Link>
                  <button type="button" className="dato-btn" disabled={ocupado}
                    title={`Montar más piezas dentro de ${r.nombre}`}
                    onClick={() => setMontando(r.id)}>＋ piezas</button>
                </div>
                {abierta && (
                  <div className="ens-arbol">
                    {r.piezas.map(p => (
                      <Pieza key={p.id} n={p} nivel={0} sel={sel} alterna={alterna} />
                    ))}
                  </div>
                )}
                {abierta && marcadasAqui.length > 0 && (
                  <div className="ens-pie">
                    <span>{marcadasAqui.length} marcada(s) en este ensamblado</span>
                    <button type="button" className="btn btn-ghost" disabled={ocupado}
                      onClick={() => correr(
                        () => desensamblar(marcadasAqui.map(p => p.id)),
                        () => setSel(new Set()),
                      )}>
                      {ocupado ? "…" : `✕ Desmontar ${marcadasAqui.length}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Marcadas repartidas por varias tarjetas: el pie de cada una solo
            sabe de las suyas, y desmontar treinta de cuatro ensamblados en
            cuatro clics es tres clics de más. */}
        {marcadas.length > 0 && (
          <div className="ens-barra">
            <span>{marcadas.length} pieza(s) marcadas en total</span>
            <button type="button" className="dato-btn" onClick={() => setSel(new Set())}>quitar la marca</button>
            <span className="spacer" />
            {/* ⚠ Con confirmación, y la de la ficha no la lleva por capricho:
                allí se desarma UN rig y aquí pueden ser treinta piezas de
                cuatro ensamblados en un clic, sin forma de deshacerlo salvo
                volver a montarlas una por una. */}
            <button type="button" className="btn" disabled={ocupado}
              onClick={() => {
                if (!confirm(`¿Desmontar ${marcadas.length} pieza(s)? Vuelven a estar disponibles y sueltas.`)) return;
                correr(() => desensamblar(marcadas), () => setSel(new Set()));
              }}>
              {ocupado ? "Soltando…" : `✕ Desmontar las ${marcadas.length}`}
            </button>
          </div>
        )}
      </div>

      {montando && (
        <Montador anfitrionFijo={montando === "_nuevo" ? null : montando}
          raices={raices} candidatos={candidatos} ocupado={ocupado}
          onCerrar={() => setMontando(null)} err={err}
          /* ⚠ Se abre lo que se acaba de armar. Con todo plegado por defecto,
             montar siete piezas y ver la lista igual que antes es no tener
             acuse de recibo: no se distingue de que no haya pasado nada. */
          onMontar={(padre, ids) => correr(
            () => ensamblar(padre, ids),
            () => { setMontando(null); setAbiertos(s => new Set([...s, padre])); },
          )} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EL POP-UP DE ARMAR

   Dos preguntas y en este orden: DENTRO DE QUÉ y QUÉ. Al revés —marcar piezas
   y luego buscar el anfitrión— se pierde lo marcado si uno se equivoca de
   pantalla, y además el anfitrión decide qué es candidato (él mismo no puede
   ir dentro de sí).
   ══════════════════════════════════════════════════════════════════════════ */
function Montador({ anfitrionFijo, raices, candidatos, ocupado, err, onCerrar, onMontar }: {
  anfitrionFijo: string | null;
  raices: NodoEns[];
  candidatos: Cand[];
  ocupado: boolean;
  /** ⚠ El fallo se pinta AQUÍ DENTRO. El pop-up es `fixed` con `z-index:80`, así
   *  que un error escrito en el panel de debajo queda tapado por él: se pulsaba
   *  «Montar 7», `ensamblar` contestaba «están prestadas: A-12, A-19» y en
   *  pantalla no pasaba nada de nada. */
  err: string;
  onCerrar: () => void;
  onMontar: (padreId: string, piezaIds: string[]) => void;
}) {
  const [padre, setPadre] = useState<string | null>(anfitrionFijo);
  const [bPadre, setBPadre] = useState("");
  const [bPieza, setBPieza] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  /* Puede ser anfitrión un equipo montable —los `candidatos`— o uno que ya
     lleva algo dentro, que no está en esa lista precisamente porque su estado
     ya es «ensamblado»… no: un anfitrión de primer nivel NO tiene ese estado,
     lo tienen sus piezas. Está fuera de `candidatos` solo si su estado no es
     montable, y ahí está el detalle:

     ⚠ Se filtran las raíces por lo MISMO que los candidatos. Sin esto, un rig
     PRESTADO volvía a entrar en la lista por la puerta de `raices` —está en la
     mochila de alguien y aun así se ofrecía para meterle piezas— y `ensamblar`
     lo aceptaría, porque solo mira el estado de las PIEZAS, no el del padre.

     ⚠ Deuda anotada: un sub-anfitrión ANIDADO (un rig dentro de un monopod, con
     sus propios tornillos) no está ni en `raices` ni en `candidatos`, así que
     no se puede elegir aquí — hay que ir a su ficha. `ensamblar` lo aceptaría;
     lo que falta es ofrecerlo, y ofrecerlo bien es enseñar el árbol dentro del
     escogedor. No se hace hoy para no meter un segundo árbol en un pop-up. */
  const anfitriones = useMemo(() => {
    const m = new Map<string, Cand>();
    raices.filter(r => !r.quien && MONTABLES.has(String(r.estado || ""))).forEach(r => m.set(r.id, {
      id: r.id, folio: r.folio, nombre: r.nombre, categoria: r.categoria,
      subcategoria: r.subcategoria, estado: r.estado, cartel: r.cartel, valor: r.valor,
    }));
    candidatos.forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
    return [...m.values()].sort((a, b) => (a.folio || "￿").localeCompare(b.folio || "￿", "es"));
  }, [raices, candidatos]);

  const elPadre = anfitriones.find(a => a.id === padre) || null;

  /* ⚠ Devuelve TAMBIÉN cuántas había. Un `.slice(0, 60)` mudo hace pensar que
     la pieza que falta no existe, y de ahí sale un duplicado nacido de un
     límite invisible — está contado en `components/Ensamblado`, que ya pagó
     ese fallo. Se corta igual, porque pintar quinientas filas al abrir el
     pop-up es lo que lo hace lento; lo que no se hace es callarlo. */
  const TOPE_LISTA = 60;
  const filtra = (lista: Cand[], q: string) => {
    const ps = nrm(q).split(/\s+/).filter(Boolean);
    const todos = !ps.length ? lista : lista.filter(e =>
      ps.every(p => nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""} ${e.subcategoria || ""}`).includes(p)));
    return { filas: todos.slice(0, TOPE_LISTA), total: todos.length };
  };

  /* ⚠ El anfitrión NO puede salir en la lista de piezas. `ensamblar` lo filtra
     también —`i !== padreId`—, pero ofrecerlo y quitarlo callado es peor que no
     ofrecerlo: se marca, se cuenta como una de las siete y se montan seis. */
  const piezas = useMemo(
    () => filtra(candidatos.filter(c => c.id !== padre), bPieza),
    [candidatos, padre, bPieza],
  );

  const fila = (e: Cand, marcada: boolean, alPulsar: () => void) => (
    <label key={e.id} className={`ent-lote-fila${marcada ? " elegida" : ""}`}>
      <input type="checkbox" checked={marcada} onChange={alPulsar} />
      <Mini url={e.cartel} />
      {e.folio && <span className="badge kit-folio">{e.folio}</span>}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{e.nombre}</span>
      {(e.subcategoria || e.categoria) && (
        <span className="ent-fila-sub">{e.subcategoria || e.categoria}</span>
      )}
    </label>
  );

  return (
    <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-caja modal-form">
        <div className="modal-cab">
          <b style={{ fontSize: 14 }}>🔧 Armar un ensamblado</b>
          <button className="dato-btn" onClick={onCerrar} title="Cerrar">✕</button>
        </div>

        <div className="ens-paso">
          <span className="ens-paso-n">1</span>
          <b>¿Dentro de qué van?</b>
          {elPadre && (
            <span className="ens-paso-el">
              <Mini url={elPadre.cartel} />
              {elPadre.folio && <span className="badge kit-folio">{elPadre.folio}</span>}
              {elPadre.nombre}
              {/* Sin `anfitrionFijo` se pudo elegir, así que se puede cambiar.
                  Con él, el pop-up se abrió DESDE esa tarjeta y cambiarlo aquí
                  sería armar otro ensamblado sin haberlo pedido. */}
              {!anfitrionFijo && (
                <button type="button" className="dato-btn"
                  onClick={() => setPadre(null)}>cambiar</button>
              )}
            </span>
          )}
        </div>
        {!elPadre && (() => { const lista = filtra(anfitriones, bPadre); return (
          <>
            <input className="ent-lote-inp" placeholder="Buscar el equipo que las va a llevar dentro…"
              value={bPadre} onChange={e => setBPadre(e.target.value)} style={{ width: "100%" }} />
            <div className="ent-caja">
              {lista.filas.map(e => fila(e, false, () => setPadre(e.id)))}
              {!lista.total && (
                <div style={{ padding: 12, color: "var(--dim)", fontSize: 13 }}>Nada coincide.</div>
              )}
              {lista.total > lista.filas.length && (
                <div className="ens-corte">
                  Se muestran {lista.filas.length} de {lista.total} — afina la búsqueda.
                </div>
              )}
            </div>
          </>
        ); })()}

        {elPadre && (
          <>
            <div className="ens-paso">
              <span className="ens-paso-n">2</span>
              <b>¿Qué se monta dentro?</b>
              <span style={{ color: "var(--dim)", fontSize: 12 }}>
                {sel.size} marcada(s)
              </span>
            </div>
            {/* Lo prestado y lo ya montado no están en esta lista: `ensamblar`
                los rechazaría con un error, y ofrecer algo para luego decir que
                no se puede es hacer perder el viaje. Se filtra en el servidor,
                en `arbolEnsamblados`. */}
            <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
              value={bPieza} onChange={e => setBPieza(e.target.value)} style={{ width: "100%" }} />
            <div className="ent-caja">
              {piezas.filas.map(e => fila(e, sel.has(e.id), () => setSel(s => {
                const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n;
              })))}
              {piezas.total > piezas.filas.length && (
                <div className="ens-corte">
                  Se muestran {piezas.filas.length} de {piezas.total} — afina la búsqueda.
                </div>
              )}
              {!piezas.total && (
                <div style={{ padding: 12, color: "var(--dim)", fontSize: 13, lineHeight: 1.5 }}>
                  {bPieza
                    ? "Nada coincide con esa búsqueda."
                    : "No hay nada libre para montar: todo está ya montado o prestado."}
                </div>
              )}
            </div>
            {err && (
              <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                ⚠ {err}
              </div>
            )}
            <div className="ens-barra" style={{ marginTop: 10 }}>
              <span className="spacer" />
              <button type="button" className="dato-btn" onClick={onCerrar}>cancelar</button>
              <button type="button" className="btn" disabled={ocupado || !sel.size}
                onClick={() => onMontar(elPadre.id, [...sel])}>
                {ocupado ? "Montando…" : `🔧 Montar ${sel.size || ""}`.trim()}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
