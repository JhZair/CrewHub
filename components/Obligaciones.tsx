"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  crearObligacion, generarPeriodos, marcarDeclarado, cambiarResponsableObligacion,
  fijarResultadoPeriodo, activarObligacion, fijarDesdeObligacion, quitarPeriodo,
} from "@/app/actions";
import { useConfirmar } from "@/components/useConfirmar";
import Copiar from "@/components/Copiar";
import Avatar from "@/components/Avatar";
import ImportarSol from "@/components/ImportarSol";
import { AccionesFila, AvisoHilo, idFila } from "@/components/HiloRendicion";
import type { RepLegal } from "@/lib/repLegal";
import {
  CLASES, claseDe, icoClase, nombreClase, rotuloPeriodo, situacionPeriodo,
  declaradoTarde, declaradoSinPlazo, resumenPeriodos, RESULTADOS, rotuloResultado,
  digitoRuc, META_SIT, igvDelPeriodo, resultadoDe, motivoNoDeclara, MESES,
} from "@/lib/obligaciones";

/* ── 📅 LAS TAREAS QUE VUELVEN SOLAS ──
 *
 * La tabla que esto sustituye vivía en SeaTable: una fila por empresa y mes,
 * con la fecha de vencimiento tecleada a mano. Se lee igual —esa parte
 * funcionaba— pero con dos diferencias que son el motivo de rehacerla:
 *
 *  · Los meses se GENERAN. Antes, si nadie creaba la fila de noviembre,
 *    noviembre no existía; y un mes que no existe no vence ni alerta.
 *  · La fecha sale del calendario oficial y no de la memoria de nadie. Si el
 *    año no está cargado, lo dice en vez de dejar la casilla vacía —que se
 *    lee como «no vence».
 */

/* `hoyLima` vivía aquí para el ✓ «marcar declarado hoy», que ya no existe:
   escribir la fecha de hoy como fecha de presentación era el atajo que hacía
   que el ✅ significara «alguien pulsó» en vez de «SUNAT lo recibió». Se
   retiró la función con el botón — una utilidad sin usos es la que alguien
   vuelve a llamar dentro de seis meses sin leer por qué se quitó. */
