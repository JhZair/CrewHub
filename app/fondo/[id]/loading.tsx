/* ── QUE SE NOTE QUE ESTÁ CARGANDO ──
 *
 * Cuando las seis pestañas eran de cliente y estaban todas montadas, cambiar
 * de una a otra era instantáneo: solo cambiaba un `display`. Ahora cada
 * pestaña es una ruta y su clic es un viaje al servidor —Financiera pide unas
 * veinte consultas—, así que sin esto el navegador se queda con la pestaña
 * anterior pintada y sin ninguna señal durante segundos. El equipo lo lee como
 * «se colgó», que es la conclusión razonable.
 *
 * ⚠ ESTO NO PUEDE IR EN LA RAÍZ DE LA APP. Un `loading.tsx` en `app/` apaga el
 * cortocircuito de precarga de todo el sistema —está explicado en
 * app/globals.css—, y por eso no hay ninguno. Aquí es distinto: acotado a
 * `/fondo/[id]/*`, solo afecta a este subárbol, y sus enlaces van con
 * `prefetch=false`, así que tampoco desata precargas.
 *
 * La cabecera NO se repinta: vive en el layout, que no se vuelve a renderizar
 * al cambiar de segmento. Lo que parpadea es solo el contenido de la pestaña,
 * que es justo lo que está tardando.
 */
export default function CargandoFondo() {
  return (
    <div className="fondo-cargando" aria-busy="true" aria-live="polite">
      <span className="fondo-cargando-txt">Cargando…</span>
    </div>
  );
}
