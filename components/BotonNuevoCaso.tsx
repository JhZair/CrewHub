"use client";
import { useState, useEffect } from "react";
import { esVentanaDeTrabajo } from "@/lib/panel";
import { usePathname } from "next/navigation";
import Composer, { type Catalogos } from "@/components/Composer";
import { datosNuevoCaso } from "@/app/actions";

/* FAB "+" global + atajo de teclado (tecla C): crea un caso desde cualquier
   parte del sistema, con el MISMO Composer del feed (todas las vinculaciones).
   Carga catálogos bajo demanda y, si estás en la ficha de una entidad,
   pre-vincula ese elemento.
   Solo aparece en la ventana principal: NO dentro de los paneles embebidos
   del Monitor (iframes), para no duplicar el botón. */
type Datos = { userId: string; catalogos: Catalogos; perfiles: { id: string; nombre: string }[] };

export default function BotonNuevoCaso() {
  const pathname = usePathname() || "";
  const enLogin = pathname.startsWith("/login");
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  // Arranca oculto y solo se muestra tras confirmar que somos la ventana
  // principal (no un iframe del Monitor). Así no parpadea en los paneles.
  const [esTop, setEsTop] = useState(false);
  /* ── TAMBIÉN EN LOS PANELES DEL MONITOR ──
     Antes: `window.self === window.top`, o sea «solo en la ventana principal».
     Un panel del Monitor es una ventana de trabajo entera —se entra a un caso y
     se sigue trabajando ahí—, así que necesita esto igual que la otra mitad.
     Ver lib/panel.ts. */
  useEffect(() => { setEsTop(esVentanaDeTrabajo()); }, []);

  const abrir = async () => {
    setAbierto(true);
    if (!datos && !cargando) {
      setCargando(true);
      const r: any = await datosNuevoCaso();
      setCargando(false);
      if (r?.error) { alert(r.error); setAbierto(false); return; }
      setDatos(r);
    }
  };

  // Atajo: C abre el creador; Escape lo cierra. No dispara si estás escribiendo,
  // ni dentro de un panel embebido.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && abierto) { setAbierto(false); return; }
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
        || t.tagName === "SELECT" || t.isContentEditable);
      if (enLogin || !esTop || abierto || escribiendo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") { e.preventDefault(); abrir(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, datos, cargando, enLogin, esTop]);

  if (enLogin || !esTop) return null;

  // Pre-vínculo por contexto: si estoy en /entidad/[tipo]/[id]
  const inicial = (() => {
    if (!datos) return undefined;
    const m = pathname.match(/^\/entidad\/([^/]+)\/([^/]+)/);
    if (!m) return undefined;
    const tipo = m[1], id = m[2];
    const lista = (datos.catalogos as any)[tipo] as { id: string; nombre: string }[] | undefined;
    const item = lista?.find(x => x.id === id);
    return item ? [{ tipo, id, nombre: item.nombre }] : undefined;
  })();

  return (
    <>
      <button className="fab-nuevo" title="Nuevo caso · tecla C" onClick={abrir}>＋</button>
      {abierto && (
        <div className="modal-fondo" onClick={() => setAbierto(false)}>
          {/* `modal-compositor`: tan ancho como el feed. Dentro va el mismo
              Composer y su bandeja de vincular no entra en 720 px. */}
          <div className="modal-caja modal-compositor" onClick={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>➕ Nuevo caso</b>
              <button className="modal-x" title="Cerrar (Esc)" onClick={() => setAbierto(false)}>✕</button>
            </div>
            {cargando || !datos ? (
              <div className="modal-cargando">Cargando…</div>
            ) : (
              <Composer userId={datos.userId} catalogos={datos.catalogos}
                perfiles={datos.perfiles} inicial={inicial}
                onListo={() => setAbierto(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
