"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearSitio, guardarEn, type Destino } from "@/app/equipamiento/acciones";
import {
  textoDeRuta, codigoDeRuta, faltaCorrer, iconoDeSitio, resolvedorDeGuardado,
  casaConsulta,
  type Guardado, type Sitio, type Tramo,
} from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA ESTO — el control, en un solo sitio

   Lo usan la ficha del equipo y el panel de kits, y va a usarlo la vista por
   sitio. Escrito en tres, el de la ficha ofrecería crear un cajón nuevo y el
   de los kits no, y nadie sabría cuál es el bueno.

   ── ENSEÑA LA CADENA ENTERA, NO EL ÚLTIMO ESLABÓN ──
   «Depósito › Cajón 08 › Bolso Tenba» y no «Bolso Tenba»: para ir a buscarlo
   hace falta saber en qué cajón está el bolso. Es la misma razón por la que
   el modelo encadena en vez de guardar un texto.

   ── LO HEREDADO NO SE EDITA AQUÍ ──
   Una pieza atornillada está donde su anfitrión, y un equipo metido en su
   bolso está donde el bolso. En los dos casos el control ENSEÑA la ruta y dice
   de quién la hereda, pero el selector solo aparece cuando el dato es propio o
   no hay ninguno. Cambiar el sitio de la pieza sin desmontarla es imposible en
   la base —hay un `check`— y ofrecer un control que va a dar error es peor que
   no ofrecerlo: la salida es cambiar el sitio de quien la contiene, y eso se
   dice con un enlace en vez de con un mensaje rojo después de intentarlo.
   ══════════════════════════════════════════════════════════════════════════ */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cuántas opciones se pintan como mucho. Con seiscientos sitios, volcarlos
 *  todos convierte el desplegable en la lista que se venía a evitar. Lo que
 *  NO puede pasar es cortar en silencio: lo que sobra se dice. */
const TOPE_LISTA = 30;

export type Contenedor = {
  id: string; folio?: string | null; nombre: string;
  /** Dentro de qué va ESTE, para poder excluir a los descendientes del
   *  selector. Es `guardado_en_equipo` o `ensamblado_en`, lo que haya: la
   *  cadena de «dónde se guarda» sube por los dos. */
  dentroDe?: string | null;
};

