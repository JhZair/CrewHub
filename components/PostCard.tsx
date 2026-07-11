"use client";
import Avatar from "@/components/Avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* Tarjeta del feed: la tarjeta navega al caso; los chips, a su entidad. */
export default function PostCard({
  href, titulo, tipoLabel, tipoColor, estado, estadoTxt,
  autorNombre, autorColor, autorSrc, fechaStr, respNombre, avisaSinResp,
  nc, venc, cuerpo, chips,
}: {
  href: string; titulo: string; tipoLabel: string; tipoColor: string;
  estado: string; estadoTxt: string;
  autorNombre?: string | null; autorColor?: string | null; autorSrc?: string | null;
  fechaStr: string; respNombre?: string | null; avisaSinResp: boolean;
  nc: number; venc: [string, string] | null; cuerpo?: string | null;
  chips: { tipo: string; id: string; nombre: string; ico: string }[];
}) {
  const router = useRouter();
  return (
    <div className="card link" style={{ cursor: "pointer" }} onClick={() => router.push(href)}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar nombre={autorNombre} color={autorColor} size={38} src={autorSrc} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}>{titulo}</b>
            <span className="badge" style={{ color: tipoColor, background: `${tipoColor}22` }}>{tipoLabel}</span>
            <span style={{ flex: 1 }} />
            <span className={`pill st-${estado}`}>{estadoTxt}</span>
          </div>
          <div className="meta">
            <span>{fechaStr}</span>
            <span>•</span><span>Por <b>{autorNombre}</b></span>
            {respNombre
              ? <><span>•</span><span>→ Responsable: <b style={{ color: "var(--teal)" }}>{respNombre}</b></span></>
              : avisaSinResp && <><span>•</span><span style={{ color: "var(--yellow)" }}>⚠ sin responsable</span></>}
            <span>•</span><span>💬 {nc}</span>
            {venc && <><span>•</span><b style={{ color: venc[1] }}>{venc[0]}</b></>}
          </div>
          {cuerpo && (
            <p style={{ color: "#c6c6da", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              {cuerpo.slice(0, 180)}{cuerpo.length > 180 ? "…" : ""}
            </p>
          )}
          {chips.length > 0 && (
            <div className="sel-chips" style={{ marginTop: 9 }}>
              {chips.map((c, i) => (
                <Link key={i} href={`/entidad/${c.tipo}/${c.id}`}
                  onClick={e => e.stopPropagation()}>
                  <span className="echip echip-link">{c.ico} {c.nombre}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
