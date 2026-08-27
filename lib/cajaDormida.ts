/* ── CAJAS DORMIDAS — el aviso de que nadie está apuntando ──
 *
 * Una caja no se descuadra de golpe: se descuadra porque durante dos semanas
 * nadie apuntó nada, y cuando por fin alguien se sienta a ponerlo al día ya no
 * se acuerda de qué fue ese retiro de S/ 80. El descuadre no se detecta
 * mirando el saldo —el saldo se ve perfecto, solo que es mentira— sino
 * mirando el silencio.
 *
 * De ahí este archivo: convierte «hace cuánto que nadie escribe aquí» en un
 * color. Nada más. No decide dónde se pinta ni qué se hace con él.
 *
 * ── LO QUE SE MIDE ES CUÁNDO SE APUNTÓ, NO CUÁNDO PASÓ ──
 * `movimiento_caja` guarda dos fechas: `fecha` (cuándo salió la plata) y
 * `creado_en` (cuándo alguien lo escribió). Aquí manda `creado_en`, porque lo
 * que se vigila es la ATENCIÓN, no el dinero. Si hoy alguien se sienta y
 * apunta seis gastos de la semana pasada, la caja está atendida —por `fecha`
 * parecería dormida hace siete días, y el aviso saltaría justo el día en que
 * alguien hizo el trabajo. Al revés también: una caja donde no pasa nada
 * durante un mes no es un problema; una donde nadie entra, sí.
 *
 * ── DÍAS HÁBILES, NO CORRIDOS ──
 * Con días corridos, viernes + sábado + domingo son tres, y CADA LUNES
 * amanecerían casi todas las cajas en ámbar. Un aviso que se enciende solo por
 * el calendario se aprende a ignorar en dos semanas, y a partir de ahí ya no
 * avisa de nada: es peor que no tenerlo, porque da sensación de control.
 * Sábado y domingo no cuentan. Los feriados sí cuentan (no hay calendario de
 * feriados aquí): quedarse corto en el aviso es preferible a pasarse.
 */

import { hoyLima, diaLima } from "@/lib/fechas";

export type SituacionCaja =
  | "viva"          // se apuntó hace poco
  | "amber"         // 3 días hábiles o más sin que nadie escriba
  | "roja"          // 6 días hábiles o más
  | "sin_estrenar"  // creada y nunca usada: no está dormida, está sin abrir
  | "ignorada"      // archivada: alguien decidió que ya no se llena
  | "sin_saber";    // no se pudo averiguar. NO es lo mismo que «no hay nada»

export const DIAS_AMBAR = 3;
export const DIAS_ROJA = 6;

/* ── DÍAS HÁBILES ENTRE DOS DÍAS ──
 * Cuenta los días laborables transcurridos DESPUÉS de `desde` y hasta `hasta`
 * inclusive. Mismo día = 0. `diaHabilTras` de lib/cartaDafo hace el camino
 * contrario (dado un plazo, qué fecha cae); aquí hace falta la distancia.
 *
 * Se avanza día a día en vez de calcular semanas: son decenas de vueltas como
 * mucho, y la fórmula cerrada de semanas × 5 es donde se cuelan los errores de
 * un día que nadie encuentra hasta que el aviso salta cuando no debía. */
export function habilesEntre(desde: string, hasta: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null;
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  if (b <= a) return 0;                    // el futuro no cuenta hacia atrás
  /* Un tope de cordura: una caja parada desde hace tres años no necesita 1100
     vueltas para saber que está roja. Pero al toparlo el número deja de ser
     cierto —285 en vez de 780—, y aquí no se devuelve un número aproximado
     haciéndolo pasar por exacto: se devuelve `null`, o sea «no lo sé», y quien
     llama ya sabe qué hacer con eso. La situación no se pierde: a esas alturas
     lleva meses roja, y `TOPE` está muy por encima del umbral de 6 días. */
  const TOPE = 400;
  let habiles = 0, vueltas = 0;
  const d = new Date(a);
  while (d < b && vueltas < TOPE) {
    d.setDate(d.getDate() + 1);
    vueltas++;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) habiles++;   // 0 domingo, 6 sábado
  }
  return vueltas >= TOPE && d < b ? null : habiles;
}

export type CajaVigilada = {
  id: string;
  activa?: boolean;
  /** El instante del último apunte de esa caja, o null si nunca tuvo ninguno. */
  ultimoApunte?: string | null;
};

export type Sueno = {
  situacion: SituacionCaja;
  /** Días hábiles sin que nadie apunte. null cuando no se sabe o no aplica. */
  dias: number | null;
  /** La frase, ya escrita, para no repetirla en cada pantalla. */
  motivo: string;
};

