/* ── MÓDULO DE VISTAS DE TABLA ──
 *
 * Lo que SeaTable daba y CrewHub perdió al migrar: filtrar, ordenar, ocultar
 * columnas y guardar todo eso con un nombre («Lista de cumpleaños», «Control
 * renta 4ta»).
 *
 * Va AL LADO de los listados de fichas, no en su lugar. Una ficha de persona
 * enseña avatar, palmarés y completitud —cosas calculadas, no columnas— y
 * meterlas en una tabla genérica sería reimplementarlas peor. La tabla sirve
 * para lo otro: comparar muchas filas por pocos campos.
 */

import { FORM_CONF, type CampoDef } from "@/lib/entidades";

export type TipoCol = "texto" | "numero" | "fecha" | "opcion" | "booleano";

export type Columna = {
  key: string;
  lbl: string;
  tipo: TipoCol;
  /** Valores posibles, para el filtro de tipo «opción». */
  opciones?: string[];
  /** Ancho sugerido en px. */
  ancho?: number;
  /** Cómo sacar el valor si no es una propiedad directa. */
  valor?: (fila: any) => any;
};

/* Los operadores, por tipo. Deliberadamente pocos: un filtro que nadie
   entiende no se usa, y «contiene» resuelve el 80% de los casos reales. */
export const OPS: Record<TipoCol, { op: string; lbl: string; sinValor?: boolean }[]> = {
  texto: [
    { op: "contiene", lbl: "contiene" },
    { op: "no_contiene", lbl: "no contiene" },
    { op: "es", lbl: "es exactamente" },
    { op: "termina", lbl: "termina en" },
    { op: "vacio", lbl: "está vacío", sinValor: true },
    { op: "no_vacio", lbl: "no está vacío", sinValor: true },
  ],
  numero: [
    { op: "es", lbl: "=" }, { op: "mayor", lbl: ">" }, { op: "menor", lbl: "<" },
    { op: "vacio", lbl: "está vacío", sinValor: true },
    { op: "no_vacio", lbl: "no está vacío", sinValor: true },
  ],
  fecha: [
    { op: "antes", lbl: "antes de" }, { op: "despues", lbl: "después de" },
    { op: "vacio", lbl: "está vacío", sinValor: true },
    { op: "no_vacio", lbl: "no está vacío", sinValor: true },
  ],
  opcion: [
    { op: "es", lbl: "es" }, { op: "no_es", lbl: "no es" },
    { op: "vacio", lbl: "está vacío", sinValor: true },
    { op: "no_vacio", lbl: "no está vacío", sinValor: true },
  ],
  booleano: [{ op: "es", lbl: "es" }],
};

export type Filtro = { col: string; op: string; val?: string };
export type Orden = { col: string; asc: boolean } | null;
export type ConfigVista = { cols?: string[]; orden?: Orden; filtros?: Filtro[] };

/* ── UN VALOR CUALQUIERA, COMO TEXTO ──
 * Existe porque la tabla dejó de enseñar una selección de columnas escogidas a
 * mano y ahora enseña TODAS las de la tabla, incluidas las que no son cadenas:
 * `relaciones` es `text[]` y `credenciales` es `jsonb`. `String(["a","b"])` da
 * «a,b» —pasable— pero `String({...})` da «[object Object]», que además de no
 * decir nada se puede FILTRAR: buscar «object» habría devuelto todas las filas
 * con ese campo lleno. Un dato ilegible es un problema de presentación; un
 * dato ilegible que además responde a los filtros es una trampa. */
export const comoTexto = (v: any): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined).join(", ");
  if (typeof v === "object") {
    /* Las claves, no el JSON entero: de `credenciales` lo que se quiere saber
       es QUÉ tiene («clave_sol, email»), no su volcado con llaves y comillas. */
    const ks = Object.keys(v).filter(k => v[k] !== null && v[k] !== false && v[k] !== "");
    return ks.join(", ");
  }
  return String(v);
};

