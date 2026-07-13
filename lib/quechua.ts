/* NORMALIZADOR FONÉTICO ANDINO (quechua + castellano)
   La ortografía varía; la fonética es una sola. Reduce cualquier
   variante a un esqueleto común, aplicado a ambos lados: lo guardado
   y lo buscado.
     Quechua:    Mujunakuy=Mujunacuy=Muhunakuy · Huaman=Waman=Guaman
     Castellano: vaca=baca · cocina=cosina · gente=jente · guerra=gerra
                 cabeza=cabesa · lluvia=yuvia                          */

// comodines internos (control chars: jamás aparecen en texto real)
const CH = String.fromCharCode(1);
const SH = String.fromCharCode(2);
const LL = String.fromCharCode(3);

export function nrmQ(s: string): string {
  let t = (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // proteger dígrafos con significado propio
  t = t.split("ch").join(CH).split("sh").join(SH).split("ll").join(LL);
  // castellano: c suave (ce/ci) suena s — ANTES de c→k
  t = t.replace(/c(?=[ei])/g, "s");
  // oclusivas: qu, q, c, kh → k
  t = t.replace(/qu/g, "k").replace(/q/g, "k").replace(/c/g, "k").replace(/kh/g, "k");
  // semivocal andina: hua/hui, gua → w (Huaman=Waman=Guaman, Huilca=Wilca)
  t = t.replace(/hu(?=[ai])/g, "w").replace(/g[uü](?=a)/g, "w");
  // castellano: gue/gui → ge/gi (u muda: guerra=gerra)
  t = t.replace(/gu(?=[ei])/g, "g");
  // b = v = w
  t = t.replace(/[bv]/g, "w");
  // sonido j: j, y g ante e/i, se esfuman junto con la h muda
  t = t.replace(/g(?=[ei])/g, "").replace(/[jh]/g, "");
  // sibilantes: z, x → s · vocales regionales: e→i, o→u
  t = t.replace(/[zx]/g, "s").replace(/e/g, "i").replace(/o/g, "u");
  // restaurar dígrafos: ll↔y, ch queda, sh→s; luego y→i (rey=rei, ya=ia)
  t = t.split(LL).join("y").split(CH).join("ch").split(SH).join("s");
  t = t.replace(/y/g, "i");
  // letras repetidas → una
  return t.replace(/(.)\1+/g, "$1");
}

/* ¿Todas las palabras de la consulta viven en el texto?
   Primero literal (sin tildes); el esqueleto fonético solo entra si
   conserva sustancia (4+ letras) — "John" se reduciría a "un" y
   coincidiría con medio mundo. */
export function coincideQ(haystack: string, palabras: string[]): boolean {
  const plano = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const h = plano(haystack);
  const hq = nrmQ(haystack);
  return palabras.every(w => {
    if (h.includes(plano(w))) return true;
    const wq = nrmQ(w);
    return wq.length >= 4 && hq.includes(wq);
  });
}
