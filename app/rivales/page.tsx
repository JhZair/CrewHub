import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "@/components/Enlace";
import MatrizRivales from "@/components/MatrizRivales";
import {
  agrupaRivales, agrupaDirectores, casanNombres, nrm, todaLaCompetencia,
  type FilaRival, type ConvRival,
} from "@/lib/rivales";

export const metadata: Metadata = { title: "🏁 La competencia" };

/* ── 🏁 LA COMPETENCIA, DE UN AÑO A OTRO ──
   Cada convocatoria tiene su propia lista de rivales en su ficha. Esta pantalla
   las pone todas encima de la mesa a la vez, que es cuando aparecen las cosas
   que ninguna lista suelta puede decir: quién se presenta todos los años, quién
   ganó y volvió, y qué director cambió de productora entre una edición y otra.

   Se alimenta sola: no hay nada que cargar aquí. Lo que se sube en el 🏁 de
   cada concurso aparece en esta matriz al recargar.  */

export default async function RivalesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ filas, error }, { data: convsRaw }, { data: empsRaw }, { data: postsRaw }] = await Promise.all([
    todaLaCompetencia(supabase),
    supabase.from("convocatorias").select("id,codigo,nombre,anio").order("anio", { ascending: false }),
    /* Las nuestras, con los DOS nombres: en `empresas` el `nombre` es el corto
       de trabajo y el legal vive en `razon_social`, y el documento del
       Ministerio solo puede usar el legal. */
    supabase.from("empresas").select("id,nombre,razon_social,ruc"),
    /* Y los proyectos con los que hemos postulado: el segundo camino para
       reconocernos cuando la empresa está escrita de otra manera. */
    supabase.from("postulaciones").select("proy:proyectos(nombre)"),
  ]);

  if (error) {
    const falta = /convocatoria_competencia/.test(error.message || "");
    return (
      <div className="shell" style={{ maxWidth: "min(1000px, 96vw)" }}>
        <div className="topbar"><Volver /></div>
        <h1 className="title-lg">🏁 La competencia</h1>
        <div className="empty" style={{ color: falta ? "var(--yellow)" : "var(--red)" }}>
          {falta
            ? "Falta correr db/competencia.sql en Supabase → SQL Editor."
            : `No se pudo leer la competencia: ${error.message}`}
        </div>
      </div>
    );
  }

  /* ── QUIÉNES SOMOS NOSOTROS EN ESTA LISTA ──
     Se resuelve AQUÍ, en el servidor, y no en la pantalla: así los nombres y
     RUC de nuestras empresas no viajan al navegador solo para pintar una
     insignia, y la respuesta la da el mismo código que la pestaña de cada
     convocatoria (`lib/rivales.ts`). */
  const rucsPropios = new Set(((empsRaw || []) as any[]).map(e => e.ruc).filter(Boolean));
  const nombresPropios = ((empsRaw || []) as any[])
    .flatMap(e => [e.nombre, e.razon_social]).filter(Boolean) as string[];
  const proyPropios = ((postsRaw || []) as any[])
    .map(p => (Array.isArray(p.proy) ? p.proy[0]?.nombre : p.proy?.nombre))
    .filter(Boolean).map(nrm).filter((t: string) => t.length >= 8) as string[];

  const esNuestra = (f: FilaRival) => {
    if (f.ruc && rucsPropios.has(f.ruc)) return true;
    if (nombresPropios.some(m => casanNombres(m, f.empresa))) return true;
    if (f.titulo) {
      const t = nrm(f.titulo);
      if (proyPropios.some(p => t === p || t.startsWith(p))) return true;
    }
    return false;
  };

  const mapaConv = new Map<string, ConvRival>(
    ((convsRaw || []) as ConvRival[]).map(c => [c.id, c]));
  /* Solo las que tienen algo cargado: son las columnas reales de la matriz, y
     ofrecer como filtro un concurso vacío es prometer un dato que no hay. */
  const conDatos = new Set(filas.map(f => f.convocatoria_id));
  const convs = ((convsRaw || []) as ConvRival[]).filter(c => conDatos.has(c.id));

  const rivales = agrupaRivales(filas, mapaConv, esNuestra);
  const directores = agrupaDirectores(filas, mapaConv, esNuestra);

  return (
    <div className="shell" style={{ maxWidth: "min(1040px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          todas las listas de DAFO cargadas, cruzadas
        </span>
      </div>
      <h1 className="title-lg">🏁 La competencia · quién vuelve a intentarlo</h1>

      {filas.length === 0 ? (
        <div className="empty" style={{ padding: "26px 0" }}>
          Todavía no hay ninguna lista cargada.
          <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            Las listas se suben en la pestaña 🏁 de cada convocatoria —DAFO publica
            cuatro por concurso: recibidas, aptas, finalistas y el fallo—. En cuanto
            haya dos ediciones, esta pantalla empieza a decir quién repite.
            <div style={{ marginTop: 8 }}>
              <Link href="/convocatorias">📜 Ir a las convocatorias</Link>
            </div>
          </div>
        </div>
      ) : (
        <MatrizRivales rivales={rivales} directores={directores} convs={convs} filas={filas.length} />
      )}
    </div>
  );
}
