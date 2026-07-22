import Copiar from "@/components/Copiar";
import { FORM_CONF, nombreCorto, type CampoDef } from "@/lib/entidades";

/* Info secundaria de una entidad, de solo lectura. El carné muestra a propósito
   un subconjunto curado; los demás campos del formulario (los censales de una
   persona: género, teléfono, distrito, fecha de nacimiento…) se recogen aquí
   para colapsarlos en un solo bloque «Ver más» y que la ficha cargue limpia.
   Se alimenta de FORM_CONF —la MISMA fuente del formulario— así que no hay una
   segunda lista que mantener. */

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const verVal = (val: any) => {
  if (typeof val === "boolean") return val ? "✅ Sí" : "No";
  const s = String(val);
  if (esFecha(s))
    return new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
  return s.replace(/_/g, " ");
};

// Lo que se copia: el hecho pelado (fecha a dd/mm/aaaa, lo que piden los
// formularios peruanos), igual que el `crudo` de la ficha.
const crudoVal = (val: any) => {
  const s = String(val ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

/* Campos del formulario que el carné NO lista (ni son auto/links/nombre/…): la
   info secundaria suelta. Se calcula aparte para que la página decida si hay
   algo que colapsar antes de dibujar el bloque «Ver más». */
export function camposSecundarios(tipo: string, valores: Record<string, any>, yaVisibles: string[]): CampoDef[] {
  const conf = FORM_CONF[tipo];
  if (!conf) return [];
  // `nombre`/`nombre_corto` ya son el título; descripción y feedback del jurado
  // tienen su propio bloque; el color no es un dato que se lea.
  const ocultar = new Set([...yaVisibles, "nombre", "nombre_corto", "descripcion", "feedback_jurado", "color"]);
  const tieneValor = (v: any) => v != null && v !== "" && !(typeof v === "string" && !v.trim());
  return (conf.campos as CampoDef[]).filter(c =>
    !c.auto && !ocultar.has(c.key) && !/_url$/.test(c.key) && tieneValor(valores[c.key]));
}

/* Filas de datos, SIN envoltorio <details>: el bloque «Ver más» lo arma quien
   lo use (la página lo comparte con los grupos secundarios). */
export default function FilasDatos({ campos, valores }: { campos: CampoDef[]; valores: Record<string, any> }) {
  if (!campos.length) return null;
  return (
    <>
      {campos.map(c => (
        <div className="ficha-row" key={c.key}>
          <span className="fk">{nombreCorto(c)}</span>
          <span className="fv">
            <Copiar valor={crudoVal(valores[c.key])} etiqueta={nombreCorto(c).toLowerCase()}>
              {verVal(valores[c.key])}
            </Copiar>
          </span>
        </div>
      ))}
    </>
  );
}
