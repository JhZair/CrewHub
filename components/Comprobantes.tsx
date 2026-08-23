"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarComprobante, borrarComprobante, fijarEjesRendicion } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { money } from "@/lib/dj";
import { hoyLima } from "@/lib/fechas";
import CampoAdjunto from "@/components/CampoAdjunto";
import VerAdjunto from "@/components/VerAdjunto";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import { AccionesFila, AvisoHilo, idFila } from "@/components/HiloRendicion";
import EjeSelect from "@/components/EjeSelect";
import Avatar from "@/components/Avatar";

/* ── FACTURAS Y BOLETAS DEL FONDO ──
 *
 * La tercera pata de la rendición, y la que faltaba. Sin ella, una factura de
 * proveedor no tenía dónde ir y la salida a mano era meterla como declaración
 * jurada — consumiendo un tope que no le tocaba, y el tope de DJ es lo que
 * obliga a devolver plata si se pasa. Un hueco en el sistema no es solo algo
 * que falta: es una presión para usar mal lo que sí está.
 *
 * A diferencia del bloque de DJ, aquí NO hay saldo ni semáforo. Los
 * comprobantes formales no tienen tope: mientras más gasto se respalde así,
 * mejor. Poner una barra de progreso habría inventado un límite que no existe.
 */

const TIPOS: [string, string][] = [
  ["factura", "Factura"],
  ["boleta", "Boleta"],
  ["recibo_servicio", "Recibo de servicio"],
  ["otro", "Otro"],
];
const rotuloTipo = (t?: string | null) => TIPOS.find(([k]) => k === t)?.[1] || "Comprobante";

type Cmp = {
  sentido?: string | null;
  postulacion_id?: string | null;
  id: string; tipo: string; proveedor: string; ruc: string | null;
  serie: string | null; numero: string | null;
  fecha: string; importe: number; igv: number | null;
  concepto: string | null; etapa: string | null; rubro_item: string | null; url: string | null;
  nComentarios?: number; reacciones?: any[]; caso?: any;
  creado_en?: string | null;
  /** Quién lo registró, para cruzarlo con el alias corto. */
  creado_por?: string | null;
  creado?: { nombre: string | null } | { nombre: string | null }[] | null;
};
type Opcion = { id: string; nombre: string };

/* ── CON AÑO, SIEMPRE ──
   Iba sin él —«5 dic.», «12 abr.»— y en una lista ordenada por fecha eso se
   lee como si fueran del mismo año. Estas ocho facturas van de diciembre de
   2024 a agosto de 2026: sin el año, «5 dic.» y «12 abr.» parecen cuatro meses
   de distancia cuando son dieciséis, y la primera cae ANTES del desembolso del
   fondo mientras la última cae después del plazo. Esa diferencia es justo la
   que decide si un gasto es rendible.
   Dos dígitos porque la columna es estrecha y «24» no se confunde con nada en
   un fondo que dura tres años. */
const dmy = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "2-digit" });

/* PostgREST devuelve la relación como objeto o como arreglo según cómo la
   resuelva. Leer solo una de las dos formas deja la firma en blanco sin que
   nada falle — y un hueco se lee como «nadie lo registró». */
/* El perfil ENTERO de quien lo registró, no solo su nombre: abajo se pinta con
   avatar. PostgREST devuelve la relación como objeto o como array de uno según
   cómo la deduzca, así que se normaliza aquí en vez de en cada uso.
   Si la consulta no pidió el perfil —`select("*")` a secas— esto devuelve null
   igual que si no hubiera autor, y la fila diría «carga directa» sobre algo
   cargado desde el formulario. Por eso las DOS pantallas que usan este bloque
   piden el `creado:perfiles!creado_por(...)`; una mentira tranquila es peor
   que un hueco. */
const autorDe = (c: Cmp): { nombre: string; avatar_url?: string | null; color?: string | null } | null => {
  const p: any = c.creado;
  const u = Array.isArray(p) ? p[0] : p;
  return u?.nombre ? u : null;
};
const cuando = (t?: string | null) => {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "2-digit" });
};
const cuandoLargo = (t?: string | null) => {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });
};

