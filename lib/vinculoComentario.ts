/* ── DE QUÉ CUELGA UN COMENTARIO ──
 *
 * Un comentario nunca está solo: cuelga de un caso, de una nota del muro, de
 * un objeto del repositorio, de un equipo, de un préstamo, de un expediente,
 * de un apunte de caja o de una de las SEIS filas de la rendición —la sexta,
 * el periodo de una obligación, llegó con db/obligacion-hilo.sql—. Doce
 * puertas, y la base garantiza —con el `check` de doce términos— que cada
 * comentario entra exactamente por UNA.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ──
 * La búsqueda global sabía DOS de las doce. Su consulta pedía `publicacion_id`
 * y `objeto_id` y nada más, así que un comentario sobre una factura, sobre un
 * recibo por honorarios o sobre un movimiento del banco salía en los
 * resultados firmado «— John en «—»» y enlazado a `/caso/null`: un 404 con
 * forma de resultado. Y no daba error en ningún sitio, que es la única forma
 * de fallo que este repo se toma en serio.
 *
 * Aquí se resuelve el dueño de un puñado de comentarios —los doce que se van
 * a pintar, nunca los miles que se filtran— y se devuelve lo único que hace
 * falta para enseñarlo: un ícono, un rótulo y a dónde lleva.
 *
 * ── EL DESTINO NO SE DECIDE AQUÍ ──
 * El «a dónde lleva» sale de `rutaNotif`, que es donde ya vivía esa regla para
 * la campanita. Escribir aquí un segundo enrutador con las mismas doce ramas
 * habría durado hasta la primera puerta nueva: la campanita la aprendería y la
 * búsqueda seguiría llevando al sitio de antes, sin avisar. Este archivo solo
 * aporta lo que a `rutaNotif` le falta —el muro de una nota, el equipo de un
 * préstamo, el fondo de una fila de rendición— y le pregunta.
 */

import { rutaNotif } from "./notificaciones";
import { META_RENDICION, TABLAS_RENDICION, type TablaRendicion } from "./rendicionHilo";
import { vinculosDePublicaciones } from "./vinculosPub";

/* Las columnas dueñas, en dos grupos. Las de la rendición van aparte porque
   PostgREST rechaza la consulta ENTERA si una columna no existe: pedirlas
   todas juntas dejaría la búsqueda de comentarios en blanco —no rota, en
   blanco— en cualquier entorno donde `db/rendicion-interaccion.sql` no esté
   corrido. Se piden con las demás y, si el servidor las rechaza, se repite sin
   ellas: se pierden los enlaces de la rendición, no la sección. */
export const COLS_DUENO_COM =
  "publicacion_id,objeto_id,equipamiento_id,prestamo_id,postulacion_id";
export const COLS_DUENO_COM_EXTRA =
  ",movimiento_caja_id," + TABLAS_RENDICION.map(t => META_RENDICION[t].col).join(",");

export type VinculoCom = {
  ico: string;
  /** Qué clase de cosa es, en una frase: «una factura», «un caso». Va al
   *  `title`, porque el ícono solo no se lee. */
  que: string;
  /** Cómo se llama esa cosa. Es lo que se pinta. */
  titulo: string;
  href: string | null;
};

type Fila = Record<string, any>;

/* Resuelve el dueño de cada comentario de la lista. Una consulta por tipo de
   dueño presente —nunca una por comentario—, y ninguna si esa puerta no
   aparece en el lote.
   `coms` solo necesita traer `id`: las doce columnas de vínculo se piden aquí
   si no vienen. Antes las traía quien llamaba, y eso obligaba a la búsqueda
   global a arrastrarlas sobre MILES de filas para usarlas en doce — un
   comentario entra por UNA de las doce puertas, así que once viajaban vacías
   en cada fila. */
