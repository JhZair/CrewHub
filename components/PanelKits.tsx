"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { crearKit, guardarKit, setKitEquipos, borrarKit, revivirKit } from "@/app/actions";
import { estadoKit, resumenKit, contextoKit, porQueNo, agruparPorCombo, valeAgrupar,
  type PiezaKit, type EqBase, type KitVista } from "@/lib/kits";
import { entregableEq } from "@/lib/estadosEquipo";
import PiezasKit from "@/components/PiezasKit";
import Avatar from "@/components/Avatar";

/* ARMAR KITS — «Entrevista PRO» es una cosa, no tres fichas que alguien
 * recuerda marcar de a una.
 *
 * Las tablas `kits` y `kit_equipos` estaban en el schema desde el principio,
 * con su comentario: «al publicar desde rodaje se vincula el kit completo en
 * un clic». El clic nunca se escribió, así que durante un año el inventario se
 * entregó pieza por pieza al lado de un modelo que ya decía cómo hacerlo.
 *
 * El panel no entrega: eso vive en la entrega en lote, que ya sabe pedir
 * persona, proyecto y nota. Aquí se arma el kit y se ve, de un vistazo, si
 * hoy se puede entregar entero —y si no, quién tiene la pieza que falta—.
 * Decir «no disponible» no sirve: lo que hace falta saber es a quién llamar.
 */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ── El escogedor de equipos, compartido por «nuevo kit» y «editar kit» ── */
