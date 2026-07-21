import Copiar from "@/components/Copiar";
import Link from "next/link";

/* Referencia rápida de las credenciales de la empresa, para tenerlas A LA MANO
   al entrar a DAFO o al correo desde la postulación —sin ir a la ficha de la
   empresa—. Solo lectura: se editan allá. La contraseña NO vive aquí (está en
   el gestor, 🔒 KeePass/Bitwarden); esto es el usuario, el link y dónde está la
   clave, con botón de copiar. */
export default function CredencialesRef({ creds, empresaId }: {
  creds: any[];
  empresaId?: string | null;
}) {
  if (!creds?.length) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 12.5 }}>🔑 Accesos de la empresa</b>
        <span style={{ flex: 1 }} />
        {empresaId && (
          <Link href={`/entidad/empresa/${empresaId}`} style={{ color: "var(--accent)", fontSize: 11 }}>
            editar en la empresa →
          </Link>
        )}
      </div>
      {creds.map((c: any) => (
        <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {c.url
              ? <a href={c.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--violet)", fontWeight: 700, fontSize: 12 }}>{c.plataforma} ↗</a>
              : <span style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)" }}>{c.plataforma}</span>}
            {c.identificador && (
              <Copiar valor={c.identificador} etiqueta={`el usuario de ${c.plataforma}`}>
                <span style={{ fontSize: 11.5, color: "var(--text)" }}>{c.identificador}</span>
              </Copiar>
            )}
            {c.ubicacion && <span style={{ fontSize: 10.5, color: "var(--dim)" }}>🔒 {c.ubicacion}</span>}
          </div>
          {(c.datos || []).length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
              {(c.datos || []).map((d: any) => (
                <Copiar key={d.id} valor={d.valor} etiqueta={d.etiqueta}>
                  <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{d.etiqueta}: {d.valor}</span>
                </Copiar>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
