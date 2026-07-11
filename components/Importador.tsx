"use client";
import { importarEntidades } from "@/app/actions";
import { useState } from "react";

/* Parser CSV con soporte de comillas y saltos de línea internos */
function parseCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], sig = texto[i + 1];
    if (enComillas) {
      if (c === '"' && sig === '"') { celda += '"'; i++; }
      else if (c === '"') enComillas = false;
      else celda += c;
    } else {
      if (c === '"') enComillas = true;
      else if (c === ",") { fila.push(celda); celda = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && sig === "\n") i++;
        fila.push(celda); celda = "";
        if (fila.some(x => x.trim())) filas.push(fila);
        fila = [];
      } else celda += c;
    }
  }
  fila.push(celda);
  if (fila.some(x => x.trim())) filas.push(fila);
  return filas;
}

const CONF_IMPORT: Record<string, { titulo: string; tabla: string; campos: [string, string, string[]][] }> = {
  persona: {
    titulo: "👤 Personas", tabla: "Proveedores",
    campos: [
      ["nombre", "Nombre completo *", ["nombre completo", "nombre del proveedor", "nombre"]],
      ["alias", "Nombre corto / alias", ["nombre corto", "alias"]],
      ["tipo", "Tipo (personal/colaborador...)", ["tipo de proveedor", "tipo"]],
      ["equipo", "Equipo (creativo/técnico...)", ["equipo"]],
      ["rol", "Especialidades / rol", ["especialidades", "rol", "cargo"]],
      ["estado", "Estado (activo/vetado...)", ["estado del proveedor", "estado"]],
      ["region", "Región", ["región", "region"]],
      ["genero", "Género", ["género", "genero"]],
      ["telefono", "Teléfono", ["teléfono", "telefono", "celular"]],
      ["email", "Email", ["email", "correo"]],
      ["ruc_dni", "RUC / DNI", ["ruc", "dni", "documento"]],
      ["notas", "Notas", ["notas", "observaciones"]],
    ],
  },
  proyecto: {
    titulo: "📁 Proyectos", tabla: "PROYECTOS",
    campos: [
      ["folio", "Folio (P-###)", ["folio"]],
      ["nombre", "Nombre oficial *", ["nombre oficial", "nombre del proyecto", "nombre"]],
      ["nombre_corto", "Nombre corto", ["nombre corto"]],
      ["tipo", "Tipo de proyecto", ["tipo de proyecto", "tipo"]],
      ["etapa", "Etapa", ["etapa"]],
      ["estado_actividad", "Estado de actividad", ["estado de actividad", "actividad"]],
      ["descripcion", "Descripción", ["descripción", "descripcion"]],
    ],
  },
  empresa: {
    titulo: "🏢 Empresas", tabla: "Empresas / _EQUIPO-Empresas",
    campos: [
      ["codigo", "Código (E-###)", ["código", "codigo", "empresa"]],
      ["nombre", "Nombre corto *", ["nombre corto", "nombre"]],
      ["razon_social", "Razón social", ["razón social", "razon social", "denominación"]],
      ["tipo", "Tipo (EIRL/SAC/Asoc...)", ["tipo"]],
      ["ruc", "RUC", ["ruc"]],
      ["region", "Región", ["región", "region"]],
      ["estado", "Estado", ["estado"]],
    ],
  },
  convocatoria: {
    titulo: "📜 Concursos DAFO", tabla: "F_ConcursosDAFO",
    campos: [
      ["codigo", "Código del concurso", ["código concurso", "codigo concurso", "código"]],
      ["nombre", "Concurso *", ["concurso"]],
      ["anio", "Edición / año", ["edición", "edicion", "año", "ano"]],
      ["monto", "Monto", ["monto"]],
      ["f_apertura", "Fecha apertura", ["apertura"]],
      ["f_cierre", "Cierre de postulación", ["cierre postulación", "cierre postulacion", "cierre"]],
      ["f_revision", "Revisión", ["revisión", "revision"]],
      ["f_evaluacion", "Evaluación", ["evaluación", "evaluacion"]],
      ["f_finalistas", "Finalistas", ["finalistas"]],
      ["f_ganadores", "Ganadores", ["ganadores"]],
      ["bases_url", "Link a las bases", ["bases"]],
      ["postulados", "Proyectos postulados (P-###)", ["concursosproyectos", "postulados"]],
    ],
  },
  equipamiento: {
    titulo: "🎥 Equipos", tabla: "AudiovisualesEquipos",
    campos: [
      ["folio", "Folio (A-###)", ["folio", "id"]],
      ["nombre", "Nombre del activo *", ["nombre del activo", "nombre"]],
      ["categoria", "Categoría", ["categoría", "categoria"]],
      ["subcategoria", "Subcategoría", ["sub categoría", "subcategoría", "sub categoria"]],
      ["estado", "Estado", ["estado actual", "estado"]],
      ["valor_compra", "Valor de compra", ["valor de compra", "valor"]],
      ["comprado_en", "Comprado en", ["comprado en"]],
      ["link", "Link", ["link"]],
      ["descripcion", "Descripción", ["descripción breve", "descripción", "descripcion"]],
    ],
  },
};

