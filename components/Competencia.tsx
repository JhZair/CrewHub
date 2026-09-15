"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import CargarCompetencia from "@/components/CargarCompetencia";
import { borrarCompetencia } from "@/app/actions";
import { casaConsulta } from "@/lib/sitios";
import { ETAPAS, ORDEN, icoEtapa, txtEtapa, nrm, nucleo, casanNombres, type Historial } from "@/lib/rivales";
import { canoniza, claveTexto } from "@/lib/concursos";
import ChipPop from "@/components/ChipPop";
import HiloRendicion, { idFila } from "@/components/HiloRendicion";
import Reacciones, { type Reaccion } from "@/components/Reacciones";

/* ══════════════════════════════════════════════════════════════════════════
   🏁 CON QUIÉN COMPETIMOS EN ESTA CONVOCATORIA

   El sistema sabía a qué nos presentamos y cómo nos fue, pero no contra quién.
   Y sin eso un resultado no se puede leer: «apta pero no finalista» no dice lo
   mismo si de veinte aptas pasaron nueve que si pasaron dos, ni si las nueve
   eran todas de Lima estando nosotros en regiones.

   ── LA PREGUNTA QUE CONTESTA CADA PARTE ──
    · El embudo de arriba: cuántas empezaron y cuántas quedan. Es el mismo
      lenguaje que el embudo de nuestras postulaciones, a propósito.
    · Los filtros: «¿y en MI categoría?» — que es la competencia de verdad, no
      el total. Un concurso de 53 aptas donde 33 son ópera prima y nosotros
      estamos en segunda obra son veinte rivales, no 53.
    · Nuestra fila, marcada: se ve en qué parte de la lista estamos sin buscar.

   ── LO QUE NO ES ──
   No es un directorio de empresas ni sustituye a nadie del sistema: es lo que
   dijeron unos documentos públicos, guardado tal cual y borrable de una en una.
   El porqué está en `db/competencia.sql`.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaComp = {
  id: string;
  empresa: string;
  ruc: string | null;
  region: string | null;
  etapa: string;
  categoria: string | null;
  modalidad: string | null;
  titulo: string | null;
  personas: string | null;
  monto: number | string | null;
  avisos: string[] | null;
  crudo: string | null;
  fuente: string | null;
};

/* Quién es quién —etapas, núcleos de nombre, cómo se casan— vive en
   `lib/rivales.ts`: lo comparten esta pestaña y la matriz de /rivales, y la
   respuesta a «¿son el mismo competidor?» tiene que ser LA MISMA en las dos o
   una pantalla contradice a la otra. */

