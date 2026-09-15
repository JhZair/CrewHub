/* ══════════════════════════════════════════════════════════════════════════
   DE QUÉ CONCURSO ESTAMOS HABLANDO

   DAFO reparte sus estímulos en una rejilla de dos ejes: el TIPO de obra
   —documental, ficción, animación, cortometraje, serie— y la ETAPA que se
   financia —desarrollo, producción, postproducción…—. «Concurso de Proyectos
   de Documental», «Producción de Largometrajes de Ficción Nacional»: cada
   nombre dice su casilla, y dos nombres que caen en casillas distintas son
   concursos distintos por mucho que se parezcan.

   Esto vive en su propio archivo porque lo usan dos sitios que no se pueden
   importar entre ellos: el lector de PDF —para avisar si estás subiendo la
   lista de ficción a la ficha de documental— y la matriz de rivales —para no
   promediar en una sola cifra concursos donde ganan 8 de 42 con otros donde
   ganan 10 de 202—. Tenerlo copiado en los dos sería garantizar que un día
   digan cosas distintas.
   ══════════════════════════════════════════════════════════════════════════ */

/** Las casillas de la rejilla, en el orden en que se nombran. La primera
 *  palabra de cada fila es la que se busca; el resto son sus variantes. */
export const EJES: string[][][] = [
  [["documental"], ["ficcion"], ["animacion"], ["cortometraje"], ["serie"]],
  [["desarrollo"], ["postproduccion"], ["produccion"], ["distribucion"], ["exhibicion"]],
];

/** Cómo se llama cada casilla del primer eje cuando hay que enseñarla. */
const NOMBRES = ["Documental", "Ficción", "Animación", "Cortometraje", "Series"];

const sinTilde = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** En qué punto de cada eje cae un texto. `-1` si no lo dice. */
export function ejes(texto: string): number[] {
  const t = sinTilde(texto);
  return EJES.map(eje => eje.findIndex(v => v.some(w => t.includes(w))));
}

/** La familia de un concurso: su casilla en el primer eje, para agrupar.
 *  ⚠ «Otros» no es un cajón de sastre que haya que vaciar: es lo honrado
 *  cuando el nombre no dice de qué es, y meterlo con documental porque suele
 *  serlo mezclaría las cuentas sin que nadie pudiera verlo. */
export function familiaDe(nombre: string): string {
  const i = ejes(nombre)[0];
  return i >= 0 ? NOMBRES[i] : "Otros";
}

/* ══════════════════════════════════════════════════════════════════════════
   LA MISMA MODALIDAD ESCRITA DE DOS MANERAS SIGUE SIENDO UNA

   Los filtros de la pestaña 🏁 salen de lo que hay guardado, así que cada
   grafía distinta se convierte en un botón. Y el Ministerio no escribe dos
   veces igual: la relación de recibidas dice «DESARROLLO DE LARGOMETRAJES» y
   la de aptas, del mismo concurso, «Desarrollo de Largometrajes de
   Documental». Eso salía como dos modalidades de catorce y diecisiete, cuando
   el concurso tiene una sola de treinta y uno — y quien filtrara por una se
   perdía a la mitad de sus rivales sin enterarse.

   Hay dos maneras de escribir distinto y este archivo las trata distinto:

   1. LA MISMA FRASE CON OTRA ORTOGRAFÍA — mayúsculas, tildes, una letra que el
      PDF partió («Producció n»). Se reconocen por su LLAVE y no hay nada que
      decidir: son la misma.

   2. UNA FRASE MÁS CORTA QUE OTRA — «Desarrollo de Largometrajes» dentro de
      «Desarrollo de Largometrajes de Documental». Aquí sí hay que decidir, y
      es donde se puede meter la pata: «Documental» dentro de «Documental
      Regional» son DOS categorías, no una escrita a medias.

   ⚠ Para el caso 2 hacen falta las dos condiciones, y ninguna sobra:

   · Que la corta tenga UNA SOLA continuación posible. Si en el mismo concurso
     conviven «…de Documental» y «…de Ficción», la corta podría ser cualquiera
     de las dos y meterla en una sería inventarse el dato.
   · Que las dos NUNCA aparezcan en el mismo documento. Esta es la que salva de
     «Documental» / «Documental Regional»: si una resolución escribió las dos,
     esa resolución las está distinguiendo, y quien las distingue sabe más que
     esta función. Solo se unifica lo que ningún documento vio junto.

   ⚠ La llave es solo para comparar. Lo que se guarda es SIEMPRE una grafía que
   algún documento escribió de verdad, nunca una inventada aquí.
   ══════════════════════════════════════════════════════════════════════════ */

