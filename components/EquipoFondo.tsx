"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sumarPersonalFondo, editarPersonalFondo, quitarPersonalFondo } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import VerAdjunto from "@/components/VerAdjunto";
import { ROLES_EQUIPO as ROLES } from "@/lib/rolesEquipo";
import {
  integrantesDeFondo, ordenarIntegrantes, resumenEquipo, domicilioDe, coberturaSuspension,
  META_SITUACION, type Integrante, type PersonaMin,
} from "@/lib/equipoFondo";

/* ── 👥 EL EQUIPO DE UN FONDO EN EJECUCIÓN ──
 *
 * Un fondo ganado arranca con el equipo que se presentó al concurso, y durante
 * dos años se le suma gente: el sonidista de una semana, la traductora de tres
 * jornadas. Esa lista no estaba en ninguna parte — y es exactamente la que hay
 * que poder poner al lado de los recibos cuando DAFO pregunte quién es cada
 * quien.
 *
 * La pantalla no es un directorio: es un COTEJO. Arriba están los tres números
 * que contestan «¿esto cuadra?» y la lista viene ordenada por lo que hay que
 * mirar, no alfabéticamente.
 *
 * ── LA SEGUNDA LISTA SE ESCRIBE SOLA ──
 * Nadie mantiene a mano quién cobró: quien tiene un RHE girado en este fondo
 * aparece aquí porque lo trae la contabilidad. A mano solo se apunta lo que
 * todavía no ha ocurrido —a quién se piensa convocar—, que es lo único que no
 * deja rastro en ningún sitio. Una lista de personal que hay que acordarse de
 * actualizar es una lista que a los tres meses miente.
 */
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

