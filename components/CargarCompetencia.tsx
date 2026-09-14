"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { leerCompetenciaDeDafo, cargarCompetencia } from "@/app/actions";
import SubirPdf from "@/components/SubirPdf";
import {
  ETAPA_TXT, TXT_PEGADO, chocaCon, modalidadQueCasa,
  type FilaRes, type CabeceraRes,
} from "@/lib/resolucionDafo";

/* ══════════════════════════════════════════════════════════════════════════
   🏁 CARGAR LA COMPETENCIA DESDE UNA LISTA DE DAFO

   Se sube el PDF, se ve lo que se entendió, se arregla lo que haga falta y
   recién ahí se guarda. Los tres pasos en la misma caja, como en el cronograma
   de las bases.

   ── POR QUÉ ESTA PANTALLA NO ES OPCIONAL ──
   El cronograma se confirma para elegir la modalidad; aquí se confirma por algo
   más básico: estas tablas vienen de un PDF sin columnas y el lector, aunque
   acierta la empresa y el RUC en las 476 filas de los doce documentos de
   prueba, en cuarenta avisa de que algo no pudo asegurar. Son cuarenta de 476:
   pocas para desconfiar de todo y demasiadas para no mirarlas.

   ── Y POR ESO SOLO SE PUEDE EDITAR LO QUE TIENE AVISO ──
   Doscientas filas con dos campos de texto cada una son cuatrocientas cajas
   donde no hay nada que hacer, y esconden las diez que sí. Lo que se leyó
   entero se enseña como texto; lo dudoso, y solo lo dudoso, se puede escribir.
   El aviso dice qué pasa y la fila cruda —debajo, en gris— dice qué decía el
   PDF, que es con lo que se corrige sin abrirlo al lado.

   ── LOS NOMBRES DE LAS PERSONAS NO SE GUARDAN ──
   Donde el documento traía columna de categoría, el título salió limpio. Donde
   no, viene con los responsables pegados detrás y el aviso pide recortarlos:
   lo que se recorta aquí es lo que no llega a la base (ver `db/competencia.sql`).
   ══════════════════════════════════════════════════════════════════════════ */

type FilaEd = FilaRes & { on: boolean; i: number };