const txt = (v: any) => comoTexto(v).trim();
const nrm = (v: any) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** ¿Esta fila pasa este filtro? */
export function pasa(fila: any, f: Filtro, cols: Columna[]): boolean {
  const c = cols.find(x => x.key === f.col);
  if (!c) return true;                       // filtro sobre columna que ya no existe: no filtra
  const v = c.valor ? c.valor(fila) : fila[c.key];
  const vacio = v === null || v === undefined || txt(v) === "";
  if (f.op === "vacio") return vacio;
  if (f.op === "no_vacio") return !vacio;
  /* Un filtro sin valor escrito NO filtra. Lo contrario —tratarlo como
     «igual a cadena vacía»— vacía la tabla mientras alguien escribe, y eso se
     lee como «no hay resultados» cuando en realidad no ha preguntado nada. */
  const q = txt(f.val);
  if (!q) return true;

  switch (f.op) {
    case "contiene":    return nrm(v).includes(nrm(q));
    case "no_contiene": return !nrm(v).includes(nrm(q));
    case "termina":     return nrm(v).endsWith(nrm(q));
    case "es":          return c.tipo === "numero" ? num(v) === num(q) : nrm(v) === nrm(q);
    case "no_es":       return nrm(v) !== nrm(q);
    case "mayor":       return (num(v) ?? -Infinity) > (num(q) ?? Infinity);
    case "menor":       return (num(v) ?? Infinity) < (num(q) ?? -Infinity);
    case "antes":       return !vacio && txt(v).slice(0, 10) < q;
    case "despues":     return !vacio && txt(v).slice(0, 10) > q;
    default:            return true;
  }
}

/* Los operadores de IGUALDAD se agrupan con O dentro de una misma columna.
 *
 * «Tipo es personal» Y «Tipo es colaborador» no puede cumplirlo ninguna fila:
 * una persona tiene un tipo, no dos. Un filtro que SIEMPRE devuelve cero no es
 * una opción rara, es una trampa — y era lo primero que uno intenta al querer
 * ver dos tipos a la vez. Así que dos «es» sobre la misma columna se leen como
 * «es cualquiera de los dos», que es lo único que pudo querer decir.
 *
 * `no_es` NO entra: excluir dos cosas a la vez sí es posible y sí es útil
 * («ni contacto ni vetado»), así que ahí la Y es correcta.
 * `contiene` tampoco: buscar dos palabras en el mismo campo es legítimo.
 */
const OPS_O = ["es"];

/** Aplica filtros y orden. Columnas distintas se acumulan con Y. */
export function aplicar(filas: any[], filtros: Filtro[], orden: Orden, cols: Columna[]): any[] {
  const porCol = new Map<string, Filtro[]>();
  (filtros || []).forEach(f => porCol.set(f.col, [...(porCol.get(f.col) || []), f]));

  let r = filas.filter(fila =>
    [...porCol.values()].every(grupo => {
      const conO = grupo.filter(x => OPS_O.includes(x.op) && txt(x.val) !== "");
      const conY = grupo.filter(x => !conO.includes(x));
      const pasaO = conO.length === 0 || conO.some(x => pasa(fila, x, cols));
      return pasaO && conY.every(x => pasa(fila, x, cols));
    }));
  if (orden) {
    const c = cols.find(x => x.key === orden.col);
    if (c) {
      const val = (f: any) => (c.valor ? c.valor(f) : f[c.key]);
      r = [...r].sort((a, b) => {
        const va = val(a), vb = val(b);
        /* Los vacíos SIEMPRE al final, se ordene como se ordene. Al invertir,
           un bloque de vacíos encabezando la tabla esconde lo que se venía a
           ver — y parece que el orden no se aplicó. */
        const ea = va === null || va === undefined || txt(va) === "";
        const eb = vb === null || vb === undefined || txt(vb) === "";
        if (ea && eb) return 0;
        if (ea) return 1;
        if (eb) return -1;
        let d: number;
        if (c.tipo === "numero") d = (num(va) ?? 0) - (num(vb) ?? 0);
        else d = txt(va).localeCompare(txt(vb), "es");
        return orden.asc ? d : -d;
      });
    }
  }
  return r;
}

