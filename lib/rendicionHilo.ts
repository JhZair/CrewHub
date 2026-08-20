/* ── HABLAR DE LA PLATA — las cinco tablas, descritas una sola vez ──
 *
 * Comentar y reaccionar ya existía en caja. Llevarlo a las cinco tablas de la
 * rendición —facturas, estados de cuenta, RHE, declaraciones juradas y
 * movimientos del banco— podía hacerse de dos maneras: cinco acciones
 * gemelas, cinco ramas en el toggle de reacciones y cinco resolvedores de
 * destino en las notificaciones; o describir las cinco UNA VEZ y que todo lo
 * demás lea de aquí.
 *
 * Se hizo lo segundo. Cinco copias de la misma función no son cinco veces más
 * código: son cinco sitios donde arreglar el mismo fallo, y el que se olvide
 * no dará error — seguirá funcionando mal en silencio, que es la única forma
 * de fallo que este repo se toma en serio.
 *
 * Ojo: esto NO es el par (tipo, id) polimórfico que se descartó. En la base
 * cada tabla sigue teniendo su columna con su clave foránea y su borrado en
 * cascada. Lo que se unifica es la DESCRIPCIÓN, no el almacenamiento: aquí
 * vive el mapa de tabla → columna, y la base sigue garantizando por su cuenta
 * que un comentario no puede quedar huérfano.
 */

export type TablaRendicion =
  | "comprobante" | "estado_cuenta" | "rhe" | "gasto_dj" | "movimiento_banco"
  | "obligacion_periodo";

export const TABLAS_RENDICION: TablaRendicion[] =
  ["comprobante", "estado_cuenta", "rhe", "gasto_dj", "movimiento_banco",
    "obligacion_periodo"];

const soles = (n: any) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type MetaRendicion = {
  /** La columna de `comentarios` / `reacciones` / `notificaciones`. */
  col: string;
  /** Cómo se llama en una frase: «una factura», «un recibo por honorarios». */
  etiqueta: string;
  /** Lo que hay que traer de la fila para poder rotular el aviso. */
  sel: string;
  /** El rótulo del aviso. */
  titulo: (r: any) => string;
  /** El archivo SQL que hay que correr si la columna no existe. */
  migracion: string;
  /* ── DÓNDE VIVE LA FILA ──
   * Esto estaba escrito a mano en dos sitios —`rutaNotif` y `casoDeRendicion`—
   * como `/fondo/${postulacion_id}#…`, que valía mientras las cinco tablas
   * fueran del fondo. Un periodo declarable no lo es: vive en /obligaciones y
   * no tiene postulación. Con la ruta escrita fuera, añadirlo habría exigido
   * un `if` en cada uno de esos dos sitios, y el que se olvidara no daría
   * error — devolvería un enlace a `/fondo/undefined`.
   * `fila` trae las columnas de `sel`; `null` significa «no sé llevar ahí», y
   * quien recibe el null deja el aviso sin clic en vez de inventarse un
   * destino. Un enlace al sitio equivocado es peor que ninguno: el segundo se
   * nota. */
  ruta: (fila: any, id: string) => string | null;
  /** De dónde sacar el nombre del dueño cuando NO se puede traer con la fila.
   *  Las cinco del fondo lo embeben (`post:postulaciones`); la sexta no puede,
   *  porque su dueño es un par polimórfico sin clave foránea. */
  dueno?: (fila: any) => { tabla: string; id: string } | null;
  /** El emoji con el que se titula el caso que se abra desde esta fila. En un
   *  tablero de cuarenta casos, el icono es lo que dice de un vistazo si esto
   *  salió de una factura o de un movimiento del banco. */
  ico: string;
};

/* Las cinco del fondo comparten destino y por eso lo comparten literalmente:
   una sola función, cinco usos. Si el fondo no viene en la fila devuelve null
   —no se cae a `/fondo/undefined`, que es un enlace roto con aspecto de bueno. */
const rutaFondo = (tabla: TablaRendicion) => (fila: any, id: string) =>
  fila?.postulacion_id ? `/fondo/${fila.postulacion_id}#${anclaRendicion(tabla, id)}` : null;

/* ── EL RÓTULO LLEVA SIEMPRE EL MONTO ──
 * Misma lección que en caja: en una bandeja con veinte avisos, «Nuevo
 * comentario en una factura» no distingue la de S/ 10 de la de S/ 7,588, y el
 * concepto muchas veces está vacío. El monto nunca lo está — es la única
 * columna que estas cinco tablas tienen obligatoria y que además identifica.
 */
