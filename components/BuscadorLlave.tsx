"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { clavePhone } from "@/lib/llaves";

/* «Me llegó un código a 964 501 370 — ¿de quién es y qué abre?»
 *
 * Es la pregunta que hoy obliga a escarbar, y tiene dos mitades que se
 * responden con datos distintos: DE QUIÉN sale de `personas`, QUÉ ABRE sale de
 * las llaves registradas. Se muestran las dos aunque solo una tenga respuesta:
 * saber de quién es el número ya desbloquea (esa persona recibe el código),
 * aunque todavía no sepamos qué cuentas dependen de él.
 */
type Persona = { id: string; nombre: string; alias?: string | null; telefono?: string | null; email?: string | null; foto_url?: string | null };
type Uso = { id: string; plataforma: string; identificador?: string | null; dueno?: string };
type Llave = { k: string; valor: string; clase: string; dueno: { id: string; nombre: string } | null; usos: Uso[] };

export default function BuscadorLlave({ personas, llaves }: { personas: Persona[]; llaves: Llave[] }) {
  const [q, setQ] = useState("");
  const limpio = q.trim();

  const res = useMemo(() => {
    if (limpio.length < 3) return null;
    const k = clavePhone(limpio);
    const txt = limpio.toLowerCase();
    /* Si parece número se compara por los últimos 9 dígitos —así «964 501 370»,
       «+51964501370» y «964501370» son el mismo—; si no, por texto. */
    const quien = personas.filter(p =>
      (k && clavePhone(p.telefono) === k)
      || String(p.email || "").toLowerCase().includes(txt)
      || `${p.nombre} ${p.alias || ""}`.toLowerCase().includes(txt));
    const abre = llaves.filter(l =>
      (k && l.k === k) || String(l.valor || "").toLowerCase().includes(txt));
    return { quien, abre };
  }, [limpio, personas, llaves]);

  return (
    <div className="card">
      <div className="panel-h">🔎 ¿De quién es este número?</div>
      <input className="ent-lote-inp" style={{ width: "100%" }}
        placeholder="Pega el número tal como lo muestra Google: 964 501 370"
        value={q} onChange={e => setQ(e.target.value)} />

      {res && (
        <div style={{ marginTop: 10 }}>
          {res.quien.length === 0 && res.abre.length === 0 && (
            <div style={{ color: "var(--yellow)", fontSize: 12.5 }}>
              ⚠ No coincide con nadie de la base ni con ninguna llave registrada.
              Si es un número que usamos, falta la persona; si no lo es, alguien ajeno
              puede recuperar esa cuenta.
            </div>
          )}
          {res.quien.map(p => (
            <div className="info-row" key={p.id}>
              <Avatar nombre={p.nombre} src={p.foto_url} size={28} />
              <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 700 }}>{p.alias || p.nombre}</Link>
              <span style={{ color: "var(--dim)", fontSize: 12 }}>{p.telefono}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--green)", fontSize: 12 }}>← recibe el código</span>
            </div>
          ))}
          {res.abre.map(l => (
            <div key={l.k} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11.5, color: "var(--dim)" }}>abre {l.usos.length} cuenta(s):</div>
              {l.usos.map((u, i) => (
                <div className="info-row" key={i}>
                  <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{u.plataforma}</span>
                  <span style={{ fontSize: 13 }}>{u.identificador}</span>
                  {u.dueno && <span style={{ color: "var(--dim)", fontSize: 12 }}>· {u.dueno}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