/* ── Las columnas de PERSONAS ──
 * Se declaran a mano y no se derivan de FORM_CONF a propósito: el formulario
 * tiene cuarenta campos y una tabla con cuarenta columnas no se usa. Esto es
 * una selección editorial —lo que de verdad se compara entre personas— y su
 * orden es el orden en que aparecen. */
export const COLS_PERSONA: Columna[] = [
  { key: "nombre", lbl: "Nombre completo", tipo: "texto", ancho: 200 },
  { key: "alias", lbl: "Nombre corto", tipo: "texto", ancho: 110 },
  { key: "tipo", lbl: "Tipo", tipo: "opcion", ancho: 110,
    opciones: ["personal", "colaborador", "actor social", "colaborador eventual", "independiente", "contacto"] },
  { key: "equipo", lbl: "Equipo", tipo: "opcion", ancho: 110,
    opciones: ["creativo", "tecnico", "administrativo"] },
  { key: "rol", lbl: "Especialidades / rol", tipo: "texto", ancho: 200 },
  { key: "region", lbl: "Región", tipo: "texto", ancho: 100 },
  { key: "telefono", lbl: "Teléfono", tipo: "texto", ancho: 130 },
  { key: "ruc_dni", lbl: "DNI / RUC", tipo: "texto", ancho: 110 },
  { key: "email", lbl: "Correo", tipo: "texto", ancho: 180 },
  { key: "direccion", lbl: "Dirección", tipo: "texto", ancho: 200 },
  { key: "estado", lbl: "Estado", tipo: "opcion", ancho: 100,
    opciones: ["activo", "potencial", "vetado", "inactivo"] },
  { key: "es_comunero", lbl: "Comunero", tipo: "booleano", ancho: 90 },
  { key: "fecha_nacimiento", lbl: "Nacimiento", tipo: "fecha", ancho: 110 },
  /* Edad y días para el cumpleaños son CALCULADAS. Guardar la edad sería
     guardar un dato que caduca cada año sin que nadie lo toque. */
  { key: "_edad", lbl: "Edad", tipo: "numero", ancho: 70,
    valor: f => edadDe(f.fecha_nacimiento) },
  { key: "_cumple", lbl: "Días para cumpleaños", tipo: "numero", ancho: 90,
    valor: f => diasParaCumple(f.fecha_nacimiento) },
  { key: "estado_sunat", lbl: "Estado SUNAT", tipo: "opcion", ancho: 130,
    opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"] },
  { key: "condicion_sunat", lbl: "Condición SUNAT", tipo: "opcion", ancho: 110,
    opciones: ["habido", "no_habido"] },
  { key: "dni_vencimiento", lbl: "Vence el DNI", tipo: "fecha", ancho: 110 },
  { key: "suspension_4ta_anio", lbl: "Suspensión 4ta", tipo: "numero", ancho: 100 },
  { key: "nombre_reniec", lbl: "Nombre RENIEC", tipo: "texto", ancho: 200 },
  { key: "organizacion", lbl: "Organización", tipo: "texto", ancho: 160 },
  { key: "genero", lbl: "Género", tipo: "opcion", ancho: 100,
    opciones: ["femenino", "masculino", "no binario", "otro"] },
  { key: "notas", lbl: "Notas", tipo: "texto", ancho: 220 },
];

export function edadDe(f?: string | null): number | null {
  const s = String(f ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const n = new Date(s + "T12:00:00"), h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a;
}

/** Días que faltan para el próximo cumpleaños (0 = hoy). */
export function diasParaCumple(f?: string | null): number | null {
  const s = String(f ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const [, mm, dd] = s.split("-").map(Number);
  let prox = new Date(hoy.getFullYear(), mm - 1, dd, 12);
  if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, mm - 1, dd, 12);
  return Math.round((prox.getTime() - hoy.getTime()) / 86400000);
}

/* ── Las columnas de EMPRESAS ──
 * Mismo criterio que personas: selección editorial, no volcado del formulario.
 * Las columnas que empiezan por `_` son CALCULADAS en el servidor y viajan ya
 * resueltas en cada fila —no como función—: postulaciones, ganadas, monto y el
 * veredicto de elegibilidad salen de cruzar `postulaciones` con lib/fondos, y
 * recalcularlos aquí sería una cuarta copia de esas reglas. */
export const COLS_EMPRESA: Columna[] = [
  { key: "nombre", lbl: "Nombre", tipo: "texto", ancho: 190 },
  { key: "codigo", lbl: "Código", tipo: "texto", ancho: 90 },
  { key: "razon_social", lbl: "Razón social", tipo: "texto", ancho: 230 },
  { key: "ruc", lbl: "RUC", tipo: "texto", ancho: 120 },
  { key: "_elegible", lbl: "¿Puede postular?", tipo: "opcion", ancho: 150,
    opciones: ["lista", "a un trámite", "en concurso", "ejecutando", "no puede"] },
  { key: "_trabas", lbl: "Qué le falta", tipo: "texto", ancho: 240 },
  { key: "estado", lbl: "Estado", tipo: "opcion", ancho: 120,
    opciones: ["en_constitucion", "activa", "inactiva", "en_proceso_de_cierre", "cerrada"] },
  { key: "relacion", lbl: "Relación", tipo: "opcion", ancho: 100,
    opciones: ["propia", "aliada", "externa"] },
  { key: "tipo", lbl: "Tipo", tipo: "opcion", ancho: 100,
    opciones: ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"] },
  { key: "estado_sunat", lbl: "Estado SUNAT", tipo: "opcion", ancho: 140,
    opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"] },
  { key: "condicion_sunat", lbl: "Condición SUNAT", tipo: "opcion", ancho: 120,
    opciones: ["habido", "no_habido"] },
  { key: "renca", lbl: "RENCA", tipo: "texto", ancho: 170 },
  { key: "partida_electronica", lbl: "Partida electrónica", tipo: "texto", ancho: 140 },
  { key: "vigencia_poder_fecha", lbl: "Vigencia de poder", tipo: "fecha", ancho: 120 },
  { key: "region", lbl: "Región", tipo: "texto", ancho: 100 },
  { key: "domicilio_fiscal", lbl: "Domicilio fiscal", tipo: "texto", ancho: 240 },
  { key: "departamento_fiscal", lbl: "Departamento", tipo: "texto", ancho: 110 },
  { key: "provincia_fiscal", lbl: "Provincia", tipo: "texto", ancho: 110 },
  { key: "distrito_fiscal", lbl: "Distrito", tipo: "texto", ancho: 110 },
  { key: "fecha_constitucion", lbl: "Constituida el", tipo: "fecha", ancho: 110 },
  { key: "_postulaciones", lbl: "Postulaciones", tipo: "numero", ancho: 90 },
  { key: "_ganadas", lbl: "Ganadas", tipo: "numero", ancho: 80 },
  { key: "_monto", lbl: "S/ adjudicado", tipo: "numero", ancho: 110 },
  { key: "_juego", lbl: "En concurso", tipo: "numero", ancho: 90 },
  { key: "_ejec", lbl: "Ejecutando", tipo: "numero", ancho: 90 },
];

/* ── El registro por entidad ──
 * Las columnas NO se pasan como prop desde la página: llevan funciones
 * (`valor`) y cruzar una función de servidor a cliente es un error de
 * ejecución que el typecheck no ve —van tres veces en este proyecto—. El
 * cliente pide su juego de columnas por NOMBRE y las resuelve aquí, donde ya
 * está del lado del navegador. Lo que cruza la frontera es la cadena
 * "persona"; las funciones nunca salen de este módulo. */
export const COLUMNAS_DE: Record<string, Columna[]> = {
  persona: COLS_PERSONA,
  empresa: COLS_EMPRESA,
};

/* ── Y TODO LO DEMÁS QUE LA FICHA GUARDA ──
 *
 * Las listas de arriba eran una SELECCIÓN editorial, y el comentario que las
 * introduce lo defendía: «el formulario tiene cuarenta campos y una tabla con
 * cuarenta columnas no se usa». Era cierto mientras la tabla solo servía para
 * mirar. Dejó de serlo cuando se usa para BUSCAR a quién sumar a un fondo: ahí
 * la pregunta puede ser por distrito, por lengua materna o por si tiene la
 * firma escaneada, y esos campos no estaban — no porque no existan, sino
 * porque hace meses alguien decidió que no eran los importantes. El resultado
 * era peor que una tabla incompleta: era una tabla que parece completa.
 *
 * Así que la selección se conserva —manda el orden en que se ven y las
 * columnas por defecto son las siete primeras— y detrás va TODO lo demás,
 * sacado de `FORM_CONF`, que es donde ya está declarado una vez qué campos
 * tiene una persona, cómo se llama cada uno y qué valores admite. Copiarlos
 * aquí a mano habría sido el mismo error otra vez, con fecha de caducidad.
 */
const TIPO_DE_CAMPO = (c: CampoDef): TipoCol =>
  c.tipo === "bool" ? "booleano"
  : c.tipo === "date" ? "fecha"
  : c.tipo === "select" ? "opcion"
  : (c.valida === "anio" || c.valida === "monto" || c.valida === "puntaje") ? "numero"
  : "texto";

/* Las columnas de una entidad: la selección de arriba, y detrás todo lo que la
 * ficha guarda y aún no estaba.
 *
 * `filas` es la red de seguridad: si la base tiene una columna que ni la
 * selección ni el formulario conocen —una añadida por SQL y todavía sin
 * formulario—, aparece igual, con su nombre crudo. Es preferible una etiqueta
 * fea a un campo que existe, viaja hasta el navegador y no se puede ni ver ni
 * filtrar sin que nada lo diga. */
export function columnasDe(entidad: string, filas?: any[]): Columna[] {
  const base = COLUMNAS_DE[entidad] || [];
  const vistas = new Set(base.map(c => c.key));
  const out = [...base];

  for (const c of FORM_CONF[entidad]?.campos || []) {
    if (vistas.has(c.key)) continue;
    vistas.add(c.key);
    out.push({
      key: c.key,
      /* El nombre CORTO manda en una cabecera de columna: «Suspensión 4ta —
         año vigente» ocupa media tabla y `corto` existe justamente para eso. */
      lbl: c.corto || c.label,
      tipo: TIPO_DE_CAMPO(c),
      ...(c.tipo === "select" && c.opciones?.length ? { opciones: c.opciones } : {}),
      ancho: c.tipo === "textarea" ? 220 : 130,
    });
  }

  /* Lo que llegó en los datos y nadie declaró. Se mira la PRIMERA fila que
     tenga algo: la fila 0 puede ser una persona a medio llenar y sus nulos no
     dirían nada de las columnas que existen. */
  const muestra = (filas || []).slice(0, 40);
  for (const f of muestra) {
    for (const k of Object.keys(f || {})) {
      if (vistas.has(k) || OCULTAS.has(k)) continue;
      vistas.add(k);
      out.push({ key: k, lbl: rotuloCrudo(k), tipo: "texto", ancho: 130 });
    }
  }
  return out;
}

/* Lo único que NO se lista: la llave primaria, que ni se compara ni se lee.
   Las columnas calculadas (`_elegible`, `_ganadas`…) no hacen falta aquí — ya
   vienen declaradas arriba con su etiqueta, así que `vistas` las cubre. */
const OCULTAS = new Set(["id"]);
const rotuloCrudo = (k: string) => {
  const s = k.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A dónde lleva cada fila. También aquí, por lo mismo. */
export const RUTA_DE: Record<string, (id: string) => string> = {
  persona: id => `/entidad/persona/${id}`,
  empresa: id => `/entidad/empresa/${id}`,
};
