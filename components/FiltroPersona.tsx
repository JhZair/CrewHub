"use client";
import { useRouter } from "next/navigation";

/* Filtro compacto por persona para el Tablero: vive en la esquina
   opuesta a las pestañas de tipo, en una sola fila. Al elegir a alguien
   se muestran SUS asuntos (creados, asignados o vinculados a su persona)
   — para coordinar y repartir, no para auditar.
   En "Mis asuntos" queda marcado el nombre de quien está logueado.
   No hay opción "todo el equipo": para eso está la pestaña 🌐 Todo. */
export default function FiltroPersona({ equipo, actual }: {
  equipo: { id: string; nombre: string }[]; actual: string;
}) {
  const router = useRouter();
  return (
    <select className="sel-persona" value={actual}
      title="Ver los asuntos de una persona del equipo"
      onChange={e => router.push(`/tablero?p=${e.target.value}`)}>
      <option value="" disabled hidden>👥 Personal</option>
      {equipo.map(pf => (
        <option key={pf.id} value={pf.id}>{pf.nombre}</option>
      ))}
    </select>
  );
}
