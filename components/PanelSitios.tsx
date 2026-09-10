"use client";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { crearSitio, editarSitio, moverSitio, borrarSitio } from "@/app/equipamiento/acciones";
import RejillaSitio, { type ContenidoSitio } from "@/components/RejillaSitio";
import ChipsEquipo from "@/components/ChipsEquipo";
import ChipGrupo from "@/components/ChipGrupo";
import GuardarLote from "@/components/GuardarLote";
import type { EquipoParaPanel } from "@/lib/equipamientoDatos";
import {
  textoDeRuta, codigoDeRuta, resolvedorDeGuardado,
  claveSugerida, contenidoPorSitio, iconoDeSitio, ramasQueCasan, TIPOS_SITIO,
  type Sitio,
} from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   📍 SITIOS — LA PREGUNTA AL REVÉS

   Las otras pantallas contestan «¿dónde se guarda esto?». Esta contesta «¿qué
   hay en el Cajón 07?», que es la que se hace con el cajón delante: se abre
   para ver si está todo, o para meter algo y saber qué más había.

   ── DOS NÚMEROS POR SITIO, Y NO UNO ──
   «2 · 30» quiere decir dos cosas colgando directamente —dos bolsos— y treinta
   contando lo que va dentro de ellos. Un solo número no puede decir las dos:
   con «2» nadie encuentra el trípode que está en el bolso; con «30» abrir el
   cajón y ver dos cosas parece un error.

   ── EL CÓDIGO NO SE GUARDA, SE ARMA ──
   «OF01-M01-C01» sale de subir la cadena, en `codigoDeRuta`. El porqué entero
   está en db/sitios-detalle.sql y se resume en que un código escrito en cada
   fila se rompe SIN DAR ERROR: mueves el mueble de oficina y sus doce cajones
   siguen diciendo OF01 para siempre. Aquí solo se pinta, y se busca por él.

   ── LO QUE NO TIENE SITIO, TAMBIÉN ES UNA RESPUESTA ──
   El bloque de abajo es el que hace que esto sirva de algo: una lista de
   sitios bonita sobre un inventario donde cuatrocientos equipos no tienen
   ninguno da la impresión de que el dato está puesto. El número de lo que
   falta va arriba del todo por eso mismo.
   ══════════════════════════════════════════════════════════════════════════ */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El equipo, con todo lo que la fila enseña. Era `EqGuardable` + dos campos
 *  —lo justo para resolver la cadena— y por eso el cajón abierto era una lista
 *  de nombres pelados. */
export type EqEnSitio = EquipoParaPanel;

/** El kit, con lo que hace falta para dibujarle la cara: la portada elegida y
 *  sus piezas, porque la cara de un kit es la foto de una de ellas. */
export type KitEnSitio = {
  id: string; nombre: string;
  portadaId?: string | null;
  equipoIds?: string[];
  guardado_sitio?: string | null;
  guardado_en_equipo?: string | null;
};

/** Lo que se está escribiendo en el editor de un sitio. Todo texto, también
 *  los números: un `<input>` vacío es `""` y no `0`, y convertirlo antes de
 *  tiempo haría que borrar la fila escribiera un cero — que el check de la
 *  base rechaza, con razón. */
type Borrador = { nombre: string; tipo: string; clave: string; fila: string; columna: string };
const VACIO: Borrador = { nombre: "", tipo: "", clave: "", fila: "", columna: "" };

