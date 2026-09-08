"use client";
import Link from "@/components/Enlace";
import ChipPop from "@/components/ChipPop";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";

/* ══════════════════════════════════════════════════════════════════════════
   🔧 DENTRO DE QUÉ VA ESTA PIEZA

   «Ensamblado» contesta media pregunta. Dos cables idénticos, A-573 y A-574,
   los dos ensamblados: la lista decía que están montados en algo y no en QUÉ,
   y para averiguarlo había que abrir cada ficha —perdiendo el filtro— o irse al
   inventario a buscar cuál de los trescientos equipos los lleva dentro. Es la
   misma pregunta que ya contesta 🔩 desde el otro lado, y solo estaba resuelta
   en un sentido.

   ── EL NOMBRE VA EN EL CHIP, NO SOLO EN EL POP-UP ──
   Lo que se necesita casi siempre es el folio y el nombre, y eso cabe. El
   pop-up es para lo demás: la foto —que es como se reconoce un equipo en un
   estante— y quién lo tiene. Porque si el anfitrión está en un rodaje en Puno,
   la pieza también, aunque su propia fila diga «ensamblado».
   El estado del anfitrión solo se pinta cuando NO es «disponible», como en el
   chip de piezas: repetir «disponible» en la única fila del pop-up es gastar
   sitio en decir que no pasa nada.

   ⚠ El anfitrión viaja CON la fila: es una sola cosa, no una lista, y la página
   ya trae el inventario en la misma tanda. Pedirlo al pulsar sería una espera de
   red para enseñar cuatro campos que ya estaban aquí. (El kit y el combo sí se
   piden, y por lo contrario: se repiten en cada fila. Está en `ChipPop`.)

   ── Y SI DICE «ENSAMBLADO» PERO NO HAY ANFITRIÓN ──
   Se dice, y se distingue de qué se trata, porque cada caso se arregla en un
   sitio distinto. Un estado que afirma algo que la base no sostiene es lo que
   hace que un equipo desaparezca de los dos sitios a la vez: no está disponible
   porque dice que está montado, y no está dentro de nada porque no señala a
   nadie. El único momento en que alguien puede verlo es este, así que callarlo
   lo deja perdido para siempre.
   ══════════════════════════════════════════════════════════════════════════ */

export type Anfitrion = {
  id: string; folio?: string | null; nombre: string;
  estado?: string | null; cartel?: string | null; quien?: string | null;
};

export default function ChipAnfitrion({ anfitrion, apunta, cortado }: {
  /** Dentro de qué va, ya resuelto. `null` = no se pudo. */
  anfitrion: Anfitrion | null;
  /** Si la fila SEÑALA a alguien (`ensamblado_en`). Sin anfitrión distingue dos
   *  situaciones que se arreglan en sitios distintos, y confundirlas manda a
   *  buscar donde no es. */
  apunta: boolean;
  /** Si la lista de equipos llegó al tope de la API. Es lo único que puede
   *  hacer que una fila señale a alguien que no aparece: la clave ajena es
   *  `on delete set null`, así que borrar el anfitrión deja esta fila SIN
   *  señalar. Sin este dato, el chip acusaría a la base de un puntero roto que
   *  el esquema no permite. */
  cortado: boolean;
}) {
  if (!anfitrion) {
    /* ⚠ También un `ChipPop`, y no un `<span>` con `title`. Un span dentro de
       la fila —que es un enlace— se pulsa y NAVEGA, perdiendo el filtro; y en
       táctil no hay `title`, así que la explicación de la avería era
       inalcanzable justo en el dispositivo donde se hace inventario. */
    const señalaAFantasma = apunta;
    return (
      <ChipPop
        clase="chip-huerfano"
        titulo={señalaAFantasma
          ? "Señala a un equipo que no aparece en esta lista"
          : "Dice que va montado dentro de algo, y no dice dentro de qué"}
        etiqueta={<>🔧 ⚠ {señalaAFantasma ? "no encuentro dónde" : "no dice dentro de qué"}</>}
        cabecera={<span className="chip-gr-h">🔧 Va montado, pero…</span>}>
        <span className="ens-pop-aviso">
          {señalaAFantasma ? (
            cortado ? <>
              Señala a un equipo que <b>no está en esta lista</b>, y la lista
              llegó al tope: faltan filas. No es que el equipo no exista — es que
              no llegó. Filtra o busca para traer menos y vuelve a mirar.
            </> : <>
              Señala a un equipo que no aparece en el inventario. No debería
              poder pasar: al borrar un equipo, sus piezas dejan de señalarlo
              solas. Si lo ves, es para mirar la base.
            </>
          ) : <>
            Su estado dice que va montado dentro de algo, pero <b>no dice dentro
            de qué</b>. Así no sale ni como disponible ni dentro de ningún
            ensamblado: desaparece de los dos sitios a la vez. Se arregla
            montándolo desde la ficha del equipo que lo lleva, o sacándolo de
            «ensamblado» desde la suya.
          </>}
        </span>
      </ChipPop>
    );
  }

  const a = anfitrion;
  return (
    <ChipPop
      clase="chip-anfitrion"
      titulo={`Va montado dentro de ${a.folio ? a.folio + " " : ""}${a.nombre}`}
      etiqueta={
        <>
          🔧 en {a.folio && <b style={{ fontWeight: 700 }}>{a.folio}</b>}
          {" "}<span className="chip-gr-n">{a.nombre}</span>
        </>
      }
      cabecera={<span className="chip-gr-h">🔧 Va montado dentro de</span>}>
      <Link href={`/entidad/equipamiento/${a.id}`} className="ens-pop-fila">
        <span className="kit-pz-img">
          {a.cartel
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={a.cartel} alt="" referrerPolicy="no-referrer" />
            : <span>🎥</span>}
        </span>
        {a.folio && <span className="kit-pz-folio">{a.folio}</span>}
        <span className="ens-pop-n ens-pop-n-dos">
          <span className="chip-gr-nom">{a.nombre}</span>
          {/* ⚠ Quién tiene el ANFITRIÓN, que es quien tiene esta pieza. La fila
              de la pieza dice «ensamblado» y ahí se acaba: no dice que además
              está en Puno. */}
          {a.quien && <span className="chip-gr-quien">lo tiene {a.quien}</span>}
        </span>
        {a.estado && a.estado !== "disponible" && (
          <span style={{ fontSize: 10, color: colorEstadoEq(a.estado), whiteSpace: "nowrap" }}>
            {txtEstadoEq(a.estado)}
          </span>
        )}
      </Link>
    </ChipPop>
  );
}
