"use client";

/* ── LOS DOS EJES DE UN GASTO, EN UN SOLO CONTROL ──
 *
 * Cada gasto del fondo se clasifica en dos ejes independientes:
 *   · ETAPA — cuándo se hizo (preproducción, rodaje, postproducción).
 *   · RUBRO — contra qué línea del presupuesto se descuenta.
 * DAFO presupuesta por RUBRO, no por fase, así que el mismo rubro se gasta a
 * lo largo de todo el proyecto y los dos ejes no se deducen uno del otro.
 *
 * ── POR QUÉ VIVE EN SU PROPIO ARCHIVO ──
 * Estaba dentro de RendicionFondo, y por eso los recibos tenían los
 * desplegables EN LA FILA mientras las facturas y las declaraciones juradas
 * obligaban a abrir el formulario de edición, cambiar y guardar. La misma
 * tarea —clasificar un gasto— se hacía de dos maneras según la lista, y la
 * lenta era justo la de diez facturas seguidas del mismo rubro.
 * Un control compartido es lo que evita que la tercera lista invente una
 * tercera forma.
 *
 * ── SIN PERMISO SE VE, PERO NO SE TOCA ──
 * `editable={false}` no oculta el valor: lo enseña como texto. Esconder la
 * clasificación a quien no puede cambiarla convertiría «no puedo editar» en
 * «no sé en qué rubro está», que son cosas muy distintas al revisar.
 */

export type OpcionEje = {
  id: string;
  nombre: string;
  /** Qué contiene y cuánto queda. Va en el `title` de la opción: el nombre
   *  solo —«Equipo del proyecto»— no dice si ahí van los honorarios o los
   *  equipos, y averiguarlo obligaba a abrir el presupuesto en otra pestaña. */
  ayuda?: string;
};

export default function EjeSelect({ valor, vacio, opciones, editable, onCambio, ancho = 210 }: {
  valor: string;
  /** Qué decir cuando no hay nada elegido. En ámbar: un gasto sin rubro no
   *  reparte en la conciliación, así que el hueco es un pendiente, no un
   *  «opcional». */
  vacio: string;
  opciones: OpcionEje[];
  editable: boolean;
  onCambio: (v: string) => void;
  ancho?: number;
}) {
  const actual = opciones.find(o => o.id === valor);
  if (!editable) {
    return (
      <span style={{ fontSize: 12.5, color: actual ? "var(--muted)" : "var(--yellow)" }}
        title={actual?.ayuda}>
        {actual ? actual.nombre : vacio}
      </span>
    );
  }
  return (
    <select value={valor} onChange={e => onCambio(e.target.value)}
      /* El título del propio select repite la ayuda del valor elegido: una vez
         cerrado, el desplegable ya no enseña los `title` de las opciones y el
         dato —cuánto queda de ese rubro— desaparecería justo cuando sirve para
         revisar lo ya clasificado. */
      title={actual?.ayuda}
      style={{
        fontSize: 12.5, padding: "4px 8px", borderRadius: 6,
        background: "var(--bg)", color: valor ? "var(--text)" : "var(--yellow)",
        border: `1px solid ${valor ? "var(--border)" : "rgba(244,180,0,.4)"}`, maxWidth: ancho,
      }}>
      <option value="">{vacio}</option>
      {opciones.map(o => <option key={o.id} value={o.id} title={o.ayuda}>{o.nombre}</option>)}
    </select>
  );
}
