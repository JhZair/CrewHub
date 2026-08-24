"use client";
import { agregarVinculo, quitarVinculo, crearEtiqueta } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { useState } from "react";

/* Editor de etiquetas de un caso: chips actuales con ✕ para quitar, y un
   picker "+ etiqueta" para buscar una existente o crear una nueva. */
export default function EtiquetasEditor({ pubId, actuales, todas }: {
  pubId: string;
  actuales: { id: string; nombre: string }[];
  todas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const yaIds = new Set(actuales.map(a => a.id));
  const q = texto.trim().toLowerCase();
  const sugeridas = todas.filter(t => !yaIds.has(t.id) && t.nombre.toLowerCase().includes(q));
  const existeExacta = todas.some(t => t.nombre.trim().toLowerCase() === q);

  const refrescar = (r: any) => { setOcupado(false); if (r?.error) alert(r.error); else router.refresh(); };

  const quitar = async (id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await quitarVinculo(pubId, "etiqueta", id));
  };
  const agregar = async (id: string) => {
    if (ocupado) return; setOcupado(true); setTexto(""); setAbierto(false);
    refrescar(await agregarVinculo(pubId, "etiqueta", id));
  };
  const crear = async () => {
    const nombre = texto.trim(); if (!nombre || ocupado) return;
    setOcupado(true);
    const r: any = await crearEtiqueta(nombre);
    if (r?.error) { setOcupado(false); alert(r.error); return; }
    setTexto(""); setAbierto(false);
    refrescar(await agregarVinculo(pubId, "etiqueta", r.id));
  };

  return (
    <div className="etq-editor">
      {actuales.map(e => (
        <span key={e.id} className="echip">
          <Link href={`/entidad/etiqueta/${e.id}`} title="Ver la etiqueta"
            style={{ color: "inherit", textDecoration: "none" }}>🏷️ {e.nombre}</Link>
          <button className="x" title="Quitar etiqueta" onClick={() => quitar(e.id)}>×</button>
        </span>
      ))}
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button className="echip echip-add" onClick={() => setAbierto(!abierto)}>🏷️ + etiqueta</button>
        {abierto && (
          <>
            <span className="rx-fondo" onClick={() => setAbierto(false)} />
            <div className="etq-pop">
              <input autoFocus placeholder="Buscar o crear…" value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { if (sugeridas[0]) agregar(sugeridas[0].id); else if (q) crear(); }
                  if (e.key === "Escape") setAbierto(false);
                }} />
              <div className="etq-lista">
                {sugeridas.slice(0, 8).map(t => (
                  <button key={t.id} onClick={() => agregar(t.id)}>🏷️ {t.nombre}</button>
                ))}
                {q && !existeExacta && (
                  <button className="etq-crear" onClick={crear}>➕ Crear «{texto.trim()}»</button>
                )}
                {!sugeridas.length && !q && (
                  <span className="etq-vacio">Escribe para buscar o crear</span>
                )}
              </div>
            </div>
          </>
        )}
      </span>
    </div>
  );
}
