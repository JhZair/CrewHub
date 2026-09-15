"use client";
import { useMemo, useState } from "react";
import Link from "@/components/Enlace";
import { casaConsulta } from "@/lib/sitios";
import { ETAPAS, ORDEN, icoEtapa, txtEtapa, nrm, type Rival, type Director, type ConvRival, type Intento, type FilaRival }
  from "@/lib/rivales";
import { familiaDe } from "@/lib/concursos";

/* ══════════════════════════════════════════════════════════════════════════
   🏁 QUIÉN VUELVE A INTENTARLO

   La pestaña de cada convocatoria contesta «¿contra quién compito ESTE año?».
   Esta pantalla contesta la otra mitad, que solo aparece cuando hay varias
   ediciones cargadas: «¿quién lleva cuatro años presentándose?», «¿quién ganó
   y volvió?», «¿este director es el mismo que el año pasado iba con otra
   productora?».

   ── POR QUÉ EL NÚMERO GRANDE ES EL DE CONVOCATORIAS ──
   Porque es la única cifra que mide constancia. Una empresa que mete tres
   proyectos a un solo concurso no lleva tres intentos: lleva uno, con tres
   caballos. El desglose de cada año está debajo, al desplegar.

   ── LAS DOS VISTAS ──
   Por EMPRESA es la lectura obvia. Por DIRECTOR es la que no se puede hacer de
   ninguna otra manera y suele ser la más reveladora: las productoras se crean,
   se cierran y se renombran; las personas siguen siendo las mismas y aparecen
   este año con una razón social que no habíamos visto nunca.

   ⚠ Todo esto vale lo que valgan las listas cargadas. Si de un concurso solo se
   subió el fallo, sus recibidas no están y sus rivales aparecerán con menos
   intentos de los que tuvieron. El pie de la pantalla dice siempre qué se leyó.
   ══════════════════════════════════════════════════════════════════════════ */

type Vista = "empresas" | "directores" | "terreno";
type Orden = "veces" | "lejos" | "az" | "nuevo";

const anioDe = (i: Intento) => i.conv?.anio || 0;

/** Cómo se dice la etapa de UNA empresa. `txtEtapa` habla en plural —«ganaron»,
 *  «finalistas»— porque nació para rotular las bandas del embudo, y en la
 *  insignia de una sola empresa se lee como si fueran varias. */
const SOLA: Record<string, string> = {
  recibida: "se presentó", apta: "apta", finalista: "finalista", beneficiaria: "ganó",
};

/** De la etapa a su contador, que no se llaman igual: la etapa es «recibida»
 *  —una fila— y el contador «recibidas» —cuántas hay—. */
const CAMPO = {
  recibida: "recibidas", apta: "aptas", finalista: "finalistas", beneficiaria: "ganaron",
} as const;

/** La etiqueta de una convocatoria en una tira estrecha: el año manda, y el
 *  código solo desempata cuando hay dos del mismo año. */
const rotuloConv = (c: ConvRival | null, repes: Set<number>) => {
  if (!c) return "¿?";
  if (!c.anio) return c.codigo || c.nombre.slice(0, 12);
  return repes.has(c.anio) && c.codigo ? `${c.anio} ${c.codigo}` : String(c.anio);
};

