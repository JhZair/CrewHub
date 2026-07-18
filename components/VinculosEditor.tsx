"use client";
import { EntPicker } from "@/components/Composer";
import { agregarVinculo, quitarVinculo } from "@/app/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ICO_ENT } from "@/lib/secciones";

/* Editor de vínculos de entidad de un caso: chips actuales con ✕ para quitar,
   y un picker por tipo para agregar. Reusa el EntPicker del Composer y las
   acciones genéricas agregarVinculo/quitarVinculo. Las etiquetas tienen su
   propio editor aparte. */

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  convocatoria: "📜 Convocatoria", postulacion: "🎯 Postulación",
  equipamiento: "🎥 Equipo", lugar: "📍 Lugar",
};
/* (Otra copia: a ésta le faltaban `etiqueta` y `publicacion`.) */
const ENT_ICO = ICO_ENT;

export default function VinculosEditor({ pubId, actuales, catalogos }: {
  pubId: string;
  actuales: { tipo: string; id: string; nombre: string }[];
  catalogos: Record<string, { id: string; nombre: string }[]>;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  const refrescar = (r: any) => { setOcupado(false); if (r?.error) alert(r.error); else router.refresh(); };
  const quitar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await quitarVinculo(pubId, tipo, id));
  };
  const agregar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await agregarVinculo(pubId, tipo, id));
  };

  return (
    <div className="vinc-editor">
      {actuales.length > 0 && (
        <div className="sel-chips" style={{ marginBottom: 8 }}>
          {actuales.map(v => (
            <span key={v.tipo + v.id} className="echip">
              <Link href={`/entidad/${v.tipo}/${v.id}`} style={{ color: "inherit" }}>
                {ENT_ICO[v.tipo] || "🔗"} {v.nombre}
              </Link>
              <button className="x" title="Quitar vínculo" onClick={() => quitar(v.tipo, v.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="vinc-pickers">
        {Object.keys(ENT_META).map(t => (
          <EntPicker key={t} etiqueta={ENT_META[t]} items={catalogos[t] || []}
            onPick={id => agregar(t, id)} />
        ))}
      </div>
    </div>
  );
}
