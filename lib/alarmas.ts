import { hoyLima } from "@/lib/fechas";

/* ══════════════════════════════════════════════════════════════════════════
   lib/alarmas.ts — LO QUE UNA ALARMA DICE DE SÍ MISMA

   La tabla guarda los hechos (db/alarmas.sql). Aquí vive lo que se deduce de
   ellos, y vive UNA vez: la franja de arriba, el bloque de la ficha y la
   tarjeta de /fondos dicen lo mismo porque preguntan a la misma función. Tres
   cálculos del mismo estado acaban discrepando, y una alarma que dice dos
   cosas distintas en dos pantallas es peor que ninguna alarma.
   ══════════════════════════════════════════════════════════════════════════ */

export type Alarma = {
  id: string;
  entidad_tipo: string;
  entidad_id: string;
  titulo: string;
  motivo: string;
  revisar_el: string;
  caso_id?: string | null;
  encendida_en: string;
  encendida_por?: string | null;
  apagada_en?: string | null;
  /** El nombre de quien la encendió, si viajó embebido. */
  quien?: { nombre?: string | null } | null;
};

/** Días enteros entre dos fechas ISO (positivo si la segunda es posterior). */
const dias = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export type EstadoAlarma = {
  /** Días encendida. */
  edad: number;
  /** Días de retraso sobre su fecha de revisión. 0 o negativo = aún a tiempo. */
  vencida: number;
  /** El texto que se enseña al lado del título, o null si no hay nada que
   *  añadir. Nunca inventa urgencia: solo cuenta lo que pasó. */
  aviso: string | null;
};

export function estadoAlarma(a: Alarma, hoy = hoyLima()): EstadoAlarma {
  const edad = Math.max(0, dias(String(a.encendida_en).slice(0, 10), hoy));
  const vencida = dias(a.revisar_el, hoy);
  return {
    edad,
    vencida,
    /* ── LA ALARMA SE DELATA SOLA ──
       Este es el mecanismo que impide que una alarma se quede encendida para
       siempre: pasada su fecha de revisión, deja de hablar del problema y
       empieza a hablar de sí misma. El sistema le pide cuentas a quien la
       encendió, en vez de esperar a que alguien se acuerde.
       Antes de la fecha no dice nada de tiempos: repetir «lleva 3 días» sobre
       algo que se revisa el viernes es ruido. */
    aviso: vencida > 0
      ? `sin revisar desde hace ${vencida} día${vencida === 1 ? "" : "s"}`
      : null,
  };
}

/** «encendida hace 12 días · se revisa el 03/09» — el pie de una alarma. */
export function pieAlarma(a: Alarma, hoy = hoyLima()): string {
  const e = estadoAlarma(a, hoy);
  const dmy = (iso: string) => String(iso).slice(0, 10).split("-").reverse().join("/");
  const cuando = e.edad === 0 ? "encendida hoy" : `encendida hace ${e.edad} día${e.edad === 1 ? "" : "s"}`;
  return `${cuando} · se revisa el ${dmy(a.revisar_el)}`;
}

/* Cuántas alarmas vivas hay ya. Se enseña ANTES de encender otra, no para
   prohibirla: la escasez es lo que hace que un rojo signifique algo, y quien
   enciende la tercera tiene que verlo. */
export const AVISO_ESCASEZ = (n: number) =>
  n >= 2
    ? `Ya hay ${n} alarmas encendidas. Cada rojo de más resta atención a los otros: comprueba que las anteriores siguen haciendo falta.`
    : null;
