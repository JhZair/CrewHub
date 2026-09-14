"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { leerBasesDePdf, cargarCronogramaDeBases } from "@/app/actions";
import { bloqueQueCasa, esComun, type BloqueBases } from "@/lib/cronogramaBases";
import SubirPdf from "@/components/SubirPdf";

/* ══════════════════════════════════════════════════════════════════════════
   📄 CARGAR EL CRONOGRAMA DESDE EL PDF DE LAS BASES

   Se sube el PDF, se ve lo que se entendió, se marca qué entra y recién ahí se
   guarda. Los tres pasos en la misma caja, sin salir del cronograma.

   ── POR QUÉ HAY UN PASO DE CONFIRMAR Y NO SE CARGA DIRECTO ──
   Las bases traen un bloque por MODALIDAD —Desarrollo, Producción Nacional,
   Regiones— y cada uno repite las mismas cuatro filas con fechas DISTINTAS.
   Una convocatoria de aquí es UNA modalidad, así que cargar la tabla entera
   deja tres «Declaración de beneficiarios» contradictorias y ninguna
   señalable como la sobrante. La pantalla propone la que casa con el nombre de
   la convocatoria y la persona confirma: acertar solo no es el objetivo — el
   objetivo es que nadie cargue las fechas de otra modalidad sin enterarse.

   ── Y SE ENSEÑA EL TEXTO ORIGINAL ──
   Cada fila lleva al lado cómo estaba escrita la fecha en el PDF («Hasta el 30
   de abril de 2026»). Es lo que permite cazar un error del lector: una fecha
   sola no se puede comprobar contra nada, y puesta junto a su frase original,
   sí — sin abrir el PDF al lado.
   ══════════════════════════════════════════════════════════════════════════ */

export default function CargarBasesCrono({ convocatoriaId, nombre, onCerrar }: {
  convocatoriaId: string;
  /** El nombre de la convocatoria: con él se propone qué bloque es el suyo. */
  nombre: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [bloques, setBloques] = useState<BloqueBases[] | null>(null);
  const [sinLeer, setSinLeer] = useState<string[]>([]);
  /* Qué bloques entran. El común va marcado siempre —sus fechas son del
     concurso entero— y de los demás se propone el que casa con el nombre. */
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  /* Filas descartadas una a una, por índice «bloque:fila». Una tabla puede
     traer una fila que aquí no interesa —«Fecha límite de excepciones»— y
     obligar a borrarla después del cronograma es hacer trabajo para deshacerlo. */
  const [fuera, setFuera] = useState<Set<string>>(new Set());

  async function subir(f: File) {
    setLeyendo(true); setErr(""); setBloques(null);
    const fd = new FormData();
    fd.append("pdf", f);
    const r: any = await leerBasesDePdf(fd);
    setLeyendo(false);
    if (r?.error) { setErr(r.error); return; }
    const bs: BloqueBases[] = r.bloques;
    setBloques(bs); setSinLeer(r.sinLeer || []); setFuera(new Set());
    const m = new Set<number>();
    bs.forEach((b, i) => { if (esComun(b)) m.add(i); });
    const casa = bloqueQueCasa(bs, nombre);
    if (casa >= 0) m.add(casa);
    setMarcados(m);
  }

  const alterna = (i: number) =>
    setMarcados(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const alternaFila = (k: string) =>
    setFuera(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const elegidas = (bloques || []).flatMap((b, i) =>
    marcados.has(i)
      ? b.filas.map((f, j) => ({ k: `${i}:${j}`, f })).filter(x => !fuera.has(x.k))
      : []);

  async function guardar() {
    if (!elegidas.length) return;
    setGuardando(true); setErr("");
    const r: any = await cargarCronogramaDeBases(convocatoriaId,
      elegidas.map(x => ({ nombre: x.f.nombre, ini: x.f.fecha.inicio, fin: x.f.fecha.fin })));
    setGuardando(false);
    if (r?.error) { setErr(r.error); return; }
    onCerrar();
    router.refresh();
  }

  return (
    <div className="cb-caja">
      <div className="cb-cab">
        <b>📄 Cargar el cronograma desde las bases</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="dato-btn" onClick={onCerrar}>✕ cerrar</button>
      </div>

      {!bloques && (
        <>
          <div className="cb-ayuda">
            Sube el PDF de las bases del concurso. Se lee la tabla «Cronograma del
            concurso» y se te enseña antes de guardar nada.
          </div>
          <SubirPdf leyendo={leyendo} etiqueta="📎 o elígelo" onArchivo={subir}
            ayuda="Las bases completas del concurso, tal como las publica DAFO." />
        </>
      )}

      {err && <div className="err-inline" style={{ marginTop: 9 }}>⚠ {err}</div>}

      {bloques && (
        <>
          {/* ⚠ Lo que NO se supo leer, dicho y arriba. Sin esto, un cambio de
              formato de DAFO se vería como un cronograma más corto —y nadie
              revisa lo que no sabe que falta—. Con la línea en crudo delante,
              se ve al momento si lo que falta importa. */}
          {sinLeer.length > 0 && (
            <div className="cb-aviso">
              ⚠ {sinLeer.length} línea(s) de la tabla no se pudieron leer. Revísalas
              en el PDF y, si hacen falta, añádelas a mano:
              <ul>{sinLeer.slice(0, 6).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}

          <div className="cb-ayuda">
            Marca el bloque de <b>esta</b> convocatoria. El común va siempre; de las
            modalidades, entra solo la suya — las otras traen las mismas filas con
            fechas distintas.
          </div>

          {bloques.map((b, i) => (
            <div key={i} className={`cb-bloque${marcados.has(i) ? " on" : ""}`}>
              <label className="cb-bloque-h">
                <input type="checkbox" checked={marcados.has(i)} onChange={() => alterna(i)} />
                <b>{esComun(b) ? "📋 " : "📦 "}{b.titulo}</b>
                {b.padre && <span className="cb-padre">dentro de {b.padre}</span>}
                <span style={{ flex: 1 }} />
                <span className="cb-n">{b.filas.length} fecha(s)</span>
              </label>
              {marcados.has(i) && (
                <div className="cb-filas">
                  {b.filas.map((f, j) => {
                    const k = `${i}:${j}`;
                    const off = fuera.has(k);
                    return (
                      <label key={j} className={`cb-fila${off ? " off" : ""}`}>
                        <input type="checkbox" checked={!off} onChange={() => alternaFila(k)} />
                        <span className="cb-fnom">{f.nombre}</span>
                        <span className="cb-fecha">
                          {f.fecha.inicio}{f.fecha.fin ? ` → ${f.fecha.fin}` : ""}
                        </span>
                        {/* Cómo lo decía el PDF: es con lo que se comprueba que
                            la fecha de la izquierda es la que toca. */}
                        <span className="cb-orig">«{f.fecha.txt}»</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="cb-pie">
            <button type="button" className="btn" disabled={guardando || !elegidas.length}
              onClick={guardar}>
              {guardando ? "Guardando…" : `Cargar ${elegidas.length} fecha(s) al cronograma`}
            </button>
            <span className="cb-ayuda" style={{ margin: 0 }}>
              Entran como hitos del concurso, no como tareas: son fechas del
              Ministerio y lo que generan es un aviso con cuenta atrás.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