/* ── LA SITUACIÓN DE UNA CAJA ──
 *
 * `ultimoApunte === undefined` significa «no lo averigüé» y sale «sin_saber»;
 * `null` significa «lo averigüé y no hay ninguno». Son cosas distintas y
 * confundirlas es el fallo clásico: si la consulta se cae, todas las cajas
 * saldrían en rojo a la vez —un pánico inventado por un error de red— o, peor,
 * todas en verde, que es un silencio inventado. */
export function suenoDeCaja(c: CajaVigilada, hoy = hoyLima()): Sueno {
  /* ── EL ÚNICO INTERRUPTOR ES ARCHIVAR ──
   * Archivada = alguien decidió que esa caja ya no se llena, y por eso no se
   * vigila. Se pensó también en no vigilar las que tienen saldo 0 —la caja de
   * un proyecto terminado que nadie cerró—, y se descartó: el saldo solo se
   * conoce sumando TODOS los movimientos, y el menú no puede pagar eso. La
   * regla habría valido en la tarjeta y no en la burbuja, y el contador habría
   * mandado a buscar una caja que en pantalla se ve tranquila. Vale más una
   * regla que se cumple en los dos sitios que una regla más fina que no. */
  if (c.activa === false) return { situacion: "ignorada", dias: null, motivo: "archivada" };

  if (c.ultimoApunte === undefined)
    return { situacion: "sin_saber", dias: null, motivo: "no se pudo comprobar" };

  if (!c.ultimoApunte) {
    /* Nunca se apuntó nada. Decirlo así —«sin estrenar»— y no «600 días
       dormida»: son problemas distintos y se arreglan distinto. */
    return { situacion: "sin_estrenar", dias: null, motivo: "sin ningún movimiento todavía" };
  }

  const dia = diaLima(c.ultimoApunte);
  if (!dia) return { situacion: "sin_saber", dias: null, motivo: "fecha ilegible" };
  const dias = habilesEntre(dia, hoy);
  /* `null` con una fecha legible solo puede venir del tope de `habilesEntre`:
     hace más de año y medio del último apunte. Roja sin número —decir «285
     días hábiles» sería inventarse una cifra—, y la frase dice lo que importa,
     que es desde cuándo. */
  if (dias === null)
    return { situacion: "roja", dias: null, motivo: `sin apuntar nada desde el ${dia}` };

  const frase = dias === 0 ? "se apuntó hoy"
    : dias === 1 ? "1 día hábil sin apuntar nada"
    : `${dias} días hábiles sin apuntar nada`;

  if (dias >= DIAS_ROJA) return { situacion: "roja", dias, motivo: frase };
  if (dias >= DIAS_AMBAR) return { situacion: "amber", dias, motivo: frase };
  return { situacion: "viva", dias, motivo: frase };
}

/* Lo que se pinta. El punto y el color viven aquí para que la tarjeta y el
   menú no puedan discrepar sobre qué es «rojo». */
export const COLOR_SUENO: Record<SituacionCaja, string> = {
  viva: "var(--green)",
  amber: "var(--yellow)",
  roja: "var(--red)",
  sin_estrenar: "var(--dim)",
  ignorada: "var(--dim)",
  sin_saber: "var(--dim)",
};

/* ── QUÉ CUENTA PARA LA BURBUJA Y QUÉ NO ──
 * Solo ámbar y roja. `sin_estrenar` se PINTA en la tarjeta pero no se CUENTA
 * en el menú, y es a propósito: la burbuja del zócalo es una llamada a hacer
 * algo hoy, y una caja recién creada no necesita que nadie corra — la va a
 * estrenar quien la creó, cuando la use.
 *
 * La otra asimetría deliberada: /caja la lee todo el equipo, pero la burbuja
 * solo la ve quien puede apuntar (administración o finanzas). Un número rojo
 * permanente en las diecinueve pantallas, sobre un trabajo que uno no puede
 * hacer, es ruido — y del que además enseña a ignorar los rojos de verdad.
 * Mismo criterio que los estados de cuenta en app/nav-acciones.ts. */
export const duerme = (s: SituacionCaja) => s === "amber" || s === "roja";

/* Cuántas cajas duermen, para el contador. `sin_saber` NO suma: un número que
   sube porque falló una consulta manda a mirar algo que no pasa. */
export function cuantasDuermen(cajas: CajaVigilada[], hoy = hoyLima()): number {
  return cajas.reduce((n, c) => n + (duerme(suenoDeCaja(c, hoy).situacion) ? 1 : 0), 0);
}
