"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { fijarApoyoFondo } from "@/app/actions";

/* ── QUIÉN AYUDA CON LOS PAPELES DE ESTE FONDO ──
 *
 * Katy lleva la administración y necesita que Wilfredo cargue los 58
 * comprobantes. Nombrarlo aquí le da UNA cosa: colgar el PDF de los recibos de
 * este fondo. Ni montos, ni etapas, ni otros fondos, ni la caja.
 *
 * Se enseña el alcance en la propia pantalla y no en un manual: un permiso que
 * hay que ir a leer a otro sitio es un permiso que se concede a ciegas.
 *
 * La lista la ve todo el equipo —saber quién está ayudando es coordinación—,
 * pero solo administración nombra y quita. La base lo vuelve a exigir con su
 * política; esto es la puerta, no el candado (db/apoyo-rendicion.sql).
 */
export default function ApoyosFondo({ postulacionId, apoyos, equipo, esAdmin }: {
  postulacionId: string;
  apoyos: string[];
  equipo: { id: string; nombre?: string | null; avatar_url?: string | null; color?: string | null }[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [quien, setQuien] = useState("");
  const [err, setErr] = useState("");
  const [ocupado, correr] = useTransition();

  const puestos = equipo.filter(p => apoyos.includes(p.id));
  const libres = equipo.filter(p => !apoyos.includes(p.id));
  /* ── LOS QUE YA NO ESTÁN EN EL CATÁLOGO ──
     `equipo` son las cuentas ACTIVAS. Un apoyo cuya cuenta se desactiva
     desaparecía del bloque —y con él su ✕—, pero su fila seguía viva en la
     base y el permiso con ella: un permiso que no se ve no se puede quitar.
     Se pintan igual, dichos por lo que son, para poder retirarlos. */
  const fantasmas = apoyos.filter(id => !equipo.some(p => p.id === id));

  const mover = (usuarioId: string, sumar: boolean) => {
    setErr("");
    correr(async () => {
      const r: any = await fijarApoyoFondo(postulacionId, usuarioId, sumar);
      if (r?.error) setErr(r.error);
      else { setQuien(""); router.refresh(); }
    });
  };

  if (!esAdmin && !puestos.length && !fantasmas.length) return null;

  return (
    <div className="apoyos-fondo">
      <span className="apoyos-tit" title="Pueden adjuntar el comprobante de cualquier recibo de este fondo. Nada más.">
        🤝 Apoyo de rendición
      </span>
      {puestos.map(p => (
        <span key={p.id} className="apoyos-chip">
          <Avatar size={18} nombre={p.nombre} src={p.avatar_url} color={p.color} />
          <span>{p.nombre || "—"}</span>
          {esAdmin && (
            <button className="dato-btn" disabled={ocupado}
              title="Quitarle el apoyo en este fondo"
              onClick={() => mover(p.id, false)}>✕</button>
          )}
        </span>
      ))}
      {fantasmas.map(id => (
        <span key={id} className="apoyos-chip" title="Su cuenta ya no está activa, pero el permiso sigue puesto">
          <span style={{ color: "var(--yellow)" }}>⚠ cuenta desactivada</span>
          {esAdmin && (
            <button className="dato-btn" disabled={ocupado}
              title="Quitarle el apoyo en este fondo"
              onClick={() => mover(id, false)}>✕</button>
          )}
        </span>
      ))}
      {!puestos.length && !fantasmas.length && (
        <span style={{ color: "var(--dim)", fontSize: 12 }}>nadie por ahora</span>
      )}
      {esAdmin && (
        <>
          <select value={quien} disabled={ocupado} className="cmp-lote-sel"
            onChange={e => { const v = e.target.value; setQuien(v); if (v) mover(v, true); }}>
            <option value="">＋ Sumar a alguien…</option>
            {libres.map(p => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
          </select>
          <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
            Solo podrá adjuntar comprobantes de este fondo.
          </span>
        </>
      )}
      {err && <span className="err-inline" style={{ marginLeft: 6 }}>⚠ {err}</span>}
    </div>
  );
}
