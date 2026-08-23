"use client";
import { aprobarJornada, editarJornada, borrarJornada } from "@/app/actions";
import Avatar from "@/components/Avatar";
import DiaContexto from "@/components/DiaContexto";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FRACCIONES, metaFraccion, fechaHum, esFinde, TIPOS_JORNADA, metaTipo,
  montoJornada, type Tarifas } from "@/lib/jornadas";

/* En el modo edición cabe solo el ícono: son tres botones dentro de una fila
   que ya lleva fecha, proyecto, duración, nota y dos botones más. */
const TIPOS: [string, string][] = TIPOS_JORNADA.map(t => [t.v, t.ico]);

const money = (n: number | null) => n != null ? `S/ ${Math.round(n).toLocaleString("es-PE")}` : "—";

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", fontSize: 12, color: "var(--text)", outline: "none" } as const;

function FilaJornada({ j, esAdmin, puedeEditar, proyectos, tarifas, onChange }: {
  j: any; esAdmin: boolean; puedeEditar: boolean; proyectos: { id: string; nombre: string }[];
  /** Las tarifas de esta persona, para poder ENSEÑAR el importe recalculado en
   *  vez de prometerlo. Sin ellas el ↻ no aparece: un botón que no puede hacer
   *  su trabajo es peor que ninguno. */
  tarifas?: Tarifas | null;
  onChange: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fecha, setFecha] = useState(j.fecha);
  const [proyectoId, setProyectoId] = useState(j.proyecto_id || "");
  const [tipo, setTipo] = useState(j.tipo);
  const [fraccion, setFraccion] = useState<number>(Number(j.fraccion));
  const [noche, setNoche] = useState(!!j.noche);
  const [notas, setNotas] = useState<string>(j.notas || "");
  /* El importe, como TEXTO y no como número: vacío tiene que poder existir, y
     es lo que significa «recalcula tú». Con un `number` el vacío se convierte
     en NaN o en 0, y 0 es un importe. */
  const [monto, setMonto] = useState<string>(
    j.monto != null ? String(Math.round(Number(j.monto))) : "");
  /* Si se entró a editar pulsando «＋ nota», el cursor va ahí. Quien pulsa eso
     viene a escribir una frase, no a repasar la fecha y el proyecto. */
  const [aNota, setANota] = useState(false);
  /* Lo que costaría esta jornada con la tarifa de HOY, tal como está el
     formulario ahora mismo: cambia al tocar el tipo, la fracción o el
     pernocte, que es cuando importa volver a mirarlo. */
  const calculado = montoJornada(
    tipo, tipo === "oficina" ? fraccion : 1, tipo !== "oficina" && noche, tarifas);

  const aprobar = async (v: boolean) => {
    setOcupado(true); const r: any = await aprobarJornada(j.id, v); setOcupado(false);
    if (r?.error) alert(r.error); else onChange();
  };
  const guardar = async () => {
    setOcupado(true);
    const r: any = await editarJornada(j.id, fecha, proyectoId || null, tipo,
      tipo === "oficina" ? fraccion : 1, tipo !== "oficina" && noche, notas,
      esAdmin ? monto : undefined);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    setEdit(false); setANota(false); onChange();
  };
  const borrar = async () => {
    const r: any = await borrarJornada(j.id); setBorrando(false);
    if (r?.error) alert(r.error); else onChange();
  };

  if (edit) {
    return (
      <div className="info-row" style={{ gap: 7, flexWrap: "wrap", background: "var(--bg)", borderRadius: 9, padding: 8 }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: 140 }} />
        <MiniSelect value={proyectoId}
          options={[["", "🏢 Oficina"], ...proyectos.map(p => [p.id, `📁 ${p.nombre}`])]}
          onSelect={setProyectoId} buttonClass="" buttonStyle={{ ...inp, minWidth: 150 }} />
        <span className="jr-seg">
          {TIPOS.map(([v, l]) => (
            <button key={v} className={tipo === v ? "on" : ""}
              onClick={() => { setTipo(v); if (v === "oficina") setNoche(false); else setFraccion(1); }}>{l}</button>
          ))}
        </span>
        {tipo === "oficina" && (
          <span className="jr-seg">
            {FRACCIONES.map(f => (
              <button key={f.v} className={fraccion === f.v ? "on" : ""}
                title={f.ayuda} onClick={() => setFraccion(f.v)}>
                <span className="jr-dur-ico">{f.ico}</span> {f.corto}
              </button>
            ))}
          </span>
        )}
        {tipo !== "oficina" && (
          <button className={`jr-chip ${noche ? "on" : ""}`} onClick={() => setNoche(n => !n)}>🏕 {noche ? "✓" : ""}</button>
        )}
        {/* ── EL IMPORTE ──
            El monto es una FOTO del cálculo al registrar, a propósito: subir
            una tarifa no reescribe lo que ya se pagó. Pero eso dejaba sin
            salida el caso contrario —la jornada apuntada con la tarifa vieja
            por error— y arreglarla exigía SQL.
            Vacío significa «recalcula con la tarifa de hoy», que es lo que
            esta pantalla hacía siempre y sigue haciendo si no se toca. Un
            número, «este importe y no otro».
            Solo administración: quien edita puede ser el dueño de la fila, o
            sea justo quien cobra. El servidor lo exige otra vez. */}
        {esAdmin && (
          <span className="jr-ed-monto">
            S/
            <input value={monto} onChange={e => setMonto(e.target.value)}
              inputMode="decimal" placeholder="recalcular"
              onKeyDown={e => { if (e.key === "Enter") guardar(); }}
              style={{ ...inp, width: 82 }} />
            {/* ── EL ↻ ENSEÑA EL NÚMERO, Y SI NO HAY, DICE POR QUÉ ──
                Antes solo vaciaba el campo y el cálculo pasaba en el servidor
                al guardar: se pulsaba «recalcular» y no se recalculaba nada
                visible. Ahora pone el importe con la tarifa de hoy DENTRO del
                campo — la misma función que usa el servidor, así que no hay
                dos cálculos que puedan discrepar.

                Y AQUÍ SIEMPRE HAY ALGO. El botón se escondía en dos casos que
                desde fuera se ven igual: cuando el importe YA coincide con la
                tarifa de hoy, y cuando esa persona no tiene tarifa cargada. En
                los dos no pasaba nada al mirar, y en el segundo el arreglo ni
                siquiera está en esta pantalla —está en su ficha—. Un botón
                ausente no dice cuál de las dos cosas es. */}
            {calculado == null
              ? <span className="jr-tarifa-no"
                  title="Esta persona no tiene tarifa cargada en su ficha, así que no hay con qué recalcular. Se arregla en su ficha de persona (Tarifas, en /admin).">
                  sin tarifa
                </span>
              : Math.round(calculado) === Number(monto)
              ? <span className="jr-tarifa-ok"
                  title={`Este importe ya es el que sale de la tarifa de hoy (S/ ${Math.round(calculado)}). Si no es el correcto, lo que está desactualizado es la tarifa de su ficha.`}>
                  = tarifa de hoy
                </span>
              : <button className="dato-btn" style={{ whiteSpace: "nowrap" }}
                  title={`Poner el importe con la tarifa de hoy: S/ ${Math.round(calculado)}`}
                  onClick={() => setMonto(String(Math.round(calculado)))}>
                  ↻ {Math.round(calculado)}
                </button>}
          </span>
        )}
        {/* La nota también se corrige aquí. Sin esto, un dedazo quedaba fijo
            para siempre —la acción no la aceptaba y el modo edición no la
            enseñaba— y encima DESAPARECÍA de la pantalla al entrar a editar,
            que es como se ve un dato que se está perdiendo aunque no se pierda.
            Vaciarla es válido: borrar una nota equivocada es tan necesario como
            escribirla. */}
        <input value={notas} onChange={e => setNotas(e.target.value)}
          placeholder="nota del día (opcional)" maxLength={300} autoFocus={aNota}
          onKeyDown={e => { if (e.key === "Enter") guardar(); }}
          style={{ ...inp, flex: "1 1 180px", minWidth: 120 }} />
        <button className="btn" style={{ padding: "5px 11px", fontSize: 11.5 }} disabled={ocupado} onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
        <button className="btn btn-ghost" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={() => {
            /* Cancelar devuelve la nota a como estaba: si no, la fila seguiría
               enseñando la vieja y el formulario recordaría la nueva, y al
               volver a abrir aparecería un texto que nadie guardó. */
            setNotas(j.notas || "");
            setMonto(j.monto != null ? String(Math.round(Number(j.monto))) : "");
            setANota(false); setEdit(false);
          }}>Cancelar</button>
      </div>
    );
  }

  /* Una sola línea, sin `flex-wrap`. Con wrap, el ✕ de borrar caía a un
     segundo renglón en cuanto la fila crecía un poco —el 🏕 del pernocte
     bastaba— y esa fila pasaba a ocupar el doble sin decir por qué. Lo que
     cede es el NOMBRE DEL PROYECTO, con puntos suspensivos: es el único dato
     de la fila que se puede recortar sin perder sentido, y el completo queda
     en el tooltip. Los botones nunca se mueven de sitio. */
  return (
    /* ── DOS RENGLONES, Y EL SEGUNDO SOLO SI HAY NOTA ──
       La nota estaba EN la línea, compitiendo por el espacio elástico con el
       nombre del proyecto. El efecto era el que se ve enseguida: las filas con
       nota empujaban la duración, el monto y el estado hacia la izquierda, y
       las que no la tenían los dejaban a la derecha. Cuatro columnas que
       cambian de sitio según un dato opcional — o sea, ninguna columna.
       Ahora la nota baja a su propio renglón y la línea de arriba mide siempre
       lo mismo. Es la misma forma que la lista de /obligaciones, por la misma
       razón. */
    <div className="info-row jr-fila">
      <div className="jr-l1">
      <span className={`jr-fecha${esFinde(j.fecha) ? " finde" : ""}`} title={j.fecha}>
        {fechaHum(j.fecha)}
      </span>
      {/* ── EL TIPO, COMO CHIP Y CON SU PALABRA ──
          Era un emoji suelto pegado al nombre de la persona: «🎬 JohnO». Dos
          problemas. Uno, el tipo no es una propiedad de la persona y leerlos
          juntos los mezcla. Dos, un dibujo de doce píxeles hay que
          descifrarlo — y 🎬 y 🚙 a ese tamaño son dos manchas.
          Con la palabra al lado no hay nada que descifrar, y el chip lo separa
          del nombre.

          ── Y CADA TIPO CON SU TINTE ──
          Nacieron los tres del mismo gris por miedo a competir con la etiqueta
          de la duración, dos columnas más allá. El miedo era razonable y la
          respuesta, equivocada: en una tarjeta de treinta filas la columna se
          volvía una mancha y había que LEER la palabra para ver que el jueves
          fue rodaje y el viernes oficina. Lo que compite no es el color, es la
          SATURACIÓN — a un 8 % el tinte agrupa sin gritar, y el número de
          jornadas sigue siendo lo único fuerte de la fila.
          El tono sale de `TIPOS_JORNADA`, no de aquí: son los mismos tres
          chips en la bitácora personal y en /admin. */}
      <span className={`jr-tipo${metaTipo(j.tipo).tono ? ` t-${metaTipo(j.tipo).tono}` : ""}`}
        title={`Jornada de ${metaTipo(j.tipo).txt.toLowerCase()}`}>
        {metaTipo(j.tipo).ico} {metaTipo(j.tipo).txt}
      </span>
      <span className="jr-quien">{j.persona}</span>
      <span className="jr-proy" title={j.proyecto || "sin proyecto"}>{j.proyecto || "sin proyecto"}</span>
      {/* CUÁNTO Y DE QUÉ CLASE. «1j» y «1.5j» en el mismo gris obligan a leer
          el número para ver que una fila no es como la de arriba; en treinta
          filas eso no se hace. Cada uno de los cuatro tiempos con su tono, y
          el pernocte SEPARADO: no es más tiempo —el rodaje sigue siendo un
          día— es que además se durmió fuera, y por eso paga aparte. Metidos en
          la misma etiqueta, «1j 🏕» se leía como una jornada normal con un
          adorno, cuando cuesta el doble. */}
      <span className={`jr-dur t-${metaFraccion(j.fraccion).tono}`} title={metaFraccion(j.fraccion).ayuda}>
        {/* El rótulo sale de `FRACCIONES` y no se arma aquí. Antes era
            `corto + (v===1 ? "día" : "j")`, o sea una quinta forma de nombrar
            las mismas cuatro cosas, escrita en un componente. */}
        <span className="jr-dur-ico">{metaFraccion(j.fraccion).ico}</span>
        {metaFraccion(j.fraccion).largo}
      </span>
      {j.noche && <span className="jr-pernocte" title="Con pernocte: se durmió fuera. Se paga aparte del día.">🏕 pernocte</span>}
      <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{money(j.monto)}</span>
      <span className="badge jr-est" style={{
        fontSize: 10.5,
        color: j.aprobada ? "var(--green)" : "var(--yellow)",
        background: j.aprobada ? "rgba(46,204,113,.12)" : "rgba(244,180,0,.12)",
      }}>{j.aprobada ? "✅ aprobada" : "⏳ pendiente"}</span>
      {esAdmin && (j.aprobada
        ? <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(false)}>↩ quitar</button>
        : <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(true)}>✅ aprobar</button>)}
      {/* Qué más hizo ese día. Al lado de editar porque se usa JUNTO: se mira
          el contexto y se decide si la jornada cuadra. */}
      {j.persona_id && <DiaContexto personaId={j.persona_id} fecha={j.fecha} quien={j.persona} />}
      {/* Escribir la nota que falta. Va AQUÍ, entre los botones de la derecha,
          y no en el renglón de abajo: allí obligaba a TODAS las filas a medir
          dos líneas para ofrecer algo que casi ninguna necesita —treinta filas
          pasaban a sesenta renglones—. Aquí es un botón más de un grupo que ya
          existe, de ancho fijo, y el segundo renglón vuelve a aparecer solo
          cuando hay algo escrito.
          Con su propio ícono y no reusando el ✎: «editar la jornada» y
          «cuéntame el día» son dos cosas, y era justo no distinguirlas lo que
          hacía que nadie encontrara la nota. */}
      {puedeEditar && !j.notas && (
        <button className="dato-btn" title="Escribir la nota del día"
          onClick={() => { setANota(true); setEdit(true); }}>🗒</button>
      )}
      {puedeEditar && <button className="dato-btn" title="Editar" onClick={() => setEdit(true)}>✎</button>}
      {puedeEditar && (borrando
        ? <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={borrar}>sí</button>{" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(false)}>no</button></span>
        : <button className="dato-btn" style={{ color: "var(--dim)" }} title="Borrar" onClick={() => setBorrando(true)}>✕</button>)}
      </div>

      {/* ── EL SEGUNDO RENGLÓN, SOLO SI HAY NOTA ──
          Es lo que convierte «1 jornada · S/ 160» en algo revisable tres meses
          después, cuando llega la liquidación y nadie recuerda por qué hubo
          rodaje un domingo. En gris y debajo: no decide el pago, lo explica.
          Y una fila sin nota mide exactamente lo que medía antes. */}
      {j.notas && <div className="jr-nota" title={j.notas}>{j.notas}</div>}
    </div>
  );
}

