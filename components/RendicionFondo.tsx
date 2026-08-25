"use client";
import { useState } from "react";
import CargarComprobantes from "@/components/CargarComprobantes";
import ApoyosFondo from "@/components/ApoyosFondo";
import { textoFaltan, seVigila, type FaltanEstados } from "@/lib/estadosCuenta";
import { estadoConPrueba } from "@/lib/pruebasFondo";
import { useRouter } from "next/navigation";
import {
  guardarEstadoCuenta, borrarEstadoCuenta, guardarRhe, fijarEjesRhe, fijarEjesRheLote, borrarRhe,
  fijarComprobanteRhe,
} from "@/app/actions";
import ImagenesEstado from "@/components/ImagenesEstado";
import CampoAdjunto from "@/components/CampoAdjunto";
import VerAdjunto from "@/components/VerAdjunto";
import Plegable from "@/components/Plegable";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { AccionesFila, AvisoHilo, idFila } from "@/components/HiloRendicion";
import EjeSelect from "@/components/EjeSelect";
import { VIAS_GIRO } from "@/lib/pagos";

/* ── La cara financiera de un fondo ganado ──
 *
 * Hasta hoy un fondo era solo cabecera: monto, fechas, «entregado sí/no».
 * Aquí vive lo que pasa DENTRO —lo que se paga y en qué banco— porque el plan
 * lo dice claro: el dinero del fondo vive con su fondo.
 *
 * Tres bloques, en el orden en que importan:
 *   1) el DESEMBOLSO — la fecha de la que cuelga todo el plazo (acta 7.2);
 *   2) los ESTADOS DE CUENTA — un PDF por mes, con su saldo e intereses;
 *   3) los RHE del fondo — cada pago con sus dos ejes: actividad y rubro.
 *
 * Solo administración escribe. El resto lo ve, que para eso está.
 */

type EstadoCuenta = {
  nComentarios?: number; reacciones?: any[]; caso?: any;
  id: string; periodo: string; url: string | null;
  saldo: number | null; intereses: number | null; nota: string | null;
  imagenes?: string[] | null;
  creado_en?: string | null; comprobante_en?: string | null;
  creado?: { nombre: string } | null; quien?: { nombre: string } | null;
};
type RheFila = {
  nComentarios?: number; reacciones?: any[]; caso?: any;
  id: string; persona_id: string; persona?: string;
  fecha: string; monto: number; numero: string | null; url: string | null;
  etapa: string | null; rubro_item: string | null; concepto?: string | null;
  /** Si ya se pagó, el recibo deja de ser corregible por su titular (montos).
   *  Para el COMPROBANTE no manda esto, sino el cierre del expediente. */
  pagado_en?: string | null;
  liquidacion_id?: string | null;
  /** El expediente del que cuelga, si cuelga de alguno. Cerrado = ya se
   *  presentó, y el respaldo de lo presentado lo cambia administración. */
  liq?: { cerrado_en?: string | null } | null;
};
type Opcion = {
  id: string; nombre: string;
  /** Qué contiene el rubro y cuánto le queda. Va en el `title` de la opción:
   *  el nombre solo —«Equipo del proyecto»— no dice si ahí van los honorarios
   *  o los equipos, y averiguarlo obligaba a abrir el presupuesto aparte. */
  ayuda?: string;
};

const soles = (n: number | null | undefined) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Los conceptos de los RHE vienen EN MAYÚSCULAS del PDF. Se leen mejor en
// oración: primera letra arriba, el resto abajo (sin tocar siglas cortas).
const capitaliza = (s?: string | null) => {
  const t = (s || "").trim();
  if (!t) return "";
  const lower = t.toLocaleLowerCase("es-PE");
  return lower.charAt(0).toLocaleUpperCase("es-PE") + lower.slice(1);
};

// "2026-07-01" → "jul. 2026"
const mesLargo = (p: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(p || "");
  if (!m) return p;
  const meses = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
  return `${meses[parseInt(m[2], 10) - 1]} ${m[1]}`;
};
// dd/mm/aaaa
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
// "22 jul. 2026" a partir de un timestamptz
const fechaSubido = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
};


