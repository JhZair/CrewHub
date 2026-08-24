"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { editarPersonalFondo, quitarPersonalFondo } from "@/app/actions";
import Avatar from "@/components/Avatar";
import SumarPersonalFondo from "@/components/SumarPersonalFondo";
import HiloRendicion from "@/components/HiloRendicion";
import VistaRapida from "@/components/VistaRapida";
import VerAdjunto from "@/components/VerAdjunto";
import { ROLES_EQUIPO as ROLES } from "@/lib/rolesEquipo";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import {
  integrantesDeFondo, ordenarIntegrantes, resumenEquipo, domicilioDe, coberturaSuspension,
  agruparEquipo, META_SITUACION,
  type Integrante, type PersonaMin, type EjeEquipo,
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
  postulacionId, equipoPost, rhes, previstos, personas,
  personasTabla, vistasPersona, etapas, rubros, casosPorPersona, puedeEditar,
}: {
  postulacionId: string;
  equipoPost: any[];
  rhes: any[];
  previstos: any[];
  /** Catálogo mínimo para poner cara y nombre a quien salga de un recibo. */
  personas: PersonaMin[];
  /** El directorio ENTERO, con todas sus columnas: es lo que explora el
   *  pop-up de «＋ Sumar» y hay que poder filtrarlo por cualquiera de ellas.
   *  Un recorte aquí no daría error: los filtros por región o especialidad
   *  simplemente no encontrarían a nadie, que es la peor forma de fallar. */
  personasTabla: any[];
  /** Las vistas de tabla guardadas para personas — las mismas de /personas. */
  vistasPersona: any[];
  /** Los dos catálogos del fondo. Sirven para NOMBRAR y para ORDENAR: una
   *  etapa se lee en orden de producción y un rubro en el del presupuesto,
   *  nunca alfabéticamente. */
  etapas: { id: string; nombre: string }[];
  rubros: { id: string; etiqueta: string }[];
  /** Los casos VIVOS donde figura cada persona, por id de persona. Ya vienen
   *  filtrados en el servidor: aquí no se decide qué es un pendiente. */
  casosPorPersona?: Record<string, { id: string; titulo: string; estado?: string | null; tipo?: string | null }[]>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  /* Qué vista se está mirando. En estado y no en la URL: es una forma de leer
     la misma lista, no otro sitio al que llevar a alguien con un enlace. */
  const [vista, setVista] = useState<"general" | EjeEquipo>("general");
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

  /* Las dos vistas agrupadas. Se calculan siempre —son 26 filas, no cuesta
     nada— para que el número que llevan las pestañas sea real desde el
     principio: «Por rubro · 1» avisa de que están todos sin clasificar ANTES
     de entrar, que es cuando sirve. */
  const catRubros = useMemo(() => rubros.map(r => ({ id: r.id, nombre: r.etiqueta })), [rubros]);
  const porEtapa = useMemo(() => agruparEquipo(todos, "etapa", etapas), [todos, etapas]);
  const porRubro = useMemo(() => agruparEquipo(todos, "rubro_item", catRubros), [todos, catRubros]);
  const agrupado = vista === "etapa" ? porEtapa : vista === "rubro_item" ? porRubro : null;

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
    /* ── QUIEN NO COBRÓ SE APAGA ──
     * Esta lista se lee para UNA cosa: comprobar contra qué recibos se giró la
     * plata. Quien no tiene ninguno no aporta nada a esa lectura, y sin
     * embargo ocupa la misma altura, el mismo peso y los mismos avisos que
     * quien cobró S/ 15,100 — en 26 filas eso es un tercio del ruido.
     *
     * Se apaga por el HECHO —cero recibos—, no por la etiqueta de situación.
     * Son dos etiquetas distintas («declarado, sin recibos» y «previsto») que
     * comparten exactamente la condición que importa aquí; atarlo a la lista
     * de etiquetas habría dejado la tercera fuera el día que se añada.
     *
     * Apagar no es esconder: `.fila-tenue` se enciende entera al pasar el
     * cursor, el contador de arriba los sigue contando («3 declarados sin
     * recibos», «1 previsto») y siguen en su sección. Un declarado que nunca
     * cobró es algo que hay que poder explicar al cerrar la rendición, así que
     * desaparecer no era una opción. */
    /* Sin `title` en la fila: el motivo ya está escrito dentro de ella
       —«declarado, sin recibos», «previsto»— y un tooltip sobre un bloque de
       este tamaño salta cada vez que el cursor lo cruza de paso. */
    const apagada = x.rhes.length === 0;
    return (
      <div key={x.persona.id} className={`eqf-fila${apagada ? " fila-tenue" : ""}`}>
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
                {/* ── CADA RECIBO, UNA PASTILLA ──
                    Iban separados por « · », y eso bastaba mientras un recibo
                    era solo su código. Con el 💬 al lado dejó de bastar:
                    «E001-59 💬 · E001-58 💬» obliga a decidir a cuál de los dos
                    códigos pertenece cada globo, y el punto medio no lo dice.
                    Encerrarlos resuelve la pregunta en vez de separarla — el
                    borde agrupa código y comentario como lo que son, un recibo
                    y su conversación, y de paso separa de los vecinos. */}
                {x.rhes.slice(0, 6).map((r) => (
                  <span key={r.id} className="eqf-rhe">
                    {r.url
                      ? <VerAdjunto url={r.url} clase="eqf-rhe-link"
                          titulo={`Ver el recibo ${r.numero || ""}`.trim()}>
                          {r.numero || "s/n"}
                        </VerAdjunto>
                      : <span className="eqf-rhe-sin" title="Este recibo no tiene su PDF adjunto">
                          {r.numero || "s/n"}
                        </span>}
                    {/* ── EL HILO DEL RECIBO, AQUÍ TAMBIÉN ──
                        Es el MISMO hilo que ya se abre desde «Pagos al
                        personal»: misma tabla, misma fila, mismo pop-up. No es
                        una copia — `HiloRendicion` se enchufa con `("rhe",
                        r.id)` y lo que se escriba aquí aparece allá y al revés.
                        Hacía falta porque las preguntas nacen leyendo ESTA
                        lista: «este de S/ 900 ¿de quién es?», «¿por qué se giró
                        después del plazo?». Obligar a ir a la otra pestaña para
                        preguntarlo es lo que manda la conversación a WhatsApp,
                        que es de donde no vuelve el día de la observación.
                        El contador se ve siempre que haya algo: sin número, un
                        hilo de cuatro mensajes es invisible desde la lista. */}
                    <HiloRendicion tabla="rhe" filaId={r.id}>
                      {abrir => (
                        <button className={`eqf-rhe-hilo${r.nComentarios ? " tiene" : ""}`}
                          onClick={abrir}
                          title={r.nComentarios
                            ? `${r.nComentarios} comentario(s) sobre este recibo`
                            : "Comentar este recibo"}>
                          💬{r.nComentarios ? ` ${r.nComentarios}` : ""}
                        </button>
                      )}
                    </HiloRendicion>
                  </span>
                ))}
                {/* Sin el « · » de antes: ya no separa nada, ahora las
                    pastillas lo hacen solas. */}
                {x.rhes.length > 6 && <span className="eqf-sep">+{x.rhes.length - 6}</span>}
              </span>
            </div>
          )}

          {/* ── LOS CASOS ABIERTOS SOBRE ESTA PERSONA ──
              «Falta la constancia de Frank», «Arthur no ha firmado»: se abren
              desde el tablero o desde su ficha, y esta pestaña —que es donde
              de verdad se revisa a esta gente— no sabía nada de ellos. Se
              cerraban o no según se acordara alguien de mirar dos pantallas.
              Va FUERA del bloque de recibos, y a propósito: Arthur está como
              «previsto» y no tiene ninguno; colgarlo de ahí habría dejado sin
              casos justo a quien más los tiene.
              Dos y el resto contado: son un aviso de que hay algo pendiente,
              no la lista de tareas — esa vive en el tablero, a un clic. */}
          {(() => {
            const cs = casosPorPersona?.[x.persona.id] || [];
            if (!cs.length) return null;
            return (
              <div className="eqf-casos">
                {cs.slice(0, 2).map(c => (
                  /* El ⚡ va DENTRO de la píldora, no al lado: con dos casos en
                     la misma línea, dos rayos sueltos obligan a adivinar cuál
                     abre cuál — el mismo problema que tenían los recibos con su
                     globo, y la misma solución. */
                  <span key={c.id} className="eqf-caso-w">
                    <Link href={`/caso/${c.id}`} className="eqf-caso"
                      title={`${rotuloEstado(c.estado || "", c.tipo)} · ${c.titulo}`}>
                      {/* El punto toma el color del estado por `currentColor`:
                          el rótulo entero («Sin Resolver») no cabe al lado de un
                          título y ya está en el tooltip. */}
                      <i className={`eqf-caso-pt st-${claseEstado(c.estado || "", c.tipo)}`} />
                      {c.titulo}
                    </Link>
                    {/* El mismo ⚡ de los casos en el tablero y en la búsqueda:
                        leer, comentar, cambiar estado o responsable sin salir de
                        la revisión. Ir al caso y volver es empezar la lista otra
                        vez cuando vas por la fila catorce de veintiséis. */}
                    <VistaRapida pubId={c.id} />
                  </span>
                ))}
                {cs.length > 2 && (
                  <span className="eqf-sep" title={cs.slice(2).map(c => c.titulo).join(" · ")}>
                    +{cs.length - 2}
                  </span>
                )}
              </div>
            );
          })()}

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

  /* ── EL CUERPO DE LAS DOS VISTAS AGRUPADAS ──
     Reutiliza `fila` sin tocarla. Lo que cambia no es cómo se pinta una
     persona, sino QUÉ persona: en cada grupo va con los recibos de ESE grupo y
     su subtotal, nunca con su total del fondo. Si arrastrara el total, las
     etapas sumarían más que el fondo y nadie sabría por qué. */
  const bloqueAgrupado = () => {
    if (!agrupado) return null;
    const { grupos, sinRecibos } = agrupado;
    const eje = vista === "etapa" ? "etapa" : "rubro";
    return (
      <>
        {grupos.length === 0 && (
          <div className="eqf-vacio">
            Todavía no hay ningún recibo girado en este fondo, así que no hay nada
            que repartir por {eje}.
          </div>
        )}
        {grupos.map(g => (
          <div key={g.clave || "__sin"} style={{ marginTop: 14 }}>
            <div className={`sec-h${g.clave ? "" : " sec-h-pend"}`}>
              {g.clave ? (vista === "etapa" ? "🎬" : "📊") : "◻"} {g.nombre}
              {/* El monto del grupo es el dato, no el número de personas: la
                  pregunta es «cuánto se fue aquí». Va primero por eso. */}
              <span className="sec-h-dato">{soles(g.total)}</span>
              <span className="sec-h-sub">
                {g.gente.length} {g.gente.length === 1 ? "persona" : "personas"} ·{" "}
                {g.recibos} {g.recibos === 1 ? "recibo" : "recibos"}
                {!g.clave && ` — falta clasificarlos, y hasta que se haga no cuadran contra el presupuesto`}
              </span>
            </div>
            {g.gente.map(a => fila(a.integrante))}
          </div>
        ))}

        {/* ── LOS QUE NO TIENEN RECIBO ──
            No tienen etapa ni rubro porque no hay nada que clasificar. Se
            listan igual, al final y apagados: sacarlos de esta vista los
            volvería invisibles justo donde se revisa si falta alguien por
            pagar. Aquí `fila` ya los apaga sola —cero recibos—. */}
        {sinRecibos.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="sec-h sec-h-off">
              ○ Sin recibos girados · {sinRecibos.length}
              <span className="sec-h-sub">no tienen {eje} porque no hay nada que clasificar</span>
            </div>
            {sinRecibos.map(fila)}
          </div>
        )}
      </>
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

      {/* ── TRES FORMAS DE LEER LA MISMA LISTA ──
          No son tres pantallas: son la misma gente y los mismos recibos
          contestando tres preguntas distintas. «¿A quién se le giró?» la
          contesta la general; «¿en qué se fue la plata de postproducción?» y
          «¿quién cobró contra Recursos Técnicos?» son las que hace DAFO al
          leer la rendición, y hasta ahora había que exportar a mano.
          El número va en la pestaña a propósito: «Por rubro · 1» avisa de que
          está todo sin clasificar ANTES de entrar, que es cuando sirve. */}
      <div className="eqf-vistas">
        <button className={`vtab${vista === "general" ? " on" : ""}`}
          onClick={() => setVista("general")}
          title="Todo el equipo, con lo que cobró cada quien">👥 General</button>
        <button className={`vtab${vista === "etapa" ? " on" : ""}`}
          onClick={() => setVista("etapa")}
          title="Los recibos repartidos por etapa de producción. Quien cobró en dos etapas sale en las dos, con el monto de cada una.">
          🎬 Por etapa · {porEtapa.grupos.length}
        </button>
        <button className={`vtab${vista === "rubro_item" ? " on" : ""}`}
          onClick={() => setVista("rubro_item")}
          title="Los recibos repartidos por partida del presupuesto — es como DAFO lee la rendición.">
          📊 Por rubro · {porRubro.grupos.length}
        </button>
        <span style={{ flex: 1 }} />
        {/* ── UNA SOLA PUERTA PARA SUMAR, Y EN LAS TRES VISTAS ──
            Estaba dentro de la cabecera de «Personal del fondo», que solo
            existe en la general: al añadir las otras dos, sumar a alguien
            habría exigido volver a una vista concreta para encontrar el botón.
            Aquí arriba está siempre, y sigue siendo el único sitio — antes
            había además un formulario en línea con buscador por nombre, y de
            las dos formas la que estaba a la vista era justo la que no deja
            filtrar por región ni especialidad. */}
        {puedeEditar && (
          <SumarPersonalFondo postulacionId={postulacionId}
            personas={personasTabla} vistas={vistasPersona}
            /* Todos los que ya figuran, vengan de donde vengan: del equipo
               declarado, de un recibo girado o de una alta a mano. Marcar solo
               los apuntados a mano habría invitado a volver a sumar a quien ya
               cobró — y `sumarPersonalFondo` lo aceptaría, dejando a la misma
               persona dos veces en la lista. */
            yaEstan={todos.map(x => x.persona.id)} />
        )}
      </div>

      {agrupado ? bloqueAgrupado() : (
      <>
      <div className="sec-h">
        🏆 Equipo declarado en la postulación · {declarados.length}
        <span className="sec-h-sub">firmado en el expediente — se corrige allí</span>
      </div>
      {declarados.length ? declarados.map(fila) : (
        <div className="eqf-vacio">La postulación no registró equipo.</div>
      )}

      <div className="sec-h" style={{ marginTop: 16 }}>
        👷 Personal del fondo · {personal.length}
        <span className="sec-h-sub">sale solo de los recibos girados; a mano se apunta lo previsto</span>
      </div>

      {personal.length ? personal.map(fila) : (
        <div className="eqf-vacio">
          Nadie más todavía. En cuanto se gire el primer recibo a alguien de fuera del
          equipo declarado, aparecerá aquí solo.
        </div>
      )}
      </>
      )}
    </div>
  );
}
