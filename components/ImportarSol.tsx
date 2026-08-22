"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarDeclaracionesSol } from "@/app/actions";
import { textoDePdfs } from "@/lib/leerPdf";

/* ── PEGAR EL REPORTE DE SUNAT ──
 *
 * SOL deja descargar «Relación de constancia de pagos» en PDF. Se abre, se
 * selecciona todo, se pega aquí, y los periodos quedan marcados con su fecha
 * real de presentación y su número de orden.
 *
 * ── POR QUÉ UN PEGADO Y NO UN ROBOT ──
 * Automatizar el login de SOL exigiría guardar la Clave SOL en algún sitio
 * desde donde un proceso la pueda usar. Eso es poner la credencial fiscal de
 * la asociación en juego para ahorrar un pegado cada varios meses. El reporte
 * se saca en treinta segundos y esto lo lee en uno.
 *
 * ── EL ARCHIVO ANTES QUE EL PEGADO ──
 * Se empezó pidiendo texto pegado. Con las constancias de pagos vale; con el
 * detalle de casillas NO, porque esos PDF llevan las etiquetas y los importes
 * escritos en pasadas distintas y al copiarlos los códigos se separan de sus
 * cifras. No es cosa del visor —se miró el flujo interno del archivo—, así que
 * no hay ningún visor con el que salga bien. Por eso lo primero que ofrece esta
 * pantalla es soltar el PDF: `lib/leerPdf.ts` lo lee ordenando por coordenadas
 * y reconstruye las líneas. El cuadro de texto sigue ahí para quien ya tenga
 * algo copiado, y para poder ver qué se leyó antes de importar.
 *
 * ── NO CREA NADA ──
 * Solo marca periodos que ya existen. Si el reporte trae meses que el sistema
 * no tiene, se DICEN al terminar en vez de crearse: desde cuándo declara una
 * empresa es una decisión de quien la lleva (`obligacion.desde`), no algo que
 * defina un pegado.
 */
