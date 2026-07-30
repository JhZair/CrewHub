/**
 * Pruebas de la agrupación de la campanita (lib/notificaciones.ts). Se corre a
 * mano, sin instalar nada:
 *
 *     node --experimental-strip-types scripts/prueba-notificaciones.mts
 *
 * Por qué existe: agrupar es la clase de lógica que falla en silencio. Si junta
 * de más, entierra un «te mencionó» dentro de «3 comentarios» y nadie se entera
 * de que se perdió un aviso; si junta de menos, no arregla nada y parece que sí.
 * Ninguna de las dos cosas da error en pantalla.
 *
 * Los casos salen de datos reales del 29/07/2026: quince comentarios alternando
 * entre dos personas en un caso, en una hora.
 */
import { agruparNotifs, actoresTexto } from "../lib/notificaciones.ts";

let fallos = 0;
const ok = (nombre: string, real: any, esperado: any) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? "✓" : "✗ FALLA"}  ${nombre}` + (bien ? "" : `\n     esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`));
};

const n = (id: string, tipo: string, pub: string | null, actor: string | null, leida = false) => ({
  id, tipo, publicacion_id: pub, actor_nombre: actor, leida,
  creado_en: "2026-07-29T15:00:00Z", mensaje: `Nuevo comentario en «Enviar avance Vertical Slice»`,
});

// ── El caso que lo motivó: una conversación, no cuatro eventos ──
const conversacion = [
  n("c4", "comentario", "P1", "Carlos Condori"),
  n("c3", "comentario", "P1", "Carlos Condori"),
  n("c2", "comentario", "P1", "Carlos Condori"),
  n("c1", "comentario", "P1", "Carlos Condori", true),
];
const g1 = agruparNotifs(conversacion);
ok("cuatro comentarios del mismo caso → una fila", g1.length, 1);
ok("la fila dice cuántos son", g1[0].cuenta, 4);
ok("representa a la más reciente", g1[0].n.id, "c4");
ok("solo marca las que estaban sin leer", g1[0].idsSinLeer, ["c4", "c3", "c2"]);
ok("pero recuerda todas", g1[0].ids.length, 4);

// ── Lo que NO se puede juntar ──
const conMencion = [
  n("m1", "mencion", "P1", "Katy"),
  n("c2", "comentario", "P1", "Carlos"),
  n("c1", "comentario", "P1", "Carlos"),
];
const g2 = agruparNotifs(conMencion);
ok("una mención NO se entierra entre los comentarios del mismo caso", g2.length, 2);
ok("la mención va primera (es la más reciente)", g2[0].n.tipo, "mencion");
ok("y sigue sola", g2[0].cuenta, 1);

ok("casos distintos no se mezclan",
  agruparNotifs([n("a", "comentario", "P1", "Carlos"), n("b", "comentario", "P2", "Carlos")]).length, 2);

ok("sin destino, cada una es su propio grupo",
  agruparNotifs([n("x", "sistema", null, "Bot"), n("y", "sistema", null, "Bot")]).length, 2);

// ── Quién habla ──
const variosActores = agruparNotifs([
  n("v3", "comentario", "P1", "Carlos Condori"),
  n("v2", "comentario", "P1", "Ana María Torres"),
  n("v1", "comentario", "P1", "Carlos Condori"),
]);
ok("los actores no se repiten y van de más reciente a más viejo",
  variosActores[0].actores, ["Carlos", "Ana"]);
ok("una sola persona", actoresTexto(["Carlos"]), "Carlos");
ok("dos personas", actoresTexto(["Carlos", "Ana"]), "Carlos y 1 más");
ok("tres personas", actoresTexto(["Carlos", "Ana", "Luis"]), "Carlos y 2 más");
ok("nadie", actoresTexto([]), "");

// ── Bordes ──
ok("lista vacía", agruparNotifs([]), []);
ok("nulo no revienta", agruparNotifs(null as any), []);
ok("todas leídas → no hay nada que marcar",
  agruparNotifs([n("l1", "comentario", "P1", "Carlos", true)])[0].idsSinLeer, []);

// ── El orden de la lista se respeta ──
const orden = agruparNotifs([
  n("z1", "comentario", "P2", "Ana"),
  n("z2", "comentario", "P1", "Carlos"),
  n("z3", "comentario", "P2", "Ana"),
]);
ok("el grupo hereda la posición de su primera aparición",
  orden.map(g => g.n.id), ["z1", "z2"]);
ok("y recoge las de más abajo", orden[0].cuenta, 2);

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
process.exit(fallos ? 1 : 0);