export default function RendicionFondo({
  postulacionId, esAdmin, miPersonaId, esApoyo, apoyos, equipo, rucs, fechaDesembolso, fechaRendicionReal, montoAdjudicado,
  estados, rhe, empresa, etapas, rubros, personas, userId, hiloError, faltanEc,
}: {
  postulacionId: string;
  esAdmin: boolean;
  /** La ficha de persona de quien mira, si su cuenta está enlazada. Sirve para
   *  una sola cosa: reconocer SUS recibos entre los del resto. */
  miPersonaId?: string | null;
  /** Si a quien mira lo nombraron apoyo de rendición DE ESTE fondo: puede
   *  colgar el PDF de cualquier recibo de aquí, y nada más. */
  esApoyo?: boolean;
  /** Los apoyos nombrados (ids de cuenta), para el bloque de administración. */
  apoyos?: string[];
  /** El catálogo de cuentas activas, para elegir a quién nombrar. */
  equipo?: { id: string; nombre?: string | null; avatar_url?: string | null; color?: string | null }[];
  /** RUC o DNI → id de persona. Lo usa la carga por lote para saber DE QUIÉN
   *  es cada PDF: el número del recibo no lo dice, porque la serie E001 la
   *  tiene cada emisor. */
  rucs?: Record<string, string>;
  fechaDesembolso: string | null;
  /** Si el fondo ya rindió, la serie de estados termina ahí y deja de faltar
      nada. Sin esto, un fondo cerrado seguiría pidiendo meses para siempre. */
  fechaRendicionReal?: string | null;
  montoAdjudicado: number | null;
  estados: EstadoCuenta[];
  rhe: RheFila[];
  empresa?: string | null;   // quien gira los recibos (la asociación titular del fondo)
  etapas: Opcion[];        // etapas del cronograma (eje del informe económico)
  rubros: { id: string; etiqueta: string; ayuda?: string }[];  // catálogo de rubros DAFO (eje rubro)
  personas: Opcion[];      // a quién se le puede girar
  /** Para saber cuáles reacciones son mías. */
  userId: string;
  /** Si falta db/rendicion-interaccion.sql: se dice y las listas siguen. */
  hiloError?: string | null;
  /** Los estados de cuenta que faltan, YA CONTADOS por el servidor con el
   *  mismo `faltanEstados` que alimenta la burbuja de la pestaña y la de la
   *  cabecera. Llega hecho para que los tres escalones del rastro no puedan
   *  decir números distintos. */
  faltanEc: FaltanEstados;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();

  const totalIntereses = estados.reduce((s, e) => s + Number(e.intereses || 0), 0);
  // Un mes «tiene comprobante» si hay escaneo(s) adjunto(s) o un link de PDF.
  /* La regla de «¿tiene papel?» vive en lib/pruebasFondo, que es quien alimenta
     las burbujas ámbar. Aquí estaba escrita otra vez, carácter por carácter:
     hoy coincidían, y el día que una de las dos cambiara —admitir un tercer
     sitio donde guardar el escaneo, por ejemplo— la fila diría una cosa y la
     burbuja otra sin que nada fallara. */
  const tieneComprobante = estadoConPrueba;
  const conComprobante = estados.filter(tieneComprobante).length;
  /* ── LO QUE FALTA NO OCUPA ESPACIO EN LA PANTALLA ──
     Seis meses cargados, cada uno con su saldo correcto, se leen como «al
     día» aunque falten los dos últimos: el hueco no se ve. Por eso la cuenta
     se hace contra el CALENDARIO —del desembolso al último mes cerrado, que
     es lo que pide la cláusula 5.2.3— y no contra lo que hay cargado.

     ── LA CUENTA VIENE DE FUERA, YA HECHA ──
     Se calculaba aquí, con `hoyLima()` leído en el cuerpo del componente. Eso
     eran DOS relojes: la pestaña y la cabecera traen el día que fijó el
     servidor al renderizar, y esto lo recalculaba en cada re-render del
     cliente. Con la pestaña abierta a las 23:59, un clic pasada la medianoche
     dejaba un número en la sub-sección y otro distinto dos escalones arriba.
     Tres sitios que enseñan lo mismo tienen que enseñar el MISMO valor, no
     tres cálculos que casi siempre coinciden. */
  const avisoFaltan = textoFaltan(faltanEc);
  // ¿A este fondo se le sigue pidiendo el banco? La MISMA pregunta que decide
  // la burbuja de la pestaña y la del menú (lib/estadosCuenta).
  const vigilado = seVigila({
    fecha_desembolso: fechaDesembolso, fecha_rendicion_real: fechaRendicionReal,
  });
  const totalRhe = rhe.reduce((s, r) => s + Number(r.monto || 0), 0);
  // Cuántos RHE ya tienen sus dos ejes puestos (lo que hace que la rendición cuadre sola)
  const rheSinEje = rhe.filter(r => !r.etapa || !r.rubro_item).length;
  const conEjes = rhe.length - rheSinEje;
  // Los que todavía no tienen su PDF adjunto. Ver el comentario de la cabecera.
  const rheSinPdf = rhe.filter(r => !r.url).length;
  const rubrosOpc = rubros.map(x => ({ id: x.id, nombre: x.etiqueta, ayuda: x.ayuda }));
  // ── Los mismos RHE, mirados de tres maneras ──
  // Por persona (a quién se le pagó), por etapa (en qué fase del cronograma) o
  // por rubro (en qué partida del presupuesto). Es la MISMA plata reagrupada:
  // sirve para leer la rendición desde el eje que toque en cada momento.
  const [modo, setModo] = useState<"persona" | "etapa" | "rubro">("persona");
  /* Qué fila tiene abierto el campo del comprobante. Uno a la vez: dos cajas
     de adjuntar abiertas en una lista de veintiséis recibos es pedir que se
     pegue la foto en la fila equivocada. */
  const [adj, setAdj] = useState<string | null>(null);

  /* ── EL COMPROBANTE DE TU RECIBO LO SUBES TÚ ──
     Adjuntar exigía ser administración, y eso dejaba el trabajo donde no
     está: el PDF del RHE lo tiene EN LA MANO quien cobró —se lo emitió él—,
     mientras administración tiene que pedírselo por WhatsApp, esperarlo y
     subirlo. Cincuenta y ocho recibos por ese camino no se cargan nunca, y el
     resultado es una rendición que no se puede presentar.
     La base ya pensaba así desde db/rhe-permisos.sql: su política deja al
     titular corregir su recibo mientras no se haya pagado. Era la PANTALLA la
     que no ofrecía la puerta —el permiso existía y no había por dónde entrar,
     que es el fallo más difícil de ver porque no da ningún error.
     Después del pago se cierra: a partir de ahí el número ya se usó y lo
     corrige alguien con responsabilidad, que es lo que dice la política. */
  /* ⚠ Esta condición es el reflejo EXACTO de `adjuntar_comprobante_rhe`
     (db/apoyo-rendicion.sql). Son dos escrituras de la misma regla y no hay
     forma de evitarlo —una decide si se pinta el botón, la otra si se guarda—,
     así que si un día cambia una, cambia la otra el mismo día. Cuando
     divergen, el síntoma es un botón que está y no funciona, o un permiso que
     existe y no tiene puerta: los dos fallos tardan meses en encontrarse. */
  const cerrado = (r: RheFila) => !!r.liq?.cerrado_en;
  const puedeAdjuntar = (r: RheFila) =>
    esAdmin
    || ((esApoyo || (!!miPersonaId && r.persona_id === miPersonaId)) && !cerrado(r));
  const totGrupo = (g: { items: RheFila[] }) => g.items.reduce((s, r) => s + Number(r.monto || 0), 0);
  const nombreDe = (opc: Opcion[], id: string) => opc.find(o => o.id === id)?.nombre;
  const SIN = "∅";  // clave del grupo «sin asignar»

  type GrupoRhe = { clave: string; titulo: string; personaId?: string; items: RheFila[] };
  const grupos: GrupoRhe[] = (() => {
    const map = new Map<string, GrupoRhe>();
    for (const r of rhe) {
      let clave: string, titulo: string, personaId: string | undefined;
      if (modo === "persona") {
        clave = r.persona_id; titulo = r.persona || "—"; personaId = r.persona_id;
      } else if (modo === "etapa") {
        clave = r.etapa || SIN; titulo = r.etapa ? (nombreDe(etapas, r.etapa) || r.etapa) : "⚠ Sin etapa";
      } else {
        clave = r.rubro_item || SIN; titulo = r.rubro_item ? (nombreDe(rubrosOpc, r.rubro_item) || r.rubro_item) : "⚠ Sin rubro";
      }
      let g = map.get(clave);
      if (!g) { g = { clave, titulo, personaId, items: [] }; map.set(clave, g); }
      g.items.push(r);
    }
    const gs = [...map.values()];
    if (modo === "etapa") {
      // Orden natural del cronograma (pre → prod → post); «sin etapa» al final.
      const orden = new Map(etapas.map((e, i) => [e.id, i]));
      gs.sort((a, b) =>
        (a.clave === SIN ? 1e9 : orden.get(a.clave) ?? 1e8) -
        (b.clave === SIN ? 1e9 : orden.get(b.clave) ?? 1e8));
    } else {
      // Persona y rubro: mayor gasto primero, «sin asignar» al final.
      gs.sort((a, b) =>
        (a.clave === SIN ? 1 : 0) - (b.clave === SIN ? 1 : 0) || totGrupo(b) - totGrupo(a));
    }
    return gs;
  })();

  // Expandir / plegar todos los grupos de la vista actual de una sola vez.
  const plegarTodos = (abrir: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent("plg:todos", {
        detail: { prefijo: `rhegrp:${postulacionId}:${modo}:`, abrir },
      }));
    } catch { /* da igual */ }
  };

  return (
    <div>
      {dialogo}
      <AvisoHilo error={hiloError} />
      {aviso}
      {/* ── EL ESTÍMULO, EL DESEMBOLSO Y EL PLAZO SE FUERON DE AQUÍ ──
          Estaban repetidos: las mismas tres cifras encabezan la página entera,
          en las tarjetas de arriba, donde además se leen sin abrir nada.
          Repetirlas dentro no era redundancia inofensiva — obliga a comprobar
          si dicen lo mismo cada vez que se mira, y el día que una se calcule
          distinto de la otra nadie sabrá cuál creerse.
          Si hace falta el aviso de «falta el desembolso», su sitio es la
          cabecera, que es donde vive la fecha. */}

      {/* ── 2) Estados de cuenta (sub-sección plegable, nivel 2) ── */}
      <Plegable nivel={2} id={`ren:${postulacionId}:estados`} titulo="🏦 Estados de cuenta"
        abiertoPorDefecto={false}
        resumen={
          <>
            <span style={{ color: "var(--muted)" }}>
              {estados.length ? `${estados.length} mes(es) · intereses ${soles(totalIntereses)}` : "sin cargar"}
            </span>
            {estados.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 600,
                color: conComprobante === estados.length ? "var(--green)" : "var(--yellow)" }}>
                {conComprobante === estados.length ? "✓" : "⚠"} {conComprobante}/{estados.length} compr.
              </span>
            )}
            {/* ── FALTA ES ROJO, SIEMPRE ──
                Estuvo en ámbar salvo cuando el hueco caía en medio de la serie.
                El razonamiento era «que no esté el último solo quiere decir que
                aún no lo han subido», y es falso por construcción: la serie que
                se exige termina en el último mes CERRADO, así que cualquier mes
                que falte lleva ya un mes entero de retraso. Ámbar decía «esto
                puede esperar» de un papel que el acta (5.2.3) da por vencido.
                La distinción entre cola y hueco no se pierde: sigue escrita en
                el propio aviso —«N en medio de la serie»—, que es donde se
                puede leer, en vez de en un matiz de color que nadie descifra. */}
            {avisoFaltan && (
              /* Rojo mientras se le pueda pedir el papel a alguien. En un fondo
                 ya rendido el hueco no deja de existir —se sigue diciendo, es
                 un hallazgo— pero deja de ser una tarea: no hay a quién
                 pedírselo, y una alarma que nadie puede apagar solo enseña a
                 ignorar las alarmas. */
              <span style={{ marginLeft: 8, fontWeight: 600,
                color: vigilado ? "var(--red)" : "var(--dim)" }}
                title={vigilado ? undefined : "El fondo ya se rindió: la serie quedó incompleta, pero ya no hay nada que cargar."}>
                ⚠ {avisoFaltan}{vigilado ? "" : " · fondo ya rendido"}
              </span>
            )}
            {!avisoFaltan && faltanEc.esperados.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--green)" }}>
                ✓ serie completa
              </span>
            )}
          </>
        }>
      {estados.length > 0 && (
        <div className="linked" style={{ marginBottom: 8, padding: "4px 10px" }}>
          {estados.map(e => (
            <div key={e.id} id={idFila("estado_cuenta", e.id)}
              style={{ borderTop: "1px solid var(--border)", padding: "7px 0", scrollMarginTop: 70 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 82, fontWeight: 600, fontSize: 13.5 }}>{mesLargo(e.periodo)}</span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  <span style={{ color: "var(--dim)" }}>saldo </span>
                  <b style={{ color: Number(e.saldo) < 0 ? "var(--red)" : "var(--teal)" }}>{soles(e.saldo)}</b>
                  <span style={{ color: "var(--dim)" }}> · interés </span>
                  <b style={{ color: Number(e.intereses) > 0 ? "var(--yellow)" : "var(--muted)" }}>{soles(e.intereses)}</b>
                  {e.nota ? <span style={{ color: "var(--dim)" }}> · {e.nota}</span> : ""}
                </span>
                {!tieneComprobante(e) && (
                  <span title="Este mes aún no tiene comprobante adjunto"
                    style={{ fontSize: 11.5, color: "var(--yellow)", fontWeight: 600, whiteSpace: "nowrap" }}>⚠ sin comprobante</span>
                )}
                {e.url && (
                  <a href={e.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--violet)", fontSize: 12.5 }}>📄 PDF ↗</a>
                )}
                {/* Un estado de cuenta es lo que DAFO compara contra todo lo
                    demás. «Este mes no cuadra» es la observación más común que
                    llega, y la explicación tiene que quedarse aquí. */}
                <AccionesFila tabla="estado_cuenta" filaId={e.id} userId={userId}
                  reacciones={e.reacciones} nComentarios={e.nComentarios} caso={e.caso}
                  extra={esAdmin ? (
                    <button onClick={async () => {
                      if (!(await pedir(`¿Borrar el estado de cuenta de ${mesLargo(e.periodo)}?`, { peligro: true, aceptar: "Borrar" }))) return;
                      const r: any = await borrarEstadoCuenta(e.id, postulacionId);
                      if (r?.error) avisar(r.error); else router.refresh();
                    }} title="Borrar"
                      style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                  ) : undefined} />
              </div>
              {/* El comprobante físico del mes: escaneos/fotos del estado impreso. */}
              <ImagenesEstado estadoId={e.id} postulacionId={postulacionId} esAdmin={esAdmin}
                inicial={e.imagenes || []} />
              {/* Sello: quién subió el comprobante y cuándo (o quién cargó la fila). */}
              {(() => {
                const comp = e.comprobante_en
                  ? `📎 comprobante subido${e.quien?.nombre ? ` por ${e.quien.nombre}` : ""} · ${fechaSubido(e.comprobante_en)}`
                  : e.creado_en
                    ? `cargado${e.creado?.nombre ? ` por ${e.creado.nombre}` : ""} · ${fechaSubido(e.creado_en)}`
                    : "";
                return comp ? (
                  <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 3 }}>{comp}</div>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}
        {esAdmin && <FormEstado postulacionId={postulacionId} />}
      </Plegable>

      {/* ── 3) Pagos al personal — RHE (sub-sección plegable, nivel 2) ── */}
      <Plegable nivel={2} id={`ren:${postulacionId}:rhe`} titulo="🧾 Pagos al personal (RHE)"
        abiertoPorDefecto={true}
        resumen={
          rhe.length ? (
            <>
              <span style={{ fontWeight: 700, color: "var(--muted)" }}>{rhe.length} RHE</span>
              <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700 }}>{soles(totalRhe)}</span>
              <span style={{ marginLeft: 8, fontWeight: 600, color: rheSinEje ? "var(--yellow)" : "var(--green)" }}
                title={`${conEjes} de ${rhe.length} recibos tienen etapa y rubro asignados`}>
                {rheSinEje ? "⚠" : "✓"} {conEjes}/{rhe.length}
              </span>
              {/* ── LOS QUE NO TIENEN PDF, CONTADOS EN LA CABECERA ──
                  El bloque se lee plegado la mayor parte del tiempo, así que un
                  agujero que solo se ve abriendo y recorriendo veintiséis filas
                  es un agujero que nadie encuentra hasta el día de la entrega.
                  Y este pesa: el recibo escaneado ES la rendición — la cifra
                  sin su papel no se puede presentar. */}
              {rheSinPdf > 0 && (
                <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--yellow)" }}
                  title="Recibos sin el PDF adjunto. Sin el escaneo no se pueden presentar.">
                  📎 {rheSinPdf} sin comprobante
                </span>
              )}
            </>
          ) : <span style={{ color: "var(--dim)" }}>sin pagos</span>
        }>
      {rhe.length > 0 && empresa && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "0 0 8px" }}>
          Girados por <b style={{ color: "var(--muted)", fontWeight: 600 }}>{empresa}</b> — la asociación titular del fondo.
        </div>
      )}
      {rhe.length > 0 && (
        <ApoyosFondo postulacionId={postulacionId} esAdmin={esAdmin}
          apoyos={apoyos || []} equipo={equipo || []} />
      )}
      {rhe.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>Ver:</span>
          <div className="rhe-vistas">
            {([["persona", "👤 Por persona"], ["etapa", "🎬 Por etapa"], ["rubro", "🗂 Por rubro"]] as const).map(([m, txt]) => (
              <button key={m} onClick={() => setModo(m)}
                className={modo === m ? "on" : ""}>{txt}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {/* ── LA CARGA POR LOTE ──
              Solo para quien puede escribir en TODAS las filas —administración
              o el apoyo nombrado—: a quien solo puede con las suyas, una tanda
              de 58 no le sirve, y el botón le prometería algo que la base le
              va a negar fila por fila. */}
          {(esAdmin || esApoyo) && rheSinPdf > 0 && (
            <CargarComprobantes postulacionId={postulacionId} nombreFondo={empresa || null}
              rucs={rucs || {}}
              filas={rhe.map(r => ({
                id: r.id, persona_id: r.persona_id, numero: r.numero,
                monto: Number(r.monto || 0), fecha: r.fecha, url: r.url,
                persona: r.persona,
              }))} />
          )}
          <button className="plg-todo" onClick={() => plegarTodos(true)}>⤢ Expandir todo</button>
          <button className="plg-todo" onClick={() => plegarTodos(false)}>⤡ Plegar todo</button>
        </div>
      )}
      {esAdmin && rhe.length > 0 && etapas.length === 0 && (
        <div className="err-inline" style={{ marginBottom: 8 }}>
          ⚠ El eje «etapa» sale del cronograma del fondo, y todavía no tiene actividades cargadas.
          Carga el cronograma (📅 Cronograma) y aquí podrás asignar la etapa.
        </div>
      )}
      {grupos.map(g => {
        const ids = g.items.map(r => r.id);
        const faltan = g.items.filter(r => !r.etapa || !r.rubro_item).length;
        return (
          <Plegable key={g.clave} nivel={3} abiertoPorDefecto={false}
            id={`rhegrp:${postulacionId}:${modo}:${g.clave}`}
            titulo={<span style={{ color: g.clave === SIN ? "var(--yellow)" : undefined }}>{g.titulo}</span>}
            resumen={
              <>
                <span style={{ fontWeight: 700, color: "var(--muted)" }}>{g.items.length} RHE</span>
                <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700, fontSize: 13.5 }}>{soles(totGrupo(g))}</span>
                {faltan > 0 && <span style={{ marginLeft: 8, color: "var(--yellow)", fontWeight: 600 }}>⚠ {faltan}</span>}
              </>
            }>
            {/* «Aplicar a todos» — solo cuando el grupo es una persona: sus recibos
                suelen ir a la misma fase y partida. */}
            {esAdmin && modo === "persona" && g.items.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 6, marginBottom: 2, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Aplicar a todos:</span>
                <EjeSelect valor="" vacio="⇊ etapa" opciones={etapas} editable
                  onCambio={v => v && fijarEjesRheLote(ids, { etapa: v }, postulacionId).then(() => router.refresh())} />
                <EjeSelect valor="" vacio="⇊ rubro" opciones={rubrosOpc} editable
                  onCambio={v => v && fijarEjesRheLote(ids, { rubroItem: v }, postulacionId).then(() => router.refresh())} />
              </div>
            )}
                {g.items.map(r => (
                  <div key={r.id} id={idFila("rhe", r.id)} className="rhe-fila"
                    style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.045)", scrollMarginTop: 70 }}>
                    {/* Izquierda: monto, fecha·número, y el CONCEPTO (por qué se pagó) */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 14.5 }}>{soles(r.monto)}</span>
                        {modo !== "persona" && (
                          <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 12.5 }}>{r.persona || "—"}</span>
                        )}
                        <span style={{ color: "var(--dim)", fontSize: 12 }}>{dmy(r.fecha)}{r.numero ? ` · ${r.numero}` : ""}</span>
                        {/* ── EL COMPROBANTE, ADJUNTABLE DESDE AQUÍ ──
                            Antes esto solo se podía poner al dar de alta el
                            recibo: si entraba por carga —los 26 de PO-003— se
                            quedaba sin PDF para siempre, y la fila no decía ni
                            que faltaba ni cómo arreglarlo. El recibo escaneado
                            ES la rendición: un RHE sin su PDF es una cifra que
                            no se puede presentar.
                            Con PDF, se abre en el visor sin salir de la lista.
                            Sin PDF, un 📎 en ámbar que dice que falta y abre el
                            campo — el aviso y el arreglo en el mismo sitio. */}
                        {r.url ? (
                          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <VerAdjunto url={r.url} titulo="Ver el recibo">📄</VerAdjunto>
                            {puedeAdjuntar(r) && (
                              <button className="dato-btn" title="Cambiar o quitar el comprobante"
                                onClick={() => setAdj(adj === r.id ? null : r.id)}
                                style={{ fontSize: 10.5, opacity: .6 }}>✎</button>
                            )}
                          </span>
                        ) : puedeAdjuntar(r) ? (
                          <button className="dato-btn" onClick={() => setAdj(adj === r.id ? null : r.id)}
                            title="Falta el PDF del recibo. Pega la foto, arrástrala o escribe el enlace."
                            style={{ color: "var(--yellow)", fontSize: 11.5 }}>
                            📎 sin comprobante
                          </button>
                        ) : (
                          <span style={{ color: "var(--yellow)", fontSize: 11 }}
                            title="Este recibo no tiene su PDF adjunto">📎 sin comprobante</span>
                        )}
                      </div>
                      {r.concepto
                        ? <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{capitaliza(r.concepto)}</div>
                        : <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 3, fontStyle: "italic" }}>sin concepto</div>}

                      {/* El campo se abre DEBAJO y a lo ancho: pegar una foto
                          necesita sitio, y meterlo en la fila apretaría los dos
                          selectores de eje hasta hacerlos inservibles. */}
                      {adj === r.id && puedeAdjuntar(r) && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <CampoAdjunto valor={r.url || ""}
                            placeholder="Recibo: pega la foto, arrástrala o escribe el enlace"
                            onCambio={async v => {
                              const res: any = await fijarComprobanteRhe(r.id, postulacionId, v);
                              if (res?.error) avisar(res.error); else { setAdj(null); router.refresh(); }
                            }} />
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}
                            onClick={() => setAdj(null)}>Cerrar</button>
                        </div>
                      )}
                    </div>
                    {/* Derecha: los dos ejes + borrar, ocupando el espacio que antes quedaba vacío */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, paddingTop: 1 }}>
                      <EjeSelect valor={r.etapa || ""} vacio="⚠ etapa…" opciones={etapas}
                        editable={esAdmin}
                        onCambio={v => fijarEjesRhe(r.id, { postulacionId, etapa: v || null }).then(() => router.refresh())} />
                      <EjeSelect valor={r.rubro_item || ""} vacio="⚠ rubro…" opciones={rubrosOpc}
                        editable={esAdmin}
                        onCambio={v => fijarEjesRhe(r.id, { postulacionId, rubroItem: v || null }).then(() => router.refresh())} />
                      {/* Veinte de los veintiséis recibos de PO-003 se giraron
                          DESPUÉS del plazo. Cada uno de esos va a necesitar una
                          explicación escrita, y este es su sitio. */}
                      <AccionesFila tabla="rhe" filaId={r.id} userId={userId}
                        reacciones={r.reacciones} nComentarios={r.nComentarios} caso={r.caso}
                        extra={esAdmin ? (
                          <button onClick={async () => {
                            if (!(await pedir("¿Borrar este RHE?", { peligro: true, aceptar: "Borrar" }))) return;
                            const res: any = await borrarRhe(r.id, r.persona_id, postulacionId);
                            if (res?.error) avisar(res.error); else router.refresh();
                          }} title="Borrar"
                            style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                        ) : undefined} />
                    </div>
                  </div>
                ))}
          </Plegable>
        );
      })}
      {esAdmin && (
        <FormRhe postulacionId={postulacionId} etapas={etapas}
          rubros={rubros} personas={personas} />
      )}
      </Plegable>
      {!esAdmin && !rhe.length && !estados.length && (
        <p style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 6 }}>
          La carga de estados de cuenta y RHE la hace administración.
        </p>
      )}
    </div>
  );
}

