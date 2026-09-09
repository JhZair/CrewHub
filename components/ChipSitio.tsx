"use client";
import { useRouter } from "next/navigation";
import { codigoDeRuta, textoDeRuta, type Guardado } from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA, EN LA FILA DEL INVENTARIO

   El inventario contestaba cuatro preguntas por fila —qué lleva dentro, dentro
   de qué va, con qué sale, con qué entró— y no la quinta, que es la que se hace
   de pie delante del armario: DÓNDE ESTÁ. Se sabía desde que existen los
   sitios; simplemente no se pintaba, así que buscar «gimbal» daba nueve
   resultados y ninguno decía a qué cajón ir.

   ── LO QUE DICE EL CHIP Y LO QUE DICE SU ETIQUETA ──
   En el chip, el CÓDIGO: «OF01-M01-C09» es lo que está escrito en la pegatina
   del cajón, así que es lo que se compara con el mueble delante. En la etiqueta
   emergente, la cadena en palabras —«Oficina Principal › Mueble 01 › Cajón
   09»—, que es lo que se lee cuando el código todavía no se conoce de memoria.
   Sin clave no hay código: entonces manda el nombre del sitio más hondo, que es
   lo único cierto que queda.

   ── EL BOLSO SE MARCA, NO SE ESCONDE ──
   Una cámara que está en el Bolso Tenba, y el Bolso Tenba en el Cajón 08, se
   guarda «en el Cajón 08» — pero abrir el cajón y no verla es exactamente el
   momento en que uno cree que falta. El 🎒 avisa de que hay una capa más; la
   etiqueta dice cuál.

   ── Y LLEVA A ALGUNA PARTE ──
   El chip abre la pestaña Sitios buscando ese código. Es la vuelta entera:
   desde una cosa, ver su cajón; y desde el cajón, todo lo demás que hay dentro
   — que es la pregunta siguiente el 90% de las veces.

   ⚠ UN `<button>` QUE NAVEGA, Y NO UN `<Link>`. La fila entera del inventario
   YA es un `<a>` a la ficha del equipo, y un ancla dentro de otra es HTML
   inválido: el parseador del navegador saca la de dentro fuera, el árbol que
   monta deja de parecerse al que mandó el servidor y React revienta con
   «Hydration failed… Expected server HTML to contain a matching <div> in <a>».
   No es un detalle de estilo — la pantalla no carga.
   Un botón sí puede vivir ahí (es lo que ya hacen `ChipPiezas`, `ChipGrupo` y
   `ChipAnfitrion` con su `ChipPop`), y con `preventDefault` + `stopPropagation`
   el clic no dispara además el enlace de la fila, que llevaría a la ficha en
   vez de al cajón. El porqué de esos dos, en `components/ChipPop`.
   ══════════════════════════════════════════════════════════════════════════ */

export default function ChipSitio({ guardado }: { guardado: Guardado }) {
  const router = useRouter();
  const { ruta, origen, bucle, roto } = guardado;

  /* ⚠ Roto y en bucle se DICEN, y en rojo. Callarlos deja la fila idéntica a la
     de un equipo al que nadie le ha puesto sitio —«no lo hemos anotado»— cuando
     lo que pasa es que el dato que hay apunta a algo que no está. Son dos
     problemas con dos arreglos distintos y la misma cara. */
  if (bucle || roto) {
    return (
      <span className="badge chip-sit-mal"
        title={bucle
          ? "La cadena de dónde se guarda da vueltas sobre sí misma, así que no se puede saber dónde está. Se arregla en la ficha, cambiando uno de los pasos."
          : "Apunta a un sitio o a un bolso que ya no está en la lista. Puede ser un borrado a medias, o que la lista se cortó por el tope de la API."}>
        📍 ⚠ no se sabe
      </span>
    );
  }

  const sitios = ruta.filter(t => t.tipo === "sitio");
  /* Sin sitio no se pinta nada. El hueco no es un olvido de esta fila: es un
     dato que falta en cuatrocientas, y ya se cuenta arriba en la pestaña
     Sitios. Un «— sin sitio —» repetido quinientas veces es ruido con coste. */
  if (!sitios.length) return null;

  const cod = codigoDeRuta(ruta);
  const hondo = sitios[sitios.length - 1];
  const bolso = ruta.filter(t => t.tipo === "equipo").slice(-1)[0] || null;

  const deQuien = origen === "ensamblado"
    ? " Lo hereda del equipo en el que va montado."
    : origen === "contenedor" ? "" : "";

  return (
    <button type="button" className="badge chip-sit-eq"
      onClick={e => {
        e.preventDefault(); e.stopPropagation();
        router.push(`/equipamiento/sitios?q=${encodeURIComponent(cod || hondo.nombre)}`);
      }}
      title={`Se guarda en ${textoDeRuta(ruta)}.${deQuien}`
        + (bolso ? ` Está dentro de «${bolso.nombre}», que es lo que hay que sacar del cajón.` : "")
        + " Abre la pestaña Sitios ahí."}>
      📍 {cod || hondo.nombre}{bolso ? " 🎒" : ""}
    </button>
  );
}
