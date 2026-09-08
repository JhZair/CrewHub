"use client";
import { useMemo, useRef, useState } from "react";
import Link from "@/components/Enlace";
import Plegable from "@/components/Plegable";
import { coincide, normalizar } from "@/lib/texto";

/* ══════════════════════════════════════════════════════════════════════════
   UNA LISTA DE PELÍCULAS CON SU BUSCADOR — para ⚖ clearance y para ✍ guion

   ── POR QUÉ ES UNO SOLO Y NO DOS ──
   Nació para ⚖ clearance y ✍ guion tenía el mismo problema y la misma forma:
   una línea por película, un diagnóstico por fila, y un muro de las que nadie
   ha empezado al final. Copiarlo habría sido dos buscadores que se separan a la
   primera —uno aprende a buscar sin tildes y el otro no— y ya hemos pagado eso
   con `normalizar`, con la paleta de estados y con el orden de los cargos.
   Lo que cambia entre las dos pantallas son PALABRAS, y las palabras entran por
   `rotulos`. Lo que no cambia es el comportamiento.

   ── EL PROBLEMA QUE RESUELVE ──
   Hay 86 películas sin ningún permiso registrado. Plegarlas quitó el ruido de
   la lista principal, pero el plegable de abajo es ahora un muro de 86 líneas:
   encontrar «En busca del oro» ahí es bajar y leer una por una, que es
   exactamente lo que no se hace. Esconder algo detrás de un clic no lo hace
   encontrable; solo lo hace invisible.

   El Ctrl+K que ya existe no sirve aquí: manda a /buscar, que busca en todo el
   sistema y devuelve la ficha del proyecto, no lo que esta pantalla mira. Esto
   es otra cosa —filtrar la lista que ya tienes delante— y por eso vive aquí.

   ── FILTRA EN EL NAVEGADOR, SIN VIAJES ──
   Las películas ya vinieron todas en la carga: filtrarlas es recorrer un array
   de 90 elementos. Mandarlo al servidor sería esperar por algo que ya está en
   memoria.

   ── CON FILTRO, LA LISTA SE APLANA ──
   ⚠ Y es lo importante. Si al escribir se respetara la separación
   «con datos / plegadas», buscar «oro» dejaría el resultado ESCONDIDO dentro
   del plegable cerrado, y la pantalla diría «no hay nada» teniéndolo. Cuando
   hay filtro no hay grupos: hay coincidencias.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaVista = {
  id: string;
  nombre: string;
  /** Un emoji delante del nombre, si la pantalla lo usa. ✍ guion pinta 🫂 o 🎭
   *  para decir si la película termina en el secuenciado o en el guion — que
   *  es lo que decide su veredicto, así que tiene que verse en TODAS las
   *  filas, también en las que no tienen falta.
   *  ⚠ Estuvo un rato metido dentro de `bloqueos[0].ico`, y eso lo escondía en
   *  las películas al día y lo dejaba leyéndose «🎭 se quedó en sinopsis». */
  ico?: string;
  /** Todo por lo que se puede buscar, ya junto y en minúsculas sin tildes: el
   *  nombre corto Y el largo. Se busca «mujeres» y la fila se llama
   *  «MUJERESANDE»; se busca «Mujeres del Ande» y también. */
  busca: string;
  /** El nombre largo, para enseñarlo cuando la coincidencia está SOLO ahí.
   *  Buscar «Yaurisque» devolvía una fila que ponía «MUJERESANDE» y nada más:
   *  visualmente un falso positivo, y el filtro deja de parecer de fiar. */
  nombreLargo: string;
  color: string;
  veredicto: string;
  resumen: string;
  sinDatos: boolean;
  /** ⚠ Cadenas ya resueltas en el servidor. Ni funciones ni Maps cruzan aquí:
   *  un closure a un componente cliente revienta en runtime y tsc no lo ve. */
  bloqueos: { id: string; ico: string; txt: string; color: string }[];
  masBloqueos: number;
};

/** Las palabras que cambian de una pantalla a otra. Cadenas, no funciones: un
 *  closure aquí revienta en runtime y tsc no lo ve. */
