"use client";
import { borrarEtiqueta } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/* Chip de una etiqueta sin uso: lleva a su página y ofrece borrarla
   (con confirmación). El borrado solo procede si no tiene casos. */
export default function EtiquetaBorrable({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [conf, setConf] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const borrar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await borrarEtiqueta(id);
    setOcupado(false);
    if (r?.error) { alert(r.error); setConf(false); return; }
    router.refresh();
  };

  return (
    <span className="echip" style={{ opacity: 0.8 }}>
      <Link href={`/entidad/etiqueta/${id}`} title="Ver la etiqueta"
        style={{ color: "inherit", textDecoration: "none" }}>🏷️ {nombre}</Link>
      {conf ? (
        <span style={{ marginLeft: 6, fontSize: 11, whiteSpace: "nowrap" }}>
          <button onClick={borrar} disabled={ocupado} style={{ color: "var(--red)", fontWeight: 700 }}>
            {ocupado ? "…" : "borrar"}
          </button>
          {" / "}
          <button onClick={() => setConf(false)} style={{ color: "var(--dim)" }}>no</button>
        </span>
      ) : (
        <button className="x" title="Eliminar etiqueta" onClick={() => setConf(true)}>×</button>
      )}
    </span>
  );
}
