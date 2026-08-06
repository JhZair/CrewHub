import { esLiderazgo, rangoRol } from "@/lib/rolesEquipo";

/* ── PALMARÉS: qué ganó, con qué papel, y cuánta cancha tiene ──
 *
 * El recuento estaba escrito en tres sitios (/personas, /empresas y la pestaña
 * Trayectoria) y YA no decían lo mismo: dos contaban «rozó» como
 * `finalista_no_ganadora` y la ficha sumaba además `finalista`. Decía 3 donde
 * las otras decían 2 y ninguna parecía rota. Aquí vive la definición, una vez.
 *
 * ── Las dos preguntas, que no son la misma ──
 *
 *   RESULTADO   ¿ganó?  → `ganadora`. ¿Llegó al final y no ganó? →
 *               `finalista_no_ganadora`. ¿Sigue viva? → `finalista`.
 *   MÉRITO      ¿llegó al encuentro con jurado? → `finalista` O
 *               `finalista_no_ganadora`, indistintamente: superar la
 *               evaluación hasta la instancia final ya ocurrió, esté o no
 *               resuelto el concurso. Un concurso abierto no borra el hito.
 *
 * ── Y el PAPEL desempeñado, que es lo que jerarquiza ──
 *
 *   Ganar dirigiendo no es lo mismo que ganar en el equipo: en el primero el
 *   liderazgo y la responsabilidad recaen en esa persona. Los cargos que
 *   encabezan salen de `CARGOS_LIDERAZGO` (lib/rolesEquipo), no de una regexp
 *   sobre texto libre: «Asistente de Dirección» contiene «Direcc» y no dirige.
 *
 * ── El puntaje ──
 *
 *   ⚠ Es una CONVENCIÓN nuestra, no una medida. Sirve para ordenar listas —no
 *   para decidir por nadie—, y por eso las cifras del desglose se muestran
 *   siempre: quien queda debajo puede ver de qué se compone. Si algún día se
 *   cambian los pesos, cambia el orden de todas las listas a la vez: es el
 *   precio de tener una sola definición, y es el precio correcto.
 */

export const PESOS = {
  ganadaLider: 5,     // ganó encabezando
  finalLider: 3,      // llegó al jurado encabezando
  ganadaEquipo: 2,    // ganó como integrante
  finalEquipo: 1,     // llegó al jurado como integrante
  /* La experiencia cuenta, pero no puede competir con un premio: diez
     postulaciones suman 2, menos que una sola ganada dirigiendo. Presentarse
     tiene mérito; presentarse mucho no equivale a haber ganado. */
  postulacion: 0.2,
} as const;

export type Palmares = {
  total: number;        // 🎯 postulaciones, TODAS las ediciones (ganó, rozó o no)
  ganadas: number;      // 🏆
  rozo: number;         // 🥈 llegó al final y no ganó (concurso resuelto)
  vivas: number;        // ⭐ finalista, aún sin resolver
  monto: number;        // S/ adjudicado
  // Desglose por papel. Solo se llena cuando las filas traen cargo.
  ganadasLider: number;
  ganadasEquipo: number;
  finalLider: number;   // llegó al jurado encabezando y NO ganó
  finalEquipo: number;
  puntaje: number;
};

export const PALMARES_CERO: Palmares = {
  total: 0, ganadas: 0, rozo: 0, vivas: 0, monto: 0,
  ganadasLider: 0, ganadasEquipo: 0, finalLider: 0, finalEquipo: 0, puntaje: 0,
};

export type PostMin = { id?: string | null; estado?: string | null; monto_adjudicado?: any };
/** Una postulación con el papel que jugó la persona en ella. */
export type PostConRol = PostMin & { cargo?: string | null };

const LLEGO_AL_JURADO = ["finalista", "finalista_no_ganadora"];

/* Cuenta una lista de postulaciones. `dedup` importa cuando vienen de
   `postulacion_equipo`: una persona puede figurar como Director Y Autor en la
   MISMA postulación y sin deduplicar el palmarés se infla (4 ganadas cuando
   eran 3). Las filas sin id se cuentan igual — descartarlas en silencio sería
   peor que contarlas de más. */
export function palmaresDe(posts: (PostConRol | null | undefined)[], dedup = true): Palmares {
  const r: Palmares = { ...PALMARES_CERO };
  const visto = new Set<string>();
  for (const p of posts) {
    if (!p) continue;
    if (dedup && p.id) {
      if (visto.has(p.id)) continue;
      visto.add(p.id);
    }
    r.total++;
    const lider = esLiderazgo(p.cargo);
    if (p.estado === "ganadora") {
      r.ganadas++;
      r.monto += Number(p.monto_adjudicado) || 0;
      if (lider) r.ganadasLider++; else r.ganadasEquipo++;
    } else if (LLEGO_AL_JURADO.includes(p.estado || "")) {
      /* El hito (llegar al jurado) no distingue si el concurso ya cerró; el
         RESULTADO sí, y por eso `rozo` y `vivas` se cuentan aparte. */
      if (lider) r.finalLider++; else r.finalEquipo++;
      if (p.estado === "finalista_no_ganadora") r.rozo++;
      else r.vivas++;
    }
  }
  r.puntaje = Number((
    r.ganadasLider * PESOS.ganadaLider
    + r.finalLider * PESOS.finalLider
    + r.ganadasEquipo * PESOS.ganadaEquipo
    + r.finalEquipo * PESOS.finalEquipo
    + r.total * PESOS.postulacion
  ).toFixed(2));
  return r;
}

