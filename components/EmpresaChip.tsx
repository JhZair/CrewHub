"use client";
import Avatar from "@/components/Avatar";
import VistaEmpresa from "@/components/VistaEmpresa";

/* CHIP DE EMPRESA — logo + nombre, y la vista rápida al clic.
 * Hermano de PersonaChip; mismas reglas (el nombre sigue siendo enlace real,
 * el pop-up vive en su propio botón). */
export default function EmpresaChip({ id, nombre, codigo, logo, nota, titulo }: {
  id: string;
  nombre?: string | null;
  codigo?: string | null;
  logo?: string | null;
  /** Texto gris tras el nombre (rol en la postulación, relación…). */
  nota?: string | null;
  titulo?: string;
}) {
  if (!id) return null;   // mismo motivo que en PersonaChip
  return (
    <span className="pers-chip-wrap">
      <a href={`/entidad/empresa/${id}`} className="pers-chip emp-chip" title={titulo || codigo || ""}>
        {logo
          ? <img className="emp-chip-logo" src={logo} alt="" referrerPolicy="no-referrer" />
          : <Avatar nombre={nombre} size={26} color="#3b82f6" />}
        <span className="pers-chip-txt">
          {nombre}
          {nota && <span className="pers-chip-rol"> · {nota}</span>}
        </span>
      </a>
      <VistaEmpresa empresaId={id}>
        {(abrir) => (
          <button className="chip-ojo" onClick={abrir} title="Vista rápida (sin salir de aquí)">⚡</button>
        )}
      </VistaEmpresa>
    </span>
  );
}
