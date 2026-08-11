"use client";
import VistaCompra from "@/components/VistaCompra";

/* EL ⚡ DEL COMBO, PARA PÁGINAS DE SERVIDOR.
 *
 * `VistaCompra` recibe sus hijos como FUNCIÓN —`{abrir => <button …/>}`—, que
 * es la forma limpia de dejar que cada sitio decida con qué se abre la vista
 * al vuelo sin que la vista sepa nada del botón. Funciona desde cualquier
 * componente de cliente, y así lo usan el panel de combos, el alta en lote y
 * la ficha del equipo.
 *
 * Desde un componente de SERVIDOR no funciona, y no falla al compilar: una
 * función no se puede serializar para cruzar la frontera, así que React
 * revienta en el navegador con «Functions are not valid as a child of Client
 * Components». `/buscar` es de servidor y lo hacía.
 *
 * Peor: llevaba tiempo haciéndolo sin que se notara. La sección de combos de
 * la búsqueda leía la tabla equivocada —el `select` de `compras` se había
 * colado en el puesto 7 del Promise.all y corrió seis tablas—, así que nunca
 * encontraba ningún combo y este bloque jamás se pintaba. Al arreglar aquello,
 * los combos empezaron a salir… y con ellos el error que estaba esperando.
 *
 * Este envoltorio es la frontera: un componente de cliente mínimo que sí puede
 * tener la función dentro. Lo que cruza ahora es un id, que es un string.
 */
export default function OjoCompra({ id, titulo = "Ver el combo" }: {
  id: string;
  titulo?: string;
}) {
  return (
    <VistaCompra compraId={id}>
      {abrir => (
        <button className="chip-ojo fila-encima" onClick={abrir} title={titulo}>⚡</button>
      )}
    </VistaCompra>
  );
}
