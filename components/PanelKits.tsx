"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { crearKit, guardarKit, setKitEquipos, borrarKit, revivirKit } from "@/app/actions";
import { estadoKit, resumenKit, NO_ENTREGABLE, agruparPorCombo, valeAgrupar,
  type PiezaKit, type EqBase, type KitVista } from "@/lib/kits";
import PiezasKit from "@/components/PiezasKit";

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
function Escoge({ equipos, sel, alterna }: {
  equipos: EqBase[]; sel: Set<string>; alterna: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState("");
  const vistos = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    if (!ps.length) return equipos;
    return equipos.filter(e => {
      const t = nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""}`);
      return ps.every(p => t.includes(p));
    });
  }, [equipos, filtro]);

  return (
    <>
      <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
        value={filtro} onChange={ev => setFiltro(ev.target.value)}
        style={{ width: "100%", margin: "8px 0" }} />
      <div className="kit-escoge">
        {vistos.length === 0 && <div style={{ padding: 10, color: "var(--dim)", fontSize: 13 }}>Nada coincide.</div>}
        {/* Agrupado por combo también AQUÍ, y no solo en la lista pintada.
            Armar un kit es justamente el momento en que importa: «de la
            compra del dron entra todo menos el cargador» se marca de un
            vistazo, y con doscientos equipos en fila plana no se ve.
            Misma función que la otra lista —agruparPorCombo—: dos listas que
            agruparan distinto serían peor que ninguna. */}
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
            {g.items.map(e => (
              <label key={e.id} className="ent-lote-fila">
                <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
                {/* Con foto se arma el kit mirando los equipos; sin ella hay que
                    reconocerlos por el folio, que nadie se sabe de memoria. */}
                <span className="kit-pz-img">
                  {e.cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.cartel} alt="" referrerPolicy="no-referrer" />
                    : <span>🎥</span>}
                </span>
                {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                {/* Un equipo en reparación SÍ puede formar parte del kit: el kit
                    dice qué lo compone, no qué está libre hoy. Lo que cambia es
                    que al entregar se avisará de que falta. */}
                {NO_ENTREGABLE[e.estado || ""] && <span className="kit-aviso">{NO_ENTREGABLE[e.estado || ""]}</span>}
                {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
              </label>
            ))}
          </Fragment>
        ))}
      </div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 6 }}>{sel.size} seleccionado(s)</div>
    </>
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

      <Escoge equipos={equipos} sel={sel} alterna={alterna} />

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
  const alternaKit = (id: string) =>
    setDesplegados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const piezasDe = (k: KitVista): PiezaKit[] =>
    k.equipoIds.map(id => porEq.get(id)).filter(Boolean).map((e: any) => ({
      id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado, quien: e.quien,
      cartel: e.cartel, combo: e.combo || null, kits: e.kits || [],
    }));

  return (
    <div className="card">
      <button className="panel-plegar" aria-expanded={abierto}
        style={{ color: "var(--violet)" }} onClick={() => setAbierto(!abierto)}>
        <span className="panel-flecha">{abierto ? "▾" : "▸"}</span>
        📦 Kits — lo que sale junto{vivos.length ? ` · ${vivos.length}` : ""}
      </button>

      {abierto && (
        <div style={{ marginTop: 8 }}>
          {editando === "_nuevo"
            ? <Editor kit={null} equipos={equipos} onCerrar={() => setEditando(null)} />
            : <button className="btn btn-ghost" onClick={() => setEditando("_nuevo")}>＋ Nuevo kit</button>}

          {!vivos.length && editando !== "_nuevo" && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>
              Todavía no hay kits. Un kit es lo que sale junto porque junto hace un trabajo —cámara, micro y luz de una entrevista—: al entregar se marcan sus equipos de un clic, y a la vuelta se sabe si volvió entero.
            </div>
          )}

          {vivos.map(k => {
            const e = estadoKit(piezasDe(k));
            const res = resumenKit(e);
            /* `editandoEste` y no `abierto`: aqui dentro habia un `abierto` que
               significaba «se esta editando» y tapaba al del panel exterior.
               Dos cosas distintas con el mismo nombre en el mismo archivo es
               el tipo de detalle que se lee bien y se entiende mal. */
            const editandoEste = editando === k.id;
            const desplegado = desplegados.has(k.id);
            const piezas = [...e.libres, ...e.prestadas, ...e.vetadas];
            return (
              <div key={k.id} className={`kit-caja${editandoEste ? " editando" : ""}`}>
                <div className="kit-h">
                  <button className="kit-plegar" aria-expanded={desplegado}
                    onClick={() => alternaKit(k.id)}
                    title={desplegado ? "Ocultar las piezas" : `Ver las ${piezas.length} piezas de «${k.nombre}»`}>
                    <span className="panel-flecha">{desplegado ? "▾" : "▸"}</span>
                    <b style={{ fontSize: 13.5 }}>📦 {k.nombre}</b>
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

                {k.descripcion && <div className="kit-desc">{k.descripcion}</div>}

                {desplegado && <PiezasKit piezas={piezas} kitActual={k.id} />}

                {editandoEste && <Editor kit={k} equipos={equipos} onCerrar={() => setEditando(null)} />}
              </div>
            );
          })}

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