export default function EquipoFondo({
  postulacionId, equipoPost, rhes, previstos, personas, catalogo, puedeEditar,
}: {
  postulacionId: string;
  equipoPost: any[];
  rhes: any[];
  previstos: any[];
  /** Catálogo mínimo para poner cara y nombre a quien salga de un recibo. */
  personas: PersonaMin[];
  /** El mismo catálogo con la forma que espera el selector. */
  catalogo: CatalogoItem[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [cargo, setCargo] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState({ cargo: "", nota: "" });

  const todos = useMemo(
    () => ordenarIntegrantes(integrantesDeFondo(equipoPost, rhes, previstos, personas)),
    [equipoPost, rhes, previstos, personas]);
  const res = useMemo(() => resumenEquipo(todos), [todos]);

  /* Las dos secciones que pediste, cortadas por su origen: lo que se declaró
     al concurso y lo que se sumó después. La línea no es cosmética — la
     primera lista está firmada en el expediente y la segunda no. */
  const declarados = todos.filter(x => x.situacion.startsWith("declarado"));
  const personal = todos.filter(x => !x.situacion.startsWith("declarado"));

  const sumar = async () => {
    if (!sel || ocupado) return;
    setOcupado(true); setError("");
    const r: any = await sumarPersonalFondo(postulacionId, sel.id, cargo, nota);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setSel(null); setCargo(""); setNota(""); setAgregando(false);
    router.refresh();
  };

  const guardarEd = async (id: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await editarPersonalFondo(id, postulacionId, ed.cargo, ed.nota);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setEditando(null);
    router.refresh();
  };

  const quitar = async (id: string) => {
    setOcupado(true); setError("");
    const r: any = await quitarPersonalFondo(id, postulacionId);
    setOcupado(false);
    if (r?.error) setError(r.error); else router.refresh();
  };

  const fila = (x: Integrante) => {
    const m = META_SITUACION[x.situacion];
    return (
      <div key={x.persona.id} className="eqf-fila">
        <Avatar nombre={x.persona.nombre} src={x.persona.foto_url} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            {/* ── EL NOMBRE COMPLETO MANDA ──
                Antes el enlace decía «GabyM». El alias sirve para hablar entre
                nosotros y no sirve para nada más: el informe económico se lee
                con nombres completos, y quien arma la rendición tenía que
                abrir las veintitrés fichas para copiarlos uno por uno.
                El alias no se tira —es como se llaman entre ellos y es lo que
                aparece en el resto del sistema— pero pasa a segundo plano y
                solo cuando de verdad aporta algo distinto del nombre. */}
            <Link href={`/entidad/persona/${x.persona.id}`} className="eqf-nom">
              {x.persona.nombre} →
            </Link>
            {x.persona.alias && x.persona.alias !== x.persona.nombre && (
              <span className="eqf-alias" title="Como se le llama en el equipo">
                {x.persona.alias}
              </span>
            )}
            <span className="badge eqf-cargo">{x.cargo}</span>
            {/* El TIPO no es adorno: distingue al equipo estable del
                colaborador eventual, y de eso depende qué se le reclama a cada
                uno. Reclamarle un CV con enfoque a quien hizo un flete es la
                clase de aviso que enseña a ignorar todos los avisos. */}
            {x.persona.tipo && (
              <span className="eqf-tipo" title="Qué clase de vínculo tiene con el colectivo">
                {x.persona.tipo}
              </span>
            )}
            <span className="eqf-sit" style={{ color: m.col }} title={m.ayuda}>
              {m.ico} {m.txt}
            </span>
          </div>

          {/* ── DOCUMENTO Y DOMICILIO ──
              Los dos datos que el informe económico pide de cada persona a la
              que se le giró un recibo, y que hasta ahora había que ir a buscar
              ficha por ficha.
              Lo que falta se DICE en vez de dejar el hueco: un renglón vacío se
              lee como «no hace falta», y aquí sí hace falta — un RHE sin
              domicilio del emisor es un RHE que se observa. Solo se reclama a
              quien ya cobró: exigirle el domicilio a un previsto que quizá no
              llegue a trabajar es inventar una tarea. */}
          <div className="eqf-datos">
            {x.persona.ruc_dni
              ? <span className="eqf-doc">{x.persona.ruc_dni}</span>
              : x.rhes.length > 0 && <span className="eqf-falta">sin DNI</span>}
            {domicilioDe(x.persona)
              ? <span className="eqf-dom">📍 {domicilioDe(x.persona)}</span>
              : x.rhes.length > 0 && <span className="eqf-falta">sin domicilio</span>}

            {/* ── LA SUSPENSIÓN DE 4ta, DONDE SE HACE LA PREGUNTA ──
                Los 26 recibos de este fondo se giraron con retención CERO. Lo
                único que lo justifica es que quien emitió tuviera la
                suspensión vigente EL AÑO DEL RECIBO. Esa constancia estaba
                cargada y no se veía en ninguna parte del fondo: había que
                abrir la ficha de cada persona para saberlo, o sea nunca.
                Solo se pinta en quien cobró: a un previsto que quizá no llegue
                a trabajar no se le reclama nada todavía. */}
            {x.rhes.length > 0 && (() => {
              const s = coberturaSuspension(x);
              if (!s.anio) {
                return <span className="eqf-falta"
                  title="Su recibo se giró sin retención de 4ta y no hay constancia que lo justifique. El 8 % lo asumiría la asociación si lo observan.">
                  ⚠ sin suspensión de 4ta</span>;
              }
              return (
                <>
                  {/* El año ES el dato, no un adorno: la suspensión caduca cada
                      31/12, así que «tiene suspensión» sin año no dice nada. */}
                  {/* Un chip por AÑO, cada uno abriendo SU constancia. Con dos
                      años la diferencia importa: el recibo de 2024 se prueba
                      con el papel de 2024 y con ningún otro, así que enlazar
                      siempre al más reciente habría enseñado el documento
                      equivocado sin decirlo. */}
                  <span className="eqf-susp-grupo" title="Suspensión de 4ta categoría (Formulario 1609). Caduca cada 31 de diciembre.">
                    <span className="eqf-susp-et">🧾 4ta</span>
                    {(s.anios.length ? s.anios : [s.anio!]).map(a => {
                      const u = s.hayHistorial ? s.urlDe(a) : s.url;
                      return u
                        ? <VerAdjunto key={a} url={u} clase="eqf-susp"
                            titulo={`Constancia de suspensión de 4ta ${a} (Formulario 1609)`}>
                            {a}
                          </VerAdjunto>
                        : <span key={a} className="eqf-susp eqf-susp-sinpdf"
                            title="Declarada, pero sin la constancia adjunta">{a}</span>;
                    })}
                  </span>
                  {/* ── EL AVISO CAMBIA DE NATURALEZA SEGÚN LO QUE SE SEPA ──
                      Con el historial por año corrido, «giró en 2024 y no hay
                      constancia de 2024» es un HECHO y va en ámbar.
                      Sin él, la ficha guarda un solo año y lo único que se
                      puede decir es «no lo puedo probar» — en gris. Pintar de
                      ámbar lo segundo daba 8 personas y S/ 55,870 de falsa
                      alarma sobre un hueco real de S/ 9,970, y un contador que
                      multiplica por cinco se ignora entero, arrastrando
                      consigo los avisos que sí eran verdad. */}
                  {s.faltan.length > 0 && (
                    <span className={s.hayHistorial ? "eqf-falta" : "eqf-matiz"}
                      title={s.hayHistorial
                        ? `Giró recibos en ${s.faltan.join(", ")} y no hay constancia de suspensión de esos años. La suspensión caduca cada 31 de diciembre. El 8 % de esos recibos lo asumiría la asociación si lo observan.`
                        : `La ficha guarda solo la constancia de ${s.anio}. También giró en ${s.faltan.join(", ")} — puede que esas constancias existan, pero sin el historial por año (db/suspension-4ta-anios.sql) el sistema no puede probarlo.`}>
                      {s.hayHistorial ? "⚠ falta " : ""}{s.faltan.join(", ")}
                      {s.hayHistorial ? "" : " sin probar"}
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          {x.nota && <div className="eqf-nota">{x.nota}</div>}

          {/* Los recibos, con su número: es lo que se coteja contra la carpeta
              de la rendición. Un total sin los números obliga a abrir el
              módulo de RHE para saber cuáles son. */}
          {x.rhes.length > 0 && (
            <div className="eqf-rhes">
              <b>{soles(x.total)}</b>
              <span className="eqf-rhes-n">
                en {x.rhes.length} recibo{x.rhes.length === 1 ? "" : "s"}
              </span>
              {/* ── EL CÓDIGO ES EL RECIBO ──
                  Antes era texto plano: para ver el E001-89 había que ir al
                  bloque de RHE, desplegar la persona y buscarlo. Tres saltos
                  para responder «¿y este cuál es?», que es la pregunta que el
                  número ya estaba haciendo.
                  Ahora cada código abre su PDF en el visor, encima de la
                  lista. Los de Drive también: el visor los reescribe a
                  `/preview`, así que se leen dentro sin salir a otra pestaña.
                  El que no tiene PDF NO se disfraza de enlace — va en ámbar y
                  sin subrayado. Un código que parece clicable y no hace nada
                  enseña a no fiarse de los que sí lo son. */}
              <span className="eqf-rhes-l">
                {x.rhes.slice(0, 6).map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && <span className="eqf-sep"> · </span>}
                    {r.url
                      ? <VerAdjunto url={r.url} clase="eqf-rhe-link"
                          titulo={`Ver el recibo ${r.numero || ""}`.trim()}>
                          {r.numero || "s/n"}
                        </VerAdjunto>
                      : <span className="eqf-rhe-sin" title="Este recibo no tiene su PDF adjunto">
                          {r.numero || "s/n"}
                        </span>}
                  </span>
                ))}
                {x.rhes.length > 6 && <span className="eqf-sep"> · +{x.rhes.length - 6}</span>}
              </span>
            </div>
          )}

          {editando === x.filaId && x.filaId && (
            <div className="eqf-ed">
              <input list="roles-fondo" value={ed.cargo} autoFocus
                onChange={e => setEd({ ...ed, cargo: e.target.value })}
                placeholder="Cargo en este fondo…" />
              <input value={ed.nota} onChange={e => setEd({ ...ed, nota: e.target.value })}
                placeholder="Por qué está (opcional): «traductora de Pomacanchi»" />
              <button className="btn" disabled={ocupado} onClick={() => guardarEd(x.filaId!)}>
                {ocupado ? "…" : "Guardar"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          )}
        </div>

        {/* Solo se puede editar lo que se apuntó a mano. El cargo de quien se
            declaró en la postulación vive en su expediente y se corrige allí:
            tener dos sitios donde cambiarlo es tener dos respuestas. */}
        {puedeEditar && x.filaId && editando !== x.filaId && (
          <>
            <button className="dato-btn" title="Editar cargo y nota"
              onClick={() => { setEditando(x.filaId!); setEd({ cargo: x.cargo === "—" ? "" : x.cargo, nota: x.nota || "" }); }}>✎</button>
            <button className="dato-btn" style={{ color: "var(--red)" }}
              title={x.rhes.length
                ? "Quitarlo de la lista prevista. Sus recibos NO se borran: seguirá apareciendo por ellos."
                : "Quitarlo de la lista"}
              disabled={ocupado} onClick={() => quitar(x.filaId!)}>✕</button>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <datalist id="roles-fondo">{ROLES.map(r => <option key={r} value={r} />)}</datalist>

      {/* ── ¿CUADRA? ── Los tres números de arriba. Es lo que se viene a mirar;
          la lista es el detalle de estos números, no al revés. */}
      <div className="eqf-res">
        <span className="eqf-res-n">
          <b>{res.total}</b> personas · <b>{soles(res.montoGirado)}</b> girados a {res.girados}
        </span>
        {/* El contador de «sin declarar» se quitó de la cabecera entera. No es
            una excepción que valga la pena resumir —eran 17 de 20— y la
            sección «PERSONAL DEL FONDO · 17» ya dice exactamente eso dos
            líneas más abajo. Repetirlo arriba y en ámbar convertía lo normal
            en alarma. */}
        {res.declaradosSinGirar > 0 && (
          <span style={{ color: "var(--dim)" }} title={META_SITUACION.declarado_sin_girar.ayuda}>
            ○ {res.declaradosSinGirar} declarado{res.declaradosSinGirar === 1 ? "" : "s"} sin recibos
          </span>
        )}
        {/* ── EL RIESGO DE LA RETENCIÓN, EN LA CABECERA ──
            Con veintitrés filas, un aviso que solo vive dentro de cada una se
            encuentra recorriéndolas de arriba abajo — o sea, no se encuentra.
            Aquí va el total, que es la cifra con la que se decide si vale la
            pena ir a SUNAT a bajar las constancias que faltan. */}
        {res.sinSuspension > 0 && (
          <span style={{ color: "var(--yellow)" }}
            title="Cobraron con retención cero y no hay constancia de suspensión de 4ta de NINGÚN año. El 8 % de ese monto lo asumiría la asociación si lo observan.">
            ⚠ {res.sinSuspension} sin constancia de 4ta
            {res.montoSinSuspension > 0 ? ` · ${soles(res.montoSinSuspension)}` : ""}
          </span>
        )}
        {res.previstos > 0 && (
          <span style={{ color: "var(--blue)" }}>· {res.previstos} previsto{res.previstos === 1 ? "" : "s"}</span>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      <div className="eqf-h">
        🏆 Equipo declarado en la postulación · {declarados.length}
        <span className="eqf-h-sub">firmado en el expediente — se corrige allí</span>
      </div>
      {declarados.length ? declarados.map(fila) : (
        <div className="eqf-vacio">La postulación no registró equipo.</div>
      )}

      <div className="eqf-h" style={{ marginTop: 16 }}>
        👷 Personal del fondo · {personal.length}
        <span className="eqf-h-sub">sale solo de los recibos girados; a mano se apunta lo previsto</span>
        <span style={{ flex: 1 }} />
        {puedeEditar && !agregando && (
          <button className="btn btn-ghost" style={{ padding: "4px 11px", fontSize: 12 }}
            onClick={() => setAgregando(true)}>＋ Sumar</button>
        )}
      </div>

      {agregando && (
        <div className="eqf-add">
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={catalogo}
            onPick={id => { const p = catalogo.find(x => x.id === id); if (p) setSel({ id: p.id, nombre: p.nombre }); }} />
          <input list="roles-fondo" value={cargo} onChange={e => setCargo(e.target.value)}
            placeholder="Cargo en este fondo…" />
          <input value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Por qué (opcional): «traductora de las entrevistas»" />
          <button className="btn" disabled={!sel || ocupado} onClick={sumar}>
            {ocupado ? "…" : "Sumar"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setAgregando(false); setSel(null); }}>Cancelar</button>
        </div>
      )}

      {personal.length ? personal.map(fila) : (
        <div className="eqf-vacio">
          Nadie más todavía. En cuanto se gire el primer recibo a alguien de fuera del
          equipo declarado, aparecerá aquí solo.
        </div>
      )}
    </div>
  );
}
