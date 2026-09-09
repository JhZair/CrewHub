/* ══════════════════════════════════════════════════════════════════════════
   🔧 EL ÁRBOL DE ENSAMBLADOS — DE QUÉ ESTÁ HECHA CADA COSA

   El tercer eje del inventario, y el único físico: el combo dice con qué
   ENTRÓ, el kit con qué SALE, el ensamblado de qué ESTÁ HECHO. Los otros dos
   tienen su pantalla desde el primer día; este solo se veía equipo por equipo,
   entrando a la ficha de cada uno. Con ciento doce piezas montadas, «¿qué
   ensamblados tengo armados?» no se podía contestar sin abrir el inventario y
   recorrerlo a mano.

   ── SE ARMA EN MEMORIA, NO EN LA BASE ──
   Una jerarquía en SQL pide una recursiva o una consulta por nivel. Las filas
   ya están todas aquí —`equiposFlacos` las trae para el resto de la pantalla—
   y `ensamblado_en` es una sola columna: el árbol sale de un recorrido sobre
   lo que ya se pagó. Cero consultas nuevas.

   ── LAS TRES COSAS QUE NO SON UN ÁRBOL ──
   Un puntero suelto tiene tres formas de estar mal, y las tres son invisibles
   si solo se pinta lo que encaja:

   · HUÉRFANA — estado «ensamblado» y `ensamblado_en` en null. Dice que está
     montada y no dice dónde. Es lo que deja el `on delete set null` de
     db/ensamblado.sql al borrar el anfitrión: el puntero se va y el estado se
     queda. (No lo deja `desensamblar`: sus dos `update` ponen el puntero a null
     Y el estado, así que por esa puerta no se puede llegar aquí.)
   · PERDIDA — apunta a un id que no está en estas filas. Con el inventario
     entero eso significaría base rota; con el tope alcanzado significa que
     falta media lista, que es muy distinto. Por eso `cortado` viaja.
   · EN CICLO — A dentro de B y B dentro de A. `ensamblar` lo impide desde que
     existe la guarda, pero los datos son anteriores a la guarda y un ciclo
     aquí no da error: cuelga el render en un bucle infinito. Se corta y se
     dice — y solo de quien está DENTRO del bucle, no de lo que cuelga de él.

   Ninguna de las tres se descarta en silencio: se devuelven aparte para que la
   pantalla las enseñe. Un inventario que se calla lo que no cuadra es el que
   hace que nadie mire los avisos.

   ⚠ Y NINGUNA SALE DOS VECES. Cada fila está en `raices` o en `sueltas`, nunca
   en las dos: los totales de arriba —cuántos ensamblados, cuánto valen, cuántas
   piezas— se calculan sumando esas dos listas, y una fila repetida los infla
   sin que nada falle. La huérfana CON piezas era exactamente ese caso —puntero
   nulo, así que pasaba el filtro de raíz, y estado «ensamblado», así que ya
   estaba en `sueltas`— y es el caso que de verdad produce `on delete set null`
   al borrar un anfitrión que tenía nietos.

   ⚠ Este módulo NO habla con la base y no importa nada de servidor, a
   propósito: `PanelEnsamblados` es de cliente y usa `valorDeNodo` y
   `piezasDeNodo` como VALORES. Viviendo en `equipamientoDatos` —que importa
   `lib/supabase/server`, y ese `next/headers`— el build de Next lo rechaza con
   «You're importing a component that needs next/headers». `tsc` no lo ve: pasa
   limpio y revienta al compilar. Es el mismo motivo por el que `lib/kits.ts`
   está separado.
   ══════════════════════════════════════════════════════════════════════════ */

