// Compila el módulo real con esbuild y prueba la función publicada, en vez de
// recortar el archivo con expresiones regulares — recortar comprueba mi
// recorte, no el código que se va a ejecutar.
import { build } from "esbuild";
const r = await build({
  entryPoints: ["./lib/obligaciones.ts"], bundle: true, write: false,
  format: "esm", platform: "neutral",
});
const mod = await import("data:text/javascript;base64," +
  Buffer.from(r.outputFiles[0].text).toString("base64"));
const casos = [
 ["activa con RUC",      { ruc: "20612545058", estado: "activa" },               null],
 ["sin RUC",             { ruc: "",            estado: "activa" },               "imposible"],
 ["sin RUC y cerrada",   { ruc: null,          estado: "cerrada" },              "imposible"],
 ["en cierre con RUC",   { ruc: "20601109167", estado: "en_proceso_de_cierre" }, "probable"],
 ["inactiva con RUC",    { ruc: "20614531259", estado: "inactiva" },             "probable"],
 ["cerrada con RUC",     { ruc: "20614528231", estado: "cerrada" },              "probable"],
 ["en constitución",     { ruc: "20614519879", estado: "en_constitucion" },      "probable"],
 ["sin estado, con RUC", { ruc: "20614519879", estado: null },                   null],
];
let mal = 0;
for (const [nom, e, esp] of casos) {
  const m = mod.motivoNoDeclara(e);
  const got = m ? m.clase : null;
  if (got !== esp) { mal++; console.log("✗", nom, "→", got, "esperado", esp); }
  else console.log("✓", nom, "→", got === null ? "declara" : `${got} · ${m.txt}`);
}
console.log(mal ? "HAY FALLOS" : "la regla se comporta como dice");
