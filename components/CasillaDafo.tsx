"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { hace } from "@/lib/notificaciones";
import { linkGmail, soloNombre, diasDesde, ORIGEN_VINCULO, esAcuse,
  claseCorreo, META_CLASE } from "@/lib/casilla";
import { marcarComunicacion, vincularComunicacion, casoDeComunicacion } from "@/app/casilla/acciones";
/* El alta vive en app/actions.ts y no aquí al lado: no es la mecánica de esta
   pantalla, es escribir una credencial de empresa —lo mismo que hace la ficha
   de la empresa—. Solo que se puede disparar desde donde se nota que falta. */
import { registrarCuentaDafo, quitarCuentaDafo } from "@/app/actions";
import { useConfirmar } from "@/components/useConfirmar";
import Copiar from "@/components/Copiar";

/* La lista de la casilla. Cliente porque cada fila hace tres cosas —marcar,
   vincular, abrir caso— y ninguna merece recargar la página entera.

   Dos secciones y no cinco: SIN LEER (lo que pide tu atención hoy) y el
   HISTORIAL agrupado por postulación (lo que se viene a buscar meses después,
   cuando hay que probar qué dijo DAFO y cuándo). */

type Com = {
  id: string;
  gmail_thread_id: string | null;
  buzon: string | null;
  cuenta: string | null;
  remitente: string | null;
  asunto: string | null;
  extracto: string | null;
  recibido_en: string;
  vinculo_por: string | null;
  pide_accion: boolean | null;
  leido_en: string | null;
  caso_id: string | null;
  postulacion_id: string | null;
  /* Nos la notificaron pero va dirigida a otro beneficiario. Ver
     db/vida-fondo.sql: no se borra —es la prueba de que se notificó mal— pero
     no cuelga de ningún fondo nuestro ni pide nada. */
  ajena?: boolean | null;
  destinatario?: string | null;
  /** `gmail` = lo empujó el Apps Script; `casilla` = lo registró una persona
   *  desde la Plataforma Virtual, que no avisa a ninguna parte. */
  origen?: string | null;
  doc_numero?: string | null;
  post?: { id: string; codigo: string | null; proy?: { nombre?: string | null } | null } | null;
  emp?: { id: string; nombre: string | null } | null;
};
type Opcion = { id: string; etiqueta: string; enJuego: boolean };
type Fila = {
  id: string; codigo: string; nombre: string; sinLeer: number;
  ultimo: string | null; ultimoId: string | null; ultimoAsunto: string | null;
  /** Correos que llegaron a esa cuenta y NO son de DAFO. */
  otros?: number;
  empresa: string | null; cuentas: string[]; rindiendo: boolean;
  convId: string; convCodigo: string; convNombre: string; anio: number | null;
};
type Cuenta = {
  correo: string; credId: string; empresa: string | null; empresaId: string;
  vivas: number; ultimo: string | null; ultimoId: string | null;
  total: number; esBuzon: boolean;
};
type Empresa = { id: string; nombre: string; vivas: number };

/* Cuántos correos ya leídos se muestran por postulación antes de recortar. */
const POR_GRUPO = 3;