export default function ImportarSol({ empresaId, nombre }: {
  empresaId: string;
  nombre: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [pisar, setPisar] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<any>(null);
  const [ocupado, startTransition] = useTransition();
  const [leyendo, setLeyendo] = useState(false);
  const [leidos, setLeidos] = useState<string[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  /* Los PDF se leen AQUÍ, en el navegador: no se suben a ningún sitio. Son
     constancias tributarias de la asociación y para lo que necesitamos —cuatro
     casillas— no hay motivo para que salgan del ordenador. */
  const tomarArchivos = async (fs: FileList | null) => {
    const lista = [...(fs || [])].filter(f => /\.pdf$/i.test(f.name));
    if (!lista.length) return;
    setErr(""); setRes(null); setLeyendo(true);
    try {
      const { texto: t, ilegibles } = await textoDePdfs(
        await Promise.all(lista.map(async f => ({ nombre: f.name, datos: await f.arrayBuffer() }))),
      );
      // Se AÑADE, no se pisa: así se pueden soltar los reportes por tandas.
      if (t) setTexto(p => (p.trim() ? p + "\n" : "") + t);
      setLeidos(p => [...p, ...lista.filter(f => !ilegibles.includes(f.name)).map(f => f.name)]);
      if (ilegibles.length) {
        setErr(`No pude sacar texto de: ${ilegibles.join(", ")}. Si es un PDF escaneado —una foto, no texto— este lector no puede con él.`);
      }
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = "";   // permite repetir el mismo archivo
    }
  };

  const importar = () => {
    setErr(""); setRes(null);
    startTransition(async () => {
      const r: any = await importarDeclaracionesSol(empresaId, texto, pisar);
      if (r?.error) { setErr(r.error); return; }
      setRes(r);
      router.refresh();
    });
  };

  const cerrar = () => {
    setAbierto(false); setTexto(""); setErr(""); setRes(null); setLeidos([]);
  };

  return (
    <>
      <button className="vtab" onClick={() => setAbierto(true)}
        title="Pegar un reporte de SOL — constancias de pagos o detalle de casillas — para marcar de golpe lo declarado y sus cifras">
        📥 Importar de SUNAT
      </button>

      {abierto && (
        <div className="modal-fondo" onClick={cerrar}>
          <div className="modal-caja" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
            <div className="modal-cab">
              <b>📥 Importar declaraciones · {nombre}</b>
              <button className="modal-x" onClick={cerrar}>✕</button>
            </div>

            {/* ── LOS DOS REPORTES, DICHOS AQUÍ ──
                El botón leía los dos desde el principio pero estas
                instrucciones solo nombraban uno, así que nadie iba a pegar el
                otro. Una función que existe y no se cuenta es una función que
                no existe. */}
            <ol className="imp-pasos">
              <li>
                <b>Relación de constancia de pagos</b> — dice qué periodos se
                presentaron y cuándo. Se saca por rango, así que con dos o tres
                descargas cubres varios años.
              </li>
              <li>
                <b>Detalle de casillas</b> de una declaración — dice qué cifras
                se pusieron. Es la que permite ver si quedó crédito fiscal sin
                usar. Va una por periodo.
              </li>
              <li>
                {/* La jurada anual no se descarga como listado: se descarga
                    entera. Sin decirlo aquí, ese PDF se soltaba y el
                    importador contestaba «no encontré ninguna declaración»
                    sobre el documento oficial de la declaración. */}
                <b>La declaración entera</b>, tal como la descargas (el
                formulario 710 de renta anual, por ejemplo). De ahí salen la
                fecha y el número de orden. Es lo normal para las anuales, que
                no aparecen en el listado mensual.
              </li>
              <li>
                Descarga los PDF de SOL y <b>suéltalos aquí</b> — varios a la
                vez, de los tres tipos mezclados, da igual. No se suben a ningún
                sitio: se leen en tu navegador.
              </li>
            </ol>

            {/* ── SOLTAR EL ARCHIVO, NO PEGAR EL TEXTO ──
                El detalle de casillas NO se puede copiar bien de ningún visor:
                el PDF lleva dentro las etiquetas y los importes en pasadas
                distintas. Leer el archivo es la única vía que reconstruye los
                pares casilla → importe, así que es la que se ofrece primero. */}
            <div className={"imp-soltar" + (leyendo ? " leyendo" : "")}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); tomarArchivos(e.dataTransfer.files); }}
              onClick={() => entrada.current?.click()}>
              <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple
                style={{ display: "none" }}
                onChange={e => tomarArchivos(e.target.files)} />
              {leyendo
                ? <>Leyendo los PDF…</>
                : <>📄 <b>Suelta aquí los PDF de SOL</b> o haz clic para elegirlos</>}
            </div>

            {leidos.length > 0 && (
              <div className="imp-leidos">
                ✓ leídos: {leidos.join(", ")}
                <span style={{ color: "var(--dim)" }}> — revisa abajo y dale a Importar</span>
              </div>
            )}

            <textarea className="imp-texto" value={texto} onChange={e => setTexto(e.target.value)}
              placeholder={"…o pega aquí el texto del reporte, si ya lo tienes copiado.\n\nREPORTE\nRELACIÓN DE CONSTANCIA DE PAGOS\nRUC : 20612545058\n1 09/2024 0621 PDT IGV-RENTA MENSUAL-IEV 1133606408 19/05/2025 S/ 0"}
              rows={8} />

            {/* ── LO ESCRITO A MANO NO SE PISA POR DEFECTO ──
                Quien marcó un periodo a mano pudo saber algo que el reporte no
                dice. Pisarlo sin preguntar convertiría una importación en una
                pérdida de datos silenciosa. */}
            <label className="tv-chk" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={pisar} onChange={e => setPisar(e.target.checked)} />
              Corregir también los que ya estaban marcados
              <span style={{ color: "var(--dim)" }}>
                — usa la fecha de SUNAT en lugar de la que se puso a mano
              </span>
            </label>

            {err && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {err}</div>}

            {res && (
              <div className="imp-res">
                {/* ── LOS DOS REPORTES SE CUENTAN POR SEPARADO ──
                    Este panel nació contando solo presentaciones, y cuando el
                    importador aprendió a leer también el detalle de casillas se
                    quedó igual: pegar un detalle contestaba «0 periodos
                    marcados» —que se lee como «no hizo nada»— mientras las
                    cifras entraban perfectamente. Un resultado que no menciona
                    la mitad de lo que hizo es peor que un error.
                    Cada línea se pinta solo si hubo algo de eso, y si no hubo
                    nada de nada se dice; el cero mudo era el problema. */}
                {res.marcados > 0 && (
                  <div><b style={{ color: "var(--green)" }}>✅ {res.marcados}</b> periodo(s) marcados como declarados</div>
                )}
                {res.conCasillas > 0 && (
                  <div>
                    <b style={{ color: "var(--green)" }}>✅ {res.conCasillas}</b> declaración(es) con sus cifras
                    <span style={{ color: "var(--dim)" }}> — ya se puede comparar lo declarado con lo que dicen las facturas</span>
                  </div>
                )}
                {!res.marcados && !res.conCasillas && (
                  <div style={{ color: "var(--yellow)" }}>
                    Se leyó el reporte pero no se actualizó nada. Mira los avisos de abajo.
                  </div>
                )}
                {res.yaEstaban > 0 && (
                  <div style={{ color: "var(--dim)" }}>
                    {res.yaEstaban} ya estaban marcados y no se tocaron
                    {!pisar && " — marca la casilla de arriba si quieres corregirlos"}
                  </div>
                )}
                {/* ── LO QUE NO ENCAJÓ SE DICE, CON NOMBRES ──
                    «Importadas 12» cuando el reporte traía 18 es la clase de
                    resultado que se cree y deja seis meses fuera sin que nadie
                    se entere. */}
                {res.sinPeriodo > 0 && (
                  <div style={{ color: "var(--yellow)" }}>
                    ⚠ {res.sinPeriodo} del reporte no existen en el sistema
                    {res.faltantes?.length ? ` (${res.faltantes.join(", ")})` : ""} —
                    son anteriores a la fecha de «Sigue desde». Ajústala y vuelve a generar
                    periodos si los quieres.
                  </div>
                )}
                {res.sinObligacion > 0 && (
                  <div style={{ color: "var(--yellow)" }}>
                    ⚠ {res.sinObligacion} son de una obligación que esta empresa no tiene registrada.
                  </div>
                )}
                {res.ignoradas > 0 && (
                  <div style={{ color: "var(--red)" }}>
                    ⚠ {res.ignoradas} línea(s) parecían una declaración y no se pudieron leer.
                    Avísame y miro el formato.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 7, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={cerrar}>
                {res ? "Cerrar" : "Cancelar"}
              </button>
              <button className="btn" disabled={ocupado || !texto.trim()} onClick={importar}>
                {ocupado ? "…" : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
