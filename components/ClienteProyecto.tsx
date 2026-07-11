"use client";
import { asignarClienteProyecto } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function ClienteProyecto({ proyectoId, cliente, personas }: {
  proyectoId: string;
  cliente: { id: string; nombre: string } | null;
  personas: CatalogoItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  const asignar = async (personaId: string | null) => {
    const res = await asignarClienteProyecto(proyectoId, personaId);
    if (res?.error) setError(res.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🤝 Cliente
        </h4>
        <span style={{ flex: 1 }} />
        <EntPicker etiqueta={cliente ? "Cambiar" : "Elegir persona"} items={personas}
          onPick={id => asignar(id)} />
      </div>
      {error && <div className="err-inline">⚠ {error}</div>}
      {cliente ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Link href={`/entidad/persona/${cliente.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>
            {cliente.nombre} →
          </Link>
          <span style={{ flex: 1 }} />
          <button style={{ color: "var(--dim)", fontSize: 12 }} onClick={() => asignar(null)}>✕ quitar</button>
        </div>
      ) : (
        <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>
          Sin cliente — típico de proyectos de concurso; los encargos sí lo llevan.
        </div>
      )}
    </div>
  );
}
