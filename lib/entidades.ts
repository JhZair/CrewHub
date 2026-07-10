/* Configuración de mantenimiento de entidades núcleo.
   Compartida por el formulario (cliente) y la acción (servidor,
   como whitelist de tablas y campos). */

export type CampoDef = {
  key: string;
  label: string;
  tipo?: "text" | "select" | "textarea";
  opciones?: string[];
  requerido?: boolean;
};

export const FORM_CONF: Record<string, { tabla: string; titulo: string; campos: CampoDef[] }> = {
  proyecto: {
    tabla: "proyectos",
    titulo: "Proyecto",
    campos: [
      { key: "folio", label: "Folio (P-###)" },
      { key: "nombre", label: "Nombre oficial", requerido: true },
      { key: "nombre_corto", label: "Nombre corto" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["documental", "animacion", "videojuego", "ficcion", "experimental"] },
      { key: "etapa", label: "Etapa", tipo: "select", opciones: ["idea", "en_carpeta", "desarrollo", "preproduccion", "produccion", "postproduccion", "finalizado"] },
      { key: "estado_actividad", label: "Estado de actividad", tipo: "select", opciones: ["activo", "bloqueado", "en_pausa", "completado"] },
      { key: "color", label: "Color (hex, ej. #a78bfa)" },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
    ],
  },
  empresa: {
    tabla: "empresas",
    titulo: "Empresa",
    campos: [
      { key: "codigo", label: "Código (E-###)" },
      { key: "nombre", label: "Nombre", requerido: true },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"] },
      { key: "ruc", label: "RUC" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activa", "inactiva", "cerrada"] },
    ],
  },
  persona: {
    tabla: "personas",
    titulo: "Persona",
    campos: [
      { key: "nombre", label: "Nombre completo", requerido: true },
      { key: "alias", label: "Nombre corto / alias" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["personal", "colaborador", "independiente", "entidad_financiera", "contacto"] },
      { key: "equipo", label: "Equipo", tipo: "select", opciones: ["creativo", "tecnico", "administrativo"] },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activo", "potencial", "vetado", "inactivo"] },
      { key: "rol", label: "Especialidades / rol" },
      { key: "region", label: "Región" },
      { key: "genero", label: "Género", tipo: "select", opciones: ["femenino", "masculino", "otro"] },
      { key: "telefono", label: "Teléfono" },
      { key: "email", label: "Email" },
      { key: "ruc_dni", label: "RUC / DNI" },
      { key: "notas", label: "Notas", tipo: "textarea" },
    ],
  },
};
