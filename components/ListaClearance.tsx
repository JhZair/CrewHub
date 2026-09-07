"use client";
import { useMemo, useRef, useState } from "react";
import Link from "@/components/Enlace";
import Plegable from "@/components/Plegable";
import { coincide, normalizar } from "@/lib/texto";

/* ══════════════════════════════════════════════════════════════════════════
   LA LISTA DE PELÍCULAS DEL CLEARANCE, CON SU BUSCADOR

   ── POR QUÉ HACÍA FALTA ──
   Hay 86 películas sin ningún permiso registrado. Plegarlas quitó el ruido de
   la lista principal, pero el plegable de abajo es ahora un muro de 86 líneas:
   encontrar «En busca del oro» ahí es bajar y leer una por una, que es
   exactamente lo que no se hace. Esconder algo detrás de un clic no lo hace
   encontrable; solo lo hace invisible.

   El Ctrl+K que ya existe no sirve aquí: manda a /buscar, que busca en todo el
   sistema y devuelve la ficha del proyecto, no su clearance. Esto es otra cosa
   —filtrar la lista que ya tienes delante— y por eso vive aquí y no allí.

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

export default function ListaClearance({
  filas, vacias, inicial, ocultas = 0,
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
    <Link key={f.id} href={`/clearance/${f.id}`} className="clx">
      <div className="clx-t">
        <span className="clx-n">{f.nombre}</span>
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
          placeholder={`Busca entre las ${todas.length} películas por nombre…`}
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
                  <b> nombre</b>, no por quién firma ni por lo que falta.
                  {/* ⚠ Y decir que hay más fuera. Sin esto, buscar una película
                      terminada respondía «ninguna se llama así» —que es falso—
                      y encima mandaba a dudar del nombre. */}
                  {ocultas > 0 && (
                    <> Quedan <b>{ocultas}</b> terminada{ocultas === 1 ? "" : "s"} fuera
                      de esta lista:{" "}
                      <a href={`/clearance?todas=1&q=${encodeURIComponent(q.trim())}`}
                        className="gx-filtro">buscar también entre ellas →</a></>
                  )}</>
              : <>{encontradas.length} de {todas.length}
                  {encontradas.some(f => f.sinDatos) && (
                    <> · incluye las que nadie ha empezado</>
                  )}</>}
          </div>
          {encontradas.map(fila)}
        </>
      ) : (
        <>
          {filas.map(fila)}
          {vacias.length > 0 && (
            <Plegable
              id="clearance:vacias"
              /* Cerrado: son las que no tienen nada que atender HOY. Pero el
                 número está en el título, así que no desaparecen de la cabeza —
                 y la caja de arriba las alcanza sin abrirlo. */
              abiertoPorDefecto={false}
              titulo={
                <span style={{ fontWeight: 600 }}>
                  {vacias.length} película{vacias.length === 1 ? "" : "s"} sin ningún permiso registrado
                </span>
              }
              resumen={<span style={{ fontSize: 11.5, color: "var(--dim)" }}>
                no es «todo en regla»: es que nadie ha empezado
              </span>}>
              {vacias.map(fila)}
            </Plegable>
          )}
        </>
      )}
    </>
  );
}
