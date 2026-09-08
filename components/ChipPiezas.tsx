"use client";
import Link from "@/components/Enlace";
import ChipPop from "@/components/ChipPop";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";
/* El mismo `soles` que el resto del inventario, no una copia. La había, y era
   la tercera del repositorio: la misma cifra podía salir con dos formatos
   distintos en dos chips de la misma línea. */
import { soles } from "@/lib/compras";

export type PiezaMontada = {
  id: string; folio?: string | null; nombre: string;
  cartel?: string | null; estado?: string | null;
  /* ── LO QUE CUESTA CADA PIEZA ──
   * Seis baterías de vuelo y dos centros de carga dentro de un drone son casi
   * tres mil soles. Al firmar la salida de un kit, o al devolverlo con una
   * pieza menos, la pregunta que sigue es siempre cuánto valía esa pieza — y
   * hasta ahora había que salir a buscarla al inventario, una por una.
   * `combo` para las que no tienen precio propio: vinieron dentro de una
   * boleta y les toca su parte, que se calcula donde se conoce el combo
   * entero y viaja ya resuelta. */
  valor?: number | null;
  combo?: { codigo?: string | null; porPieza?: number | null } | null;
};

/* Lo que vale una pieza montada: el suyo, o la parte que le toca de su
   boleta. `estimado` se propaga para que la cifra lleve su «~»: un número
   repartido y uno de una factura no valen lo mismo como prueba. */
const valeM = (p: PiezaMontada): { v: number; esti: boolean } => {
  const propio = Number(p.valor) || 0;
  if (propio > 0) return { v: propio, esti: false };
  const parte = Number(p.combo?.porPieza) || 0;
  return parte > 0 ? { v: parte, esti: true } : { v: 0, esti: false };
};

/* «🔩 3 piezas», y al pulsarlo QUÉ tres.
 *
 * El número solo avisa; la lista es lo que se usa. Al recibir de vuelta un
 * monopod hay que contar contra algo, y ese algo son tres nombres con su
 * foto — no un número que obliga a abrir la ficha en otra pestaña justo
 * cuando tienes el equipo en la mano y a alguien esperando.
 *
 * Las piezas viajan con la fila y no se piden al pulsar: son SUYAS, no se
 * repiten en ninguna otra fila, y la página ya las tiene en memoria. Cargarlas
 * al abrir sería una espera de red para enseñar algo que ya estaba aquí. (El
 * kit y el combo sí se piden, y por lo contrario: se repiten en cada fila. Está
 * contado en `ChipPop`.)
 *
 * El pop-up NO es un enlace a ningún sitio: se abre encima y se cierra. Ir a
 * la ficha del ensamblado desde la pantalla de entrega es perder lo que ya
 * llevabas marcado.
 *
 * ⚠ Toda la mecánica del pop-up —portal, `fixed`, medir el alto, cerrarse al
 * desplazar la página pero no al desplazarse él— vive en `components/ChipPop`.
 * Estuvo aquí, y costó dos intentos; con tres chips iguales en la misma fila,
 * tenerla tres veces sería equivocarse en tres sitios. Ahí está el porqué de
 * cada decisión.
 */
export default function ChipPiezas({ piezas, titulo = "Va armado: lleva piezas montadas dentro" }: {
  piezas: PiezaMontada[];
  titulo?: string;
}) {
  if (!piezas.length) return null;

  const sumas = piezas.map(valeM);
  const total = sumas.reduce((a, x) => a + x.v, 0);
  const estimado = sumas.some(x => x.esti);

  return (
    <ChipPop
      titulo={titulo}
      etiqueta={<>🔩 {piezas.length} pieza{piezas.length === 1 ? "" : "s"}</>}
      cabecera={
        <>
          🔩 Va con {piezas.length} pieza{piezas.length === 1 ? "" : "s"} montada{piezas.length === 1 ? "" : "s"}
          {/* El total de lo que va dentro. Con nueve filas de precios, la suma
              a mano es justo lo que nadie hace: se dice aquí. */}
          {total > 0 && (
            <span className="ens-pop-tot" title={estimado
              ? "Aproximado: alguna pieza vino en un combo sin precio propio y se le reparte su parte de la boleta."
              : "Suma de lo que cuesta cada pieza montada."}>
              {estimado ? "~" : ""}{soles(total)}
            </span>
          )}
        </>
      }>
      {piezas.map(p => (
        <Link key={p.id} href={`/entidad/equipamiento/${p.id}`} className="ens-pop-fila">
          <span className="kit-pz-img">
            {p.cartel
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
              : <span>🎥</span>}
          </span>
          {p.folio && <span className="kit-pz-folio">{p.folio}</span>}
          <span className="ens-pop-n">{p.nombre}</span>
          {/* El estado solo cuando NO es «ensamblado»: dentro de su ensamblado
              eso es lo normal y decirlo en cada fila es repetir el título del
              pop-up tres veces. Lo que sí importa es la pieza que está rota o
              no aparece estando montada. */}
          {p.estado && p.estado !== "ensamblado" && (
            <span style={{ fontSize: 10, color: colorEstadoEq(p.estado), whiteSpace: "nowrap" }}>
              {txtEstadoEq(p.estado)}
            </span>
          )}
          {/* El precio al final de la fila, no pegado al nombre: la columna de
              cifras se suma con la vista, y con el precio entremedio del texto
              hay que buscarlo nueve veces. */}
          {(() => {
            const { v, esti } = valeM(p);
            if (v > 0) return (
              <span className={`ens-pop-val${esti ? " esti" : ""}`}
                title={esti ? `Sin precio propio: le toca esta parte de ${p.combo?.codigo || "su boleta"}.` : undefined}>
                {esti ? "~" : ""}{soles(v)}
              </span>
            );
            /* Sin precio NO se calla: una pieza sin valorar es la que hace que
               el total del kit vaya corto, y el hueco solo se arregla si se ve. */
            return <span className="ens-pop-sinval" title="Sin precio propio ni combo: no suma al valor del kit.">⚠</span>;
          })()}
        </Link>
      ))}
    </ChipPop>
  );
}
