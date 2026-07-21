"use client";
import { useState, useRef } from "react";
import { guardarTablaPostulacion } from "@/app/actions";
import { type TablaExp } from "@/lib/tablas-expediente";

/* Tabla repetible del expediente (material de archivo, beneficiarios…). Filas
   con columnas configurables; agregar/quitar; guarda en BLUR + al agregar/
   quitar, como el presupuesto. Reusable: la forma la define TablaExp. */

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", color: "var(--text)" } as const;

export default function TablaSimple({ postulacionId, tabla, inicial, seed }: {
  postulacionId: string;
  tabla: TablaExp;
  inicial: any[] | null;
  /* Filas sugeridas cuando NUNCA se ha guardado (inicial === null). No se
     persisten solas: son una propuesta que el usuario acepta al editarla. */
  seed?: any[];
}) {
  const nuncaGuardado = inicial == null;           // null/undefined = jamás tocado
  const base = inicial && inicial.length ? inicial
    : (nuncaGuardado && seed?.length ? seed : []);
  const [filas, setFilas] = useState<any[]>(base.map(f => ({ id: f.id || uid(), ...f })));
  const [estado, setEstado] = useState<"ok" | "guardando" | "error">("ok");
  // Mientras sea sugerencia sin guardar, no digas «guardado ✓».
  const [sugerido, setSugerido] = useState<boolean>(nuncaGuardado && !!seed?.length);

  /* Cola de escritura: cada guardado espera al anterior. Sin esto, un blur
     (estado viejo) y un agregar/quitar fila (estado nuevo) disparados casi a la
     vez podrían llegar a la base en desorden y la última respuesta pisaría a la
     buena — se perdería la fila recién agregada. En cola, gana el ÚLTIMO en
     llamarse, que es el que trae el estado correcto. */
  const cola = useRef<Promise<any>>(Promise.resolve());
  const persistir = (next: any[]) => {
    setSugerido(false);
    setEstado("guardando");
    // Sin el id interno de UI al guardar; se regenera al releer.
    const limpio = next.map(({ id, ...resto }) => resto);
    cola.current = cola.current.then(async () => {
      const r: any = await guardarTablaPostulacion(postulacionId, tabla.campo, limpio);
      setEstado(r?.error ? "error" : "ok");
    });
    return cola.current;
  };
  const guardarActual = () => persistir(filas);
  const setFila = (id: string, clave: string, val: any) =>
    setFilas(filas.map(f => f.id === id ? { ...f, [clave]: val } : f));
  const addFila = () => {
    const nueva: any = { id: uid() };
    tabla.columnas.forEach(c => nueva[c.clave] = c.tipo === "num" ? 0 : "");
    const next = [...filas, nueva];
    setFilas(next); persistir(next);
  };
  const delFila = (id: string) => {
    const next = filas.filter(f => f.id !== id);
    setFilas(next); persistir(next);
  };

  // grid: una columna por campo + la de borrar
  const cols = tabla.columnas.map(c => c.ancho ? `${c.ancho}px` : "1fr").join(" ") + " 24px";

  return (
    <div className="card" onBlur={guardarActual}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>{tabla.titulo}</b>
        <span style={{ color: sugerido ? "var(--yellow)" : "var(--dim)", fontSize: 11 }}>
          {sugerido ? "sugerido desde el equipo · edítalo o agrega para guardar"
            : estado === "guardando" ? "guardando…" : estado === "error" ? "⚠ no se guardó" : "guardado ✓"}
        </span>
      </div>
      {tabla.ayuda && <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "4px 0 8px" }}>💡 {tabla.ayuda}</p>}

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, minWidth: 480 }}>
          {tabla.columnas.map(c => (
            <span key={c.clave} style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: .4, color: "var(--dim)", padding: "0 2px 2px" }}>{c.etiqueta}</span>
          ))}
          <span />
          {filas.map(f => (
            <Fila key={f.id} cols={tabla.columnas} f={f} setFila={setFila} delFila={delFila} />
          ))}
        </div>
      </div>
      <button className="pre-add" onClick={addFila}>＋ fila</button>
      {!filas.length && <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 4 }}>— sin filas —</div>}
    </div>
  );
}

/* Una fila: sus celdas + el ✕. Va aparte para que el grid quede plano (cada
   celda es hija directa del grid). */
function Fila({ cols, f, setFila, delFila }: {
  cols: TablaExp["columnas"]; f: any;
  setFila: (id: string, clave: string, val: any) => void; delFila: (id: string) => void;
}) {
  return (
    <>
      {cols.map(c => c.tipo === "num" ? (
        <input key={c.clave} type="number" min={0} value={f[c.clave] || ""} placeholder="0"
          onChange={e => setFila(f.id, c.clave, Math.max(0, Number(e.target.value) || 0))}
          style={{ ...inp, textAlign: "right" }} />
      ) : (
        <input key={c.clave} value={f[c.clave] || ""} placeholder={c.placeholder || ""}
          onChange={e => setFila(f.id, c.clave, e.target.value)} style={inp} />
      ))}
      <button className="pre-x" title="Quitar" onClick={() => delFila(f.id)}>✕</button>
    </>
  );
}
