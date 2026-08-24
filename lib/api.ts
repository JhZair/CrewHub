/* ══════════════════════════════════════════════════════════════════════════
   EL TECHO DE VERDAD

   PostgREST corta en un número de filas fijo por consulta y NO avisa: no hay
   error, no hay cabecera que mirar por defecto, solo vienen menos filas de las
   que hay. En este proyecto ese ajuste está en **1000**
   (Supabase → Settings → Data API → «Max rows»), comprobado el 24 ago 2026.

   ── POR QUÉ ESTE ARCHIVO EXISTE ──
   Porque escribir `.limit(4000)` no sube el techo: lo tapa. Había veinte
   límites por encima de mil repartidos por el código, escritos de buena fe con
   números que parecían margen —4000, 6000, 20000— y que en realidad
   describían un techo que nunca existió.

   Y lo peor no es traer menos filas. Es que los avisos construidos sobre esos
   números dejan de poder encenderse: el de /buscar comparaba
   `filas.length > 4000` para decir «no se buscó en todo», y como nunca vuelven
   más de mil, ese aviso era decorativo. El mecanismo que existía para vigilar
   el techo estaba, él mismo, por encima del techo.

   ── CÓMO SE USA ──
   `techo(n)` devuelve el tope que de verdad se puede pedir. Quien quiera saber
   si se recortó, pide `techo(n) + 1` y mira si volvió de más — por eso se
   reserva una fila: sin ella, la sonda tampoco cabría.

   ⚠ Si algún día se sube «Max rows» en Supabase, este número tiene que subir
   con él. Y al revés: bajar aquí es más seguro que bajarlo allá, porque aquí
   se ve al leer el código.
   ══════════════════════════════════════════════════════════════════════════ */

export const TOPE_API = 1000;

/** El tope real que se puede pedir, dejando sitio para la fila de sonda. */
export const techo = (deseado: number) => Math.min(deseado, TOPE_API - 1);