export default function DondeSeGuarda({
  que, id, guardado, sitios, contenedores, compacto, error, cortado,
}: {
  que: "equipo" | "kit";
  id: string;
  /** Ya resuelto por `lib/sitios`: la pantalla que lo monta tiene las listas y
   *  las resuelve una vez para todas sus filas. */
  guardado: Guardado;
  sitios: Sitio[];
  /** Equipos que pueden contener a otros. Los da la pantalla: aquí no se sabe
   *  cuál es el inventario ni conviene traerlo por cada fila. */
  contenedores: Contenedor[];
  /** En una lista: solo el texto y un lápiz. En una ficha: el bloque entero. */
  compacto?: boolean;
  /** Lo que falló al leer sitios o equipos. Se DICE: sin la migración corrida
   *  el bloque saldría «sin sitio anotado» con el selector vacío, indistinguible
   *  de un equipo al que nadie le ha puesto sitio. */
  error?: string | null;
  /** Si la lista de equipos o de sitios llegó al techo de la API. Cambia lo que
   *  significa un «apunta a algo que ya no está». */
  cortado?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  /* Abrir y cerrar limpia lo escrito y el error: sin esto, un fallo se quedaba
     pegado y al volver a abrir salía el rojo de hace diez minutos encima de
     una lista nueva. */
  const alternar = () => { setAbierto(a => !a); setErr(""); setQ(""); };

  /* ⚠ ROTO o EN BUCLE no es «heredado»: es «no se sabe», y ahí SÍ hace falta
     el control — es la única forma de arreglarlo. Estaba mirando solo `origen`,
     que sigue diciendo «contenedor» aunque el contenedor no exista, y el bloque
     salía con un texto rojo, ningún botón y una frase que pedía «rómpela
     cambiando uno de los pasos» sin ofrecer con qué. En un bucle de dos bolsos
     los dos extremos quedaban así: callejón sin salida.
     La excepción es lo ATORNILLADO: ahí el check de la base prohíbe el sitio
     propio pase lo que pase, así que el control seguiría sin poder guardar. */
  const atornillado = guardado.origen === "ensamblado";
  /* ── EL KIT TAMBIÉN ES HERENCIA, Y ES LA MÁS FUERTE ──
     Un equipo que sale en un kit está donde esté el kit, y anotarle uno propio
     no lo mueve: lo desengancha. Así que aquí NO se ofrece el control, ni
     siquiera cuando el kit se ha quedado sin sitio —ahí el hueco es del kit y
     es donde hay que ir—, y por eso `porKit` entra en `heredado` sin pedirle
     que la ruta tenga algo, al revés que el contenedor.
     La disputa —dos kits en cajones distintos— también: tampoco se arregla
     aquí, se arregla decidiendo en cuál de los dos está. */
  const porKit = guardado.origen === "kit" ? guardado.porKit || null : null;
  const heredado = atornillado || !!porKit
    || (guardado.origen === "contenedor" && !guardado.roto && !guardado.bucle);
  /* De quién lo hereda: el último tramo de la cadena, que es siempre el equipo
     que lo contiene. Sirve para el enlace de «cámbialo ahí».
     Con kit no hay tramo que valga —un kit NO es un eslabón de la cadena: sus
     equipos no están «dentro» de él, están donde él esté— así que se nombra
     por su lado y la ruta se queda contando solo sitios y bolsos. */
  const deQuien: Tramo | null = !porKit && heredado && guardado.ruta.length
    ? guardado.ruta[guardado.ruta.length - 1]
    : null;
  /** Cómo se nombra a quien contesta por él, sea bolso o kit. */
  const quienManda = porKit ? `el kit «${porKit.nombre}»` : deQuien?.nombre || "";

  /* ⚠ Los DESCENDIENTES fuera del selector. `guardarEn` los rechaza subiendo
     la cadena, pero ofrecerlos y dar el error después del clic es lo que este
     archivo dice arriba que no hay que hacer. Lo que va DENTRO de esto no
     puede contenerlo: son los que tienen a `id` en su propia cadena.
     Se calcula con los mismos datos que ya viajaron —`contenedores` trae los
     dos punteros— sin pedir nada más. */
  /* ⚠ Solo cuando el selector está ABIERTO. Sin la guarda, la pestaña de
     ensamblados monta cuarenta y cuatro de estos y cada uno construía un mapa
     de quinientas entradas y recorría quinientas cadenas con su propio `Set`:
     veintidós mil recorridos en el montaje para llenar unos desplegables que
     casi nunca se abren. `PanelKits` ya pagó una versión de esto con catorce. */
  const prohibidos = useMemo(() => {
    if (!abierto) return new Set<string>([id]);
    const dentroDe = new Map<string, string | null>(
      contenedores.map(c => [c.id, c.dentroDe ?? null]));
    const malo = new Set<string>([id]);
    for (const c of contenedores) {
      let cursor: string | null = c.id;
      const vistos = new Set<string>();
      while (cursor && !vistos.has(cursor)) {
        vistos.add(cursor);
        if (cursor === id) { malo.add(c.id); break; }
        cursor = dentroDe.get(cursor) ?? null;
      }
    }
    return malo;
  }, [contenedores, id, abierto]);

  /* ── CADA SITIO, CON SU CADENA ──
     ⚠ EL NOMBRE SOLO NO IDENTIFICA UN SITIO. La lista pintaba «📍 01» seis
     veces —los seis cajones de un mueble se llaman 01…06— y encima ordenada
     alfabéticamente, así que salían todos juntos arriba del todo, lejos del
     mueble al que pertenecen y sin nada que los distinguiera. El nombre es
     único DENTRO DE SU PADRE, que es justo lo que la lista no enseñaba.

     Así que cada opción lleva su clave, y debajo dónde está: «en Oficina
     Principal › Mueble 01». Y se ordena por esa cadena y no por el nombre, para
     que los seis cajones salgan seguidos bajo su mueble en vez de encabezar la
     lista como si fueran sitios sueltos.

     Solo con el selector ABIERTO, por lo mismo que `prohibidos`: la pestaña de
     ensamblados monta cuarenta y cuatro de estos y casi ninguno se abre. */
  const sitiosConRuta = useMemo(() => {
    if (!abierto) return [];
    const r = resolvedorDeGuardado(sitios, []);
    return sitios.map(s => {
      const ruta = r.rutaDeSitio(s.id).ruta;
      return {
        s,
        /* Los padres, sin él mismo: repetir su propio nombre debajo de su
           propio nombre no dice nada. Vacío si está suelto, o si su cadena da
           vueltas —ahí `ruta` viene vacía a propósito—. */
        donde: textoDeRuta(ruta.slice(0, -1)),
        codigo: codigoDeRuta(ruta),
      };
    }).sort((a, b) =>
      `${a.donde} ${a.s.nombre}`.localeCompare(`${b.donde} ${b.s.nombre}`, "es"));
  }, [sitios, abierto]);

  const opciones = useMemo(() => {
    /* ── LA REGLA DE BÚSQUEDA VIVE EN `lib/sitios` ──
       Era aquí, y era «cada palabra en alguna parte del renglón». Con nombres
       mitad letra mitad número —«Espacio 2», «Nivel 01»— eso fallaba por los
       dos lados a la vez: «espacio 02» dejaba fuera todo el Espacio 2 (nadie
       escribió «02» ahí) y a la vez colaba compartimientos de otros espacios
       cuyo «Nivel 02» contestaba por el «02» que se había escrito. Las dos
       cosas se veían igual de normales en pantalla.
       `casaConsulta` iguala «02» con «2» y pega cada número a su palabra. El
       porqué entero, con los dos casos, está en su comentario. */
    /* Se busca también por CLAVE, por CÓDIGO y por dónde está: escribir
       «Mueble 01» tiene que encontrar sus seis cajones —que no lo llevan en el
       nombre— y pegar «OF01-M01-C03» tiene que llevar a uno solo. */
    const sit = sitiosConRuta.filter(x =>
      casaConsulta(`${x.s.nombre} ${x.s.clave || ""} ${x.codigo || ""} ${x.donde}`, q));
    const eqs = contenedores.filter(c =>
      !prohibidos.has(c.id) && casaConsulta(`${c.folio || ""} ${c.nombre}`, q));
    return {
      sitios: sit.slice(0, TOPE_LISTA), equipos: eqs.slice(0, TOPE_LISTA),
      /* Cuántos se quedaron fuera del recorte. Se CALCULABA y no se pintaba en
         ninguna parte: la lista se cortaba en treinta y el que faltaba se leía
         como «ese sitio no existe» — el mismo síntoma que traía aquí, por otra
         causa. Un recorte que no se anuncia es una mentira educada. */
      deMas: Math.max(0, sit.length - TOPE_LISTA),
    };
  }, [sitiosConRuta, contenedores, q, prohibidos]);

  async function poner(destino: Destino) {
    setOcupado(true); setErr("");
    try {
      const r: any = await guardarEn(que, [id], destino);
      if (r?.error) { setErr(r.error); return; }
      setAbierto(false); setQ("");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar.");
    } finally { setOcupado(false); }
  }

  async function crearYPoner() {
    const nombre = q.trim();
    if (!nombre) return;
    setOcupado(true); setErr("");
    try {
      const r: any = await crearSitio(nombre);
      if (r?.error) { setErr(r.error); setOcupado(false); return; }
      /* Se crea Y se pone en la misma pulsación: crear un cajón para luego
         tener que buscarlo en la lista es el paso que sobra. */
      await poner({ sitio: r.id });
    } catch (e: any) {
      setErr(e?.message || "No se pudo crear el sitio.");
      setOcupado(false);
    }
  }

  /* ── EL TEXTO, QUE ES LO QUE SE LEE ── */
  const texto = guardado.bucle
    ? "⟲ la cadena da vueltas — revísalo"
    : guardado.roto
    ? "⚠ apunta a algo que ya no está"
    : guardado.disputa
    /* Dos kits que lo guardan en cajones distintos. La cosa está en UNO, y
       elegir por nuestra cuenta sería inventarse cuál con cara de dato bueno. */
    ? "⚠ dos kits lo guardan en sitios distintos"
    : guardado.ruta.length
    ? textoDeRuta(guardado.ruta)
    : porKit
    /* Sin sitio PERO con kit no es lo mismo que sin sitio a secas: no se
       arregla aquí. Decir «sin sitio anotado» al lado de un botón «anotar»
       mandaba justo al arreglo que rompe el kit. */
    ? "sin sitio — lo pone su kit"
    : "sin sitio anotado";

  const tono = guardado.bucle || guardado.roto || guardado.disputa
    ? "var(--red)"
    : guardado.ruta.length ? "var(--text)" : "var(--dim)";

  const selector = (
    <div className="dsg-selector">
      <input className="ent-lote-inp" autoFocus placeholder="Buscar un sitio o el bolso donde va…"
        value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%" }} />
      <div className="dsg-lista">
        {/* Quitar el sitio es una respuesta, no un borrado: «ya no sé dónde
            va» es distinto de «nunca lo anoté», y la única forma de decirlo. */}
        {guardado.origen === "propio" && (
          <button type="button" className="dsg-op" disabled={ocupado}
            onClick={() => poner(null)}>
            <span className="dsg-ico">✕</span> quitarle el sitio
          </button>
        )}
        {opciones.sitios.map(({ s, donde, codigo }) => (
          <button key={s.id} type="button" className="dsg-op dsg-sitio" disabled={ocupado}
            title={codigo ? `${codigo} — ${s.nombre}${donde ? ` en ${donde}` : ""}` : undefined}
            onClick={() => poner({ sitio: s.id })}>
            <span className="dsg-ico">{iconoDeSitio(s.tipo)}</span>
            {/* ── EL CÓDIGO ENTERO, NO LA CLAVE SUELTA ──
                ⚠ Aquí salía `s.clave` —«C02»— y la clave solo es única DENTRO
                de su padre: en una lista plana de seiscientos sitios había
                catorce «C02» seguidos y la etiqueta no distinguía ninguno de
                los otros trece. Era peor que no poner nada: un identificador
                que se repite invita a fiarse de él.
                El código sí es único, porque lo lleva todo: «OF01-E02-N01-C03»
                dice oficina, espacio, nivel y compartimiento — y es lo que se
                pega en el buscador para volver.
                Vuelve a la clave solo si el código no se puede armar: eso pasa
                cuando algún sitio de la cadena no tiene clave, y entonces un
                código a medias sería el código VÁLIDO de otro sitio. */}
            {(codigo || s.clave) && (
              <span className={`badge dsg-clave${codigo ? " dsg-cod" : ""}`}>
                {codigo || s.clave}
              </span>
            )}
            <span className="dsg-op-n">{s.nombre}</span>
            {/* Dónde está, en gris y a la derecha: es lo que separa un «01» de
                otro «01», pero no es lo que se lee primero. */}
            {donde && <span className="dsg-donde">en {donde}</span>}
          </button>
        ))}
        {/* ── LO QUE NO CABE, DICHO ──
            Sin esta línea la lista se cortaba en treinta y quien buscaba el
            trigésimo primero concluía que no existía — y lo siguiente que hace
            es crearlo otra vez. */}
        {opciones.deMas > 0 && (
          <div className="dsg-vacio">
            …y {opciones.deMas} sitio(s) más que no caben. Afina la búsqueda —el
            código («OF01-E02-N01-C03») lleva a uno solo.
          </div>
        )}
        {opciones.equipos.map(c => (
          <button key={c.id} type="button" className="dsg-op" disabled={ocupado}
            onClick={() => poner({ equipo: c.id })}>
            <span className="dsg-ico">🎒</span>
            {c.folio && <span className="badge kit-folio">{c.folio}</span>}
            {c.nombre}
          </button>
        ))}
        {/* ⚠ Crear solo si NO hay ya un sitio con ese nombre en la lista de
            arriba: sin esta guarda, escribir «Cajón 07» ofrece a la vez
            elegirlo y crearlo, y el segundo botón hace un cajón duplicado…
            o no, porque `crearSitio` devuelve el que ya estaba. Ofrecer dos
            caminos para lo mismo es lo que hay que evitar, no el duplicado. */}
        {/* ⚠ Contra `sitios` entero y no contra `opciones.sitios`, que está
            recortado a treinta: con el sitio exacto en la posición treinta y
            uno se ofrecían los dos caminos a la vez. */}
        {q.trim() && !sitios.some(s => nrm(s.nombre) === nrm(q.trim())) && (
          <button type="button" className="dsg-op dsg-crear" disabled={ocupado}
            onClick={crearYPoner}>
            ＋ crear el sitio «{q.trim()}» y guardarlo ahí
          </button>
        )}
        {!opciones.sitios.length && !opciones.equipos.length && !q.trim() && (
          <div className="dsg-vacio">
            No hay sitios todavía. Escribe uno —«Cajón 07», «Depósito»— y se crea.
          </div>
        )}
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>⚠ {err}</div>}
      <button type="button" className="dato-btn" onClick={alternar}>cerrar</button>
    </div>
  );

  if (compacto) {
    return (
      /* `<div>` y no `<span>`: el selector que va dentro es un bloque —lleva su
         propia lista y su campo de texto— y un `<div>` dentro de un `<span>`
         es anidamiento inválido. No lo rompe nada visible: el parser NO
         autocierra un `<span>` ante un `<div>` (eso solo pasa con `<p>`), y
         `inline-flex` blockifica a los hijos igual. Se corrige por lo que es,
         no por un fallo observado — decir lo contrario sería inventarse un
         síntoma para justificar un cambio. Y sigue leyéndose en línea, que es
         lo único que se quería del `<span>`. */
      <div className="dsg-compacto">
        <span style={{ color: tono }} title={heredado && quienManda
          ? `Lo hereda de ${quienManda}` : undefined}>📍 {texto}</span>
        {!heredado && (
          <button type="button" className="dato-btn" onClick={alternar}>
            {guardado.ruta.length ? "cambiar" : "anotar"}
          </button>
        )}
        {/* Heredado, en compacto, se dice corto: la frase larga —y la
            distinción entre atornillado y metido en un bolso— es del bloque de
            la ficha, que tiene sitio para explicarla. El nombre de quien lo
            contiene está en el `title` del 📍 de al lado.
            ⚠ Sin ternario `atornillado ? … : …`: en compacto ese caso no
            existe. Los dos únicos usos son raíces de ensamblado —que por
            definición no están atornilladas a nada— y kits, que no tienen
            `ensamblado_en`. Una rama que no puede ejecutarse se lee como que sí
            puede, y el día que alguien la toque no sabrá que estaba muerta. */}
        {/* Con kit la frase es otra y tiene que serlo: «lo hereda del Bolso
            Tenba» y «lo pone el kit S24 básico» se arreglan en pantallas
            distintas, y la segunda además no tiene botón en ninguna. */}
        {heredado && quienManda && (
          <span className="dsg-hereda">
            {porKit ? "lo pone " : "lo hereda de "}{quienManda}
          </span>
        )}
        {abierto && selector}
      </div>
    );
  }

  return (
    <div className="card dsg-bloque">
      <div className="dsg-cab">
        <b style={{ fontSize: 13 }}>📍 Dónde se guarda</b>
        {!heredado && (
          <button type="button" className="dato-btn" onClick={alternar}>
            {guardado.ruta.length ? "cambiar" : "anotar"}
          </button>
        )}
      </div>

      <div className="dsg-ruta" style={{ color: tono }}>
        {guardado.ruta.length
          ? guardado.ruta.map((t, i) => (
            <span key={t.id} className="dsg-tramo">
              {i > 0 && <span className="dsg-sep">›</span>}
              {/* ⚠ SIN 📍 EN CADA TRAMO. Los sitios llevaban uno cada uno,
                  debajo de un título que ya dice «📍 Dónde se guarda»: cuatro
                  chinchetas idénticas en cuatro centímetros, y ninguna
                  distinguía nada porque todas eran la misma. Lo que separa un
                  tramo del siguiente es el «›», y lo que separa un sitio de un
                  bolso es el color —`dsg-sitio` contra `dsg-equipo`—.
                  El 🎒 SÍ se queda: no es decoración, es la única marca de que
                  ese eslabón es una cosa del inventario y no un mueble, y por
                  tanto de que hay algo más que abrir para llegar. */}
              <span className={t.tipo === "sitio" ? "dsg-sitio" : "dsg-equipo"}>
                {t.tipo === "equipo" && "🎒 "}{t.nombre}
              </span>
            </span>
          ))
          : texto}
      </div>

      {/* Por qué no se puede editar aquí, y dónde sí. Sin esta línea, el bloque
          es un dato sin botón y se lee como que la pantalla está rota. */}
      {heredado && (deQuien || porKit) && (
        <div className="dsg-porque">
          {porKit
            /* ⚠ La frase dice explícitamente que NO se le puede anotar uno
               propio, y no solo que se cambia en el kit. Es la diferencia entre
               «hay un atajo mejor» y «esto rompería el kit»: sin decirlo, lo
               siguiente que hace uno es buscar dónde anotárselo igualmente. */
            ? <>Sale en el kit <b>{porKit.nombre}</b>, y un kit se guarda entero:
                sus equipos están donde esté él. Cambia el sitio del kit para
                mover todo lo que lleva —anotarle uno propio a este no lo movería,
                lo sacaría de la cuenta del kit.</>
            : guardado.origen === "ensamblado"
            ? <>Está atornillado dentro de <b>{deQuien!.nombre}</b>, así que se guarda donde él.
                Para darle sitio propio hay que desmontarlo.</>
            : <>Va dentro de <b>{deQuien!.nombre}</b>. Cambia el sitio de ese
                para mover todo lo que lleva dentro.</>}
        </div>
      )}
      {/* La disputa se explica aparte porque no se arregla como las otras: no
          falta un dato ni hay una cadena rota, sobra una respuesta. */}
      {guardado.disputa && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          Sale en más de un kit y esos kits se guardan en sitios distintos. Está
          en uno de los dos, y desde aquí no hay forma de saber en cuál: sácalo
          del kit que no corresponda, o dales el mismo sitio.
        </div>
      )}
      {guardado.bucle && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          La cadena de contenedores da vueltas sobre sí misma, así que no se
          puede decir dónde acaba. Hay que romperla cambiando uno de los pasos.
        </div>
      )}
      {guardado.roto && !guardado.bucle && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          {cortado
            /* Con la lista cortada, acusar a la base sería mentir: el sitio
               existe y no llegó en esta tanda. */
            ? <>Apunta a algo que no llegó: la lista de equipos o de sitios se
                cortó en el tope de la API. No es que no exista.</>
            : <>Apunta a un sitio o a un equipo que ya no existe. Vuelve a
                anotarlo.</>}
        </div>
      )}
      {/* Sin la migración corrida esto salía «sin sitio anotado» con el
          selector vacío: idéntico a un equipo al que nadie le puso sitio. */}
      {error && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          ⚠ No se pudo leer dónde se guarda.{" "}
          {/* ⚠ Cuál de las dos migraciones falta lo decide `faltaCorrer`: con la
              tabla ya creada, «corre db/sitios.sql» manda a correr un archivo
              que no arregla nada. */}
          {faltaCorrer(error)
            ? <>Falta correr <code>{faltaCorrer(error)}</code> en Supabase.</>
            : <code style={{ fontSize: 11 }}>{error}</code>}
        </div>
      )}

      {abierto && !heredado && selector}
    </div>
  );
}