/** Desenvuelve el `post:postulaciones(...)` de un join (PostgREST a veces array). */
export const postDeFila = (fila: any): PostMin | null => {
  const p = Array.isArray(fila?.post) ? fila.post[0] : fila?.post;
  return p || null;
};

/* Las filas de `postulacion_equipo` de una persona, agrupadas por postulación.
   Cuando figura con dos cargos en la misma, MANDA EL MÁS ALTO: si dirigió y
   además escribió el guion, ganó dirigiendo. Quedarse con la primera fila que
   llega haría que el mérito dependiera del orden en que responde la base. */
export function postulacionesDePersona(filas: any[] | null | undefined): PostConRol[] {
  const porPost = new Map<string, PostConRol>();
  const sueltas: PostConRol[] = [];
  for (const f of filas || []) {
    const post = postDeFila(f);
    if (!post) continue;
    const item: PostConRol = { ...post, cargo: f?.cargo || null };
    if (!post.id) { sueltas.push(item); continue; }
    const previo = porPost.get(post.id);
    if (!previo || rangoRol(item.cargo) < rangoRol(previo.cargo)) porPost.set(post.id, item);
  }
  return [...porPost.values(), ...sueltas];
}

/** El palmarés de una persona a partir de sus filas de `postulacion_equipo`. */
export const palmaresDePersona = (filas: any[] | null | undefined): Palmares =>
  palmaresDe(postulacionesDePersona(filas), false);   // ya viene deduplicado

/* Las líneas del desglose, cada una con su razón. Se devuelven como datos y no
   como texto armado para que cada pantalla decida cómo pintarlas. */
export function lineasPalmares(p: Palmares): {
  ico: string; n: number; txt: string; titulo: string; lider?: boolean;
}[] {
  return [
    { ico: "🏆", n: p.ganadasLider, txt: "ganadas dirigiendo", lider: true,
      titulo: "Ganó encabezando la postulación (dirección o titularidad)" },
    { ico: "⭐", n: p.finalLider, txt: "al jurado dirigiendo", lider: true,
      titulo: "Llegó al encuentro con jurado encabezando, sin ganar" },
    { ico: "🏆", n: p.ganadasEquipo, txt: "ganadas en equipo",
      titulo: "Ganó como integrante del equipo" },
    { ico: "⭐", n: p.finalEquipo, txt: "al jurado en equipo",
      titulo: "Llegó al encuentro con jurado como integrante" },
    { ico: "🎯", n: p.total, txt: "postulaciones",
      titulo: "Todas las ediciones en las que se presentó, con o sin resultado" },
  ].filter(l => l.n > 0);
}

/* El ícono de UNA postulación. Dice el RESULTADO y solo el resultado.
   Hubo una versión con cuatro (🏆 🥇 ⭐ 🎖) para cruzar resultado y papel en un
   glifo: a 12px 🥇 y 🎖 no se distinguen de 🏆 y ⭐, y un icono que hay que
   descifrar no informa, estorba. Son dos dimensiones y piden dos canales: el
   ícono lleva el resultado, el color el papel (la fila que se encabezó va con
   filo ámbar y su cargo en ámbar). Así el desglose se sigue pudiendo contar
   —«2 ganadas dirigiendo» = dos 🏆 con filo— sin memorizar una tabla. */
export function icoMerito(estado?: string | null): string | null {
  if (estado === "ganadora") return "🏆";
  if (LLEGO_AL_JURADO.includes(estado || "")) return "⭐";
  return null;   // el llamador cae a su mapa de estados
}

/** Texto del tooltip de esa fila: el estado exacto y el papel, sin abreviar. */
export function tituloMerito(estado?: string | null, cargo?: string | null): string {
  const ROT: Record<string, string> = {
    ganadora: "Ganada", finalista: "Finalista — el concurso sigue abierto",
    finalista_no_ganadora: "Llegó al jurado y no ganó",
  };
  const base = ROT[estado || ""] || (estado || "").replace(/_/g, " ");
  const papel = esLiderazgo(cargo) ? "encabezando la postulación" : "como integrante del equipo";
  return `${base} · ${cargo || "sin cargo"} (${papel})`;
}

/** Una línea corta para chips y cabeceras. Vacía si nunca postuló. */
export function resumenPalmares(p: Palmares): string {
  if (!p.total) return "";
  const t: string[] = [];
  if (p.ganadas) t.push(`🏆 ${p.ganadas}`);
  if (p.rozo) t.push(`🥈 ${p.rozo}`);
  if (p.vivas) t.push(`⭐ ${p.vivas}`);
  t.push(`🎯 ${p.total}`);
  return t.join(" · ");
}