export default function CasillaDafo({
  items, opciones, resumen, inventario, empresas, ocultas, aniosOcultos, cuentasError, tope,
}: {
  items: Com[]; opciones: Opcion[]; resumen: Fila[]; inventario: Cuenta[];
  empresas: Empresa[]; ocultas: number; aniosOcultos: number[];
  cuentasError: string | null; tope: number;
}) {
  const router = useRouter();
  const [pend, arrancar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);
  const [verCuentas, setVerCuentas] = useState(false);
  const [nueva, setNueva] = useState({ correo: "", empresaId: "" });
  const [destello, setDestello] = useState<string | null>(null);
  const { pedir, dialogo } = useConfirmar();

  /* ══════════════════════════════════════════════════════════════════════
     ESTA BANDEJA ES DE LO QUE LLEGA SOLO

     Un correo aparece aquí porque el Apps Script lo empujó: nadie lo ha visto
     todavía, y por eso «sin leer» significa algo. Una carta que alguien
     DESCARGÓ de la Plataforma Virtual y registró a mano es lo contrario: ya la
     vio, ya la leyó, y la registró justamente para dejar constancia. Meterla
     en la misma lista —y encima como pendiente— era pedirle que se enterase de
     lo que acababa de hacer.

     Su sitio es el histórico del fondo (la pestaña «Vida del fondo»). Aquí se
     quedan en un cajón aparte al final, para que las que no cuelguen de ningún
     fondo no desaparezcan de la vista.
     ══════════════════════════════════════════════════════════════════════ */
  const deCorreo = useMemo(() => items.filter(c => (c.origen || "gmail") === "gmail"), [items]);
  const aMano = useMemo(() => items.filter(c => (c.origen || "gmail") !== "gmail"), [items]);

  /* Sin leer arriba y, dentro, lo que parece pedir algo primero: entre dos
     correos del mismo día, uno que dice «subsanación» no vale lo mismo que un
     acuse de recibo. */
  const sinLeer = useMemo(() => deCorreo.filter(c => !c.leido_en)
    .sort((a, b) => Number(!!b.pide_accion) - Number(!!a.pide_accion)), [deCorreo]);
  const leidos = useMemo(() => deCorreo.filter(c => !!c.leido_en), [deCorreo]);

  /* El historial, por postulación. Las que no tienen vínculo van juntas al
     final: son una pregunta pendiente, no un grupo más. */
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; coms: Com[] }>();
    leidos.forEach(c => {
      const k = c.postulacion_id || "_";
      const titulo = c.post
        ? `🎯 ${c.post.codigo || "sin código"}${c.post.proy?.nombre ? ` · ${c.post.proy.nombre}` : ""}`
        : "❓ Sin vincular";
      const g = m.get(k) || { titulo, coms: [] };
      g.coms.push(c); m.set(k, g);
    });
    return [...m.entries()].sort((a, b) => (a[0] === "_" ? 1 : b[0] === "_" ? -1 : 0));
  }, [leidos]);

  /* ── LLEGAR DESDE UNA NOTIFICACIÓN (/casilla#c-<id>) ──
   *
   * El ancla de un correo solo existe si ese correo está pintado, y por
   * defecto no lo está: los grupos vienen recortados a tres. Por eso hay que
   * abrir TODO antes de buscarlo.
   *
   * La primera versión hacía eso y aun así el clic no llevaba a ninguna parte.
   * Dos motivos, y los dos son el mismo error de fondo —dar por hecho que algo
   * ya ocurrió en vez de comprobarlo—:
   *
   * 1. UN SOLO `requestAnimationFrame` NO BASTA. `setVerTodo(true)` no repinta
   *    al instante: React programa el repintado y el rAF puede llegar antes.
   *    Se buscaba un elemento que todavía no existía, no se encontraba, y no
   *    pasaba nada. Ahora se INSISTE hasta que aparece.
   *
   * 2. ESTANDO YA EN /casilla NO PASABA NADA EN ABSOLUTO. Next navega sin
   *    remontar el componente, así que un efecto con dependencias vacías no
   *    se vuelve a ejecutar: el segundo aviso que se pulsaba —y el primero, si
   *    ya estabas en la casilla— cambiaba la URL y nada más. Se escucha
   *    `hashchange`, que es el evento que sí ocurre.
   *
   * Y si el correo de verdad no está en esta pantalla (es más viejo que los
   * últimos `tope`), se DICE. Dejar a alguien arriba del todo preguntándose si
   * pulsó bien es el fallo silencioso que este panel entero viene a evitar. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let vivo = true;

    const irAlHash = () => {
      const h = window.location.hash;
      if (!h.startsWith("#c-")) return;
      const id = h.slice(3);
      setVerTodo(true);
      setDestello(id);

      /* Se insiste ~40 cuadros (poco menos de un segundo). Es tiempo de sobra
         para un repintado y poco para que nadie note la espera. */
      let intentos = 0;
      const buscar = () => {
        if (!vivo) return;
        const el = document.getElementById(`c-${id}`);
        if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        if (++intentos > 40) {
          setAviso(`Ese correo no está en esta pantalla: solo se cargan los últimos ${tope}. `
            + "Búscalo en Gmail o pide subir el tope.");
          setDestello(null);
          return;
        }
        requestAnimationFrame(buscar);
      };
      requestAnimationFrame(buscar);
    };

    irAlHash();
    window.addEventListener("hashchange", irAlHash);
    return () => { vivo = false; window.removeEventListener("hashchange", irAlHash); };
  }, [tope]);

  /* El resaltado se apaga solo, venga de donde venga el salto. Si se quedara,
     la próxima visita mostraría una fila marcada sin que nadie sepa por qué. */
  useEffect(() => {
    if (!destello) return;
    const t = setTimeout(() => setDestello(null), 2000);
    return () => clearTimeout(t);
  }, [destello]);

  /* ¿Algún grupo está recortado? Decide si el «ver todos» tiene sentido. */
  const hayRecorte = useMemo(() => grupos.some(([, g]) => g.coms.length > POR_GRUPO), [grupos]);

  const correr = (fn: () => Promise<any>) => arrancar(async () => {
    setAviso(null);
    const r = await fn();
    if (r?.error) setAviso(r.error);
    router.refresh();
  });

  /* Dar de alta una cuenta suelta. No reusa `correr` por una razón: cuando el
     alta falla —el correo ya estaba en otra empresa, o está mal escrito— los
     campos NO se limpian. Vaciar el formulario junto con el mensaje de error
     obliga a teclear otra vez lo que acabas de teclear, justo en el momento en
     que ya te equivocaste una vez. */
  const darDeAlta = () => arrancar(async () => {
    setAviso(null);
    const r: any = await registrarCuentaDafo(nueva.correo, nueva.empresaId);
    if (r?.error) { setAviso(r.error); return; }
    setNueva({ correo: "", empresaId: "" });
    router.refresh();
  });

  /* Compitiendo y ganadoras van en dos tiras, no en una de treinta tarjetas. */
  const compitiendo = useMemo(() => resumen.filter(r => !r.rindiendo), [resumen]);
  const rindiendo = useMemo(() => resumen.filter(r => r.rindiendo), [resumen]);
  /* Las cuentas por las que nunca entró un correo. El maestro no cuenta: por
     él no entra nada por definición, y verlo aquí como problema mandaría a
     revisar un reenvío que no existe. */
  const mudas = useMemo(() => inventario.filter(c => c.total === 0 && !c.esBuzon), [inventario]);

  /* La cadena que Gmail espera en «Para:». Sin el buzón maestro: él no es una
     cuenta de postulación, y meterlo etiquetaría como DAFO todo lo que llegue a
     esa dirección. */
  const paraFiltro = useMemo(
    () => inventario.filter(c => !c.esBuzon).map(c => c.correo).join(" OR "), [inventario]);

  /* Quitar una cuenta mal colgada. Se confirma, y la pregunta NOMBRA el correo
     y la empresa: en una tabla de veintitrés renglones iguales, un «¿seguro?» a
     secas no deja comprobar que el ✕ pulsado era el de la fila que se miraba.

     Y dice qué se pierde. Borrar la cuenta no borra los correos que ya entraron
     por ella —esos quedan, con su vínculo— pero sí deja a esa empresa sin la
     vía «cuenta» de ahí en adelante. Son dos consecuencias distintas y quien
     pulsa merece saber cuál es cuál. */
  /* La confirmación va FUERA de la transición. `arrancar` espera una función
     síncrona: al meterle una `async` que se queda esperando el clic del diálogo,
     React da la transición por terminada en el primer `await` y la respuesta del
     usuario cae en el vacío — el ✕ no hacía nada. La transición envuelve solo la
     llamada al servidor, que es lo único que dura. */
  const quitar = async (c: Cuenta) => {
    const ok = await pedir(
      <>Se quitará <b>{c.correo}</b> de <b>{c.empresa || "su empresa"}</b>.
        Los {c.total} correo{c.total === 1 ? "" : "s"} que ya entraron por ella se quedan;
        lo que se pierde es que los próximos se vinculen solos por la cuenta.</>,
      { titulo: "Desconectar cuenta", aceptar: "Quitar", peligro: true },
    );
    if (!ok) return;
    correr(() => quitarCuentaDafo(c.credId, c.empresaId, c.correo));
  };

  /* ── DEL RESUMEN AL CORREO ──
     Ver «hace 12 d» y tener que bajar a buscar de qué iba era el viaje que este
     panel venía a ahorrar. Ahora el asunto se lee en la misma fila, y el clic
     lleva al correo entero —donde están el remitente, el extracto, «ver en
     Gmail», «marcar leído» y «abrir caso»—, no a Gmail directo: saltar fuera
     del panel dejaría el correo sin marcar y el caso sin abrir.

     Abre el historial completo ANTES de saltar: si ese correo ya estaba leído y
     su grupo venía recortado a tres, el ancla no existe en el DOM y el clic no
     lleva a ninguna parte. El mismo fallo silencioso que ya tenía el enlace de
     las notificaciones. */
  /* Va por el hash y no directamente al DOM: así el salto de dentro del panel
     y el que llega desde una notificación recorren EXACTAMENTE el mismo camino
     —insistir hasta que el ancla exista, avisar si nunca aparece— en vez de
     tener dos versiones que se corrigen por separado. Que la URL quede
     apuntando al correo es además lo que permite compartir el enlace.
     El apagado del resaltado tampoco se repite aquí: lo lleva su propio efecto. */
  const irAlCorreo = (id: string) => {
    if (window.location.hash === `#c-${id}`) {
      /* Mismo hash: `hashchange` no se dispara y el salto se perdería. Es el
         caso de pulsar dos veces la misma fila del resumen. */
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    window.location.hash = `c-${id}`;
  };

  /* ── LA TIRA, CORTADA POR CONVOCATORIA ──
     Veintiuna tarjetas de nueve concursos distintos revueltas: ubicar «las del
     C-072» era leerlas todas. Es el mismo corte que ya hace /postulaciones y se
     pinta igual —línea violeta, código en versalitas, nombre en texto normal—
     para que las dos pantallas se lean con el mismo ojo.

     El orden DENTRO de cada bloque no cambia: lo más silencioso primero. El
     agrupado responde «¿dónde está el C-072?»; el orden sigue respondiendo
     «¿de quién no sabemos nada?», que es para lo que existe esta tira.

     El año va pegado al código y no en un nivel propio: aquí solo salen las
     postulaciones vivas y casi todas son del año en curso, así que un segundo
     separador estaría siempre vacío. */
  const variosAnios = useMemo(
    () => new Set(resumen.map(r => r.anio).filter(a => a != null)).size > 1, [resumen]);

  const bloques = (filas: Fila[]) => {
    const m = new Map<string, { codigo: string; nombre: string; anio: number | null; filas: Fila[] }>();
    filas.forEach(r => {
      const g = m.get(r.convId) || {
        codigo: r.convCodigo || "Sin convocatoria", nombre: r.convNombre, anio: r.anio, filas: [],
      };
      g.filas.push(r); m.set(r.convId, g);
    });
    /* Por código, el mismo orden que el combo de /postulaciones; las sueltas al
       final, que es donde va una pregunta pendiente. */
    return [...m.entries()].sort((x, z) =>
      (x[0] ? 0 : 1) - (z[0] ? 0 : 1) || x[1].codigo.localeCompare(z[1].codigo));
  };

  /* UNA sola tabla por sección, con la convocatoria como fila de cabecera. La
     versión anterior abría una tabla por concurso y cada una se medía sola: las
     columnas no coincidían entre bloques y la vista parecía un montón de
     tablitas apiladas. Con un `<colgroup>` y un `<tbody>` por grupo, el corte
     por concurso sigue estando y todas las filas caen en la misma reja. */
  const tira = (filas: Fila[]) => {
    const gs = bloques(filas);
    /* Un separador SEPARA: con un solo concurso en la tira no hay nada que
       separar y la cabecera solo repetiría el título de arriba. */
    const varias = gs.length > 1;
    return (
      <table className="cas-tabla">
        {/* Los anchos, decididos aquí y no por el contenido. La cuenta y el
            «cuándo» son de largo conocido, así que van fijos; lo que sobra se
            reparte entre la postulación y el asunto, que son los dos que de
            verdad pueden ser largos. */}
        <colgroup>
          <col /><col style={{ width: 200 }} /><col /><col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Postulación</th>
            <th>Cuenta</th>
            <th>Último correo</th>
            <th className="cas-num">Cuándo</th>
          </tr>
        </thead>
        {gs.map(([k, g]) => (
          <tbody key={k || "sin-conv"}>
            {varias && (
              <tr className="cas-grupo">
                <td colSpan={4}>
                  <div className="cas-grupo-l">
                    <span className="cas-grupo-cod">
                      {g.codigo}{variosAnios && g.anio ? ` · ${g.anio}` : ""}
                    </span>
                    {/* El nombre en texto normal: en versalitas, seis palabras
                        son un muro y el código deja de resaltar. */}
                    {g.nombre && <span className="cas-grupo-nom">{g.nombre}</span>}
                    <span className="cas-grupo-n">· {g.filas.length}</span>
                    <span className="cas-grupo-r" />
                  </div>
                </td>
              </tr>
            )}
            {g.filas.map(filaResumen)}
          </tbody>
        ))}
      </table>
    );
  };

  /* Una fila del resumen. Cuatro columnas y en este orden: quién es, por dónde
     le hablan, QUÉ le dijeron, y cuánto hace. La tercera es la que faltaba: sin
     el asunto, cada «hace 12 d» costaba un viaje al historial. */
  const filaResumen = (r: Fila) => {
    const d = diasDesde(r.ultimo);
    const col = d === null ? "var(--dim)" : d > 30 ? "var(--yellow)" : "var(--teal)";
    /* Si la lista de cuentas no se pudo leer, TODAS saldrían sin cuenta: veinte
       alarmas rojas por un fallo de lectura. Una alarma que se enciende cuando
       el sistema no sabe la respuesta enseña a ignorarla, así que aquí se calla
       y el motivo se dice una sola vez arriba. */
    const falta = r.cuentas.length === 0 && !cuentasError;
    /* Fresco = llegó en los últimos tres días. Las dos marcas conviven en la
       misma fila: el tinte dice «aquí pasó algo hace poco» y el filete rojo del
       borde dice «a esta no le puede pasar nada». No se estorban porque hablan
       de cosas distintas — y una fila puede ser las dos a la vez. */
    const fresco = d !== null && d <= 3;
    return (
      <tr key={r.id}
        className={[falta ? "cas-falta" : "", fresco ? "cas-fresco" : ""].filter(Boolean).join(" ") || undefined}>
        {/* El `title` en la celda y no solo en el enlace: con columnas rígidas
            un nombre largo se corta, y el texto completo tiene que seguir a un
            reposo del ratón de distancia. */}
        <td title={`${r.codigo}${r.nombre ? ` · ${r.nombre}` : ""}`}>
          <Link href={`/entidad/postulacion/${r.id}`}
            style={{ color: "var(--text)", fontWeight: 600 }}>🎯 {r.codigo}</Link>
          {/* El nombre pesa lo mismo que el código: son las dos formas de
              nombrar lo mismo y quien busca «Pampacucho» tiene tanto derecho a
              encontrarlo de un vistazo como quien busca «PO-022». En gris tenue
              obligaba a leer la columna dos veces, una por cada criterio.
              El tono se queda un punto por debajo (`muted`, no `text`): el
              código es el identificador y sigue entrando primero. */}
          {r.nombre && (
            <span style={{ color: "var(--muted)", fontWeight: 600 }}> · {r.nombre}</span>
          )}
        </td>
        <td style={{ fontSize: 11.5 }} title={r.cuentas.join("\n") || undefined}>
          {falta ? (
            <span style={{ color: "var(--red)" }}
              title={r.empresa
                ? `Ninguna cuenta de correo está registrada en ${r.empresa}. Regístrala abajo o en su ficha.`
                : "Esta postulación no tiene empresa, así que no hay dónde colgar su cuenta de correo."}>
              ✖ sin cuenta
            </span>
          ) : r.cuentas.length === 0 ? (
            <span style={{ color: "var(--dim)" }}>—</span>
          ) : (
            <span title={r.cuentas.join("\n")}>
              {r.cuentas[0]}
              {r.cuentas.length > 1 && (
                <span style={{ color: "var(--dim)" }}> +{r.cuentas.length - 1}</span>
              )}
            </span>
          )}
        </td>
        <td title={r.ultimoAsunto || undefined}>
          {r.ultimoId ? (
            /* El recorte lo hace la celda (la columna tiene ancho fijo), así que
               el botón solo tiene que ocuparla entera y dejarse cortar. */
            <button type="button" onClick={() => irAlCorreo(r.ultimoId!)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                font: "inherit", color: "var(--text)", textAlign: "left",
                display: "block", width: "100%",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.ultimoAsunto}
            </button>
          ) : r.otros ? (
            /* Llegó correo, pero nada de DAFO. Decirlo cambia el diagnóstico
               entero: la cuenta funciona y el reenvío también, así que el
               silencio es del Ministerio y no de la instalación. Un «—» a
               secas mandaba a revisar filtros que están bien. */
            <span style={{ color: "var(--dim)", fontStyle: "italic" }}
              title="La cuenta recibe correo —así que el reenvío funciona— pero nada de DAFO todavía. Los otros correos están en la lista de abajo.">
              {r.otros} correo{r.otros === 1 ? "" : "s"}, ninguno de DAFO
            </span>
          ) : (
            <span style={{ color: "var(--dim)" }}>—</span>
          )}
        </td>
        <td className="cas-num" style={{ color: col, fontSize: 11.5 }}>
          {d === null
            ? (r.otros ? <span style={{ color: "var(--dim)" }}>sin señal de DAFO</span> : "nunca llegó nada")
            : d === 0 ? "hoy" : `hace ${d} d`}
          {r.sinLeer > 0 && <span style={{ color: "var(--red)" }}> · {r.sinLeer} sin leer</span>}
        </td>
      </tr>
    );
  };

  const chipVinculo = (c: Com) => {
    const o = c.vinculo_por ? ORIGEN_VINCULO[c.vinculo_por] : null;
    if (!c.post) {
      return (
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          {c.emp?.nombre ? `🏢 ${c.emp.nombre} · sin postulación` : "sin vincular"}
        </span>
      );
    }
    return (
      <span style={{ fontSize: 11, display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Link href={`/entidad/postulacion/${c.post.id}`} style={{ color: "var(--green)", fontWeight: 600 }}>
          🎯 {c.post.codigo || "postulación"}
        </Link>
        {o && <span style={{ color: o.col }} title={o.txt}>{o.ico}</span>}
      </span>
    );
  };

  const fila = (c: Com) => {
    const url = linkGmail(c.gmail_thread_id, c.buzon);
    const clase = claseCorreo(c.remitente, c.asunto, c.extracto, c.vinculo_por);
    /* La 🚨 se recalcula aquí y no se cree la columna a ciegas. La ingesta ya
       no la enciende para correo ajeno, pero los mensajes guardados ANTES de
       esa corrección siguen con `pide_accion` puesto: sin esto, la casilla
       seguiría alarmando por un boletín hasta que alguien limpiara la tabla.
       Una regla nueva tiene que aplicarse también a lo que ya estaba. */
    const alarma = c.pide_accion && clase === "dafo";
    return (
      <div key={c.id} id={`c-${c.id}`} className={`card${destello === c.id ? " cas-destello" : ""}`}
        style={{ display: "flex", flexDirection: "column", gap: 4,
          borderLeft: alarma && !c.leido_en ? "3px solid var(--red)" : undefined }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 220 }}>
            {alarma ? "🚨 " : esAcuse(c.asunto) ? "🧾 " : ""}{c.asunto || "(sin asunto)"}
          </span>
          {/* Que no es nuestra se dice EN LA FILA, no en un detalle: si no,
              dentro de un año alguien la lee como un requerimiento propio sin
              contestar y se lleva un susto que no toca. */}
          {/* ── DE DÓNDE VINO ──
              Una carta registrada a mano no tiene remitente ni extracto, así
              que en la fila salía un «—» y parecía un correo roto. No lo es:
              es de la otra ventanilla, la que no manda nada por correo. */}
          {(c.origen && c.origen !== "gmail") && (
            <span className="badge" title="Registrada a mano desde la Plataforma Virtual de Atención a la Ciudadanía: esa casilla no avisa por correo."
              style={{ color: "var(--violet)", background: "rgba(124,92,255,.12)", fontSize: 10 }}>
              📄 de la casilla electrónica
            </span>
          )}
          {c.ajena && (
            <span className="badge" title={c.destinatario ? `Va dirigida a ${c.destinatario}` : "Nos la notificaron por error"}
              style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontWeight: 700 }}>
              ⚠ no es nuestra{c.destinatario ? ` · ${c.destinatario}` : ""}
            </span>
          )}
          {chipVinculo(c)}
          <span style={{ color: "var(--dim)", fontSize: 11 }}>{hace(c.recibido_en)}</span>
        </div>

        <div style={{ color: "var(--dim)", fontSize: 11.5, display: "flex", gap: 7,
          alignItems: "center", flexWrap: "wrap" }}>
          {/* De qué es este correo. En la lista SÍ salen todos —un aviso de
              seguridad en la cuenta por donde llegan las notificaciones del
              Estado es de los que hay que ver— pero cada uno dice lo que es,
              así que el ojo separa sin leer los asuntos uno por uno. */}
          {(() => {
            if (clase === "dafo") return null;   // lo normal aquí no se etiqueta
            const m = META_CLASE[clase];
            return (
              <span className="badge" title={m.ayuda}
                style={{ color: m.col, background: `color-mix(in srgb, ${m.col} 12%, transparent)`,
                  fontSize: 10 }}>
                {m.ico} {m.txt}
              </span>
            );
          })()}
          <span>{soloNombre(c.remitente)}{c.cuenta ? ` → ${c.cuenta}` : ""}</span>
        </div>

        {c.extracto && (
          <div style={{ fontSize: 12, color: "var(--dim)", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {c.extracto}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          {url && (
            <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11.5 }}>✉ ver en Gmail ↗</a>
          )}
          <button type="button" className="btn btn-ghost" disabled={pend} style={{ fontSize: 11.5 }}
            onClick={() => correr(() => marcarComunicacion(c.id, !c.leido_en))}>
            {c.leido_en ? "↩ marcar sin leer" : "✓ leído"}
          </button>
          {c.caso_id ? (
            <Link className="btn btn-ghost" href={`/caso/${c.caso_id}`} style={{ fontSize: 11.5, color: "var(--teal)" }}>
              📌 ver su caso
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={pend} style={{ fontSize: 11.5 }}
              onClick={() => correr(() => casoDeComunicacion(c.id))}>
              📌 abrir caso
            </button>
          )}
          {/* Vincular a mano. Es la salida cuando el asunto no trae código y la
              empresa tiene varias postulaciones en juego: el sistema no
              adivina, pregunta. */}
          <select className="btn btn-ghost" disabled={pend} defaultValue={c.postulacion_id || ""}
            style={{ fontSize: 11.5, maxWidth: 260 }}
            onChange={e => correr(() => vincularComunicacion(c.id, e.target.value || null))}>
            <option value="">— sin vincular —</option>
            {opciones.map(o => (
              <option key={o.id} value={o.id}>{o.enJuego ? "● " : "○ "}{o.etiqueta}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <>
      {dialogo}
      {aviso && (
        <div className="empty" style={{ color: "var(--red)", marginBottom: 10 }}>{aviso}</div>
      )}

      {/* Sin la lista de cuentas, media pantalla dice menos de lo que parece.
          Decirlo aquí es lo que evita leer «nunca llegó nada» como un hecho
          sobre DAFO cuando en realidad es un hueco nuestro. */}
      {cuentasError && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          No se pudieron leer las cuentas de correo, así que esta pantalla no puede decir
          por dónde le llega a cada postulación: {cuentasError}
        </div>
      )}

      {/* ── El silencio, medido ──
          Un correo que no llegó no aparece en ninguna bandeja. Esta tira es lo
          único del panel que habla de lo que NO pasó.

          Cada tarjeta dice ADEMÁS por qué cuenta tendría que llegarle. Sin eso,
          «nunca llegó nada» se leía como una noticia sobre DAFO cuando muchas
          veces era una noticia sobre nosotros: nadie registró la cuenta. */}
      {compitiendo.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "4px 0 8px", letterSpacing: .5 }}>
            ⏱ Última señal · compitiendo · {compitiendo.length}
          </h2>
          <div style={{ marginBottom: 18 }}>{tira(compitiendo)}</div>
        </>
      )}

      {/* Las ganadoras aparte: reciben MÁS correo que ninguna —todo el hilo de
          la rendición— y con otro significado. Mezcladas en una sola tira de
          treinta, las dos listas dejaban de leerse. */}
      {rindiendo.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "4px 0 8px", letterSpacing: .5 }}>
            🏆 Última señal · ganadoras rindiendo · {rindiendo.length}
          </h2>
          <div style={{ marginBottom: 18 }}>{tira(rindiendo)}</div>
        </>
      )}

      {/* Lo escondido se DICE. Un filtro callado convierte «no aparece» en «no
          existe», y el día que alguien busque su postulación de 2027 aquí y no
          la encuentre, el panel habría mentido sin que nadie pudiera notarlo. */}
      {ocultas > 0 && (
        <div style={{ color: "var(--dim)", fontSize: 11, margin: "0 4px 16px" }}>
          {ocultas} postulación{ocultas === 1 ? "" : "es"} de {aniosOcultos.join(" y ")} fuera de la
          lista: todavía no reciben correo. Aparecerán en cuanto les llegue el primero.
        </div>
      )}

      {/* ── EL INVENTARIO DE CUENTAS ──
          La única vista que puede detectar el fallo más caro de todo esto: una
          cuenta a la que se le olvidó activar el reenvío. Ese fallo no produce
          ningún error en ninguna parte — la cuenta simplemente nunca aparece, y
          sus postulaciones se ven exactamente igual que si DAFO no hubiera
          escrito. Se abre plegada porque no es trabajo diario; el titular con
          las mudas está siempre a la vista, que es lo que hay que mirar. */}
      {/* La condición mira las EMPRESAS y no las cuentas: si no hay ninguna
          cuenta registrada todavía, es justo cuando más falta hace el
          formulario, y esconderlo por «no hay nada que mostrar» dejaba la
          pantalla sin salida el único día que importa. */}
      {empresas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setVerCuentas(v => !v)}>
            📧 {inventario.length} cuentas registradas
            {mudas.length > 0 && (
              <span style={{ color: "var(--yellow)" }}> · {mudas.length} nunca trajeron nada</span>
            )}
            <span style={{ color: "var(--dim)" }}> {verCuentas ? "▾" : "▸"}</span>
          </button>

          {verCuentas && (
            <div style={{ marginTop: 8 }}>
              {/* El alta, aquí y no en la ficha de la empresa: este es el sitio
                  donde se NOTA que una cuenta falta —la tabla de abajo dice
                  cuáles hay y la de arriba cuáles se echan de menos—, y mandar
                  a buscar la ficha desde aquí perdía el hallazgo por el camino.
                  Lo que escribe es exactamente una credencial de Gmail de esa
                  empresa: lo mismo que la ficha, sin el viaje. */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap",
                alignItems: "center", margin: "0 0 10px" }}>
                <input type="email" placeholder="cuenta@gmail.com" value={nueva.correo}
                  onChange={e => setNueva({ ...nueva, correo: e.target.value })}
                  style={{ background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "5px 9px", fontSize: 12, outline: "none", width: 210 }} />
                <select value={nueva.empresaId}
                  onChange={e => setNueva({ ...nueva, empresaId: e.target.value })}
                  className="btn btn-ghost" style={{ fontSize: 12, maxWidth: 230 }}>
                  <option value="">— ¿de qué empresa? —</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.vivas > 0 ? "● " : "○ "}{e.nombre}</option>
                  ))}
                </select>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 11px" }}
                  disabled={pend || !nueva.correo.trim() || !nueva.empresaId}
                  onClick={darDeAlta}
                  title="Queda como credencial de Gmail de esa empresa — la misma que se ve en su ficha.">
                  ＋ dar de alta
                </button>
              </div>

              {/* ── LA LISTA PARA EL FILTRO DE GMAIL ──
                  El único paso del montaje que vive fuera de CrewHub+: el filtro
                  del buzón maestro etiqueta por destinatario, y esa lista hay que
                  mantenerla a mano en Gmail. Transcribir veinte correos es
                  exactamente la tarea donde se pierde uno — y perder uno no
                  produce ningún error: esa cuenta simplemente deja de traer
                  correo para siempre.
                  Así que la lista la escribe la base, ya con los « OR » puestos,
                  y siempre está al día. El maestro se excluye: filtrar por él
                  metería en la casilla todo lo que llega a esa cuenta. */}
              {paraFiltro && (
                <div style={{ color: "var(--dim)", fontSize: 11, margin: "0 0 10px",
                  display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  <Copiar valor={paraFiltro} etiqueta="la lista de cuentas">
                    ⧉ copiar para el filtro de Gmail
                  </Copiar>
                  <span>
                    → maestro → ⚙ Filtros → Crear un filtro → pegar en <b>Para:</b> → etiqueta «DAFO».
                    Al alta de una cuenta nueva hay que rehacer ese filtro.
                  </span>
                </div>
              )}

              <table className="cas-tabla">
                <colgroup>
                  <col style={{ width: 250 }} /><col />
                  <col style={{ width: 60 }} /><col style={{ width: 290 }} />
                  <col style={{ width: 34 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Empresa</th>
                    <th className="cas-num">Vivas</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inventario.map(c => {
                    const d = diasDesde(c.ultimo);
                    return (
                      <tr key={c.correo} className={c.total === 0 && !c.esBuzon ? "cas-falta" : undefined}>
                        <td style={{ color: "var(--text)", fontWeight: 600 }} title={c.correo}>{c.correo}</td>
                        <td title={c.empresa || undefined}>
                          <Link href={`/entidad/empresa/${c.empresaId}`} style={{ color: "var(--muted)" }}>
                            🏢 {c.empresa || "sin nombre"}
                          </Link>
                        </td>
                        <td className="cas-num" style={{ color: c.vivas ? "var(--muted)" : "var(--dim)" }}>
                          {c.vivas || "—"}
                        </td>
                        <td style={{ fontSize: 11.5 }}>
                          {c.esBuzon ? (
                            /* «Registrada» no es «funcionando»: el maestro se
                               descarta al deducir de quién era un correo. Sin
                               este aviso, verlo en la lista invita a la
                               conclusión contraria. */
                            <span style={{ color: "var(--dim)" }}
                              title="Es el buzón maestro. La ingesta lo descarta al deducir de quién era el correo, porque el reenvío lo agrega a todos los destinatarios.">
                              📮 buzón maestro · no deduce empresa
                            </span>
                          ) : c.total === 0 ? (
                            <span style={{ color: "var(--yellow)" }}
                              title="Ningún correo ha entrado por esta cuenta. Si ya postuló, lo más probable es que le falte activar el reenvío al buzón maestro.">
                              ⚠ nunca trajo nada — ¿reenvío sin activar?
                            </span>
                          ) : (
                            <button type="button" onClick={() => irAlCorreo(c.ultimoId!)}
                              title="Ir al último correo que entró por esta cuenta"
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                                font: "inherit", fontSize: 11.5, color: "var(--teal)" }}>
                              {c.total} correo{c.total === 1 ? "" : "s"} · último {d === 0 ? "hoy" : `hace ${d} d`}
                            </button>
                          )}
                        </td>
                        <td className="cas-x">
                          <button type="button" className="pre-x" disabled={pend}
                            title={`Quitar ${c.correo} de ${c.empresa || "su empresa"}`}
                            onClick={() => quitar(c)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "0 0 8px", letterSpacing: .5 }}>
        📬 Sin leer · {sinLeer.length}
      </h2>
      {sinLeer.length === 0 ? (
        <div className="empty">Nada pendiente. Si no vibró el celular, no ha llegado nada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{sinLeer.map(fila)}</div>
      )}

      {grupos.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "24px 0 8px", letterSpacing: .5 }}>
            ✅ Ya leídos · {leidos.length}
            {/* El botón aparece si HAY algo recortado, no según el total: con
                8 leídos repartidos en tres grupos, el corte de 3 por grupo ya
                escondía filas y el botón no salía — «y 2 más» sin forma de
                verlas. */}
            {!verTodo && hayRecorte && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 8 }}
                onClick={() => setVerTodo(true)}>ver todos</button>
            )}
          </h2>
          {grupos.map(([k, g]) => {
            const visibles = verTodo ? g.coms : g.coms.slice(0, POR_GRUPO);
            return (
              <div key={k} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--dim)" }}>
                  {g.titulo} · {g.coms.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{visibles.map(fila)}</div>
                {!verTodo && g.coms.length > POR_GRUPO && (
                  <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>
                    y {g.coms.length - POR_GRUPO} más
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ── EL CAJÓN DE LAS REGISTRADAS A MANO ──
          No son correo entrante: son documentos que alguien bajó de la
          Plataforma y archivó. Van al final, plegadas y sin contarse como
          pendientes. Se leen en la línea de tiempo de su fondo; aquí están
          para que las que no tengan fondo no queden invisibles. */}
      {aMano.length > 0 && (
        <details className="cas-mano">
          <summary>
            📄 Cartas registradas a mano · {aMano.length}
            <i> — de la Plataforma Virtual; su sitio es la «Vida del fondo»</i>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {aMano.map(fila)}
          </div>
        </details>
      )}

      {items.length >= tope && (
        /* Sin esto, «solo hay 300» se leería como «solo llegaron 300». Un tope
           callado es una mentira con buena presentación. */
        <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 12 }}>
          Mostrando los {tope} correos más recientes. Los anteriores siguen guardados.
        </div>
      )}
    </>
  );
}
