"use client";
import { actualizarPostulacion } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { useState } from "react";

/* Quién postula: la empresa que pone el RUC y firma el acta.
   Se podía asignar solo desde la página de la convocatoria, así que parado
   en la postulación no había forma de arreglarlo —y el vigía te alertaba
   "sin empresa asignada" mandándote justo aquí, donde no se podía hacer
   nada—. Una alerta sin acción al lado es solo un reproche. */
export default function EmpresaPostulacion({ postulacionId, convocatoriaId, empresa, empresas }: {
  postulacionId: string;
  convocatoriaId: string;
  empresa?: { id: string; nombre: string } | null;
  empresas: CatalogoItem[];
}) {
  const [ocupado, setOcupado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const router = useRouter();

  const asignar = async (empresaId: string) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await actualizarPostulacion(postulacionId, convocatoriaId, { empresa_id: empresaId });
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    setCambiando(false);
    router.refresh();
  };

  return (
    <div className="eq-row">
      <span className="cargo">Empresa</span>
      <span style={{ flex: 1, textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {empresa && !cambiando && (
          <>
            <Link href={`/entidad/empresa/${empresa.id}`} style={{ color: "var(--text)" }}>
              🏢 {empresa.nombre} →
            </Link>
            <button onClick={() => setCambiando(true)} title="Cambiar la empresa postulante"
              style={{ color: "var(--dim)", fontSize: 11, background: "none", border: "none", cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
              cambiar
            </button>
          </>
        )}
        {/* Sin empresa no se puede postular ni firmar: se dice en rojo, no
            se calla escondiendo la fila. */}
        {!empresa && !cambiando && (
          <>
            <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>⚠ sin asignar</span>
            <button className="btn btn-ghost" style={{ padding: "3px 9px", fontSize: 11 }}
              onClick={() => setCambiando(true)}>＋ Asignar</button>
          </>
        )}
        {cambiando && (
          <>
            <EntPicker etiqueta="🏢 Elegir empresa" items={empresas}
              onPick={id => asignar(id)} />
            <button onClick={() => setCambiando(false)}
              style={{ color: "var(--dim)", fontSize: 11.5, background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </>
        )}
      </span>
    </div>
  );
}
