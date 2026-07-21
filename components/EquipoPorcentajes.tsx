/* CUMPLIMIENTO DEL EQUIPO — % peruano/domiciliado y % regional.
   No es un dato a teclear: se CALCULA desde la nacionalidad y la región de cada
   persona del equipo (los censales), y se valida contra los mínimos DAFO:
     · mayoría (≥50%) peruana o extranjera domiciliada  (Ley 32309, art. 4)
     · para la reserva regional: mayoría domiciliada FUERA de Lima Metrop. y
       Callao.
   Servidor: solo lee. Junta equipo de postulación + de proyecto, sin repetir. */

const ES_PD = (n?: string | null) => {
  const s = (n || "").toLowerCase();
  return s.startsWith("per") || s.includes("domicili");  // "Perú" · "Extranjero domiciliado"
};
const ES_REGIONAL = (r?: string | null) => {
  const s = (r || "").toUpperCase();
  return !!s && s !== "LIMA" && s !== "CALLAO" && s !== "SIN UBICACION";
};

export default function EquipoPorcentajes({ equipo }: { equipo: any[] }) {
  // Sin repetir a nadie (alguien puede estar en el equipo de proyecto y de postulación)
  const vistos = new Set<string>();
  const personas = (equipo || [])
    .map(m => m.persona)
    .filter((p: any) => p && p.id && !vistos.has(p.id) && vistos.add(p.id));

  const total = personas.length;
  if (!total) return null;

  const pd = personas.filter((p: any) => ES_PD(p.nacionalidad)).length;
  const reg = personas.filter((p: any) => ES_REGIONAL(p.region)).length;
  const sinNac = personas.filter((p: any) => !p.nacionalidad).length;
  const sinReg = personas.filter((p: any) => !p.region).length;
  const pctPD = Math.round((pd / total) * 100);
  const pctReg = Math.round((reg / total) * 100);

  const Fila = ({ label, pct, ok, nota }: { label: string; pct: number; ok: boolean; nota: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted)", flex: "1 1 260px" }}>{label}</span>
      <div style={{ flex: "0 0 120px", height: 7, background: "var(--bg)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: ok ? "var(--green)" : "var(--red)" }} />
      </div>
      <b style={{ color: ok ? "var(--green)" : "var(--red)", fontSize: 13, width: 42, textAlign: "right" }}>{pct}%</b>
      <span style={{ fontSize: 11, color: ok ? "var(--green)" : "var(--yellow)", flex: "1 1 160px" }}>{ok ? "✓ cumple" : `⚠ ${nota}`}</span>
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>🧮 Cumplimiento del equipo · {total} personas</b>
        <span style={{ color: "var(--dim)", fontSize: 10.5 }}>calculado de la nacionalidad y región de cada persona</span>
      </div>
      <Fila label="Peruano/a o extranjero/a domiciliado/a" pct={pctPD} ok={pctPD >= 50} nota="falta llegar al 50% (o tramitar excepción)" />
      <Fila label="Domiciliado/a en regiones (fuera de Lima Metrop. y Callao)" pct={pctReg} ok={pctReg > 50} nota="sin mayoría regional — no aplica a la reserva" />
      {(sinNac > 0 || sinReg > 0) && (
        <div style={{ color: "var(--yellow)", fontSize: 11, marginTop: 6 }}>
          ⚠ Faltan datos: {sinNac > 0 && `${sinNac} sin nacionalidad`}{sinNac > 0 && sinReg > 0 ? " · " : ""}{sinReg > 0 && `${sinReg} sin región`} — complétalos en la ficha de la persona; el % se recalcula.
        </div>
      )}
    </div>
  );
}