const soles = (n: any) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* ── LAS FECHAS SE LEEN, NO SE DESCIFRAN ──
 * Esta lista es una columna de veintiocho fechas seguidas, y en «25/08/2026»
 * el mes y el día son dos números del mismo tamaño: hay que pararse a decidir
 * cuál es cuál. Con el mes escrito no hay nada que decidir, y de paso se acaba
 * la ambigüedad con el formato de los reportes de SUNAT, que en algunos sitios
 * usa dd/mm y en otros mm/dd.
 *
 * El nombre sale de `MESES`, el mismo del que ya salen los rótulos de periodo.
 * Una segunda lista de meses aquí sería una lista más que traducir el día que
 * haga falta, y dos formas de escribir «agosto» en la misma pantalla.
 *
 * ── LA FECHA NO SE PASA POR `new Date()` ──
 * `new Date("2026-08-25")` la interpreta en UTC y al pintarla en Lima (UTC-5)
 * saldría el 24. Un día de diferencia en una fecha de vencimiento no es un
 * detalle estético: cambia si algo se presentó dentro de plazo. Se parte la
 * cadena y no se convierte nada.
 */
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  if (!m) return "—";
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)} ${m[1]}`;
};

type Emp = { id: string; nombre: string; ruc?: string | null; estado?: string | null;
  fecha_constitucion?: string | null };
type Obl = {
  id: string; entidad_id: string; clase: string; periodicidad: string;
  dias_aviso: number; activa: boolean; responsable?: string | null;
  desde?: string | null;
};
type Per = Record<string, any> & { id: string; obligacion_id: string; anio: number; mes: number };

export default function Obligaciones({ empresas, logos, repLegal, obligaciones, periodos, perfiles, comprobantes, urlSol, error, userId, hiloError }: {
  empresas: Emp[];
  /** El logo de cada empresa (`entidad_media`), por id. */
  logos?: Record<string, string>;
  /** Quién firma por cada empresa. Ver lib/repLegal: no es una columna, se
   *  deduce del cargo del miembro activo. */
  repLegal?: Record<string, RepLegal>;
  obligaciones: Obl[];
  periodos: Per[];
  /* `corto` es el alias del equipo («JohnO»), cruzado desde `personas.alias`
     en la página. `perfiles` —la cuenta— solo guarda el nombre largo, y en una
     fila de veintiocho periodos «John Oros Condori» no cabe ni es como se
     llaman entre ellos. Sin alias cargado se cae al nombre: mejor largo que
     vacío. */
  perfiles: { id: string; nombre: string; corto?: string | null;
    avatar_url?: string | null; color?: string | null }[];
  /** Los comprobantes de estas empresas, con fecha, IGV y sentido. Es de
   *  donde sale el resultado de cada periodo — ver `igvDelPeriodo`. */
  comprobantes: { empresa_id: string; fecha?: string | null; igv?: any; sentido?: string | null }[];
  /** SUNAT Operaciones en Línea. Sale de la tabla `plataformas` (clave
   *  `sunat_sol`), como el resto de puertas del sistema: si SUNAT cambia la
   *  URL se corrige en un sitio y no en cinco componentes. */
  urlSol?: string | null;
  /** Si falta la migración se dice UNA vez, arriba, y la pantalla sigue
   *  abriéndose: media pantalla con su explicación es mejor que un error. */
  error?: string | null;
  /** Quién está mirando: lo necesita el 👀 para saber si el suyo ya está. */
  userId: string;
  /** Si falta db/obligacion-hilo.sql, la lista sigue —sin contadores— y se
   *  dice con el nombre del archivo. Callarlo dejaría una barra de acciones
   *  que no cuenta nada y parece rota. */
  hiloError?: string | null;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const [ocupado, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [alta, setAlta] = useState<string | null>(null);   // id de empresa
  const [claseNueva, setClaseNueva] = useState(CLASES[0].clase);
  const [respNuevo, setRespNuevo] = useState("");
  /* Qué obligaciones están desplegadas. Cerradas por defecto: con seis
     empresas × doce meses, abrirlo todo daría setenta filas antes de que nadie
     haya preguntado nada. La cabecera ya lleva el semáforo. */
  const [abierta, setAbierta] = useState<Record<string, boolean>>({});
  const [editando, setEditando] = useState<string | null>(null);

  const correr = (fn: () => Promise<any>) => {
    setErr("");
    startTransition(async () => {
      const r: any = await fn();
      if (r?.error) { setErr(r.error); return; }
      router.refresh();
    });
  };

  /* ── SE PREGUNTA ANTES, Y SE DICE QUÉ SE LLEVA ──
     Quitar un periodo arrastra sus comentarios y reacciones por la cascada de
     la base. Es lo correcto —hablaban de una fila que no debía existir— pero
     no puede pasar sin avisar: puede haber dentro justo la conversación que
     explica por qué sobraba. */
  const quitar = async (p: Per, o: Obl) => {
    const n = Number((p as any).nComentarios || 0);
    if (!(await pedir(
      <>
        Se quitará <b>{rotuloPeriodo(p.anio, p.mes)}</b> de la lista.
        {n > 0 && <> Se van con él <b>{n} comentario(s)</b>.</>}
        {" "}Úsalo solo si SUNAT no espera este periodo.
        {!o.desde && <> Ajusta también «Sigue desde» o volverá a generarse.</>}
      </>,
      { titulo: "Quitar periodo", aceptar: "Quitar", peligro: true }))) return;
    correr(() => quitarPeriodo(p.id));
  };

  const perPorObl = useMemo(() => {
    const m = new Map<string, Per[]>();
    periodos.forEach(p => m.set(p.obligacion_id, [...(m.get(p.obligacion_id) || []), p]));
    /* Del más reciente al más viejo. Lo que está por vencer y lo vencido es de
       ahora; el histórico se consulta bajando, no al revés. */
    m.forEach(l => l.sort((a, b) =>
      b.anio - a.anio || b.mes - a.mes));
    return m;
  }, [periodos]);

  const oblPorEmp = useMemo(() => {
    const m = new Map<string, Obl[]>();
    obligaciones.forEach(o => m.set(o.entidad_id, [...(m.get(o.entidad_id) || []), o]));
    return m;
  }, [obligaciones]);

  const compPorEmp = useMemo(() => {
    const m = new Map<string, any[]>();
    (comprobantes || []).forEach(c =>
      m.set(c.empresa_id, [...(m.get(c.empresa_id) || []), c]));
    return m;
  }, [comprobantes]);

  /* El perfil entero, no solo el nombre: al pie hace falta también su foto.
     `nombrePerfil` se queda porque lo usa el desplegable de responsable. */
  const perfilDe = (id?: string | null) => perfiles.find(p => p.id === id) || null;
  const nombrePerfil = (id?: string | null) => perfilDe(id)?.nombre || null;
  /* El corto para las filas, el largo para el desplegable de responsable: ahí
     se ELIGE a alguien y hay que reconocerlo entre siete. Son dos trabajos
     distintos y por eso son dos funciones. */
  const cortoDe = (p: { nombre: string; corto?: string | null }) => p.corto || p.nombre;

  /* ── LAS QUE DECLARAN Y LAS QUE HOY NO ──
     Un solo corte y un solo grupo apagado, no dos. «Sin RUC» y «cerrada» son
     motivos distintos pero la misma respuesta —hoy no le toca—, y dos bloques
     tenues seguidos al final se leen como una lista que se acabó dos veces.
     El motivo va en cada fila, que es donde se pregunta.
     Quién declara lo decide `motivoNoDeclara`, en lib/obligaciones: la misma
     pregunta se la hará el cron cuando abra los casos, y dos respuestas
     distintas serían peor que ninguna. */
  const declaran = useMemo(() => empresas.filter(e => !motivoNoDeclara(e)), [empresas]);
  const enEspera = useMemo(() => empresas.filter(e => !!motivoNoDeclara(e)), [empresas]);

  /* ── UNA FILA DE PERIODO ── */
  const filaPeriodo = (o: Obl, p: Per, empId: string) => {
    const sit = situacionPeriodo(p, o);
    const m = META_SIT[sit];
    const tarde = declaradoTarde(p);
    /* Declarado y sin fecha contra la que medirlo: ni a tiempo ni tarde, sino
       «no se puede saber». Ver `declaradoSinPlazo`. */
    const sinPlazo = declaradoSinPlazo(p);
    const edit = editando === p.id;
    /* Lo que dicen los comprobantes de ese mes. Solo para las mensuales: una
       jurada anual no se resuelve sumando el IGV de doce meses. */
    const igv = o.clase === "igv_renta"
      ? igvDelPeriodo(compPorEmp.get(empId) || [], p.anio, p.mes) : null;
    const calc = igv && igv.resultado
      ? { txt: resultadoDe(igv.resultado)!.txt, col: resultadoDe(igv.resultado)!.col,
          monto: igv.monto, n: igv.comprobantes,
          detalle: `Débito S/ ${igv.debito.toFixed(2)} − crédito S/ ${igv.credito.toFixed(2)} · ${igv.comprobantes} comprobante(s) del mes` }
      : null;
    // ¿Lo escrito a mano dice algo distinto de lo que dicen las facturas?
    const discrepa = !!(p.resultado && calc && p.resultado !== igv!.resultado);
    return (
      /* El `id` es el ancla a la que salta un aviso de la campanita. Se arma
         con `idFila`, la misma función que usan las otras cinco: si esta
         pantalla se inventara su prefijo, el aviso llegaría aquí y no saltaría
         a ninguna fila — sin error, solo sin efecto. */
      <div key={p.id} id={idFila("obligacion_periodo", p.id)}
        className={`obl-fila${sit === "declarado" ? " ok" : ""}`}>
        {/* ── DOS LÍNEAS, Y NO NUEVE COLUMNAS ──
            Arriba, lo que dice SUNAT del mes: cuándo vence, si se presentó,
            con qué número y qué salió. Abajo, el rastro nuestro: quién lo
            apuntó, cuándo, y la conversación.
            En una sola línea no cabía: el número de orden salía en 9 px pegado
            a la fecha, «declaró S/ 0.00» chocaba con el botón de copiar de la
            celda anterior, y la barra de acciones —comprimida contra el borde—
            se comía el botón de reacciones, que desaparecía justo en las filas
            que tenían autor. Nada de eso daba error: simplemente no se veía.
            Son dos preguntas distintas y ahora se leen como dos. */}
        <div className="obl-l1">
        <span className="obl-per">{rotuloPeriodo(p.anio, p.mes)}</span>

        <span className="obl-venc" title={p.vence ? "Fecha de vencimiento" : META_SIT.sin_fecha.ayuda}>
          {p.vence ? dmy(p.vence) : "sin fecha"}
        </span>

        <span className="obl-sit" style={{ color: m.col }} title={m.ayuda}>
          {m.ico} {m.txt}
        </span>

        {/* ── DECLARADO TARDE NO ES «DECLARADO» A SECAS ──
            Sale en ámbar al lado del ✅ porque es lo que la SUNAT puede
            multar, y en la tabla vieja se perdía: una vez marcado, un mes
            presentado el día 3 y otro presentado tres meses después se veían
            idénticos. Solo se puede decir porque `declarado_en` es una fecha
            y no un booleano. */}
        {/* ── LA CELDA SE PINTA SIEMPRE, TENGA FECHA O NO ──
            Estaba dentro de un `&&`, así que en los periodos sin declarar
            desaparecía… y en una rejilla una celda que no se pinta no deja
            hueco: corre TODAS las de su derecha una posición. Por eso el
            resultado de una fila vencida no estaba a la misma altura que el de
            una declarada. No da error, no se nota mirando una fila, y hace que
            una tabla de veintiocho no se pueda leer en vertical — que es como
            se lee esta.
            Es la misma lección que ya costó una ronda en las facturas del
            fondo, y no se aplicó aquí. */}
        {!p.declarado_en ? <span /> : (
          <span className={`obl-fecha${tarde ? " tarde" : ""}${sinPlazo ? " sin-plazo" : ""}`}
            title={tarde
              ? `Se declaró el ${dmy(p.declarado_en)}, después del vencimiento`
              : sinPlazo
              ? `Se declaró el ${dmy(p.declarado_en)}. No hay fecha de vencimiento cargada para este periodo —el calendario de SUNAT de ese año no está en el sistema—, así que NO se puede saber si se presentó a tiempo.`
              : `Declarado el ${dmy(p.declarado_en)}`}>
            {tarde ? "⚠ " : ""}{dmy(p.declarado_en)}
            {/* El número de orden es LA PRUEBA: es lo que se cita si SUNAT
                pregunta. Sin él, la marca solo dice «creo que sí». */}
            {/* ── EL NÚMERO DE ORDEN SE COPIA, NO SE TRANSCRIBE ──
                Son diez dígitos que hay que pegar en SOL para sacar la
                constancia, y un dígito mal no da error: devuelve otra
                declaración o ninguna. Es el mismo problema del RUC que ya
                resolvió <Copiar/>, así que se usa el mismo botón en vez de
                inventar otro. Lo que se copia es el número PELADO, sin la
                almohadilla que se ve — pegar «#1133609320» en SOL no busca
                nada. */}
            {p.nro_orden && (
              <Copiar valor={String(p.nro_orden)} etiqueta="número de orden">
                <span className="obl-orden">#{p.nro_orden}</span>
              </Copiar>
            )}
            {/* Rectificada: la fecha de arriba sigue siendo la de la PRIMERA
                —es la que decide la puntualidad— y esto avisa de que hay una
                versión posterior, que es la que manda en los importes. */}
            {Array.isArray(p.rectificaciones) && p.rectificaciones.length > 0 && (
              <span className="obl-rect"
                title={`Rectificada ${p.rectificaciones.length} vez(ces): ${p.rectificaciones.map((r: any) => `${dmy(r.fecha)} (#${r.nroOrden})`).join(", ")}. La fecha de la izquierda es la de la PRIMERA presentación, que es la que decide si fue dentro de plazo.`}>
                ↻{p.rectificaciones.length}
              </span>
            )}
          </span>
        )}

        {/* ── CALCULADO, SALVO QUE ALGUIEN DIGA OTRA COSA ──
            Sin nada a mano manda la suma de los comprobantes; con algo a mano
            manda lo escrito, PERO se marca «a mano» y, si difiere de lo
            calculado, se enseñan los dos. Un número que discrepa en silencio
            de sus propios datos es la peor clase de dato: convincente. */}
        {/* ── LO QUE SE DECLARÓ, AL LADO DE LO QUE SE DEBÍA ──
            Es la columna que este módulo existía para poder tener. Sin ella,
            dieciocho periodos presentados y sin deuda se leían como «todo en
            orden» mientras dos de ellos iban declarados en cero con más de mil
            soles de crédito fiscal en sus facturas.
            El «sin usar» solo se pinta cuando la diferencia pasa de un sol: por
            debajo es el redondeo a soles enteros del PDT, y un ⚠ por cuarenta y
            cinco céntimos enseña a ignorar el de mil doscientos. */}
        <span className="obl-decl">
          {p.igv_credito != null ? (() => {
            const dif = Math.round(((igv?.credito ?? 0) - Number(p.igv_credito)) * 100) / 100;
            return (
              <>
                <span title={`Casilla 178 del PDT${p.declarado_orden ? ` · declaración #${p.declarado_orden}` : ""}. Casilla 101 (ventas): S/ ${Number(p.igv_debito || 0).toFixed(2)}.`}>
                  declaró <b>{soles(p.igv_credito)}</b>
                </span>
                {dif > 1 && (
                  <b className="obl-sinusar"
                    title={`Sus facturas suman S/ ${(igv?.credito ?? 0).toFixed(2)} de crédito fiscal y la declaración solo usó S/ ${Number(p.igv_credito).toFixed(2)}. Si el plazo lo permite, es rectificable — pregúntalo antes de mover nada.`}>
                    ⚠ sin usar {soles(dif)}
                  </b>
                )}
                {dif <= 1 && dif >= -1 && igv?.comprobantes ? (
                  <span className="obl-cuadra" title="Lo declarado coincide con las facturas cargadas.">✓</span>
                ) : null}
              </>
            );
          })() : (
            <span style={{ color: "var(--dim)" }}
              title="No se ha importado el detalle de casillas de este periodo, así que no sabemos qué cifras se declararon. Pégalo con «Importar de SUNAT».">
              —
            </span>
          )}
        </span>

        <span className="obl-res">
          {p.resultado ? (
            <>
              <b style={{ color: RESULTADOS.find(r => r.id === p.resultado)?.col || "var(--dim)" }}>
                {rotuloResultado(p)}
              </b>
              <span className="obl-manual" title="Fijado a mano; no sale de los comprobantes">a mano</span>
              {discrepa && (
                <span className="obl-discrepa"
                  title={`Las facturas del mes dicen ${calc!.txt}${calc!.monto ? ` S/ ${calc!.monto.toFixed(2)}` : ""} · ${calc!.detalle}`}>
                  ⚠ las facturas dicen otra cosa
                </span>
              )}
            </>
          ) : calc ? (
            <b style={{ color: calc.col }} title={calc.detalle}>
              {calc.txt}{calc.monto ? `: S/ ${calc.monto.toFixed(2)}` : ""}
            </b>
          ) : (
            /* ── SE DICE, PERO YA NO SE MANDA A NINGÚN SITIO ──
               Aquí había un enlace a /comprobantes con la empresa y el mes ya
               puestos. Se retiró: daba por hecho que lo que falta es una
               factura DE LA EMPRESA, y un comprobante puede estar cargado en la
               rendición de un fondo. Un atajo que apunta a un solo lugar cuando
               hay dos enseña que el otro no cuenta, y el mes seguiría saliendo
               «sin comprobantes» después de ir y volver.
               El hecho sí se sigue diciendo: no es «en cero», es que no se
               sabe. La diferencia importa y por eso no se calla. */
            <span className="obl-cargar"
              title="No hay comprobantes de este mes, ni propios de la empresa ni rendidos en un fondo, así que no se puede concluir nada. No es «en cero»: es que no se sabe.">
              sin comprobantes
            </span>
          )}
        </span>

        <span className="obl-nota">{p.nota || ""}</span>
        </div>

        <div className="obl-l2">
        {/* ── QUIÉN LO MARCÓ, Y CUÁNDO LO MARCÓ ──
            «Octubre 2025 · En cero · A MANO» no decía quién lo puso. En una
            lista donde marcar un mes es afirmar ante SUNAT que se presentó,
            una marca sin autor es una afirmación que nadie puede sostener el
            día que la observen.
            La fecha que se enseña es `registrado_en` —cuándo se apuntó AQUÍ— y
            no `declarado_en`, que es cuándo lo recibió SUNAT. Los 18 periodos
            de Wilkakalle se presentaron a lo largo de dos años y se apuntaron
            todos en un rato: mezclarlas haría creer que se marcó a tiempo algo
            que se regularizó después. */}
        <span className="obl-quien">
          {(() => {
            const q = perfilDe(p.declarado_por);
            /* Sin autor no se calla: un periodo marcado y sin nombre es una
               afirmación que nadie sostiene, y en gris se lee como lo que es
               —un dato que falta— en vez de como una celda vacía más. */
            if (!q) return p.declarado_en
              ? <i style={{ color: "var(--dim)" }}>sin autor registrado</i> : null;
            return (
              <>
                <Avatar nombre={q.nombre} src={q.avatar_url} color={q.color} size={16} />
                <b title={p.registrado_en
                  ? `${q.nombre} lo apuntó en CrewHub el ${new Date(p.registrado_en).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })}. Ojo: la fecha de la izquierda es la de SUNAT, y son cosas distintas.`
                  : `${q.nombre} lo apuntó, pero no consta cuándo: este periodo se marcó antes de que se guardara esa fecha. Los que entren de ahora en adelante sí la traen.`}>
                  {cortoDe(q)}
                </b>
                {/* ── EL «NO CONSTA» VIVE EN EL TÍTULO, NO EN LA FILA ──
                    Repetido en veintiocho filas dejaba de informar y pasaba a
                    ser ruido: lo que se lee entonces no es «falta un dato»,
                    es «esta pantalla está a medias». El hecho no se oculta —
                    sigue en el título del nombre, a un segundo de distancia—,
                    pero solo ocupa sitio cuando hay algo que decir. */}
                {p.registrado_en && (
                  <span style={{ color: "var(--dim)" }}>
                    lo apuntó el {dmy(String(p.registrado_en).slice(0, 10))}
                  </span>
                )}
              </>
            );
          })()}
        </span>

        <span style={{ flex: 1, minWidth: 0 }} />

        <span className="obl-acc">
          {/* ── HABLAR DEL MES, EN EL MES ──
              La misma barra que ya llevan las facturas, los RHE y el banco.
              Aquí hacía más falta que en ninguna: «¿por qué noviembre 2024 se
              declaró en cero si hay S/ 1,189 de crédito?» es la pregunta tipo
              de esta pantalla, y hasta ahora no tenía dónde vivir — se hacía
              por WhatsApp y la respuesta no volvía nunca a la fila, que es
              donde hará falta el día de la observación.
              Los tres botones de siempre van como `extra`, que es para lo que
              existe esa prop: la misma tarea no puede hacerse de dos maneras
              según la lista. */}
          <AccionesFila tabla="obligacion_periodo" filaId={p.id} userId={userId}
            reacciones={(p as any).reacciones} nComentarios={(p as any).nComentarios}
            caso={(p as any).caso}
            extra={
              <span style={{ display: "inline-flex", gap: 3 }}>
                {/* ── COMPROBARLO DONDE ESTÁ DE VERDAD ──
                    Aquí había cuatro casillas para pegar enlaces de Drive con
                    las constancias. Se quitaron: la fuente de verdad de si una
                    declaración está presentada es SUNAT y no un archivo
                    nuestro — y una copia que hay que mantener a mano se queda
                    vieja dando confianza. */}
                {urlSol && (
                  <a className="dato-btn" href={urlSol} target="_blank" rel="noopener noreferrer"
                    title={`Abrir SUNAT Operaciones en Línea para comprobar ${rotuloPeriodo(p.anio, p.mes)}`}>↗</a>
                )}
                {/* ── DECLARAR SE HACE IMPORTANDO, NO PULSANDO ──
                    Aquí había un ✓ «marcar declarado hoy». Escribía
                    `declarado_en = hoy`, que solo es cierto si se declara y se
                    marca el mismo día; cualquier otro uso graba una fecha
                    falsa y sin número de orden. En esta misma lista se ve el
                    resultado: de veintiocho periodos, el único sin constancia
                    es el que se marcó a mano.
                    No es que el botón estuviera mal hecho: es que competía con
                    el camino bueno. Entre importar la constancia —un PDF, un
                    pegado— y un clic que deja el ✅ igual de verde, gana el
                    clic, y el ✅ pasa a significar «alguien pulsó» en vez de
                    «SUNAT lo recibió».
                    Se queda el ↺, que es lo contrario: deshacer. Una
                    importación puede traer un periodo que no era, y sin forma
                    de desmarcarlo el error se queda para siempre. */}
                {p.declarado_en && (
                  <button className="dato-btn" disabled={ocupado}
                    title="Desmarcar: quita la fecha, el número de orden y quién lo apuntó. Úsalo si esta marca no corresponde a una declaración real."
                    onClick={() => correr(() => marcarDeclarado(p.id, null))}>↺</button>
                )}
                <button className="dato-btn" disabled={ocupado}
                  title="Corregir a mano el resultado o la fecha. Es la excepción: lo normal es importar la constancia de SUNAT, que trae la fecha y el número de orden."
                  onClick={() => setEditando(edit ? null : p.id)}>✎</button>
                {/* ── QUITAR UN MES QUE NADIE PIDE ──
                    Los periodos se generan a partir de una fecha, y esa fecha
                    puede estar mal: a Wilkakalle le salió un «abril 2024 ·
                    vencido» porque la generación arrancó en su constitución y
                    SUNAT no le pide nada antes de mayo.
                    Sin este botón esa fila se queda roja para siempre y el
                    titular cuenta un vencido que no existe — que es como se
                    aprende a no mirar el semáforo. Solo aparece en los NO
                    declarados: lo que tiene constancia no se borra de un clic. */}
                {!p.declarado_en && (
                  <button className="dato-btn" disabled={ocupado}
                    title="Quitar este periodo: úsalo cuando SUNAT no lo espera (es anterior al inicio de actividades, por ejemplo). Ajusta también «Sigue desde», o se volverá a generar."
                    onClick={() => quitar(p, o)}>✕</button>
                )}
              </span>
            } />
        </span>
        </div>

        {edit && (
          <div className="obl-ed">
            {/* ── ESTO ES LA EXCEPCIÓN, Y SE DICE AQUÍ ──
                Un formulario que se abre sin decir nada se usa por costumbre.
                Lo que se escriba aquí queda marcado «a mano» en la lista, pero
                esa etiqueta se ve DESPUÉS; el momento de saber que existe un
                camino mejor es antes de teclear. */}
            <div className="obl-ed-aviso">
              ✋ Lo normal es <b>Importar de SUNAT</b>: la constancia trae la fecha real
              y el número de orden, y eso es lo que se cita si te observan un periodo.
              Lo que pongas aquí queda como <b>a mano</b> — sin nada detrás que lo respalde.
            </div>
            <label className="obl-ed-campo">
              <span>Resultado del periodo</span>
              <span style={{ display: "flex", gap: 6 }}>
                <select defaultValue={p.resultado || ""}
                  onChange={e => correr(() => fijarResultadoPeriodo(p.id, e.target.value || null, p.monto))}>
                  <option value="">—</option>
                  {RESULTADOS.map(r => <option key={r.id} value={r.id}>{r.txt}</option>)}
                </select>
                {RESULTADOS.find(r => r.id === p.resultado)?.conMonto && (
                  <input type="number" step="0.01" defaultValue={p.monto ?? ""} placeholder="0.00"
                    style={{ width: 110 }}
                    onBlur={e => correr(() => fijarResultadoPeriodo(p.id, p.resultado, e.target.value))} />
                )}
              </span>
            </label>
            {/* La fecha real de presentación. Era el remedio del ✓ —que ponía
                HOY— y ahora que ese botón no está es la única forma de escribir
                una fecha sin constancia. Vaciarla desmarca el periodo, igual
                que el ↺. */}
            <label className="obl-ed-campo">
              <span>Declarado el</span>
              <input type="date" defaultValue={p.declarado_en || ""}
                onChange={e => correr(() => marcarDeclarado(p.id, e.target.value || null))} />
            </label>
          </div>
        )}
      </div>
    );
  };


  /* El formulario de alta de una obligación. Vive fuera de `bloqueEmpresa`
     por lo mismo que él: se pinta para cualquier empresa, con RUC o sin él. */
  const bloqueAlta = (e: Emp) => alta !== e.id ? null : (
    <div className="obl-alta">
      <select value={claseNueva} onChange={ev => setClaseNueva(ev.target.value)}>
        {CLASES.map(c => (
          <option key={c.clase} value={c.clase} title={c.ayuda}>
            {c.ico} {c.nombre}
          </option>
        ))}
      </select>
      <select value={respNuevo} onChange={ev => setRespNuevo(ev.target.value)}>
        <option value="">Sin responsable</option>
        {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <button className="btn" disabled={ocupado}
        onClick={() => correr(async () => {
          const r = await crearObligacion({
            entidadId: e.id, clase: claseNueva, responsable: respNuevo || null,
          });
          if (!(r as any)?.error) { setAlta(null); setRespNuevo(""); }
          return r;
        })}>Añadir</button>
      <button className="btn btn-ghost" onClick={() => setAlta(null)}>Cancelar</button>
      <span className="obl-ayuda">{claseDe(claseNueva)?.ayuda}</span>
    </div>
  );

  /* Una obligación con su semáforo y, desplegada, sus periodos. */
  const bloqueObligacion = (e: Emp, o: Obl) => {
      const ps = perPorObl.get(o.id) || [];
      const res = resumenPeriodos(ps, o);
      const ab = !!abierta[o.id];
      return (
        <div key={o.id} className={`obl-caja${o.activa ? "" : " fila-tenue"}`}>
          <button className="obl-cab" onClick={() => setAbierta(s => ({ ...s, [o.id]: !ab }))}>
            <span className="obl-flecha">{ab ? "▾" : "▸"}</span>
            <b>{icoClase(o.clase)} {nombreClase(o.clase)}</b>
            {/* El semáforo de la cabecera. Es lo que se viene a mirar;
                la lista de meses es el detalle de estos números. Lo que
                vale cero no se pinta: un «0 vencidos» en rojo apagado
                enseña a no mirar el rojo. */}
            <span className="obl-sem">
              {res.vencidos > 0 && (
                <b style={{ color: "var(--red)" }} title={META_SIT.vencido.ayuda}>
                  🔴 {res.vencidos} vencido{res.vencidos === 1 ? "" : "s"}
                </b>
              )}
              {res.porVencer > 0 && (
                <b style={{ color: "var(--yellow)" }} title={META_SIT.por_vencer.ayuda}>
                  🟡 {res.porVencer} por vencer
                </b>
              )}
              {res.sinFecha > 0 && (
                <b style={{ color: "var(--violet)" }} title={META_SIT.sin_fecha.ayuda}>
                  ⚠ {res.sinFecha} sin fecha
                </b>
              )}
              <span style={{ color: "var(--green)" }}>✅ {res.declarados}</span>
              {res.tarde > 0 && (
                <span style={{ color: "var(--yellow)" }}
                  title="Declarados después del vencimiento. Se sabe porque se guarda la fecha real de presentación.">
                  · {res.tarde} fuera de plazo
                </span>
              )}
              {/* ── LOS QUE NO SE PUEDEN JUZGAR ──
                  Sin fecha de vencimiento no hay «a tiempo» ni «tarde»: hay
                  «no lo sé». Contarlos aparte es lo que impide leer un bloque
                  entero sin ámbares como si estuviera limpio, cuando lo que
                  pasa es que el calendario de esos años no está cargado. */}
              {res.sinPlazo > 0 && (
                <span style={{ color: "var(--dim)" }}
                  title="Declarados, pero sin fecha de vencimiento con la que compararlos: el calendario de SUNAT de esos años no está cargado. No se sabe si fueron puntuales.">
                  · {res.sinPlazo} sin poder comprobar el plazo
                </span>
              )}
              <span style={{ color: "var(--dim)" }}>de {res.total}</span>
              {/* Los meses de un bloque apagado no suman al «de N», pero se
                  dicen: apagar no es esconder, y un mes que desaparece de la
                  cuenta sin dejar rastro es un mes que nadie va a revisar. */}
              {res.inactivos > 0 && (
                <span style={{ color: "var(--dim)" }} title={META_SIT.inactiva.ayuda}>
                  · ⏸ {res.inactivos} sin vigilar
                </span>
              )}
            </span>
          </button>

          {ab && (
            <div className="obl-lista">
              {ps.length === 0 && (
                <div className="eqf-vacio">
                  Sin periodos todavía. Pulsa «⟳ Generar periodos» arriba.
                </div>
              )}
              {ps.map(p => filaPeriodo(o, p, e.id))}
              <div className="obl-pie">
                {/* ── DESDE CUÁNDO SE LE SIGUE LA PISTA ──
                    Era el hueco que obligaba a tocar SQL para ver 2024:
                    sin este campo, `obligacion_generar` arrancaba «hace
                    un año» y no había forma de decirle otra cosa.
                    Vacío significa «desde que la empresa existe» —cae
                    en `fecha_constitucion`—, y la constitución es
                    además un SUELO: aunque se ponga una fecha anterior
                    no se generan meses en los que la empresa no
                    existía. Un vencido de entonces no es un pendiente,
                    es un error del sistema. */}
                <label className="obl-desde">
                  Sigue desde
                  <input type="date" value={o.desde || ""}
                    min={e.fecha_constitucion || undefined}
                    disabled={ocupado}
                    title={e.fecha_constitucion
                      ? `No puede ser anterior al ${dmy(e.fecha_constitucion)}, cuando se constituyó la empresa`
                      : "La empresa no tiene fecha de constitución cargada; sin ella, vacío significa «hace un año»"}
                    onChange={ev => correr(() => fijarDesdeObligacion(o.id, ev.target.value || null))} />
                  {/* ── LA CONSTITUCIÓN SE VE SIEMPRE, NO SOLO CUANDO EL CAMPO
                         ESTÁ VACÍO ──
                      Esto solo se pintaba con `!o.desde`, así que en cuanto
                      alguien tocaba el calendario la fecha de constitución
                      desaparecía — justo después de usar el control para el que
                      esa fecha es la referencia, y el suelo (`min` del input).
                      Quien acaba de poner 24/07/2021 no puede comprobar si
                      acertó porque el dato con el que compararlo se fue.
                      Se dice siempre; lo que cambia es la FRASE: sin fecha
                      explica qué significa el vacío, con fecha da el contexto. */}
                  {e.fecha_constitucion ? (
                    <span className="obl-desde-def">
                      {o.desde
                        ? `constituida el ${dmy(e.fecha_constitucion)}`
                        : `desde su constitución · ${dmy(e.fecha_constitucion)}`}
                    </span>
                  ) : !o.desde && (
                    <span className="obl-desde-def">
                      ⚠ hace un año — la empresa no tiene fecha de constitución
                    </span>
                  )}
                </label>
                {/* ── QUIÉN RESPONDE, CON CARA ──
                    El nombre suelto en gris al pie se lee como un dato de
                    relleno. Con la foto, quien abre la pantalla sabe de un
                    vistazo si la declaración es suya sin leer nada. */}
                <span className="obl-resp">
                  Avisa {o.dias_aviso} días antes ·
                  {(() => {
                    const r = perfilDe(o.responsable);
                    /* Hay responsable pero no está en la nómina: su cuenta se
                       apagó. Decir «sin responsable» sería lo contrario de la
                       verdad —hay dueño, ya no está— y mandaría a buscar a
                       alguien para algo que ya tiene a alguien. */
                    if (!r) return o.responsable
                      ? <span className="obl-sin-resp"> ⚠ responsable de baja</span>
                      : <span className="obl-sin-resp"> sin responsable</span>;
                    return (
                      <>
                        <Avatar nombre={r.nombre} src={r.avatar_url} color={r.color} size={20} />
                        {/* El corto, con el largo en el título: al pie de la
                            obligación se reconoce a quien responde, no se le
                            presenta. */}
                        <b title={r.nombre}>{cortoDe(r)}</b>
                      </>
                    );
                  })()}
                  {/* ── Y SE PUEDE CAMBIAR AQUÍ MISMO ──
                      Se elegía al crear la obligación y ahí se quedaba: la
                      única forma de corregirlo era el SQL Editor. Y no es un
                      dato decorativo — `rondaObligaciones` le abre el caso del
                      vencimiento a quien figure aquí, así que un encargado
                      viejo significa que el aviso le llega a quien ya no mira.
                      El desplegable va al lado del nombre y no en un botón de
                      «editar»: quien viene a cambiarlo está mirando justo eso.
                      Solo cambia de aquí en adelante; `declarado_por` de cada
                      mes ya apuntado es historia y no se toca. */}
                  <select className="obl-resp-sel" disabled={ocupado}
                    title="Cambiar quién responde por esta obligación de ahora en adelante"
                    value={o.responsable || ""}
                    onChange={ev => correr(() =>
                      cambiarResponsableObligacion(o.id, ev.target.value || null))}>
                    <option value="">sin responsable</option>
                    {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </span>
                <button className="dato-btn" disabled={ocupado}
                  title={o.activa
                    ? "Dar de baja. Los periodos ya declarados se conservan: son el historial ante SUNAT."
                    : "Volver a activar"}
                  onClick={() => correr(() => activarObligacion(o.id, !o.activa))}>
                  {o.activa ? "Dar de baja" : "Reactivar"}
                </button>
              </div>
            </div>
          )}
        </div>
      );
};

  /* ── EL BLOQUE DE UNA EMPRESA ──
     Se saca a una función porque ahora se pinta en dos sitios —las que tienen
     RUC y, al final y apagadas, las que no—. Duplicarlo habría garantizado que
     el segundo se quedara atrás al primer cambio. */
  const bloqueEmpresa = (e: Emp) => {
    const obls = oblPorEmp.get(e.id) || [];
    const dig = digitoRuc(e.ruc);
    const motivo = motivoNoDeclara(e);
    const rl = (repLegal || {})[e.id];
    return (
      <div key={e.id} style={{ marginBottom: 16 }}>
        <div className="sec-h">
          {/* ── LA CARA DE LA EMPRESA ──
              Diez asociaciones cuyo nombre empieza igual —Pumachay,
              Pichiuchallay, Pumahuasi— se distinguen por su logo mucho antes
              que leyendo. Sin logo va un 🏢 del mismo tamaño, nunca un hueco:
              una fila con imagen y otra sin ella se desalinean y la lista se
              lee en zig-zag. */}
          {(logos || {})[e.id]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={(logos || {})[e.id]} alt="" className="obl-logo" referrerPolicy="no-referrer" />
            : <span className="obl-logo obl-logo-rell">🏢</span>}
          {e.nombre}
          {/* El dígito ES la regla de esta empresa: de él sale cada una de sus
              doce fechas. Y si hoy no declara, el motivo — con su explicación
              en el tooltip, porque «en cierre» apagado se leería como «ya no
              debe nada» y en cierre se sigue declarando hasta la baja del RUC. */}
          <span className="sec-h-sub" title={motivo?.ayuda}>
            {motivo
              ? motivo.txt
              : `RUC ${e.ruc} · dígito ${dig}`}
          </span>
          {/* ── SOLO SE BLOQUEA LO IMPOSIBLE ──
              Sin RUC no hay dígito, sin dígito no hay fecha: crear ahí una
              obligación daría doce meses grises que no vigilan nada, así que
              el ＋ queda inerte y SOL desaparece —a SOL se entra CON un RUC—.
              Con RUC pero inactiva o en cierre, en cambio, SÍ se deja crear:
              eso es un criterio nuestro y puede estar equivocado —en cierre se
              sigue declarando hasta la baja del RUC—, y bloquearlo convertiría
              una opinión del sistema en una prohibición.
              El ＋ se deshabilita en vez de esconderse: un botón que existe
              para todas las demás y aquí no aparece se lee como un fallo. */}
          {/* ── QUIÉN FIRMA POR ELLA ──
              Aquí importa más que en ningún otro listado: es quien tiene la
              Clave SOL y quien responde si algo se venció. Si nadie tiene un
              cargo que lo haga representante, se DICE — dejarlo en blanco se
              lee como «no hace falta», y para presentar cualquier papel hace
              falta. */}
          {rl
            ? <span className="obl-rl" title={`Representante legal${rl.cargo ? ` · ${rl.cargo}` : ""}`}>
                <Avatar nombre={rl.nombre} src={rl.foto} size={20} />
                {rl.alias || rl.nombre}
              </span>
            : <span className="obl-rl obl-rl-no"
                title="Ningún miembro activo tiene cargo de representante legal, presidente, titular o gerente. Sin representante no hay quien firme ante SUNAT.">
                ⚠ sin representante
              </span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {e.ruc && <Copiar valor={e.ruc} etiqueta="RUC" />}
            {e.ruc && urlSol && (
              <a className="vtab" href={urlSol} target="_blank" rel="noopener noreferrer"
                title="Abrir SUNAT Operaciones en Línea (SOL). La clave está en el módulo de credenciales.">
                🔐 SUNAT ↗
              </a>
            )}
            {/* Solo donde tiene sentido: sin RUC no hay reporte de SOL que
                pegar, y sin obligaciones no habría dónde marcar nada. */}
            {!motivo && obls.length > 0 && (
              <ImportarSol empresaId={e.id} nombre={e.nombre} />
            )}
            {alta !== e.id && (
              <button className="vtab" disabled={motivo?.clase === "imposible"}
                title={motivo?.clase === "imposible"
                  ? motivo.ayuda
                  : "Añadir una obligación a esta empresa"}
                onClick={() => { setAlta(e.id); setClaseNueva(CLASES[0].clase); }}>
                ＋ Obligación
              </button>
            )}
          </span>
        </div>
        {bloqueAlta(e)}
        {obls.length === 0 && alta !== e.id && (
          <div className="eqf-vacio">
            Sin obligaciones registradas. Nada le vence a esta empresa en el sistema —
            que no es lo mismo que no deberle nada a SUNAT.
          </div>
        )}
        {obls.map(o => bloqueObligacion(e, o))}
      </div>
    );
  };

  return (
    <div>
      {error && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 12 }}>
          No se pudieron leer las obligaciones ({error}). Lo que falta es correr{" "}
          <b>db/obligaciones.sql</b> en Supabase.
        </div>
      )}
      {/* Si falta db/obligacion-hilo.sql la lista se pinta igual, sin
          contadores. Se dice UNA vez y con el nombre del archivo: una barra de
          acciones que no cuenta nada parece rota, y el silencio manda a buscar
          el fallo donde no está. */}
      <AvisoHilo error={hiloError} />
      {err && <div className="err-inline">⚠ {err}</div>}

      <div className="obl-barra">
        <button className="vtab" disabled={ocupado}
          title="Crear los meses que falten de todas las obligaciones. Se puede pulsar las veces que haga falta: no duplica nada."
          onClick={() => correr(() => generarPeriodos(null))}>
          {ocupado ? "⏳ generando…" : "⟳ Generar periodos"}
        </button>
      </div>

      {declaran.map(bloqueEmpresa)}

      {/* ── LAS QUE HOY NO DECLARAN, AL FINAL Y APAGADAS ──
          Sin constituir, inactivas, en cierre o cerradas. Mezcladas con las
          demás pesaban lo mismo que una empresa que sí declara.
          Apagadas, NO escondidas, y con sus obligaciones dentro: una empresa
          en cierre con cinco periodos vencidos es exactamente lo que no se
          puede perder de vista, y esconderla sería fabricar la tranquilidad
          que este módulo existe para no dar. Se encienden al pasar el cursor. */}
      {enEspera.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="sec-h sec-h-off">
            ○ Hoy no declaran · {enEspera.length}
            <span className="sec-h-sub">
              sin constituir, inactivas o en cierre — el motivo va en cada una.
              En cierre se sigue declarando hasta la baja del RUC.
            </span>
          </div>
          <div className="fila-tenue">{enEspera.map(bloqueEmpresa)}</div>
        </div>
      )}

      {empresas.length === 0 && (
        <div className="empty">No hay empresas propias registradas.</div>
      )}

      {/* El diálogo de confirmación vive al final y fuera de las filas: si se
          montara dentro de una, desaparecería al refrescarse la lista y la
          pregunta se cerraría sola sin respuesta. */}
      {dialogo}
    </div>
  );
}