/** Sin tildes, sin mayúsculas, sin puntuación y con las letras sueltas que
 *  deja el PDF pegadas a su palabra. Solo para comparar. */
export function claveTexto(m: string | null | undefined): string {
  return String(m || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    /* «producció n» → «produccion»: la letra suelta que dejó el PDF. */
    .replace(/\b([a-z]{2,}) ([b-df-hj-np-tv-xz])\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export type Grafia = { texto: string | null | undefined; fuente?: string | null };

/**
 * De cada llave a la grafía con la que hay que enseñarla y guardarla.
 * Lo que no aparezca en el mapa es que no había nada que unificar.
 */
export function canoniza(entradas: Grafia[]): Map<string, string> {
  /* 1 · Cuántas veces se vio cada grafía, y en qué documentos. */
  const grafias = new Map<string, Map<string, number>>();
  const fuentes = new Map<string, Set<string>>();
  for (const e of entradas) {
    const t = String(e?.texto || "").trim();
    if (!t) continue;
    const k = claveTexto(t);
    if (!k) continue;
    if (!grafias.has(k)) { grafias.set(k, new Map()); fuentes.set(k, new Set()); }
    const g = grafias.get(k)!;
    g.set(t, (g.get(t) || 0) + 1);
    /* Sin documento, un cubo propio: dos filas sueltas no se pueden usar como
       prueba de que nadie las vio juntas. */
    fuentes.get(k)!.add(String(e?.fuente || "—"));
  }
  const claves = [...grafias.keys()];

  /* 2 · Quién es el principio de quién, con las dos condiciones del cabecero. */
  const padre = new Map<string, string>();
  for (const k of claves) {
    const largas = claves.filter(o => o !== k && o.startsWith(k + " "));
    /* De las que empiezan por `k`, solo las MÍNIMAS: si están «a b» y «a b c»,
       la segunda es continuación de la primera, no una alternativa a ella, y
       contarla como bifurcación impediría unificar una cadena legítima. */
    const minimas = largas.filter(h => !largas.some(o => o !== h && h.startsWith(o + " ")));
    if (minimas.length !== 1) continue;
    const j = minimas[0];
    const fk = fuentes.get(k)!, fj = fuentes.get(j)!;
    if ([...fk].some(f => fj.has(f))) continue; // un documento las escribió juntas
    padre.set(k, j);
  }
  const raiz = (k: string) => { let v = k; for (let i = 0; i < 8 && padre.has(v); i++) v = padre.get(v)!; return v; };

  /* 3 · La grafía de cada grupo: la llave que más dice —más palabras— y, dentro
     de ella, la ortografía que más veces escribieron. */
  const grupos = new Map<string, string[]>();
  for (const k of claves) {
    const r = raiz(k);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r)!.push(k);
  }
  const cuantas = (k: string) => [...grafias.get(k)!.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, string>();
  grupos.forEach(ks => {
    const jefe = [...ks].sort((a, b) =>
      b.split(" ").length - a.split(" ").length || cuantas(b) - cuantas(a) || a.localeCompare(b))[0];
    /* A igualdad de repeticiones, la más larga —que suele ser la entera— y
       luego alfabética, para que no dependa del orden de carga. */
    const bueno = [...grafias.get(jefe)!.entries()].sort((a, b) =>
      b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0][0];
    ks.forEach(k => out.set(k, bueno));
  });
  return out;
}
