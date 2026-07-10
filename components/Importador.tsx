"use client";
import { importarPersonas } from "@/app/actions";
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

const CAMPOS: [string, string, string[]][] = [
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
];

export default function Importador() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [datos, setDatos] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<string>("");
  const [importando, setImportando] = useState(false);

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
    if (mapa.nombre === undefined) { setResultado("⚠ Debes mapear al menos la columna Nombre."); return; }
    setImportando(true);
    const filas = datos.map(d => {
      const obj: Record<string, string> = {};
      CAMPOS.forEach(([campo]) => {
        obj[campo] = mapa[campo] !== undefined ? (d[mapa[campo]] || "") : "";
      });
      return obj;
    });
    const res = await importarPersonas(filas);
    setImportando(false);
    if (res?.error) setResultado(`❌ ${res.error} (insertadas antes del error: ${res.insertadas || 0})`);
    else setResultado(`✅ Importación completa: ${res.insertadas} personas nuevas, ${res.omitidas} omitidas (vacías o ya existentes).`);
  };

  return (
    <div>
      <div className="card">
        <b>1. Archivo CSV</b>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "6px 0 10px" }}>
          En Seatable: clic derecho en la tabla <b>Proveedores</b> → Export → CSV.
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
              {importando ? "Importando..." : `Importar ${datos.length} personas`}
            </button>
          </div>
        </>
      )}

      {resultado && <div className="card" style={{ fontSize: 13.5 }}>{resultado}</div>}
    </div>
  );
}
