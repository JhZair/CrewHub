import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import CasillaDafo from "@/components/CasillaDafo";
import { EN_JUEGO } from "@/lib/fondos";

export const metadata: Metadata = { title: "📬 Casilla DAFO" };

/* ── 📬 CASILLA DAFO — el fin del ritual de abrir diez bandejas ──
   Cada postulación registra un correo distinto y DAFO avisa cuando quiere. La
   única forma de no perderse nada era revisar diez cuentas a diario. Aquí
   llegan todas: sin leer arriba, agrupadas por postulación, con el enlace al
   mensaje real en Gmail.

   Lo que hace que esto sirva no es la lista, es el resumen de arriba: dice
   CUÁNTO HACE que no llega nada por cada postulación en juego. Una bandeja
   vacía y una postulación de la que nunca supimos nada se ven igual en el
   correo; aquí no.

   Los correos entran por /api/ingesta/dafo (los empuja el Apps Script del
   buzón maestro). Ver CASILLA-DAFO.md. */

const TOPE = 300;

export default async function CasillaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: comsRaw, error }, { data: postsRaw }] = await Promise.all([
    supabase.from("dafo_comunicaciones")
      .select("id,gmail_thread_id,buzon,cuenta,remitente,asunto,extracto,recibido_en," +
              "vinculo_por,pide_accion,leido_en,caso_id,postulacion_id," +
              "post:postulaciones(id,codigo,estado,proy:proyectos(nombre),conv:convocatorias(nombre,anio))," +
              "emp:empresas(id,nombre)")
      .order("recibido_en", { ascending: false }).limit(TOPE),
    supabase.from("postulaciones")
      .select("id,codigo,estado,proy:proyectos(nombre),conv:convocatorias(anio)")
      .order("creado_en", { ascending: false }).limit(300),
  ]);

  /* Falta el SQL vs. falló la consulta: son dos problemas distintos y el
     mensaje genérico manda a buscar donde no está (misma lección que
     casoDeExpediente). */
  if (error) {
    const falta = /dafo_comunicaciones/.test(error.message);
    return (
      <div className="shell" style={{ maxWidth: "min(900px, 96vw)" }}>
        <div className="topbar"><Volver /></div>
        <h1 className="title-lg">📬 Casilla DAFO</h1>
        <div className="empty" style={{ color: falta ? "var(--yellow)" : "var(--red)" }}>
          {falta
            ? "Falta correr db/casilla-dafo.sql en Supabase → SQL Editor."
            : `No se pudo leer la casilla: ${error.message}`}
        </div>
      </div>
    );
  }

  const coms = (comsRaw || []) as any[];
  const posts = (postsRaw || []) as any[];

  /* El selector para vincular a mano: primero las que están en juego, que son
     las que reciben correos. Las cerradas siguen ahí —un requerimiento puede
     llegar meses después— pero no compiten por el primer sitio de la lista. */
  const etiqueta = (p: any) =>
    `${p.codigo || "sin código"}${p.proy?.nombre ? ` · ${p.proy.nombre}` : ""}${p.conv?.anio ? ` (${p.conv.anio})` : ""}`;
  const opciones = [...posts]
    .sort((a, b) => Number(EN_JUEGO.includes(b.estado || "")) - Number(EN_JUEGO.includes(a.estado || "")))
    .map(p => ({ id: p.id as string, etiqueta: etiqueta(p), enJuego: EN_JUEGO.includes(p.estado || "") }));

  /* Última señal por postulación. Se calcula de los correos ya traídos: la
     lista viene ordenada por fecha desc, así que el PRIMERO de cada
     postulación es su último contacto. */
  const ultimo = new Map<string, string>();
  const sinLeerPorPost = new Map<string, number>();
  coms.forEach(c => {
    if (!c.postulacion_id) return;
    if (!ultimo.has(c.postulacion_id)) ultimo.set(c.postulacion_id, c.recibido_en);
    if (!c.leido_en) sinLeerPorPost.set(c.postulacion_id, (sinLeerPorPost.get(c.postulacion_id) || 0) + 1);
  });

  const resumen = posts
    .filter(p => EN_JUEGO.includes(p.estado || ""))
    .map(p => ({
      id: p.id as string,
      codigo: (p.codigo || "sin código") as string,
      nombre: (p.proy?.nombre || "") as string,
      ultimo: ultimo.get(p.id) || null,
      sinLeer: sinLeerPorPost.get(p.id) || 0,
    }))
    /* Lo más silencioso primero: la postulación de la que nunca supimos nada
       es exactamente la que hay que mirar. */
    .sort((a, b) => (a.ultimo ? new Date(a.ultimo).getTime() : 0) - (b.ultimo ? new Date(b.ultimo).getTime() : 0));

  const sinLeer = coms.filter(c => !c.leido_en).length;

  return (
    <div className="shell" style={{ maxWidth: "min(1100px, 97vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          todo lo que DAFO escribió a las cuentas de las postulaciones
        </span>
      </div>
      <h1 className="title-lg">📬 Casilla DAFO{sinLeer ? ` · ${sinLeer} sin leer` : ""}</h1>

      <CasillaDafo items={coms} opciones={opciones} resumen={resumen} tope={TOPE} />
    </div>
  );
}
