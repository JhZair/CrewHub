"use client";
import { useState } from "react";
import ChipPop from "@/components/ChipPop";
import FilaPop from "@/components/FilaPop";
import { contenidoDeGrupo, type MiembroGrupo } from "@/app/actions";
/* ⚠ El MISMO `soles` que pinta el sufijo del chip en la fila, no una copia
   local con «S/» fijo. La había, y con una boleta en dólares el chip decía
   «$ 1,200» y su propio pop-up «S/ 1,200» a dos centímetros: la misma cifra
   con dos monedas. `lib/compras` es cálculo puro y cruza a cliente sin más. */
import { soles } from "@/lib/compras";

/* ══════════════════════════════════════════════════════════════════════════
   📦 EL KIT Y 🧾 EL COMBO DE UNA FILA, ABIERTOS

   En el inventario eran dos etiquetas mudas. «📦 Bolso Kit de Grabación P…» no
   contesta la pregunta que la hace mirar —¿qué más va en ese bolso?— y obligaba
   a irse a /equipamiento/combos, buscar el kit y volver, perdiendo el filtro.
   Ahora abren, como el chip de piezas.

   ── UN COMPONENTE PARA LOS DOS ──
   Cambian el emoji, el color y la frase; lo que se pinta es la misma lista de
   equipos con la misma información. Dos componentes serían dos sitios donde
   arreglar la misma fila.

   ── EL CONTENIDO SE PIDE AL PULSAR ──
   Al revés que las piezas, que son de su equipo y no se repiten: un kit de doce
   sale en doce filas. Está contado en `ChipPop` y en la acción.

   ── QUIÉN LO TIENE, EN CADA FILA ──
   Es la mitad de la respuesta. Saber que el kit lleva un trípode no sirve de
   nada si el trípode está en Puno con alguien; y eso es justo lo que se está
   preguntando quien mira el kit antes de una salida.
   ══════════════════════════════════════════════════════════════════════════ */

