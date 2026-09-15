"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { leerJuradoDeDafo, cargarJurado } from "@/app/actions";
import SubirPdf from "@/components/SubirPdf";
import { chocaCon, type CabeceraRes } from "@/lib/resolucionDafo";
import type { FilaJurado } from "@/lib/jurados";

/* ══════════════════════════════════════════════════════════════════════════
   ⚖️ CARGAR LA MESA DESDE LA SUMILLA DE DAFO

   Se sube el PDF, se ve lo que se entendió, se corrige lo que haga falta y
   recién ahí se guarda — los tres pasos en la misma caja, igual que en 🏁.

   ── POR QUÉ AQUÍ SE PUEDE EDITAR TODO Y EN 🏁 SOLO LO DUDOSO ──
   Allí son doscientas filas y cuatrocientas cajas de texto esconderían las
   diez que importan. Aquí son cinco personas: enseñar las cinco enteras y
   dejarlas escribir no esconde nada, y además hace falta, porque un cartel
   maquetado a mano puede partir una biografía donde le parezca y eso solo lo
   arregla alguien mirándolo.

   ⚠ El nombre es lo único que no conviene tocar a la ligera: es la llave con
   la que esta persona se cruza con las otras ediciones. Escribirlo de dos
   maneras no da ningún error — simplemente aparece como dos jurados que
   juzgaron una vez cada uno, en vez de uno que juzgó dos veces, y eso no se
   nota nunca.
   ══════════════════════════════════════════════════════════════════════════ */

type FilaEd = FilaJurado & { on: boolean; i: number };

