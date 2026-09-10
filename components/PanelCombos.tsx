"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AltaLote from "@/components/AltaLote";
import Copiar from "@/components/Copiar";
import MiniEquipo from "@/components/MiniEquipo";
import AsignarACompra, { SacarDelCombo } from "@/components/AsignarACompra";
import { guardarCompra, borrarCompra } from "@/app/compras/acciones";
import { soles } from "@/lib/compras";
import { colorEstadoEq, txtEstadoEq } from "@/lib/estadosEquipo";
import type { EqLibre } from "@/components/AsignarACompra";

/* LOS COMBOS — cómo entró cada cosa.
 *
 * Vive plegado dentro de /equipamiento, junto a los kits, porque son las dos
 * caras de la misma pregunta: el kit dice qué sale junto, el combo dice qué
 * entró junto. Tenerlos en la misma pantalla es lo que hace visible que NO
 * son lo mismo — las cinco radios entraron en un combo y pueden salir en
 * cinco kits distintos.
 *
 * Tuvo un listado propio en /compras durante media hora. Sobraba: nadie
 * piensa «voy a compras», piensa «¿de dónde salió esta radio?», y eso se
 * pregunta desde los equipos.
 */

const nrm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type ComboVista = {
  id: string; codigo?: string | null; nombre: string;
  proveedor?: string | null; fecha?: string | null;
  total?: number | string | null; moneda?: string | null;
  comprobante_url?: string | null;
  /** La cara del combo: la foto de la primera unidad que tenga una. */
  cartel?: string | null;
  /* La ficha del producto y la nota. Se podían ESCRIBIR al dar de alta el
     combo (components/AltaLote) y se leían en la vista al vuelo y en la
     búsqueda global… pero no se podían CORREGIR en ningún sitio: campos de
     una sola escritura. «llegó sin el cargador, reclamado» se queda dicho
     para siempre, aunque el cargador llegue. */
  link?: string | null;
  nota?: string | null;
  nUnidades: number; nVivas: number; nProblema: number;
  /** De qué categorías es lo que trajo. «3 unidad(es)» no dice si son tres
   *  baterías o una cámara, un micro y un trípode — y esa es la pregunta que
   *  se hace al volver a una compra meses después. */
  categorias?: string[];
};

