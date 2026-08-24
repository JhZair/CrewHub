import Link from "next/link";
import type { ComponentProps } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   EL ENLACE DE LA CASA — un `<Link>` que NO precarga

   ── EL HALLAZGO, QUE ES LO QUE JUSTIFICA ESTO ──
   Next precarga todo `<Link>` que entra en pantalla. Suena a regalo, y en esta
   aplicación no lo es: **la precarga no trae nada aprovechable.**

   Está en el código de Next 14 (`walk-tree-with-flight-router-state.js:45`):

     «If there's no `loading` component anywhere in the tree being rendered,
      the prefetch will be short-circuited to avoid requesting a potentially
      very expensive subtree.»

   Aquí NO hay ningún `loading.tsx` —y no debe haberlo, ver app/globals.css—,
   así que toda precarga se cortocircuita y devuelve solo estado de router: ni
   una fila, ni un byte de la página. Al pulsar, la página se pide entera igual.

   O sea: cada `<Link>` visible cuesta **una invocación de función** y ahorra
   **cero**. Medido al abrir /personas: veinticuatro precargas de fichas de
   persona, más las del menú y los chips, para que se pulse una.

   ── POR QUÉ UN COMPONENTE Y NO `prefetch={false}` EN CADA SITIO ──
   Son 303 enlaces en 81 archivos. Ponerlo a mano es 303 sitios donde acordarse
   —y el que se olvide no da error, solo vuelve a costar—. Aquí es un valor por
   defecto: quien escriba un enlace nuevo hereda la decisión sin saber que
   existe, que es como tiene que ser una decisión de este tipo.

   ── SE PUEDE PEDIR LO CONTRARIO ──
   `<Enlace prefetch>` sigue funcionando. No hay hoy ningún caso que lo
   justifique; lo habrá el día que alguna ruta deje de ser dinámica o tenga su
   propia frontera de carga, y entonces la precarga sí traerá algo.

   ⚠ Este archivo NO lleva `"use client"`. La mayoría de las páginas que lo usan
   son de servidor, y marcarlo convertiría cada una en una frontera de cliente.
   Envolver un componente de cliente desde uno de servidor es solo JSX.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Enlace({ prefetch = false, ...resto }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...resto} />;
}