export default function CargarJurado({ convocatoriaId, nombre, anio, onCerrar }: {
  convocatoriaId: string;
  nombre: string;
  anio: number | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [cab, setCab] = useState<CabeceraRes | null>(null);
  const [filas, setFilas] = useState<FilaEd[]>([]);
  const [dudoso, setDudoso] = useState<string | null>(null);
  const [archivo, setArchivo] = useState("");

  async function subir(f: File) {
    setLeyendo(true); setErr(""); setCab(null); setFilas([]);
    const fd = new FormData();
    fd.append("pdf", f);
    const r: any = await leerJuradoDeDafo(fd);
    setLeyendo(false);
    if (r?.error) { setErr(r.error); return; }
    setCab(r.cabecera);
    setArchivo(f.name);
    setDudoso(r.dudoso || null);
    setFilas((r.filas as FilaJurado[]).map((x, i) => ({ ...x, on: true, i })));
  }

  const edita = (i: number, campo: "nombre" | "rol" | "pais" | "sumilla", v: string) =>
    setFilas(fs => fs.map(f => (f.i === i ? { ...f, [campo]: v } : f)));
  const alterna = (i: number) =>
    setFilas(fs => fs.map(f => (f.i === i ? { ...f, on: !f.on } : f)));

  const marcadas = filas.filter(f => f.on);

  /* Las dos alarmas de 🏁, por los mismos motivos y con el mismo peso: subir la
     mesa de ficción a la ficha de documental, o la de 2024 a la de 2025, no da
     ningún error y deja el cruce entre ediciones mintiendo para siempre. */
  const choca = cab ? chocaCon(`${cab.concurso || ""} ${cab.modalidad || ""}`, nombre) : "";
  const otroAnio = !!(cab?.anio && anio && cab.anio !== anio);

  async function guardar() {
    if (!marcadas.length) return;
    setGuardando(true); setErr("");
    const r: any = await cargarJurado(convocatoriaId,
      marcadas.map(f => ({
        nombre: f.nombre, rol: f.rol, pais: f.pais, sumilla: f.sumilla,
        avisos: f.avisos, crudo: f.crudo,
      })),
      archivo || `${cab?.concurso || "DAFO"} · jurado`);
    setGuardando(false);
    if (r?.error) { setErr(r.error); return; }
    onCerrar();
    router.refresh();
  }

  return (
    <div className="cb-caja">
      <div className="cb-cab">
        <b>⚖️ Cargar la mesa desde la sumilla de DAFO</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="dato-btn" onClick={onCerrar}>✕ cerrar</button>
      </div>

      {!cab && (
        <>
          <div className="cb-ayuda">
            Sube el PDF de <b>sumillas del jurado</b> que DAFO publica con cada concurso.
            Se leen los nombres, la especialidad de cada uno y su trayectoria, y se te
            enseñan antes de guardar nada. Volver a subirlo actualiza en vez de duplicar.
          </div>
          <SubirPdf leyendo={leyendo} etiqueta="📎 o elígelo" onArchivo={subir}
            ayuda="El de «Miembros del jurado» o «Designación del jurado»." />
        </>
      )}

      {err && <div className="err-inline" style={{ marginTop: 9 }}>⚠ {err}</div>}

      {cab && (
        <>
          <div className="riv-cab">
            <b>⚖️ {filas.length} {filas.length === 1 ? "persona" : "personas"} en la mesa</b>
            <div className="riv-cab-sub">
              {[cab.concurso, cab.anio, cab.modalidad].filter(Boolean).join(" · ") || archivo}
            </div>
          </div>

          {choca && (
            <div className="err-inline">
              ⚠ Esta convocatoria se llama «{nombre}» y el PDF dice ser de «
              {[cab.concurso, cab.modalidad].filter(Boolean).join(" · ")}». No coinciden
              en <b>{choca.split(" / ")[0]}</b> contra <b>{choca.split(" / ")[1]}</b>.
              Si son concursos distintos, cierra sin guardar.
            </div>
          )}

          {otroAnio && (
            <div className="err-inline">
              ⚠ Esta convocatoria es de <b>{anio}</b> y el PDF dice ser de <b>{cab.anio}</b>.
              Una mesa en el año equivocado no da ningún error: lo que se rompe es el cruce
              —diría que alguien juzgó un año en el que no estuvo—.
            </div>
          )}

          {dudoso && <div className="cb-aviso">⚠ {dudoso}</div>}

          <div className="jur-ed">
            {filas.map(f => (
              <div key={f.i} className={`jur-ed-f${f.on ? "" : " off"}`}>
                <label className="jur-ed-on">
                  <input type="checkbox" checked={f.on} onChange={() => alterna(f.i)} />
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input className="jur-ed-nom" value={f.nombre}
                    onChange={e => edita(f.i, "nombre", e.target.value)}
                    placeholder="Nombre y apellidos"
                    title="La llave con la que esta persona se cruza con las otras ediciones. Escrito de dos maneras, aparecen dos jurados en vez de uno." />
                  <div className="jur-ed-fila">
                    <input className="jur-ed-rol" value={f.rol || ""}
                      onChange={e => edita(f.i, "rol", e.target.value)}
                      placeholder="Especialidad" />
                    <input className="jur-ed-pais" value={f.pais || ""}
                      onChange={e => edita(f.i, "pais", e.target.value)}
                      placeholder="País (si lo dice)"
                      title="Solo si el documento lo escribe. Deducirlo de la biografía sería inventar un dato con aspecto de leído." />
                  </div>
                  <textarea className="jur-ed-sum" rows={3} value={f.sumilla || ""}
                    onChange={e => edita(f.i, "sumilla", e.target.value)}
                    placeholder="Trayectoria, tal como la publica el documento" />
                  {f.avisos.length > 0 && (
                    <div className="riv-aviso" title={f.crudo || undefined}>⚠ {f.avisos.join(" · ")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="cb-pie">
            <button type="button" className="btn" disabled={!marcadas.length || guardando}
              onClick={guardar}>
              {guardando ? "Guardando…" : `⚖️ Guardar ${marcadas.length} ${marcadas.length === 1 ? "jurado" : "jurados"}`}
            </button>
            <span className="cb-nota">
              Se guarda lo que dice el documento y de dónde salió. No se busca nada más de
              estas personas ni se dan de alta como personas del sistema.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