export async function vinculosDeComentarios(
  supabase: any, coms: Fila[],
): Promise<Map<string, VinculoCom>> {
  const salida = new Map<string, VinculoCom>();
  if (!coms.length) return salida;

  /* ── 0 · POR QUÉ PUERTA ENTRA CADA UNO ──
     Solo si no vino ya. Quien tenga las columnas a mano —una ficha que las
     leyó para otra cosa— no paga esta consulta.
     El `select` de reintento vive AQUÍ, sobre doce filas, y no en la consulta
     grande de la búsqueda: las columnas de la rendición pueden no existir
     todavía, y PostgREST rechaza la consulta ENTERA si falta una. En la
     grande, eso dejaba la sección de comentarios en blanco —sin error— también
     para los casos, que no tienen nada que ver. Y degrada mejor que antes: si
     los dos intentos fallan, se pierden los vínculos y no los comentarios. */
  const ids = coms.map(c => c.id);
  if (coms.some(c => c.publicacion_id === undefined)) {
    const pedir = (cols: string) =>
      supabase.from("comentarios").select("id," + cols).in("id", ids);
    let r = await pedir(COLS_DUENO_COM + COLS_DUENO_COM_EXTRA);
    if (r.error) r = await pedir(COLS_DUENO_COM);
    const porId = new Map((r.data || []).map((x: any) => [x.id, x]));
    coms = coms.map(c => ({ ...c, ...(porId.get(c.id) as any || {}) }));
  }

  const idsDe = (col: string) => [...new Set(coms.map(c => c[col]).filter(Boolean))] as string[];

  /* ── 1 · LAS PUBLICACIONES: caso o nota de muro ──
     Comparten tabla, y desde el comentario son indistinguibles. Sin mirar el
     `tipo`, una nota del muro abría una ficha de caso alrededor de un apunte,
     con su «Sin asignar» y su «Publicado» — tres avisos sobre algo que nadie
     prometió resolver. */
  /* ── TODO LO QUE NO DEPENDE DE NADA, DE UNA VEZ ──
     Esto eran seis esperas encadenadas —publicaciones, su muro, los objetos,
     los préstamos, los equipos de esos préstamos, las cinco de la rendición—
     y solo DOS de esos seis pasos necesitaban de verdad al anterior. Para un
     puñado de doce comentarios, seis idas y vueltas a la base.

     Los equipos ya no esperan a los préstamos: el préstamo trae el suyo
     embebido. Lo único que sigue en fila es el muro de una nota, porque
     primero hay que saber cuáles de esas publicaciones SON notas. */
  const idsPub = idsDe("publicacion_id");
  const eqDirecto = idsDe("equipamiento_id");

  const [pubs, objs, posts, cajas, prestamos, eqsDirectos, rend] = await Promise.all([
    traer(supabase, "publicaciones", idsPub, "id,titulo,tipo"),
    // ── Objetos del repositorio, expedientes, apuntes de caja ──
    traer(supabase, "objetos", idsDe("objeto_id"), "id,titulo"),
    traer(supabase, "postulaciones", idsDe("postulacion_id"), "id,codigo"),
    traer(supabase, "movimiento_caja", idsDe("movimiento_caja_id"), "id,descripcion,monto"),
    /* ── EQUIPOS A TRAVÉS DEL PRÉSTAMO ──
       Un comentario de préstamo cuelga de `prestamo_id`, pero su sitio es la
       ficha del EQUIPO: es lo que se busca y lo que se abre. El equipo viene
       embebido para no tener que preguntarlo en un segundo viaje con la lista
       de identificadores que acaba de llegar. */
    traer(supabase, "equipo_prestamos", idsDe("prestamo_id"),
      "id,equipamiento_id,eq:equipamiento(id,nombre)"),
    // Y los que cuelgan del equipo directamente.
    traer(supabase, "equipamiento", eqDirecto, "id,nombre"),
    /* ── LAS SEIS DE LA RENDICIÓN ──
       Se traen con el `sel` que ya declara `META_RENDICION`, porque de ahí
       sale el rótulo —«S/ 7,588.61 · FF53-0002098 · WATUKUY»— y también el
       `postulacion_id`, sin el cual `rutaNotif` no sabe en qué fondo vive la
       fila y devuelve `null` a propósito. Un enlace que lleva al sitio
       equivocado es peor que uno que no lleva: el segundo se nota. */
    Promise.all(TABLAS_RENDICION.map(async t => {
      const m = META_RENDICION[t];
      const filas = await traer(supabase, t, idsDe(m.col), "id," + m.sel);
      return [t, filas] as const;
    })),
  ]);

  const filaRend = new Map<string, Fila>();
  rend.forEach(([t, filas]) => filas.forEach((r: any) => filaRend.set(`${t}:${r.id}`, r)));

  /* De qué muro es cada nota: su PRIMER vínculo, que es el que creó
     `publicarBitacora` — una nota nace en un muro y solo en uno. Se pregunta
     a `lib/vinculosPub`, el mismo sitio del que lo saca la campanita: eran
     dos lecturas de la misma tabla con la misma regla escrita dos veces.
     Es la única espera que queda en fila, y no se puede evitar: hay que tener
     las publicaciones para saber cuáles son notas. */
  const notas = pubs.filter((p: any) => p.tipo === "bitacora").map((p: any) => p.id);
  const muroDe = new Map<string, { tipo: string; id: string }>();
  if (notas.length) {
    const vincs = await vinculosDePublicaciones(supabase, notas);
    vincs.forEach((l, pubId) => {
      if (l[0]) muroDe.set(pubId, { tipo: l[0].tipo, id: l[0].id });
    });
  }
  const pubDe = new Map<string, { titulo: string; muro: { tipo: string; id: string } | null }>(
    pubs.map((p: any) => [p.id, { titulo: p.titulo, muro: muroDe.get(p.id) || null }]));

  /* El equipo de cada préstamo, y el catálogo de nombres de los dos caminos:
     el directo y el que llegó embebido en su préstamo. */
  const eqDeP = new Map(prestamos.map((p: any) => [p.id, p.equipamiento_id]));
  const equipos: Fila[] = [...eqsDirectos];
  prestamos.forEach((p: any) => {
    const e = Array.isArray(p.eq) ? p.eq[0] : p.eq;
    if (e && !equipos.some(x => x.id === e.id)) equipos.push(e);
  });

  const nombreDe = (lista: Fila[], id: string, campo: string) =>
    lista.find((x: any) => x.id === id)?.[campo] || "";

  for (const c of coms) {
    const eqId = c.equipamiento_id || (c.prestamo_id ? eqDeP.get(c.prestamo_id) : null) || null;
    const tabla = TABLAS_RENDICION.find(t => c[META_RENDICION[t].col]) as TablaRendicion | undefined;
    const fila = tabla ? filaRend.get(`${tabla}:${c[META_RENDICION[tabla].col]}`) : null;

    /* El objeto con forma de notificación que `rutaNotif` sabe leer. `tipo:
       "comentario"` y `comentario_id` son lo que hace que el enlace termine
       EN EL PÁRRAFO y no en la cabecera de un hilo de treinta. */
    const href = rutaNotif({
      ...c,
      tipo: "comentario",
      comentario_id: c.id,
      equipamiento_id: eqId,
      muro: c.publicacion_id ? (pubDe.get(c.publicacion_id)?.muro || null) : null,
      // El fondo de la fila de rendición; si el comentario no es de una, se
      // respeta el `postulacion_id` que ya traiga (comentario de expediente).
      postulacion_id: fila?.postulacion_id || c.postulacion_id || null,
    });

    /* El rótulo. El orden repite el de `rutaNotif` por higiene, pero es
       cosmético: la base garantiza un solo dueño por comentario, así que
       ninguna fila real entra por dos ramas. */
    const p = c.publicacion_id ? pubDe.get(c.publicacion_id) : null;
    const v: VinculoCom =
      p?.muro ? { ico: "🗒", que: "una nota del muro", titulo: p.titulo || "una nota", href }
      : p ? { ico: "📌", que: "un caso", titulo: p.titulo || "un caso", href }
      : c.objeto_id ? { ico: "📚", que: "un objeto del repositorio",
          titulo: nombreDe(objs, c.objeto_id, "titulo") || "un objeto", href }
      : eqId ? { ico: "🎥", que: c.prestamo_id ? "un préstamo de equipo" : "la bitácora de un equipo",
          titulo: nombreDe(equipos, eqId, "nombre") || "un equipo", href }
      : c.movimiento_caja_id ? { ico: "💰", que: "un apunte de caja",
          titulo: rotuloCaja(cajas.find((x: any) => x.id === c.movimiento_caja_id)), href }
      : tabla ? { ico: META_RENDICION[tabla].ico, que: META_RENDICION[tabla].etiqueta,
          titulo: META_RENDICION[tabla].titulo(fila) || META_RENDICION[tabla].etiqueta, href }
      : c.postulacion_id ? { ico: "🎯", que: "un expediente",
          titulo: nombreDe(posts, c.postulacion_id, "codigo") || "un expediente", href }
      /* Ni una de las doce. Solo puede pasar si se abrió una puerta nueva en la
         base y nadie la añadió aquí: se dice, no se disimula con un guion. */
      : { ico: "❓", que: "sin vínculo conocido", titulo: "sin vínculo", href: null };
    salida.set(c.id, v);
  }
  return salida;
}

const soles = (n: any) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Un apunte de caja se identifica por su descripción, pero muchos la tienen
   vacía o repetida («movilidad», seis veces): el monto es lo que distingue. */
const rotuloCaja = (m: any) =>
  [m?.descripcion, m?.monto != null ? soles(m.monto) : ""].filter(Boolean).join(" · ")
  || "un apunte de caja";

async function traer(supabase: any, tabla: string, ids: string[], cols: string): Promise<Fila[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from(tabla).select(cols).in("id", ids);
  return data || [];
}