/* Un eje: combo si eres admin, texto si no. Vacío se pinta en ámbar porque un
   gasto sin su eje es justo lo que rompe la rendición dos años después. */

/* Alta de un estado de cuenta mensual. */
function FormEstado({ postulacionId }: { postulacionId: string }) {
  const router = useRouter();
  const [mes, setMes] = useState("");
  const [saldo, setSaldo] = useState("");
  const [intereses, setIntereses] = useState("");
  const [url, setUrl] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (ocupado) return;
    if (!mes) { setError("Elige el mes."); return; }
    setOcupado(true); setError("");
    const r: any = await guardarEstadoCuenta({
      postulacionId, periodo: mes + "-01", url, saldo, intereses, nota,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setMes(""); setSaldo(""); setIntereses(""); setUrl(""); setNota("");
    router.refresh();
  };

  return (
    <div className="linked" style={{ marginBottom: 8 }}>
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          title="Mes que cubre" style={inp(120)} />
        <input value={saldo} onChange={e => setSaldo(e.target.value)}
          placeholder="Saldo S/" inputMode="decimal" style={inp(100)} />
        <input value={intereses} onChange={e => setIntereses(e.target.value)}
          placeholder="Interés S/" inputMode="decimal" style={inp(100)} />
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="Link del PDF del banco" style={{ ...inp(180), flex: 1, minWidth: 140 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
        <input value={nota} onChange={e => setNota(e.target.value)}
          placeholder="Nota (opcional)" style={{ ...inp(180), flex: 1 }} />
        <button className="btn" disabled={ocupado} onClick={enviar}
          style={{ fontSize: 12, padding: "6px 14px" }}>
          {ocupado ? "…" : "＋ Estado de cuenta"}
        </button>
      </div>
    </div>
  );
}

/* Girar un RHE ya con sus dos ejes: se paga a la actividad y al rubro desde
   el inicio, no dos años después. */
function FormRhe({ postulacionId, etapas, rubros, personas }: {
  postulacionId: string; etapas: Opcion[];
  rubros: { id: string; etiqueta: string; ayuda?: string }[]; personas: Opcion[];
}) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [numero, setNumero] = useState("");
  const [etapa, setEtapa] = useState("");
  const [rubroItem, setRubroItem] = useState("");
  const [url, setUrl] = useState("");
  /* Iban hardcodeados a "" y "0" al llamar a guardarRhe, y las dos ausencias
     dolían donde más:
       · el concepto es lo que esta misma lista pinta como dato principal, así
         que todo recibo dado de alta desde aquí nacía con «sin concepto» en
         cursiva — y lo que dice qué se pagó no se reconstruye a los dos años;
       · la retención en cero impedía registrar el 8% de quien rompió el tope de
         4ta, que es justo el caso que el sistema existe para vigilar. */
  const [concepto, setConcepto] = useState("");
  const [retencion, setRetencion] = useState("");
  const [giradoPor, setGiradoPor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (ocupado) return;
    if (!personaId) { setError("Elige a quién se le giró."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setError("Pon la fecha del recibo."); return; }
    setOcupado(true); setError("");
    const r: any = await guardarRhe({
      personaId, fecha, monto, numero, url, concepto, retencion, giradoPor,
      proyectoId: "", postulacionId, etapa, rubroItem,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setPersonaId(""); setFecha(""); setMonto(""); setNumero(""); setEtapa(""); setRubroItem(""); setUrl("");
    setConcepto(""); setRetencion(""); setGiradoPor("");
    setAbrir(false); router.refresh();
  };

  if (!abrir) {
    return (
      <button className="btn btn-ghost" onClick={() => setAbrir(true)}
        style={{ fontSize: 12, padding: "6px 12px" }}>＋ Registrar pago (RHE)</button>
    );
  }
  return (
    <div className="linked">
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={personaId} onChange={e => setPersonaId(e.target.value)} style={inp(150)}>
          <option value="">¿A quién?</option>
          {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp(140)} />
        <input value={monto} onChange={e => setMonto(e.target.value)}
          placeholder="Monto S/" inputMode="decimal" style={inp(100)} />
        <input value={numero} onChange={e => setNumero(e.target.value)}
          placeholder="Nº recibo" style={inp(110)} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <select value={etapa} onChange={e => setEtapa(e.target.value)}
          title="Etapa del informe económico" style={inp(180)}>
          <option value="">Etapa…</option>
          {etapas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={rubroItem} onChange={e => setRubroItem(e.target.value)}
          title="Rubro del gasto (catálogo DAFO)" style={inp(180)}>
          <option value="">Rubro…</option>
          {rubros.map(i => <option key={i.id} value={i.id} title={i.ayuda}>{i.etiqueta}</option>)}
        </select>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="Link del PDF del recibo" style={{ ...inp(160), flex: 1, minWidth: 140 }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <input value={concepto} onChange={e => setConcepto(e.target.value)}
          placeholder="Concepto — qué se le pagó"
          title="Lo que esta lista muestra como dato principal. Sin él, el recibo sale como «sin concepto»."
          style={{ ...inp(200), flex: 1, minWidth: 160 }} />
        <input value={retencion} onChange={e => setRetencion(e.target.value)}
          placeholder="Retención S/" inputMode="decimal"
          title="El 8% cuando la persona ya rompió el tope de 4ta. En blanco si tiene suspensión vigente."
          style={inp(110)} />
        <select value={giradoPor} onChange={e => setGiradoPor(e.target.value)}
          title="Quién giró el recibo en SUNAT" style={inp(170)}>
          <option value="">¿Quién lo giró?</option>
          {VIAS_GIRO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="btn" disabled={ocupado} onClick={enviar}
          style={{ fontSize: 12, padding: "6px 14px" }}>{ocupado ? "…" : "Girar RHE"}</button>
        <button className="btn btn-ghost" onClick={() => setAbrir(false)}
          style={{ fontSize: 12, padding: "6px 12px" }}>Cancelar</button>
      </div>
    </div>
  );
}

const inp = (w: number): React.CSSProperties => ({
  width: w, background: "var(--bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text)",
  outline: "none", fontFamily: "inherit",
});
