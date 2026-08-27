"use client";
import Avatar from "@/components/Avatar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import {
  guardarMovCaja, borrarMovCaja, guardarCuentaCaja, activarCuentaCaja,
  fijarSaldoInicial, guardarCaja, archivarCaja,
} from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { olvidarZocalo } from "@/lib/zocalo";
import { money, ICO_CAJA, porCuenta, totales, type CajaMin, type CuentaMin } from "@/lib/caja";
import { suenoDeCaja, COLOR_SUENO } from "@/lib/cajaDormida";
import { hoyLima, diaLima } from "@/lib/fechas";
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
  quien?: { nombre: string | null; avatar_url?: string | null; color?: string | null } | null;
  /** Cuándo se APUNTÓ en CrewHub. Distinto de `fecha`, que es cuándo se movió
   *  la plata: un gasto del 14 apuntado el 20 no es lo mismo. */
  creado_en?: string | null;
  /** Quién lo apuntó, para cruzarlo con el alias corto. */
  creado_por?: string | null;
  nComentarios?: number;
  reacciones?: Reaccion[];
};

const dmy = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export default function CajaPanel({
  cajas, cuentas, movs, proyectos, saldos, esAdmin, userId, alias, mesNombre, pulsos, hoy,
}: {
  cajas: (CajaMin & { fecha_inicio: string | null; activa: boolean })[];
  cuentas: (CuentaMin & { activa: boolean })[];
  movs: Mov[];
  proyectos: { id: string; nombre: string }[];
  saldos: { id: string; saldo: number }[];
  esAdmin: boolean;
  /** Para saber cuál de las reacciones es la mía y poder quitarla. */
  userId: string;
  /** cuenta → alias corto («JohnO»). El nombre largo de `perfiles` no cabe en
   *  una fila y además no es como se llaman entre ellos. Sin alias cargado se
   *  cae al nombre: mejor largo que vacío. */
  alias?: Record<string, string>;
  /** «agosto». Solo para rotular el desglose; el panel no decide el mes. */
  mesNombre?: string;
  /** Última vez que alguien APUNTÓ en cada caja. `undefined` en `ultimoApunte`
   *  quiere decir «no se pudo averiguar», y entonces no se pinta ningún aviso:
   *  ver lib/cajaDormida.ts. */
  pulsos?: { id: string; ultimoApunte?: string | null }[];
  /** El día de hoy, según el SERVIDOR. Va como dato y no se calcula aquí: el
   *  reloj del navegador puede ir desviado, y una pestaña abierta desde ayer
   *  cruza la medianoche sin enterarse. Con dos relojes distintos, el chip y
   *  la burbuja del menú discreparían justo en los umbrales de 3 y 6 días. */
  hoy?: string;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [ocupado, setOcupado] = useState(false);
  const [verCuentas, setVerCuentas] = useState(false);
  /* Qué caja se está mirando. Vacío = todas. Ver el comentario del filtro, más
     abajo: es una forma de mirar, no un sitio al que se llega, y por eso vive
     aquí y no en la URL. */
  const [verCaja, setVerCaja] = useState("");
  const movsVistos = verCaja ? movs.filter(m => m.caja_id === verCaja) : movs;
  const cajaVista = verCaja ? cajas.find(c => c.id === verCaja) : null;
  /* El desglose se calcula sobre lo que se está viendo, no sobre el mes entero:
     si arriba dice «BCP Oficina», las barras tienen que ser de BCP Oficina.
     Los porcentajes salen de los totales de ESOS mismos movimientos —si no, un
     gasto pequeño de una caja pequeña se leería como una miseria del total. */
  const desglose = porCuenta(movsVistos, cuentas);
  const tv = totales(movsVistos, cuentas);
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
  /* Cuándo se apuntó por última vez en cada caja. Si la página no lo mandó
     —falta la migración de la vista— el mapa está vacío y `suenoDeCaja`
     recibe `undefined`: no se pinta nada, en vez de pintar todo en rojo. */
  const pulsoDe = new Map((pulsos || []).map(p => [p.id, p.ultimoApunte]));

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
    /* ── Y QUE EL MENÚ SE ENTERE ──
       El zócalo está cacheado por ruta, así que sin esto la burbuja de «cajas
       dormidas» seguiría marcando la caja que se acaba de despertar, en la
       misma pantalla donde el chip ya desapareció. Dos números del mismo dato
       discrepando delante de quien acaba de arreglarlo. */
    olvidarZocalo();
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
    if (r?.error) { avisar(r.error); return; }
    /* Borrar el último apunte de una caja la devuelve a dormida, así que el
       menú también se queda viejo por aquí. */
    olvidarZocalo();
    router.refresh();
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
                      /* Una caja archivada deja de vigilarse: el contador del
                         menú cambia aunque no se haya apuntado nada. */
                      olvidarZocalo();
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
              {/* ── ¿ESTÁ DORMIDA? ──
                  Una caja no se descuadra de golpe: se descuadra porque nadie
                  apuntó durante dos semanas y luego ya nadie se acuerda de qué
                  fue ese retiro de S/ 80. El saldo de arriba no lo delata —se
                  ve perfecto, solo que es mentira—; el silencio sí.
                  Va debajo del saldo y no encima: primero el número que se
                  viene a buscar, después la duda sobre él. */}
              {(() => {
                /* Una caja que no viene en `pulsos` es «no lo sé», no «no
                   tiene movimientos»: la vista devuelve una fila por caja, así
                   que una ausencia es un fallo, y adivinar en la dirección
                   contraria pintaría «sin estrenar» sobre una caja con
                   historial. */
                const z = suenoDeCaja({ id: c.id, activa: c.activa,
                  ultimoApunte: pulsoDe.has(c.id) ? pulsoDe.get(c.id) : undefined },
                  hoy || undefined);
                if (z.situacion === "viva" || z.situacion === "ignorada" || z.situacion === "sin_saber")
                  return null;
                const rojo = z.situacion === "roja";
                const color = COLOR_SUENO[z.situacion];
                return (
                  <div className="caja-sueno" style={{ color, borderColor: color }}
                    title={z.situacion === "sin_estrenar"
                      ? "Esta caja no tiene ni un movimiento apuntado todavía."
                      : "Se cuentan días hábiles desde el último apunte. Sábados y domingos no cuentan."}>
                    <span className="caja-sueno-pt" style={{ background: color }} />
                    {z.situacion === "sin_estrenar" ? "sin estrenar" : z.motivo}
                    {rojo && <b> · revísala</b>}
                  </div>
                );
              })()}

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
      {/* ── VER UNA CAJA SOLA ──
          Las tres cajas —PachaApus+, Efectivo, BCP Oficina— viven en la misma
          lista, y cuadrar una contra su extracto obligaba a leer la columna de
          la izquierda saltándose dos de cada tres filas. Es justo lo que se
          hace al cerrar el mes.
          Es un filtro de VISTA, no de la consulta: los datos del mes ya están
          aquí, así que filtrar en el cliente responde al instante y no pide
          otro viaje. Por eso tampoco va en la URL — no es un sitio al que se
          llegue, es una forma de mirar lo que ya tienes delante.
          Los totales de arriba NO se tocan: son del mes entero, y hacer que
          cambiaran con el filtro sería fácil de leer como «esto es todo lo que
          hay». */}
      {cajas.length > 1 && movs.length > 0 && (
        <div className="tv-vistas" style={{ margin: "12px 0 8px" }}>
          <button className={`vtab${!verCaja ? " on" : ""}`} onClick={() => setVerCaja("")}>
            Todas <b style={{ color: "var(--dim)", marginLeft: 4 }}>{movs.length}</b>
          </button>
          {cajas.map(c => {
            /* El número de cada caja se cuenta aquí y no en el servidor: una
               caja con 0 movimientos este mes tiene que poder verse —es un
               dato— y no desaparecer del filtro. */
            const n = movs.filter(m => m.caja_id === c.id).length;
            return (
              <button key={c.id} className={`vtab${verCaja === c.id ? " on" : ""}${n === 0 ? " fila-tenue" : ""}`}
                onClick={() => setVerCaja(c.id)}
                title={n === 0 ? `${c.nombre} — sin movimientos este mes` : c.nombre}>
                {c.nombre} <b style={{ color: "var(--dim)", marginLeft: 4 }}>{n}</b>
              </button>
            );
          })}
        </div>
      )}

      {movs.length === 0 ? (
        <div className="empty">Sin movimientos este mes.</div>
      ) : movsVistos.length === 0 ? (
        /* Filtrando y sin resultados: se dice CUÁL es el filtro que lo vació.
           Un «sin movimientos» a secas aquí haría pensar que el mes está
           vacío, cuando lo que pasa es que esa caja no se movió. */
        <div className="empty">
          {cajas.find(c => c.id === verCaja)?.nombre || "Esa caja"} no tuvo movimientos este mes.
          {" "}<button className="lnk" onClick={() => setVerCaja("")}>Ver todas</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {movsVistos.map(m => {
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
                {/* ── LA DESCRIPCIÓN SE QUEDA CON TODO EL HUECO ──
                    Aquí había DOS elementos con `flex:1` —esta y un separador
                    vacío— así que el espacio sobrante se repartía a medias y la
                    descripción se cortaba en «Transf Puente de P…» teniendo
                    media fila libre al lado. Quitado el separador, lo que empuja
                    a la derecha son los anchos fijos de lo que viene después,
                    que es como debía ser desde el principio.
                    Se pinta siempre, vacía o no: sin ella la fila colapsaría
                    hacia la izquierda y las columnas de la derecha dejarían de
                    coincidir entre filas. */}
                <span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.descripcion || ""}
                </span>
                {/* El proyecto, con ancho propio: está vacío en la mayoría de
                    las filas, y sin ancho fijo lo de su derecha bailaría según
                    quién tenga proyecto y quién no. */}
                <span className="caja-proy" title={m.proy?.nombre || undefined}>
                  {m.proy?.nombre ? <>🎬 {m.proy.nombre}</> : ""}
                </span>

                {/* El signo delante, no solo el color: en una lista larga el
                    color se lee mal y en gris —los traspasos— no dice nada.
                    A la derecha y con ancho fijo, porque los importes se
                    comparan en vertical: alineados por la izquierda, un 4,290
                    y un 30 no se pueden leer de un vistazo. */}
                <span className="caja-monto" style={{ color: col }}>
                  {traspasoM ? "⇄ " : flujo === "ingreso" ? "+ " : flujo === "egreso" ? "− " : "? "}
                  {money(m.monto)}
                </span>
                {/* ── LA ZONA DE ACCIONES, EN UNA REJILLA ──
                    Antes eran anchos adivinados a ojo, y el 26 px del
                    comprobante se quedó corto: el botón de dentro mide más y se
                    metía en el hueco de las reacciones. Adivinar un ancho es
                    apostar a que el contenido no crezca, y el contenido siempre
                    crece.
                    Con `grid` las columnas las declara el contenedor y NADA
                    puede desbordarse a la de al lado: cada icono se centra en su
                    celda, esté vacía o llena, y todas las filas cortan por los
                    mismos cinco puntos.
                    `minmax(0,…)` en cada columna: sin él, un contenido ancho
                    ensancharía su celda —el defecto de grid es `auto`— y
                    volveríamos justo al problema de partida.
                    Y la rejilla sola no bastaba: la celda de reacciones acotaba
                    el ancho, pero dentro `.rx` envuelve, así que el ＋ se caía a
                    un segundo renglón y estiraba la fila HACIA ABAJO. Se
                    arregló donde estaba el fallo —sin envolver y con el
                    contenido acotado a dos chips, en Reacciones.tsx—, y aquí el
                    hueco se dio del tamaño que eso necesita en vez de adivinarlo
                    otra vez. */}
                <span style={{
                  display: "grid", flex: "none", alignItems: "center", justifyItems: "center",
                  /* El autor entra como columna de ESTA rejilla —la segunda,
                     detrás del comprobante— y no como un `span` suelto antes
                     del monto. Es la diferencia entre «alineado casi siempre» y
                     alineado: un `span` con ancho fijo se alinea mientras nada
                     de su izquierda crezca, y aquí lo de la izquierda es una
                     descripción de longitud libre. En la rejilla, las columnas
                     las declara el contenedor y todas las filas cortan por los
                     mismos puntos, pase lo que pase antes. */
                  gridTemplateColumns: esAdmin
                    ? "minmax(0,34px) minmax(0,150px) minmax(0,104px) minmax(0,46px) minmax(0,28px) minmax(0,24px)"
                    : "minmax(0,34px) minmax(0,150px) minmax(0,104px) minmax(0,46px)",
                  gap: 4,
                }}>
                  {/* Encima, no en otra pestaña: comprobar que la captura es la
                      correcta es una mirada de dos segundos, y salir de la lista
                      para eso obliga a volver y buscar dónde se estaba. */}
                  {m.url
                    ? <VerAdjunto url={m.url} titulo="Ver el recibo" />
                    : <span style={{ color: "var(--dim)", opacity: .3, fontSize: 11 }}
                        title="Sin comprobante">·</span>}

                  {/* Quién lo apuntó y cuándo. En una caja que llevan varias
                      manos es la primera pregunta cuando un movimiento no se
                      entiende: no «¿qué es esto?» sino «¿a quién le pregunto
                      qué es esto?». Con cara, porque son cuatro personas y se
                      reconocen antes por la foto que leyendo el nombre.
                      La celda se pinta SIEMPRE, con o sin autor: vacía deja su
                      hueco y las columnas de la derecha no se corren. */}
                  <span className="caja-quien">
                    {m.quien?.nombre && (
                      <>
                        <Avatar nombre={m.quien.nombre} src={m.quien.avatar_url}
                          color={m.quien.color} size={17} />
                        <span className="caja-quien-n" title={m.quien.nombre || undefined}>
                          {(m.creado_por && alias?.[m.creado_por]) || m.quien.nombre}
                        </span>
                        {m.creado_en && (() => {
                          /* ── ÁMBAR CUANDO SE APUNTÓ OTRO DÍA ──
                             Que el gasto sea del 14 y el apunte del 15 no es un
                             error, pero es lo que explica por qué el saldo no
                             cuadraba el 14. En gris había que comparar las dos
                             fechas a mano, fila por fila; en ámbar salta sola.
                             Tenue a propósito: es un matiz, no una alarma —
                             apuntar al día siguiente es normal. */
                          const apunte = diaLima(m.creado_en!);
                          const otroDia = !!apunte && apunte !== m.fecha;
                          return (
                            <span className={`caja-quien-f${otroDia ? " otro-dia" : ""}`}
                              title={otroDia
                                ? `Apuntado el ${dmy(apunte)}, un día distinto del movimiento (${dmy(m.fecha)}). No es un error: solo explica por qué el saldo de ese día podía no cuadrar todavía.`
                                : `Apuntado el mismo día del movimiento, ${dmy(apunte)}.`}>
                              {dmy(apunte)}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </span>

                  {/* Reaccionar SIN abrir nada. Un 👀 es «lo vi, está bien», y
                      es lo que más se hace al revisar la caja: si cuesta tres
                      clics no se hace, y el acuse de revisión —que es el dato—
                      se pierde. */}
                  <Reacciones pubId={null} movCajaId={m.id} compacto
                    reacciones={m.reacciones || []} userId={userId} />

                  {/* ── HABLAR DE ESTE APUNTE ──
                      Se abre encima, sin salir de la lista: la pregunta «¿esto
                      qué fue?» hoy se hace por WhatsApp y la respuesta no vuelve
                      nunca al movimiento, que es donde hará falta dentro de tres
                      meses. El contador se ve siempre —sin él, una conversación
                      de cuatro mensajes es invisible— y el botón está para
                      TODOS, no solo para administración: quien pregunta es
                      justamente quien no lleva la caja. */}
                  <VistaMovCaja movId={m.id}>
                    {(abrir) => (
                      <button className="dato-btn" onClick={abrir}
                        title={m.nComentarios ? `${m.nComentarios} comentario(s)` : "Preguntar sobre este movimiento"}
                        style={{ color: m.nComentarios ? "var(--accent)" : undefined,
                          opacity: m.nComentarios ? 1 : .5, whiteSpace: "nowrap" }}>
                        💬{m.nComentarios ? ` ${m.nComentarios}` : ""}
                      </button>
                    )}
                  </VistaMovCaja>

                  {esAdmin && (
                    <button className="dato-btn" onClick={() => editar(m)} disabled={ocupado}
                      title="Corregir este movimiento">✎</button>
                  )}
                  {esAdmin && (
                    <button onClick={() => quitar(m)} disabled={ocupado} title="Borrar"
                      style={{ background: "none", border: "none", color: "var(--red)",
                        cursor: "pointer", fontSize: 12 }}>✕</button>
                  )}
                </span>
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
                  if (r?.error) { avisar(r.error); return; }
                  /* Devolverla al uso la vuelve a poner bajo vigilancia, y si
                     lleva meses parada aparece dormida en el acto. */
                  olvidarZocalo();
                  router.refresh();
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
      {/* ── EN QUÉ SE FUE ──
          La pregunta del mes no es «cuánto gasté» sino «en qué». Va al final
          porque se consulta al cerrar el mes, no al apuntar.
          Estaba en la página (servidor) y por eso no oía el filtro de caja;
          ahora vive aquí, junto a los movimientos que enseña. */}
      {desglose.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "22px 0 8px", letterSpacing: .5 }}>
            📊 Por cuenta{mesNombre ? ` · ${mesNombre}` : ""}
            {/* El rótulo dice de qué es la cifra. Un porcentaje sin decir sobre
                qué se calculó es la forma más fácil de mentir sin querer. */}
            {cajaVista && (
              <span style={{ color: "var(--muted)" }}> · solo {cajaVista.nombre}</span>
            )}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {desglose.map(c => {
              const tot = c.flujo === "ingreso" ? tv.ingresos : tv.egresos;
              const pct = tot > 0 ? Math.round((c.total / tot) * 100) : 0;
              return (
                <div key={c.id} className="info-row" style={{ gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: c.flujo === "ingreso" ? "var(--green)" : "var(--red)" }}>
                    {c.flujo === "ingreso" ? "↑" : "↓"}
                  </span>
                  <span style={{ fontWeight: 600, minWidth: 170 }}>{c.nombre}</span>
                  <span style={{ flex: 1, height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${pct}%`, height: "100%",
                      background: c.flujo === "ingreso" ? "var(--green)" : "var(--red)" }} />
                  </span>
                  <span style={{ color: "var(--dim)", fontSize: 11 }}>{pct}%</span>
                  <span style={{ fontWeight: 700, color: "var(--muted)", minWidth: 90, textAlign: "right" }}>
                    {money(c.total)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Los totales de la franja de arriba siguen siendo del mes entero, a
              propósito. Si el filtro está puesto, decirlo evita que alguien
              compare las dos cifras y crea que una de las dos está mal. */}
          {cajaVista && (
            <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "8px 0 0" }}>
              Estas barras son solo de {cajaVista.nombre}. El resumen de arriba sigue siendo de todas las cajas.
            </p>
          )}
        </>
      )}
    </>
  );
}