export default function PanelSitios({ sitios, equipos, kits, cortado, qInicial }: {
  sitios: Sitio[];
  equipos: EqEnSitio[];
  kits: KitEnSitio[];
  cortado: boolean;
  /** Lo que venga en `?q=`, para que el chip 📍 del inventario abra esta
   *  pestaña con el cajón ya filtrado. Solo el valor INICIAL: a partir de ahí
   *  manda lo que se escriba, y sincronizarlo con la URL en cada tecla haría
   *  que el botón de atrás recorriera letra por letra lo que se buscó. */
  qInicial?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(qInicial || "");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  /* Qué hijo se está colocando en la rejilla de su padre, y qué rejillas están
     plegadas. Viven AQUÍ y no dentro de `RejillaSitio` porque es este árbol el
     que decide qué hijos pinta como renglones: un cajón ya dibujado en la
     rejilla no vuelve a salir abajo, y para saberlo hay que saber las dos. */
  const [colocando, setColocando] = useState<string | null>(null);
  const [rejillasOcultas, setRejillasOcultas] = useState<Set<string>>(new Set());
  /** En qué sitio está abierto el formulario de crear dentro. */
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [ed, setEd] = useState<Borrador>(VACIO);
  const [nuevo, setNuevo] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("");
  const [dentroDe, setDentroDe] = useState<string | null>(null);
  const [nuevoHijo, setNuevoHijo] = useState("");
  const [nuevoHijoTipo, setNuevoHijoTipo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [aviso, setAviso] = useState("");

  const resolver = useMemo(() => resolvedorDeGuardado(sitios, equipos), [sitios, equipos]);

  /* ── LA CARA DE CADA KIT ──
     Un kit no tiene foto propia: se reconoce por su aparato principal. La
     ELEGIDA en «Combos y kits» primero —si esa pieza sigue dentro y tiene
     foto— y solo si no hay elección, la primera pieza con foto. Es la misma
     regla que `PanelKits`, y tiene que serlo: el mismo kit con dos caras según
     la pestaña se lee como dos kits. */
  const porEq = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const caraDeKit = (k: KitEnSitio) => {
    const dentro = (k.equipoIds || []).map(id => porEq.get(id)).filter(Boolean) as EqEnSitio[];
    const elegida = k.portadaId ? dentro.find(p => p.id === k.portadaId)?.cartel || null : null;
    return elegida || dentro.find(p => p.cartel)?.cartel || null;
  };

  /* El código de cada sitio, una vez. `rutaDeSitio` ya viene con memoria, pero
     la cadena se pinta en cada fila y en cada casilla de cada rejilla: sin este
     mapa, un mueble de doce cajones la recorre trece veces por render. */
  const codigos = useMemo(() => {
    const m = new Map<string, string | null>();
    sitios.forEach(s => m.set(s.id, codigoDeRuta(resolver.rutaDeSitio(s.id).ruta)));
    return m;
  }, [sitios, resolver]);

  /* ── LAS DOS CIFRAS DE UN SITIO, Y QUÉ SIGNIFICA CADA UNA ──
     · AQUÍ  = lo que cuelga de ESTE sitio y de nadie más: sus equipos directos
               más sus kits.
     · DENTRO= todo lo que hay en él y en los sitios que lleva dentro, contando
               además lo que va metido en un bolso y lo que va atornillado.

     ⚠ LA SEGUNDA CONTABA EQUIPOS Y NO KITS, y las dos se pintan juntas. El
     Espacio 4 decía «0» teniendo tres kits en sus compartimientos, y el Mueble
     01 decía «5» donde había ocho cosas: los kits sumaban en la primera cifra
     —que los lista— y desaparecían en la segunda. Un sitio que dice cero sobre
     un compartimiento lleno es la mentira en la dirección que más tranquiliza,
     que es exactamente lo que este archivo lleva escrito desde el principio.

     Los kits suben por la cadena igual que los equipos, y por el mismo bucle,
     para que no vuelva a haber dos criterios de «qué cuenta como estar aquí».

     `lib/sitios` llegó a tener un `contarPorSitio` que devolvía solo las
     cifras; se quitó al escribir esto, porque pintar la lista obliga a
     recorrer igual y tener las dos cosas separadas es tener dos criterios de
     «qué cuenta como estar aquí» que se van a separar. */
  const contenido = useMemo(
    () => contenidoPorSitio(sitios, equipos, kits, resolver),
    [sitios, equipos, kits, resolver]);

/* La rejilla recibía solo las CIFRAS —«lo único que necesita»— y era falso:
   necesita las listas, porque su casilla abre. Se le pasa `contenido` tal cual;
   es el mismo objeto que ya pinta el árbol de abajo, así que no hay una segunda
   idea de «qué cuenta como estar aquí» que se pueda separar de la primera. */


  /* Qué va METIDO dentro de cada equipo —su bolso, su maleta—, indexado una
     vez. Lo atornillado no hace falta indexarlo: ya viaja con la fila en
     `piezas`. */
  const enBolso = useMemo(() => {
    const m = new Map<string, EqEnSitio[]>();
    equipos.forEach(e => {
      if (!e.guardado_en_equipo) return;
      m.set(e.guardado_en_equipo, [...(m.get(e.guardado_en_equipo) || []), e]);
    });
    return m;
  }, [equipos]);

  /* Una cosa con lo que lleva dentro: lo ATORNILLADO (`piezas`, que ya viaja
     con la fila) y lo METIDO en ella como en un bolso (`guardado_en_equipo`).
     Escrito una vez porque lo piden los dos lados —lo que cuelga del cajón y
     las piezas de un kit— y son lo mismo: un equipo que puede llevar otros. */
  const conDentro = useCallback((e: EqEnSitio) => ({
    id: e.id, nombre: e.nombre, folio: e.folio, cartel: e.cartel,
    estado: e.estado, quien: e.quien,
    dentro: [
      ...(e.piezas || []).map((p: any) => ({
        id: p.id, nombre: p.nombre, folio: p.folio, cartel: p.cartel,
        estado: p.estado, quien: null as string | null,
        como: "montada" as const,
      })),
      ...(enBolso.get(e.id) || []).map(b => ({
        id: b.id, nombre: b.nombre, folio: b.folio, cartel: b.cartel,
        estado: b.estado, quien: b.quien,
        como: "guardada" as const,
      })),
    ],
  }), [enBolso]);

  /* ── LO QUE VE LA REJILLA: LO MISMO, MÁS LAS PIEZAS DE CADA KIT ──
     La casilla abre y enseña lo que hay en el cajón; un kit ahí era un renglón
     con su nombre y nada más, o sea la misma etiqueta muda que `ChipGrupo` vino
     a quitar del inventario. Sus piezas se sacan de `equipoIds`, que ya viajan.

     ⚠ `otroSitio` es lo que hace que esto no MIENTA. Que el kit se guarde en el
     Compartimiento A quiere decir que su bolso está ahí, no que sus dieciséis
     piezas lo estén: cada una tiene su propio sitio anotado y alguna puede
     decir otra cosa. Se compara el sitio más hondo de cada pieza con ESTE, y la
     que no cuadre sale marcada en vez de sumarse al montón — que es justo el
     momento en que alguien está contando contra la pantalla.
     Sin sitio anotado NO es «en otro sitio»: es que nadie lo ha dicho, y lo que
     se sabe es que va en ese kit. */
  const contenidoRejilla = useMemo(() => {
    const m = new Map<string, ContenidoSitio>();
    contenido.forEach((v, idSitio) => {
      m.set(idSitio, {
        /* ── LO QUE CADA COSA LLEVA DENTRO ──
           Dos relaciones distintas y las dos cuentan en la segunda cifra: lo
           ATORNILLADO (`piezas`, que ya viaja con la fila) y lo METIDO en él
           como en un bolso (`guardado_en_equipo`). Se juntan en una lista
           marcada, porque la pregunta con el cajón abierto es la misma —«¿qué
           más hay aquí dentro?»— aunque el arreglo, si falta, sea distinto. */
        directo: v.directo.map(conDentro),
        total: v.total,
        kits: v.kits.map(k => ({
          id: k.id, nombre: k.nombre,
          piezas: (k.equipoIds || []).map(idEq => {
            const e = porEq.get(idEq);
            if (!e) return null;
            const enRuta = resolver.de(e.id).ruta.filter(t => t.tipo === "sitio");
            const hondo = enRuta[enRuta.length - 1];
            /* ⚠ `conDentro` TAMBIÉN aquí. Una pieza de un kit es un equipo
               como cualquier otro y puede llevar cuatro cosas montadas: el
               mismo rig salía con sus piezas colgando del cajón y plano dentro
               del kit, según por dónde se mirara. */
            return {
              ...conDentro(e),
              otroSitio: hondo && hondo.id !== idSitio
                ? (codigos.get(hondo.id) || hondo.nombre)
                : null,
            };
          }).filter(Boolean) as ContenidoSitio["kits"][number]["piezas"],
        })),
      });
    });
    return m;
  }, [contenido, porEq, resolver, codigos, conDentro]);

  /* Los destinos posibles de un movimiento, con su código y su ruta. Se calcula
     una vez para todo el árbol y no por fila: son las mismas treinta y tres
     opciones en las treinta y tres filas, y armarlas por fila era mil cadenas
     recorridas por render — la mitad del motivo por el que este control ya no
     está siempre abierto.
     ⚠ Los DESCENDIENTES no se filtran: `moverSitio` sube la cadena y lo rechaza
     con una frase que explica por qué, y quitarlos pediría recorrer el árbol por
     cada fila para esconder opciones que casi nadie elige. El que sí se quita es
     él mismo, que es el error evidente. */
  const opcionesMover = useMemo(() => {
    const r = sitios.map(s => {
      const ruta = resolver.rutaDeSitio(s.id).ruta;
      return { s, cod: codigoDeRuta(ruta), ruta: textoDeRuta(ruta) || s.nombre };
    });
    r.sort((a, b) => a.ruta.localeCompare(b.ruta, "es"));
    return r;
  }, [sitios, resolver]);

  /* Lo que NO tiene sitio: ni propio, ni heredado de nadie. `origen: "ninguno"`
     ya lo dice; los rotos y los bucles van aparte porque el arreglo es otro. */
  const sinSitio = useMemo(
    () => equipos.filter(e => resolver.de(e.id).origen === "ninguno"),
    [equipos, resolver],
  );
  const conProblema = useMemo(
    () => equipos.filter(e => { const g = resolver.de(e.id); return g.roto || g.bucle; }),
    [equipos, resolver],
  );

  /* ── LO QUE EL TRASLADO NO PUDO DEDUCIR ──
     db/sitios-detalle.sql deja a propósito sin clave lo que no supo deducir
     —«Depósito» no lleva número— y lo que se peleaba la clave con un hermano.
     Su informe lo dice en Supabase; aquí también, porque es donde se arregla.
     Y son DOS números: un sitio sin clave no solo se queda sin código, deja sin
     código a todo lo que tiene dentro, y esa segunda cifra es la que explica
     por qué falta el código de un cajón que sí tiene la suya. */
  const sinClave = useMemo(() => sitios.filter(s => !s.clave), [sitios]);
  const sinCodigo = useMemo(() => sitios.filter(s => !codigos.get(s.id)), [sitios, codigos]);

  const hijosDe = useMemo(() => {
    const m = new Map<string | null, Sitio[]>();
    sitios.forEach(s => {
      const k = s.dentro_de || null;
      m.set(k, [...(m.get(k) || []), s]);
    });
    /* ⚠ Por rejilla primero y por nombre después. Con solo el nombre, el
       «Cajón 10» se leía entre el 1 y el 2, y sobre todo el orden de la lista
       contradecía al del mueble dibujado justo encima. Los que no tienen
       posición van al final: no es que estén en la fila cero, es que no están
       en la rejilla. */
    m.forEach(v => v.sort((a, b) => {
      const pa = a.fila != null && a.columna != null, pb = b.fila != null && b.columna != null;
      if (pa !== pb) return pa ? -1 : 1;
      if (pa && pb && a.fila !== b.fila) return (a.fila || 0) - (b.fila || 0);
      if (pa && pb && a.columna !== b.columna) return (a.columna || 0) - (b.columna || 0);
      return a.nombre.localeCompare(b.nombre, "es");
    }));
    return m;
  }, [sitios]);

  /* La búsqueda casa también por CLAVE y por CÓDIGO: «se puede copiar, pegar en
     una etiqueta y buscar por él» es media razón de que el código exista, y sin
     esto pegar «OF01-M01-C01» aquí no encontraba nada. */
  const casa = (s: Sitio) => {
    const ps = nrm(q).split(/\s+/).filter(Boolean);
    if (!ps.length) return true;
    const dentro = contenido.get(s.id);
    const txt = nrm([
      s.nombre, s.clave || "", codigos.get(s.id) || "",
      ...(dentro?.directo || []).map(e => `${e.folio || ""} ${e.nombre}`),
      ...(dentro?.kits || []).map(k => k.nombre),
    ].join(" "));
    return ps.every(p => txt.includes(p));
  };

  /* ── ¿CASA ÉL, O CASA ALGUIEN DE SU DESCENDENCIA? ──
     ⚠ Un solo nivel NO basta y esta pantalla lo pagó: `casa(s) || hijos.some(casa)`
     dejaba la lista vacía al buscar el código de un cajón de tres niveles, que
     es justo adonde lleva el chip 📍 del inventario. La regla —y el porqué—
     viven en `lib/sitios`, con su corte de bucles.

     Se calcula UNA VEZ por búsqueda y no por fila: preguntarlo dentro del
     pintado recorre el subárbol de cada nodo, o sea el árbol entero por cada
     uno. */
  const casaOAlguienDentro = useMemo(
    () => ramasQueCasan(sitios, hijosDe, casa),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sitios, hijosDe, contenido, codigos, q],
  );

  async function correr(fn: () => Promise<any>, alTerminar?: (r: any) => void) {
    setOcupado(true); setErr(""); setAviso("");
    try {
      const r = await fn();
      if (r?.error) { setErr(r.error); return; }
      alTerminar?.(r);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "No se pudo completar.");
    } finally { setOcupado(false); }
  }

  const alterna = (id: string) => setAbiertos(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  /* ── SE CREÓ SIN CLAVE, Y SE DICE EN EL MOMENTO ──
     La clave se deduce del número FINAL del nombre: «Mueble 01» → M01,
     «Oficina Principal» → nada. Sin este aviso el sitio se creaba callado y sin
     clave, y el problema aparecía mucho después y en otro renglón: seis cajones
     con su C0x diciendo «sin código» por culpa de una oficina creada media hora
     antes. Se avisa donde se causa. */
  const avisaSinClave = (nombre: string, tipo: string) => {
    if (!tipo || claveSugerida(tipo, nombre)) return;
    setAviso(`«${nombre.trim()}» se creó SIN CLAVE: su nombre no acaba en número, así que no se pudo deducir. `
      + `Pónsela con «editar» —«OF01», «M01»…—: sin ella, ni él ni nada de lo que metas dentro tendrá código.`);
  };

  /* ── UN BOLSO NO ES UN SITIO, Y AQUÍ SE IMPIDE ──
     ⚠ La primera decisión de db/sitios.sql es que hay DOS clases de respuesta a
     «¿dónde se guarda?»: el Cajón 07 es un SITIO —no está en el inventario, no
     tiene folio, no se presta— y el Bolso Maleta Tenba es un EQUIPO, que vale
     dinero, se presta y además contiene a otros. Por eso son dos punteros.

     Escribir «Maleta Negra Rígida Tenba» en «＋ dentro de» crea un SITIO con el
     nombre de un equipo que ya existe, y a partir de ahí hay dos maletas: una
     en el inventario que vale S/ 400 y otra que es un cajón, y ninguna sabe de
     la otra. Lo que había que hacer es lo contrario —ponerle a ELLA este sitio,
     y lo que lleve dentro lo hereda—, así que se dice eso en vez de dejarlo
     pasar. Se comprueba contra el nombre exacto porque es el caso real: el
     nombre se copia del inventario.

     Solo bloquea el nombre EXACTO. Un «Cajón de la maleta» no es la maleta, y
     adivinar por palabras sueltas prohibiría sitios legítimos — que es peor que
     no adivinar. */
  const equipoQueSeLlamaIgual = (nombre: string) => {
    const n = nrm(nombre.trim());
    if (!n) return null;
    return equipos.find(e => nrm(e.nombre || "") === n) || null;
  };
  const frenaSiEsEquipo = (nombre: string) => {
    const e = equipoQueSeLlamaIgual(nombre);
    if (!e) return false;
    setErr(`«${e.nombre}» ya existe en el inventario${e.folio ? ` (${e.folio})` : ""}, así que es un EQUIPO, no un sitio: `
      + `tiene folio, vale dinero y se presta. No lo crees aquí — ponle A ÉL este sitio desde el inventario o desde su ficha, `
      + `y todo lo que lleve dentro lo hereda.`);
    return true;
  };

  /** El primer eslabón de la cadena al que le falta la clave, de fuera hacia
   *  dentro — que es el que hay que arreglar primero. `null` si no es eso lo
   *  que pasa: con bucle o cadena rota la ruta viene vacía y no hay culpable
   *  que señalar, solo una cadena que no se puede recorrer. */
  const sinClaveEnLaCadena = (s: Sitio) =>
    resolver.rutaDeSitio(s.id).ruta.find(t => !t.clave) || null;

  const abrirEditor = (s: Sitio) => {
    setEditando(s.id);
    setEd({
      nombre: s.nombre,
      tipo: s.tipo || "",
      clave: s.clave || "",
      fila: s.fila != null ? String(s.fila) : "",
      columna: s.columna != null ? String(s.columna) : "",
    });
  };

  const guardarEditor = (id: string) => correr(
    () => editarSitio(id, {
      nombre: ed.nombre,
      tipo: ed.tipo || null,
      clave: ed.clave || null,
      /* `""` es «quítalo», no cero: la acción rechaza el cero y la base
         también, así que se manda `null` explícito. */
      fila: ed.fila === "" ? null : Number(ed.fila),
      columna: ed.columna === "" ? null : Number(ed.columna),
    }),
    () => setEditando(null),
  );

  /* ── UN SITIO Y LOS SUYOS, RECURSIVO ──
     El sangrado va por nivel, igual que en el árbol de ensamblados y por el
     mismo motivo: las flechas alineadas se pueden recorrer con la vista. */
  const pintaSitio = (s: Sitio, nivel: number): React.ReactNode => {
    const hijos = hijosDe.get(s.id) || [];
    const dentro = contenido.get(s.id) || { directo: [], total: 0, kits: [] };
    const aqui = dentro.directo.length + dentro.kits.length;
    const visible = casaOAlguienDentro.get(s.id) ?? true;
    if (!visible) return null;
    const abierta = !!q || abiertos.has(s.id);
    const enEd = editando === s.id;
    const enMov = moviendo === s.id;
    const cod = codigos.get(s.id);
    /* ── LO HABITUAL ARRIBA, TODO LO DEMÁS DEBAJO ──
       ⚠ NUNCA UNA LISTA VACÍA. Esto era la lista de `dentro` a secas, y para un
       «Espacio» —que la tenía vacía— el desplegable salía con el «— tipo —» y
       ni una opción: no se lee como «aquí no va nada», se lee como una pantalla
       rota. Y la premisa era falsa: un espacio de una oficina lleva muebles.
       Ahora `dentro` ORDENA en vez de filtrar. Lo habitual primero porque es lo
       que se elige el 90% de las veces; el resto en su propio grupo, porque
       ninguna taxonomía escrita de antemano sabe cómo es el almacén de nadie. */
    const sugeridos = (s.tipo && TIPOS_SITIO[s.tipo]?.dentro) || [];
    const otros = Object.keys(TIPOS_SITIO).filter(t => !sugeridos.includes(t));

    /* ── O EN LA REJILLA, O COMO RENGLÓN: NUNCA LAS DOS ──
       ⚠ Este era el ruido: el Nivel 01 dibujaba sus tres compartimientos y JUSTO
       DEBAJO los tres volvían a salir como renglones con sus mismos botones. La
       misma cosa dos veces a dos centímetros, y con cuatro niveles eso son doce
       bloques apilados para once cajones vacíos.
       Ahora la casilla ES el cajón plegado. Al abrirlo sale abajo con todo lo
       suyo —y la casilla se marca—, que es lo único que justifica repetirlo.

       Con el buscador escrito NO hay rejilla: buscar es una operación de lista,
       y ahí sí hacen falta todos los renglones a la vez. */
    const colocado = (h: Sitio) => h.fila != null && h.columna != null;
    const colocandoAqui = colocando && hijos.some(h => h.id === colocando) ? colocando : null;
    const hayRejilla = !q && hijos.length > 0
      && (hijos.some(colocado) || !!colocandoAqui)
      /* Plegada se respeta… salvo mientras se coloca, que es cuando hace falta
         ver los huecos. */
      && (!rejillasOcultas.has(s.id) || !!colocandoAqui);
    const filasHijos = hayRejilla
      ? hijos.filter(h => !colocado(h) || abiertos.has(h.id))
      : hijos;

    return (
      <Fragment key={s.id}>
        <div className="sit-fila">
          <button type="button" className="sit-plegar" aria-expanded={abierta}
            onClick={() => alterna(s.id)}
            title={abierta ? `Ocultar lo que hay en «${s.nombre}»` : `Ver lo que hay en «${s.nombre}»`}>
            <span className="panel-flecha" aria-hidden>{abierta ? "▾" : "▸"}</span>
            <span className="sit-ico" aria-hidden>{iconoDeSitio(s.tipo)}</span>
            {/* El CÓDIGO entero en la etiqueta y no solo la clave: es lo que se
                copia y lo que se pega en el cajón. Cuando falta —porque a él o
                a alguno de sus padres le falta la clave— se dice, en vez de
                pintar un código corto que señalaría a otro sitio distinto. */}
            {cod
              ? <span className="badge sit-cod" title="Código completo, armado subiendo la cadena">{cod}</span>
              /* ⚠ SE DICE CUÁL FALTA. «— sin código —» a secas sobre un cajón
                 que SÍ tiene su C01 manda a buscar el fallo donde no está: lo
                 que falta es la clave de su abuela, tres filas más arriba, y no
                 había forma de saberlo desde aquí. */
              : sinClaveEnLaCadena(s)?.id === s.id
                ? <span className="sit-sincod" title="Ponle una clave con «editar» y el código se arma solo">— sin clave —</span>
                : sinClaveEnLaCadena(s)
                  ? <span className="sit-sincod" title="El código pasa por toda la cadena: sin esa clave no se puede armar el de este sitio">
                      — falta la clave de «{sinClaveEnLaCadena(s)!.nombre}» —
                    </span>
                  : <span className="sit-sincod" title="La cadena de este sitio da vueltas o apunta a uno que no está">— sin código —</span>}
            <b className="sit-nom">{s.nombre}</b>
          </button>
          {/* Los dos números. En gris el total cuando coincide con el directo:
              repetir «3 · 3» es ruido en una lista de veinte cajones. */}
          {/* ── LAS DOS CIFRAS, Y CUÁNDO CALLARSE ──
              ⚠ La segunda se compara contra la PRIMERA, no contra
              `directo.length`: la primera suma los kits y aquella no, así que un
              cajón con dos kits pintaba «2 · 2 dentro» —ruido— o se callaba
              cuando no debía.

              ⚠ Y EL CERO A SECAS NO SE PINTA cuando hay algo debajo. El Mueble
              01 decía «0 · 8 dentro»: el cero es cierto —nada cuelga de él, todo
              está en sus cajones— pero va en negrita y del mismo color que las
              cifras de los cajones, así que al recorrer la columna se lee
              «vacío» sobre un mueble con ocho cosas. Y no aporta nada: «8
              dentro» ya dice que aquí mismo no hay nada suelto.
              El cero SÍ se pinta cuando de verdad está vacío, y ahí va apagado:
              es el que se busca al mirar dónde queda hueco. */}
          <span className="sit-cifras">
            {aqui > 0 && aqui}
            {dentro.total !== aqui && (
              <span className="sit-total" title="Contando lo que hay en los sitios de dentro, lo metido en bolsos y lo atornillado">
                {aqui > 0 ? " · " : ""}{dentro.total} dentro
              </span>
            )}
            {aqui === 0 && dentro.total === 0 && <span className="sit-vacio">0</span>}
          </span>
          <span className="spacer" />
          {/* «colocar» solo cuando de verdad se puede: el sitio tiene padre y
              todavía no está en su rejilla. Es lo que sustituye a la tira de
              chips que había debajo del dibujo — la misma acción, pedida desde
              el renglón de cada uno en vez de desde una tercera lista con los
              mismos sitios. */}
          {s.dentro_de && !(s.fila != null && s.columna != null) && (
            <button type="button" className="dato-btn"
              style={colocando === s.id ? { color: "var(--teal)", borderColor: "var(--teal)" } : undefined}
              title="Ponerlo en la rejilla de su sitio: se enciende el dibujo de arriba y se toca un hueco"
              onClick={() => setColocando(c => (c === s.id ? null : s.id))}>
              {colocando === s.id ? "elige el hueco…" : "colocar"}
            </button>
          )}
          <button type="button" className="dato-btn"
            onClick={() => { setMoviendo(null); enEd ? setEditando(null) : abrirEditor(s); }}>
            {enEd ? "cerrar" : "editar"}
          </button>
          {/* ⚠ Mover DENTRO y no solo «sacar». Con el botón solo, la
              jerarquía se podía deshacer pero no construir: los sitios
              anidados solo existirían si los creaba la migración. Un
              `select` y no un buscador: son los sitios que hay, y son
              pocos — un desplegable de veinte no necesita filtro.
              La opción de sacar es el valor vacío del mismo control, para
              que meter y sacar no sean dos sitios distintos. */}
          {/* ── MOVER, DETRÁS DE UN BOTÓN ──
              ⚠ Esto era un `select` SIEMPRE VISIBLE en cada fila, y con treinta
              y tres sitios eso son treinta y tres desplegables de treinta y tres
              opciones cada uno: mil opciones montadas para una acción que se usa
              una vez por sitio y nunca más. Era además el control más ancho de
              la fila, así que el nombre —lo único que se lee siempre— quedaba
              recortado por lo que casi nunca se toca.
              Crear dentro ya no pasa por aquí: eso es «＋ dentro de». Esto solo
              recoloca lo que ya existe, y por eso vive donde `editar`. */}
          {sitios.length > 1 && (
            <button type="button" className="dato-btn"
              onClick={() => { setEditando(null); setMoviendo(enMov ? null : s.id); }}>
              {enMov ? "cerrar" : "mover"}
            </button>
          )}
          <button type="button" className="dato-btn" disabled={ocupado}
            style={{ color: "var(--red)" }}
            onClick={() => {
              const n = dentro.directo.length + dentro.kits.length + hijos.length;
              if (n && !confirm(
                `Borrar «${s.nombre}». Nada se borra con él, pero ${dentro.directo.length} equipo(s) y `
                + `${dentro.kits.length} kit(s) se quedan SIN SITIO, y ${hijos.length} sitio(s) que estaban `
                + `dentro pasan a estar sueltos. ¿Sigo?`)) return;
              correr(() => borrarSitio(s.id), (r: any) =>
                setAviso(`Borrado. Se quedaron sin sitio ${r.equipos} equipo(s) y ${r.kits} kit(s); `
                  + `${r.sitios} sitio(s) pasaron a estar sueltos.`));
            }}>borrar</button>
        </div>

        {/* ── EL EDITOR, EN SU PROPIO RENGLÓN ──
            ⚠ NO dentro de la fila. Estuvo con el `<input>` metido en el
            `<button>` de plegar: un campo de texto dentro de un botón es HTML
            inválido —contenido interactivo anidado— y además cada clic para
            poner el cursor plegaba el sitio. Y ahora son cinco campos: en la
            fila no caben sin dejar el nombre en tres letras. */}
        {enEd && (
          <div className="sit-editor">
            <label className="sit-campo">
              <span>Nombre</span>
              <input className="ent-lote-inp" autoFocus value={ed.nombre}
                onChange={e => setEd({ ...ed, nombre: e.target.value })}
                onKeyDown={e => {
                  if (e.key === "Enter") guardarEditor(s.id);
                  if (e.key === "Escape") setEditando(null);
                }} />
            </label>
            <label className="sit-campo">
              <span>Tipo</span>
              {/* Al elegir tipo se rellena la clave SI ESTÁ VACÍA. No se pisa
                  una escrita a mano: quien la puso sabía algo que la
                  deducción del nombre no sabe. */}
              <select className="ent-select" value={ed.tipo}
                onChange={e => {
                  const t = e.target.value;
                  setEd(x => ({ ...x, tipo: t, clave: x.clave || claveSugerida(t, x.nombre) }));
                }}>
                <option value="">— sin tipo —</option>
                {Object.entries(TIPOS_SITIO).map(([k, v]) => (
                  <option key={k} value={k}>{v.icono} {v.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="sit-campo sit-campo-corto">
              <span>Clave</span>
              <input className="ent-lote-inp" value={ed.clave}
                placeholder={claveSugerida(ed.tipo, ed.nombre) || "C07"}
                title="Solo su tramo: «C01», no «OF01-M01-C01». El código entero se arma solo."
                onChange={e => setEd({ ...ed, clave: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") guardarEditor(s.id); }} />
            </label>
            <label className="sit-campo sit-campo-corto">
              <span>Fila</span>
              <input className="ent-lote-inp" type="number" min={1} value={ed.fila}
                onChange={e => setEd({ ...ed, fila: e.target.value })} />
            </label>
            <label className="sit-campo sit-campo-corto">
              <span>Columna</span>
              <input className="ent-lote-inp" type="number" min={1} value={ed.columna}
                onChange={e => setEd({ ...ed, columna: e.target.value })} />
            </label>
            <div className="sit-editor-btns">
              <button type="button" className="btn" disabled={ocupado}
                onClick={() => guardarEditor(s.id)}>guardar</button>
              <button type="button" className="dato-btn"
                onClick={() => setEditando(null)}>cancelar</button>
            </div>
            {/* ⚠ EL ERROR, AQUÍ. Estaba solo arriba de la tarjeta, junto al
                buscador: con nueve sitios en el árbol y la página desplazada,
                guardar el primero pintaba el motivo del fallo fuera de la
                pantalla y el editor se quedaba abierto sin decir por qué —
                idéntico a un botón que no hace nada. El aviso de un renglón va
                en ese renglón. */}
            {err && <div className="sit-editor-err">⚠ {err}</div>}
            <div className="sit-editor-pie">
              La fila y la columna van juntas y empiezan en 1; déjalas vacías si
              este sitio no está en una rejilla. La clave solo tiene que ser
              única entre hermanos.
            </div>
          </div>
        )}

        {/* ── MOVER: UN SOLO CONTROL, Y CON LA CADENA ENTERA ──
            Las opciones dicen el código y la ruta completa —«OF01-M01 · Oficina
            Principal › Mueble 01»— y no solo el nombre: con dos «Cajón 08» en
            sitios distintos, «dentro de Cajón 08» repetido dos veces obliga a
            elegir a ciegas y a deshacerlo después. Ordenadas por esa ruta, así
            que los hermanos salen juntos bajo su padre. */}
        {enMov && (
          <div className="sit-editor">
            <label className="sit-campo sit-campo-ancho">
              <span>Dentro de</span>
              <select className="ent-select" disabled={ocupado} autoFocus
                value={s.dentro_de || ""}
                onChange={e => correr(
                  () => moverSitio(s.id, e.target.value || null),
                  () => setMoviendo(null),
                )}>
                <option value="">— suelto, en la raíz —</option>
                {opcionesMover.filter(o => o.s.id !== s.id).map(o => (
                  <option key={o.s.id} value={o.s.id}>
                    {o.cod ? `${o.cod} · ` : ""}{o.ruta}
                  </option>
                ))}
              </select>
            </label>
            <div className="sit-editor-btns">
              <button type="button" className="dato-btn"
                onClick={() => setMoviendo(null)}>cancelar</button>
            </div>
            {err && <div className="sit-editor-err">⚠ {err}</div>}
            <div className="sit-editor-pie">
              Esto solo RECOLOCA un sitio que ya existe. Para hacer uno nuevo
              dentro de otro, usa «＋ dentro de», que además le sugiere la clave.
              El nombre tiene que ser único entre hermanos: si el destino ya
              tiene uno que se llama igual, el cambio se rechaza y lo dice.
            </div>
          </div>
        )}

        {/* ── TODO LO DE UN SITIO ABIERTO, EN UNA CAJA ──
            ⚠ Antes esto eran cuatro bloques sueltos —rejilla, contenido, crear,
            hijos— separados solo por un `margin-left` calculado a mano. A partir
            del tercer nivel nadie distinguía dónde empezaba un sitio y dónde
            acababa: los renglones de un nieto y los de su tío se leían igual.
            Ahora cada sitio abierto es una caja con su riel a la izquierda, y
            como las cajas se anidan, la sangría sale sola: se acabó el
            `nivel * 18 + 22` repetido en cinco sitios y desincronizado en dos. */}
        {abierta && (
          <div className="sit-caja">
            {/* La rejilla, solo si tiene sitios dentro y no está plegada: un
                marco sobre un cajón que solo contiene equipos no dice nada. */}
            {hayRejilla && (
              <RejillaSitio hijos={hijos} contenido={contenidoRejilla} codigos={codigos}
                ocupado={ocupado}
                colocando={colocandoAqui} abiertos={abiertos}
                oculta={rejillasOcultas.has(s.id)}
                onOcultar={() => setRejillasOcultas(x => {
                  const n = new Set(x); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n;
                })}
                onElegir={setColocando}
                onAbrir={id => alterna(id)}
                onColocar={(id, f, c) => correr(
                  () => editarSitio(id, { fila: f, columna: c }),
                  () => setColocando(null),
                )} />
            )}
            {/* Plegada, queda el rastro: si desapareciera del todo, el dato de
                fila y columna se vuelve invisible y nadie lo mantiene. */}
            {!hayRejilla && !q && hijos.some(h => h.fila != null && h.columna != null) && (
              <div className="rej-cab">
                <button type="button" className="dato-btn"
                  onClick={() => setRejillasOcultas(x => { const n = new Set(x); n.delete(s.id); return n; })}>
                  ▦ ver la rejilla ({hijos.filter(h => h.fila != null && h.columna != null).length})
                </button>
              </div>
            )}

            {(dentro.directo.length > 0 || dentro.kits.length > 0) && (
          <div className="sit-dentro">
            {dentro.kits.map(k => {
              const cara = caraDeKit(k);
              return (
                <div key={k.id} className="sit-cosa">
                  {/* `.cbo-img` es la misma cara que en «Combos y kits», del
                      mismo tamaño: dos tamaños para la misma cosa hacen que
                      parezcan dos cosas. 📦 cuando ninguna pieza tiene foto. */}
                  <span className="cbo-img sit-mini" aria-hidden>
                    {cara
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={cara} alt="" referrerPolicy="no-referrer" />
                      : <span>📦</span>}
                  </span>
                  <span className="sit-cosa-n">{k.nombre}</span>
                  {/* ── EL CHIP DEL KIT, QUE ABRE ──
                      «kit · 2 equipos» en texto plano era la misma etiqueta muda
                      que ChipGrupo vino a quitar del inventario: dice cuántos y
                      no cuáles, y con el cajón abierto delante lo que se está
                      haciendo es contar contra algo. El chip trae los dos, con
                      su foto, su estado y quién los tiene — que es la mitad de
                      la respuesta si uno está en Puno con alguien.
                      Rotulado por el número y no por el nombre: el nombre ya
                      está a su izquierda. Y así se lee igual que el «🔩 4
                      piezas» del equipo de abajo, que contesta lo mismo. */}
                  <span className="chips-linea">
                    <ChipGrupo que="kit" id={k.id} nombre={k.nombre}
                      rotulo={`${k.equipoIds?.length || 0} equipo${k.equipoIds?.length === 1 ? "" : "s"}`}
                      titulo={`Kit «${k.nombre}» — ver qué equipos van dentro y quién los tiene`} />
                  </span>
                </div>
              );
            })}
            {dentro.directo.map(e => {
              const g = resolver.de(e.id);
              /* Lo que este equipo lleva DENTRO se cuenta con la cadena, no con
                 una segunda consulta: `total` menos lo directo es exactamente
                 lo que cuelga de los bolsos que hay aquí. */
              return (
                <div key={e.id} className="sit-cosa">
                  {/* La foto PRIMERO. Esta lista se recorre mirando —así se
                      reconoce un equipo, no por el folio, que nadie se sabe de
                      memoria— y es la única pestaña donde se lee con la cosa
                      en la mano, comparando el cajón con la pantalla. */}
                  <span className="mini-eq sit-mini" aria-hidden>
                    {e.cartel
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={e.cartel} alt="" referrerPolicy="no-referrer" />
                      : <span>🎥</span>}
                  </span>
                  {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                  <Link href={`/entidad/equipamiento/${e.id}`} className="sit-cosa-n">{e.nombre}</Link>
                  {/* Los mismos chips del inventario, en el mismo orden: cuántas
                      piezas lleva montadas, con qué kits sale, con qué combo
                      entró. Abriendo un cajón para contra qué contar, «lleva 4
                      piezas dentro» es media respuesta que antes no estaba. */}
                  <ChipsEquipo e={e} cortado={cortado} />
                  {g.ruta.some(t => t.tipo === "equipo") && (
                    <span className="sit-cosa-t">{textoDeRuta(g.ruta)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── CREAR DENTRO, CON EL SITIO ABIERTO ──
            Los tipos que se ofrecen los decide el tipo del padre: dentro de un
            mueble van cajones, no oficinas. Es la tercera cosa que el tipo paga
            —el ícono y el prefijo son las otras dos— y sin ella la jerarquía se
            construye desde el desplegable «dentro de», que obliga a crear el
            sitio suelto primero y moverlo después. */}
            {/* ── EL ＋ PLEGADO ──
                ⚠ Este formulario —desplegable, campo y botón— salía ENTERO en
                cada sitio abierto. Con cuatro niveles abiertos son cuatro
                formularios apilados entre el contenido de uno y el del
                siguiente, y ninguno se está usando: crear un sitio se hace una
                vez y mantenerlo, todos los días. Se pliega detrás de un ＋, como
                ya hicimos con «mover». */}
            {creandoEn !== s.id ? (
              <div className="sit-nuevo-dentro">
                <button type="button" className="dato-btn"
                  onClick={() => { setCreandoEn(s.id); setDentroDe(s.id); setNuevoHijo(""); setNuevoHijoTipo(""); }}
                  title={`Crear un sitio dentro de «${s.nombre}»`}>
                  ＋ dentro
                </button>
              </div>
            ) : (
          <div className="sit-nuevo-dentro">
            <span className="sit-cosa-t">＋ dentro de «{s.nombre}»:</span>
            <select className="ent-select sit-dentrode" value={dentroDe === s.id ? nuevoHijoTipo : ""}
              onChange={e => { setDentroDe(s.id); setNuevoHijoTipo(e.target.value); }}>
              <option value="">— tipo —</option>
              {/* Los grupos solo cuando hay algo que agrupar: con un sitio sin
                  tipo, «lo habitual» estaría vacío y «otros» tendría los siete,
                  que es un encabezado mintiendo sobre una lista completa. */}
              {sugeridos.length > 0 ? (
                <>
                  <optgroup label="lo habitual aquí">
                    {sugeridos.map(t => (
                      <option key={t} value={t}>{TIPOS_SITIO[t].icono} {TIPOS_SITIO[t].etiqueta}</option>
                    ))}
                  </optgroup>
                  <optgroup label="los demás">
                    {otros.map(t => (
                      <option key={t} value={t}>{TIPOS_SITIO[t].icono} {TIPOS_SITIO[t].etiqueta}</option>
                    ))}
                  </optgroup>
                </>
              ) : (
                otros.map(t => (
                  <option key={t} value={t}>{TIPOS_SITIO[t].icono} {TIPOS_SITIO[t].etiqueta}</option>
                ))
              )}
            </select>
            <input className="ent-lote-inp" placeholder="Nombre…" style={{ maxWidth: 170 }}
              title="Un sitio es un mueble, un estante, un cajón. Un bolso o una maleta NO: esos son equipos —tienen folio y se prestan— y se les pone sitio desde el inventario."
              value={dentroDe === s.id ? nuevoHijo : ""}
              onChange={e => { setDentroDe(s.id); setNuevoHijo(e.target.value); }}
              onKeyDown={e => {
                /* ⚠ `dentroDe === s.id` también aquí: el borrador es UNO para
                   todo el árbol, así que sin esta guarda un Enter en el campo
                   de un sitio crearía el hijo del sitio anterior. */
                if (e.key !== "Enter" || dentroDe !== s.id || !nuevoHijo.trim()) return;
                if (frenaSiEsEquipo(nuevoHijo)) return;
                correr(
                  () => crearSitio(nuevoHijo.trim(), s.id,
                    nuevoHijoTipo ? { tipo: nuevoHijoTipo, clave: claveSugerida(nuevoHijoTipo, nuevoHijo) || null } : undefined),
                  () => { avisaSinClave(nuevoHijo, nuevoHijoTipo); setNuevoHijo(""); setAbiertos(x => new Set(x).add(s.id)); },
                );
              }} />
            <button type="button" className="dato-btn"
              disabled={ocupado || dentroDe !== s.id || !nuevoHijo.trim()}
              onClick={() => {
                if (frenaSiEsEquipo(nuevoHijo)) return;
                correr(
                  () => crearSitio(nuevoHijo.trim(), s.id,
                    nuevoHijoTipo ? { tipo: nuevoHijoTipo, clave: claveSugerida(nuevoHijoTipo, nuevoHijo) || null } : undefined),
                  () => { avisaSinClave(nuevoHijo, nuevoHijoTipo); setNuevoHijo(""); setAbiertos(x => new Set(x).add(s.id)); },
                );
              }}>crear</button>
            <button type="button" className="dato-btn"
              onClick={() => setCreandoEn(null)}>cancelar</button>
          </div>
            )}

            {/* Los hijos, DENTRO de la caja: es lo que hace que la sangría salga
                sola y que se vea de un vistazo dónde acaba este sitio.
                ⚠ `filasHijos` y no `hijos`: los que ya están dibujados en la
                rejilla de arriba no se repiten aquí. */}
            {filasHijos.map(h => pintaSitio(h, nivel + 1))}
          </div>
        )}
      </Fragment>
    );
  };

  const raices = hijosDe.get(null) || [];

  return (
    <>
      {/* ── LO QUE FALTA, ARRIBA ──
          Una lista de sitios sobre un inventario donde cuatrocientos equipos no
          tienen ninguno da la impresión de que el dato ya está puesto. */}
      {(sinSitio.length > 0 || conProblema.length > 0 || sinClave.length > 0) && (
        <div className="card sit-faltan">
          {sinSitio.length > 0 && (
            <div>
              <b style={{ color: "var(--yellow)", fontSize: 13 }}>
                ⚠ {sinSitio.length} equipo(s) sin sitio anotado
              </b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                Ni propio ni heredado de un bolso. Se anota desde la ficha de
                cada uno, en el bloque 📍 — o aquí, a puñados.
              </div>
              {/* ── EL ARREGLO, PEGADO A LA QUEJA ──
                  El aviso decía «se anota desde la ficha de cada uno» sobre
                  cuatrocientas noventa y siete fichas. Un dato que solo se puede
                  rellenar de uno en uno sobre quinientas filas no se rellena: el
                  aviso se vuelve parte del mobiliario. El botón va aquí y no en
                  otra pestaña porque es aquí donde se lee el número. */}
              <GuardarLote
                candidatos={sinSitio}
                sitios={opcionesMover.map(o => ({ id: o.s.id, cod: o.cod, ruta: o.ruta }))}
                /* Cualquier equipo puede llevar otro dentro —un bolso, una
                   maleta, un case—, así que la lista son todos y la acota el
                   buscador. Filtrar por «parece un bolso» sería adivinar por el
                   nombre justo lo que el inventario no dice. */
                contenedores={equipos.map(e => ({ id: e.id, folio: e.folio, nombre: e.nombre }))}
              />
            </div>
          )}
          {sinClave.length > 0 && (
            <div style={{ marginTop: sinSitio.length ? 10 : 0 }}>
              <b style={{ color: "var(--yellow)", fontSize: 13 }}>
                ⚠ {sinClave.length} sitio(s) sin clave
              </b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                El traslado deja sin clave lo que no pudo deducir del nombre
                —«Depósito» no lleva número— y lo que se la peleaba con un
                hermano. Se pone con «editar».
                {sinCodigo.length > sinClave.length && (
                  <> Además dejan sin código a {sinCodigo.length - sinClave.length} sitio(s)
                    que sí tienen la suya: el código pasa por toda la cadena.</>
                )}
              </div>
            </div>
          )}
          {conProblema.length > 0 && (
            <div style={{ marginTop: (sinSitio.length || sinClave.length) ? 10 : 0 }}>
              <b style={{ color: "var(--red)", fontSize: 13 }}>
                ⚠ {conProblema.length} con la cadena rota o en bucle
              </b>
              <div className="sit-rotos">
                {conProblema.slice(0, 20).map(e => (
                  <Link key={e.id} href={`/entidad/equipamiento/${e.id}`} className="sit-roto">
                    {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                    {e.nombre}
                  </Link>
                ))}
                {conProblema.length > 20 && (
                  <span className="sit-cosa-t">y {conProblema.length - 20} más</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {cortado && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ La lista llegó al tope</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Se leyeron los primeros mil equipos o sitios, así que estas cuentas
            van cortas y alguno puede salir como «apunta a algo que no está».
            No es la base: es esta lista.
          </div>
        </div>
      )}

      <div className="card">
        <div className="ens-cab">
          <b style={{ fontSize: 14 }}>📍 {sitios.length} sitio{sitios.length === 1 ? "" : "s"}</b>
          <span className="spacer" />
          <input className="ent-lote-inp" placeholder="Buscar por nombre, clave, código o algo que esté dentro…"
            value={q} onChange={e => setQ(e.target.value)} />
          <select className="ent-select sit-dentrode" value={nuevoTipo}
            onChange={e => setNuevoTipo(e.target.value)} title="Tipo del sitio nuevo">
            <option value="">— tipo —</option>
            {Object.entries(TIPOS_SITIO).map(([k, v]) => (
              <option key={k} value={k}>{v.icono} {v.etiqueta}</option>
            ))}
          </select>
          <input className="ent-lote-inp" placeholder="Nuevo sitio…" value={nuevo}
            title="Un sitio es un mueble, un estante, un cajón. Un bolso o una maleta NO: esos son equipos —tienen folio y se prestan— y se les pone sitio desde el inventario."
            onChange={e => setNuevo(e.target.value)} style={{ maxWidth: 180 }} />
          <button type="button" className="btn" disabled={ocupado || !nuevo.trim()}
            /* Sin tipo elegido NO se manda ningún campo nuevo: el `insert`
               pediría columnas que no existen mientras db/sitios-detalle.sql
               no esté corrido, y crear un sitio dejaría de funcionar. */
            onClick={() => {
              if (frenaSiEsEquipo(nuevo)) return;
              correr(
                () => crearSitio(nuevo.trim(), null,
                  nuevoTipo ? { tipo: nuevoTipo, clave: claveSugerida(nuevoTipo, nuevo) || null } : undefined),
                () => { avisaSinClave(nuevo, nuevoTipo); setNuevo(""); },
              );
            }}>
            ＋ Sitio
          </button>
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
        {aviso && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>{aviso}</div>}

        {!sitios.length && (
          <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 10, lineHeight: 1.55 }}>
            No hay sitios todavía. Un sitio es un mueble o un estante —«Cajón
            07», «Depósito»—, no un bolso: los bolsos son equipos y ya están en
            el inventario, así que una cosa se guarda «en el Bolso Tenba» y el
            Bolso Tenba se guarda «en el Cajón 08».
          </div>
        )}

        <div className="sit-arbol">{raices.map(s => pintaSitio(s, 0))}</div>
      </div>
    </>
  );
}
