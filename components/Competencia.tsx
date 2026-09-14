"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CargarCompetencia from "@/components/CargarCompetencia";
import { borrarCompetencia } from "@/app/actions";
import { casaConsulta } from "@/lib/sitios";
import { ETAPAS, ORDEN, icoEtapa, txtEtapa, nrm, nucleo, casanNombres, type Historial } from "@/lib/rivales";

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

export default function Competencia({ convocatoriaId, nombre, anio, filas, rucsPropios, empresasPropias, proyectosPropios, historial }: {
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
   *  fila. Solo trae a los que se han presentado más de una vez. */
  historial: Record<string, Historial>;
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

  const cats = useMemo(() => [...new Set(filas.map(f => f.categoria).filter(Boolean))].sort() as string[], [filas]);
  const regs = useMemo(() => [...new Set(filas.map(f => f.region).filter(Boolean))].sort() as string[], [filas]);
  const mods = useMemo(() => [...new Set(filas.map(f => f.modalidad).filter(Boolean))].sort() as string[], [filas]);

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
    (!fCat || f.categoria === fCat) && (!fReg || f.region === fReg) && (!fMod || f.modalidad === fMod)
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

  return (
    <div className="linked">
      <div className="riv-top">
        <h4 style={{ margin: 0 }}>🏁 La competencia · {filas.length}</h4>
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
                        {m.length > 34 ? `${m.slice(0, 32)}…` : m} · {filas.filter(f => f.modalidad === m).length}
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
                        {c} · {filas.filter(f => f.categoria === c).length}
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

          <div className="riv-lista">
            {lista.map(f => {
              const nuestra = esNuestra(f);
              const monto = f.monto == null ? null : Number(f.monto);
              return (
                <div key={f.id} className={`riv-item${nuestra ? " yo" : ""}`}>
                  <span className={`riv-etapa e-${f.etapa}`}
                    title={ETAPAS.find(e => e.k === f.etapa)?.txt || f.etapa}>
                    {ETAPAS.find(e => e.k === f.etapa)?.ico || "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="riv-l1">
                      <b>{f.empresa}</b>
                      {nuestra && <span className="badge riv-yo">nosotros</span>}
                      {f.ruc && <span className="kit-pz-folio">{f.ruc}</span>}
                      {f.region && <span className="badge riv-reg">{f.region}</span>}
                      {f.categoria && <span className="badge riv-cat">{f.categoria}</span>}
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
                    {historial[f.id] && (
                      <div className="riv-hist">
                        <b>{historial[f.id].veces}ª vez</b>
                        {historial[f.id].gano > 0 && (
                          <span className="riv-hist-gano">🏆 ya ganó{historial[f.id].gano > 1 ? ` ${historial[f.id].gano} veces` : ""}</span>
                        )}
                        {historial[f.id].otras.map(o => (
                          <span key={`${o.anio}-${o.codigo}`} className={`riv-hist-ed e-${o.etapa}`}
                            title={`${o.codigo || ""} — ${txtEtapa(o.etapa)}`}>
                            {o.anio || o.codigo} {icoEtapa(o.etapa)}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* ⚠ Una fila que se leyó a medias lo sigue diciendo aquí: si
                        se guardó sin arreglar, el aviso es lo único que impide
                        tomarla por un dato limpio. Debajo, lo que decía el PDF. */}
                    {(f.avisos || []).length > 0 && (
                      <div className="riv-aviso" title={f.crudo || undefined}>
                        ⚠ {(f.avisos || []).join(" · ")}
                      </div>
                    )}
                  </div>
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
        </>
      )}
    </div>
  );
}
