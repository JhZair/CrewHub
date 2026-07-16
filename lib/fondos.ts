/* ── Cuándo una empresa puede postular a un fondo ──
 *
 * La cadena real de papeles, en orden:
 *
 *   vigencia de poder  →  sirve para PEDIR el RENCA
 *   RENCA              →  sirve para POSTULAR
 *
 * La vigencia no es requisito del fondo: es requisito del trámite anterior.
 * Con el RENCA en mano ya cumplió. Exigirla para postular era pedir dos
 * veces el mismo papel, y el sistema decía «1 libre» cuando había 9.
 *
 * Y no basta con tener los papeles: una empresa comprometida no puede
 * tomar otro fondo. Comprometida = postulando, o ejecutando uno ganado.
 *
 * Todo vive aquí porque la misma regla estaba escrita en /empresas y en
 * /qhaway con palabras distintas — y cuando dos sitios deciden lo mismo por
 * separado, un día dejan de coincidir sin que nadie se entere.
 */

/* La partida sigue viva: presentada y sin resolverse. */
export const EN_JUEGO = ["en_preparacion", "enviada", "finalista"];
export const enJuego = (p: { estado?: string | null }) => EN_JUEGO.includes(p.estado || "");

/* Ejecutando: ganó y todavía no entregó la rendición.
 *
 * Antes esto era «ganadora cuyo plazo no ha vencido», y fallaba en los dos
 * casos que más importaban: sin plazo cargado la daba por libre, y con el
 * plazo vencido la daba por cerrada — aunque nadie hubiera entregado nada.
 * «Vencida» significaba entregada o debiéndola, y elegía la optimista.
 *
 * Ahora manda el hecho, no el calendario: mientras no haya fecha de entrega,
 * el fondo sigue abierto. El plazo dice si va tarde (ver `rendicionVencida`),
 * no si terminó.
 */
export const ejecutando = (p: { estado?: string | null; fecha_rendicion_real?: string | null }) =>
  p.estado === "ganadora" && !p.fecha_rendicion_real;

/* El plazo de una ganadora, con la prórroga si la hay. */
export const plazoRendicion = (p: { fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null }) =>
  p.fecha_prorroga || p.fecha_limite_rendicion || null;

/* Debiendo: el plazo pasó y no hay entrega registrada. Es lo más grave que
   le puede pasar a una empresa ante DAFO, y hasta hoy se leía como «cerrada». */
export const rendicionVencida = (p: {
  estado?: string | null; fecha_rendicion_real?: string | null;
  fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null;
}) => {
  if (!ejecutando(p)) return false;
  const f = plazoRendicion(p);
  return !!f && f < new Date().toISOString().slice(0, 10);
};

/* Ganadora sin plazo cargado: no se sabe para cuándo debe rendir. No es que
   esté libre — es que falta el dato, y un hueco no es un permiso. */
export const rendicionSinPlazo = (p: {
  estado?: string | null; fecha_rendicion_real?: string | null;
  fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null;
}) => ejecutando(p) && !plazoRendicion(p);

/* Los campos que hacen falta para decidir. Escritos aquí para que ninguna
   página se olvide de traer uno y saque una conclusión con medio dato —
   `fecha_rendicion_real` faltando se lee igual que «no la ha entregado». */
export const SEL_FONDO =
  "id,empresa_id,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real";
