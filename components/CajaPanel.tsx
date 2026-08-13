"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  guardarMovCaja, borrarMovCaja, guardarCuentaCaja, activarCuentaCaja,
  fijarSaldoInicial, guardarCaja, archivarCaja,
} from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { money, ICO_CAJA, type CajaMin, type CuentaMin } from "@/lib/caja";
import { hoyLima } from "@/lib/fechas";
import CampoAdjunto from "@/components/CampoAdjunto";
import VerAdjunto from "@/components/VerAdjunto";
import VistaMovCaja from "@/components/VistaMovCaja";
import Reacciones, { type Reaccion } from "@/components/Reacciones";

/* ── LA CAJA, LADO PANTALLA ──
 *
 * Todo lo de aquí está subordinado a una cosa: que apuntar un gasto cueste
 * diez segundos. Por eso el formulario está SIEMPRE abierto arriba —no detrás
 * de un botón «＋ nuevo»—, con la fecha de hoy puesta y el foco donde toca. Un
 * clic de más, repetido veinte veces al mes, es la diferencia entre un cuaderno
 * que se llena y uno que se abandona.
 */

type Mov = {
  id: string; caja_id: string; fecha: string; monto: number;
  cuenta_id: string | null; caja_destino: string | null;
  descripcion: string | null; url: string | null;
  proyecto_id: string | null;
  proy?: { nombre: string | null } | null;
  quien?: { nombre: string | null } | null;
  nComentarios?: number;
  reacciones?: Reaccion[];
};