function Escoge({ equipos, sel, alterna, onVaciar }: {
  equipos: EqBase[]; sel: Set<string>; alterna: (id: string) => void;
  onVaciar: () => void;
}) {
  const [filtro, setFiltro] = useState("");
  const vistos = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    if (!ps.length) return equipos;
    return equipos.filter(e => {
      const t = nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""} ${e.subcategoria || ""}`);
      return ps.every(p => t.includes(p));
    });
  }, [equipos, filtro]);

  /* Lo elegido, en el orden del inventario y no en el de los clics: esta lista
     se repasa contra lo que se va a meter en la bolsa, y las etiquetas físicas
     están ordenadas por folio. */
  const elegidos = useMemo(() => equipos.filter(e => sel.has(e.id)), [equipos, sel]);

  /* Una fila, la misma a los dos lados. Definida FUERA del return para no
     escribirla dos veces: dos copias de la misma fila divergen a la primera
     corrección, y aquí ya pasó con la miniatura. */
  /* Trabada = no se puede entregar hoy. `entregableEq` y no
     `NO_ENTREGABLE[e.estado]`: un equipo SIN ESTADO no estaba en ese mapa, asi
     que salia igual de encendido que uno disponible — y era justo el caso del
     A-312. Y cuenta tambien a quien lo tiene prestado, que el rotulo amarillo
     no miraba. */
  const fila = (e: EqBase, modo: "elegir" | "quitar") => {
    const trabada = !!e.quien || !entregableEq(e.estado);
    return (
    <label key={e.id} className={`ent-lote-fila${modo === "quitar" ? " elegida" : ""}${trabada ? " ocupada" : ""}`}
      data-marcada={modo === "elegir" && sel.has(e.id) ? "1" : undefined}>
      {modo === "elegir"
        ? <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
        : null}
      {/* Con foto se arma el kit mirando los equipos; sin ella hay que
          reconocerlos por el folio, que nadie se sabe de memoria. */}
      <span className="kit-pz-img">
        {e.cartel
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={e.cartel} alt="" referrerPolicy="no-referrer" />
          : <span>🎥</span>}
      </span>
      {e.folio && <span className="badge kit-folio">{e.folio}</span>}
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="ent-fila-n">{e.nombre}</span>
        {(e.subcategoria || e.categoria) && (
          <span className="ent-fila-sub">{e.subcategoria || e.categoria}</span>
        )}
      </span>
      {/* Un equipo en reparación SÍ puede formar parte del kit: el kit dice
          qué lo compone, no qué está libre hoy. Lo que cambia es que al
          entregar se avisará de que falta — y por eso el motivo va con
          nombre, «lo tiene KatyP», igual que en la lista del kit. */}
      {trabada && <span className="kit-aviso">{porQueNo(e)}</span>}
      {modo === "quitar" && (
        <button type="button" className="ent-quita" title={`Sacar ${e.nombre} del kit`}
          onClick={() => alterna(e.id)}>✕</button>
      )}
    </label>
    );
  };

  return (
    /* DOS LISTAS: DE DÓNDE SE ELIGE Y QUÉ SE ELIGIÓ, como en la entrega en
       lote. Con una sola, saber qué llevaba puesto el kit era recorrer
       doscientas filas buscando cuadraditos azules — y con el buscador
       escrito, las piezas ya elegidas que no coinciden con el filtro NI
       SIQUIERA SE VEÍAN. Se editaba un kit de doce a ciegas, confiando en el
       «12 seleccionado(s)» del pie.
       La de la derecha no cambia con el buscador: es la lista de empaque. */
    <div className="ent-dos" style={{ marginTop: 8 }}>
      <div>
        <div className="ent-col-h">
          <span>Inventario</span>
          <span className="ent-col-n">{vistos.length}{filtro && vistos.length !== equipos.length ? ` de ${equipos.length}` : ""}</span>
        </div>
        <div className="ent-top">
          <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
            value={filtro} onChange={ev => setFiltro(ev.target.value)} style={{ width: "100%" }} />
        </div>
        <div className="ent-caja">
          {vistos.length === 0 && <div style={{ padding: 10, color: "var(--dim)", fontSize: 13 }}>Nada coincide.</div>}
          {/* Agrupado por combo: armar un kit es justamente el momento en que
              importa —«de la compra del dron entra todo menos el cargador» se
              marca de un vistazo— y con doscientos equipos en fila plana no se
              ve. Misma función que la lista pintada: dos listas que agruparan
              distinto serían peor que ninguna. */}
          {agruparPorCombo(vistos).map((g, _i, gs) => (
            <Fragment key={g.clave}>
              {valeAgrupar(gs) && (
                <div className="kit-grupo-h esc">
                  {g.nombre
                    ? <>
                        <span className="badge cmp-cod">🧾 {g.codigo || g.nombre}</span>
                        {g.codigo && <span className="kit-grupo-n">{g.nombre}</span>}
                      </>
                    : <span className="kit-grupo-n suelto">sin combo — entraron por separado</span>}
                  <span className="kit-grupo-c">{g.items.length}</span>
                </div>
              )}
              {g.items.map(e => fila(e, "elegir"))}
            </Fragment>
          ))}
        </div>
      </div>

      <div>
        <div className="ent-col-h marcados" style={{ color: "var(--violet)" }}>
          <span>📦 En el kit</span>
          <span className="ent-col-n" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>{elegidos.length}</span>
        </div>
        <div className="ent-top derecha">
          {elegidos.length > 0
            ? <button type="button" className="dato-btn" style={{ color: "var(--dim)" }} onClick={onVaciar}>Vaciar</button>
            : <span style={{ color: "var(--dim)", fontSize: 11.5 }}>lo que se marque aparece aquí</span>}
        </div>
        <div className="ent-caja">
          {elegidos.length === 0
            ? <div style={{ padding: 12, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5 }}>
                El kit está vacío. Búscalo a la izquierda y márcalo: un kit es lo que sale junto porque junto hace un trabajo.
              </div>
            : elegidos.map(e => fila(e, "quitar"))}
        </div>
      </div>
    </div>
  );
}

/* ── El formulario, uno solo para crear y para editar ── */
function Editor({ kit, equipos, onCerrar }: {
  kit: KitVista | null; equipos: EqBase[]; onCerrar: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(kit?.nombre || "");
  const [uso, setUso] = useState(kit?.uso || "");
  const [desc, setDesc] = useState(kit?.descripcion || "");
  const [sel, setSel] = useState<Set<string>>(new Set(kit?.equipoIds || []));
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [pideBorrar, setPideBorrar] = useState(false);
  const [aviso, setAviso] = useState("");

  const alterna = (id: string) =>
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function guardar() {
    if (!nombre.trim()) { setErr("El kit necesita un nombre."); return; }
    setOcupado(true); setErr("");
    const r: any = kit
      ? await guardarKit(kit.id, nombre, uso, desc).then(async (x: any) =>
          x?.error ? x : await setKitEquipos(kit.id, [...sel]))
      : await crearKit(nombre, uso, desc, [...sel]);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    onCerrar(); router.refresh();
  }

  async function borrar() {
    if (!kit) return;
    setOcupado(true); setErr("");
    const r: any = await borrarKit(kit.id);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    /* Retirado no es borrado, y se dice: el kit sigue nombrando préstamos
       viejos, y desaparecer sin explicación haría pensar que se perdieron.
       En línea y no en un `alert`: un diálogo del navegador se cierra de un
       golpe de tecla y el aviso se pierde con él. */
    if (r?.retirado) {
      setAviso(`«${kit.nombre}» ya salió a rodaje ${r.usos} vez/veces, así que no se borra: queda retirado —deja de ofrecerse, pero sus salidas siguen nombrándolo—. Está abajo, en «Retirados».`);
      router.refresh(); return;
    }
    onCerrar(); router.refresh();
  }

  return (
    <div className="kit-editor">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="ent-lote-inp" placeholder="Nombre del kit — «Entrevista en espacio controlado PRO»"
          value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: 2, minWidth: 220 }} autoFocus />
        <input className="ent-lote-inp" placeholder="Uso (opcional): entrevista, rodaje…"
          value={uso} onChange={e => setUso(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
      </div>
      <input className="ent-lote-inp" placeholder="Nota (opcional): «lleva el trípode chico, no el grande»"
        value={desc} onChange={e => setDesc(e.target.value)} style={{ width: "100%", marginTop: 8 }} />

      <Escoge equipos={equipos} sel={sel} alterna={alterna} onVaciar={() => setSel(new Set())} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={ocupado || !nombre.trim()} onClick={guardar}>
          {ocupado ? "Guardando…" : kit ? "Guardar cambios" : `Crear kit${sel.size ? ` con ${sel.size}` : ""}`}
        </button>
        <button className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
        <span style={{ flex: 1 }} />
        {kit && (pideBorrar
          ? <span style={{ fontSize: 11.5 }}>¿Quitar «{kit.nombre}»? <button style={{ color: "var(--red)", fontWeight: 700 }} disabled={ocupado} onClick={borrar}>sí</button>{" / "}<button style={{ color: "var(--dim)" }} onClick={() => setPideBorrar(false)}>no</button></span>
          : <button className="dato-btn" style={{ color: "var(--dim)" }} onClick={() => setPideBorrar(true)}>Quitar kit</button>)}
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>⚠ {err}</div>}
      {aviso && (
        <div style={{ color: "var(--yellow)", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
          ℹ {aviso}{" "}
          <button className="dato-btn" style={{ color: "var(--dim)" }} onClick={onCerrar}>cerrar</button>
        </div>
      )}
    </div>
  );
}

export default function PanelKits({ kits, equipos }: { kits: KitVista[]; equipos: EqBase[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);   // id del kit, o "_nuevo"
  const porEq = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);

  const vivos = kits.filter(k => !k.retirado);
  const retirados = kits.filter(k => k.retirado);

  /* Arranca CERRADO, y de una forma que el navegador no pueda deshacer.
     Antes era un `<details>` con `open={abierto}` y `useState(false)`. El
     estado inicial era correcto y aun así el panel aparecía abierto al
     volver a la página: Chrome RESTAURA el abierto/cerrado de un `<details>`
     junto con el scroll, y esa restauración ocurre fuera de React —el estado
     decía `false` y el DOM decía abierto—. Un fallo que no falla: el código
     leído era correcto.
     Con un botón y el cuerpo pintado condicionalmente no hay nada que
     restaurar: si el estado dice cerrado, el contenido no existe. */
  const [abierto, setAbierto] = useState(false);

  /* Y cada kit, tambien cerrado. Con el panel abierto se pintaban de golpe
     las piezas de TODOS los kits —once, dos y siete, con su miniatura cada
     una—: veinte filas con imagen para responder algo que la cabecera ya
     contesta («11 equipos - completo»). Lo que se viene a mirar aqui es que
     kits hay y cual esta entero; el desglose es la segunda pregunta, y solo
     de uno.
     La cabecera sigue diciendo el resumen cerrada, asi que desplegar es una
     eleccion, no un peaje para leer la lista. */
  const [desplegados, setDesplegados] = useState<Set<string>>(new Set());
  /* Los dos filtros de la lista, como en los combos. Fuera del bloque para
     que sobrevivan a abrir y cerrar un editor. */
  const [cat, setCat] = useState("");
  const [txt, setTxt] = useState("");
  const alternaKit = (id: string) =>
    setDesplegados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const piezasDe = (k: KitVista): PiezaKit[] =>
    k.equipoIds.map(id => porEq.get(id)).filter(Boolean).map((e: any) => ({
      id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado, quien: e.quien,
      cartel: e.cartel, combo: e.combo || null, kits: e.kits || [],
      categoria: e.categoria || null, subcategoria: e.subcategoria || null,
      montadas: e.piezas || [],
      valor: e.valor_compra ? Number(e.valor_compra) : null,
    }));

  /* Un kit se busca por lo que es —«entrevista», «drone»— pero también por lo
     que LLEVA: «¿en qué kit está el Rode?» es la pregunta de verdad cuando
     falta algo. Por eso el pajar incluye folios y nombres de sus piezas. */
  const listaKits = vivos.filter(k => {
    const piezas = piezasDe(k);
    if (cat && !contextoKit(piezas).cats.includes(cat)) return false;
    const ps = nrm(txt).split(/\s+/).filter(Boolean);
    if (!ps.length) return true;
    const pajar = nrm(`${k.nombre} ${k.uso || ""} ${k.descripcion || ""} `
      + piezas.map(p => `${p.folio || ""} ${p.nombre}`).join(" "));
    return ps.every(p => pajar.includes(p));
  });

  return (
    <div className="card">
      <button className="panel-plegar" aria-expanded={abierto}
        style={{ color: "var(--violet)" }} onClick={() => setAbierto(!abierto)}>
        <span className="panel-flecha">{abierto ? "▾" : "▸"}</span>
        📦 Kits — lo que sale junto{vivos.length ? ` · ${vivos.length}` : ""}
      </button>

      {abierto && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={() => setEditando("_nuevo")}>＋ Nuevo kit</button>

          {!vivos.length && editando !== "_nuevo" && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>
              Todavía no hay kits. Un kit es lo que sale junto porque junto hace un trabajo —cámara, micro y luz de una entrevista—: al entregar se marcan sus equipos de un clic, y a la vuelta se sabe si volvió entero.
            </div>
          )}

          {/* Buscar y filtrar, igual que en los combos: pasados seis kits la
              lista ya no se lee, se busca. Por categoría se FILTRA y no se
              agrupa —un kit lleva cámara Y sonido, y agrupar repetiría la
              misma fila bajo dos encabezados—, y el contador dice «3 de 8»
              mientras hay filtro para que nadie crea que se perdieron cinco. */}
          {(() => {
            if (vivos.length <= 6) return null;
            const cats: string[] = [];
            vivos.forEach(k => contextoKit(piezasDe(k)).cats
              .forEach(c => { if (!cats.includes(c)) cats.push(c); }));
            cats.sort();
            return (
              <div className="cbo-filtros">
                <input className="ent-lote-inp" placeholder="Buscar por nombre, uso o equipo…"
                  value={txt} onChange={e => setTxt(e.target.value)} style={{ flex: 1, minWidth: 190 }} />
                {cats.map(c => (
                  <button key={c} type="button" className={`kit-chip${cat === c ? " on" : ""}`}
                    onClick={() => setCat(cat === c ? "" : c)}>{c}</button>
                ))}
                {(cat || txt) && (
                  <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
                    onClick={() => { setCat(""); setTxt(""); }}>
                    {listaKits.length} de {vivos.length} · limpiar
                  </button>
                )}
              </div>
            );
          })()}

          {!listaKits.length && vivos.length > 0 && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 10 }}>
              Ningún kit coincide{cat ? ` en «${cat}»` : ""}{txt ? ` con «${txt}»` : ""}.
            </div>
          )}

          {listaKits.map(k => {
            const e = estadoKit(piezasDe(k));
            const res = resumenKit(e);
            /* `editandoEste` y no `abierto`: aqui dentro habia un `abierto` que
               significaba «se esta editando» y tapaba al del panel exterior.
               Dos cosas distintas con el mismo nombre en el mismo archivo es
               el tipo de detalle que se lee bien y se entiende mal. */
            const editandoEste = editando === k.id;
            const desplegado = desplegados.has(k.id);
            const piezas = [...e.libres, ...e.prestadas, ...e.vetadas];
            /* En orden de kit —libres primero—: la cara del kit acaba siendo
               la de la pieza que sí se puede entregar, que es la que uno tiene
               en la cabeza al buscarlo. */
            const caraKit = piezas.find(p => p.cartel)?.cartel || null;
            return (
              <div key={k.id} className={`kit-caja${editandoEste ? " editando" : ""}`}>
                <div className="kit-h">
                  <button className="kit-plegar" aria-expanded={desplegado}
                    onClick={() => alternaKit(k.id)}
                    title={desplegado ? "Ocultar las piezas" : `Ver las ${piezas.length} piezas de «${k.nombre}»`}>
                    <span className="panel-flecha">{desplegado ? "▾" : "▸"}</span>
                    {/* La cara del kit: la foto de su primera pieza con
                        imagen. Un kit tampoco es una cosa —es una decisión de
                        qué sale junto— pero se reconoce por su aparato
                        principal antes que por su nombre. */}
                    <span className="cbo-img">
                      {caraKit
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={caraKit} alt="" referrerPolicy="no-referrer" />
                        : <span>📦</span>}
                    </span>
                    <b style={{ fontSize: 13.5 }}>{k.nombre}</b>
                  </button>
                  {k.uso && <span className="badge kit-uso">{k.uso}</span>}
                  <span style={{ color: res.color, fontSize: 11.5, fontWeight: 600 }}>{res.txt}</span>
                  <span style={{ flex: 1 }} />
                  {/* La entrega no se duplica aquí: vive en la entrega en lote,
                      que ya sabe pedir persona, proyecto y nota. Este enlace
                      la abre con el kit ya elegido. */}
                  {e.libres.length > 0 && (
                    <Link className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
                      href={`/equipamiento?kit=${k.id}#entregar`}>🤝 Entregar</Link>
                  )}
                  <button className="dato-btn" title="Editar el kit"
                    onClick={() => setEditando(editandoEste ? null : k.id)}>✎</button>
                </div>

                {/* QUÉ ES el kit, con el kit plegado. «12 equipos · completo»
                    no dice si son doce baterías o una cámara con todo lo suyo,
                    ni cuánto sale a la calle si se entrega. Y cuando falta
                    algo, lo que hace falta saber es a quién llamar — eso
                    obligaba a desplegarlo. */}
                {(() => {
                  const ctx = contextoKit(piezas);
                  if (!ctx.valor && !ctx.cats.length && !ctx.quienes.length && !k.autor) return null;
                  return (
                    <div className="kit-ctx">
                      {ctx.valor > 0 && (
                        <span className={`kit-ctx-val${ctx.estimado ? " esti" : ""}`}
                          title={ctx.estimado
                            ? "Aproximado: alguna pieza vino en un combo y no tiene precio propio, así que se le reparte su parte de la boleta."
                            : undefined}>
                          {ctx.estimado ? "~" : ""}S/ {Math.round(ctx.valor).toLocaleString("es-PE")}
                        </span>
                      )}
                      {ctx.cats.length > 0 && <span>{ctx.cats.join(" · ")}</span>}
                      {/* «+ 3 montadas» y no sumado al total: el kit lleva
                          quince FICHAS, pero sobre la mesa hay dieciocho
                          cosas. Sumarlo escondería que tres van atornilladas
                          dentro de otra; decirlo aparte es lo que hace que a
                          la vuelta se cuenten. */}
                      {ctx.montadas > 0 && (
                        <span className="kit-ctx-mont" title="Piezas atornilladas dentro de otras piezas del kit. No se entregan por separado, pero hay que contarlas al devolver.">
                          + {ctx.montadas} montada{ctx.montadas === 1 ? "" : "s"}
                        </span>
                      )}
                      {ctx.quienes.length > 0 && (
                        <span className="kit-ctx-quien">lo tiene{ctx.quienes.length > 1 ? "n" : ""} {ctx.quienes.join(", ")}</span>
                      )}
                      {/* QUIÉN LO ARMÓ, al final de la línea y en gris. Un kit
                          es una decisión —«esto sale junto para una
                          entrevista»—, y ante una pieza que no encaja lo que
                          hace falta saber es a quién preguntarle por qué está
                          ahí. El dato se guardaba desde el primer día
                          (db/kits.sql) y no lo leía ninguna pantalla.
                          Al final y no al lado del nombre: es de quien mira,
                          no de lo que se entrega. */}
                      {k.autor && (
                        <span className="kit-ctx-autor" title={`Kit armado por ${k.autor.nombre || "alguien"}`}>
                          <Avatar nombre={k.autor.nombre} color={k.autor.color}
                            src={k.autor.avatar_url} size={15} />
                          {k.autor.nombre || "alguien"}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {k.descripcion && <div className="kit-desc">{k.descripcion}</div>}

                {desplegado && <PiezasKit piezas={piezas} />}


              </div>
            );
          })}

          {/* EL EDITOR, EN VENTANA. Estaba EN LÍNEA, dentro de la caja del kit:
              abrirlo empujaba media página hacia abajo y dejaba el formulario
              pegado a las piezas de OTROS kits, con lo que ya no se sabía qué
              se estaba editando. Un formulario con dos listas de doscientas
              filas no cabe dentro de una fila de una lista.
              En ventana se aísla —fondo oscurecido, nada más en pantalla— y al
              cerrar la página está donde se dejó, sin haber saltado.
              Se pinta UNA vez y fuera del `map`: dentro habría un modal por
              kit, y once elementos con `position:fixed` esperando su turno. */}
          {editando && (
            <div className="modal-fondo"
              onClick={e => { if (e.target === e.currentTarget) setEditando(null); }}>
              <div className="modal-caja modal-form">
                <div className="modal-cab">
                  <b style={{ fontSize: 14 }}>
                    {editando === "_nuevo" ? "＋ Nuevo kit" : `✎ ${vivos.find(k => k.id === editando)?.nombre || "Editar kit"}`}
                  </b>
                  <button className="dato-btn" onClick={() => setEditando(null)} title="Cerrar">✕</button>
                </div>
                <Editor
                  kit={editando === "_nuevo" ? null : (vivos.find(k => k.id === editando) || null)}
                  equipos={equipos} onCerrar={() => setEditando(null)} />
              </div>
            </div>
          )}

          {retirados.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--dim)", fontSize: 12 }}>
                Retirados · {retirados.length}
              </summary>
              {retirados.map(k => (
                <div key={k.id} className="kit-h" style={{ opacity: .65 }}>
                  <span style={{ fontSize: 13 }}>📦 {k.nombre}</span>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{k.equipoIds.length} equipo(s)</span>
                  <span style={{ flex: 1 }} />
                  <button className="dato-btn" style={{ color: "var(--teal)" }}
                    onClick={async () => { await revivirKit(k.id); router.refresh(); }}>Recuperar</button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
