"use client";
import { EntPicker, MultiPicker } from "@/components/Composer";
import { agregarVinculo, quitarVinculo, vincularEnLote } from "@/app/actions";
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
  /* Con una orden de trabajo de 30 personas, los chips tapaban la página
     entera. Se muestran los primeros y el resto se despliega. */
  const [verTodos, setVerTodos] = useState(false);
  const LIMITE = 3;
  const hayMas = actuales.length > LIMITE;
  const visibles = verTodos || !hayMas ? actuales : actuales.slice(0, LIMITE);

  const refrescar = (r: any) => { setOcupado(false); if (r?.error) alert(r.error); else router.refresh(); };
  const quitar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await quitarVinculo(pubId, tipo, id));
  };
  const agregar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await agregarVinculo(pubId, tipo, id));
  };
  const agregarVarias = async (tipo: string, ids: string[]) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await vincularEnLote(pubId, tipo, ids));
  };

  return (
    <div className="vinc-editor">
      {/* Lo que ESTÁ vinculado: hechos. Van primero y pesan más. */}
      {actuales.length > 0 && (
        <div className="sel-chips vinc-puestos">
          {visibles.map(v => (
            <span key={v.tipo + v.id} className="echip">
              <Link href={`/entidad/${v.tipo}/${v.id}`} style={{ color: "inherit" }}>
                {ENT_ICO[v.tipo] || "🔗"} {v.nombre}
              </Link>
              <button className="x" title="Quitar vínculo" onClick={() => quitar(v.tipo, v.id)}>×</button>
            </span>
          ))}
          {hayMas && (
            <button type="button" className="echip echip-mas" onClick={() => setVerTodos(v => !v)}>
              {verTodos ? "ver menos" : `＋${actuales.length - LIMITE} más`}
            </button>
          )}
        </div>
      )}
      {/* Lo que se PUEDE vincular: controles. Un caso con ocho vínculos hacía
          quince píldoras seguidas y no se veía dónde acababan los hechos y
          empezaban los botones. La diferencia YA estaba —sólido vs punteado,
          radio 20 vs 9— y a ese tamaño, sobre negro, no llega. Una palabra
          sí llega. */}
      <div className="bandeja-vinc">
        <span className="vinc-add-lbl">+ vincular</span>
        {Object.keys(ENT_META).map(t => (
          <EntPicker key={t} etiqueta={ENT_META[t]} items={catalogos[t] || []}
            onPick={id => agregar(t, id)} />
        ))}
      </div>
      {/* Vincular en lote: para una orden de trabajo que toca a muchas personas
          o empresas (ej. «revisión de firmas del equipo»). */}
      <div className="bandeja-vinc">
        <span className="vinc-add-lbl">+ varias</span>
        {["persona", "empresa"].map(t => (
          <MultiPicker key={t} etiqueta={ENT_META[t]} items={catalogos[t] || []}
            ocupado={ocupado} onConfirm={ids => agregarVarias(t, ids)} />
        ))}
      </div>
    </div>
  );
}
