/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA CADA COSA — la cadena, resuelta en un solo sitio

   La respuesta a «¿dónde se guarda la cámara?» no está en una columna: está
   en una cadena. La cámara va en el Bolso Tenba, el Bolso Tenba está en el
   Cajón 08, el Cajón 08 está en el Depósito. Lo que se lee es
   «Depósito › Cajón 08 › Bolso Tenba», y sale de subir esa cadena — no de un
   texto que alguien mantiene al día en catorce descripciones.

   El porqué del modelo está en db/sitios.sql. Aquí solo la regla, y vive en un
   módulo aparte por dos motivos:

   · UNA SOLA VEZ. La van a preguntar la ficha del equipo, el inventario, la
     pestaña de ensamblados, el panel de kits y la vista por sitio. Escrita en
     cinco, la ficha diría «Cajón 08» y la lista «Bolso Tenba» del mismo
     equipo, y las dos tendrían razón a medias.
   · SIN SERVIDOR. No importa nada: los paneles que la usan son de cliente, y
     colgar de un módulo que importe `lib/supabase/server` rompe el build de
     Next sin que `tsc` diga una palabra. Es lo que ya pasó con
     `lib/ensamblados`.

   ── LAS TRES FORMAS DE ESTAR MAL, OTRA VEZ ──
   Un puntero suelto siempre tiene las mismas: apuntar a algo que no está
   (ROTO), dar vueltas (BUCLE), o no apuntar a nada (SIN SITIO). Las tres se
   devuelven con nombre en vez de resolverse en un `null` que la pantalla no
   puede distinguir de «todavía no lo he anotado».
   ══════════════════════════════════════════════════════════════════════════ */

export type Sitio = {
  id: string;
  nombre: string;
  dentro_de?: string | null;
};

/** Lo mínimo de un equipo para saber dónde se guarda. Lo cumplen las filas
 *  flacas del inventario sin tocar nada. */
export type EqGuardable = {
  id: string;
  nombre?: string | null;
  folio?: string | null;
  /** Atornillado dentro de otro: entonces NO tiene sitio propio. */
  ensamblado_en?: string | null;
  guardado_sitio?: string | null;
  guardado_en_equipo?: string | null;
};

/** Un eslabón de la cadena, de fuera hacia dentro. */
export type Tramo = {
  tipo: "sitio" | "equipo";
  id: string;
  nombre: string;
  folio?: string | null;
};

export type Guardado = {
  /** De FUERA a DENTRO: [Depósito, Cajón 08, Bolso Tenba]. Vacía = no se sabe. */
  ruta: Tramo[];
  /** De dónde sale la respuesta. Cambia la frase que pinta la pantalla y si se
   *  puede editar ahí mismo: lo heredado se cambia en quien lo contiene. */
  origen:
    | "propio"       // tiene su sitio anotado
    | "contenedor"   // está metido en otro equipo (su bolso, su maleta)
    | "ensamblado"   // está atornillado dentro de otro: no puede tener el suyo
    | "ninguno";     // nadie lo ha anotado
  /** La cadena daba vueltas y se cortó. Lo de la ruta es cierto hasta el corte. */
  bucle: boolean;
  /** Apunta a un sitio o a un equipo que no está en las listas cargadas. Puede
   *  ser un borrado a medias… o que la lista venía cortada por el tope de la
   *  API, que es muy distinto — por eso se dice y no se traga. */
  roto: boolean;
};

const VACIO: Guardado = { ruta: [], origen: "ninguno", bucle: false, roto: false };

/** «Depósito › Cajón 08 › Bolso Tenba». Sin ruta, cadena vacía: quien la pinte
 *  decide qué decir cuando no se sabe, que no es lo mismo en una ficha que en
 *  una fila de lista. */
export const textoDeRuta = (r: Tramo[]) => r.map(t => t.nombre).join(" › ");

/* ══════════════════════════════════════════════════════════════════════════
   EL RESOLVEDOR

   Se construye una vez por pantalla con las dos listas y contesta por id. Con
   memoria: en un inventario de quinientos equipos guardados en veinte bolsos,
   sin ella la cadena del bolso se recorre quinientas veces.
   ══════════════════════════════════════════════════════════════════════════ */