export default function MatrizRivales({ rivales, directores, convs, filas }: {
  rivales: Rival[];
  directores: Director[];
  /** Solo las convocatorias que tienen listas cargadas, de la más nueva a la
   *  más vieja: son las columnas de la matriz. */
  convs: ConvRival[];
  filas: number;
}) {
  const [vista, setVista] = useState<Vista>("empresas");
  const [busca, setBusca] = useState("");
  const [fConv, setFConv] = useState("");
  const [fReg, setFReg] = useState("");
  const [fCat, setFCat] = useState("");
  const [repiten, setRepiten] = useState(false);
  const [ganaron, setGanaron] = useState(false);
  const [orden, setOrden] = useState<Orden>("veces");
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});

  /* Años repetidos: si hay dos concursos de 2026, el año solo no distingue. */
  const repes = useMemo(() => {
    const vistos = new Set<number>(), dos = new Set<number>();
    convs.forEach(c => { if (c.anio) { if (vistos.has(c.anio)) dos.add(c.anio); vistos.add(c.anio); } });
    return dos;
  }, [convs]);

  const regs = useMemo(
    () => [...new Set(rivales.flatMap(r => r.regiones))].sort(), [rivales]);
  const cats = useMemo(
    () => [...new Set(rivales.flatMap(r => r.intentos.map(i => i.fila.categoria)))]
      .filter(Boolean).sort() as string[], [rivales]);

  /* ── LOS FILTROS RECORTAN LA LISTA, NO LOS NÚMEROS ──
     Filtrar por 2026 quiere decir «de los que estuvieron en 2026, enséñame su
     historial completo», no «cuenta solo 2026». Si el filtro recortara también
     el contador, todos saldrían con un intento y la pantalla no diría nada. */
  const casa = (texto: string) => !busca.trim() || casaConsulta(texto, busca);
  const enConv = (is: Intento[]) => !fConv || is.some(i => i.fila.convocatoria_id === fConv);

  /* ── ⚠ QUÉ HIZO ESTE RIVAL EN LA CONVOCATORIA QUE SE ESTÁ MIRANDO ──
     Aquí había un fallo de los que no dan error y se leen perfectamente. Con
     el filtro «estuvo en 2024» puesto, la insignia de cada empresa seguía
     diciendo su mejor resultado DE TODOS LOS AÑOS: salían trece «🏆 ganó» en
     una lista encabezada por 2024, y 2024 no repartió trece estímulos. Los
     chips de años, justo debajo, decían la verdad —«2024 ✅ apta», «2025 🏆»—
     pero nadie lee la letra pequeña para desmentir un titular.
     Y no era solo la insignia: el orden «llegó más lejos» ordenaba por el
     mismo máximo global, así que los trece falsos ganadores salían arriba.

     La regla: si hay una convocatoria elegida, TODO lo que resuma una fila
     —insignia, monto y orden— habla de ESA. Lo de las otras ediciones sigue
     estando, en los chips y en un aviso aparte que dice que es de otro año. */
  const enEsa = (is: Intento[]) => {
    if (!fConv) return null;
    const suyas = is.filter(i => i.fila.convocatoria_id === fConv);
    if (!suyas.length) return null;
    const mejor = suyas.reduce((m, i) =>
      (ORDEN[i.fila.etapa] || 0) > (ORDEN[m.fila.etapa] || 0) ? i : m, suyas[0]);
    /* Los años en los que ganó pero NO es este: es lo que la insignia vieja
       estaba enseñando como si fuera de aquí, y sigue siendo un dato bueno
       —solo que de otra edición, y hay que decirlo—. */
    const fuera = [...new Set(is
      .filter(i => i.fila.etapa === "beneficiaria" && i.fila.convocatoria_id !== fConv)
      .map(i => i.conv?.anio || 0).filter(Boolean))].sort((a, b) => b - a);
    return {
      etapa: mejor.fila.etapa,
      n: suyas.length,
      anio: mejor.conv?.anio ?? null,
      soles: suyas.reduce((t, i) =>
        t + (i.fila.etapa === "beneficiaria" ? Number(i.fila.monto) || 0 : 0), 0),
      gano: suyas.some(i => i.fila.etapa === "beneficiaria"),
      ganoFuera: fuera,
    };
  };
  /* Hasta dónde llegó, para ORDENAR: en la edición elegida si hay una, y si
     no, en su mejor año. Sin esto, «llegó más lejos» con un filtro puesto
     ordena por un resultado que no es el de la lista que se está mirando. */
  const lejosDe = (r: { intentos: Intento[]; mejor: string }) =>
    fConv ? (ORDEN[enEsa(r.intentos)?.etapa || ""] || 0) : (ORDEN[r.mejor] || 0);
  /* Y lo mismo para el interruptor «solo los que ganaron». */
  const ganoAqui = (r: { intentos: Intento[]; gano: number }) =>
    fConv ? !!enEsa(r.intentos)?.gano : r.gano > 0;
  const enCat = (is: Intento[]) => !fCat || is.some(i => i.fila.categoria === fCat);

  const lista = useMemo(() => {
    const out = rivales.filter(r =>
      enConv(r.intentos) && enCat(r.intentos)
      && (!fReg || r.regiones.includes(fReg))
      && (!repiten || r.veces > 1)
      && (!ganaron || ganoAqui(r))
      && casa([r.nombre, ...r.alias, r.ruc, ...r.proyectos, ...r.directores].filter(Boolean).join(" · ")));
    const cmp: Record<Orden, (a: Rival, b: Rival) => number> = {
      veces: (a, b) => b.veces - a.veces || lejosDe(b) - lejosDe(a)
        || a.nombre.localeCompare(b.nombre),
      lejos: (a, b) => lejosDe(b) - lejosDe(a) || b.soles - a.soles
        || b.veces - a.veces || a.nombre.localeCompare(b.nombre),
      az: (a, b) => a.nombre.localeCompare(b.nombre),
      nuevo: (a, b) => Math.max(...b.intentos.map(anioDe), 0) - Math.max(...a.intentos.map(anioDe), 0)
        || b.veces - a.veces || a.nombre.localeCompare(b.nombre),
    };
    return out.sort(cmp[orden]);
  }, [rivales, busca, fConv, fReg, fCat, repiten, ganaron, orden]);

  const listaDir = useMemo(() => {
    const out = directores.filter(d =>
      enConv(d.intentos) && enCat(d.intentos)
      && (!fReg || d.intentos.some(i => i.fila.region === fReg))
      && (!repiten || d.veces > 1)
      && (!ganaron || ganoAqui(d))
      && casa([d.nombre, ...d.alias, ...d.empresas, ...d.proyectos].join(" · ")));
    if (orden === "az") return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === "nuevo") return out.sort((a, b) =>
      Math.max(...b.intentos.map(anioDe), 0) - Math.max(...a.intentos.map(anioDe), 0));
    if (orden === "lejos") return out.sort((a, b) =>
      lejosDe(b) - lejosDe(a) || b.veces - a.veces);
    return out;
  }, [directores, busca, fConv, fReg, fCat, repiten, ganaron, orden]);

  /* ══════════════════════════════════════════════════════════════════════
     📊 EL TERRENO: LO QUE DICEN LOS NÚMEROS DEL CONCURSO, NO DE UN RIVAL

     Las otras dos vistas contestan «¿quién?». Esta contesta «¿cómo está el
     patio?», que es la que decide a qué presentarse: cuántos compiten por cada
     estímulo, si de verdad hay sitio para regiones, y cuántas veces se ha
     presentado la gente antes de ganar por primera vez.

     ⚠ TODO ESTO VALE LO QUE VALGAN LAS LISTAS CARGADAS, y de una manera que
     hay que decir en pantalla: los porcentajes de un concurso del que solo se
     subió el fallo dirían que gana el cien por cien. Por eso el porcentaje de
     conversión se calcula SOLO sobre las convocatorias que tienen las dos
     listas —la de partida y la de llegada— y las demás se enseñan con sus
     números crudos y un aviso. Un número sin contexto miente mejor que una
     tabla vacía.
     ══════════════════════════════════════════════════════════════════════ */
  const planas = useMemo(() =>
    rivales.flatMap(r => r.intentos.map(i => ({ i, r }))), [rivales]);

  const porConv = useMemo(() => convs.map(c => {
    const fs = planas.filter(x => x.i.fila.convocatoria_id === c.id);
    const hasta = (k: string) => fs.filter(x => (ORDEN[x.i.fila.etapa] || 0) >= ORDEN[k]).length;
    const mias = fs.filter(x => x.r.nuestra);
    const recibidas = hasta("recibida"), aptas = hasta("apta");
    const finalistas = hasta("finalista"), ganaron = hasta("beneficiaria");
    /* ── ⚠ CUÁNDO UNA CIFRA ES UN DATO Y CUÁNDO ES UN ESPEJISMO ──
       «Se presentaron 42, aptas 42» no es un concurso donde no eliminaron a
       nadie: es un concurso del que solo se cargó la lista de aptas. La tabla
       lo daba por bueno y decía «se presentaron 42» de un concurso al que se
       presentaron ciento y pico — y de paso dibujaba su barra más corta que la
       de otro año, como si hubiera tenido menos cola.
       Se distingue sin adivinar: si una etapa tiene los mismos que la
       siguiente, su lista no está. En estos concursos SIEMPRE cae alguien en
       cada filtro; que no caiga ninguno solo pasa cuando el filtro no se ha
       leído. Lo que no se sabe se dice, no se rellena. */
    const sabemos = {
      recibida: recibidas > aptas,
      apta: aptas > finalistas,
      finalista: finalistas > ganaron,
      beneficiaria: ganaron > 0,
    };
    return {
      c, filas: fs.length, recibidas, aptas, finalistas, ganaron, sabemos,
      /** Documental, ficción, animación… sale del nombre del concurso. */
      familia: familiaDe(c.nombre),
      /** Lo primero que sí sabemos: donde de verdad empieza su embudo. */
      desde: (["recibida", "apta", "finalista", "beneficiaria"] as const)
        .find(k => (sabemos as any)[k]) || "beneficiaria",
      soles: fs.reduce((s, x) => s + (Number(x.i.fila.monto) || 0), 0),
      mias: mias.length,
      /* Hasta dónde llegamos NOSOTROS ese año, que es la única cifra de esta
         tabla que no habla de los demás — y CUÁNTAS de las nuestras llegaron
         ahí, que no es lo mismo: «🏆 ×3» se leía como «ganamos tres». */
      nuestroMejor: mias.reduce((m, x) =>
        (ORDEN[x.i.fila.etapa] || 0) > (ORDEN[m] || 0) ? x.i.fila.etapa : m, ""),
      miasArriba: (k: string) => mias.filter(x => x.i.fila.etapa === k).length,
    };
  }), [convs, planas]);

  /* Una convocatoria sirve para medir conversión si tiene las dos listas. Se
     reconoce porque el número de la etapa de partida es MAYOR que el de
     llegada: si son iguales, la lista de partida no se cargó —de veinte aptas
     nunca pasan veinte a finalistas—. */
  const conversion = (de: string, a: string, lote: typeof porConv = porConv) => {
    const utiles = lote.filter(p => (p as any)[de] > (p as any)[a] && (p as any)[a] > 0);
    const arriba = utiles.reduce((n, p) => n + (p as any)[de], 0);
    const abajo = utiles.reduce((n, p) => n + (p as any)[a], 0);
    return { pct: arriba ? Math.round((abajo / arriba) * 100) : null, n: utiles.length, arriba, abajo };
  };

  /* ── ⚠ POR QUÉ LAS TASAS VAN PARTIDAS POR FAMILIA DE CONCURSO ──
     Sumar todas las convocatorias en un solo porcentaje daba una cifra que no
     describe ningún concurso real. En documental de producción ganan 8 de 42;
     en el concurso de proyectos de ficción, 10 de 202. El promedio de las dos
     —una media pesada por el tamaño de cada lista— sale parecido al del
     concurso más numeroso y se lee como si fuera el de todos: quien mire «31%
     de las finalistas se llevan el estímulo» antes de presentarse a documental
     está mirando, sin saberlo, sobre todo el número de ficción.

     Así que cada familia lleva su propia cuenta. Se agrupa por el primer eje
     del nombre —el TIPO de obra—, no por la etapa financiada: 42 documentales
     compitiendo entre sí son un patio, y que sea desarrollo o producción mueve
     el número, sí, pero mucho menos que cambiar de tipo de obra. Cuando solo
     hay una familia cargada no se parte nada: un solo bloque sin encabezado,
     que es lo que había antes. */
  const familias = useMemo(() => {
    const m = new Map<string, typeof porConv>();
    for (const p of porConv) {
      if (!m.has(p.familia)) m.set(p.familia, []);
      m.get(p.familia)!.push(p);
    }
    /* De más a menos ediciones cargadas: el concurso del que más sabemos
       primero, que es el que da la cifra en la que más se puede confiar. */
    return [...m.entries()].map(([familia, lote]) => ({ familia, lote }))
      .sort((a, b) => b.lote.length - a.lote.length || a.familia.localeCompare(b.familia));
  }, [porConv]);

  /* ── ¿CUÁNTAS VECES SE PRESENTÓ ANTES DE GANAR? ──
     La pregunta que justifica toda esta pantalla. ⚠ Se cuenta sobre las
     ediciones CARGADAS: quien ganó en 2022 pudo haberse presentado en 2019, y
     eso aquí no está, así que «ganó a la primera» se lee «ganó en la primera
     que tenemos». */
  const hastaGanar = useMemo(() => {
    const cuenta = [0, 0, 0]; // 1ª · 2ª · 3ª o más
    for (const r of rivales) {
      if (!r.gano) continue;
      const orden = [...r.intentos].sort((a, b) => anioDe(a) - anioDe(b));
      const vistas: string[] = [];
      for (const i of orden) {
        if (!vistas.includes(i.fila.convocatoria_id)) vistas.push(i.fila.convocatoria_id);
        if (i.fila.etapa === "beneficiaria") break;
      }
      cuenta[Math.min(vistas.length, 3) - 1]++;
    }
    return cuenta;
  }, [rivales]);

  /** Presentados y ganadores por un corte cualquiera —región, categoría—. */
  const reparto = (saca: (f: FilaRival) => string | null) => {
    const m = new Map<string, { n: number; gano: number; soles: number }>();
    for (const { i } of planas) {
      const k = (saca(i.fila) || "—").trim() || "—";
      if (!m.has(k)) m.set(k, { n: 0, gano: 0, soles: 0 });
      const v = m.get(k)!;
      v.n++;
      if (i.fila.etapa === "beneficiaria") { v.gano++; v.soles += Number(i.fila.monto) || 0; }
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n || b.gano - a.gano);
  };
  const porRegion = useMemo(() => reparto(f => f.region), [planas]);

  /* ── ⚠ «CATEGORÍA» NO QUIERE DECIR LO MISMO EN TODOS LOS CONCURSOS ──
     En los de documental no hay categorías: la columna repite el nombre del
     concurso entero —«Producción de Documental»— para las cien filas. En los de
     ficción sí las hay de verdad: ópera prima, segunda obra, nuevos
     realizadores. Contándolas todas juntas, el reparto comparaba una categoría
     con un concurso y salía una lista sin sentido en la que «Producción de
     Documental» era la categoría más grande del mundo.
     Una categoría es de verdad cuando su propio concurso se REPARTE en varias.
     Eso se sabe mirando: si una convocatoria trae un solo valor, ese valor es
     el nombre del concurso y no una categoría, y se queda fuera. La regla se
     ajusta sola —el día que documental abra categorías, entrarán— y no depende
     de que yo sepa cómo se llaman este año. */
  const conCategorias = useMemo(() => {
    const por = new Map<string, Set<string>>();
    for (const { i } of planas) {
      const c = (i.fila.categoria || "").trim();
      if (!c) continue;
      if (!por.has(i.fila.convocatoria_id)) por.set(i.fila.convocatoria_id, new Set());
      por.get(i.fila.convocatoria_id)!.add(c.toLowerCase());
    }
    return new Set([...por].filter(([, v]) => v.size > 1).map(([k]) => k));
  }, [planas]);
  const porCategoria = useMemo(
    () => reparto(f => (conCategorias.has(f.convocatoria_id) ? f.categoria : null))
      .filter(x => x.k !== "—"),
    [planas, conCategorias]);
  const convsConCat = convs.filter(c => conCategorias.has(c.id));

  /* ══════════════════════════════════════════════════════════════════════
     🔎 LO QUE HABRÍA QUE REVISAR

     Una cifra de esta pantalla puede estar mal por una razón que no se ve: la
     misma postulación contada dos veces. Pasa cuando una empresa aparece con
     dos grafías en dos listas del mismo concurso —«3 PECADOS PRODUCCIONES
     S.A.C.» y «PRODUCCIONES SOCIEDAD ANONIMA CERRADA - 3 PECADOS»— y no se
     reconocen entre ellas: entran como dos competidores y el concurso parece
     tener uno más. Es invisible por definición, así que hay que ir a buscarlo.

     La prueba es el TÍTULO DEL PROYECTO: en un mismo concurso no hay dos
     proyectos con el mismo nombre. Si dos filas del mismo año comparten título,
     o una empieza igual que la otra —que es como llega cuando el lector le pegó
     detrás el nombre del director—, son la misma postulación leída dos veces.
     ⚠ Esto NO se arregla solo: hay que borrar la fila sobrante en la pestaña 🏁
     del concurso, porque cuál de las dos grafías es la buena no lo puede
     decidir el sistema. Aquí solo se señalan.
     ══════════════════════════════════════════════════════════════════════ */
  const dudosas = useMemo(() => {
    const por = new Map<string, { conv: ConvRival | null; filas: FilaRival[] }>();
    for (const { i } of planas) {
      const t = nrm(i.fila.titulo || "");
      if (t.length < 8) continue;
      const k = `${i.fila.convocatoria_id}|${t.slice(0, 24)}`;
      if (!por.has(k)) por.set(k, { conv: i.conv, filas: [] });
      por.get(k)!.filas.push(i.fila);
    }
    return [...por.values()].filter(g => g.filas.length > 1)
      .sort((a2, b2) => (b2.conv?.anio || 0) - (a2.conv?.anio || 0));
  }, [planas]);

  const nRepiten = rivales.filter(r => r.veces > 1).length;
  const nGanaron = rivales.filter(r => r.gano > 0).length;
  const nMulti = directores.filter(d => d.empresas.length > 1).length;
  const filtrando = !!(busca.trim() || fConv || fReg || fCat || repiten || ganaron);
  const limpiar = () => { setBusca(""); setFConv(""); setFReg(""); setFCat(""); setRepiten(false); setGanaron(false); };

  /* La tira de años de una empresa: una marca por convocatoria con la etapa más
     alta que alcanzó ahí, y «×2» si ese año fue con dos proyectos. */
  const tira = (intentos: Intento[]) => {
    const por = new Map<string, Intento[]>();
    intentos.forEach(i => {
      const k = i.fila.convocatoria_id;
      if (!por.has(k)) por.set(k, []);
      por.get(k)!.push(i);
    });
    return [...por.values()]
      .sort((a, b) => anioDe(b[0]) - anioDe(a[0]))
      .map(is => {
        const mejor = is.reduce((m, i) => (ORDEN[i.fila.etapa] || 0) > (ORDEN[m.fila.etapa] || 0) ? i : m, is[0]);
        return (
          <span key={is[0].fila.convocatoria_id}
            className={`mrv-ed e-${mejor.fila.etapa}${fConv === is[0].fila.convocatoria_id ? " on" : ""}`}
            title={`${is[0].conv?.nombre || "¿?"} — ${txtEtapa(mejor.fila.etapa)}`}>
            {rotuloConv(is[0].conv, repes)} {icoEtapa(mejor.fila.etapa)}
            {is.length > 1 && <b className="mrv-x">×{is.length}</b>}
          </span>
        );
      });
  };

  /* El desglose: una línea por fila real, con el concurso, el proyecto y quién
     lo dirigía. Es el sitio donde se comprueba que un cruce es de verdad. */
  const desglose = (intentos: Intento[], conEmpresa = false) => (
    <div className="mrv-det">
      {intentos.map(i => {
        const f = i.fila;
        const monto = f.monto == null ? null : Number(f.monto);
        return (
          <div key={f.id} className="mrv-det-fila">
            <span className="mrv-det-ico" title={txtEtapa(f.etapa)}>{icoEtapa(f.etapa)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mrv-det-l1">
                {i.conv
                  ? <Link href={`/entidad/convocatoria/${i.conv.id}`} className="mrv-conv">
                      {i.conv.anio ? `${i.conv.anio} · ` : ""}{i.conv.nombre}
                    </Link>
                  : <span className="mrv-conv">concurso desconocido</span>}
                {f.categoria && <span className="badge riv-cat">{f.categoria}</span>}
                {f.modalidad && <span className="mrv-mod" title={f.modalidad}>{f.modalidad}</span>}
                {monto ? <span className="riv-monto">S/ {monto.toLocaleString("es-PE")}</span> : null}
              </div>
              {conEmpresa && <div className="mrv-det-emp">🏢 {f.empresa}</div>}
              {f.titulo && <div className="riv-tit">{f.titulo}</div>}
              {!conEmpresa && f.personas && <div className="riv-dir">🎬 {f.personas}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="mrv-tarjetas">
        <div className="mrv-tarj">
          <span className="mrv-tarj-n">{rivales.length}</span>
          <span className="mrv-tarj-t">competidores distintos</span>
        </div>
        <button type="button" className={`mrv-tarj puls${repiten ? " on" : ""}`}
          onClick={() => setRepiten(v => !v)} title="Ver solo a los que se presentaron más de una vez">
          <span className="mrv-tarj-n">{nRepiten}</span>
          <span className="mrv-tarj-t">🔁 repiten</span>
        </button>
        <button type="button" className={`mrv-tarj puls${ganaron ? " on" : ""}`}
          onClick={() => setGanaron(v => !v)} title="Ver solo a los que ganaron alguna vez">
          <span className="mrv-tarj-n">{nGanaron}</span>
          <span className="mrv-tarj-t">🏆 ganaron</span>
        </button>
        <button type="button" className={`mrv-tarj puls${vista === "directores" ? " on" : ""}`}
          onClick={() => setVista("directores")}
          title="Personas que aparecen dirigiendo para más de una productora">
          <span className="mrv-tarj-n">{nMulti}</span>
          <span className="mrv-tarj-t">🎬 con 2+ productoras</span>
        </button>
      </div>

      <div className="riv-top">
        <div className="filt-tira" style={{ flex: "none" }}>
          <button type="button" className={`vtab${vista === "empresas" ? " on" : ""}`}
            onClick={() => setVista("empresas")}>🏢 empresas · {rivales.length}</button>
          <button type="button" className={`vtab${vista === "directores" ? " on" : ""}`}
            onClick={() => setVista("directores")}>🎬 directores · {directores.length}</button>
          <button type="button" className={`vtab${vista === "terreno" ? " on" : ""}`}
            onClick={() => setVista("terreno")}>📊 el terreno</button>
        </div>
        {vista !== "terreno" && (
        <div className="riv-busca" style={{ flex: 1, minWidth: 180 }}>
          <span className="riv-busca-ico">🔎</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="empresa, RUC, proyecto o director" />
          {busca && (
            <button type="button" className="riv-busca-x" onClick={() => setBusca("")}
              title="Limpiar la búsqueda">✕</button>
          )}
        </div>
        )}
      </div>

      {vista !== "terreno" && (
      <div className="riv-filtros">
        {convs.length > 1 && (
          <div className="filt-grupo">
            <span className="filt-tit">Estuvo en</span>
            <div className="filt-tira">
              <button type="button" className={`vtab${!fConv ? " on" : ""}`} onClick={() => setFConv("")}>cualquiera</button>
              {convs.map(c => (
                <button key={c.id} type="button" className={`vtab${fConv === c.id ? " on" : ""}`}
                  onClick={() => setFConv(v => (v === c.id ? "" : c.id))} title={c.nombre}>
                  {c.anio ? `${c.anio} · ` : ""}{c.codigo || c.nombre.slice(0, 22)}
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
                  onClick={() => setFCat(v => (v === c ? "" : c))}>{c}</button>
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
                  onClick={() => setFReg(v => (v === r ? "" : r))}>{r}</button>
              ))}
            </div>
          </div>
        )}
        <div className="filt-grupo">
          <span className="filt-tit">Ordenar</span>
          <div className="filt-tira">
            {([["veces", "🔁 más intentos"], ["lejos", "🏆 llegó más lejos"],
               ["nuevo", "🕑 más reciente"], ["az", "A–Z"]] as [Orden, string][]).map(([k, t]) => (
              <button key={k} type="button" className={`vtab${orden === k ? " on" : ""}`}
                onClick={() => setOrden(k)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      )}

      {vista !== "terreno" && filtrando && (
        <div className="riv-resumen">
          {vista === "empresas" ? `${lista.length} de ${rivales.length}` : `${listaDir.length} de ${directores.length}`}
          <button type="button" className="dato-btn" style={{ marginLeft: 8 }} onClick={limpiar}>✕ limpiar</button>
        </div>
      )}

      {vista === "terreno" ? (
        <div className="mrv-terreno">
          {/* ── LA MATRIZ DE VERDAD: UNA FILA POR EDICIÓN ──
              Es la tabla que contesta «¿cómo de duro fue cada año?» y, en la
              última columna, «¿y a nosotros cómo nos fue?». Las dos preguntas
              juntas en la misma línea, que es como se leen. */}
          <h4 className="mrv-h">Cada edición, de principio a fin</h4>
          {/* ══════════════════════════════════════════════════════════════
              EL EMBUDO DE CADA AÑO, DIBUJADO

              ⚠ ESTUVO MAL Y MERECE QUEDAR ESCRITO. La primera versión repartía
              el ancho entre «los que se quedan en cada etapa»: la barra entera
              eran los que se presentaron y cada tramo, cuántos caían ahí.
              Aritméticamente exacto y comunicativamente falso, porque cada
              tramo llevaba escrito el nombre de una etapa y un número que NO
              era el de esa etapa. En 2025 el tramo «finalistas» decía 8 —los
              dieciséis finalistas menos los ocho que ganaron— y en 2024 salía
              «8 finalistas» encima de «9 ganaron». Nadie tiene por qué
              reconstruir una resta mental para leer un dibujo: si hay que
              explicarlo, está mal.

              Ahora es un embudo literal: una barra por etapa, cada una con SU
              cifra, todas alineadas a la izquierda y medidas con la misma
              regla. Lo que se lee es el estrechamiento, que era el punto, y
              cada número coincide con el de la tabla de abajo. */}
          <div className="mrv-emb-leyenda">
            {ETAPAS.map(e => (
              <span key={e.k} className="mrv-emb-lg">
                <i className={`e-${e.k}`} /> {e.ico} {e.txt}
              </span>
            ))}
            <span className="mrv-emb-lg"><i className="mrv-lg-nose" /> sin cargar</span>
          </div>
          <div className="mrv-embudos">
            {porConv.map(p => {
              const tope = Math.max(...porConv.flatMap(x =>
                (["recibida", "apta", "finalista", "beneficiaria"] as const)
                  .filter(k => (x.sabemos as any)[k]).map(k => (x as any)[CAMPO[k]])), 1);
              return (
                <div key={p.c.id} className="mrv-grupo">
                  {/* ⚠ La familia va DEBAJO del título, no dentro: ese título
                      es una columna de 118px con recorte por puntos suspensivos
                      y se comió la etiqueta entera sin dejar rastro. */}
                  <div className="mrv-grupo-c">
                    <Link href={`/entidad/convocatoria/${p.c.id}`} className="mrv-grupo-t">
                      <b>{p.c.anio || "?"}</b> {p.c.codigo || p.c.nombre.slice(0, 18)}
                    </Link>
                    {familias.length > 1 && <span className="mrv-fam-chip">{p.familia}</span>}
                  </div>
                  <div className="mrv-grupo-b">
                    {ETAPAS.map(e => {
                      const sabe = (p.sabemos as any)[e.k];
                      const n = (p as any)[CAMPO[e.k as keyof typeof CAMPO]];
                      return (
                        <div key={e.k} className="mrv-paso">
                          <span className="mrv-paso-i" title={e.txt}>{e.ico}</span>
                          {sabe ? (
                            <>
                              <span className={`mrv-paso-b e-${e.k}`}
                                style={{ width: `${Math.max((n / tope) * 100, 0.8)}%` }}
                                title={`${n} ${e.txt} · ${p.c.nombre}`} />
                              <span className="mrv-paso-n">{n}</span>
                            </>
                          ) : (
                            /* Una etapa sin lista no se dibuja con un cero: un
                               cero es un dato y esto es la ausencia de uno. */
                            <span className="mrv-paso-nose"
                              title={`No se ha cargado la lista de ${e.txt} de este concurso.`}>
                              sin cargar
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mrv-tabla-caja">
            <table className="mrv-tabla">
              <thead>
                <tr>
                  <th>Concurso</th>
                  <th className="num">📨 se presentaron</th>
                  <th className="num">✅ aptas</th>
                  <th className="num">🏅 finalistas</th>
                  <th className="num">🏆 ganaron</th>
                  <th className="num">repartido</th>
                  <th>nosotros</th>
                </tr>
              </thead>
              <tbody>
                {porConv.map(p => (
                  <tr key={p.c.id}>
                    <td>
                      <Link href={`/entidad/convocatoria/${p.c.id}`}>
                        <b>{p.c.anio || "?"}</b> · {p.c.codigo || p.c.nombre}
                      </Link>
                      {familias.length > 1 && <span className="mrv-fam-chip">{p.familia}</span>}
                    </td>
                    {(["recibida", "apta", "finalista", "beneficiaria"] as const).map(k => (
                      <td key={k} className="num">
                        {(p.sabemos as any)[k]
                          ? (p as any)[CAMPO[k]]
                          : <span className="mrv-nose" title={`No se ha cargado la lista de ${txtEtapa(k)} de este concurso: el número que saldría aquí sería el de la etapa siguiente, no el de verdad.`}>sin cargar</span>}
                      </td>
                    ))}
                    <td className="num">{p.soles ? `S/ ${p.soles.toLocaleString("es-PE")}` : "—"}</td>
                    <td>
                      {p.mias
                        ? (
                          <span className="mrv-yo-celda">
                            <span className={`mrv-ed e-${p.nuestroMejor}`}>
                              {icoEtapa(p.nuestroMejor)} {p.miasArriba(p.nuestroMejor)} {txtEtapa(p.nuestroMejor)}
                            </span>
                            {p.mias > p.miasArriba(p.nuestroMejor) && (
                              <span className="mrv-nada"> de {p.mias} nuestras</span>
                            )}
                          </span>
                        )
                        : <span className="mrv-nada">no fuimos</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* ⚠ El porcentaje solo donde se puede calcular: ver el comentario de
              `conversion`. Si de un concurso solo se subió el fallo, sus
              recibidas no están y ese concurso no entra en la cuenta. */}
          {familias.map(({ familia, lote }) => {
            const frases = ([["recibidas", "aptas", "de las que se presentan pasan la revisión de papeles"],
                             ["aptas", "finalistas", "de las aptas llegan al encuentro con el jurado"],
                             ["finalistas", "ganaron", "de las finalistas se llevan el estímulo"]] as const)
              .map(([de, a2, txt]) => ({ de, txt, c: conversion(de, a2, lote) }))
              .filter(x => x.c.pct !== null);
            return (
              <div key={familia} className="mrv-frases">
                {/* El encabezado solo cuando hay con qué confundirse. */}
                {familias.length > 1 && (
                  <div className="mrv-fam">
                    {familia}
                    <span className="mrv-nota"> · {lote.length}{" "}
                      {lote.length === 1 ? "convocatoria cargada" : "convocatorias cargadas"}</span>
                  </div>
                )}
                {frases.length === 0 ? (
                  /* Sin dos listas seguidas no hay porcentaje que dar, y
                     callarse deja al lector creyendo que esta familia no tiene
                     competencia. Se dice qué falta. */
                  <div className="mrv-nota">
                    De {familias.length > 1 ? "esta familia" : "estos concursos"} no hay todavía ninguna
                    convocatoria con dos listas seguidas cargadas, así que no se puede calcular ningún
                    porcentaje sin inventarlo.
                  </div>
                ) : frases.map(({ de, txt, c }) => (
                  <div key={de} className="mrv-frase">
                    <b>{c.pct}%</b> {txt}
                    <span className="mrv-nota"> · {c.abajo} de {c.arriba}, en {c.n}{" "}
                      {c.n === 1 ? "concurso con las dos listas" : "concursos con las dos listas"}</span>
                  </div>
                ))}
              </div>
            );
          })}

          <h4 className="mrv-h">¿A la cuánta se gana?</h4>
          <div className="mrv-barras">
            {[0, 1, 2].map(k => {
              const n = hastaGanar[k];
              const tot = hastaGanar.reduce((a2, b2) => a2 + b2, 0) || 1;
              return (
                <div key={k} className="mrv-barra">
                  <span className="mrv-barra-t">{["a la primera", "a la segunda", "a la tercera o más"][k]}</span>
                  <span className="mrv-barra-v" style={{ width: `${Math.round((n / tot) * 100)}%` }} />
                  <span className="mrv-barra-n">{n}</span>
                </div>
              );
            })}
          </div>
          <div className="mrv-nota">
            De los {hastaGanar.reduce((a2, b2) => a2 + b2, 0)} que han ganado alguna vez, contando desde su
            primera aparición en las listas cargadas. ⚠ Quien ganó en la edición más antigua que tenemos
            pudo haberse presentado antes: para él, «a la primera» solo quiere decir «a la primera que vemos».
          </div>

          {dudosas.length > 0 && (
            <>
              <h4 className="mrv-h">🔎 Lo que habría que revisar</h4>
              <div className="mrv-nota" style={{ marginBottom: 7 }}>
                {dudosas.length}{" "}
                {dudosas.length === 1 ? "proyecto aparece dos veces" : "proyectos aparecen dos veces"} en
                su propio concurso. En un concurso no hay dos proyectos con el mismo nombre: es la misma
                postulación leída dos veces, con la empresa escrita de dos maneras. Cuenta de más en todas
                las cifras de arriba. Se quita borrando la fila sobrante en el 🏁 de su convocatoria.
              </div>
              <div className="mrv-dudas">
                {dudosas.slice(0, 12).map((g, k) => (
                  <div key={k} className="mrv-duda-f">
                    <Link href={`/entidad/convocatoria/${g.conv?.id}`} className="mrv-duda-c">
                      {g.conv?.anio || "?"} {g.conv?.codigo || ""}
                    </Link>
                    <div style={{ minWidth: 0 }}>
                      <div className="mrv-duda-t">«{g.filas[0].titulo}»</div>
                      {g.filas.map(f => (
                        <div key={f.id} className="mrv-duda-e">
                          {icoEtapa(f.etapa)} {f.empresa} {f.ruc ? `· ${f.ruc}` : "· sin RUC"}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mrv-dos">
            <div>
              <h4 className="mrv-h">Por región</h4>
              {porRegion.slice(0, 14).map(r => (
                <div key={r.k} className="mrv-linea">
                  <span className="mrv-linea-t">{r.k}</span>
                  <span className="mrv-linea-b"><i style={{ width: `${Math.round((r.n / porRegion[0].n) * 100)}%` }} /></span>
                  <span className="mrv-linea-n">{r.n}</span>
                  <span className={`mrv-linea-g${r.gano ? " si" : ""}`}>{r.gano ? `🏆 ${r.gano}` : "—"}</span>
                </div>
              ))}
            </div>
            {porCategoria.length > 0 && (
              <div>
                <h4 className="mrv-h">Por categoría</h4>
                {porCategoria.slice(0, 14).map(r => (
                  <div key={r.k} className="mrv-linea">
                    <span className="mrv-linea-t" title={r.k}>{r.k.length > 30 ? `${r.k.slice(0, 28)}…` : r.k}</span>
                    <span className="mrv-linea-b"><i style={{ width: `${Math.round((r.n / porCategoria[0].n) * 100)}%` }} /></span>
                    <span className="mrv-linea-n">{r.n}</span>
                    <span className={`mrv-linea-g${r.gano ? " si" : ""}`}>{r.gano ? `🏆 ${r.gano}` : "—"}</span>
                  </div>
                ))}
                {/* Sin esta línea, la lista parecería el reparto de TODO. */}
                <div className="mrv-nota" style={{ marginTop: 6 }}>
                  Solo los {convsConCat.length}{" "}
                  {convsConCat.length === 1 ? "concurso que se reparte" : "concursos que se reparten"} en
                  categorías ({convsConCat.map(c => c.codigo || c.anio).join(" · ")}). Los demás no tienen:
                  su «categoría» es el concurso entero.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : vista === "empresas" ? (
        <div className="riv-lista">
          {lista.map(r => {
            const ab = !!abierto[r.clave];
            return (
              <div key={r.clave} className={`riv-item mrv-item${r.nuestra ? " yo" : ""}`}>
                <span className={`mrv-veces v${Math.min(r.veces, 4)}`}
                  title={`Se presentó en ${r.veces} ${r.veces === 1 ? "convocatoria" : "convocatorias"}`}>
                  {r.veces}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="riv-l1">
                    <b>{r.nombre}</b>
                    {r.nuestra && <span className="badge riv-yo">nosotros</span>}
                    {r.ruc && <span className="kit-pz-folio">{r.ruc}</span>}
                    {r.regiones.map(g => <span key={g} className="badge riv-reg">{g}</span>)}
                    {(() => {
                      /* Con una convocatoria elegida, la insignia dice lo que
                         pasó AHÍ. Sin filtro, el resumen de todos los años. */
                      const e = enEsa(r.intentos);
                      if (e) return (
                        <>
                          <span className={`badge mrv-aqui e-${e.etapa}`}
                            title={`Lo que hizo en la convocatoria filtrada${e.n > 1 ? `, con ${e.n} proyectos` : ""}.`}>
                            {icoEtapa(e.etapa)} {SOLA[e.etapa] || e.etapa}
                            {e.anio ? ` en ${e.anio}` : ""}
                            {e.soles > 0 ? ` · S/ ${e.soles.toLocaleString("es-PE")}` : ""}
                          </span>
                          {/* Ganar otro año es un dato bueno y se enseña — pero
                              aparte y en gris, para que no se confunda con el
                              resultado del año que se está mirando. */}
                          {e.ganoFuera.length > 0 && (
                            <span className="badge mrv-gano-otro"
                              title={`Ganó en ${e.ganoFuera.join(", ")}, no en la convocatoria filtrada.`}>
                              🏆 ganó en {e.ganoFuera.join(", ")}
                            </span>
                          )}
                        </>
                      );
                      return r.gano > 0 ? (
                        <span className="badge mrv-gano">
                          🏆 ganó{r.gano > 1 ? ` ${r.gano} veces` : ""}
                          {r.soles > 0 ? ` · S/ ${r.soles.toLocaleString("es-PE")}` : ""}
                        </span>
                      ) : null;
                    })()}
                    {/* ⚠ El aviso de que este nombre podría ser de otra: se dice,
                        no se esconde ni se resuelve a la brava. */}
                    {r.ambiguo && (
                      <span className="badge mrv-duda"
                        title="Hay dos empresas con RUC distinto que se escriben casi igual: estas filas sin RUC no se pudieron atribuir a ninguna.">
                        ⚠ nombre repetido
                      </span>
                    )}
                  </div>
                  <div className="mrv-tira">{tira(r.intentos)}</div>
                  <button type="button" className="mrv-mas" onClick={() => setAbierto(v => ({ ...v, [r.clave]: !ab }))}>
                    {ab ? "▾" : "▸"} {r.proyectos.length} {r.proyectos.length === 1 ? "proyecto" : "proyectos"}
                    {r.directores.length > 0 && ` · ${r.directores.length} ${r.directores.length === 1 ? "director" : "directores"}`}
                    {r.alias.length > 0 && ` · ${r.alias.length + 1} grafías del nombre`}
                  </button>
                  {ab && (
                    <>
                      {r.alias.length > 0 && (
                        <div className="mrv-alias">también escrita: {r.alias.join(" · ")}</div>
                      )}
                      {desglose(r.intentos)}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {lista.length === 0 && <div className="empty" style={{ padding: "16px 0" }}>Nadie casa con eso.</div>}
        </div>
      ) : (
        <div className="riv-lista">
          {listaDir.map(d => {
            const ab = !!abierto[`d:${d.clave}`];
            return (
              <div key={d.clave} className={`riv-item mrv-item${d.nuestro ? " yo" : ""}`}>
                <span className={`mrv-veces v${Math.min(d.veces, 4)}`}
                  title={`Aparece en ${d.veces} ${d.veces === 1 ? "convocatoria" : "convocatorias"}`}>
                  {d.veces}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="riv-l1">
                    <b className="mrv-dir-nom">{d.nombre}</b>
                    {d.nuestro && <span className="badge riv-yo">nosotros</span>}
                    {/* El hallazgo que justifica esta vista entera. */}
                    {d.empresas.length > 1 && (
                      <span className="badge mrv-multi" title={d.empresas.join(" · ")}>
                        🏢 {d.empresas.length} productoras
                      </span>
                    )}
                    {(() => {
                      const e = enEsa(d.intentos);
                      if (e) return (
                        <>
                          <span className={`badge mrv-aqui e-${e.etapa}`}>
                            {icoEtapa(e.etapa)} {SOLA[e.etapa] || e.etapa}{e.anio ? ` en ${e.anio}` : ""}
                          </span>
                          {e.ganoFuera.length > 0 && (
                            <span className="badge mrv-gano-otro"
                              title={`Ganó en ${e.ganoFuera.join(", ")}, no en la convocatoria filtrada.`}>
                              🏆 ganó en {e.ganoFuera.join(", ")}
                            </span>
                          )}
                        </>
                      );
                      return d.gano > 0
                        ? <span className="badge mrv-gano">🏆 ganó{d.gano > 1 ? ` ${d.gano} veces` : ""}</span>
                        : null;
                    })()}
                  </div>
                  <div className="mrv-tira">{tira(d.intentos)}</div>
                  <div className="mrv-emp-lista">{d.empresas.join(" · ")}</div>
                  <button type="button" className="mrv-mas" onClick={() => setAbierto(v => ({ ...v, [`d:${d.clave}`]: !ab }))}>
                    {ab ? "▾" : "▸"} {d.proyectos.length} {d.proyectos.length === 1 ? "proyecto" : "proyectos"}
                  </button>
                  {ab && desglose(d.intentos, true)}
                </div>
              </div>
            );
          })}
          {listaDir.length === 0 && (
            <div className="empty" style={{ padding: "16px 0" }}>
              Nadie casa con eso. Recuerda que el director solo lo traen las listas
              que lo publican en su propia columna.
            </div>
          )}
        </div>
      )}

      {/* ⚠ EL PIE NO ES DECORACIÓN. Dice sobre cuántas filas está hecha la
          cuenta y de qué concursos: sin eso, «lo intentó dos veces» se lee como
          un hecho cuando puede ser solo lo que hay cargado. */}
      <div className="mrv-pie">
        {filas.toLocaleString("es-PE")} filas leídas de {convs.length}{" "}
        {convs.length === 1 ? "convocatoria" : "convocatorias"}:{" "}
        {convs.map((c, i) => (
          <span key={c.id}>
            {i > 0 && " · "}
            <Link href={`/entidad/convocatoria/${c.id}`}>
              {c.anio ? `${c.anio} ` : ""}{c.codigo || c.nombre}
            </Link>
          </span>
        ))}
        . Quien no aparezca en una lista que no se cargó, aquí sale con menos
        intentos de los que tuvo.
      </div>
    </>
  );
}
