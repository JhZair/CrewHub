"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fijarSubcategoria } from "@/app/actions";
import { SUBCATS_EQUIPO } from "@/lib/entidades";

/* ── LA SUBCATEGORÍA QUE FALTA, PUESTA DESDE LA LISTA ──
 *
 * Cincuenta y ocho equipos sin subcategoría. Con lo que había, arreglar uno
 * era: entrar a la ficha, Editar, buscar el campo entre doce, elegir, guardar,
 * volver — y volver deja la lista arriba del todo, así que hay que buscar
 * dónde se estaba. Seis pasos por equipo. Nadie hace eso cincuenta y ocho
 * veces, y por eso el campo lleva meses vacío: el problema no era que a nadie
 * le importara, era el coste.
 *
 * Aquí son dos clics y la fila se queda donde está.
 *
 * ── POR QUÉ SOLO LAS DEL CATÁLOGO ──
 * Las opciones son las de SU categoría y nada más. Un campo libre en una lista
 * rápida es la receta de «Panel LED», «panel led» y «Panel de luz LED»
 * conviviendo, y con eso filtrar por subcategoría deja de servir — que es lo
 * único para lo que existe el campo. Para una que no esté en la lista está la
 * ficha, que es donde uno se toma el tiempo de decidir si de verdad hace falta
 * una categoría nueva.
 *
 * ── POR QUÉ NO SE VE COMO UN BOTÓN CUALQUIERA ──
 * Va en el hueco donde estaría la subcategoría, con el borde punteado de lo
 * que falta. No es una acción que se ofrece: es un dato ausente que se puede
 * rellenar ahí mismo, y eso se lee mejor en el sitio del dato que en una
 * columna de botones.
 */
export default function PonerSubcategoria({ equipoId, categoria }: {
  equipoId: string;
  /** La categoría del equipo: decide qué opciones se ofrecen. */
  categoria: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const opciones = SUBCATS_EQUIPO[String(categoria || "").trim().toLowerCase()] || [];
  /* Sin catálogo no hay nada que ofrecer, y un desplegable vacío es peor que
     no estar: promete una salida que no existe. */
  if (!opciones.length) return null;

  const poner = async (s: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await fijarSubcategoria(equipoId, s);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(false);
    router.refresh();
  };

  /* La fila entera es un enlace a la ficha. Sin frenar el evento, elegir una
     subcategoría navegaría a otra pantalla justo después de guardarla — y la
     lista, que es donde se está trabajando, se perdería en cada acierto. */
  const frena = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={frena}>
      <button type="button" className="eqx-ponsub" disabled={ocupado}
        title={`Sin subcategoría — elige una de ${categoria}`}
        onClick={e => { frena(e); setAbierto(!abierto); }}>
        {ocupado ? "…" : "＋ subcategoría"}
      </button>

      {error && (
        <span className="eqx-ponsub-err" title={error}>⚠</span>
      )}

      {abierto && (
        <>
          <span className="rx-fondo" onClick={e => { frena(e); setAbierto(false); }} />
          <span className="eqx-ponsub-pop">
            <span className="eqx-ponsub-h">{categoria}</span>
            {opciones.map(s => (
              <button key={s} type="button" disabled={ocupado}
                onClick={e => { frena(e); poner(s); }}>
                {s}
              </button>
            ))}
            {/* Se dice que hay otra salida en vez de dejar creer que el
                catálogo es todo lo que existe. */}
            <span className="eqx-ponsub-pie">
              ¿No está? Escríbela desde la ficha del equipo.
            </span>
          </span>
        </>
      )}
    </span>
  );
}