export default function PanelCombos({ combos, categorias = [], inventario = [] }: {
  combos: ComboVista[]; categorias?: string[];
  /** Todo el inventario, para poder meter en un combo equipos que ya existen.
   *  Vivía en la ficha de la compra; la ficha se fue y esto se queda, que es
   *  lo que de verdad se usaba de ella. */
  inventario?: EqLibre[];
}) {
  const router = useRouter();
  /* Arranca CERRADO, y de una forma que el navegador no pueda deshacer.
     Antes era un `<details>` con `open={abierto}` y `useState(false)`. El
     estado inicial era correcto y aun así el panel aparecía abierto al
     volver a la página: Chrome RESTAURA el abierto/cerrado de un `<details>`
     junto con el scroll, y esa restauración ocurre fuera de React —el estado
     decía `false` y el DOM decía abierto—. Un fallo que no falla: el código
     leído era correcto.
     Con un botón y el cuerpo pintado condicionalmente no hay nada que
     restaurar: si el estado dice cerrado, el contenido no existe. */
  const [abierto, setAbierto] = useState(false);
  const [edita, setEdita] = useState<string | null>(null);
  const [err, setErr] = useState("");
  /* Los dos filtros de la lista. Viven aquí y no dentro del bloque para que
     sobrevivan a abrir y cerrar un editor. */
  const [cat, setCat] = useState("");
  const [txt, setTxt] = useState("");
  /* ── EL ORDEN, ELEGIBLE ──
     Veintiocho combos salían en el orden que devolvía la consulta, que no es un
     orden: es un accidente. Y la pregunta cambia el criterio — «qué compramos
     último» es la fecha, «cuánto costó aquello» es el importe, y «C-015» es el
     código—. Por defecto la FECHA, de lo más reciente a lo más viejo: a un
     combo se vuelve casi siempre por algo que acaba de llegar. */
  const [orden, setOrden] = useState<"fecha" | "codigo" | "importe" | "unidades">("fecha");

  const vivos = combos;

  const totalPEN = combos.filter(c => (c.moneda || "PEN") === "PEN")
    .reduce((a, c) => a + (Number(c.total) || 0), 0);
  /* Combos sin una sola unidad colgando: son una boleta registrada y nada
     más. Es el aviso útil, porque la compra que no se desglosa es la que
     luego nadie sabe en qué se convirtió. */
  const vacios = combos.filter(c => !c.nUnidades).length;

  return (
    <div className="card">
      <button className="panel-plegar" aria-expanded={abierto}
        style={{ color: "#d99a3f" }} onClick={() => setAbierto(!abierto)}>
        <span className="panel-flecha">{abierto ? "▾" : "▸"}</span>
        🧾 Combos de compra — lo que entró junto{combos.length ? ` · ${combos.length}` : ""}
        {vacios > 0 && <span style={{ color: "var(--yellow)", fontWeight: 400 }}> · {vacios} sin unidades</span>}
      </button>

      {abierto && (() => {
        /* CON DIECIOCHO COMBOS, LA LISTA YA NO SE LEE, SE BUSCA.
           Dos filtros y no uno: por CATEGORÍA —«enséñame lo de sonido»— y por
           texto, que es como se vuelve a una compra concreta meses después
           («baofeng», «C-004», «aliexpress»).
           Por categoría se FILTRA y no se agrupa a propósito: un combo puede
           traer cámara Y soporte, así que agrupar obligaría a repetir la misma
           fila en dos sitios —y entonces «18 combos» dejaría de cuadrar con lo
           que se ve—. Filtrando, cada combo sale una vez y aparece en las dos
           categorías cuando toca. */
        const cats: string[] = [];
        vivos.forEach(c => (c.categorias || []).forEach(k => { if (!cats.includes(k)) cats.push(k); }));
        cats.sort();
        const ps = nrm(txt).split(/\s+/).filter(Boolean);
        const lista = vivos.filter(c => {
          if (cat && !(c.categorias || []).includes(cat)) return false;
          if (!ps.length) return true;
          const pajar = nrm(`${c.codigo || ""} ${c.nombre} ${c.proveedor || ""} ${(c.categorias || []).join(" ")}`);
          return ps.every(p => pajar.includes(p));
        });

        /* ⚠ Lo que no tiene el dato va AL FINAL, en los cuatro criterios. Un
           combo sin fecha ordenado como si fuera del año cero encabeza la lista
           por «lo más reciente», que es exactamente lo contrario de lo que se
           pidió — y en una lista de veintiocho nadie lo nota. */
        const alFinal = (v: any) => v === null || v === undefined || v === "";
        const cmp = (a: ComboVista, b: ComboVista) => {
          const por = (va: any, vb: any, desc: boolean) => {
            if (alFinal(va) !== alFinal(vb)) return alFinal(va) ? 1 : -1;
            if (alFinal(va)) return 0;
            const d = typeof va === "string" ? String(va).localeCompare(String(vb), "es") : va - vb;
            return desc ? -d : d;
          };
          if (orden === "fecha") return por(a.fecha, b.fecha, true)
            /* Empate de fecha —media compra del mismo día no la lleva— se
               deshace por código, que sí es único y estable. */
            || String(b.codigo || "").localeCompare(String(a.codigo || ""), "es");
          if (orden === "importe") return por(Number(a.total) || null, Number(b.total) || null, true);
          if (orden === "unidades") return por(a.nUnidades || null, b.nUnidades || null, true);
          return por(a.codigo, b.codigo, false);
        };
        const ordenada = [...lista].sort(cmp);
        return (
        <div style={{ marginTop: 8 }}>
          <AltaLote categorias={categorias} />

          {!combos.length && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
              Todavía no hay combos. Un combo es una compra —una boleta, un proveedor, una fecha— y
              de él cuelgan las unidades que trajo. No es un kit: las cinco radios de un combo pueden
              salir en cinco kits distintos.
            </div>
          )}

          {err && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {err}</div>}

          {/* Buscar y filtrar. Con dieciocho combos la lista ya no se lee, se
              busca — y lo que se recuerda de una compra vieja es la marca, el
              proveedor o el código, no en qué puesto de la lista estaba. */}
          {combos.length > 3 && (
            <div className="cbo-filtros">
              {/* ── LO QUE SE ESCRIBE Y LO QUE SE ELIGE, EN DOS ALTURAS ──
                  ⚠ El buscador NO puede ir dentro de la tira que se desplaza:
                  una tira mete lo que sobra fuera de la vista, y lo primero
                  que hace uno aquí es escribir. Arriba, con el orden y el
                  «limpiar», que son los tres controles que siempre se ven. */}
              <div className="cbo-filtros-l1">
                <input className="ent-lote-inp" placeholder="Buscar por código, nombre, proveedor…"
                  value={txt} onChange={e => setTxt(e.target.value)} style={{ flex: 1, minWidth: 190 }} />
                {/* El orden, al lado del buscador y no en otra fila: filtrar y
                    ordenar son la misma operación —«enséñame estos, así»— y
                    separarlos obliga a buscar el segundo control. */}
                <select className="ent-select cbo-orden" value={orden}
                  title="En qué orden salen los combos"
                  onChange={e => setOrden(e.target.value as any)}>
                  <option value="fecha">↓ más recientes</option>
                  <option value="codigo">↑ por código</option>
                  <option value="importe">↓ los más caros</option>
                  <option value="unidades">↓ los que más trajeron</option>
                </select>
                {(cat || txt) && (
                  <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
                    onClick={() => { setCat(""); setTxt(""); }}>
                    {lista.length} de {combos.length} · limpiar
                  </button>
                )}
              </div>
              {/* Las categorías, en la misma tira con rótulo que los filtros
                  del inventario. Eran chips sueltos entre el buscador y el
                  orden: con diez, empujaban el desplegable a un tercer renglón
                  y nada decía que aquello fuera «categoría». Las clases son las
                  del sistema —`filt-grupo` / `filt-tit` / `filt-tira`— para que
                  esto no se convierta en un segundo diseño de filtros. */}
              {cats.length > 0 && (
                <div className="filt-grupo">
                  <span className="filt-tit">Categoría</span>
                  <div className="filt-tira">
                    {cats.map(k => (
                      <button key={k} type="button" className={`kit-chip${cat === k ? " on" : ""}`}
                        onClick={() => setCat(cat === k ? "" : k)}>{k}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!lista.length && combos.length > 0 && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 10 }}>
              Ningún combo coincide{cat ? ` en «${cat}»` : ""}{txt ? ` con «${txt}»` : ""}.
            </div>
          )}

          {ordenada.map(c => {
            const fecha = c.fecha
              ? new Date(String(c.fecha) + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
              : null;
            /* Un combo abierto no es «la fila de abajo un poco más alta»: es
               la única de las veintiocho que está en modo edición, y eso tiene
               que verse desde el otro extremo de la pantalla. */
            const abierta = edita === c.id;
            const alterna = () => { setEdita(abierta ? null : c.id); setErr(""); };
            return (
              <div key={c.id} className={`cbo-fila${abierta ? " editando" : ""}`}>
                <div className="cbo-l1">
                  {/* La cara del combo: la foto de la primera unidad que tenga
                      una. Un combo no es una cosa —es una compra— pero se
                      reconoce por el aparato que trajo mucho antes que por su
                      código. */}
                  <span className="cbo-img">
                    {c.cartel
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.cartel} alt="" referrerPolicy="no-referrer" />
                      : <span>🧾</span>}
                  </span>
                  {/* El código y el total, COPIABLES. Los traía la vista al
                      vuelo y son justo los dos datos que se van a pegar en una
                      rendición — el sitio donde perder un dígito no falla:
                      cuadra con otra cosa y el error sale semanas después. */}
                  {c.codigo && (
                    <Copiar valor={c.codigo} etiqueta="código">
                      <span className="badge cmp-cod">{c.codigo}</span>
                    </Copiar>
                  )}
                  {/* ── EL NOMBRE ABRE EL EDITOR, NO UN POP-UP ──
                      Hasta aquí el nombre abría `VistaCompra` —la vista al
                      vuelo— y la ✎ abría el editor: dos gestos, dos capas y el
                      MISMO combo. Con el editor partido en tres bloques con
                      nombre, la vista ya no enseñaba nada que el editor no
                      enseñe… salvo cuatro cosas, y esas se han traído aquí
                      dentro en vez de perderse: el precio de cada unidad, la
                      suma de las piezas contra el total de la boleta, quién
                      tiene cada una, y los dos enlaces —boleta y ficha del
                      producto— abribles de verdad.
                      Lo que se gana no es una capa menos: es que corregir deje
                      de ser un segundo viaje. Antes se abría el combo para
                      mirarlo, se veía la fecha mal, se cerraba el pop-up y
                      había que buscar la ✎ para volver a abrir lo mismo.
                      ⚠ `components/VistaCompra` NO se borra: la usan la ficha
                      del equipo, el alta en lote y el buscador, y ahí sí hace
                      falta —esas pantallas no llevan editor detrás—. Lo que
                      sobraba era aquí, donde el editor está a un clic. */}
                  <button className="cbo-nom" onClick={alterna}
                    title={abierta ? "Cerrar el combo" : "Abrir el combo — verlo y corregirlo"}>
                    {c.nombre}
                  </button>
                  <span style={{ flex: 1 }} />
                  {c.total != null && (
                    <Copiar valor={String(c.total)} etiqueta="total">
                      <b style={{ color: "var(--teal)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {soles(Number(c.total), c.moneda || "PEN")}
                      </b>
                    </Copiar>
                  )}
                  {/* El botón dice en qué estado ESTÁ, no solo qué hace. Con un
                      ✎ fijo, el combo abierto y el cerrado tenían el mismo
                      botón y no había dónde pulsar para cerrar sin buscarlo. */}
                  <button className={`dato-btn${abierta ? " cbo-edita-on" : ""}`}
                    title={abierta ? "Cerrar el combo" : "Abrir el combo — verlo y corregirlo"}
                    onClick={alterna}>{abierta ? "✕" : "✎"}</button>
                </div>
                <div className="cbo-l2">
                  {c.proveedor && <span>{c.proveedor}</span>}
                  {fecha && <span>{fecha}</span>}
                  {/* Cuántas unidades y cuántas siguen vivas. Un combo de 13
                      piezas con 11 en inventario dice que dos se cayeron, y
                      eso es lo que se viene a mirar meses después. */}
                  <span style={{ color: c.nUnidades ? "var(--muted)" : "var(--yellow)" }}>
                    {c.nUnidades
                      ? `${c.nUnidades} unidad(es)${c.nVivas !== c.nUnidades ? ` · ${c.nVivas} en inventario` : ""}`
                      : "sin unidades cargadas"}
                  </span>
                  {c.nProblema > 0 && <span style={{ color: "var(--yellow)" }}>⚠ {c.nProblema} con problema</span>}
                  {/* Qué trajo. Va después del número porque lo matiza: «3
                      unidades» y «cámara · soporte» juntos ya cuentan la
                      compra sin abrir nada. */}
                  {!!c.categorias?.length && (
                    <span className="cbo-cats">{c.categorias.join(" · ")}</span>
                  )}
                  <span style={{ color: c.comprobante_url ? "var(--green)" : "var(--dim)" }}>
                    {c.comprobante_url ? "🧾 con comprobante" : "sin comprobante"}
                  </span>
                </div>

                {abierta && (
                  <EditorCombo c={c} inventario={inventario}
                    onErr={setErr} onListo={() => { setEdita(null); router.refresh(); }} />
                )}
              </div>
            );
          })}

          {combos.length > 0 && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 9, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
              {soles(totalPEN)} invertido en soles · lo comprado en dólares va aparte, sin convertir.
            </div>
          )}
        </div>
      );
      })()}
    </div>
  );
}

/* Editar un combo y manejar sus unidades. Todo esto vivía en la ficha de la
   compra; la ficha se fue —una compra no tiene movimiento: se registra una
   vez y no se toca— y esto se queda, que es lo único que de verdad se usaba
   de ella. */
function EditorCombo({ c, inventario, onErr, onListo }: {
  c: ComboVista; inventario: EqLibre[];
  onErr: (s: string) => void; onListo: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [pide, setPide] = useState(false);
  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", fontFamily: "inherit", outline: "none",
  } as const;

  const suyas = inventario.filter(e => e.compra_id === c.id);

  return (
    <div className="cbo-editor" onClick={e => e.stopPropagation()}>
      <div className="cbo-bloque">
        <div className="cbo-bloque-h">La compra</div>
      <form className="cmp-form" onSubmit={async ev => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget as HTMLFormElement);
        setOcupado(true); onErr("");
        const r: any = await guardarCompra(c.id, Object.fromEntries(f.entries()));
        setOcupado(false);
        if (r?.error) { onErr(r.error); return; }
        onListo();
      }}>
        <div className="cmp-fila">
          <input name="nombre" defaultValue={c.nombre} style={{ ...inp, flex: 2, minWidth: 200 }} placeholder="Qué se compró" />
          <input name="proveedor" defaultValue={c.proveedor || ""} style={{ ...inp, flex: 1, minWidth: 130 }} placeholder="Proveedor" />
          <input name="fecha" type="date" defaultValue={c.fecha || ""} style={{ ...inp, width: 145 }} />
        </div>
        <div className="cmp-fila">
          <input name="total" defaultValue={c.total == null ? "" : String(c.total)} inputMode="decimal"
            style={{ ...inp, width: 120 }} placeholder="Total" />
          <select name="moneda" defaultValue={c.moneda || "PEN"} style={{ ...inp, width: 88 }}>
            <option value="PEN">S/ PEN</option><option value="USD">$ USD</option>
          </select>
          <input name="nota" defaultValue={c.nota || ""}
            style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Nota (opcional): «llegó sin el cargador, reclamado»" />
        </div>

        {/* LOS DOS LINKS, JUNTOS Y CON RÓTULO.
            Son dos papeles distintos —la boleta prueba que se pagó; la ficha
            del producto dice qué es y cuánto costaba— y por eso viven en dos
            columnas distintas desde el principio. Pero sueltos parecían el
            mismo campo repetido, y con razón: un `placeholder` DESAPARECE en
            cuanto el campo tiene valor. El de arriba estaba vacío y decía qué
            era; el de abajo, lleno, no decía nada. Dos cajas con una URL y
            ninguna pista de cuál es cuál.
            El rótulo no se va al escribir, y ponerlos lado a lado convierte
            la diferencia en lo primero que se ve. */}
        {/* ── Y ABRIBLES ──
            Con la vista al vuelo fuera, este era el único sitio donde vivía la
            boleta… y aquí era texto dentro de una caja: para verla había que
            seleccionar la URL, copiarla y pegarla. Un enlace al lado la abre.
            ⚠ Enlaza `c.comprobante_url` —lo GUARDADO— y no lo que hay escrito
            en el campo: el input no está controlado, así que mientras se
            teclea una URL nueva el enlace seguiría apuntando a la vieja y
            abriría el papel equivocado sin decirlo. Por eso el rótulo dice «la
            guardada»: se abre lo que está en la base, y para abrir la nueva
            hay que guardar primero.
            ⚠ Y por eso estos dos campos dejan de ser un `<label>` que envuelve
            al input y pasan a ser un `<div>` con `htmlFor`: un enlace DENTRO de
            un `<label>` es contenido interactivo dentro de contenido
            interactivo —HTML inválido— y el clic sobre el enlace dispara
            además la activación del rótulo. Con el `id` explícito el rótulo
            sigue enfocando su campo al pulsarlo y el enlace es solo un enlace. */}
        <div className="cmp-fila">
          <div className="cmp-campo" style={{ flex: 1, minWidth: 210 }}>
            <span className="cmp-lbl">
              <label htmlFor={`cbo-comp-${c.id}`}>🧾 Comprobante — la boleta o factura</label>
              {c.comprobante_url && (
                <> · <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer"
                  className="fv-link">abrir la guardada ↗</a></>
              )}
            </span>
            <input id={`cbo-comp-${c.id}`} name="comprobante_url" defaultValue={c.comprobante_url || ""}
              style={{ ...inp, width: "100%" }} placeholder="https://…" />
          </div>
          <div className="cmp-campo" style={{ flex: 1, minWidth: 210 }}>
            <span className="cmp-lbl">
              <label htmlFor={`cbo-link-${c.id}`}>🔗 Producto — su ficha en la web del vendedor</label>
              {c.link && (
                <> · <a href={c.link} target="_blank" rel="noopener noreferrer"
                  className="fv-link">abrir la guardada ↗</a></>
              )}
            </span>
            <input id={`cbo-link-${c.id}`} name="link" defaultValue={c.link || ""}
              style={{ ...inp, width: "100%" }} placeholder="https://…" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} disabled={ocupado}>
            {ocupado ? "…" : "Guardar"}
          </button>
          <span style={{ flex: 1 }} />
          {/* Borrar el combo NO borra sus equipos: quedan en el inventario sin
              procedencia. Se dice cuántos, o nadie los buscaría. */}
          {pide ? (
            <span style={{ fontSize: 11.5 }}>
              ¿quitar el combo? sus {c.nUnidades} equipo(s) se quedan, sin procedencia{" "}
              <button type="button" style={{ color: "var(--red)", fontWeight: 700 }} onClick={async () => {
                const r: any = await borrarCompra(c.id);
                if (r?.error) { onErr(r.error); return; }
                onListo();
              }}>sí</button>
              {" / "}<button type="button" style={{ color: "var(--dim)" }} onClick={() => setPide(false)}>no</button>
            </span>
          ) : (
            <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
              onClick={() => setPide(true)}>Quitar combo</button>
          )}
        </div>
      </form>
      </div>

      {/* ── TRES BLOQUES, TRES MARCOS ──
          ⚠ Abrir un combo apilaba el formulario, la lista de unidades y el
          buscador de sumar uno detrás de otro y sin nada que los separara: tres
          cosas distintas que se leían como un formulario larguísimo, y la
          «Nota» del combo quedaba pegada a la primera unidad como si fuera
          suya. Cada uno en su caja con su nombre — es lo mismo que se acaba de
          hacer con los sitios y por lo mismo. */}
      {suyas.length > 0 && (() => {
        /* ── LA COMPROBACIÓN QUE TRAÍA LA VISTA AL VUELO ──
           Los precios de las piezas NO son adorno: son la única forma de ver
           que alguien puso un valor mal. Suelto, cualquier número parece
           razonable —¿180 soles por un micro? podría ser—; puestas la suma de
           las piezas y el total de la boleta una al lado de la otra, un cero
           de más salta a la vista sin buscarlo.
           `nVivas` sale de la fila y no de aquí: `suyas` son las unidades que
           el inventario dice que son de este combo, y basta con que la lista
           llegue recortada para que este número mintiera. Los conteos los da
           el servidor, que los cuenta enteros. */
        const mon = c.moneda || "PEN";
        const conPrecio = suyas.filter(u => Number(u.valor_compra) > 0);
        const sumaPiezas = conPrecio.reduce((a, u) => a + Number(u.valor_compra), 0);
        return (
        <div className="cbo-bloque">
          <div className="cbo-bloque-h">Unidades · {suyas.length}</div>
          {suyas.map(u => (
            <div key={u.id} className="info-row cbo-mini" style={{ padding: "3px 0" }}>
              {/* ── LA FOTO, COMO EN TODAS LAS DEMÁS LISTAS ──
                  Era la única lista de equipos de la app sin miniatura: los
                  kits la tienen, los ensamblados la tienen y el árbol de
                  sitios la tiene. Y aquí hace la misma falta que allí — un
                  combo de trece piezas son trece renglones de texto que se
                  parecen entre sí, y lo que se viene a comprobar es que lo
                  colgado del combo es de verdad lo que trajo esa caja. */}
              <MiniEquipo url={u.cartel} />
              {u.folio && <span className="kit-pz-folio">{u.folio}</span>}
              <a href={`/entidad/equipamiento/${u.id}`} style={{ flex: 1, fontSize: 12.5, minWidth: 0 }}>{u.nombre}</a>
              {Number(u.valor_compra) > 0 && (
                <span style={{ color: "var(--dim)", fontSize: 11, whiteSpace: "nowrap" }}>
                  {soles(Number(u.valor_compra), mon)}
                </span>
              )}
              {/* El estado CON su color y, si está entregado, con el nombre de
                  quien lo tiene. Antes salía en gris y con los guiones bajos
                  puestos —«en_uso»—: se leía igual que la categoría, y «¿quién
                  lo tiene?» es justo la pregunta que trae a mirar un combo. */}
              <span style={{ color: colorEstadoEq(u.estado), fontSize: 11, whiteSpace: "nowrap" }}>
                {u.quien ? `lo tiene ${u.quien}` : txtEstadoEq(u.estado)}
              </span>
              <SacarDelCombo equipoId={u.id} />
            </div>
          ))}
          {sumaPiezas > 0 && c.total != null && (
            <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
              {conPrecio.length} pieza(s) con precio propio suman {soles(sumaPiezas, mon)}
              {" "}de los {soles(Number(c.total), mon)} de la boleta.
            </div>
          )}
        </div>
        );
      })()}

      <div className="cbo-bloque">
        <div className="cbo-bloque-h">Sumar equipos que ya existen</div>
        <AsignarACompra compraId={c.id} equipos={inventario} />
      </div>
    </div>
  );
}
