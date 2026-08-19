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
  | "comprobante" | "estado_cuenta" | "rhe" | "gasto_dj" | "movimiento_banco";

export const TABLAS_RENDICION: TablaRendicion[] =
  ["comprobante", "estado_cuenta", "rhe", "gasto_dj", "movimiento_banco"];

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
  /** El emoji con el que se titula el caso que se abra desde esta fila. En un
   *  tablero de cuarenta casos, el icono es lo que dice de un vistazo si esto
   *  salió de una factura o de un movimiento del banco. */
  ico: string;
};

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
    migracion: "db/rendicion-interaccion.sql", ico: "📄",
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
    migracion: "db/rendicion-interaccion.sql", ico: "🏦",
  },
  rhe: {
    col: "rhe_id",
    etiqueta: "un recibo por honorarios",
    sel: "postulacion_id,creado_por,monto,numero,fecha,concepto",
    titulo: r => [soles(r?.monto), r?.numero, dmy(r?.fecha),
      (r?.concepto || "").slice(0, 35)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "🧾",
  },
  gasto_dj: {
    col: "gasto_dj_id",
    etiqueta: "una declaración jurada",
    sel: "postulacion_id,creado_por,importe,descripcion,fecha",
    titulo: r => [soles(r?.importe), (r?.descripcion || "").slice(0, 45),
      dmy(r?.fecha)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "📝",
  },
  movimiento_banco: {
    col: "movimiento_banco_id",
    etiqueta: "un movimiento del banco",
    sel: "postulacion_id,creado_por,monto,glosa,fecha,categoria",
    titulo: r => [soles(r?.monto), (r?.glosa || "").slice(0, 40),
      dmy(r?.fecha)].filter(Boolean).join(" · "),
    migracion: "db/rendicion-interaccion.sql", ico: "💵",
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