export const META_RENDICION: Record<TablaRendicion, MetaRendicion> = {
  comprobante: {
    col: "comprobante_id",
    etiqueta: "una factura",
    sel: "postulacion_id,creado_por,importe,proveedor,serie,numero,concepto",
    titulo: r => [soles(r?.importe),
      [r?.serie, r?.numero].filter(Boolean).join("-"),
      (r?.proveedor || r?.concepto || "").slice(0, 40)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "📄", ruta: rutaFondo("comprobante"),
  },
  estado_cuenta: {
    col: "estado_cuenta_id",
    etiqueta: "un estado de cuenta",
    sel: "postulacion_id,creado_por,periodo,saldo",
    /* Aquí el monto solo no basta: dos meses seguidos pueden tener saldos
       parecidos y lo que identifica al estado es SU MES. Por eso el periodo va
       delante. Es el único de los cinco donde el orden se invierte, y por una
       razón, no por descuido. */
    titulo: r => {
      const m = /^(\d{4})-(\d{2})/.exec(String(r?.periodo ?? ""));
      const mes = m ? `${MESES[+m[2] - 1]} ${m[1]}` : "";
      return [mes, r?.saldo != null ? `saldo ${soles(r.saldo)}` : ""].filter(Boolean).join(" · ");
    },
    migracion: "db/rendicion-interaccion.sql", ico: "🏦", ruta: rutaFondo("estado_cuenta"),
  },
  rhe: {
    col: "rhe_id",
    etiqueta: "un recibo por honorarios",
    sel: "postulacion_id,creado_por,monto,numero,fecha,concepto",
    titulo: r => [soles(r?.monto), r?.numero, dmy(r?.fecha),
      (r?.concepto || "").slice(0, 35)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "🧾", ruta: rutaFondo("rhe"),
  },
  gasto_dj: {
    col: "gasto_dj_id",
    etiqueta: "una declaración jurada",
    sel: "postulacion_id,creado_por,importe,descripcion,fecha",
    titulo: r => [soles(r?.importe), (r?.descripcion || "").slice(0, 45),
      dmy(r?.fecha)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "📝", ruta: rutaFondo("gasto_dj"),
  },
  movimiento_banco: {
    col: "movimiento_banco_id",
    etiqueta: "un movimiento del banco",
    sel: "postulacion_id,creado_por,monto,glosa,fecha,categoria",
    titulo: r => [soles(r?.monto), (r?.glosa || "").slice(0, 40),
      dmy(r?.fecha)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "💵", ruta: rutaFondo("movimiento_banco"),
  },
  /* ── LA SEXTA NO ES DEL FONDO ──
     Un periodo declarable pertenece a una EMPRESA, no a una postulación: vive
     en /obligaciones y no tiene `postulacion_id`. Es justo el caso que obligó a
     sacar la ruta de `rutaNotif`, donde `/fondo/${postulacion_id}` estaba
     escrito como si valiera para todas.
     Y su rótulo no lleva monto —la regla de las otras cinco— porque un periodo
     puede no tenerlo: lo que lo identifica es el MES y de quién es. «S/ 0.00»
     en la bandeja no distinguiría nada; «octubre 2025» sí. */
  obligacion_periodo: {
    col: "obligacion_periodo_id",
    etiqueta: "una declaración",
    /* ── NO SE PUEDE TRAER LA EMPRESA DE UN TIRÓN ──
       `obligacion` guarda a su dueño como par polimórfico
       (`entidad_tipo` + `entidad_id`) y por eso NO tiene clave foránea a
       `empresas`. Aquí había un `ent:empresas(nombre)` anidado: PostgREST no
       puede resolver esa relación y rechaza la consulta ENTERA, así que el
       pop-up se quedaba en «Cargando…» para siempre.
       Se trae `entidad_id` y el nombre se resuelve aparte, con `duenoDe`, en
       los dos sitios que arman un título para humanos. */
    sel: "anio,mes,declarado_en,resultado,obl:obligacion(clase,entidad_tipo,entidad_id)",
    titulo: r => (r?.mes ? `${MESES[Number(r.mes) - 1]} ${r?.anio}` : `${r?.anio ?? ""}`),
    /* De qué tabla sacar el nombre del dueño. Va descrito y no escrito a mano
       en la acción por lo mismo que todo lo demás de este archivo: el día que
       una obligación cuelgue de otra cosa, se cambia aquí. */
    dueno: r => {
      const o = Array.isArray(r?.obl) ? r.obl[0] : r?.obl;
      return o?.entidad_tipo === "empresa" && o?.entidad_id
        ? { tabla: "empresas", id: o.entidad_id } : null;
    },
    migracion: "db/obligacion-hilo.sql", ico: "📅",
    /* Sin `#ancla` a un fondo: la pantalla es una sola y la fila se busca por
       su id, igual que hace /caja con sus apuntes. */
    ruta: (_f, id) => `/obligaciones#${anclaRendicion("obligacion_periodo", id)}`,
  },
};

/* Valida que la tabla venga de la lista y no de un string cualquiera del
   cliente. Sin esto, un `tabla` inventado se colaría hasta el `insert` y
   Postgres lo rechazaría con un mensaje de columna inexistente — que en
   pantalla no significa nada para quien solo quería comentar. */
export const esTablaRendicion = (t: any): t is TablaRendicion =>
  typeof t === "string" && (TABLAS_RENDICION as string[]).includes(t);

/* ── EL ANCLA DE UNA FILA, ESCRITA UNA VEZ ──
 *
 * La usan dos sitios que nunca se leen juntos: la fila la pone como `id` del
 * DOM, y `rutaNotif` la pone al final de la URL del aviso. Si cada uno se
 * inventara su prefijo, el aviso llegaría a la pantalla correcta y no saltaría
 * a ninguna fila — sin error, solo sin efecto. Es el fallo más caro de
 * diagnosticar que tiene este sistema, así que la cadena se escribe aquí y
 * nadie la teclea a mano.
 *
 * Se usa el nombre de la tabla tal cual, sin abreviar. Es más largo en la URL
 * y a cambio no hay una segunda tabla de prefijos que pueda desincronizarse.
 */
export const anclaRendicion = (tabla: TablaRendicion, id: string) => `${tabla}-${id}`;

/** El nombre del dueño de una fila, cuando hay que ir a buscarlo. Devuelve ""
 *  si no aplica o si no se encuentra: un título sin dueño se lee raro, pero uno
 *  con «undefined» se lee roto. */
export async function duenoDe(
  supabase: any, meta: MetaRendicion, fila: any,
): Promise<string> {
  const d = meta.dueno?.(fila);
  if (!d) return "";
  const { data } = await supabase.from(d.tabla).select("nombre").eq("id", d.id).maybeSingle();
  return (data as any)?.nombre || "";
}

/** La columna de la notificación → de qué tabla es. Para `rutaNotif`, que
 *  recibe una fila con once columnas posibles y tiene que decidir. */
export const tablaDeNotif = (n: Record<string, any>): TablaRendicion | null =>
  TABLAS_RENDICION.find(t => n[META_RENDICION[t].col]) || null;

/* ── EL NÚMERO Y LOS 👀 DE CADA FILA, PARA LA LISTA ──
 *
 * El hilo entero se carga al abrir el pop-up, pero el CONTADOR tiene que estar
 * en la lista: sin él, una conversación de cuatro mensajes sobre una factura
 * es invisible, y nadie la va a encontrar abriendo filas al azar. Lo mismo con
 * las reacciones — dejar un 👀 «lo vi, está bien» es lo que más se hace al
 * revisar una rendición, y si obliga a abrir el hilo son tres clics: a ese
 * precio no se hace y el acuse de revisión se pierde.
 *
 * ── SI FALTA LA MIGRACIÓN, LA LISTA SIGUE ──
 * Dos consultas, y las dos toleran el fallo devolviendo cero. Una pantalla de
 * rendición que ya funcionaba no puede caerse porque nadie corrió un SQL: como
 * mucho, se queda sin contadores. Lo que NO se hace es fingir: `error` vuelve
 * con el nombre del archivo para que la pantalla lo pueda decir.
 */
export async function hilosDeFilas(
  supabase: any, tabla: TablaRendicion, ids: string[],
): Promise<{
  conteo: Map<string, number>; reacciones: Map<string, any[]>;
  casos: Map<string, { id: string; estado?: string | null; tipo?: string | null }>;
  error: string | null;
}> {
  const col = META_RENDICION[tabla].col;
  const conteo = new Map<string, number>();
  const reacciones = new Map<string, any[]>();
  const casos = new Map<string, { id: string; estado?: string | null; tipo?: string | null }>();
  if (!ids.length) return { conteo, reacciones, casos, error: null };

  const [{ data: coms, error: eC }, { data: rx, error: eR }] = await Promise.all([
    supabase.from("comentarios").select(col).in(col, ids),
    supabase.from("reacciones")
      .select(`emoji,usuario_id,${col},perfil:perfiles!usuario_id(nombre)`)
      .in(col, ids).is("comentario_id", null),
  ]);
  (coms || []).forEach((c: any) => {
    const k = c[col];
    if (k) conteo.set(k, (conteo.get(k) || 0) + 1);
  });
  (rx || []).forEach((r: any) => {
    const k = r[col];
    if (!k) return;
    const arr = reacciones.get(k) || [];
    arr.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null });
    reacciones.set(k, arr);
  });
  /* ── EL CASO DE CADA FILA, EN SU PROPIA CONSULTA ──
     Y no dentro del `select` de la lista, que es donde cabría mejor. Si
     `caso_id` no existe todavía —db/rendicion-caso.sql sin correr—, PostgREST
     rechaza la consulta ENTERA: la lista de 26 recibos volvería vacía y el
     fondo diría «sin pagos» con S/ 98,270 cargados. Un dato de adorno no puede
     tumbar el dato principal. */
  const { data: cs } = await supabase.from(tabla)
    .select(`id,caso_id,caso:publicaciones(estado,tipo)`)
    .in("id", ids).not("caso_id", "is", null);
  (cs || []).forEach((r: any) => {
    const c = Array.isArray(r.caso) ? r.caso[0] : r.caso;
    if (r.caso_id) casos.set(r.id, { id: r.caso_id, estado: c?.estado, tipo: c?.tipo });
  });

  const err = eC || eR;
  return {
    conteo, reacciones, casos,
    error: err
      ? (new RegExp(col).test(err.message || "")
          ? `Falta correr ${META_RENDICION[tabla].migracion} en Supabase.`
          : err.message)
      : null,
  };
}
