import { ICO_ENT } from "@/lib/secciones";
import Link from "next/link";
import { BOT } from "@/lib/personas";

/* Una línea del historial. Vive aquí y no dentro de la ficha porque ahora
   la usan dos pantallas: el historial de UNA entidad y el acumulado de
   TODAS. La lógica de "quién hizo qué" tiene que leerse igual en las dos. */

export type Evento = {
  tipo: string;
  detalle?: any;
  creado_en: string;
  actor?: { nombre?: string } | null;
  entidad_tipo?: string;
  entidad_id?: string;
  entidadNombre?: string;   // solo en el acumulado, donde no se sabe de quién es
  entidadTitulo?: string;   // el nombre completo, para el tooltip
};

/* «edicion» y «editado» son la MISMA cosa con dos nombres: el código escribe
   `edicion` desde casos y equipamiento, y `editado` desde las fichas, las
   credenciales y los materiales. Nadie lo decidió; se fue dando.

   No se puede renombrar sin migrar los eventos ya escritos, así que aquí se
   aceptan los dos. Lo que NO se puede es que el lector conozca solo uno: hasta
   hoy, una comprobación física de equipo —hecha por una persona— caía al
   `else`, se pintaba con 🤖 y perdía el nombre de quien la hizo. El bot
   firmando el trabajo de un humano, otra vez. */
const HUMANOS = ["editado", "edicion", "dato", "miembro", "archivo"];

export const ICO_EVENTO: Record<string, string> = {
  creado: "📝", estado: "🔄", editado: "✏️", edicion: "✏️",
  dato: "🔑", miembro: "👥", bot: "🤖", archivo: "🗄",
};
export const icoDe = (t: string) => ICO_EVENTO[t] || "🤖";

export { ICO_ENT } from "@/lib/secciones";

/* Qué dice el evento. El bot no tiene actor: por eso "Sistema"/"Bot Qhaway"
   cuando `actor` viene vacío — y por eso importa que las acciones humanas
   manden su actor_id. */
export function textoEvento(e: Evento): string {
  const quien = e.actor?.nombre;
  if (e.tipo === "creado") return `${quien || "Sistema"} registró esta entidad`;
  if (e.tipo === "estado")
    return `${quien || BOT} · ${e.detalle?.campo}: ${String(e.detalle?.de ?? "—").replace(/_/g, " ")} → ${String(e.detalle?.a ?? "—").replace(/_/g, " ")}`;
  /* Archivar/despertar: el mensaje ya lo trae el bot («aviso archivado —…»);
     una acción humana solo trae `a`. Se dice sin ambigüedad para que el
     historial no muestre «archivo» a secas. */
  if (e.tipo === "archivo")
    return `${quien || BOT} ${e.detalle?.mensaje
      || (e.detalle?.a === "despertado" ? "despertó este caso del archivo" : "archivó este caso")}`;
  if (HUMANOS.includes(e.tipo))
    return `${quien || "Alguien"} ${e.detalle?.mensaje || "editó la ficha"}`;
  return e.detalle?.mensaje || e.tipo;
}

export default function EventoHistorial({ e, hora, conEntidad }:
  { e: Evento; hora: string; conEntidad?: boolean }) {
  return (
    <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`}>
      <span>{icoDe(e.tipo)}</span>
      <span>
        {/* En el acumulado hace falta decir de quién se habla: sin esto,
            "actualizó 1 campo" cien veces seguidas no informa nada. */}
        {conEntidad && e.entidadNombre && (
          // Un caso no vive en /entidad: tiene su propia página
          <Link href={e.entidad_tipo === "publicacion"
              ? `/caso/${e.entidad_id}`
              : `/entidad/${e.entidad_tipo}/${e.entidad_id}`}
            title={e.entidadTitulo || undefined}
            style={{ color: "var(--violet)", fontWeight: 700 }}>
            {ICO_ENT[e.entidad_tipo || ""] || "🔗"} {e.entidadNombre}
          </Link>
        )}
        {conEntidad && e.entidadNombre && " · "}
        {textoEvento(e)}
        {(e.detalle?.cambios || []).map((c: any, j: number) => (
          <span key={j} style={{ display: "block", marginTop: 3, fontSize: 12 }}>
            <b style={{ color: "var(--muted)" }}>{c.campo}:</b>{" "}
            <s style={{ color: "var(--red)", opacity: .75 }}>{String(c.de).replace(/_/g, " ")}</s>
            {" → "}
            <span style={{ color: "var(--green)" }}>{String(c.a).replace(/_/g, " ")}</span>
          </span>
        ))}
      </span>
      <span className="t">{hora}</span>
    </div>
  );
}
