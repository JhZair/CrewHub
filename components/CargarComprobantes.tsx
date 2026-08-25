"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { textoDePdf } from "@/lib/leerPdf";
import { subirAdjunto } from "@/lib/subirImagen";
import { adjuntarComprobantesRhe, fijarRucPersona } from "@/app/actions";
import {
  leerRhe, cruzar, repetidos, claveNumero, soloDigitos, parecido,
  type Cruce, type FilaRhe,
} from "@/lib/rheLote";

/* ══════════════════════════════════════════════════════════════════════════
   CARGAR LOS COMPROBANTES DE UNA TANDA

   Los 58 PDF están en una carpeta de Drive. Se bajan, se sueltan aquí de
   golpe, y la pantalla propone a qué recibo va cada uno diciendo POR QUÉ.
   Nada se guarda hasta que alguien mira la tabla y confirma.

   ── POR QUÉ NO SE GUARDA SOLO ──
   La tentación de un importador es hacerlo todo y contar «58 listos». Aquí no,
   por una razón concreta: la serie E001 es de cada emisor, así que dos
   personas distintas tienen su propio «E001-22». Un cruce equivocado cuelga el
   recibo de Wilfredo en la fila de Katy y NADIE lo va a notar —hay un PDF, la
   casilla está llena, la pantalla dice ✓— hasta que DAFO lo abra. La casilla
   vacía se ve; la casilla llena con el papel de otro, no.

   Por eso cada línea sale con su motivo y su grado de certeza, lo dudoso viene
   sin elegir, y guardar es un acto aparte.

   ── LOS ARCHIVOS SE LEEN EN EL NAVEGADOR ──
   El texto se saca aquí (lib/leerPdf) y solo se sube el archivo de las líneas
   que se confirman. Lo que se descarte no llega a salir del ordenador.
   ══════════════════════════════════════════════════════════════════════════ */

type Estado = "" | "leyendo" | "subiendo" | "hecho";

