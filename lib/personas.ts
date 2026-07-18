/* ── Quién es "gente nuestra" ──
   Una sola respuesta para todo el sistema. Estaba escrita dos veces y no
   coincidían: /personas incluía a los "colaborador eventual" y /qhaway no,
   pero a cambio el vigía metía a cualquiera con cuenta y no miraba el
   estado —así que le pedía el DNI a gente vetada—.

   La regla: solo `personal` y `colaborador`, y solo si están activos.
   El "colaborador eventual" es alguien con quien trabajamos suelto; cuando
   entra en algo que exige papeles (girarle RHE, meterlo en una carpeta) se
   le sube a `colaborador` y desde ese momento el sistema se los reclama.
   Así el tipo declara el compromiso, y el compromiso trae los papeles. */

export const TIPOS_EQUIPO = ["personal", "colaborador"];

export const esDelEquipo = (p: { estado?: string | null; tipo?: string | null }) =>
  p.estado === "activo" && TIPOS_EQUIPO.includes(p.tipo || "");

/* Para las consultas a PostgREST, que no pueden llamar a la función. */
export const FILTRO_EQUIPO = `(${TIPOS_EQUIPO.join(",")})`;

/* ── EL BOT NO ES GENTE ──
   Bot Qhaway tiene una cuenta como cualquiera, así que hay que apartarlo a
   mano de todo lo que signifique «el equipo»: no carga casos —«él reparte, no
   carga casos», dice /pulso—, no se entera de avisos, no tiene carga de
   trabajo, no se le asigna nada.

   Eso estaba escrito con el nombre a pelo en DOCE sitios. Y uno se quedó con
   el nombre VIEJO: /pantalla filtraba «Qhaway» y la cuenta se llama «Bot
   Qhaway» desde que se corrió db/rename-bot-qhaway.sql. Ese filtro no
   coincide con nada, así que el muro de la oficina lleva desde entonces
   pintando al bot en el pulso del equipo —con su barra de carga— como si
   fuera una persona. Nadie lo reportó: es una TV, se mira de lejos.

   Renombrar una cuenta no debería obligar a acordarse de doce archivos. */
export const BOT = "Bot Qhaway";

export const esBot = (p?: { nombre?: string | null } | null) => p?.nombre === BOT;

/** El equipo sin el bot. Lo que casi siempre se quiere. */
export const sinBot = <T extends { nombre?: string | null }>(xs: T[] | null | undefined): T[] =>
  (xs || []).filter(x => !esBot(x));
