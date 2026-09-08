"use client";
import Link from "@/components/Enlace";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";
import { soles } from "@/lib/compras";

/* ══════════════════════════════════════════════════════════════════════════
   📋 UNA FILA DE UN POP-UP DE CHIP

   La misma fila la pintaban a mano `ChipPiezas`, `ChipGrupo` y `ChipAnfitrion`:
   miniatura, folio, nombre, estado y precio. Tres copias del mismo marcado, que
   es como acaban tres listas de lo mismo pareciéndose cada vez menos.

   ── TRES RENGLONES, NO UNO ──
   En una sola línea, dentro de una caja de 340 px, el nombre se llevaba lo que
   sobraba después del folio, el estado y el precio — y lo que sobra son unos
   veinte caracteres. «Cable carga súper rápida 2.0 C a C - 1m 45W-Samsung» se
   leía como «Cable carga súper rápida 2.0 …», que es exactamente el trozo que
   TODOS los cables comparten: la lista enseñaba seis filas idénticas.

   Repartido así, el nombre se lleva el ancho entero:
     · arriba   el folio y el estado — lo corto, lo que se busca de un vistazo
     · en medio el NOMBRE, hasta dos renglones
     · abajo    quién lo tiene, con el precio al final

   Los renglones de arriba abajo y no dos columnas: una columna de cifras a la
   derecha obligaría a reservarle sitio en todas las filas, que es de donde
   había que sacar el ancho.

   ⚠ Y son TRES solo cuando hay tres cosas que decir. La lista de piezas
   montadas no sabe quién tiene cada una —no se presta una pieza suelta, se
   presta el equipo que la lleva—, así que su tercer renglón sería quince
   píxeles de alto para una cifra sola: ahí el precio sube al primero, a la
   derecha del folio. Nueve baterías son nueve filas, y un renglón de adorno
   en cada una es lo que hace que la novena no quepa.

   ── QUÉ SE CALLA, LO DECIDE QUIEN LA USA ──
   `estado` llega ya filtrado: dentro de un ensamblado «ensamblado» es lo normal
   y repetirlo nueve veces es repetir el título del pop-up; dentro de un kit lo
   normal es «disponible». Cada lista sabe cuál es su silencio, y meterlo aquí
   sería una regla con tres excepciones.
   ══════════════════════════════════════════════════════════════════════════ */

export type Precio = {
  valor: number;
  /** Repartido de una boleta, no propio: se pinta con «~» y en gris. Un número
   *  prorrateado y uno de una factura no valen lo mismo como prueba. */
  esti?: boolean;
  titulo?: string;
};

export default function FilaPop({
  id, folio, nombre, cartel, estado, quien, precio, sinPrecio,
}: {
  id: string;
  folio?: string | null;
  nombre: string;
  cartel?: string | null;
  /** Ya filtrado por quien la usa: `null` = no hay nada que decir de él. */
  estado?: string | null;
  /** Quién lo tiene AHORA. Es media respuesta: saber que el kit lleva un
   *  trípode no sirve si el trípode está en Puno. */
  quien?: string | null;
  precio?: Precio | null;
  /** Qué decir cuando no hay precio. El ⚠ se pinta igual —un equipo sin
   *  valorar es el que hace que el total vaya corto, y eso solo se arregla si
   *  se ve— pero el motivo cambia según la lista. */
  sinPrecio?: string;
}) {
  /* La cifra, una sola vez y en el renglón que toque: con prestatario va abajo
     a su lado; sin él sube al primero y se ahorra un renglón entero por fila. */
  const cifra = precio
    ? <span className={`ens-pop-val${precio.esti ? " esti" : ""}`} title={precio.titulo}>
        {precio.esti ? "~" : ""}{soles(precio.valor)}
      </span>
    : sinPrecio
      ? <span className="ens-pop-sinval" title={sinPrecio}>⚠ sin precio</span>
      : null;

  return (
    <Link href={`/entidad/equipamiento/${id}`} className="ens-pop-fila">
      <span className="kit-pz-img">
        {cartel
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cartel} alt="" referrerPolicy="no-referrer" />
          : <span>🎥</span>}
      </span>
      <span className="fpop-txt">
        {/* Sin folio, sin estado y sin cifra que subir, este renglón no se pinta:
            un contenedor vacío sigue gastando el `gap` de la columna. */}
        {(folio || estado || (!quien && cifra)) && (
          <span className="fpop-l1">
            {folio && <span className="kit-pz-folio">{folio}</span>}
            {estado && (
              <span className="fpop-estado" style={{ color: colorEstadoEq(estado) }}>
                {txtEstadoEq(estado)}
              </span>
            )}
            {!quien && cifra}
          </span>
        )}
        {/* El nombre, con TODO el ancho y hasta dos renglones. Más de dos y una
            lista de nueve piezas no cabe en un portátil; menos de dos y volvemos
            a cortar por donde todos los cables se parecen. */}
        <span className="fpop-nom" title={nombre}>{nombre}</span>
        {quien && (
          <span className="fpop-l3">
            <span className="fpop-quien">lo tiene {quien}</span>
            {cifra}
          </span>
        )}
      </span>
    </Link>
  );
}
