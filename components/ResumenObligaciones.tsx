import Link from "next/link";
import Avatar from "@/components/Avatar";
import { motivoNoDeclara, META_SIT } from "@/lib/obligaciones";
import type { EmpresaPropia } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   TODAS LAS EMPRESAS, EN UNA COLUMNA DE ROJOS

   La pantalla apilaba las quince empresas con sus bloques plegables, así que
   para saber si alguien tenía algo vencido había que desplegar, mirar y
   plegar, empresa por empresa. El semáforo estaba —cada cabecera lo tenía—
   pero repartido en quince sitios que no se leen juntos.

   Aquí la pregunta se contesta de una vez: quién debe algo, cuánto, y quién
   ya está al día.

   ── EL ORDEN ES LA DEUDA ──
   Primero quien tiene vencidos, luego quien tiene algo por vencer, luego el
   resto. Ordenar por nombre sería alfabetizar un problema.

   ── LAS QUE HOY NO DECLARAN NO ENSUCIAN ──
   Una empresa sin RUC o cerrada aparece al final y apagada, con el motivo. No
   se esconde: es donde se ve que le falta el RUC. Pero no compite con los
   rojos de verdad, que es lo que pasaba cuando todas pesaban igual.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaObl = {
  empresaId: string;
  vencidos: number;
  porVencer: number;
  declarados: number;
  /** De cuántos hay que responder. NO es cuántas filas hay: los meses de una
   *  obligación apagada no entran, porque no había que declararlos. */
  total: number;
  /** Meses de un bloque apagado. Fuera de la cuenta, pero dichos. */
  inactivos?: number;
  /** Cuándo se apuntó el último periodo en CrewHub, y quién. */
  ultima?: string | null;
  ultimaPor?: string | null;
};

const hace = (iso?: string | null) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(d)) return "";
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `hace ${m} mes${m > 1 ? "es" : ""}` : `hace ${Math.round(d / 365)} año(s)`;
};

export default function ResumenObligaciones({ empresas, logos, filas, href }: {
  empresas: EmpresaPropia[];
  logos?: Record<string, string>;
  filas: Map<string, FilaObl>;
  href: (empresaId: string) => string;
}) {
  const vacio: FilaObl = { empresaId: "", vencidos: 0, porVencer: 0, declarados: 0, total: 0, inactivos: 0 };

  const total = empresas.reduce((s, e) => {
    const f = filas.get(e.id) || vacio;
    return {
      vencidos: s.vencidos + f.vencidos,
      porVencer: s.porVencer + f.porVencer,
      declarados: s.declarados + f.declarados,
      total: s.total + f.total,
    };
  }, { vencidos: 0, porVencer: 0, declarados: 0, total: 0 });

  const orden = [...empresas].sort((a, b) => {
    const fa = filas.get(a.id) || vacio, fb = filas.get(b.id) || vacio;
    const na = !!motivoNoDeclara(a), nb = !!motivoNoDeclara(b);
    if (na !== nb) return na ? 1 : -1;              // las que hoy no declaran, al final
    return (fb.vencidos - fa.vencidos)
      || (fb.porVencer - fa.porVencer)
      || a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="res-emp-tit">
        <b>Todas las empresas</b>
        <span style={{ color: "var(--dim)" }}>
          {total.vencidos > 0 && (
            <span style={{ color: "var(--red)" }}>🔴 {total.vencidos} vencido(s) · </span>
          )}
          {total.porVencer > 0 && (
            <span style={{ color: "var(--yellow)" }}>🟡 {total.porVencer} por vencer · </span>
          )}
          ✅ {total.declarados} de {total.total}
        </span>
      </div>

      <div className="res-obl-cab">
        <span>Empresa</span>
        <span style={{ textAlign: "right" }}>Vencidos</span>
        <span style={{ textAlign: "right" }}>Por vencer</span>
        <span style={{ textAlign: "right" }}>Declarados</span>
        <span>Último apunte</span>
      </div>

      {orden.map(e => {
        const f = filas.get(e.id) || vacio;
        const m = motivoNoDeclara(e);
        return (
          <Link key={e.id} href={href(e.id)} className={`res-emp-fila${m ? " fila-tenue" : ""}`}>
            <span className="res-emp-nom">
              <Avatar nombre={e.nombre} src={logos?.[e.id]} size={22} />
              <b>{e.nombre}</b>
              {/* El motivo va pegado al nombre y no en su propia columna: es
                  por qué esa fila está en cero, no un dato que se compare
                  con el de al lado. */}
              {m && <span className="res-obl-motivo" title={m.ayuda}>{m.txt}</span>}
              {/* Lo apagado no suma al semáforo, pero se ve: si aquí dice «⏸ 2»
                  y alguien esperaba dos declaraciones, el bloque está apagado
                  por error y esta es la única pista que lo delata. */}
              {!!f.inactivos && (
                <span className="res-obl-motivo" title={META_SIT.inactiva.ayuda}>
                  ⏸ {f.inactivos} sin vigilar
                </span>
              )}
            </span>
            <span style={{ textAlign: "right", color: f.vencidos ? "var(--red)" : "var(--dim)", fontWeight: f.vencidos ? 700 : 400 }}>
              {f.vencidos || "—"}
            </span>
            <span style={{ textAlign: "right", color: f.porVencer ? "var(--yellow)" : "var(--dim)", fontWeight: f.porVencer ? 700 : 400 }}>
              {f.porVencer || "—"}
            </span>
            <span style={{ textAlign: "right", color: "var(--muted)" }}>
              {f.total ? `${f.declarados} de ${f.total}` : <i style={{ color: "var(--dim)" }}>sin periodos</i>}
            </span>
            {/* Cuándo se tocó por última vez. Una empresa al día y una que
                nadie mira desde marzo se ven igual en las tres columnas de la
                izquierda; esta las distingue. */}
            <span className="res-emp-ult">
              {f.ultima ? (
                <>
                  {hace(f.ultima)}
                  {f.ultimaPor && <span style={{ color: "var(--dim)" }}> · {f.ultimaPor}</span>}
                </>
              ) : (
                <i style={{ color: "var(--dim)" }}>nunca</i>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