export default function Comprobantes({
  postulacionId, empresaId, comprobantes, etapas, rubros, esAdmin, error, urlSunat, userId, hiloError,
  fondos, alias,
}: {
  /* ── EL MISMO BLOQUE EN DOS SITIOS ──
   * Nació dentro de la rendición de un fondo, con `postulacionId` fijo. Desde
   * que una factura es de la EMPRESA —y el fondo es a lo que se imputa, no su
   * dueño— este bloque también es la pantalla de comprobantes de la empresa.
   * Las dos formas se distinguen por qué prop llega:
   *   · `postulacionId`  → dentro de un fondo. El fondo es fijo y no se elige.
   *   · `empresaId`      → la pantalla de la empresa. El fondo se elige (o no)
   *                        de la lista `fondos`.
   * Un segundo componente habría duplicado el IGV automático, el enlace a
   * SUNAT, el hilo y la validación del RUC — y la copia se habría quedado
   * atrás a la primera corrección. */
  postulacionId?: string | null;
  empresaId?: string | null;
  /** Los fondos de esta empresa, para poder imputar. Solo en la pantalla de
   *  empresa; dentro de un fondo no hay nada que elegir. */
  fondos?: { id: string; nombre: string }[];
  comprobantes: Cmp[];
  etapas: Opcion[]; rubros: { id: string; etiqueta: string; ayuda?: string }[];
  esAdmin: boolean; error?: string | null;
  /** El buscador de SUNAT, administrado en /admin?s=plataformas. Si falta,
   *  BotonFichaSunat usa su propio respaldo. */
  urlSunat?: string;
  /** Para saber cuáles reacciones son mías. */
  userId: string;
  /** Si falta db/rendicion-interaccion.sql. Se dice una vez arriba y la lista
   *  sigue leyéndose: el hilo es un añadido, no el motivo del bloque. */
  hiloError?: string | null;
  /** cuenta → alias corto («JohnO»). `perfiles` guarda el nombre largo, y en el
   *  pie de una factura «John Oros Condori» ocupa media línea sin decir nada
   *  más. Sin alias cargado se cae al nombre: mejor largo que vacío. */
  alias?: Record<string, string>;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const vacio = {
    id: null as string | null, tipo: "factura", proveedor: "", ruc: "",
    serie: "", numero: "", fecha: hoyLima(), importe: "", igv: "",
    concepto: "", etapa: "", rubroItem: "", url: "",
    /* `compra` por defecto: es lo que se registra casi siempre —el IGV
       crédito—. La venta es el caso raro, pero es la que da el débito y sin
       ella el resultado del mes siempre saldría a favor, así que el selector
       tiene que verse, no esconderse tras un «avanzado». */
    sentido: "compra",
    /* A qué fondo se imputa. En la pantalla del fondo no se toca —lo fija la
       prop— y aquí vale como «ninguno», que es lo normal fuera de DAFO. */
    postulacionId: postulacionId || "",
  };
  const [f, setF] = useState(vacio);

  /* ── EL IGV SE PROPONE, NO SE IMPONE ──
   *
   * Aquí decía «el IGV se guarda, no se calcula», y el motivo era bueno: el
   * informe lo pide desglosado y deducirlo de un total redondeado da céntimos
   * que no cuadran con el papel. Pero de esa premisa correcta salía la
   * conclusión equivocada — dejar el campo vacío y que lo haga a mano quien
   * registra. Contrastado contra las seis facturas de PO-003, la fórmula
   * acierta el céntimo impreso en las SEIS. Lo que fallaba no era calcularlo:
   * era calcularlo SIN DEJAR CORREGIRLO.
   *
   * Así que se propone y se puede pisar. En cuanto alguien escribe en el
   * campo, deja de proponerse para siempre en ese comprobante: si el papel
   * dice otra cosa —operación exonerada, boleta de RUS, mixta— manda el papel,
   * y una sugerencia que vuelve sola sobre lo corregido es peor que ninguna.
   *
   * El 18 % va incluido en el total, que es como lo imprime SUNAT: sobre
   * S/ 2,800 el IGV es 2800 × 18/118 = 427.12, no 2800 × 0.18.
   */
  const [igvTocado, setIgvTocado] = useState(false);
  const igvDe = (totalStr: string) => {
    const t = parseFloat(String(totalStr).replace(",", "."));
    if (!isFinite(t) || t <= 0) return "";
    return (Math.round(t * 18 / 118 * 100) / 100).toFixed(2);
  };
  const set = (k: string, v: string) => setF(a => {
    if (k === "igv") { setIgvTocado(true); return { ...a, igv: v }; }
    if (k === "importe" && !igvTocado) return { ...a, importe: v, igv: igvDe(v) };
    /* Quitar el fondo se lleva su clasificación. Etapa y rubro solo existen
       dentro de un fondo; si se eligen y luego se vuelve a «ninguno», los
       campos desaparecen de la pantalla pero SEGUÍAN en el formulario y se
       guardaban — una factura propia de la empresa quedaba etiquetada como si
       se rindiera, y esa etiqueta luego reparte presupuesto que nadie pidió. */
    if (k === "postulacionId" && !v) return { ...a, postulacionId: "", etapa: "", rubroItem: "" };
    return { ...a, [k]: v };
  });

  const total = comprobantes.reduce((s, c) => s + Number(c.importe || 0), 0);
  const sinPdf = comprobantes.filter(c => !c.url).length;

  const guardar = async () => {
    if (ocupado) return;
    avisar(""); setOcupado(true);
    /* El fondo del formulario solo manda cuando NO estamos dentro de uno: en
       la pantalla de un fondo, la prop es la verdad y el campo ni se enseña. */
    const r: any = await guardarComprobante({
      ...f, empresaId: empresaId || null,
      postulacionId: postulacionId || f.postulacionId || null,
    });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setF(vacio); setIgvTocado(false); setAbierto(false); router.refresh();
  };

  const editar = (c: Cmp) => {
    setF({
      id: c.id, tipo: c.tipo, proveedor: c.proveedor, ruc: c.ruc || "",
      serie: c.serie || "", numero: c.numero || "", fecha: c.fecha,
      importe: String(c.importe), igv: c.igv ? String(c.igv) : "",
      concepto: c.concepto || "", etapa: c.etapa || "", rubroItem: c.rubro_item || "",
      url: c.url || "",
      sentido: (c as any).sentido || "compra",
      /* Al editar se conserva a qué fondo estaba imputado. Antes ni existía
         el campo porque el fondo era inmutable; ahora cambiarlo —o quitarlo—
         es una corrección legítima y no se puede perder al abrir el formulario. */
      postulacionId: postulacionId || (c as any).postulacion_id || "",
    });
    /* Lo que ya está guardado salió del papel. Recalcularlo al abrir para
       editar cambiaría un dato ya verificado por una estimación, en silencio
       y sin que nadie lo pidiera. */
    setIgvTocado(true);
    setAbierto(true);
  };

  const quitar = async (c: Cmp) => {
    if (!(await pedir(
      <>Se quitará el comprobante de <b>{c.proveedor}</b> por {money(c.importe)}.</>,
      { titulo: "Borrar comprobante", aceptar: "Borrar", peligro: true }))) return;
    avisar(""); setOcupado(true);
    const r: any = await borrarComprobante(c.id, postulacionId);
    setOcupado(false);
    if (r?.error) avisar(r.error); else router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  if (error) {
    return (
      <div className="empty" style={{ color: "var(--yellow)" }}>
        {/does not exist|42P01/.test(error)
          ? "Falta correr db/facturas.sql en Supabase."
          : `No se pudieron leer los comprobantes: ${error}`}
      </div>
    );
  }

  return (
    <>
      {dialogo}{aviso}
      <AvisoHilo error={hiloError} />

      <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ color: "var(--teal)", fontWeight: 800, fontSize: 20 }}>{money(total)}</span>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {comprobantes.length} comprobante{comprobantes.length === 1 ? "" : "s"}
        </span>
        {/* El PDF que falta se dice, aunque no bloquee: un comprobante sin
            escanear cuenta en el ejecutado pero no se puede presentar, y esa
            diferencia solo aparece el día de la rendición si nadie la cuenta. */}
        {sinPdf > 0 && (
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>⚠ {sinPdf} sin PDF adjunto</span>
        )}

        <span style={{ flex: 1 }} />
        {esAdmin && !abierto && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => { setF(vacio); setIgvTocado(false); setAbierto(true); }}>＋ Registrar comprobante</button>
        )}
      </div>

      {abierto && esAdmin && (
        <div className="card" style={{ marginBottom: 10, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* ── COMPRA O VENTA ──
                Va primero porque cambia el significado de todo lo demás: en una
                compra el IGV es CRÉDITO y quien emite es el proveedor; en una
                venta es DÉBITO y quien emite somos nosotros. Sumarlos juntos
                daría un número sin significado, y el resultado del mes se
                calcula justo de esa resta.
                «Compra» viene puesto porque es lo que se registra casi siempre;
                pero el selector se VE, no se esconde tras un desplegable de
                opciones avanzadas: sin ninguna venta cargada, el IGV del mes
                sale siempre a favor y eso se lee como un hecho. */}
            <select value={f.sentido} onChange={e => set("sentido", e.target.value)}
              style={{ ...inp, width: 120,
                color: f.sentido === "venta" ? "var(--green)" : "var(--text)" }}
              title="Compra: el IGV suma como crédito. Venta: suma como débito.">
              <option value="compra">↙ Compra</option>
              <option value="venta">↗ Venta</option>
            </select>
            <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={{ ...inp, width: 150 }}>
              {TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {/* El rótulo cambia con el sentido: en una venta el «proveedor» es
                el cliente, y pedir «proveedor» en una factura que emitimos
                nosotros es la clase de etiqueta que se rellena mal sin dudar. */}
            <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)}
              placeholder={f.sentido === "venta" ? "Cliente — a quién se le emitió" : "Proveedor — quién emitió"}
              style={{ ...inp, flex: 1, minWidth: 180 }} />
            {/* El RUC va aparte del nombre porque es columna obligatoria del
                informe de DAFO. Sacarlo después de un texto libre es donde se
                pierde un dígito — y un RUC con un dígito de menos no falla:
                valida como otro, o como ninguno, y lo rebotan al rendir. */}
            <input value={f.ruc} onChange={e => set("ruc", e.target.value)}
              placeholder="RUC (11 dígitos)" inputMode="numeric" style={{ ...inp, width: 140 }} />
            {/* Comprobar mientras se registra, no después. Con la factura
                todavía en la mano corregir un dígito cuesta un segundo; una vez
                archivada, hay que ir a buscarla. Aparece con 11 dígitos porque
                antes no hay nada que consultar. */}
            {/^\d{11}$/.test(f.ruc.trim()) && (
              <BotonFichaSunat numero={f.ruc.trim()} tipo="RUC" compacto url={urlSunat} />
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <input value={f.serie} onChange={e => set("serie", e.target.value)}
              placeholder="Serie (F001)" style={{ ...inp, width: 110 }} />
            <input value={f.numero} onChange={e => set("numero", e.target.value)}
              placeholder="Número" style={{ ...inp, width: 110 }} />
            <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)}
              style={{ ...inp, width: 145 }} />
            <input value={f.importe} onChange={e => set("importe", e.target.value)}
              placeholder="Total S/" inputMode="decimal" style={{ ...inp, width: 110 }} />
            {/* Propuesto desde el total (18 % incluido) y editable. El aviso de
                al lado existe porque un número que aparece solo en una casilla
                se lee como dato del papel: hay que decir que es cuenta nuestra
                mientras nadie lo confirme. */}
            <input value={f.igv} onChange={e => set("igv", e.target.value)}
              placeholder="IGV S/" inputMode="decimal"
              title="Se propone el 18 % incluido en el total. Si el comprobante dice otra cosa —exonerada, RUS, mixta—, escríbelo y manda lo que escribas."
              style={{
                ...inp, width: 100,
                borderColor: f.igv && !igvTocado ? "var(--yellow)" : "var(--border)",
              }} />
            {f.igv && !igvTocado && (
              <span style={{ color: "var(--yellow)", fontSize: 11 }}
                title="Calculado como total × 18/118. Compáralo con el papel.">
                18 % calculado
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            {/* Etapa y rubro se han ido de aquí a debajo del fondo: sin fondo
                no significan nada, y preguntarlos antes de saber si lo hay
                era pedir una clasificación para un cajón que no existe. */}
            <input value={f.concepto} onChange={e => set("concepto", e.target.value)}
              placeholder={f.sentido === "venta" ? "Concepto — qué se vendió" : "Concepto — qué se compró"}
              style={{ ...inp, flex: 1, minWidth: 160 }} />
          </div>
          {/* ── A QUÉ FONDO SE IMPUTA ──
              Solo fuera de un fondo: dentro, la prop lo fija y ofrecer un
              desplegable con la respuesta ya escrita solo invita a cambiarla
              por error.
              «Ninguno» es la opción normal y va primera: la mayoría de las
              compras de la asociación no son de DAFO, y ese era justo el caso
              que el sistema no sabía guardar. */}
          {!postulacionId && (fondos || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Imputar a un fondo</span>
              <select value={f.postulacionId} onChange={e => set("postulacionId", e.target.value)}
                style={{ ...inp, minWidth: 240 }}
                title="Si esta compra se rinde en un fondo DAFO, elígelo aquí y aparecerá en su rendición. Si no, déjalo en «ninguno».">
                <option value="">— ninguno (gasto propio de la empresa) —</option>
                {(fondos || []).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
              {f.postulacionId && (
                <span style={{ color: "var(--teal)", fontSize: 11 }}>
                  aparecerá también en la rendición de ese fondo
                </span>
              )}
            </div>
          )}
          {/* ── DÓNDE CAE DENTRO DEL FONDO ──
              Aparece solo cuando hay fondo: dentro de /fondo lo fija la prop,
              y fuera aparece en cuanto se elige uno arriba. Así la pregunta
              llega justo después de la que le da sentido, en vez de esperar
              arriba en amarillo a que alguien adivine para qué es. */}
          {(postulacionId || f.postulacionId) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Dónde se rinde</span>
              <select value={f.etapa} onChange={e => set("etapa", e.target.value)} style={{ ...inp, width: 175 }}>
                <option value="">Etapa…</option>
                {etapas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <select value={f.rubroItem} onChange={e => set("rubroItem", e.target.value)} style={{ ...inp, width: 175 }}>
                <option value="">Rubro…</option>
                {rubros.map(r => <option key={r.id} value={r.id} title={r.ayuda}>{r.etiqueta}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            {/* Igual que en la caja: la factura se fotografía con el celular y
                se pega aquí. Mandarla antes a Drive es el paso que hace que se
                registre «y luego subo el PDF» — y ese luego no llega. */}
            <CampoAdjunto valor={f.url} onCambio={v => set("url", v)}
              placeholder="Comprobante: pega la foto, arrástrala o escribe un enlace" />
            <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "6px 14px" }}
              onClick={guardar}>{ocupado ? "…" : f.id ? "Actualizar" : "Guardar"}</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={() => { setAbierto(false); setF(vacio); setIgvTocado(false); }}>Cancelar</button>
          </div>
        </div>
      )}

      {comprobantes.length === 0 ? (
        <div className="empty" style={{ fontSize: 12.5 }}>
          Sin comprobantes cargados. Aquí van las facturas y boletas de proveedor —
          alquiler, hospedaje, combustible, imprenta—, que se rinden sin tope.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {comprobantes.map(c => (
            /* ── DOS RENGLONES, NO UNO QUE SE PARTE SOLO ──
               Era una sola fila con `flex-wrap`, y funcionaba mientras cupiera.
               Al entrar los dos desplegables dejó de caber: los selectores se
               quedaban a la derecha del primer renglón y las acciones —👀 💬
               ＋caso ✎ ✕— caían sueltas abajo a la izquierda, lejos de la
               factura a la que pertenecen. Lo que se rompe primero al envolver
               es siempre lo último que se escribió, no lo que menos importa.
               Ahora el corte está decidido: arriba QUÉ es la factura, abajo qué
               se HACE con ella. */
            <div key={c.id} id={idFila("comprobante", c.id)} className="fac-fila"
              /* `scroll-margin-top` para que el ancla del aviso no deje la fila
                 pegada al borde superior, medio tapada por la cabecera. */
              style={{ scrollMarginTop: 70 }}>
              <div className="fac-l1">
                {/* ── NUEVE CELDAS, SIEMPRE LAS NUEVE ──
                    En una rejilla, un campo que no se pinta no deja hueco: corre
                    a todos los de su derecha una posición y la columna deja de
                    ser columna. Media docena de estas facturas no tienen
                    concepto o no tienen PDF, así que los opcionales emiten una
                    celda vacía en vez de desaparecer. Es la diferencia entre
                    una lista que se lee en vertical y diez filas sueltas. */}
                <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{dmy(c.fecha)}</span>

                <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>
                  {rotuloTipo(c.tipo)}
                </span>

                <span style={{ fontWeight: 600 }} title={c.proveedor}>{c.proveedor}</span>

                <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                  {[c.serie, c.numero].filter(Boolean).join("-")}
                </span>

                {/* ── EL RUC, Y LA FORMA DE COMPROBARLO ──
                    El error caro no es el RUC ausente —ese salta al rendir—, es
                    el presente y mal: un dígito cambiado no falla, valida como
                    otro contribuyente o como ninguno, y aparece el día de la
                    observación. El chip lo pone a la vista y deja la
                    comprobación a un clic: el buscador de SUNAT exige POST y
                    captcha, así que copia el número y abre la página. */}
                <span style={{ minWidth: 0 }}>
                  {c.ruc ? (
                    <BotonFichaSunat numero={c.ruc} tipo="RUC" compacto url={urlSunat} />
                  ) : (
                    <span style={{ color: "var(--yellow)", fontSize: 11 }} title="El informe de DAFO lo pide">
                      sin RUC
                    </span>
                  )}
                </span>

                <span style={{ color: "var(--muted)", fontSize: 11.5 }} title={c.concepto || ""}>
                  {c.concepto || ""}
                </span>

                <span style={{ color: "var(--teal)", fontWeight: 700, textAlign: "right" }}>
                  {money(c.importe)}
                </span>

                <span style={{ textAlign: "right" }}>
                  {c.url
                    ? <VerAdjunto url={c.url} />
                    : <span style={{ color: "var(--yellow)", fontSize: 11 }} title="Sin PDF adjunto">·</span>}
                </span>
              </div>

              <div className="fac-l2">
              {/* ── CLASIFICAR EN LA FILA, NO EN UN FORMULARIO ──
                  El rubro solo existía dentro del ✎: para poner «Recursos
                  técnicos» a diez facturas había que abrir, cambiar, guardar y
                  repetir. A ese precio la clasificación se pospone — y sin
                  rubro la conciliación no reparte nada, que es exactamente lo
                  que pasaba con estas diez.
                  Mismo control que en los recibos: la misma tarea no puede
                  hacerse de dos maneras según la lista. */}
              {/* ── PERO SOLO SI LA FACTURA VA A UN FONDO ──
                  Etapa y rubro son las casillas de la RENDICIÓN: sirven para
                  repartir el gasto en el presupuesto aprobado de un fondo. Una
                  factura de la empresa que no se rinde a ningún sitio no tiene
                  etapa ni rubro que poner, y esta pantalla las pintaba igual —
                  con su «⚠ etapa…» en amarillo, reclamando que se rellene algo
                  que no existe. Una advertencia que no se puede atender enseña
                  a ignorar las advertencias.
                  El que manda es el HECHO —esta factura pertenece a un fondo—,
                  no en qué pantalla estemos: dentro de /fondo viene por
                  `postulacionId`, y en /comprobantes puede venir en la fila,
                  porque una misma factura de la empresa sí puede estar rendida
                  a un fondo. En ese caso se clasifica también desde aquí. */}
              {(() => {
                const fondoDeLaFila = postulacionId || (c as any).postulacion_id || null;
                if (!fondoDeLaFila) return null;
                return (
                  <>
                    <EjeSelect valor={c.etapa || ""} vacio="⚠ etapa…" opciones={etapas} ancho={150}
                      editable={esAdmin}
                      onCambio={v => fijarEjesRendicion("comprobante", c.id, { postulacionId: fondoDeLaFila, etapa: v || null })
                        .then(() => router.refresh())} />
                    <EjeSelect valor={c.rubro_item || ""} vacio="⚠ rubro…" ancho={165}
                      opciones={rubros.map(r => ({ id: r.id, nombre: r.etiqueta, ayuda: r.ayuda }))}
                      editable={esAdmin}
                      onCambio={v => fijarEjesRendicion("comprobante", c.id, { postulacionId: fondoDeLaFila, rubroItem: v || null })
                        .then(() => router.refresh())} />
                  </>
                );
              })()}

              {/* ── QUIÉN LO REGISTRÓ Y CUÁNDO ──
                  Es plata que se rinde ante el Ministerio: una cifra sin autor
                  es una cifra que nadie puede explicar el día que la observan.
                  Vivía arriba, en una celda de 104 px que la cortaba a
                  «carga directa · 20 ag…» — ni nombre ni fecha completos.
                  Aquí abajo cabe la cara, que es como se reconoce a alguien
                  entre siete, y el nombre entero.
                  Sin autor NO se deja en blanco: un hueco se lee como «no se
                  sabe», y aquí sí se sabe — entró por carga directa a la base,
                  no por el formulario. */}
              {c.creado_en && (
                <span className="fac-autor"
                  title={autorDe(c)
                    ? `Registrado por ${autorDe(c)!.nombre} el ${cuandoLargo(c.creado_en)}`
                    : `Cargado directamente en la base el ${cuandoLargo(c.creado_en)}, no desde el formulario. Por eso no hay una persona a la que atribuirlo.`}>
                  {autorDe(c)
                    ? <>
                        <Avatar nombre={autorDe(c)!.nombre} src={autorDe(c)!.avatar_url}
                          color={autorDe(c)!.color} size={18} />
                        {/* El corto; el largo queda en el título de la celda,
                            que ya lo lleva («Registrado por … el …»). */}
                        <b>{(c.creado_por && alias?.[c.creado_por]) || autorDe(c)!.nombre}</b>
                      </>
                    : <i style={{ color: "var(--dim)" }}>carga directa</i>}
                  <span style={{ color: "var(--dim)" }}>· {cuando(c.creado_en)}</span>
                </span>
              )}

              <span style={{ flex: 1, minWidth: 0 }} />

              <AccionesFila tabla="comprobante" filaId={c.id} userId={userId}
                reacciones={c.reacciones} nComentarios={c.nComentarios}
                caso={c.caso}
                extra={esAdmin ? (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <button className="dato-btn" onClick={() => editar(c)} disabled={ocupado}>✎</button>
                    <button onClick={() => quitar(c)} disabled={ocupado} title="Borrar"
                      style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </span>
                ) : undefined} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
