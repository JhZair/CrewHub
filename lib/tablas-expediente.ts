/* ── Tablas repetibles del expediente (Sección C y B del formulario DAFO) ──
   Material de archivo y participantes/beneficiarios: tablas que se llenan
   fila por fila. Las columnas salen del formulario oficial. La forma la comparte
   el componente TablaSimple y la acción guardarTablaPostulacion. */

export type ColTabla = {
  clave: string;
  etiqueta: string;
  tipo?: "text" | "num";
  ancho?: number;          // px de la columna (las de texto sin ancho = flexibles)
  placeholder?: string;
};

export type TablaExp = {
  campo: string;           // columna jsonb en postulaciones (whitelist)
  titulo: string;
  ayuda?: string;
  columnas: ColTabla[];
};

export const TABLAS_EXP: Record<string, TablaExp> = {
  material_archivo: {
    campo: "material_archivo",
    titulo: "📁 Material de archivo",
    ayuda: "Consigna al menos autor y fuente (Ley de Derecho de Autor). Si no se identifica el autor, escribe «no identificado».",
    columnas: [
      { clave: "descripcion", etiqueta: "Descripción del material", placeholder: "Nombre u otros datos que lo identifiquen" },
      { clave: "autor", etiqueta: "Autor", ancho: 200, placeholder: "no identificado" },
      { clave: "fuente", etiqueta: "Fuente", ancho: 200 },
    ],
  },
  beneficiarios: {
    campo: "beneficiarios",
    titulo: "👥 Participantes / beneficiarios",
    ayuda: "Cantidad de personal que se estima emplear en la ejecución del proyecto, por rol o puesto.",
    columnas: [
      { clave: "rol", etiqueta: "Rol / puesto", placeholder: "Ej. Programador, artista 2D…" },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "num", ancho: 100 },
    ],
  },
  /* Obra de terceros: solo si la postulación adapta/transforma una obra ajena
     (el combo «Usa obra de terceros» = Sí lo revela). Título, autores y
     titulares de derechos de la obra de la que deriva el guion/tratamiento. */
  obra_terceros: {
    campo: "obra_terceros",
    titulo: "⚖ Obra de terceros",
    ayuda: "Cada obra adaptada o transformada de la que deriva el tratamiento o guion, con su autoría y el titular de los derechos.",
    columnas: [
      { clave: "titulo", etiqueta: "Título de la obra adaptada o transformada" },
      { clave: "autores", etiqueta: "Autor(es/as) de la obra", ancho: 220 },
      { clave: "titulares", etiqueta: "Titular(es) de derechos", ancho: 220 },
    ],
  },
  /* Solo videojuego: prototipo o vertical slice ejecutable / registro
     audiovisual de la experiencia del usuario. Vive en su propia columna
     jsonb `prototipo`. Se muestra solo cuando la categoría es videojuego. */
  prototipo: {
    campo: "prototipo",
    titulo: "🎮 Prototipo / vertical slice",
    ayuda: "Prototipo o vertical slice ejecutable o registro audiovisual de la experiencia del usuario. Garantiza que los enlaces funcionen desde el inicio hasta el final de la convocatoria; los archivos en Drive/Dropbox no deben modificarse después de la fecha de presentación.",
    columnas: [
      { clave: "material", etiqueta: "Material" },
      { clave: "requisitos", etiqueta: "Requisitos técnicos" },
      { clave: "enlace", etiqueta: "Enlace" },
      { clave: "pass", etiqueta: "Contraseña (de ser el caso)", ancho: 170 },
    ],
  },
};

/* Para videojuego, el «material de archivo» no es footage con derechos: es la
   tabla de MATERIALES GRÁFICOS Y/O AUDIOVISUALES (muestras estéticas, registros,
   fotos). Reusa la MISMA columna jsonb `material_archivo`, con otras columnas. */
const MATERIAL_VIDEOJUEGO: TablaExp = {
  campo: "material_archivo",
  titulo: "🖼 Materiales gráficos y/o audiovisuales",
  ayuda: "Muestras de propuesta estética, registros audiovisuales, fotografías… Garantiza que los enlaces funcionen y no se modifiquen tras la fecha de presentación.",
  columnas: [
    { clave: "descripcion", etiqueta: "Nombre del material" },
    { clave: "enlace", etiqueta: "Enlace" },
    { clave: "pass", etiqueta: "Contraseña (de ser el caso)", ancho: 170 },
    { clave: "adjunto", etiqueta: "Adjunto (enlace)", ancho: 200 },
  ],
};

export const esVideojuego = (cat?: string | null) => /videojuego/i.test(cat || "");
/* La tabla de material según la categoría: materiales gráficos (videojuego) o
   material de archivo clásico (el resto). */
export const materialTablaDe = (cat?: string | null): TablaExp =>
  esVideojuego(cat) ? MATERIAL_VIDEOJUEGO : TABLAS_EXP.material_archivo;

/* Campo de texto que solo pide el formulario de videojuego. Se inyecta en la
   plantilla del expediente cuando la categoría es videojuego y aún no está. */
const CAMPO_PRODUCTO_FINAL = {
  k: "producto_final",
  etiqueta: "Producto que resultará de la ejecución del proyecto",
  ayuda: "Detallar la versión a la que llegará el proyecto como parte de las actividades a desarrollar en el plazo de ejecución. Indicar una fecha aproximada para la obtención de la versión final (o gold master).",
  largo: true,
  max: 500,
};

/* La plantilla del expediente + los campos de texto propios de la categoría.
   Hoy solo videojuego (Producto final); no toca la plantilla en la base, solo
   la enriquece al vuelo. Idempotente: si la plantilla ya trae el campo, no lo
   duplica. Lo añade a la Sección C (o a la última si no la hay). */
export function plantillaConExtras(plant: any, cat?: string | null): any[] {
  const secs: any[] = Array.isArray(plant) ? plant : [];
  if (!esVideojuego(cat) || secs.length === 0) return secs;
  const yaEsta = secs.some((s: any) =>
    (s?.campos || []).some((c: any) => /producto que resultar/i.test(String(c?.etiqueta || ""))));
  if (yaEsta) return secs;
  const idxC = secs.findIndex((s: any) => /^(?:secci[oó]n\s+)?c\s*[·\-.:]/i.test(String(s?.titulo || "").trim()));
  const target = idxC >= 0 ? idxC : secs.length - 1;
  return secs.map((s: any, i: number) =>
    i === target ? { ...s, campos: [...(s?.campos || []), CAMPO_PRODUCTO_FINAL] } : s);
}

/* Los campos jsonb que la acción tiene permitido escribir. */
export const CAMPOS_TABLA = Object.keys(TABLAS_EXP);
