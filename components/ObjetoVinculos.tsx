"use client";
import { EntPicker } from "@/components/Composer";
import { vincularObjeto, desvincularObjeto } from "@/app/actions";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* A qué apunta un objeto del repositorio. Mismo gesto que los vínculos de un
   caso: chips con ✕ y un picker por tipo. El objeto NO cambia de dueño al
   vincularse — sigue viviendo en la ficha de quien lo aporta. */

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  convocatoria: "📜 Convocatoria", postulacion: "🎯 Postulación",
};

export default function ObjetoVinculos({ objetoId, actuales, catalogos }: {
  objetoId: string;
  actuales: { tipo: string; id: string; nombre: string }[];
  catalogos: Record<string, { id: string; nombre: string }[]>;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  const tras = (r: any) => { setOcupado(false); if (r?.error) alert(r.error); else router.refresh(); };
  const quitar = async (t: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    tras(await desvincularObjeto(objetoId, t, id));
  };
  const agregar = async (t: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    tras(await vincularObjeto(objetoId, t, id));
  };

  return (
    <div className="vinc-editor">
      {actuales.length > 0 && (
        <div className="sel-chips vinc-puestos">
          {actuales.map(v => (
            <span key={v.tipo + v.id} className="echip">
              <Link href={rutaEntidad(v.tipo, v.id) || "#"} style={{ color: "inherit" }}>
                {ICO_ENT[v.tipo] || "🔗"} {v.nombre}
              </Link>
              <button className="x" title="Quitar vínculo" onClick={() => quitar(v.tipo, v.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="bandeja-vinc">
        <span className="vinc-add-lbl">+ vincular</span>
        {Object.keys(ENT_META).map(t => (
          <EntPicker key={t} etiqueta={ENT_META[t]} items={catalogos[t] || []}
            onPick={id => agregar(t, id)} />
        ))}
      </div>
    </div>
  );
}