/* Nombre del mes de una fecha ISO: «2026-07-…» → «julio 2026». */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const rotuloMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} ${a}`;
};
/** Todos los días de un mes «AAAA-MM», sin pasar de hoy. */
const diasDelMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const ultimo = new Date(a, m, 0).getDate();
  const enCurso = hoy.getFullYear() === a && hoy.getMonth() + 1 === m;
  /* En el mes en curso se corta en HOY: pintar en cero los días que aún no han
     llegado sería contarlos como no trabajados. */
  const tope = enCurso ? hoy.getDate() : (new Date(a, m - 1, 1) > hoy ? 0 : ultimo);
  return Array.from({ length: tope }, (_, i) =>
    `${a}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
};

export default function BitacoraJornadas({ items, esAdmin = false, miPersonaId = "", proyectos = [], titulo = "🗒 Jornadas del mes", bloqueado = false, porMes = false, diasVacios = false, plegable = true, horasPorPersona, diasPorPersona, mesFranja, ausentes = [], tarifas }: {
  items: any[]; esAdmin?: boolean; miPersonaId?: string; proyectos?: { id: string; nombre: string }[]; titulo?: string; bloqueado?: boolean;
  /** Subdivide cada persona por mes. Para listas que cruzan varios. */
  porMes?: boolean;
  /** Pinta también los días sin jornada, apagados y en 0.
   *  ⚠ Solo tiene sentido si `items` trae el mes COMPLETO. Con una lista
   *  filtrada (p. ej. solo pendientes), un día ya aprobado se dibujaría como
   *  «no trabajado», que es mentira sobre lo que ya se revisó. */
  diasVacios?: boolean;
  /** Envolver todo en un plegable con su rótulo.
   *
   *  En /jornadas sí: el detalle diario son treinta filas al final de una
   *  página con más cosas, y poder cerrarlo de un clic es la diferencia entre
   *  ver tu resumen y hacer scroll hasta encontrarlo.
   *  En administración no: la pestaña YA es la sección. Ahí el rótulo repetía
   *  el mes y el «por aprobar» que están dos líneas más arriba, y cerrarlo
   *  dejaba la pantalla en negro — un control cuyo único efecto es esconder
   *  todo lo que hay. */
  plegable?: boolean;
  /** A qué hora trabajó cada persona en el periodo, en 24 cubos.
   *
   *  La lupa de un día contesta «¿qué hizo el martes?»; esta barra contesta la
   *  pregunta de antes: «¿a qué hora trabaja esta persona?». Un mes de
   *  jornadas de oficina todas iguales no lo dice, y el sistema sí lo sabe.
   *  Llega calculada de fuera —dos consultas para todas las personas del mes—
   *  porque hacerla aquí serían tantas consultas como filas. */
  horasPorPersona?: Record<string, number[]>;
  /** Y la otra escala: cuánto hizo cada día del mes. La de horas dice si
   *  trabaja de mañana; ésta, si el mes fue parejo o se concentró en una
   *  semana — y si hubo domingos, que al aprobar es lo que se mira. */
  diasPorPersona?: Record<string, number[]>;
  /** Primer día del mes de las franjas («2026-08-01»), para saber qué día de
   *  la semana cae cada barra. */
  mesFranja?: string;
  /** Quienes NO registraron ni una jornada este mes pero sí tocaron el sistema.
   *  Van al final, con su silueta y sin filas. */
  ausentes?: { id: string; nombre: string; foto?: string | null }[];
  /** Tarifa de cada persona, por id. Solo hace falta donde el importe se puede
   *  editar —administración—, y es de donde sale el número que enseña el ↻. */
  tarifas?: Record<string, Tarifas>;
}) {
  const router = useRouter();
  const onChange = () => router.refresh();
  const pend = items.filter(j => !j.aprobada).length;

  /* ── Agrupado por PERSONA ──
   * Treinta y nueve filas seguidas ordenadas por fecha obligan a reconstruir a
   * ojo cuánto lleva cada quien: la fila dice el nombre, pero el total no está
   * en ninguna parte y hay que sumarlo mentalmente saltando entre nombres.
   * Aprobar es una decisión POR PERSONA —«¿le corresponden estas doce
   * jornadas?»—, así que ese es el grupo natural.
   * Dentro de cada persona se conserva el orden que traía (por fecha): el
   * detalle diario sigue leyéndose como un diario. */
  /* ── DOS NOMBRES, Y CADA UNO EN SU SITIO ──
     La CABECERA del grupo lleva el nombre completo: se lee una vez y es donde
     hay que reconocer a quién se le está aprobando el mes. Las FILAS llevan el
     corto: son treinta seguidas de la misma persona, y repetir «John Oros
     Condori» treinta veces es ruido, no información.
     Antes la cabecera también llevaba el corto, y con el rótulo de fuera fuera
     esa cabecera pasó a ser lo único que dice de quién es la tarjeta. */
  const grupos = new Map<string, { nombre: string; alias: string | null; foto: string | null; items: any[] }>();
  items.forEach(j => {
    const k = j.persona_id || j.persona || "—";
    const g = grupos.get(k)
      || { nombre: j.personaLargo || j.persona || "—",
           alias: j.personaLargo ? (j.persona || null) : null,
           foto: j.personaFoto || null, items: [] };
    g.items.push(j); grupos.set(k, g);
  });
  /* Primero quien tiene más por aprobar: es lo accionable. A igual pendiente,
     alfabético — un orden que no depende de los datos no se mueve solo. */
  const lista = [...grupos.entries()]
    .map(([id, g]) => {
      const p = g.items.filter(j => !j.aprobada);
      return {
        id, ...g,
        nPend: p.length,
        jorn: g.items.reduce((s, j) => s + (Number(j.fraccion) || 0), 0),
        montoPend: p.reduce((s, j) => s + (Number(j.monto) || 0), 0),
        monto: g.items.reduce((s, j) => s + (Number(j.monto) || 0), 0),
      };
    })
    .sort((a, b) => b.nPend - a.nPend || a.nombre.localeCompare(b.nombre, "es"));

  const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

  /* Plegable por persona. Arranca ABIERTO quien tiene algo por aprobar y
     cerrado quien no: lo que está resuelto no necesita ocupar pantalla, y así
     lo primero que se ve es lo que hay que hacer. Con una sola persona
     —/jornadas, que es personal— se abre igual: plegar tu propio mes cuando es
     lo único que hay solo esconde la página.
     `useState` con inicializador y no un `<details open>`: React reescribe el
     atributo en cada render y el panel se volvería a abrir solo. */
  const [cerrados, setCerrados] = useState<Set<string>>(() =>
    new Set(lista.length > 1 ? lista.filter(g => g.nPend === 0).map(g => g.id) : []));
  const alternar = (id: string) =>
    setCerrados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* CADA PERSONA, SU TARJETA. Antes había UNA tarjeta con todo dentro —el mes
     entero, las cuatro personas, sus cuarenta filas— y aprobar es una decisión
     por persona: «¿le corresponden a MichelM estas ocho jornadas?». Con las
     cuatro en la misma caja, el marco de fuera agrupaba lo que no va junto y
     no había nada separando lo que sí.
     El plegable de arriba se queda —sin caja— porque en /jornadas es el fold
     de «Detalle diario del mes», y ahí sirve: esconde treinta filas de un
     tirón. Lo que se va es su borde, que era el que sobraba. */
  const cuerpo = (
      <div style={{ marginTop: 8 }}>
        {lista.map(g => (
          <div key={g.id} className="jr-grupo card">
            <div className="jr-grupo-h">
              <button className="dato-btn jr-plegar"
                title={cerrados.has(g.id) ? `Ver las jornadas de ${g.nombre}` : "Plegar"}
                onClick={() => alternar(g.id)}>{cerrados.has(g.id) ? "▸" : "▾"}</button>
              {/* La cara, una vez por persona y no por fila: dentro de la
                  tarjeta todas las filas son suyas, así que repetirla treinta
                  veces sería ruido. Aquí, en cambio, es lo que distingue una
                  tarjeta de la de abajo cuando /admin apila a cuatro. */}
              <Avatar nombre={g.nombre} src={g.foto} size={24} />
              <b>{g.nombre}</b>
              {g.alias && g.alias !== g.nombre && (
                <i style={{ color: "var(--dim)", fontSize: 11.5, fontStyle: "normal" }}>{g.alias}</i>
              )}
              <span className="jr-grupo-n">{g.jorn}j · {g.items.length} registro{g.items.length === 1 ? "" : "s"}</span>
              <span style={{ flex: 1 }} />
              {g.nPend > 0
                ? <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                    ⏳ {g.nPend} · {soles(g.montoPend)}
                  </span>
                : <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>✅ al día</span>}
              <span className="jr-grupo-t">{soles(g.monto)}</span>
            </div>
            <FranjasPersona personaId={g.id} quien={g.nombre}
              hs={horasPorPersona?.[g.id]} ds={diasPorPersona?.[g.id]} mesFranja={mesFranja} />
            {!cerrados.has(g.id) && (() => {
              const pinta = (j: any) => (
                <FilaJornada key={j.id} j={j} esAdmin={esAdmin}
                  puedeEditar={!bloqueado && (esAdmin || (j.persona_id === miPersonaId && !j.aprobada))}
                  tarifas={tarifas?.[j.persona_id] || null}
                  proyectos={proyectos} onChange={onChange} />
              );
              if (!porMes) return g.items.map(pinta);

              /* Por mes: una lista que cruza julio y agosto se lee como una
                 sola tanda y esconde que lo de julio lleva ahí un mes. Cada
                 mes con su propio recuento, del más reciente al más viejo —lo
                 nuevo es lo que se aprueba primero—. */
              const meses = new Map<string, any[]>();
              g.items.forEach(j => {
                const k = String(j.fecha || "").slice(0, 7);
                meses.set(k, [...(meses.get(k) || []), j]);
              });
              return [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([ym, js]) => {
                const nP = js.filter(j => !j.aprobada).length;
                const porDia = new Map<string, any[]>();
                js.forEach(j => porDia.set(j.fecha, [...(porDia.get(j.fecha) || []), j]));
                const dias = diasVacios ? diasDelMes(ym) : [];
                const vacios = dias.filter(d => !porDia.has(d)).length;
                return (
                  <div key={ym} className="jr-mes">
                    <div className="jr-mes-h">
                      <span>{rotuloMes(ym)}</span>
                      <span className="jr-grupo-n">
                        {js.reduce((s, j) => s + (Number(j.fraccion) || 0), 0)}j
                        {nP > 0 && <> · ⏳ {nP}</>}
                        {vacios > 0 && <> · {vacios} día(s) sin registrar</>}
                      </span>
                    </div>
                    {diasVacios
                      ? dias.slice().reverse().map(d => {
                          const js2 = porDia.get(d);
                          if (js2) return js2.map(pinta);
                          /* Un día sin jornada se ve, apagado: el hueco es el
                             dato —no se distingue «descansó» de «lo olvidó»—
                             y después de aprobar el mes corregirlo cuesta. */
                          return (
                            <div key={d} className="info-row jr-fila jr-dia-vacio">
                              <div className="jr-l1">
                              <span className={`jr-fecha${esFinde(d) ? " finde" : ""}`}>{fechaHum(d)}</span>
                              {/* El hueco del tipo, vacío pero presente: sin él
                                  la fecha del día en blanco quedaría a otra
                                  altura que las de arriba, y una columna que
                                  se descoloca cada pocas filas no se recorre
                                  con la vista. */}
                              <span className="jr-tipo" aria-hidden>—</span>
                              <span className="jr-proy">—</span>
                              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>0j</span>
                              {/* AQUÍ es donde esto de verdad sirve: un día en
                                  blanco no distingue «descansó» de «se le
                                  olvidó registrar», y el sistema sí lo sabe. */}
                              <DiaContexto personaId={g.id} fecha={d} quien={g.nombre} />
                              </div>
                            </div>
                          );
                        })
                      : js.map(pinta)}
                  </div>
                );
              });
            })()}
          </div>
        ))}
        {/* ── LOS QUE NO REGISTRARON NADA ──
            Una persona sin jornadas en el mes simplemente no salía: la lista
            se arma de las filas que hay, y donde no hay filas no hay nombre.
            Pero «no trabajó» y «no lo anotó» se ven igual desde fuera —son las
            dos una ausencia— y solo a uno de los dos hay que ir a preguntarle.
            Es el mismo hueco que ya se pinta día a día dentro de cada persona,
            una escala más arriba.
            Solo aparecen los que SÍ dejaron rastro en el sistema ese mes: a
            quien no trabajó no hay nada que reclamarle, y una lista con todo
            el personal cada mes se deja de leer a la tercera vez. La silueta
            de al lado es la prueba de que hay algo que preguntar. */}
        {ausentes.map(a => (
          <div key={a.id} className="jr-grupo card jr-grupo-aus">
            <div className="jr-grupo-h">
              <span className="jr-plegar" aria-hidden>·</span>
              <Avatar nombre={a.nombre} src={a.foto} size={24} />
              <b>{a.nombre}</b>
              <span className="jr-grupo-n">sin jornadas registradas</span>
              <span style={{ flex: 1 }} />
              <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                ⚠ hubo actividad
              </span>
            </div>
            <FranjasPersona personaId={a.id} quien={a.nombre}
              hs={horasPorPersona?.[a.id]} ds={diasPorPersona?.[a.id]} mesFranja={mesFranja} />
            <div className="jr-aus-pie">
              No anotó ni una jornada este mes, pero trabajó en el sistema los días de la franja.
              Abre un día para ver qué hizo.
            </div>
          </div>
        ))}
        {!items.length && !ausentes.length && <div className="empty">Sin jornadas este mes.</div>}
      </div>
  );

  /* ── CUÁNDO SOBRA EL ENVOLTORIO ──
     El plegable de fuera existe para esconder treinta filas de un tirón cuando
     hay VARIAS personas: es lo que agrupa a las cuatro.
     Con UNA sola —que es siempre el caso de /jornadas, una pantalla personal—
     no agrupa nada y solo repite: su rótulo decía «19 · todas aprobadas ✅» y
     la cabecera de la tarjeta de dentro ya dice «20j · 19 registros · ✅ al
     día · S/ 3,230», dos centímetros más abajo. Dos cabeceras seguidas
     contando lo mismo hacen dudar de si son dos cosas distintas.
     Y el fold no se pierde: cada grupo trae el suyo (el ▾ de su izquierda),
     que esconde exactamente las mismas filas. */
  if (!plegable || lista.length <= 1) return cuerpo;
  return (
    <details className="jr-todo" open>
      <summary className="jr-todo-h">
        {titulo} · {items.length}{pend ? ` · ⏳ ${pend} por aprobar` : " · todas aprobadas ✅"}
      </summary>
      {cuerpo}
    </details>
  );
}