export function resolvedorDeGuardado(sitios: Sitio[], equipos: EqGuardable[]) {
  const porSitio = new Map<string, Sitio>((sitios || []).map(s => [s.id, s]));
  const porEq = new Map<string, EqGuardable>((equipos || []).map(e => [e.id, e]));
  const memoSitio = new Map<string, { ruta: Tramo[]; bucle: boolean; roto: boolean }>();
  const memoEq = new Map<string, Guardado>();

  /** La cadena de un SITIO, de fuera a dentro, él incluido. */
  function rutaDeSitio(id: string): { ruta: Tramo[]; bucle: boolean; roto: boolean } {
    const hecho = memoSitio.get(id);
    if (hecho) return hecho;
    const dentroAfuera: Tramo[] = [];
    const vistos = new Set<string>();
    let cursor: string | null = id;
    let bucle = false, roto = false;
    while (cursor) {
      if (vistos.has(cursor)) { bucle = true; break; }
      vistos.add(cursor);
      const s = porSitio.get(cursor);
      /* ⚠ Un `dentro_de` que no lleva a ninguna parte también es ROTO, y no
         solo cuando el roto es el primer eslabón. Se devolvía la ruta a medias
         sin marca: «Cajón 07» a secas, idéntico a un cajón sano que está en la
         raíz. El aviso desaparecía justo en el caso en que hace falta. */
      if (!s) { if (cursor !== id) roto = true; break; }
      dentroAfuera.push({ tipo: "sitio", id: s.id, nombre: s.nombre });
      cursor = s.dentro_de || null;
    }
    /* ⚠ Con bucle NO se devuelve la ruta a medias. Recorrer una cadena
       circular da un trozo que depende de por dónde se entró —«Bucle B ›
       Bucle A» pedido desde uno y al revés desde el otro—, y pintar eso es
       enseñar una ubicación inventada al lado de un icono de aviso. Lo único
       cierto es que no se sabe. */
    const r = bucle
      ? { ruta: [] as Tramo[], bucle: true, roto }
      : { ruta: dentroAfuera.reverse(), bucle: false, roto };
    memoSitio.set(id, r);
    return r;
  }

  /* ⚠ `enCurso` y no solo la memoria: un bucle de equipos —A guardado en B y B
     en A— se detecta porque se vuelve a pedir uno que todavía se está
     resolviendo. Con la memoria sola la llamada se repetiría para siempre,
     porque el resultado aún no está escrito cuando vuelve a pedirse. */
  const enCurso = new Set<string>();

  function de(id: string): Guardado {
    const hecho = memoEq.get(id);
    if (hecho) return hecho;
    if (enCurso.has(id)) return { ...VACIO, bucle: true };

    const e = porEq.get(id);
    if (!e) return VACIO;

    enCurso.add(id);
    let out: Guardado;

    /* El orden importa y es el del check de la base: atornillado gana, porque
       una pieza montada NO PUEDE tener sitio propio. Si aun así lo tuviera
       —una fila anterior a la migración—, se ignora en vez de enseñar dos
       respuestas: la de la base es la que manda. */
    const padre = e.ensamblado_en
      ? { id: e.ensamblado_en, origen: "ensamblado" as const }
      : e.guardado_en_equipo
      ? { id: e.guardado_en_equipo, origen: "contenedor" as const }
      : null;

    if (padre) {
      const cont = porEq.get(padre.id);
      if (!cont) {
        out = { ruta: [], origen: padre.origen, bucle: false, roto: true };
      } else {
        const arriba = de(padre.id);
        /* ⚠ Con bucle, ruta VACÍA. Sin esto, A guardado en B y B en A daban
           «Bolso A › Bolso B» para A: la cadena pasaba por el propio A y la
           pantalla decía que A se guarda dentro de A. Lo único cierto de un
           bucle es que no se sabe dónde está nada de lo que cuelga de él. */
        out = arriba.bucle
          ? { ruta: [], origen: padre.origen, bucle: true, roto: arriba.roto }
          : {
            /* La ruta del contenedor MÁS el contenedor: lo que se busca al
               final es el bolso, y decir solo «Cajón 08» manda a abrir el
               cajón entero. */
            ruta: [...arriba.ruta, {
              tipo: "equipo", id: cont.id,
              nombre: cont.nombre || "sin nombre", folio: cont.folio || null,
            }],
            origen: padre.origen, bucle: false, roto: arriba.roto,
          };
      }
    } else if (e.guardado_sitio) {
      const s = rutaDeSitio(e.guardado_sitio);
      out = { ruta: s.ruta, origen: "propio", bucle: s.bucle,
        /* Roto si el sitio al que apunta no existe —ruta vacía sin bucle— o si
           lo que no existe es alguno de sus padres. */
        roto: s.roto || (!s.ruta.length && !s.bucle) };
    } else {
      out = VACIO;
    }

    enCurso.delete(id);
    memoEq.set(id, out);
    return out;
  }

  /** Igual, para un KIT: los mismos dos punteros, sin `ensamblado_en`. */
  function deKit(k: { guardado_sitio?: string | null; guardado_en_equipo?: string | null }): Guardado {
    if (k.guardado_en_equipo) {
      const cont = porEq.get(k.guardado_en_equipo);
      if (!cont) return { ruta: [], origen: "contenedor", bucle: false, roto: true };
      const arriba = de(cont.id);
      if (arriba.bucle) return { ruta: [], origen: "contenedor", bucle: true, roto: arriba.roto };
      return {
        ruta: [...arriba.ruta, {
          tipo: "equipo", id: cont.id,
          nombre: cont.nombre || "sin nombre", folio: cont.folio || null,
        }],
        origen: "contenedor", bucle: false, roto: arriba.roto,
      };
    }
    if (k.guardado_sitio) {
      const s = rutaDeSitio(k.guardado_sitio);
      return { ruta: s.ruta, origen: "propio", bucle: s.bucle,
        roto: s.roto || (!s.ruta.length && !s.bucle) };
    }
    return VACIO;
  }

  return { de, deKit, rutaDeSitio };
}