export default function CargarComprobantes({
  postulacionId, filas, rucs, nombreFondo, esAdmin,
}: {
  postulacionId: string;
  filas: FilaRhe[];
  /** Solo administración puede completar el RUC de una ficha. El apoyo cuelga
   *  papeles; el catálogo de personas es otra cosa. */
  esAdmin?: boolean;
  /** RUC (o DNI) → id de persona, ya aplanado por el servidor. Un objeto y no
   *  un Map: entre servidor y cliente solo cruzan datos planos. */
  rucs: Record<string, string>;
  nombreFondo?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("");
  const [err, setErr] = useState("");
  const [avance, setAvance] = useState({ n: 0, de: 0 });
  const [resumen, setResumen] = useState<{ hechos: number; fallos: string[] } | null>(null);
  /* Los archivos y sus cruces van EN PARALELO, por índice. Un mapa por nombre
     de archivo se rompería con dos «recibo.pdf» bajados de carpetas
     distintas, que es exactamente lo que pasa cuando se descarga por tandas. */
  const [archivos, setArchivos] = useState<File[]>([]);
  const [cruces, setCruces] = useState<Cruce[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const porId = useMemo(() => new Map(filas.map(f => [f.id, f])), [filas]);
  /* ── EL MAPA DE RUC SE APRENDE SOBRE LA MARCHA ──
     Empieza con lo que había en las fichas, pero cuando alguien carga aquí el
     RUC que faltaba, se añade y se vuelve a cruzar TODO. Ese es el momento en
     que la pantalla paga: un solo dato bien puesto coloca de golpe los cinco
     recibos de esa persona que estaban en «no sé de quién es».
     Recargar la página para enterarse habría sido perder la tanda. */
  const [aprendidos, setAprendidos] = useState<Record<string, string>>({});
  const mapaRuc = useMemo(() => {
    const m = new Map<string, string>();
    for (const [ruc, id] of Object.entries(rucs || {})) m.set(soloDigitos(ruc), id);
    for (const [ruc, id] of Object.entries(aprendidos)) m.set(soloDigitos(ruc), id);
    return m;
  }, [rucs, aprendidos]);
  const dobles = useMemo(() => repetidos(cruces), [cruces]);

  /* Las personas que aparecen en los recibos de este fondo. El desplegable de
     los RUC huérfanos se llena con estas y no con el directorio entero: el
     emisor de un recibo de este fondo está aquí por definición, y ciento
     cuarenta nombres para elegir entre dieciocho es esconder la aguja. */
  const personasDelFondo = useMemo(() => {
    const m = new Map<string, { alias: string; nombre: string }>();
    for (const f of filas) {
      if (!m.has(f.persona_id)) {
        m.set(f.persona_id, { alias: f.persona || "—", nombre: f.nombre || f.persona || "" });
      }
    }
    return [...m.entries()].map(([id, x]) => ({ id, ...x }));
  }, [filas]);

  const rotulo = (f?: FilaRhe) => f
    ? `${f.persona || "—"} · ${f.numero || "sin número"} · S/ ${Number(f.monto).toFixed(2)}`
    : "";

  const tomar = async (fs: FileList | null) => {
    const lista = [...(fs || [])];
    if (!lista.length) return;
    setErr(""); setResumen(null); setEstado("leyendo");
    setAvance({ n: 0, de: lista.length });
    const docs = [];
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      let texto = "";
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        try { texto = await textoDePdf(await f.arrayBuffer()); } catch { texto = ""; }
      }
      docs.push(leerRhe(f.name, texto));
      setAvance({ n: i + 1, de: lista.length });
    }
    /* Se AÑADE a lo que ya había: la carpeta se baja por tandas y obligar a
       soltarlo todo de una vez es obligar a empezar de cero si falta uno. */
    setArchivos(p => [...p, ...lista]);
    setCruces(p => [...p, ...cruzar(docs, filas, mapaRuc)]);
    setEstado("");
    if (entrada.current) entrada.current.value = "";
  };

  const elegir = (i: number, filaId: string) => {
    setCruces(p => p.map((c, k) => k === i ? {
      ...c, filaId: filaId || null,
      certeza: filaId ? "seguro" : "ninguno",
      motivo: filaId ? "Elegido a mano" : "Sin asignar",
    } : c));
  };

  const quitar = (i: number) => {
    setArchivos(p => p.filter((_, k) => k !== i));
    setCruces(p => p.filter((_, k) => k !== i));
  };

  /* Cuántos archivos se colocarían solos con un dato de ficha. Se cuenta por
     RUC y no por archivo: son «cinco personas», no «doce papeles». */
  const rucsHuerfanos = useMemo(() => {
    const m = new Map<string, { emisor?: string; n: number }>();
    for (const c of cruces) {
      if (!c.rucSinFicha || !c.doc.ruc) continue;
      const p = m.get(c.doc.ruc) || { emisor: c.doc.emisor, n: 0 };
      m.set(c.doc.ruc, { emisor: p.emisor || c.doc.emisor, n: p.n + 1 });
    }
    return m;
  }, [cruces]);

  /* Cargar el RUC que faltaba y volver a cruzar la tanda entera con él. */
  const [guardandoRuc, setGuardandoRuc] = useState("");
  const aprenderRuc = async (ruc: string, personaId: string) => {
    setErr(""); setGuardandoRuc(ruc);
    const r: any = await fijarRucPersona(personaId, ruc);
    setGuardandoRuc("");
    if (r?.error) { setErr(r.error); return; }
    setAprendidos(p => ({ ...p, [ruc]: personaId }));
    /* Se recruzan los que NADIE ha tocado a mano. Rehacer también los elegidos
       borraría decisiones de una persona con una suposición de la máquina, que
       es exactamente al revés de como tiene que ser. */
    const nuevoMapa = new Map(mapaRuc); nuevoMapa.set(soloDigitos(ruc), personaId);
    setCruces(p => {
      const rehechos = cruzar(p.map(c => c.doc), filas, nuevoMapa);
      return p.map((c, i) => (c.motivo === "Elegido a mano" ? c : rehechos[i]));
    });
    router.refresh();
  };

  const listas = cruces.filter(c => c.filaId && !dobles.has(c.filaId!));
  const pisan = cruces.filter(c => c.filaId && porId.get(c.filaId!)?.url).length;
  /* Cuántos apuntan a un recibo que YA tiene su papel. Soltar la carpeta
     entera por segunda vez es lo normal —se baja de Drive de una vez— y sin
     este número la pantalla parece decir que no se cargó nada, cuando lo que
     pasa es lo contrario: ya estaban. */
  const yaEstaban = cruces.filter(c => {
    const id = c.filaId || c.sugerido;
    return id && porId.get(id)?.url;
  }).length;

  const guardar = async () => {
    setErr(""); setEstado("subiendo");
    const pares: { id: string; url: string }[] = [];
    const fallos: string[] = [];
    const pendientes = cruces
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.filaId && !dobles.has(c.filaId!));
    setAvance({ n: 0, de: pendientes.length });
    /* Subir PRIMERO todos los archivos y guardar DESPUÉS de una sola vez: si
       algo se cae a mitad de la subida, en la base no queda ninguna fila
       apuntando a un archivo que no llegó. */
    for (let k = 0; k < pendientes.length; k++) {
      const { c, i } = pendientes[k];
      const r = await subirAdjunto(archivos[i]);
      if (r.error || !r.url) fallos.push(`${c.doc.archivo}: ${r.error || "no se pudo subir"}`);
      else pares.push({ id: c.filaId!, url: r.url });
      setAvance({ n: k + 1, de: pendientes.length });
    }
    if (!pares.length) {
      setEstado(""); setErr(fallos[0] || "No había nada que subir.");
      return;
    }
    const res: any = await adjuntarComprobantesRhe(postulacionId, pares);
    setEstado("hecho");
    if (res?.error) { setErr(res.error); return; }
    const rechazados = new Set<string>((res?.fallos || []).map((f: any) => f.id));
    for (const f of res?.fallos || []) {
      const c = cruces.find(x => x.filaId === f.id);
      fallos.push(`${c?.doc.archivo || "un archivo"}: ${f.error}`);
    }
    setResumen({ hechos: res?.hechos || 0, fallos });
    /* ── SE QUITA LO QUE DE VERDAD ENTRÓ, Y NADA MÁS ──
       La primera versión borraba de la tanda todo lo que tuviera fila. Los
       archivos cuya SUBIDA falló también la tenían, así que desaparecían de la
       lista como si se hubieran guardado: el motivo salía en el resumen, pero
       la fila ya no estaba y no había forma de reintentar sin volver a soltar
       el archivo. Ahora se calcula por ÍNDICE, con los mismos índices que se
       usaron para subir —nadie pudo tocar la lista mientras tanto, la pantalla
       estaba bloqueada— y sobrevive todo lo que no llegó a guardarse. */
    const entraron = new Set<number>(
      pendientes.filter(({ c }) => !rechazados.has(c.filaId!) && pares.some(x => x.id === c.filaId))
        .map(({ i }) => i),
    );
    setArchivos(p => p.filter((_, k) => !entraron.has(k)));
    setCruces(p => p.filter((_, k) => !entraron.has(k)));
    router.refresh();
  };

  const cerrar = () => {
    if (estado === "subiendo") return;   // a media subida, cerrar pierde archivos
    setAbierto(false); setErr(""); setResumen(null);
  };

  const ICO: Record<string, string> = {
    seguro: "✓", probable: "≈", dudoso: "?", ninguno: "—",
  };
  const COLOR: Record<string, string> = {
    seguro: "var(--green)", probable: "var(--teal)",
    dudoso: "var(--yellow)", ninguno: "var(--dim)",
  };

  return (
    <>
      <button className="plg-todo" onClick={() => setAbierto(true)}
        title="Soltar de golpe los PDF de los recibos y que cada uno vaya a su fila">
        📎 Cargar comprobantes en lote
      </button>

      {abierto && (
        <div className="modal-fondo" onClick={cerrar}>
          <div className="modal-caja" onClick={e => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="modal-cab">
              <b>📎 Comprobantes de los RHE{nombreFondo ? ` · ${nombreFondo}` : ""}</b>
              <button className="modal-x" onClick={cerrar}>✕</button>
            </div>

            <ol className="imp-pasos">
              <li>Baja de Drive los PDF de los recibos (los de SUNAT, sin renombrar).</li>
              <li><b>Suéltalos aquí todos juntos.</b> Se leen en tu navegador; solo se suben los que confirmes.</li>
              <li>
                Revisa la tabla. Lo que va con <b style={{ color: "var(--green)" }}>✓</b> se
                cruzó por <b>RUC + número</b>, que es un dato del papel. Lo demás es una
                suposición y hay que mirarlo: <i>«E001-22» lo tiene cada persona</i>, así
                que el número solo no basta para saber de quién es.
              </li>
            </ol>

            {/* ⚠ Durante la subida esta zona NO acepta nada, y el ✕ y los
                desplegables tampoco. `archivos` y `cruces` van emparejados por
                índice: soltar un archivo a mitad de la subida corre los índices
                y a partir de ahí cada PDF se guarda en la fila del vecino. Es
                un fallo que no da error y que no se ve hasta que lo abre DAFO. */}
            <div className={"imp-soltar" + (estado === "leyendo" ? " leyendo" : "")}
              style={estado === "subiendo" ? { opacity: .45, pointerEvents: "none" } : undefined}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (estado !== "subiendo") tomar(e.dataTransfer.files); }}
              onClick={() => { if (estado !== "subiendo") entrada.current?.click(); }}>
              <input ref={entrada} type="file" accept="application/pdf,.pdf,image/*" multiple
                style={{ display: "none" }} onChange={e => tomar(e.target.files)} />
              {estado === "leyendo"
                ? `Leyendo ${avance.n} de ${avance.de}…`
                : "Suelta aquí los PDF (o toca para elegirlos)"}
            </div>

            {err && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {err}</div>}

            {resumen && (
              <div className="ok-inline" style={{ marginTop: 8 }}>
                ✓ {resumen.hechos} comprobante(s) guardado(s).
                {resumen.fallos.length > 0 && (
                  <ul style={{ margin: "6px 0 0 16px", color: "var(--yellow)" }}>
                    {resumen.fallos.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            )}

            {cruces.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "10px 0 6px" }}>
                  <b style={{ fontSize: 13 }}>{cruces.length} archivo(s)</b>
                  <span style={{ color: "var(--green)", fontSize: 12.5 }}>
                    {listas.length} listo(s) para guardar
                  </span>
                  {dobles.size > 0 && (
                    <span style={{ color: "var(--red)", fontSize: 12.5 }}
                      title="Dos archivos distintos apuntan al mismo recibo. Uno de los dos está mal: se quedan fuera hasta que lo resuelvas.">
                      ⚠ {dobles.size} recibo(s) con dos archivos
                    </span>
                  )}
                  {esAdmin && rucsHuerfanos.size > 0 && (
                    <span style={{ color: "var(--yellow)", fontSize: 12.5 }}
                      title="Esos RUC están escritos en los PDF pero no en ninguna ficha de persona. Cárgalos con el botón de su fila y esos archivos se colocan solos.">
                      ⚠ {rucsHuerfanos.size} RUC sin ficha ({[...rucsHuerfanos.values()].reduce((s, x) => s + x.n, 0)} archivo(s))
                    </span>
                  )}
                  {yaEstaban > 0 && (
                    <span style={{ color: "var(--teal)", fontSize: 12.5 }}
                      title="Sus recibos ya tienen un comprobante colgado. No hace falta volver a subirlos: solo confírmalos si quieres reemplazar el que hay.">
                      🗄 {yaEstaban} apunta(n) a recibos que ya tienen comprobante
                    </span>
                  )}
                  {pisan > 0 && (
                    <span style={{ color: "var(--yellow)", fontSize: 12.5 }}
                      title="Esos recibos ya tenían un comprobante colgado. Guardar lo reemplaza.">
                      ⚠ {pisan} reemplazará(n) uno que ya había
                    </span>
                  )}
                </div>

                {/* ── LOS RUC QUE FALTAN, TODOS JUNTOS ──
                    Con dieciocho fichas sin RUC, NINGÚN archivo se coloca solo
                    y por tanto ningún botón de fila llega a aparecer: el
                    arreglo estaba encerrado detrás del problema que arregla.
                    Aquí están los dieciocho, con el nombre que trae cada PDF y
                    un desplegable de las personas de este fondo. Cada uno que
                    se carga vuelve a cruzar la tanda entera al instante. */}
                {esAdmin && rucsHuerfanos.size > 0 && (
                  <div className="ruc-huerfanos">
                    <div className="ruc-huerfanos-tit">
                      ⚠ Estos RUC están en los PDF pero no en ninguna ficha. Cárgalos y
                      los archivos se colocan solos — es el trabajo que de verdad falta.
                    </div>
                    {[...rucsHuerfanos.entries()].map(([ruc, info]) => {
                      /* El más parecido primero, y dicho con un ↩ para que se
                         vea que es una ayuda y no una respuesta. */
                      const orden = [...personasDelFondo]
                        /* Se compara contra el nombre COMPLETO y el alias: el
                           recibo dice «PEREZ DIAZ KATY» y la lista «KatyP». */
                        .map(p => ({ ...p, pts: parecido(info.emisor, `${p.nombre} ${p.alias}`) }))
                        .sort((a, b) => b.pts - a.pts || a.alias.localeCompare(b.alias));
                      return (
                        <div key={ruc} className="ruc-fila">
                          <b style={{ fontSize: 12 }}>{ruc}</b>
                          <span style={{ color: "var(--muted)", fontSize: 12, flex: 1, minWidth: 140 }}>
                            {info.emisor || "sin nombre en el PDF"}
                          </span>
                          <span style={{ color: "var(--dim)", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            {info.n} archivo(s)
                          </span>
                          <select className="cmp-lote-sel" defaultValue=""
                            disabled={!!guardandoRuc}
                            onChange={e => e.target.value && aprenderRuc(ruc, e.target.value)}>
                            <option value="">¿de quién es? …</option>
                            {orden.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.pts > 0 ? "↩ " : ""}{p.alias}
                                {p.nombre && p.nombre !== p.alias ? ` · ${p.nombre}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="cmp-lote">
                  {cruces.map((c, i) => {
                    const fila = c.filaId ? porId.get(c.filaId) : undefined;
                    const doble = !!c.filaId && dobles.has(c.filaId);
                    const pisa = !!fila?.url;
                    return (
                      <div key={i} className="cmp-lote-fila">
                        <span title={c.motivo} style={{ color: doble ? "var(--red)" : COLOR[c.certeza], fontWeight: 700 }}>
                          {doble ? "⚠" : ICO[c.certeza]}
                        </span>
                        <span className="cmp-lote-arch" title={c.doc.archivo}>{c.doc.archivo}</span>
                        <span className="cmp-lote-leido" title="Lo que se pudo leer del PDF">
                          {c.doc.clave || "—"}
                          {c.doc.ruc ? ` · RUC ${c.doc.ruc}` : ""}
                          {c.doc.monto ? ` · S/ ${c.doc.monto.toFixed(2)}` : ""}
                        </span>
                        {/* El desplegable con TODAS las filas: lo que la máquina
                            no supo decidir se decide aquí, sin salir. */}
                        <select value={c.filaId || ""} onChange={e => elegir(i, e.target.value)}
                          disabled={estado === "subiendo"} className="cmp-lote-sel">
                          <option value="">— sin asignar —</option>
                          {filas.map(f => (
                            <option key={f.id} value={f.id}>
                              {rotulo(f)}{f.url ? " · ya tiene" : ""}
                            </option>
                          ))}
                        </select>
                        <span className="cmp-lote-motivo" title={c.motivo}>
                          {doble ? "Otro archivo apunta al mismo recibo" : c.motivo}
                          {pisa && !doble ? " · reemplaza el que ya había" : ""}
                        </span>
                        {/* La sugerencia que la máquina no se atrevió a dar por
                            buena. Aceptarla es un toque, y el toque lo da una
                            persona: preelegirla habría hecho que una tanda de
                            58 se guardara entera de un clic, suposiciones
                            incluidas. */}
                        {!c.filaId && c.sugerido && (
                          <button className="dato-btn" disabled={estado === "subiendo"}
                            title={`Usar ${rotulo(porId.get(c.sugerido))}`}
                            style={{ color: "var(--yellow)", whiteSpace: "nowrap" }}
                            onClick={() => elegir(i, c.sugerido!)}>
                            ↩ usar {porId.get(c.sugerido)?.persona || "esa"}
                          </button>
                        )}
                        {/* ── EL ARREGLO, DONDE SE VE EL PROBLEMA ──
                            El RUC está en el PDF y no en la ficha. En cuanto
                            alguien dice de quién es el recibo, ya sabemos las
                            dos puntas: cargarlo es un toque, y con él se
                            colocan solos los demás recibos de esa persona.
                            Aparece solo cuando la fila ya está elegida: antes
                            de eso, sería preguntar a quién pertenece un dato
                            fiscal sin saberlo. */}
                        {esAdmin && c.rucSinFicha && c.doc.ruc && (c.filaId || c.sugerido) && (
                          <button className="dato-btn" disabled={estado === "subiendo" || !!guardandoRuc}
                            style={{ color: "var(--teal)", whiteSpace: "nowrap" }}
                            title={`Guardar el RUC ${c.doc.ruc}${c.doc.emisor ? ` (${c.doc.emisor})` : ""} en la ficha de ${porId.get((c.filaId || c.sugerido)!)?.persona || "esa persona"}. Los demás recibos suyos se colocarán solos.`}
                            onClick={() => aprenderRuc(c.doc.ruc!, porId.get((c.filaId || c.sugerido)!)!.persona_id)}>
                            {guardandoRuc === c.doc.ruc ? "…" : "＋ RUC a su ficha"}
                          </button>
                        )}
                        <button className="dato-btn" title="Quitar este archivo de la tanda"
                          disabled={estado === "subiendo"} onClick={() => quitar(i)}>✕</button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn" disabled={!listas.length || estado === "subiendo"}
                    onClick={guardar} style={{ fontSize: 12.5 }}>
                    {estado === "subiendo"
                      ? `Subiendo ${avance.n}/${avance.de}…`
                      : `Guardar ${listas.length} comprobante(s)`}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                    disabled={estado === "subiendo"}
                    onClick={() => { setArchivos([]); setCruces([]); setResumen(null); setErr(""); }}>
                    Vaciar la tanda
                  </button>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                    Lo que quede «sin asignar» no se sube.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* Se exporta para que la ficha pueda decidir si hay algo que cargar sin
   duplicar la regla de qué cuenta como «sin comprobante». */
export const sinComprobante = (fs: { url: string | null }[]) => fs.filter(f => !f.url).length;
export { claveNumero };
