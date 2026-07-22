"use client";
import { guardarObjeto } from "@/app/actions";
import { EntPicker } from "@/components/Composer";
import FormObjeto, { OBJETO_VACIO, type ValorObjeto } from "@/components/FormObjeto";
import { ICO_ENT, SECCIONES } from "@/lib/secciones";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* AGREGAR AL REPOSITORIO DESDE LA PÁGINA GLOBAL.

   Hasta ahora un objeto solo nacía dentro de la ficha de su dueño: para
   guardar un documental había que acordarse de quién lo aporta, ir a su ficha
   y recién ahí pegarlo. Pero el material aparece antes que esa decisión —lo
   encuentras navegando— y obligar a resolverla primero hace que no se guarde.

   Aquí se invierte el orden: se pega el link y se elige el dueño en el mismo
   formulario. La entidad sigue siendo obligatoria —un objeto sin dueño no
   aparece en ninguna ficha y se pierde—, pero deja de ser un viaje aparte. */

type Cat = { id: string; nombre: string };

export default function NuevoObjeto({ catalogos, etiquetas }: {
  /** Entidades que pueden tener repositorio, por tipo. */
  catalogos: Record<string, Cat[]>;
  /** Cómo se llama cada tipo en singular, para el botón del selector. */
  etiquetas: Record<string, string>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<ValorObjeto>({ ...OBJETO_VACIO });
  const [dueno, setDueno] = useState<{ tipo: string; id: string; nombre: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const limpiar = () => { setF({ ...OBJETO_VACIO }); setDueno(null); setAbierto(false); setError(""); };

  const guardar = async () => {
    if (guardando) return;
    if (!dueno) { setError("Elige de quién es: una persona, un proyecto, una empresa…"); return; }
    setGuardando(true); setError("");
    const r: any = await guardarObjeto({
      entidadTipo: dueno.tipo, entidadId: dueno.id,
      tipo: f.tipo, titulo: f.titulo, url: f.url, fecha: f.fecha, notas: f.notas,
    });
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    limpiar(); router.refresh();
  };

  /* El selector de dueño va como primer campo del formulario: es la pregunta
     que antes obligaba a navegar a otra página. */
  const campoDueno = (
    /* `div`, no `label`: dentro hay varios botones y un `<label>` reenvía el
       clic de su texto al primer control — abría siempre el mismo desplegable. */
    <div className="f-campo" style={{ gridColumn: "1 / -1" }}>
      <span>De quién es <b style={{ color: "var(--red)" }}>*</b></span>
      <div className="bandeja-vinc" style={{ marginTop: 2 }}>
        {dueno ? (
          <span className="echip">
            {ICO_ENT[dueno.tipo] || "🔗"} {dueno.nombre}
            <button className="x" title="Cambiar" onClick={() => setDueno(null)}>×</button>
          </span>
        ) : SECCIONES.filter(s => catalogos[s.tipo]?.length).map(s => s.tipo).map(t => (
          <EntPicker key={t} etiqueta={`${ICO_ENT[t] || "🔗"} ${etiquetas[t] || t}`}
            items={catalogos[t] || []}
            onPick={id => {
              const it = (catalogos[t] || []).find(x => x.id === id);
              setDueno({ tipo: t, id, nombre: it?.nombre || "—" });
            }} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <button className="btn" onClick={() => setAbierto(true)}>＋ Agregar</button>
      {abierto && (
        <FormObjeto f={f} setF={setF} error={error} guardando={guardando}
          onCancelar={limpiar} onGuardar={guardar} dueno={campoDueno} />
      )}
    </>
  );
}