export type NodoEns = {
  id: string;
  folio: string | null;
  nombre: string;
  categoria: string | null;
  subcategoria: string | null;
  estado: string | null;
  cartel: string | null;
  /** Quién lo tiene prestado AHORA. Un ensamblado en la mochila de alguien no
   *  se desarma desde aquí, y saberlo antes de intentarlo ahorra el viaje. */
  quien: string | null;
  /** Precio propio. El del conjunto se suma con `valorDeNodo`, que baja por
   *  todo el árbol: el valor de un rig es el de sus piezas, no un dato. */
  valor: number | null;
  /** La cadena de dónde se guarda, ya resuelta. La pone `arbolEnsamblados`, que
   *  es quien tiene la lista de sitios, y SOLO en las raíces: a una pieza
   *  atornillada no se le pinta control —hereda, y un check de la base le
   *  prohíbe sitio propio—, así que en las piezas queda `undefined`.
   *  ⚠ Los dos punteros crudos NO viajan. Estuvieron aquí «por si acaso» y no
   *  los leía nadie: dos campos por nodo cruzando al navegador en cuarenta y
   *  cuatro raíces y ciento catorce piezas para nada. */
  guardado?: import("@/lib/sitios").Guardado;
  piezas: NodoEns[];
};

/** Lo que hay que enseñar de una pieza que no encaja en ningún árbol. */
export type SueltaEns = NodoEns & {
  /** Qué le pasa exactamente. La pantalla dice una frase distinta para cada
   *  una: «no dice dónde» y «apunta a uno que no está» se arreglan distinto. */
  falla: "huerfana" | "perdida" | "ciclo";
  /** A qué id apuntaba, cuando apuntaba a algo. Sirve para buscarlo a mano. */
  apuntaA: string | null;
};

/** El valor del conjunto: el suyo más el de todo lo que lleva dentro. */
export function valorDeNodo(n: NodoEns): number {
  return (Number(n.valor) || 0) + n.piezas.reduce((s, p) => s + valorDeNodo(p), 0);
}

/** Cuántas piezas cuelgan de aquí, contando las de sus piezas. */
export function piezasDeNodo(n: NodoEns): number {
  return n.piezas.reduce((s, p) => s + 1 + piezasDeNodo(p), 0);
}