export type RotulosLista = {
  /** A dónde lleva cada fila: `/clearance`, `/guion/pelicula`. */
  base: string;
  /** La URL de ESTA lista: `/clearance`, `/guion`.
   *  ⚠ Separado de `base`, y no por gusto. En ⚖ clearance coinciden —la ficha
   *  es `/clearance/[id]`— y estuvieron unidos hasta que ✍ guion los separó:
   *  allí el `[id]` de `/guion/[id]` ya está cogido por un TRATAMIENTO, así
   *  que la ficha por película vive en `/guion/pelicula/[id]`. Con un solo
   *  campo, el enlace «buscar también entre las terminadas» apuntaba a
   *  `/guion/pelicula?todas=1`, que no es ninguna página. */
  indice: string;
  /** «películas por nombre…» del placeholder, y el «Ninguna de estas N». */
  queBusca: string;
  /** Lo que NO busca, dicho para que nadie lo intente: «no por quién firma». */
  noBusca: string;
  /** El título del plegable de las que nadie ha empezado, YA COMPUESTO con su
   *  número: el servidor conoce `vacias.length` antes de pintar nada.
   *  ⚠ Esto fue `(n: number) => string` durante diez minutos y compilaba. Una
   *  función no cruza a un componente cliente: revienta en runtime y tsc no lo
   *  ve. Si un rótulo necesita un número, se compone donde está el número. */
  vaciasTitulo: string;
  vaciasResumen: string;
  /** La coletilla del recuento cuando hay alguna vacía entre los resultados. */
  incluyeVacias: string;
};