export default function ChipGrupo({ que, id, nombre, rotulo, porAnfitrion, total: totalBoleta, enChip, moneda, titulo }: {
  que: "kit" | "combo";
  id: string;
  /** Cómo se llama: el nombre del kit, o el código del combo. Es lo que se lee
   *  en el chip y lo que encabeza el pop-up. */
  nombre: string;
  /* ── LO QUE SE LEE EN EL CHIP, CUANDO NO ES EL NOMBRE ──
     En el inventario el chip es la única mención del kit, así que dice su
     nombre. En la vista por sitio el kit ES la fila —su cara y su nombre están
     dos centímetros a la izquierda— y repetirlo en el chip pintaba «S24 básico
     · 📦 S24 básico». Ahí el chip dice lo que la fila no: «📦 2 equipos», que
     además es la misma forma que el «🔩 4 piezas» del equipo de al lado.
     ⚠ Solo cambia el rótulo. El pop-up sigue encabezado por `nombre`: quien lo
     abre desde «2 equipos» necesita ver de QUÉ kit son. */
  rotulo?: React.ReactNode;
  /* ── NO ES SUYO: LO ARRASTRA SU ANFITRIÓN ──
     Un cable atornillado dentro de un power bank que sí está en el kit viaja
     con el kit y no pertenece a él. La diferencia no es un matiz: el miembro
     se puede quitar desde el editor del kit y cuenta como una salida al
     entregar; la pieza montada, ni lo uno ni lo otro —sale porque va dentro—.
     Pintado igual que una pertenencia de verdad, el chip afirmaría algo falso,
     así que se marca: ↖ y el borde punteado. El pop-up es el MISMO, que la
     pregunta que lo abre —qué más va en ese kit— sí es la misma. */
  porAnfitrion?: boolean;
  /* ── LA CIFRA DE UN COMBO SALE DE LA BOLETA, NO DE UNA SUMA ──
   * Un combo tiene un precio: el que dice el papel. La suma de los precios
   * propios de sus unidades es OTRA cosa —casi siempre menor, porque a las
   * unidades de un combo justamente no se les pone precio propio— y enseñar
   * las dos como si fueran lo mismo era decir «🧾 C-012 · S/ 4,500» en el chip
   * y «≥ S/ 320» al abrirlo. Así que en un combo manda esto, y la suma no se
   * calcula. Un kit no tiene boleta: ahí sí, lo que vale es lo que suman los
   * equipos que lleva dentro. */
  total?: number | null;
  /** Si esa cifra se enseña también EN el chip. En la fila del inventario se
   *  calla cuando el equipo tiene precio propio —dos cifras en la misma fila y
   *  quien la lea rápido se lleva la que no era—, pero dentro del pop-up no hay
   *  con qué confundirla, así que ahí se dice siempre. */
  enChip?: boolean;
  moneda?: string | null;
  titulo: string;
}) {
  const [miembros, setMiembros] = useState<MiembroGrupo[] | null>(null);
  const [recorte, setRecorte] = useState(false);

  const esKit = que === "kit";
  const sumaKit = (miembros || []).reduce((a, m) => a + (Number(m.valor) || 0), 0);
  /* Cuántos de los que hay dentro NO tienen precio propio. Un total que va
     corto y no lo dice es peor que no dar total. */
  const sinPrecio = (miembros || []).filter(m => !(Number(m.valor) > 0)).length;
  const cifra = esKit ? sumaKit : Number(totalBoleta) || 0;

  return (
    <ChipPop
      titulo={titulo}
      clase={`${esKit ? "chip-kit" : "chip-combo"}${porAnfitrion ? " chip-gr-prestado" : ""}`}
      etiqueta={
        <>
          {esKit ? "📦" : "🧾"} <span className="chip-gr-n">{rotulo ?? nombre}</span>
          {/* La ↖ va DESPUÉS del nombre y no antes: delante empujaba el emoji y
              el nombre, y en una línea de cinco chips lo que se lee de un
              barrido es dónde empieza cada uno. Con `aria-hidden` porque no es
              información: lo que dice de verdad está en el `title`, que es lo
              que lee un lector de pantalla. */}
          {porAnfitrion && <span className="chip-gr-marca" aria-hidden="true">↖</span>}
          {!esKit && enChip && cifra > 0 && (
            <span style={{ opacity: .75, fontWeight: 400 }}> · {soles(cifra, moneda || undefined)}</span>
          )}
        </>
      }
      cargar={async () => {
        const r = await contenidoDeGrupo(que, id);
        if ("error" in r && r.error) return r.error;
        setMiembros(("miembros" in r && r.miembros) || []);
        setRecorte(("recorte" in r && !!r.recorte) || false);
        return null;
      }}
      cabecera={
        <>
          {/* `chip-gr-h` acota el nombre: «Bolso Kit de Grabación Profesional
              para Exteriores» en versalitas partía la cabecera en tres
              renglones y se comía el alto de la lista. */}
          <span className="chip-gr-h">{esKit ? "📦" : "🧾"} {nombre}</span>
          {miembros && (
            <span style={{ color: "var(--dim)", fontWeight: 400, flex: "none" }}>
              · {miembros.length}{recorte ? "+" : ""} equipo{miembros.length === 1 ? "" : "s"}
            </span>
          )}
          {cifra > 0 && (
            <span className={`ens-pop-tot${esKit && sinPrecio ? " esti" : ""}`}
              title={esKit
                ? (sinPrecio
                  ? `Suma de los que tienen precio propio. ${sinPrecio} no lo tiene${sinPrecio === 1 ? "" : "n"}, así que el total va corto.`
                  : "Suma de lo que cuesta cada equipo del kit.")
                : "Lo que costó esta compra, según su boleta. No es la suma de los precios propios de las unidades: a las que vienen en un combo justamente no se les pone precio propio."}>
              {esKit && sinPrecio ? "≥ " : ""}{soles(cifra, esKit ? undefined : (moneda || undefined))}
            </span>
          )}
        </>
      }>
      {/* Vacío ≠ error, y se dice distinto. Un kit al que le quitaron todo, o
          una boleta cuyas unidades se dieron de baja, existen. */}
      {miembros && !miembros.length && (
        <span className="ens-pop-aviso">
          {esKit ? "Este kit no tiene ningún equipo dentro." : "Esta boleta no tiene ninguna unidad registrada."}
        </span>
      )}
      {(miembros || []).map(m => (
        <FilaPop key={m.id} id={m.id} folio={m.folio} nombre={m.nombre} cartel={m.cartel}
          /* Dentro de un kit o de una boleta, «disponible» es lo normal: lo que
             hace falta ver es el que está roto, prestado o no aparece. */
          estado={m.estado && m.estado !== "disponible" ? m.estado : null}
          quien={m.quien}
          /* El precio propio va SIEMPRE en soles: es `equipamiento.valor_compra`,
             que no tiene moneda. La del combo es de la boleta, no de la unidad. */
          precio={Number(m.valor) > 0 ? { valor: Number(m.valor) } : null}
          sinPrecio={esKit
            ? "Sin precio propio: no suma al total de arriba."
            : "Sin precio propio: su parte va dentro del total de la boleta."} />
      ))}
    </ChipPop>
  );
}