export function arbolDeEnsamblados(
  filas: any[], cartelPorEq: Map<string, string>, quienTiene: Map<string, string>,
) {
  const porId = new Map<string, any>((filas || []).map(e => [e.id, e]));
  const hijosDe = new Map<string, any[]>();
  const sueltas: SueltaEns[] = [];

  const nodo = (e: any): NodoEns => ({
    id: e.id, folio: e.folio || null, nombre: e.nombre || "sin nombre",
    categoria: e.categoria || null, subcategoria: e.subcategoria || null,
    estado: e.estado || null,
    cartel: cartelPorEq.get(e.id) || null,
    quien: quienTiene.get(e.id) || null,
    valor: e.valor_compra != null ? Number(e.valor_compra) : null,
    piezas: [],
  });

  for (const e of filas || []) {
    if (!e.ensamblado_en) {
      /* Sin puntero pero con el estado puesto: dice que está montada y no dice
         dónde. El estado es la única prueba de que alguien la montó. */
      if (e.estado === "ensamblado") {
        sueltas.push({ ...nodo(e), falla: "huerfana", apuntaA: null });
      }
      continue;
    }
    if (!porId.has(e.ensamblado_en)) {
      sueltas.push({ ...nodo(e), falla: "perdida", apuntaA: e.ensamblado_en });
      continue;
    }
    hijosDe.set(e.ensamblado_en, [...(hijosDe.get(e.ensamblado_en) || []), e]);
  }

  /* ⚠ `enRama` y no un `visitados` global: lo que hay que detectar es que un
     equipo sea antepasado de sí mismo, no que se haya visto antes. Con un set
     global, dos anfitriones que comparten… no pueden compartir pieza —el
     puntero es uno—, pero el mismo id podría aparecer dos veces si las filas
     vinieran duplicadas, y entonces se descartaría una rama buena por «ciclo».
     La rama actual es exactamente la pregunta que se hace. */
  /* Lo que ya salió en ALGÚN árbol. Es lo que distingue «esta pieza está en un
     sitio» de «esta pieza no se pinta en ninguna parte», y sin ello un ciclo
     puro —A dentro de B y B dentro de A— desaparecía ENTERO: ninguno de los
     dos es raíz (los dos tienen `ensamblado_en`), así que `construir` no se
     llamaba nunca y las dos filas no salían ni en el árbol ni en los avisos.
     Dos equipos que existen y que la pantalla no menciona: el fallo silencioso
     exacto que esta lista viene a evitar. */
  const pintados = new Set<string>();
  const construir = (e: any, enRama: Set<string>): NodoEns => {
    pintados.add(e.id);
    const n = nodo(e);
    for (const h of hijosDe.get(e.id) || []) {
      if (enRama.has(h.id)) continue;   // bucle: se corta y sigue
      n.piezas.push(construir(h, new Set([...enRama, h.id])));
    }
    /* Por folio, que es el orden de las etiquetas físicas: repasar un rig
       contra lo que tiene delante se hace leyendo folios. */
    n.piezas.sort((a, b) => (a.folio || "￿").localeCompare(b.folio || "￿", "es"));
    return n;
  };

  /* Anfitriones de PRIMER nivel: los que llevan algo dentro y no van dentro de
     nadie. Uno que sí va dentro de otro no es una raíz — se pinta anidado en
     el suyo, que es donde está de verdad.
     ⚠ Y que no esté ya en `sueltas`. Una HUÉRFANA con piezas cumple las dos
     condiciones de arriba —puntero nulo y con hijos—, así que salía como raíz
     Y como aviso: la misma fila contada dos veces en el número de la pestaña,
     en el total de piezas y en el valor, y pintada en dos sitios de la
     pantalla. Su rama no se pierde: se le cuelga más abajo, en el rescate. */
  const yaDicha = new Set(sueltas.map(s => s.id));
  const raices = (filas || [])
    .filter(e => hijosDe.has(e.id) && !e.ensamblado_en && !yaDicha.has(e.id))
    .map(e => construir(e, new Set([e.id])))
    .sort((a, b) => (a.folio || "￿").localeCompare(b.folio || "￿", "es"));

  /* Un anfitrión que apunta a un id que no está también lleva piezas dentro, y
     esas piezas se quedarían sin pintar en ningún sitio. Se rescata su rama:
     la fila ya está en `sueltas` diciendo qué le pasa, y aquí se le cuelgan
     sus hijos para que el árbol no pierda nada. */
  for (const s of sueltas) {
    if (hijosDe.has(s.id)) s.piezas = construir(porId.get(s.id), new Set([s.id])).piezas;
  }

  /* ── EL CICLO: SOLO QUIEN ESTÁ DENTRO DEL BUCLE ──
     Lo que queda sin pintar después de las raíces tiene puntero bueno y no
     cuelga de ninguna: o está en un bucle, o cuelga de uno. NO son lo mismo y
     etiquetarlos igual es acusar a una pieza sana — «está montada dentro de sí
     misma» sobre algo que solo tiene la mala suerte de colgar de dos que sí lo
     están. Peor: como se barría en el orden de `folio`, la MISMA base daba dos
     pantallas distintas según qué fila se mirara primero.

     Se pregunta por lo único que define el bucle: subiendo por `ensamblado_en`,
     ¿se vuelve a pasar por uno mismo? Solo esos se dicen, y cada uno arrastra
     su rama — así lo que cuelga del bucle aparece dentro de él, que es donde
     está, y no repetido como aviso propio.

     ⚠ `enRama` en `construir` ya no puede dispararse: `ensamblado_en` es UNA
     columna, así que cada equipo tiene como mucho un padre y un bucle es un
     componente cerrado — no puede colgar de una raíz. Se probó con sesenta mil
     grafos aleatorios y no ocurrió ni una vez. La guarda se queda porque es lo
     que impide que un dato raro cuelgue el render en un bucle infinito, pero no
     se le pide que informe de nada: de eso se encarga este barrido. */
  const enBucle = (id: string) => {
    let cursor: string | null = porId.get(id)?.ensamblado_en || null;
    const vistos = new Set<string>([id]);
    while (cursor) {
      if (cursor === id) return true;
      if (vistos.has(cursor)) return false;   // otro bucle, más arriba: no es el mío
      vistos.add(cursor);
      cursor = porId.get(cursor)?.ensamblado_en || null;
    }
    return false;
  };
  for (const e of filas || []) {
    if (!e.ensamblado_en || !porId.has(e.ensamblado_en)) continue;
    if (pintados.has(e.id) || !enBucle(e.id)) continue;
    sueltas.push({
      ...nodo(e), falla: "ciclo", apuntaA: e.ensamblado_en,
      piezas: construir(e, new Set([e.id])).piezas,
    });
  }

  return { raices, sueltas };
}