export default function CargarCompetencia({ convocatoriaId, nombre, anio, onCerrar }: {
  convocatoriaId: string;
  /** El nombre de la convocatoria, para avisar si el PDF es de otra. */
  nombre: string;
  /** Y su año, para lo mismo: ver `otroAnio`. */
  anio: number | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [cab, setCab] = useState<CabeceraRes | null>(null);
  const [filas, setFilas] = useState<FilaEd[]>([]);
  const [sinLeer, setSinLeer] = useState<string[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  /* Si se pudo leer la tabla por columnas o hubo que reconstruirla del texto:
     cambia lo que se puede prometer de lo leído, así que se dice. */
  const [porColumnas, setPorColumnas] = useState(false);
  const [soloAvisos, setSoloAvisos] = useState(false);
  const [archivo, setArchivo] = useState("");
  /* Qué modalidades del documento entran. */
  const [mods, setMods] = useState<Set<string>>(new Set());

  async function subir(f: File) {
    setLeyendo(true); setErr(""); setCab(null); setFilas([]);
    const fd = new FormData();
    fd.append("pdf", f);
    const r: any = await leerCompetenciaDeDafo(fd);
    setLeyendo(false);
    if (r?.error) { setErr(r.error); return; }
    setCab(r.cabecera);
    setArchivo(f.name);
    setSinLeer(r.sinLeer || []);
    setNotas(r.notas || []);
    setPorColumnas(!!r.porColumnas);
    const fs = r.filas as FilaRes[];
    /* ── UN PDF, VARIAS MODALIDADES ──
       La relación de recibidas trae las dos tablas del concurso —«DESARROLLO DE
       LARGOMETRAJES» y «PRODUCCIÓN DE LARGOMETRAJES»— una detrás de otra, y una
       convocatoria de aquí es UNA de las dos. Se marca sola la que casa con su
       nombre y las demás quedan a la vista pero sin marcar: es el mismo trato
       que da el cargador de las bases a los bloques de modalidad, y por el
       mismo motivo — cargarlas todas metería aquí 30 competidores de otro
       concurso sin que nada volviera a avisar. */
    const ms = [...new Set(fs.map(x => x.modalidad || ""))];
    const casa = ms.length > 1 ? modalidadQueCasa(ms, nombre) : 0;
    const elegidas = new Set(casa >= 0 ? [ms[casa]] : []);
    setMods(elegidas);
    setFilas(fs.map((x, i) => ({ ...x, on: elegidas.has(x.modalidad || ""), i })));
  }

  /* Al tocar el título se da por recortado: es lo que pedía el aviso de
     documento, y así lo que se guarda no dice «lleva nombres pegados» de algo
     que la persona acaba de limpiar. */
  const edita = (i: number, campo: "empresa" | "titulo", v: string) =>
    setFilas(fs => fs.map(f => (f.i === i
      ? { ...f, [campo]: v, ...(campo === "titulo" ? { pegado: false } : {}) }
      : f)));
  const alterna = (i: number) =>
    setFilas(fs => fs.map(f => (f.i === i ? { ...f, on: !f.on } : f)));

  /* Solo lo que es de UNA fila. El «lleva los nombres pegados» le pasa a todas
     las del documento y sale arriba: contarlo aquí daría «7 por revisar» de 7 y
     escondería las dos que de verdad hay que mirar. */
  const modalidades = useMemo(
    () => [...new Set(filas.map(f => f.modalidad || ""))], [filas]);
  const alternaMod = (m: string) => {
    const n = new Set(mods);
    n.has(m) ? n.delete(m) : n.add(m);
    setMods(n);
    setFilas(fs => fs.map(f => ({ ...f, on: n.has(f.modalidad || "") })));
  };

  const conAviso = filas.filter(f => f.avisos.length).length;
  const conPegado = filas.filter(f => f.pegado).length;
  const marcadas = filas.filter(f => f.on);
  const vista = soloAvisos ? filas.filter(f => f.avisos.length) : filas;
  /* Se puede escribir donde hay algo que arreglar: un aviso de fila, o el
     título con los nombres detrás. */
  const editable = (f: FilaEd) => f.avisos.length > 0 || f.pegado;

  /* ⚠ ¿Es esta la convocatoria del PDF? No se puede impedir —una convocatoria
     de aquí puede llamarse de otra manera que en la resolución— pero sí se
     puede decir: cargar las aptas de documental dentro del concurso de ficción
     no da ningún error y deja la competencia mintiendo para siempre. */
  /* Se comparan las DOS palabras que distinguen un concurso de otro, y la
     segunda es la que importa de verdad: el tipo casa casi siempre —«documental»
     está en el nombre de las dos convocatorias de documental— y lo que se cuela
     es la MODALIDAD. Cargar los finalistas de Desarrollo dentro de la
     convocatoria de Producción no da ningún error, y deja la competencia
     mintiendo para siempre.
     Se avisa solo cuando el nombre de la convocatoria dice explícitamente OTRA
     cosa: si no menciona la modalidad, no hay contradicción que señalar. */
  /* ⚠ El choque se mide contra las modalidades que trae el documento DE VERDAD,
     no contra la de su cabecera: en una relación con dos tablas la cabecera es
     la de la primera, y avisar con ella daría un rojo falso —«producción contra
     desarrollo»— en un PDF que sí trae la modalidad buena, solo que en su
     segunda mitad. Hay contradicción cuando NINGUNA de las que trae casa. */
  const choca = useMemo(() => {
    if (!cab || !filas.length) return "";
    const dichos = [...new Set(filas.map(f => `${cab.concurso || ""} ${f.modalidad || ""}`))];
    const choques = dichos.map(d => chocaCon(d, nombre));
    return choques.every(Boolean) ? choques[0] : "";
  }, [cab, filas, nombre]);

  /* ── ⚠ Y EL AÑO, QUE ES EL QUE DE VERDAD SE EQUIVOCA ──
     La alarma de arriba compara EJES —documental contra ficción, desarrollo
     contra producción— y salta si subes el PDF de otro concurso. Pero el error
     que va a pasar de verdad no es ese: es subir las aptas de 2024 a la ficha
     de 2025. Mismo concurso, misma modalidad, todo casa; los PDF se llaman casi
     igual y se cargan doce seguidos. Y no se nota NUNCA: las filas entran bien,
     solo que en el año de al lado, y a partir de ahí la matriz dice que una
     empresa se presentó dos veces cuando fue una, o que un año tuvo el doble de
     cola. Deshacerlo son doscientas filas de una en una.
     El documento dice su año en la primera línea y la convocatoria tiene el
     suyo: contrastarlos es gratis. */
  const otroAnio = !!(cab?.anio && anio && cab.anio !== anio);

  async function guardar() {
    if (!marcadas.length || !cab) return;
    setGuardando(true); setErr("");
    const r: any = await cargarCompetencia(convocatoriaId,
      marcadas.map(f => ({
        empresa: f.empresa, ruc: f.ruc, region: f.region, titulo: f.titulo,
        categoria: f.categoria, modalidad: f.modalidad, monto: f.monto, personas: f.personas,
        /* Si se guarda con los nombres todavía pegados, la fila lo dice: en la
           pestaña es lo único que impide leer ese título como un dato limpio. */
        avisos: f.pegado ? [...f.avisos, "el proyecto lleva pegados los nombres de sus responsables"] : f.avisos,
        crudo: f.crudo, etapa: f.etapa, n: f.n,
      })),
      archivo || `${cab.concurso || "DAFO"} · ${cab.etapa}`);
    setGuardando(false);
    if (r?.error) { setErr(r.error); return; }
    onCerrar();
    router.refresh();
  }

  return (
    <div className="cb-caja">
      <div className="cb-cab">
        <b>🏁 Cargar la competencia desde una lista de DAFO</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="dato-btn" onClick={onCerrar}>✕ cerrar</button>
      </div>

      {!cab && (
        <>
          <div className="cb-ayuda">
            Sube uno de los PDF que publica DAFO: la <b>relación de recibidas</b>, la
            resolución de <b>aptas</b>, la de <b>finalistas</b> o el <b>fallo</b> de
            beneficiarias. Se lee la tabla y se te enseña antes de guardar nada.
            Puedes subir los cuatro, uno tras otro: cada empresa avanza de etapa en
            vez de repetirse.
          </div>
          <SubirPdf leyendo={leyendo} etiqueta="📎 o elígelo" onArchivo={subir}
            ayuda="Vale cualquiera de las cuatro listas del concurso." />
        </>
      )}

      {err && <div className="err-inline" style={{ marginTop: 9 }}>⚠ {err}</div>}

      {cab && (
        <>
          {/* Qué documento se leyó, dicho por el documento y no por el nombre
              del archivo: es lo que decide en qué etapa entra cada empresa. */}
          <div className="riv-cab">
            <b>{ETAPA_TXT[cab.etapa!]}</b>
            <div className="riv-cab-sub">
              {[cab.concurso, cab.anio, cab.modalidad, cab.categoria].filter(Boolean).join(" · ")}
            </div>
          </div>

          {choca && (
            /* Rojo y no amarillo: los demás avisos son «mira esto», este es «no
               guardes esto». Es el único error de esta pantalla que no se nota
               nunca —las filas entran bien, solo que en el concurso de al lado—. */
            <div className="err-inline">
              ⚠ Esta convocatoria se llama «{nombre}» y el PDF dice ser de «
              {[cab.concurso, cab.modalidad].filter(Boolean).join(" · ")}». No coinciden
              en <b>{choca.split(" / ")[0]}</b> contra <b>{choca.split(" / ")[1]}</b>.
              Si son concursos distintos, cierra sin guardar: estas filas se quedarían
              dentro de la convocatoria equivocada y nada volvería a avisar.
            </div>
          )}

          {otroAnio && (
            <div className="err-inline">
              ⚠ Esta convocatoria es de <b>{anio}</b> y el PDF dice ser de <b>{cab!.anio}</b>.
              Si te equivocaste de archivo, cierra sin guardar: las filas entrarían en el
              año equivocado y ahí ya nada vuelve a avisar — la matriz contaría un intento
              que no existió y a este concurso le faltaría el suyo.
            </div>
          )}

          {conPegado > 0 && <div className="cb-aviso">⚠ {TXT_PEGADO}</div>}

          {/* Por qué esta pantalla enseña unas veces títulos limpios y otras
              con los nombres detrás: son dos formas de leer el mismo PDF, y la
              buena depende de cómo esté maquetado. Decirlo evita que parezca
              que el lector va y viene sin motivo. */}
          <div className="cb-ayuda" style={{ marginTop: -2 }}>
            {porColumnas
              ? "✓ La tabla se leyó por columnas: empresa, proyecto y director vienen cada uno de la suya."
              : "Este PDF no traía una tabla que se pudiera leer por columnas, así que se reconstruyó del texto: mira las filas marcadas."}
          </div>

          {/* Lo que el propio documento delata: su numeración diciendo que
              tenía más filas de las que salieron. Va arriba del todo porque es
              lo único que avisa de unas filas fundidas dentro de otra — que en
              la lista se ven como una fila larga y nada más. */}
          {notas.map((n, i) => <div key={i} className="cb-aviso">⚠ {n}</div>)}

          {sinLeer.length > 0 && (
            <div className="cb-aviso">
              ⚠ {sinLeer.length} trozo(s) de la tabla no se pudieron leer como fila.
              Si hacen falta, añádelos a mano después:
              <ul>{sinLeer.slice(0, 5).map((l, i) => <li key={i}>{l.slice(0, 180)}</li>)}</ul>
            </div>
          )}

          {modalidades.length > 1 && (
            <div className="filt-grupo">
              <span className="filt-tit">Modalidad · marca la de esta convocatoria</span>
              <div className="filt-tira">
                {modalidades.map(m => (
                  <button key={m} type="button" className={`vtab${mods.has(m) ? " on" : ""}`}
                    onClick={() => alternaMod(m)} title={m || "sin modalidad"}>
                    {(m || "sin modalidad").length > 42 ? `${m.slice(0, 40)}…` : (m || "sin modalidad")}
                    {" · "}{filas.filter(f => (f.modalidad || "") === m).length}
                  </button>
                ))}
              </div>
            </div>
          )}

          {modalidades.length > 1 && mods.size === 0 && (
            <div className="cb-aviso">
              ⚠ Este PDF trae {modalidades.length} modalidades y ninguna casa con el
              nombre de esta convocatoria. Marca arriba la que le corresponde: las
              otras son de otro concurso y no deberían entrar aquí.
            </div>
          )}

          <div className="riv-barra">
            <span><b>{marcadas.length}</b> de {filas.length} filas</span>
            {conAviso > 0 && (
              <button type="button" className={`vtab${soloAvisos ? " on" : ""}`}
                onClick={() => setSoloAvisos(v => !v)}>
                ⚠ {conAviso} por revisar
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="dato-btn"
              onClick={() => setFilas(fs => fs.map(f => ({ ...f, on: true })))}>marcar todas</button>
            <button type="button" className="dato-btn"
              onClick={() => setFilas(fs => fs.map(f => ({ ...f, on: false })))}>ninguna</button>
          </div>

          <div className="riv-filas">
            {vista.map(f => (
              <div key={f.i} className={`riv-fila${f.on ? "" : " off"}${f.avisos.length ? " rev" : ""}`}>
                <input type="checkbox" checked={f.on} onChange={() => alterna(f.i)} />
                <div className="riv-datos">
                  <div className="riv-l1">
                    {/* Solo se escribe donde hay algo que arreglar. Lo demás es
                        texto: cuatrocientas cajas vacías esconden las diez. */}
                    {editable(f)
                      ? <input className="riv-in" value={f.empresa}
                          onChange={e => edita(f.i, "empresa", e.target.value)} />
                      : <b>{f.empresa}</b>}
                    {f.ruc && <span className="kit-pz-folio">{f.ruc}</span>}
                    {f.region && <span className="badge riv-reg">{f.region}</span>}
                    {f.categoria && <span className="badge riv-cat">{f.categoria}</span>}
                    {f.monto != null && (
                      <span className="riv-monto">S/ {f.monto.toLocaleString("es-PE")}</span>
                    )}
                  </div>
                  {(f.titulo || editable(f)) && (
                    editable(f)
                      ? <input className="riv-in riv-in-tit" value={f.titulo} placeholder="título del proyecto"
                          onChange={e => edita(f.i, "titulo", e.target.value)} />
                      : <div className="riv-tit">{f.titulo}</div>
                  )}
                  {/* Quien dirige: el tercer nombre de la matriz. Se enseña
                      aquí para poder comprobarlo antes de guardarlo. */}
                  {f.personas && <div className="riv-dir">🎬 {f.personas}</div>}
                  {f.avisos.map((a, k) => <div key={k} className="riv-aviso">⚠ {a}</div>)}
                  {/* Lo que decía el PDF, para corregir sin abrirlo al lado. */}
                  {editable(f) && <div className="riv-crudo">«{f.crudo}»</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="cb-pie">
            <button type="button" className="btn" disabled={guardando || !marcadas.length}
              onClick={guardar}>
              {guardando ? "Guardando…" : `Cargar ${marcadas.length} competidor(es)`}
            </button>
            <span className="cb-ayuda" style={{ margin: 0 }}>
              No se dan de alta como empresas ni proyectos del sistema: es lo que
              dijo un documento público, atado a esta convocatoria.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