export default function ListaPeliculas({
  filas, vacias, inicial, ocultas = 0, rotulos,
}: {
  /** Las que tienen algo registrado, ya ordenadas por urgencia. */
  filas: FilaVista[];
  /** Las que nadie ha empezado. */
  vacias: FilaVista[];
  /** Lo que traía la URL, para que la búsqueda sobreviva al Atrás. */
  inicial?: string;
  /** Cuántas películas terminadas quedan FUERA de esta lista. Sin este número,
   *  buscar una terminada decía «ninguna película se llama así» — que es
   *  mentira, y encima manda a dudar del nombre. */
  ocultas?: number;
  rotulos: RotulosLista;
}) {
  const [q, setQ] = useState(inicial || "");
  const caja = useRef<HTMLInputElement>(null);
  const hayFiltro = !!q.trim();

  const todas = useMemo(() => [...filas, ...vacias], [filas, vacias]);
  const encontradas = useMemo(
    () => (hayFiltro ? todas.filter(f => coincide(f.busca, q)) : []),
    [todas, q, hayFiltro],
  );

  /* ── LA BÚSQUEDA, EN LA URL ──
     ⚠ Sin esto: buscas «oro», entras en la película, pulsas Atrás, y la caja
     vuelve vacía con las noventa filas delante. Hay que teclear otra vez, cada
     vez. `replaceState` y no `router.replace` a propósito: esto no tiene que
     volver a pedir la página al servidor ni tocar el historial paso a paso —
     solo dejar la dirección lista para cuando se vuelva. */
  const recordar = (v: string) => {
    setQ(v);
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (v.trim()) u.searchParams.set("q", v); else u.searchParams.delete("q");
    window.history.replaceState(null, "", u.toString());
  };

  const fila = (f: FilaVista) => {
    /* El largo solo cuando aporta: si la coincidencia ya se ve en el nombre
       pintado, repetirlo es ruido. */
    const porElLargo = hayFiltro && !coincide(normalizar(f.nombre), q)
      && f.nombreLargo && f.nombreLargo !== f.nombre;
    return (
    <Link key={f.id} href={`${rotulos.base}/${f.id}`} className="clx">
      <div className="clx-t">
        <span className="clx-n">{f.ico ? `${f.ico} ` : ""}{f.nombre}</span>
        {porElLargo && <span className="clx-largo">{f.nombreLargo}</span>}
        <span className="clr-sem" style={{ color: f.color }}>{f.veredicto}</span>
        <span style={{ flex: 1 }} />
        <span className="clx-r">{f.resumen}</span>
      </div>
      {f.bloqueos.length > 0 && (
        <div className="clx-b">
          {f.bloqueos.map(b => (
            <span key={b.id} className="clx-m" style={{ color: b.color }}>
              {b.ico} {b.txt}
            </span>
          ))}
          {f.masBloqueos > 0 && (
            <span className="clx-m" style={{ color: "var(--dim)" }}>
              y {f.masBloqueos} más →
            </span>
          )}
        </div>
      )}
    </Link>
    );
  };

  /* ⚠ Sin películas no hay nada que filtrar, y una caja que dice «busca entre
     las 0» encima de «no hay ninguna película en marcha» se lee como un fallo.
     Con menos de diez tampoco: se ven todas de un vistazo y la caja es ruido. */
  if (todas.length < 10) return (
    <>
      {filas.map(fila)}
      {vacias.map(fila)}
    </>
  );

  return (
    <>
      <div className="clx-buscar" role="search">
        <span className="clx-lupa" aria-hidden="true">🔍</span>
        <input
          ref={caja}
          value={q}
          onChange={e => recordar(e.target.value)}
          /* ⚠ Sin `autoFocus`: esta caja está a media pantalla y el navegador
             saltaría hasta ella al cargar, moviendo lo que se estaba mirando.
             Escape la vacía, que es lo que se busca al equivocarse. */
          onKeyDown={e => { if (e.key === "Escape") { recordar(""); e.currentTarget.blur(); } }}
          placeholder={`Busca entre las ${todas.length} ${rotulos.queBusca} por nombre…`}
          aria-label="Buscar película por nombre"
          className="clx-input" />
        {!!q && (
          <button type="button" className="clx-x" onClick={() => { recordar(""); caja.current?.focus(); }}
            aria-label="Limpiar la búsqueda" title="Limpiar">✕</button>
        )}
      </div>

      {hayFiltro ? (
        <>
          {/* ⚠ El recuento SIEMPRE, también cuando es cero. «No hay ninguna
              película que se llame así» es una respuesta; una pantalla en
              blanco es un fallo aparente. */}
          <div className="clx-cuenta" aria-live="polite">
            {encontradas.length === 0
              ? <>Ninguna de estas {todas.length} se llama así. Esto busca por
                  <b> nombre</b>, {rotulos.noBusca}.
                  {/* ⚠ Y decir que hay más fuera. Sin esto, buscar una película
                      terminada respondía «ninguna se llama así» —que es falso—
                      y encima mandaba a dudar del nombre. */}
                  {ocultas > 0 && (
                    <> Quedan <b>{ocultas}</b> terminada{ocultas === 1 ? "" : "s"} fuera
                      de esta lista:{" "}
                      <a href={`${rotulos.indice}?todas=1&q=${encodeURIComponent(q.trim())}`}
                        className="gx-filtro">buscar también entre ellas →</a></>
                  )}</>
              : <>{encontradas.length} de {todas.length}
                  {encontradas.some(f => f.sinDatos) && (
                    <> · {rotulos.incluyeVacias}</>
                  )}</>}
          </div>
          {encontradas.map(fila)}
        </>
      ) : (
        <>
          {filas.map(fila)}
          {vacias.length > 0 && (
            <Plegable
              /* ⚠ Del ÍNDICE y con `replace`: la clave que recuerda si está
                 abierto ya existe guardada como «clearance:vacias». Con la
                 barra delante, o con `base`, sería otra clave y el plegable
                 amanecería cerrado el día que se publique esto. */
              id={`${rotulos.indice.replace(/^\//, "")}:vacias`}
              /* Cerrado: son las que no tienen nada que atender HOY. Pero el
                 número está en el título, así que no desaparecen de la cabeza —
                 y la caja de arriba las alcanza sin abrirlo. */
              abiertoPorDefecto={false}
              titulo={
                <span style={{ fontWeight: 600 }}>{rotulos.vaciasTitulo}</span>
              }
              resumen={<span style={{ fontSize: 11.5, color: "var(--dim)" }}>
                {rotulos.vaciasResumen}
              </span>}>
              {vacias.map(fila)}
            </Plegable>
          )}
        </>
      )}
    </>
  );
}
