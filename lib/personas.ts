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
