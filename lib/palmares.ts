/* ── PALMARÉS: qué gana, qué roza, cuánto adjudicó ──
 *
 * El mismo recuento estaba escrito en tres sitios (/personas, /empresas y la
 * pestaña Trayectoria de la ficha) y YA no decían lo mismo:
 *
 *   /personas          «roza» = finalista_no_ganadora
 *   ficha de persona   «roza» = finalista  O  finalista_no_ganadora
 *   /empresas          «roza» = finalista_no_ganadora
 *
 * Así que una persona finalista de un concurso vivo salía con un 🥈 en su
 * ficha y sin nada en la lista, sin que ninguna de las dos pantallas pareciera
 * rota. Eso es lo que pasa cuando una definición vive en tres archivos: no se
 * rompe, se desincroniza — y el usuario acaba desconfiando de las dos.
 *
 * La definición, una sola vez:
 *   GANADA  = estado 'ganadora'.
 *   ROZÓ    = 'finalista_no_ganadora' — llegó al final y NO ganó. `finalista`
 *             a secas es un concurso todavía abierto: no es un resultado, es
 *             un estado de tránsito, y contarlo como «casi» da por perdido
 *             algo que aún se puede ganar.
 *   VIVA    = 'finalista' — se cuenta aparte, que es la información útil.
 *   MONTO   = suma de `monto_adjudicado` de las ganadas. NO `monto_solicitado`:
 *             lo pedido no es lo recibido.
 */

export type Palmares = {
  total: number;      // 🎯 en cuántas ha estado
  ganadas: number;    // 🏆
  rozo: number;       // 🥈 finalista que no ganó
  vivas: number;      // ⭐ finalista, aún sin resolver
  monto: number;      // S/ adjudicado
};

export const PALMARES_CERO: Palmares = { total: 0, ganadas: 0, rozo: 0, vivas: 0, monto: 0 };

/** Una postulación, en lo mínimo que hace falta para contarla. */
export type PostMin = { id?: string | null; estado?: string | null; monto_adjudicado?: any };

/* Cuenta una lista de postulaciones. `dedup` importa cuando la lista viene de
   `postulacion_equipo`: una persona puede figurar como Director Y Autor en la
   MISMA postulación, y sin deduplicar el palmarés se infla (4 ganadas cuando
   eran 3). Por id de postulación; las filas sin id se cuentan igual, porque
   descartarlas silenciosamente sería peor que contarlas de más. */
export function palmaresDe(posts: (PostMin | null | undefined)[], dedup = true): Palmares {
  const r: Palmares = { ...PALMARES_CERO };
  const visto = new Set<string>();
  for (const p of posts) {
    if (!p) continue;
    if (dedup && p.id) {
      if (visto.has(p.id)) continue;
      visto.add(p.id);
    }
    r.total++;
    if (p.estado === "ganadora") {
      r.ganadas++;
      r.monto += Number(p.monto_adjudicado) || 0;
    }
    if (p.estado === "finalista_no_ganadora") r.rozo++;
    if (p.estado === "finalista") r.vivas++;
  }
  return r;
}

/** Desenvuelve el `post:postulaciones(...)` de un join (PostgREST a veces array). */
export const postDeFila = (fila: any): PostMin | null => {
  const p = Array.isArray(fila?.post) ? fila.post[0] : fila?.post;
  return p || null;
};

/** El palmarés de una persona a partir de sus filas de `postulacion_equipo`. */
export const palmaresDePersona = (filas: any[] | null | undefined): Palmares =>
  palmaresDe((filas || []).map(postDeFila));

/** Una línea corta para chips y cabeceras. Vacía si nunca postuló. */
export function resumenPalmares(p: Palmares): string {
  if (!p.total) return "";
  /* Un `🏆 0` no informa de nada y se lee como un defecto —además /personas y
     /empresas ya lo suprimen, así que pintarlo aquí era discrepar por nada. */
  const t: string[] = [];
  if (p.ganadas) t.push(`🏆 ${p.ganadas}`);
  if (p.rozo) t.push(`🥈 ${p.rozo}`);
  if (p.vivas) t.push(`⭐ ${p.vivas}`);
  t.push(`🎯 ${p.total}`);
  return t.join(" · ");
}