export default function Importador() {
  const [entidad, setEntidad] = useState("persona");
  const [headers, setHeaders] = useState<string[]>([]);
  const [datos, setDatos] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<string>("");
  const [importando, setImportando] = useState(false);

  const CAMPOS = CONF_IMPORT[entidad].campos;

  const cambiarEntidad = (e: string) => {
    setEntidad(e); setHeaders([]); setDatos([]); setMapa({}); setResultado("");
  };

  const cargarArchivo = async (f: File) => {
    const texto = await f.text();
    const filas = parseCSV(texto);
    if (filas.length < 2) { setResultado("El archivo no tiene filas de datos."); return; }
    const hs = filas[0].map(h => h.trim());
    setHeaders(hs);
    setDatos(filas.slice(1));
    // Auto-mapeo por nombre de columna
    const m: Record<string, number> = {};
    CAMPOS.forEach(([campo, , pistas]) => {
      const idx = hs.findIndex(h => pistas.some(p => h.toLowerCase().includes(p)));
      if (idx >= 0) m[campo] = idx;
    });
    setMapa(m);
    setResultado("");
  };

  const importar = async () => {
    if (mapa.nombre === undefined && mapa.codigo === undefined) {
      setResultado("⚠ Debes mapear al menos la columna Nombre (o Código)."); return;
    }
    setImportando(true);
    const filas = datos.map(d => {
      const obj: Record<string, string> = {};
      CAMPOS.forEach(([campo]) => {
        obj[campo] = mapa[campo] !== undefined ? (d[mapa[campo]] || "") : "";
      });
      // Convocatorias: columnas NO mapeadas que contengan fechas
      // se vuelven hitos dinámicos (cada año las bases cambian)
      if (entidad === "convocatoria") {
        const usados = new Set(Object.values(mapa));
        const extras: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (!usados.has(i) && (d[i] || "").trim()) extras[h.trim()] = d[i];
        });
        obj.__extras = JSON.stringify(extras);
      }
      return obj;
    });
    const res: any = await importarEntidades(entidad, filas);
    setImportando(false);
    if (res?.error) setResultado(`❌ ${res.error} (insertadas antes del error: ${res.insertadas || 0})`);
    else setResultado(`✅ Importación completa: ${res.insertadas} registros nuevos, ${res.omitidas} omitidos (vacíos o ya existentes)${res.hitos != null ? `, ${res.hitos} hitos de cronograma` : ""}${res.postulaciones != null ? `, ${res.postulaciones} postulaciones históricas` : ""}.`);
  };

  return (
    <div>
      <div className="card">
        <b>1. ¿Qué vas a importar?</b>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {Object.entries(CONF_IMPORT).map(([k, c]) => (
            <button key={k} className={`tipo-chip ${entidad === k ? "sel" : ""}`}
              onClick={() => cambiarEntidad(k)}>{c.titulo}</button>
          ))}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "12px 0 10px" }}>
          En Seatable: clic derecho en la tabla <b>{CONF_IMPORT[entidad].tabla}</b> → Export → CSV.
          La deduplicación reconoce folios/códigos ya existentes (P-###, E-###) y nombres repetidos.
        </p>
        <input type="file" accept=".csv,text/csv"
          onChange={e => e.target.files?.[0] && cargarArchivo(e.target.files[0])} />
      </div>

      {headers.length > 0 && (
        <>
          <div className="card">
            <b>2. Mapeo de columnas</b> <span style={{ color: "var(--dim)", fontSize: 12 }}>· detectado automáticamente, corrige si hace falta</span>
            <div className="mapa-grid">
              {CAMPOS.map(([campo, etiqueta]) => (
                <label key={campo} className="mapa-row">
                  <span>{etiqueta}</span>
                  <select
                    value={mapa[campo] ?? -1}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      const m = { ...mapa };
                      if (v < 0) delete m[campo]; else m[campo] = v;
                      setMapa(m);
                    }}>
                    <option value={-1}>— no importar —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <b>3. Vista previa</b> <span style={{ color: "var(--dim)", fontSize: 12 }}>· {datos.length} filas en el archivo</span>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="prev">
                <thead><tr>
                  {CAMPOS.filter(([c]) => mapa[c] !== undefined).map(([c, e]) => <th key={c}>{e}</th>)}
                </tr></thead>
                <tbody>
                  {datos.slice(0, 5).map((d, i) => (
                    <tr key={i}>
                      {CAMPOS.filter(([c]) => mapa[c] !== undefined).map(([c]) => (
                        <td key={c}>{(d[mapa[c]] || "").slice(0, 40)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" style={{ marginTop: 14 }} disabled={importando} onClick={importar}>
              {importando ? "Importando..." : `Importar ${datos.length} registros`}
            </button>
          </div>
        </>
      )}

      {resultado && <div className="card" style={{ fontSize: 13.5 }}>{resultado}</div>}
    </div>
  );
}