export default function Competencia({ convocatoriaId, nombre, anio, filas, rucsPropios, empresasPropias, proyectosPropios, historial, cruce, hilos }: {
  convocatoriaId: string;
  nombre: string;
  /** El año del concurso: se lo pasa al cargador para que avise si el PDF es
   *  de otra edición, que es el error que no se nota. */
  anio: number | null;
  filas: FilaComp[];
  /** Los RUC de las empresas con las que postulamos a ESTA convocatoria: es lo
   *  que permite señalar nuestra fila dentro de la lista de rivales. */
  rucsPropios: string[];
  /** Y sus nombres —el corto y la razón social—, para las listas de recibidas,
   *  que son las únicas que DAFO publica sin RUC. */
  empresasPropias: string[];
  /** Los títulos de los proyectos con los que postulamos a esta convocatoria:
   *  el segundo camino para reconocernos cuando el nombre no casa. */
  proyectosPropios: string[];
  /** Qué ha hecho cada uno de estos rivales en los OTROS concursos, por id de
   *  fila. Trae una entrada por cada fila, se haya presentado una vez o cinco:
   *  «1ª vez» es un dato tan bueno como «3ª vez» y callarlo se leía como si lo
   *  fuera igual. */
  historial: Record<string, Historial>;
  /** Contra cuántas ediciones cargadas se cruzó ese historial, y de qué años.
   *  Es lo que convierte «1ª vez» en una frase comprobable: sin esto, nadie
   *  sabe si el cruce mira seis años o solo este. */
  cruce: { ediciones: number; desde: number | null; hasta: number | null } | null;
  /* ── ⚠ LO QUE HEMOS AVERIGUADO NOSOTROS, QUE NO ES LO QUE DICE EL PDF ──
     La lista de arriba es el documento del Ministerio y se guarda tal cual.
     Pero investigar a un rival —que el proyecto ya tiene teaser, que el
     director es el mismo de tal documental, dónde se estrenó— produce algo que
     hoy se queda en la cabeza de quien lo buscó y se pierde; dentro de dos
     años, cuando esa empresa vuelva a salir en otra edición, es justo lo que
     hará falta y se investiga otra vez desde cero.
     Va en `comentarios`, con autor y fecha, en el hilo de SU fila: nunca
     mezclado con lo que resolvió DAFO, y sin convertir al rival en una empresa
     del sistema. */
  hilos?: {
    conteo: Record<string, number>;
    reacciones: Record<string, Reaccion[]>;
    userId: string;
    /** El SQL que falta, si falta. Se dice en pantalla: unos botones que no
     *  guardan nada y no explican por qué enseñan a desconfiar de todo. */
    error?: string | null;
  } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fEtapa, setFEtapa] = useState("");
  const [fCat, setFCat] = useState("");
  const [fReg, setFReg] = useState("");
  const [fMod, setFMod] = useState("");
  const [borrando, setBorrando] = useState("");
  const [busca, setBusca] = useState("");

  const propios = useMemo(() => new Set(rucsPropios.filter(Boolean)), [rucsPropios]);
  const propiosNom = useMemo(
    () => empresasPropias.map(nucleo).filter(Boolean), [empresasPropias]);
  const propiosProy = useMemo(
    () => proyectosPropios.map(nrm).filter(t => t.length >= 8), [proyectosPropios]);

  /* ── ¿ESTA FILA SOMOS NOSOTROS? ──
     Tres caminos, de más seguro a menos:

     1. EL RUC. Es el identificador legal, no se escribe de dos maneras y con él
        no hay nada que decidir. Solo que las RELACIONES DE RECIBIDAS —la única
        lista donde estamos todos— salen sin RUC, así que justo donde más se
        quiere marcar nuestra fila este camino no existe.
     2. EL NOMBRE, comparado por su núcleo (ver `nucleo`).
     3. EL TÍTULO DEL PROYECTO. Si una fila trae el nombre del proyecto con el
        que postulamos aquí, esa fila somos nosotros aunque la empresa esté
        escrita de una tercera forma: en la lista de un mismo concurso dos
        proyectos no se llaman igual.

     ⚠ No marcar es el peor fallo de esta pantalla —se viene a buscar el propio
     sitio en la carrera y la lista se lo calla—, y por eso hay tres caminos y
     no uno. */
  const esNuestra = (f: FilaComp) => {
    if (f.ruc && propios.has(f.ruc)) return true;
    if (propiosNom.some(m => casanNombres(m, f.empresa))) return true;
    if (f.titulo) {
      const t = nrm(f.titulo);
      /* `startsWith` y no igualdad porque en las filas viejas el título puede
         traer pegado detrás el nombre del director (lo dice su aviso). */
      if (propiosProy.some(p => t === p || t.startsWith(p))) return true;
    }
    return false;
  };

  /* ── ⚠ LOS FILTROS SE UNIFICAN TAMBIÉN AQUÍ, NO SOLO AL GUARDAR ──
     `cargarCompetencia` ya arregla la grafía de lo que hay guardado, pero solo
     cuando se sube una lista A ESE concurso: una convocatoria terminada, cuyas
     cuatro listas ya están, no vuelve a pasar por ahí nunca y se quedaría con
     el filtro partido para siempre. Se unifica con la MISMA función de
     `lib/concursos.ts`, así que las dos respuestas no pueden discrepar: lo que
     aquí sale como un botón, la próxima carga lo dejará escrito igual.
     Se agrupa para ENSEÑAR y para FILTRAR; lo guardado no se toca desde una
     pantalla. */
  const canonMod = useMemo(
    () => canoniza(filas.map(f => ({ texto: f.modalidad, fuente: f.fuente }))), [filas]);
  const canonCat = useMemo(
    () => canoniza(filas.map(f => ({ texto: f.categoria, fuente: f.fuente }))), [filas]);
  const unifMod = (v: string | null) => (v?.trim() ? canonMod.get(claveTexto(v)) || v.trim() : "");
  const unifCat = (v: string | null) => (v?.trim() ? canonCat.get(claveTexto(v)) || v.trim() : "");

  const cats = useMemo(() => [...new Set(filas.map(f => unifCat(f.categoria)).filter(Boolean))].sort(), [filas, canonCat]);
  const regs = useMemo(() => [...new Set(filas.map(f => f.region).filter(Boolean))].sort() as string[], [filas]);
  const mods = useMemo(() => [...new Set(filas.map(f => unifMod(f.modalidad)).filter(Boolean))].sort(), [filas, canonMod]);

  /* Los filtros de categoría, región y modalidad se aplican a TODO —incluido el
     embudo— porque la pregunta es «¿cómo va la carrera en mi categoría?». El de
     etapa no: si recortara el embudo, el embudo dejaría de ser un embudo. */
  /* ── EL BUSCADOR ──
     Con cincuenta rivales, encontrar uno concreto a base de filtros es ir por
     el camino largo: lo que se recuerda es un nombre, no su región. Se busca
     sobre las cuatro cosas por las que alguien preguntaría —empresa, proyecto,
     director y RUC— con el mismo motor que el resto del sistema: sin tildes,
     por trozos y en cualquier orden, así que «piuray aynicha» encuentra igual
     que «aynichafilms mamá piuray».
     ⚠ Va DENTRO del ámbito, no encima: buscar y filtrar por categoría son la
     misma pregunta hecha de dos maneras, y si el buscador se saltara los
     filtros, el embudo diría una cosa y la lista otra. */
  const enAmbito = filas.filter(f =>
    (!fCat || unifCat(f.categoria) === fCat) && (!fReg || f.region === fReg)
    && (!fMod || unifMod(f.modalidad) === fMod)
    && (!busca.trim() || casaConsulta(
      [f.empresa, f.titulo, f.personas, f.ruc].filter(Boolean).join(" · "), busca)));
  const lista = enAmbito
    .filter(f => !fEtapa || ORDEN[f.etapa] >= ORDEN[fEtapa])
    .sort((a, b) => (ORDEN[b.etapa] || 0) - (ORDEN[a.etapa] || 0) || a.empresa.localeCompare(b.empresa));

  /* Cuántas LLEGARON a cada etapa: una beneficiaria fue antes finalista y apta,
     aunque su fila solo guarde la última. Contar por igualdad daría «4 aptas» en
     un concurso con veinte, que es la lectura contraria. */
  const llegaron = (k: string) => enAmbito.filter(f => (ORDEN[f.etapa] || 0) >= ORDEN[k]).length;

  async function borrar(id: string) {
    setBorrando(id);
    await borrarCompetencia(convocatoriaId, id);
    setBorrando("");
    router.refresh();
  }

  const filtrando = !!(fCat || fReg || fMod || fEtapa || busca.trim());

  /* ── POSTULACIONES NO SON EMPRESAS ──
     «53» son las filas de la lista, y una empresa puede llevar dos proyectos:
     contarlas como competidoras distintas infla el patio. El número de
     empresas sale de la MISMA clave de agrupación que usa el historial —así
     que si aquí dice 51, abajo hay exactamente dos filas marcadas con «2
     proyectos»— y solo se enseña cuando difiere, para no gritar un dato que
     casi siempre es el mismo número dos veces. */
  const empresas = useMemo(() => new Set(
    filas.map(f => historial[f.id]?.clave || `sin-grupo:${f.id}`)).size, [filas, historial]);

  return (
    <div className="linked">
      <div className="riv-top">
        <h4 style={{ margin: 0 }}>🏁 La competencia · {filas.length}</h4>
        {empresas > 0 && empresas < filas.length && (
          <span className="riv-emps" title={`${filas.length} postulaciones presentadas por ${empresas} empresas: alguna lleva más de un proyecto.`}>
            de {empresas} empresas
          </span>
        )}
        {filas.length > 6 && (
          <div className="riv-busca">
            <span className="riv-busca-ico">🔎</span>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="empresa, proyecto, director o RUC" />
            {busca && (
              <button type="button" className="riv-busca-x" onClick={() => setBusca("")}
                title="Limpiar la búsqueda">✕</button>
            )}
          </div>
        )}
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
            onClick={() => setAbierto(true)}>📎 Cargar una lista de DAFO</button>
        )}
      </div>

      {abierto && (
        <div style={{ marginBottom: 12 }}>
          <CargarCompetencia convocatoriaId={convocatoriaId} nombre={nombre} anio={anio}
            onCerrar={() => setAbierto(false)} />
        </div>
      )}

      {filas.length === 0 && !abierto && (
        <div className="empty" style={{ padding: "18px 0" }}>
          Todavía no se cargó quién más postuló a este concurso.
          <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 6 }}>
            DAFO publica cuatro listas por concurso —recibidas, aptas, finalistas y el
            fallo—. Súbelas y aquí se ve contra quién competimos y hasta dónde llegó
            cada uno. No se dan de alta como empresas del sistema.
          </div>
        </div>
      )}

      {filas.length > 0 && (
        <>
          {/* ── EL EMBUDO ──
              Con el mismo lenguaje que el de nuestras postulaciones: cuántas
              llegaron hasta aquí, no cuántas se quedaron aquí. */}
          <div className="riv-embudo">
            {ETAPAS.map(e => {
              const n = llegaron(e.k);
              if (!n && e.k !== "recibida") return null;
              return (
                <button key={e.k} type="button"
                  className={`riv-paso${fEtapa === e.k ? " on" : ""}`}
                  onClick={() => setFEtapa(v => (v === e.k ? "" : e.k))}
                  title={`Ver solo las que llegaron a ${e.txt}`}>
                  <span className="riv-paso-n">{n}</span>
                  <span className="riv-paso-t">{e.ico} {e.txt}</span>
                </button>
              );
            })}
          </div>

          {(cats.length > 1 || regs.length > 1 || mods.length > 1) && (
            <div className="riv-filtros">
              {mods.length > 1 && (
                <div className="filt-grupo">
                  <span className="filt-tit">Modalidad</span>
                  <div className="filt-tira">
                    <button type="button" className={`vtab${!fMod ? " on" : ""}`} onClick={() => setFMod("")}>todas</button>
                    {mods.map(m => (
                      <button key={m} type="button" className={`vtab${fMod === m ? " on" : ""}`}
                        onClick={() => setFMod(v => (v === m ? "" : m))} title={m}>
                        {m.length > 34 ? `${m.slice(0, 32)}…` : m} · {filas.filter(f => unifMod(f.modalidad) === m).length}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cats.length > 1 && (
                <div className="filt-grupo">
                  <span className="filt-tit">Categoría</span>
                  <div className="filt-tira">
                    <button type="button" className={`vtab${!fCat ? " on" : ""}`} onClick={() => setFCat("")}>todas</button>
                    {cats.map(c => (
                      <button key={c} type="button" className={`vtab${fCat === c ? " on" : ""}`}
                        onClick={() => setFCat(v => (v === c ? "" : c))}>
                        {c} · {filas.filter(f => unifCat(f.categoria) === c).length}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {regs.length > 1 && (
                <div className="filt-grupo">
                  <span className="filt-tit">Región</span>
                  <div className="filt-tira">
                    <button type="button" className={`vtab${!fReg ? " on" : ""}`} onClick={() => setFReg("")}>todas</button>
                    {regs.map(r => (
                      <button key={r} type="button" className={`vtab${fReg === r ? " on" : ""}`}
                        onClick={() => setFReg(v => (v === r ? "" : r))}>
                        {r} · {filas.filter(f => f.region === r).length}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {filtrando && (
            <div className="riv-resumen">
              {lista.length} de {filas.length}
              <button type="button" className="dato-btn" style={{ marginLeft: 8 }}
                onClick={() => { setFCat(""); setFReg(""); setFMod(""); setFEtapa(""); setBusca(""); }}>
                ✕ limpiar
              </button>
            </div>
          )}

          {hilos?.error && (
            <div className="err-inline" style={{ marginBottom: 8, color: "var(--yellow)" }}>
              ⚠ {hilos.error} Mientras tanto se puede leer todo, pero no anotar nada.
            </div>
          )}
          <div className="riv-lista">
            {lista.map(f => {
              const nuestra = esNuestra(f);
              const monto = f.monto == null ? null : Number(f.monto);
              return (
                <div key={f.id} id={idFila("convocatoria_competencia", f.id)}
                  className={`riv-item${nuestra ? " yo" : ""}`}>
                  <span className={`riv-etapa e-${f.etapa}`}
                    title={ETAPAS.find(e => e.k === f.etapa)?.txt || f.etapa}>
                    {ETAPAS.find(e => e.k === f.etapa)?.ico || "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="riv-l1">
                      <b>{f.empresa}</b>
                      {nuestra && <span className="badge riv-yo">nosotros</span>}
                      {f.ruc && <span className="kit-pz-folio">{f.ruc}</span>}
                      {/* La misma empresa, dos veces en esta lista, no es un
                          error de carga: es alguien con dos caballos en la
                          carrera. Dicho aquí para que no se lea como un fallo
                          —y para que se vea con cuántas oportunidades juega. */}
                      {(historial[f.id]?.enEsta || 1) > 1 && (
                        <ChipPop clase="chip-varios" ancho={400}
                          titulo={`Ver los ${historial[f.id].enEsta} proyectos que ${f.empresa} presentó a este concurso`}
                          etiqueta={<>🎞 {historial[f.id].enEsta} proyectos</>}
                          cabecera={<span className="chip-gr-h">🎞 {historial[f.id].enEsta} proyectos a este concurso</span>}>
                          {historial[f.id].aqui.map(o => (
                            <span key={o.id} className={`ens-pop-fila${o.id === f.id ? " riv-pop-yo" : ""}`}>
                              <span className="fpop-txt">
                                <span className="fpop-l1">
                                  <span className={`riv-hist-ed e-${o.etapa}`}>{icoEtapa(o.etapa)} {txtEtapa(o.etapa)}</span>
                                  {o.monto ? <span className="riv-monto">S/ {o.monto.toLocaleString("es-PE")}</span> : null}
                                  {/* Cuál de las N es la fila desde la que se abrió:
                                      sin esto hay que comparar títulos a ojo. */}
                                  {o.id === f.id && <span className="riv-pop-esta">esta</span>}
                                </span>
                                <span className="fpop-nom">{o.titulo || "sin título"}</span>
                              </span>
                            </span>
                          ))}
                          <span className="ens-pop-aviso riv-pop-pie">
                            ⚠ Si dos de estos títulos fueran idénticos no serían dos proyectos, sino la
                            misma postulación leída dos veces con la empresa escrita de dos maneras.
                          </span>
                        </ChipPop>
                      )}
                      {f.region && <span className="badge riv-reg">{f.region}</span>}
                      {/* La categoría, con la grafía unificada: la fila y el botón del filtro
                          tienen que decir lo mismo o el filtro parece roto. */}
                      {unifCat(f.categoria) && <span className="badge riv-cat">{unifCat(f.categoria)}</span>}
                      {monto ? <span className="riv-monto">S/ {monto.toLocaleString("es-PE")}</span> : null}
                    </div>
                    {f.titulo && <div className="riv-tit">{f.titulo}</div>}
                    {/* Empresa, proyecto y director: los tres nombres con los
                        que se cruza un concurso con otro. */}
                    {f.personas && <div className="riv-dir">🎬 {f.personas}</div>}
                    {/* ── LO QUE ESTE RIVAL YA HABÍA HECHO ──
                        Es la mitad de la lectura: veinte aptas no son veinte
                        desconocidos si doce llevan tres años intentándolo y dos
                        ya ganaron. Aquí, y no en otra pantalla, porque la
                        pregunta se hace mirando esta lista. */}
                    {historial[f.id] && (historial[f.id].veces > 1 ? (
                      /* ── ⚠ EL RESUMEN SE PULSA, Y DICE QUÉ Y CUÁNDO ──
                         «🏆 ya ganó · 2026 🏅» dejaba dos preguntas en el aire
                         —¿ganó qué?, ¿ganó cuándo?— y la respuesta estaba en
                         otra pantalla: había que ir a la convocatoria de ese
                         año y buscar la empresa a mano. Ahora el resumen es el
                         botón y dentro está cada edición con su proyecto, su
                         etapa y su monto; los datos ya estaban en la página, así
                         que abre sin pedir nada. */
                      <div className="riv-hist">
                        <ChipPop clase="chip-hist" ancho={430}
                          titulo={`Ver qué hizo ${f.empresa} en las otras ${historial[f.id].otras.length} ediciones`}
                          etiqueta={<>
                            <b>{historial[f.id].veces}ª vez</b>
                            {historial[f.id].ganoOtras > 0 && (
                              <span className="riv-hist-gano">🏆 ya había ganado{historial[f.id].ganoOtras > 1 ? ` ${historial[f.id].ganoOtras} veces` : ""}</span>
                            )}
                            {historial[f.id].otras.slice(0, 4).map(o => (
                              <span key={o.id} className={`riv-hist-ed e-${o.etapa}`}>
                                {o.anio || o.codigo} {icoEtapa(o.etapa)}
                              </span>
                            ))}
                            {historial[f.id].otras.length > 4 && (
                              <span className="riv-hist-ed">+{historial[f.id].otras.length - 4}</span>
                            )}
                          </>}
                          cabecera={<span className="chip-gr-h">🏁 {f.empresa} · {historial[f.id].veces} ediciones</span>}>
                          {historial[f.id].otras.map(o => (
                            <Link key={o.id} href={`/entidad/convocatoria/${o.convocatoriaId}`} className="ens-pop-fila">
                              <span className="fpop-txt">
                                <span className="fpop-l1">
                                  <b style={{ color: "var(--text)" }}>{o.anio || "?"}</b>
                                  {o.codigo && <span className="kit-pz-folio">{o.codigo}</span>}
                                  <span className={`riv-hist-ed e-${o.etapa}`}>{icoEtapa(o.etapa)} {txtEtapa(o.etapa)}</span>
                                  {o.monto ? <span className="riv-monto">S/ {o.monto.toLocaleString("es-PE")}</span> : null}
                                </span>
                                <span className="fpop-nom">{o.titulo || "sin título"}</span>
                                {/* De qué concurso, que no siempre es este: una
                                    productora de documental puede haber estado
                                    en ficción, y eso cambia lo que significa. */}
                                {o.nombre && <span className="fpop-l1" style={{ color: "var(--dim)" }}>{o.nombre}</span>}
                                {o.cuantos > 1 && (
                                  <span className="fpop-l1" style={{ color: "var(--orange)" }}>
                                    🎞 ese año llevó {o.cuantos} proyectos
                                  </span>
                                )}
                              </span>
                            </Link>
                          ))}
                        </ChipPop>
                      </div>
                    ) : (
                      /* ⚠ «1ª vez QUE LA VEMOS», y no «1ª vez». La diferencia no
                         es pudor: esta lista solo sabe de las ediciones que
                         están cargadas, y una empresa de 2019 que no ha vuelto
                         hasta hoy aparecería aquí igual que una recién
                         constituida. Antes esta fila salía sin nada debajo, y
                         un hueco se lee como «nueva» sin que nadie lo haya
                         escrito nunca. */
                      <div className="riv-hist riv-hist-1"
                        title={cruce
                          ? `No aparece en ninguna de las otras ${cruce.ediciones - 1} ediciones cargadas${
                              cruce.desde && cruce.hasta ? ` (${cruce.desde}–${cruce.hasta})` : ""
                            }. Fuera de esas, esta lista no sabe nada.`
                          : "No aparece en ninguna otra edición cargada."}>
                        1ª vez que la vemos
                      </div>
                    ))}
                    {/* ⚠ Una fila que se leyó a medias lo sigue diciendo aquí: si
                        se guardó sin arreglar, el aviso es lo único que impide
                        tomarla por un dato limpio. Debajo, lo que decía el PDF. */}
                    {(f.avisos || []).length > 0 && (
                      <div className="riv-aviso" title={f.crudo || undefined}>
                        ⚠ {(f.avisos || []).join(" · ")}
                      </div>
                    )}
                  </div>
                  {hilos && (
                    <span className="riv-acc">
                      {/* Un 👀 es «ya lo investigué, no hace falta otra vez», y
                          es lo que más se va a hacer: si costara escribir un
                          comentario no se haría y el acuse se perdería. */}
                      <Reacciones pubId={null} compacto
                        rendicion={{ tabla: "convocatoria_competencia", id: f.id }}
                        reacciones={hilos.reacciones[f.id] || []} userId={hilos.userId} />
                      {/* `HiloRendicion` ya viene con las imágenes puestas: son
                          útiles en las siete tablas, no solo aquí. */}
                      <HiloRendicion tabla="convocatoria_competencia" filaId={f.id}
                        cabecera={() => (
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--teal)" }}>
                              {f.titulo || "sin título"}
                            </span>
                            <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{f.empresa}</span>
                            {f.personas && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>🎬 {f.personas}</span>}
                          </div>
                        )}>
                        {(abrir) => (
                          <button type="button" className="dato-btn" onClick={abrir}
                            title={hilos.conteo[f.id]
                              ? `${hilos.conteo[f.id]} nota(s) nuestras sobre este competidor`
                              : "Anotar lo que hemos averiguado de este competidor"}
                            style={{ color: hilos.conteo[f.id] ? "var(--accent)" : undefined,
                              opacity: hilos.conteo[f.id] ? 1 : .5, whiteSpace: "nowrap" }}>
                            💬{hilos.conteo[f.id] ? ` ${hilos.conteo[f.id]}` : ""}
                          </button>
                        )}
                      </HiloRendicion>
                    </span>
                  )}
                  <button type="button" className="dato-btn" disabled={borrando === f.id}
                    onClick={() => borrar(f.id)} title={`Quitar ${f.empresa} de la lista`}>
                    {borrando === f.id ? "…" : "✕"}
                  </button>
                </div>
              );
            })}
            {lista.length === 0 && (
              <div className="empty" style={{ padding: "14px 0" }}>
                {busca.trim() ? `Ninguna dice «${busca.trim()}».` : "Ninguna con esos filtros."}
              </div>
            )}
          </div>
          {/* ── CONTRA QUÉ SE CRUZÓ ──
              El pie que sostiene todas las líneas de arriba. «1ª vez que la
              vemos» y «3ª vez» son la misma frase medida con la misma regla, y
              esa regla son las ediciones cargadas: decir cuántas son y de qué
              años convierte una impresión en un dato que se puede comprobar
              —y deja claro qué habría que cargar para saber más. */}
          {cruce && cruce.ediciones > 1 && (
            <div className="riv-pie">
              Cruzado contra {cruce.ediciones} ediciones cargadas
              {cruce.desde && cruce.hasta ? ` (${cruce.desde}–${cruce.hasta})` : ""}, de todos los
              concursos. Quien se presentó antes de eso, o a un concurso que no está cargado, aquí
              figura como si fuera su primera vez.
            </div>
          )}
        </>
      )}
    </div>
  );
}
