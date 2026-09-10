"use client";
import { memo } from "react";
import type { EquipoParaPanel } from "@/lib/equipamientoDatos";
import ChipFotos from "@/components/ChipFotos";
import ChipPiezas, { type PiezaMontada } from "@/components/ChipPiezas";
import ChipGrupo from "@/components/ChipGrupo";
import ChipAnfitrion from "@/components/ChipAnfitrion";

/* ── LOS CHIPS DE UNA FILA, LOS MISMOS EN TODAS LAS PANTALLAS ──
   El orden es el de /equipamiento y es el que se lee: de lo más cercano a lo
   más lejano — la foto es esta unidad; las piezas, lo que lleva dentro; el
   anfitrión, dentro de qué va ella; el kit, con qué sale; el combo, con qué
   entró.

   ⚠ ESTABA DENTRO DE `PanelKits`, y por eso la vista por sitio nació sin
   chips: abrir un cajón enseñaba el nombre de la cámara y nada más —ni que
   lleva cuatro piezas montadas, ni que sale en dos kits—, que es justo lo que
   se quiere saber con el cajón abierto delante. Copiarlos allí habría sido la
   tercera copia (`app/equipamiento/page.tsx` tiene la suya, en servidor), y la
   tercera copia es la que se queda atrás cuando entra un chip nuevo.

   ⚠ `memo`, y no por elegancia: el escogedor de kits pinta el inventario
   ENTERO —hasta mil filas— y cada tecla del buscador reconcilia la lista
   completa. Sin esto, cada pulsación repasaría hasta cinco chips por fila, y
   `ChipPiezas`, `ChipGrupo` y `ChipAnfitrion` son un `ChipPop` con ocho hooks
   cada uno. Las props son estables —`e` viene del servidor y `cortado` es un
   booleano—, así que el memo acierta siempre salvo cuando la fila cambia de
   verdad. */
/** Qué chips puede llevar una fila. El orden de este tipo NO manda: manda el
 *  del JSX de abajo, que es el de /equipamiento. */
export type QueChip = "fotos" | "piezas" | "anfitrion" | "kits" | "combo";

/** Todos, que es lo que quiere casi cualquier lista. Constante de módulo y no
 *  un literal en el valor por defecto: `muestra = ["fotos", …]` crearía un
 *  array NUEVO en cada render y le rompería el `memo` a todas las llamadas que
 *  no pasan la prop — es decir, al inventario entero. */
const TODOS: readonly QueChip[] = ["fotos", "piezas", "anfitrion", "kits", "combo"];

const ChipsEquipo = memo(function ChipsEquipo({ e, cortado, muestra = TODOS }: {
  e: EquipoParaPanel;
  /** Si el inventario llegó al tope de la API. Viaja hasta el chip 🔧 para que
   *  no acuse a la base de un puntero roto cuando lo que faltó fue una fila. */
  cortado?: boolean;
  /** Qué chips pintar. Para las listas donde alguno sobra por el contexto —en
   *  la columna «en el kit» de un editor de kits, el chip «sale en el kit X»
   *  repite el título de la columna—.
   *  ⚠ Pásalo SIEMPRE como constante de módulo, nunca como literal en el JSX:
   *  un array recién creado hace fallar el `memo` en cada tecla del buscador,
   *  que es justo lo que ese memo existe para evitar. */
  muestra?: readonly QueChip[];
}) {
  const esPieza = !!e.apunta || e.estado === "ensamblado";
  const q = (k: QueChip) => muestra.includes(k);
  /* ⚠ `e.combo` y no `e.compra_id`: la condición tiene que ser LA MISMA que la
     del chip que se pinta abajo. Con `compra_id`, una unidad cuya compra no
     vino en el lote de combos abría un `.chips-linea` sin un solo hijo.
     ⚠ Y cada término mira su `q(...)`: sin eso, una fila que solo tiene fotos
     y kits abría el `.chips-linea` —con su margen y su renglón— en una lista
     que pidió únicamente 🔧 piezas, y salía un hueco donde no hay nada. */
  const hay = (q("fotos") && e.nFotos)
    || (q("piezas") && e.piezas?.length)
    || (q("anfitrion") && esPieza)
    || (q("kits") && e.kits?.length)
    || (q("combo") && e.combo);
  if (!hay) return null;
  return (
    <span className="chips-linea">
      {q("fotos") && <ChipFotos tipo="equipamiento" id={e.id} n={e.nFotos || 0} />}
      {q("piezas") && <ChipPiezas piezas={(e.piezas || []) as PiezaMontada[]} />}
      {q("anfitrion") && esPieza && (
        <ChipAnfitrion anfitrion={e.anfitrion || null} apunta={!!e.apunta} cortado={!!cortado} />
      )}
      {q("kits") && (e.kits || []).map(k => (
        <ChipGrupo key={k.id} que="kit" id={k.id} nombre={k.nombre}
          titulo={`Sale en el kit «${k.nombre}» — ver qué más va dentro`} />
      ))}
      {q("combo") && e.compra_id && e.combo && (
        /* ⚠ `enChip` se calla cuando la unidad TIENE precio propio, igual que en
           /equipamiento: si no, un combo de ocho unidades pinta ocho veces la
           misma cifra de la boleta al lado de ocho precios distintos, y no hay
           forma de saber cuál de las dos es de esta pieza. El total va crudo al
           pop-up de todos modos: lo que se calla es el chip, no el dato. */
        <ChipGrupo que="combo" id={e.compra_id} nombre={e.combo.codigo || e.combo.nombre}
          total={e.combo.total ?? 0} moneda={e.combo.moneda}
          enChip={!(Number(e.valor_compra) > 0) && Number(e.combo.total) > 0}
          titulo={`Vino en ${e.combo.codigo || ""} ${e.combo.nombre}`.trim() + " — ver qué más trajo"} />
      )}
    </span>
  );
});

export default ChipsEquipo;
