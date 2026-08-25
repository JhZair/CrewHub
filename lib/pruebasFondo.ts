/* ============================================================
 *  lib/pruebasFondo.ts — EL REGISTRO ESTÁ, ¿Y EL PAPEL?
 *
 *  Un fondo se rinde con documentos, no con filas. Y hay dos formas
 *  distintas de no tenerlos, que hasta ahora se veían igual de mal:
 *
 *  · ROJO — el registro NO EXISTE. Falta el estado de cuenta de julio: nadie
 *    lo ha cargado, y hasta que alguien no lo cargue no hay nada que mirar.
 *    Eso lo cuenta lib/estadosCuenta.
 *  · ÁMBAR — el registro existe pero SIN SU PRUEBA. El recibo está apuntado
 *    con su monto y su persona, pero el PDF no está; el mes del banco tiene
 *    su saldo, pero no el extracto. La información está, el papel no.
 *
 *  Son dos trabajos distintos: el rojo es «pídeselo al banco / apúntalo», el
 *  ámbar es «sube el archivo que ya tienes». Y el día de la rendición el
 *  ámbar es igual de bloqueante —DAFO recibe papeles, no filas— pero se puede
 *  resolver sin depender de nadie de fuera.
 *
 *  ── LOS CUATRO SITIOS DONDE VIVE UNA PRUEBA ──
 *  Cada tabla guarda su documento en un campo con nombre propio, y ese es
 *  justo el motivo de que esto exista: cuatro pantallas preguntaban «¿tiene
 *  papel?» de cuatro maneras, y ninguna sumaba con las otras.
 *
 *  · estado_cuenta — `url` (link) o `imagenes[]` (escaneos). Cualquiera de
 *    las dos vale: un extracto fotografiado prueba lo mismo que un PDF.
 *  · rhe            — `url`
 *  · comprobante    — `url`   (facturas y boletas). Se le exige a todas,
 *    incluidas las boletas manuscritas sin serie: esas son justo las que hay
 *    que fotografiar, porque no se pueden recuperar de SUNAT.
 *  · gasto_dj       — `dj_url`, PERO ver abajo: aquí una fila NO es un
 *    documento.
 *
 *  ── LA DJ NO SE CUENTA POR FILAS ──
 *  Una declaración jurada admite hasta NUEVE gastos (db/declaraciones-juradas
 *  .sql), así que `dj_numero` agrupa y `dj_url` es el MISMO PDF repetido en
 *  cada fila del grupo. Contar filas multiplicaba por nueve: una sola DJ sin
 *  escanear salía como nueve documentos pendientes, y con tres DJ la burbuja
 *  decía 27 cuando el trabajo era subir tres archivos. Un número inflado no es
 *  «más alarmante», es un número en el que se deja de creer.
 *  Se cuentan GRUPOS distintos con documento emitido y sin archivo.
 *
 *  Y un gasto SIN `dj_numero` no entra: todavía no hay DJ que escanear. Eso es
 *  trabajo pendiente de otra clase —hay que emitirla— y la pantalla del saldo
 *  ya lo dice con esas palabras («sin DJ asignada»). Meterlo aquí sería pedir
 *  que suban un papel que aún no existe. */

/** Un mes del banco tiene prueba con el PDF o con los escaneos. */
export const estadoConPrueba = (e: { url?: string | null; imagenes?: string[] | null }) =>
  (e?.imagenes?.length || 0) > 0 || !!e?.url;

const conUrl = (x: { url?: string | null }) => !!x?.url;

export type SinPrueba = {
  estados: number; rhe: number; facturas: number;
  /** DECLARACIONES juradas sin escanear, no gastos: ver la cabecera. */
  dj: number;
  /** La suma. Es lo que va en la burbuja: el trabajo es subir archivos, y da
   *  igual de qué tabla cuelgue cada uno. */
  total: number;
};

export function sinPruebas(d: {
  estados?: { url?: string | null; imagenes?: string[] | null }[] | null;
  rhe?: { url?: string | null }[] | null;
  facturas?: { url?: string | null }[] | null;
  dj?: { dj_numero?: string | null; dj_url?: string | null }[] | null;
}): SinPrueba {
  const estados = (d?.estados || []).filter(e => !estadoConPrueba(e)).length;
  const rhe = (d?.rhe || []).filter(r => !conUrl(r)).length;
  const facturas = (d?.facturas || []).filter(c => !conUrl(c)).length;
  /* Grupos, no filas — y solo los que ya tienen DJ emitida. */
  const djs = new Set<string>();
  for (const g of d?.dj || []) if (g?.dj_numero && !g?.dj_url) djs.add(String(g.dj_numero));
  const dj = djs.size;
  return { estados, rhe, facturas, dj, total: estados + rhe + facturas + dj };
}

/** El título de la burbuja: qué son esos N. Sin el desglose, un «55» no dice
 *  por dónde empezar — quince extractos del banco y cuarenta recibos no se
 *  resuelven en el mismo sitio ni con la misma gente. */
export function textoSinPruebas(s: SinPrueba): string {
  const partes = [
    s.estados ? `${s.estados} estado(s) de cuenta` : "",
    s.rhe ? `${s.rhe} recibo(s)` : "",
    s.facturas ? `${s.facturas} factura(s)` : "",
    s.dj ? `${s.dj} declaración(es) jurada(s) sin escanear` : "",
  ].filter(Boolean);
  return `${s.total} documento(s) sin adjuntar: ${partes.join(", ")}`;
}