const dmy = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export default function CajaPanel({
  cajas, cuentas, movs, proyectos, saldos, esAdmin, userId,
}: {
  cajas: (CajaMin & { fecha_inicio: string | null; activa: boolean })[];
  cuentas: (CuentaMin & { activa: boolean })[];
  movs: Mov[];
  proyectos: { id: string; nombre: string }[];
  saldos: { id: string; saldo: number }[];
  esAdmin: boolean;
  /** Para saber cuál de las reacciones es la mía y poder quitarla. */
  userId: string;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [ocupado, setOcupado] = useState(false);
  const [verCuentas, setVerCuentas] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState({ nombre: "", flujo: "egreso" });
  /* Renombrar una cuenta se hace sobre su propia fila. «Ingresos por Mujeres
     Ande» se escribe mal una vez y queda escrito así en cada movimiento que la
     use — y hasta ahora la única salida era apagarla y crear otra, que parte el
     histórico en dos categorías que son la misma. */
  const [editCuenta, setEditCuenta] = useState<string | null>(null);
  const [cuentaEd, setCuentaEd] = useState({ nombre: "", flujo: "egreso" });
  const [editSaldo, setEditSaldo] = useState<string | null>(null);
  const [saldoIni, setSaldoIni] = useState({ monto: "", desde: hoyLima() });
  /* Renombrar una caja se hace SOBRE su tarjeta, no en un panel aparte: el
     nombre que hay que cambiar es el que se está mirando. */
  const [editCaja, setEditCaja] = useState<string | null>(null);
  const [nombreCaja2, setNombreCaja2] = useState("");
  const [nuevaCaja, setNuevaCaja] = useState({ nombre: "", tipo: "efectivo" });
  const [creandoCaja, setCreandoCaja] = useState(false);

  const activas = cuentas.filter(c => c.activa);
  /* Las archivadas siguen en `cajas` para poder nombrar sus movimientos viejos,
     pero no se ofrecen al apuntar ni llevan tarjeta: eso es lo que significa
     archivar. */
  const cajasVivas = cajas.filter(c => c.activa);
  const archivadas = cajas.filter(c => !c.activa);
  const cajaDefecto = cajasVivas[0]?.id || "";

  const vacio = {
    id: null as string | null,
    cajaId: cajaDefecto, fecha: hoyLima(), monto: "",
    cuentaId: "", cajaDestino: "", descripcion: "", proyectoId: "", url: "",
  };
  const [f, setF] = useState(vacio);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  /* El traspaso es un MODO del formulario, no otro formulario: son los mismos
     campos salvo que en vez de cuenta se elige caja destino. Dos formularios
     habrían duplicado la fecha, el monto y la descripción. */
  const [traspaso, setTraspaso] = useState(false);

  const nombreCuenta = new Map(cuentas.map(c => [c.id, c.nombre]));
  const flujoCuenta = new Map(cuentas.map(c => [c.id, c.flujo]));
  const nombreCaja = new Map(cajas.map(c => [c.id, c.nombre]));
  const saldoDe = new Map(saldos.map(s => [s.id, s.saldo]));

  const guardar = async () => {
    if (ocupado) return;
    avisar(""); setOcupado(true);
    const r: any = await guardarMovCaja({
      ...f,
      traspaso,
      cuentaId: traspaso ? "" : f.cuentaId,
      cajaDestino: traspaso ? f.cajaDestino : "",
    });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    /* Se conserva la caja y la fecha: al apuntar los gastos de una salida se
       cargan cinco seguidos del mismo día y de la misma caja, y volver a
       elegirlos cada vez es la fricción que hace abandonar el cuaderno. */
    setF({ ...vacio, cajaId: f.cajaId, fecha: f.fecha });
    /* El modo traspaso NO se conserva: es la excepción, no la rutina, y dejarlo
       marcado hacía que el siguiente apunte normal fallara pidiendo una caja
       destino que nadie quería poner. */
    setTraspaso(false);
    router.refresh();
  };

  /* ── CORREGIR UN APUNTE ──
     Antes solo se podía borrar y rehacer, y eso es peor de lo que parece: un
     monto mal tecleado obligaba a volver a elegir caja, cuenta, fecha,
     descripción y a subir otra vez el comprobante — y de paso rompía el rastro,
     porque el apunte viejo desaparecía en vez de corregirse.
     El formulario es el mismo: cambia de «Apuntar» a «Guardar» y ya. Un segundo
     formulario de edición habría duplicado los ocho campos. */
  const editar = (m: Mov) => {
    const esTr = !!m.caja_destino;
    setTraspaso(esTr);
    setF({
      id: m.id,
      cajaId: m.caja_id,
      fecha: m.fecha,
      monto: String(m.monto),
      cuentaId: m.cuenta_id || "",
      cajaDestino: m.caja_destino || "",
      descripcion: m.descripcion || "",
      proyectoId: m.proyecto_id || "",
      url: m.url || "",
    });
    avisar("");
    /* Sube al formulario: en un mes con cuarenta movimientos, pulsar ✎ en el
       último dejaba el formulario fuera de la pantalla y parecía que el botón
       no había hecho nada. */
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const quitar = async (m: Mov) => {
    if (!(await pedir(
      <>Se quitará el movimiento de <b>{money(m.monto)}</b>{m.descripcion ? <> — {m.descripcion}</> : null}.</>,
      { titulo: "Borrar movimiento", aceptar: "Borrar", peligro: true }))) return;
    avisar(""); setOcupado(true);
    const r: any = await borrarMovCaja(m.id);
    setOcupado(false);
    if (r?.error) avisar(r.error); else router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  return (
    <>
      {dialogo}{aviso}

      {/* ── LOS SALDOS ──
          Arriba y grandes porque es lo que se viene a mirar. El de efectivo se
          contrasta con el sobre; el del banco, con la app. Si no cuadran, el
          descuadre está en lo apuntado — y esa comparación es todo el valor de
          llevar las dos cajas por separado. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {cajasVivas.map(c => {
          const s = saldoDe.get(c.id) ?? 0;
          return (
            <div key={c.id} className="card" style={{ flex: "1 1 210px", minWidth: 190 }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1,
                color: "var(--dim)", display: "flex", gap: 5, alignItems: "center" }}>
                <span>{ICO_CAJA[c.tipo] || "📦"} {c.nombre}</span>
                {esAdmin && editCaja !== c.id && (
                  <button className="dato-btn" style={{ fontSize: 10 }} title="Renombrar o archivar"
                    onClick={() => { setEditCaja(c.id); setNombreCaja2(c.nombre); }}>✎</button>
                )}
              </div>
              {/* «Banco» se vuelve «Banco BCP Oficina» en cuanto aparece la
                  segunda cuenta, y un saldo que no dice de qué cuenta es no se
                  puede contrastar con nada. */}
              {editCaja === c.id && esAdmin && (
                <div style={{ display: "flex", gap: 5, margin: "5px 0", flexWrap: "wrap" }}>
                  <input value={nombreCaja2} onChange={e => setNombreCaja2(e.target.value)}
                    placeholder="Nombre de la caja" style={{ ...inp, flex: 1, minWidth: 130 }} />
                  <button className="btn" style={{ fontSize: 12, padding: "5px 11px" }}
                    disabled={ocupado || !nombreCaja2.trim()}
                    onClick={async () => {
                      avisar(""); setOcupado(true);
                      const r: any = await guardarCaja({ id: c.id, nombre: nombreCaja2 });
                      setOcupado(false);
                      if (r?.error) { avisar(r.error); return; }
                      setEditCaja(null); router.refresh();
                    }}>Guardar</button>
                  {/* Archivar, no borrar: una caja con movimientos detrás tiene
                      historia, y la base además lo impide. Archivada deja de
                      ofrecerse al apuntar; sus movimientos siguen contando. */}
                  <button className="dato-btn" disabled={ocupado}
                    title="Dejar de usarla. Sus movimientos se quedan."
                    onClick={async () => {
                      if (!(await pedir(
                        <>Se archivará <b>{c.nombre}</b>. Deja de ofrecerse al apuntar y su
                        tarjeta desaparece{Math.abs(s) > 0.005
                          ? <> — pero todavía tiene <b>{money(s)}</b>. Si esa plata se movió a
                            otra caja, apúntalo como traspaso antes de archivarla.</>
                          : <>.</>}</>,
                        { titulo: "Archivar caja", aceptar: "Archivar", peligro: true }))) return;
                      avisar(""); setOcupado(true);
                      const r: any = await archivarCaja(c.id, false);
                      setOcupado(false);
                      if (r?.error) { avisar(r.error); return; }
                      setEditCaja(null); router.refresh();
                    }}>archivar</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setEditCaja(null)}>Cancelar</button>
                </div>
              )}
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2,
                color: s < 0 ? "var(--red)" : "var(--teal)" }}>
                {money(s)}
              </div>
              {/* Sin fecha de inicio el número de arriba NO es el dinero que
                  hay: es la suma de lo apuntado. Decirlo evita que se lea como
                  un saldo real y se cierre la caja contra él.
                  Y el botón está SIEMPRE, no solo cuando falta: escondiéndolo
                  tras el aviso, un 12500 tecleado en vez de 1250 solo se podía
                  arreglar por SQL — la puerta desaparecía justo después de
                  usarla mal. */}
              <div style={{ fontSize: 11, marginTop: 3,
                color: c.fecha_inicio ? "var(--dim)" : "var(--yellow)" }}>
                {c.fecha_inicio
                  ? <>desde {c.fecha_inicio} había {money(Number(c.saldo_inicial) || 0)}</>
                  : <>sin saldo inicial — esto es solo lo apuntado</>}
                {esAdmin && (
                  <button className="dato-btn" style={{ marginLeft: 5, fontSize: 11 }}
                    onClick={() => {
                      setEditSaldo(editSaldo === c.id ? null : c.id);
                      setSaldoIni({
                        monto: c.saldo_inicial ? String(c.saldo_inicial) : "",
                        desde: c.fecha_inicio || hoyLima(),
                      });
                    }}>✎</button>
                )}
              </div>
              {editSaldo === c.id && esAdmin && (
                <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                  <input value={saldoIni.monto} onChange={e => setSaldoIni({ ...saldoIni, monto: e.target.value })}
                    placeholder="¿cuánto había?" inputMode="decimal" style={{ ...inp, width: 130 }} />
                  <input type="date" value={saldoIni.desde}
                    onChange={e => setSaldoIni({ ...saldoIni, desde: e.target.value })}
                    title="El día en que contaste ese dinero. Lo anterior a esta fecha ya está dentro y no se vuelve a sumar."
                    style={{ ...inp, width: 140 }} />
                  <button className="btn" style={{ fontSize: 12, padding: "5px 11px" }} disabled={ocupado}
                    onClick={async () => {
                      avisar(""); setOcupado(true);
                      const r: any = await fijarSaldoInicial(c.id, saldoIni.monto, saldoIni.desde);
                      setOcupado(false);
                      if (r?.error) { avisar(r.error); return; }
                      setEditSaldo(null); router.refresh();
                    }}>Guardar</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setEditSaldo(null)}>Cancelar</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Crear una caja, al final de la fila y con la misma forma que las
            demás: es una más, no una operación de configuración escondida. */}
        {esAdmin && (
          <div className="card" style={{ flex: "0 1 210px", minWidth: 190,
            borderStyle: creandoCaja ? "solid" : "dashed", opacity: creandoCaja ? 1 : .75 }}>
            {creandoCaja ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <input value={nuevaCaja.nombre} autoFocus
                  onChange={e => setNuevaCaja({ ...nuevaCaja, nombre: e.target.value })}
                  placeholder="Ej. Banco BCP Oficina" style={inp} />
                <select value={nuevaCaja.tipo}
                  onChange={e => setNuevaCaja({ ...nuevaCaja, tipo: e.target.value })}
                  title="Solo decide el ícono" style={inp}>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="banco">🏦 Banco</option>
                  <option value="otro">📦 Otro</option>
                </select>
                <div style={{ display: "flex", gap: 5 }}>
                  <button className="btn" style={{ fontSize: 12, padding: "5px 11px" }}
                    disabled={ocupado || !nuevaCaja.nombre.trim()}
                    onClick={async () => {
                      avisar(""); setOcupado(true);
                      const r: any = await guardarCaja(nuevaCaja);
                      setOcupado(false);
                      if (r?.error) { avisar(r.error); return; }
                      setNuevaCaja({ nombre: "", tipo: "efectivo" });
                      setCreandoCaja(false); router.refresh();
                    }}>Crear</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setCreandoCaja(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setCreandoCaja(true)}
                style={{ background: "none", border: "none", color: "var(--muted)",
                  cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "10px 0" }}>
                ＋ Nueva caja
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── APUNTAR ──
          Siempre desplegado, no detrás de un botón. Es la acción de esta
          pantalla, y esconderla tras un clic es lo que convierte un cuaderno en
          una tarea. */}
      {esAdmin && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Al cambiar el origen se limpia el destino: si el destino era esa
                misma caja, la opción desaparecía de la lista y el select se veía
                vacío con el estado todavía lleno — el error saltaba sobre un
                campo aparentemente en blanco. */}
            <select value={f.cajaId}
              onChange={e => setF({ ...f, cajaId: e.target.value, cajaDestino: "" })}
              style={{ ...inp, width: 130 }}>
              {cajasVivas.map(c => <option key={c.id} value={c.id}>{ICO_CAJA[c.tipo] || "📦"} {c.nombre}</option>)}
            </select>

            {traspaso ? (
              <select value={f.cajaDestino} onChange={e => set("cajaDestino", e.target.value)}
                style={{ ...inp, width: 170 }}>
                <option value="">→ ¿a qué caja?</option>
                {cajasVivas.filter(c => c.id !== f.cajaId).map(c => (
                  <option key={c.id} value={c.id}>→ {c.nombre}</option>
                ))}
              </select>
            ) : (
              <select value={f.cuentaId} onChange={e => set("cuentaId", e.target.value)}
                style={{ ...inp, width: 210 }}>
                <option value="">— cuenta —</option>
                <optgroup label="Ingresos">
                  {activas.filter(c => c.flujo === "ingreso").map(c => (
                    <option key={c.id} value={c.id}>↑ {c.nombre}</option>
                  ))}
                </optgroup>
                <optgroup label="Egresos">
                  {activas.filter(c => c.flujo === "egreso").map(c => (
                    <option key={c.id} value={c.id}>↓ {c.nombre}</option>
                  ))}
                </optgroup>
              </select>
            )}

            <input value={f.monto} onChange={e => set("monto", e.target.value)}
              placeholder="Monto S/" inputMode="decimal" style={{ ...inp, width: 110 }} />
            <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)}
              style={{ ...inp, width: 145 }} />
            <input value={f.descripcion} onChange={e => set("descripcion", e.target.value)}
              placeholder="Descripción" style={{ ...inp, flex: 1, minWidth: 160 }} />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            {!traspaso && (
              <select value={f.proyectoId} onChange={e => set("proyectoId", e.target.value)}
                title="La cobertura o proyecto al que pertenece, si pertenece a alguno"
                style={{ ...inp, width: 200 }}>
                <option value="">— sin proyecto —</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            {/* El comprobante se pega, no se enlaza. La mayoría son capturas de
                Yape: obligarlas a pasar por Drive —subir, copiar enlace, volver,
                pegar— es lo que hace que el gasto se apunte sin comprobante, y
                el comprobante es lo que hace que el apunte sirva. */}
            <CampoAdjunto valor={f.url} onCambio={v => set("url", v)}
              placeholder="Comprobante: pega la captura, arrástrala o escribe un enlace" />
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center",
              color: "var(--muted)", fontSize: 12, cursor: "pointer" }}
              title="Mover plata de una caja a otra: ni ingreso ni egreso, la misma plata en otro sitio.">
              <input type="checkbox" checked={traspaso}
                onChange={e => {
                  setTraspaso(e.target.checked);
                  /* También el proyecto: el selector se esconde en modo
                     traspaso, y lo que quedara elegido se habría guardado sin
                     que nadie lo viera. */
                  setF({ ...f, cuentaId: "", cajaDestino: "", proyectoId: "" });
                }} />
              ⇄ traspaso
            </label>
            <button className="btn" disabled={ocupado} style={{ fontSize: 12.5, padding: "7px 16px" }}
              onClick={guardar}>{ocupado ? "…" : f.id ? "Guardar" : "Apuntar"}</button>
            {/* Salir de la edición sin tocar nada. Sin esto, quien pulsa ✎ por
                error solo podía escapar guardando o recargando la página. */}
            {f.id && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { setF({ ...vacio, cajaId: f.cajaId }); setTraspaso(false); avisar(""); }}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── LOS MOVIMIENTOS ── */}
      {movs.length === 0 ? (
        <div className="empty">Sin movimientos este mes.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {movs.map(m => {
            const traspasoM = !!m.caja_destino;
            const flujo = flujoCuenta.get(m.cuenta_id || "");
            /* Sin cuenta reconocible no se pinta como egreso: eso lo escondería
               entre los gastos normales. Ámbar y con «?», que es lo que es. */
            const col = traspasoM ? "var(--muted)"
              : flujo === "ingreso" ? "var(--green)"
              : flujo === "egreso" ? "var(--red)" : "var(--yellow)";
            return (
              /* `id` para que el aviso de un comentario aterrice en la fila
                 (lib/notificaciones.ts → /caja#mov-<id>). El hilo vive en un
                 pop-up, así que no hay dónde anclar el comentario mismo: se
                 ancla a la fila, que es desde donde se abre. */
              <div key={m.id} id={`mov-${m.id}`} className="info-row"
                style={{ gap: 9, flexWrap: "wrap", fontSize: 12.5,
                /* El que se está corrigiendo, señalado: el formulario está
                   arriba y sin esto no se sabe cuál de los cuarenta se cargó. */
                boxShadow: f.id === m.id ? "inset 3px 0 0 var(--accent)" : undefined }}>
                <span style={{ color: "var(--dim)", fontSize: 11.5, minWidth: 52 }}>{dmy(m.fecha)}</span>
                <span className="badge" style={{ fontSize: 10.5, background: "#1c1c2c", color: "var(--muted)" }}>
                  {nombreCaja.get(m.caja_id) || "—"}
                </span>
                <span style={{ fontWeight: 600, minWidth: 150 }}>
                  {traspasoM
                    ? <>⇄ traspaso a {nombreCaja.get(m.caja_destino || "") || "—"}</>
                    : nombreCuenta.get(m.cuenta_id || "") || "sin cuenta"}
                </span>
                {m.descripcion && (
                  <span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1, minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.descripcion}
                  </span>
                )}
                {m.proy?.nombre && (
                  <span style={{ color: "var(--dim)", fontSize: 11 }}>🎬 {m.proy.nombre}</span>
                )}
                {/* Quién lo apuntó. El dato ya venía en la consulta y no se
                    pintaba, y en una caja que llevan varias manos es la primera
                    pregunta cuando un movimiento no se entiende: no «¿qué es
                    esto?» sino «¿a quién le pregunto qué es esto?». */}
                {m.quien?.nombre && (
                  <span style={{ color: "var(--dim)", fontSize: 11 }}
                    title="Quién registró este movimiento">· {m.quien.nombre}</span>
                )}
                <span style={{ flex: 1 }} />
                {/* El signo delante, no solo el color: en una lista larga el
                    color se lee mal y en gris —los traspasos— no dice nada. */}
                <span style={{ color: col, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {traspasoM ? "⇄ " : flujo === "ingreso" ? "+ " : flujo === "egreso" ? "− " : "? "}
                  {money(m.monto)}
                </span>
                {/* ── LA ZONA DE ACCIONES, CON ANCHO FIJO ──
                    Todo lo que va de aquí a la derecha tiene su sitio reservado,
                    tenga contenido o no. Un icono que aparece solo cuando hay
                    comprobante —o cuando hay reacciones— desplaza los botones de
                    esa fila y ninguna corta por el mismo punto: en una tabla, lo
                    que no alinea se lee como un fallo antes de leerse como un
                    dato. */}
                <span style={{ width: 26, flex: "none", textAlign: "center" }}>
                  {/* Encima, no en otra pestaña: comprobar que la captura es la
                      correcta es una mirada de dos segundos, y salir de la lista
                      para eso obliga a volver y buscar dónde se estaba. */}
                  {m.url
                    ? <VerAdjunto url={m.url} titulo="Ver el recibo" />
                    : <span style={{ color: "var(--dim)", opacity: .35, fontSize: 11 }}
                        title="Sin comprobante">·</span>}
                </span>
                {/* Reaccionar SIN abrir nada. Un 👀 es «lo vi, está bien», y
                    es lo que más se hace al revisar la caja: si cuesta tres
                    clics no se hace, y el acuse de revisión —que es el dato—
                    se pierde. En modo compacto el ＋ solo asoma al acercarse:
                    la fila ya tiene nueve cosas compitiendo. */}
                <Reacciones pubId={null} movCajaId={m.id} compacto
                  reacciones={m.reacciones || []} userId={userId} />
                {/* ── HABLAR DE ESTE APUNTE ──
                    Se abre encima, sin salir de la lista: la pregunta «¿esto
                    qué fue?» hoy se hace por WhatsApp y la respuesta no vuelve
                    nunca al movimiento, que es donde hará falta dentro de tres
                    meses. El contador se ve siempre —sin él, una conversación
                    de cuatro mensajes es invisible— y el botón está para TODOS,
                    no solo para administración: quien pregunta es justamente
                    quien no lleva la caja. */}
                <span style={{ width: 40, flex: "none", textAlign: "center" }}>
                  <VistaMovCaja movId={m.id}>
                    {(abrir) => (
                      <button className="dato-btn" onClick={abrir}
                        title={m.nComentarios ? `${m.nComentarios} comentario(s)` : "Preguntar sobre este movimiento"}
                        style={{ color: m.nComentarios ? "var(--accent)" : undefined,
                          opacity: m.nComentarios ? 1 : .5 }}>
                        💬{m.nComentarios ? ` ${m.nComentarios}` : ""}
                      </button>
                    )}
                  </VistaMovCaja>
                </span>
                {esAdmin && (
                  <>
                    <button className="dato-btn" onClick={() => editar(m)} disabled={ocupado}
                      title="Corregir este movimiento">✎</button>
                    <button onClick={() => quitar(m)} disabled={ocupado} title="Borrar"
                      style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Las archivadas, para poder devolverlas. Sin esta línea, archivar una
          caja por error no tenía deshacer desde ninguna pantalla. */}
      {esAdmin && archivadas.length > 0 && (
        <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 10,
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Archivadas:</span>
          {archivadas.map(c => (
            <span key={c.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              {ICO_CAJA[c.tipo] || "📦"} {c.nombre}
              <span style={{ color: "var(--muted)" }}>({money(saldoDe.get(c.id) ?? 0)})</span>
              <button className="dato-btn" style={{ fontSize: 11 }} disabled={ocupado}
                onClick={async () => {
                  avisar(""); setOcupado(true);
                  const r: any = await archivarCaja(c.id, true);
                  setOcupado(false);
                  if (r?.error) avisar(r.error); else router.refresh();
                }}>devolver</button>
            </span>
          ))}
        </div>
      )}

      {/* ── LAS CUENTAS ──
          Plegado: se tocan una vez cada varios meses y no pueden competir con
          el cuaderno, que es lo de todos los días. */}
      {esAdmin && (
        <div style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setVerCuentas(v => !v)}>
            🗂 {activas.length} cuentas <span style={{ color: "var(--dim)" }}>{verCuentas ? "▾" : "▸"}</span>
          </button>
          {verCuentas && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <input value={nuevaCuenta.nombre} onChange={e => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })}
                  placeholder="Nombre de la cuenta" style={{ ...inp, width: 210 }} />
                <select value={nuevaCuenta.flujo} onChange={e => setNuevaCuenta({ ...nuevaCuenta, flujo: e.target.value })}
                  style={{ ...inp, width: 130 }}>
                  <option value="egreso">↓ Egreso</option>
                  <option value="ingreso">↑ Ingreso</option>
                </select>
                <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
                  disabled={ocupado || !nuevaCuenta.nombre.trim()}
                  onClick={async () => {
                    avisar(""); setOcupado(true);
                    const r: any = await guardarCuentaCaja(nuevaCuenta);
                    setOcupado(false);
                    if (r?.error) { avisar(r.error); return; }
                    setNuevaCuenta({ nombre: "", flujo: nuevaCuenta.flujo }); router.refresh();
                  }}>＋ Agregar</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {cuentas.map(c => (
                  <div key={c.id} className="info-row" style={{ gap: 9, fontSize: 12.5,
                    opacity: c.activa ? 1 : .5 }}>
                    {editCuenta === c.id ? (
                      <>
                        <input value={cuentaEd.nombre} autoFocus
                          onChange={e => setCuentaEd({ ...cuentaEd, nombre: e.target.value })}
                          style={{ ...inp, flex: 1, minWidth: 160 }} />
                        {/* El sentido también se puede corregir: una cuenta creada
                            como egreso por error sumaba al lado contrario, y eso
                            no se descubre hasta cuadrar el mes. */}
                        <select value={cuentaEd.flujo}
                          onChange={e => setCuentaEd({ ...cuentaEd, flujo: e.target.value })}
                          style={{ ...inp, width: 120 }}>
                          <option value="egreso">↓ Egreso</option>
                          <option value="ingreso">↑ Ingreso</option>
                        </select>
                        <button className="btn" style={{ fontSize: 12, padding: "5px 11px" }}
                          disabled={ocupado || !cuentaEd.nombre.trim()}
                          onClick={async () => {
                            avisar(""); setOcupado(true);
                            const r: any = await guardarCuentaCaja({ id: c.id, ...cuentaEd });
                            setOcupado(false);
                            if (r?.error) { avisar(r.error); return; }
                            setEditCuenta(null); router.refresh();
                          }}>Guardar</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12 }}
                          onClick={() => setEditCuenta(null)}>Cancelar</button>
                      </>
                    ) : (
                    <>
                    <span style={{ color: c.flujo === "ingreso" ? "var(--green)" : "var(--red)" }}>
                      {c.flujo === "ingreso" ? "↑" : "↓"}
                    </span>
                    <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                    <button className="dato-btn" title="Renombrar o cambiar el sentido"
                      onClick={() => { setEditCuenta(c.id); setCuentaEd({ nombre: c.nombre, flujo: c.flujo }); }}>✎</button>
                    <span style={{ flex: 1 }} />
                    {/* Se apaga, no se borra: una cuenta con movimientos detrás,
                        borrada, obligaría a reasignarlos — falsear el pasado
                        para limpiar una lista. */}
                    <button className="dato-btn" disabled={ocupado}
                      title={c.activa ? "Dejar de ofrecerla al apuntar" : "Volver a ofrecerla"}
                      onClick={async () => {
                        setOcupado(true);
                        const r: any = await activarCuentaCaja(c.id, !c.activa);
                        setOcupado(false);
                        if (r?.error) avisar(r.error); else router.refresh();
                      }}>{c.activa ? "apagar" : "encender"}</button>
                    </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
