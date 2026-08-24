"use client";
import { verificarLinksDrive } from "@/app/actions";
import Link from "@/components/Enlace";
import { useState } from "react";

/* La ronda de links: ¿los documentos invocados de Drive siguen vivos? */
export default function RondaLinks() {
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ revisados: number; rotos: any[] } | null>(null);
  const [error, setError] = useState("");

  const correr = async () => {
    if (ocupado) return;
    setOcupado(true); setError(""); setResultado(null);
    const r: any = await verificarLinksDrive();
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setResultado(r);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="panel-h" style={{ margin: 0 }}>🔗 Ronda de links de Drive</div>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" disabled={ocupado} onClick={correr}
          style={{ fontSize: 12, padding: "5px 12px" }}>
          {ocupado ? "Revisando link por link…" : "🔗 Verificar todos los links"}
        </button>
      </div>
      {error && <div className="err-inline">⚠ {error}</div>}
      {resultado && (
        <div style={{ marginTop: 10 }}>
          {resultado.rotos.length === 0 ? (
            <span style={{ color: "var(--green)", fontSize: 13 }}>
              ✅ {resultado.revisados} links revisados — todos responden.
            </span>
          ) : (
            <>
              <div style={{ color: "var(--yellow)", fontSize: 12.5, marginBottom: 8 }}>
                {resultado.revisados} revisados · <b style={{ color: "var(--red)" }}>{resultado.rotos.length} con problema</b> —
                corrige el link en la ficha (✏️ Editar) o repón el archivo en Drive:
              </div>
              {resultado.rotos.map((r: any, i: number) => (
                <div className="info-row" key={i}>
                  <Link href={`/entidad/${r.tipo}/${r.id}`} style={{ fontWeight: 600 }}>
                    {r.nombre} →
                  </Link>
                  <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.campo.replace(/_/g, " ")}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: r.estado === "sin respuesta" ? "var(--yellow)" : "var(--red)", fontSize: 11.5, fontWeight: 700 }}>
                    {r.estado}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {!resultado && !error && (
        <p style={{ color: "var(--dim)", fontSize: 12, margin: "8px 0 0" }}>
          Recorre todos los links registrados (carpetas, actas, bases, CV, materiales…)
          y delata los que ya no responden. Ideal antes de una postulación o rendición.
        </p>
      )}
    </div>
  );
}