/* ── LAS DOS SILUETAS DE UNA PERSONA ──
 * Es una silueta, no un parte: sin números y sin ejes, solo la forma —de
 * mañana, de tarde, o repartido—. Puesta al lado del total del mes, esa forma
 * es contexto para lo que se está aprobando.
 *
 * Componente aparte y no un trozo del `map` de arriba por una razón sola:
 * necesita estado —qué día tiene la ventana abierta— y el estado no se puede
 * pedir dentro de un bucle. Uno por persona, y cada uno recuerda lo suyo.
 */
function FranjasPersona({ personaId, quien, hs, ds, mesFranja }: {
  personaId: string; quien?: string;
  hs?: number[]; ds?: number[]; mesFranja?: string;
}) {
  /* El día que se está mirando, o nada. Al elegir otro, `key` fuerza una
     ventana nueva: la vieja se quedaría con los hechos del día anterior en
     memoria y los enseñaría bajo el título del nuevo. */
  const [dia, setDia] = useState<string | null>(null);

  const hay = (a?: number[]) => !!a && a.some(n => n > 0);
  /* Una barra plana de veinticuatro ceros afirma «no trabajó a ninguna hora»
     cuando lo cierto es que esa persona no deja rastro en el sistema. */
  if (!hay(hs) && !hay(ds)) return null;
  const total = (hs || ds || []).reduce((a, b) => a + b, 0);

  /* Las dos franjas se escalan CADA UNA a su propio pico. Con una escala
     común, la de días quedaría aplastada contra la de horas sin que eso
     signifique nada: no son la misma magnitud. */
  const franja = (
    datos: number[], ico: string, pie: string, rot: (i: number) => string,
    esFin?: (i: number) => boolean,
    verDia?: (i: number) => string,
  ) => {
    const pico = Math.max(...datos);
    return (
      <div className="jr-franja">
        <span className="jr-franja-ico" aria-hidden>{ico}</span>
        <span className="jr-franja-barras">
          {datos.map((n, i) => {
            const barra = (
              <span className={`jr-franja-b${esFin?.(i) ? " finde" : ""}`}
                style={{ height: `${(n / pico) * 100}%` }} />
            );
            /* Los días SÍ se abren; las horas no. Un día es una pregunta que
               el sistema sabe contestar entera —la ventana ya existe—, y una
               hora suelta no: no hay pantalla de «las tres de la tarde». */
            return verDia
              ? (
                <button key={i} type="button" className="jr-franja-c jr-franja-c-btn"
                  title={`${rot(i)} — ${n} · ver el día`}
                  onClick={() => setDia(verDia(i))}>{barra}</button>
              )
              : <span key={i} className="jr-franja-c" title={`${rot(i)} — ${n}`}>{barra}</span>;
          })}
        </span>
        <span className="jr-franja-pie">{pie}</span>
      </div>
    );
  };

  const base = mesFranja || "";
  const iso = (dia: number) => `${base.slice(0, 8)}${String(dia).padStart(2, "0")}`;
  const dow = (dia: number) => new Date(`${iso(dia)}T12:00:00`).getDay();

  return (
    <div className="jr-franjas" title={`${total} acciones en el sistema durante el mes`}>
      {hay(hs) && franja(hs!, "🕗",
        `pico ${String(hs!.indexOf(Math.max(...hs!))).padStart(2, "0")}:00`,
        i => `${String(i).padStart(2, "0")}:00`)}
      {/* Los fines de semana en violeta, como ya se pintan las fechas de fin
          de semana en las filas de abajo. Un pico en domingo es exactamente
          lo que se busca al aprobar, y en un solo color habría que contar
          barras para verlo. */}
      {hay(ds) && base && franja(ds!, "📅",
        `pico día ${ds!.indexOf(Math.max(...ds!)) + 1}`,
        i => `día ${i + 1}`,
        i => [0, 6].includes(dow(i + 1)),
        i => iso(i + 1))}
      {dia && <DiaContexto key={dia} personaId={personaId} fecha={dia} quien={quien}
        auto alCerrar={() => setDia(null)} />}
    </div>
  );
}
