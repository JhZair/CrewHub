"use client";
import { guardarObjeto } from "@/app/actions";
import { EntPicker } from "@/components/Composer";
import FormObjeto, { OBJETO_VACIO, type ValorObjeto } from "@/components/FormObjeto";
import { ICO_ENT, SECCIONES } from "@/lib/secciones";
import { CASA_ICO, CASA_LBL, DUENO_CASA, esDeLaCasa } from "@/lib/objetos";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* AGREGAR AL REPOSITORIO DESDE LA PÁGINA GLOBAL.

   Hasta ahora un objeto solo nacía dentro de la ficha de su dueño: para
   guardar un documental había que acordarse de quién lo aporta, ir a su ficha
   y recién ahí pegarlo. Pero el material aparece antes que esa decisión —lo
   encuentras navegando— y obligar a resolverla primero hace que no se guarde.

   Aquí se invierte el orden: se pega el link y se elige el dueño en el mismo
   formulario. La entidad sigue siendo obligatoria —un objeto sin dueño no
   aparece en ninguna ficha y se pierde—, pero deja de ser un viaje aparte.

   ── 🏠 Y UNA SALIDA PARA LO QUE NO ES DE NADIE ──
   La frase de arriba tenía una grieta: hay material que es del EQUIPO —un
   curso, una plantilla, una guía— y no pertenece a ninguna ficha. Obligarlo a
   elegir una empresa hacía justo lo que este componente vino a evitar: que no
   se guardara. «La casa» es ese sitio, y vive solo en /repositorio. */

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
    if (!dueno) { setError("Elige de quién es: una persona, un proyecto, una empresa… o la casa, si es material del equipo."); return; }
    setGuardando(true); setError("");
    const r: any = await guardarObjeto({
      /* La casa va sin id: es el único dueño que no es una ficha. */
      entidadTipo: dueno.tipo, entidadId: esDeLaCasa(dueno.tipo) ? null : dueno.id,
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
        ) : (
          <>
            {SECCIONES.filter(s => catalogos[s.tipo]?.length).map(s => s.tipo).map(t => (
              <EntPicker key={t} etiqueta={`${ICO_ENT[t] || "🔗"} ${etiquetas[t] || t}`}
                items={catalogos[t] || []}
                onPick={id => {
                  const it = (catalogos[t] || []).find(x => x.id === id);
                  setDueno({ tipo: t, id, nombre: it?.nombre || "—" });
                }} />
            ))}
            {/* ⚠ Un BOTÓN y no un `EntPicker`: los demás abren una lista para
                elegir cuál, y la casa no tiene cuáles — es una sola. Darle
                desplegable con una entrada sería prometer una elección que no
                existe. Va al final, después de las fichas, porque es la
                respuesta a «no es de ninguna de estas». */}
            <button type="button" className="echip echip-btn"
              title="Material del equipo: un curso, una plantilla, una guía. No cuelga de ninguna ficha y se busca en el repositorio."
              onClick={() => setDueno({ tipo: DUENO_CASA, id: "", nombre: CASA_LBL })}>
              {CASA_ICO} {CASA_LBL}
            </button>
          </>
        )}
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
