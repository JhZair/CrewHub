"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarPresupuesto, guardarPlantillaPresupuesto, fijarPresupuestoPostulado } from "@/app/actions";
import { type Rubro, type ItemPre, type FuentePre, topeEstimuloDe, metaRubro, ESTADOS_FUENTE } from "@/lib/rubros";

/* PRESUPUESTO DETALLADO — la Sección D del formulario DAFO.
   Una tabla de costos por rubro (los rubros los decide la categoría de la
   convocatoria). Cada ítem: cantidad × costo unitario = costo total, y una
   parte la cubre "otras fuentes" (contrapartida); lo demás, el estímulo. La
   regla dura: el estímulo no puede pasar del 70% del costo total. Abajo, el
   plan de financiamiento (las fuentes). Se guarda solo (autosave). */

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const money = (n: number) => "S/ " + Math.round(n || 0).toLocaleString("es-PE");
const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none", color: "var(--text)" } as const;

/* Campo numérico con miles: muestra «25,000» cuando no está en foco, y el
   número pelado mientras se edita (así no salta el cursor). `type=number` no
   admite separadores, por eso es un text con parseo. */
function Num({ value, onChange, w = 74 }: { value: number; onChange: (n: number) => void; w?: number }) {
  const [foco, setFoco] = useState(false);
  const [txt, setTxt] = useState("");
  const fmt = (n: number) => n ? n.toLocaleString("es-PE") : "";
  return <input type="text" inputMode="decimal" placeholder="0"
    value={foco ? txt : fmt(value)}
    onFocus={() => { setTxt(value ? String(value) : ""); setFoco(true); }}
    onBlur={() => setFoco(false)}
    onChange={e => { const raw = e.target.value.replace(/[^\d.]/g, ""); setTxt(raw); onChange(Math.max(0, parseFloat(raw) || 0)); }}
    style={{ ...inp, width: w, textAlign: "right" }} />;
}

export default function Presupuesto({ postulacionId, rubros, inicial, estimuloConcurso, categoria, plantillas = [], postulado, postuladoEn, ocultarFijar = false }: {
  postulacionId: string;
  rubros: Rubro[];
  inicial: { tipo_cambio?: number; items?: ItemPre[]; fuentes?: FuentePre[] } | null;
  /** El estímulo en juego del concurso, si se conoce (para contexto). */
  estimuloConcurso?: number | null;
  /** Categoría de la convocatoria: al guardar plantilla queda etiquetada. */
  categoria?: string | null;
  plantillas?: { id: string; nombre: string; categoria: string | null; items: any[] }[];
  postulado?: { tipo_cambio?: number; items?: ItemPre[]; fuentes?: FuentePre[] } | null;
  postuladoEn?: string | null;
  /* En la ejecución del fondo, las versiones las maneja el panel de arriba, así
     que aquí se oculta la foto única y `postulado` es la versión VIGENTE. */
  ocultarFijar?: boolean;
}) {
  const refNombre = ocultarFijar ? "la versión vigente" : "lo postulado";
  const [items, setItems] = useState<ItemPre[]>(inicial?.items || []);
  const [fuentes, setFuentes] = useState<FuentePre[]>(inicial?.fuentes || []);
  const [tc, setTc] = useState<number>(inicial?.tipo_cambio || 0);
  const [estado, setEstado] = useState<"ok" | "guardando" | "error">("ok");
  const [panel, setPanel] = useState<"" | "guardar" | "usar">("");
  const [nomPl, setNomPl] = useState("");
  const [plSel, setPlSel] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const [ancho, setAncho] = useState(false);  // pantalla completa, como el cronograma
  // Escape cierra la vista ampliada (igual que el cronograma).
  useEffect(() => {
    if (!ancho) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAncho(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ancho]);

  /* Plegado de la tabla, con memoria. El presupuesto tiene dos niveles —las
     categorías DAFO (1, 2) y sus rubros (1.1, 1.2…)— y con 40 ítems abiertos
     es un muro. Se guarda qué está colapsado en `localStorage` (por ficha), un
     solo objeto {id: true}. Ausente = abierto. Como el estado de los ítems vive
     arriba, plegar un rubro puede DESMONTAR sus filas sin perder nada. */
  const [colPre, setColPre] = useState<Record<string, boolean>>({});
  const llaveCol = `plgpre:${postulacionId}`;
  useEffect(() => {
    try { const v = localStorage.getItem(llaveCol); if (v) setColPre(JSON.parse(v)); } catch { /* da igual */ }
  }, [llaveCol]);
  const guardarCol = (next: Record<string, boolean>) => {
    setColPre(next);
    try { localStorage.setItem(llaveCol, JSON.stringify(next)); } catch { /* da igual */ }
  };
  const alternarCol = (id: string) => guardarCol({ ...colPre, [id]: !colPre[id] });
  // Ids de todas las bandas (categorías + rubros) para «expandir/plegar todo».
  const bandasPre = () => {
    const ids: string[] = []; const vistas = new Set<string>();
    for (const r of rubros) {
      const m = metaRubro(r.clave);
      if (m && !vistas.has(m.catCod)) { vistas.add(m.catCod); ids.push(`cat:${m.catCod}`); }
      ids.push(`rubro:${r.clave}`);
    }
    return ids;
  };
  const plegarTodoPre = (colapsar: boolean) => {
    if (!colapsar) return guardarCol({});          // todo abierto = mapa vacío
    const next: Record<string, boolean> = {};
    for (const id of bandasPre()) next[id] = true;
    guardarCol(next);
  };

  /* Guardar en BLUR, no con rebote: cuando el foco sale de un campo (o de la
     tarjeta al navegar) se manda el objeto entero. Evita perder el último
     cambio si te vas a los 900 ms, y no revalida —el estado local es la verdad
     mientras editas, un refresh cortaría el tecleo—. Los cambios estructurales
     (agregar/quitar) guardan al toque. `onBlur` en la tarjeta captura el
     focusout de cualquier input (React lo hace burbujear). */
  const persistir = async (pre: { tipo_cambio: number; items: ItemPre[]; fuentes: FuentePre[] }) => {
    setEstado("guardando");
    const r: any = await guardarPresupuesto(postulacionId, pre);
    setEstado(r?.error ? "error" : "ok");
  };
  const guardarActual = () => persistir({ tipo_cambio: tc, items, fuentes });

  // ── Cálculos ──
  const totalDe = (i: ItemPre) => (i.cantidad || 0) * (i.costo_unit || 0);
  const estimuloDe = (i: ItemPre) => Math.max(0, totalDe(i) - (i.otras || 0));
  const subtotal = (clave: string) => items.filter(i => i.rubro === clave).reduce((s, i) => s + totalDe(i), 0);
  const total = items.reduce((s, i) => s + totalDe(i), 0);
  const totalEstimulo = items.reduce((s, i) => s + estimuloDe(i), 0);
  const totalOtras = total - totalEstimulo;
  const pctEst = total ? totalEstimulo / total : 0;
  const tope = topeEstimuloDe(categoria);       // 0.70 videojuego · 1.0 (100%) el resto
  const excede = tope < 1 && pctEst > tope + 1e-9;
  const usd = (n: number) => tc > 0 ? "$ " + (n / tc).toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "—";

  const totalFuentes = fuentes.reduce((s, f) => s + (f.importe || 0), 0);
  const cuadra = Math.abs(totalFuentes - total) < 1;

  // ── Mutadores ──
  // Editar un campo: solo estado local; el blur de la tarjeta lo persiste.
  const setItem = (id: string, patch: Partial<ItemPre>) =>
    setItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
  // Estructurales: guardan al toque (un clic no siempre dispara blur).
  const addItem = (rubro: string) => {
    const next = [...items, { id: uid(), rubro, concepto: "", unidad: "", cantidad: 0, costo_unit: 0, otras: 0 }];
    setItems(next); persistir({ tipo_cambio: tc, items: next, fuentes });
  };
  const delItem = (id: string) => {
    const next = items.filter(i => i.id !== id);
    setItems(next); persistir({ tipo_cambio: tc, items: next, fuentes });
  };

  const setFuente = (id: string, patch: Partial<FuentePre>) =>
    setFuentes(fuentes.map(f => f.id === id ? { ...f, ...patch } : f));
  const addFuente = () => {
    const next = [...fuentes, { id: uid(), fuente: "", pais: "Perú", estado: "Por confirmar", importe: 0 }];
    setFuentes(next); persistir({ tipo_cambio: tc, items, fuentes: next });
  };
  const delFuente = (id: string) => {
    const next = fuentes.filter(f => f.id !== id);
    setFuentes(next); persistir({ tipo_cambio: tc, items, fuentes: next });
  };

  // ── Plantillas ── (usar es cliente; guardar va al servidor)
  const usarPlantilla = () => {
    const pl = plantillas.find(p => p.id === plSel);
    if (!pl) return;
    const next = (pl.items || []).map((i: any) => ({
      id: uid(), rubro: i.rubro, concepto: i.concepto || "", unidad: i.unidad || "",
      cantidad: i.cantidad || 0, costo_unit: i.costo_unit || 0, otras: 0,
    }));
    setItems(next); persistir({ tipo_cambio: tc, items: next, fuentes });
    setPanel(""); setPlSel("");
  };
  const guardarPl = async () => {
    if (ocupado || !nomPl.trim()) return;
    setOcupado(true); setMsg("");
    const r: any = await guardarPlantillaPresupuesto(nomPl.trim(), categoria || null, items);
    setOcupado(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg(`✓ Plantilla «${nomPl}» guardada con ${r.n} ítems — ya se puede usar en otra postulación.`);
    setPanel(""); setNomPl("");
    router.refresh();
  };

  // ── Foto de lo postulado + comparación ──
  const fijar = async () => {
    if (ocupado) return;
    setOcupado(true); setMsg("");
    const r: any = await fijarPresupuestoPostulado(postulacionId, { tipo_cambio: tc, items, fuentes });
    setOcupado(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg("✓ Foto del presupuesto fijada.");
    router.refresh();
  };
  const totalPost = (postulado?.items || []).reduce((s: number, i: any) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  const difTotal = total - totalPost;
  /* Comparación por rubro+concepto, con índice de ocurrencia para que dos
     ítems con la misma clave no se pisen en el Map. Los que no tienen concepto
     no entran: son borradores a medio llenar, no comparan. */
  const conClave = (arr: any[]) => {
    const cnt = new Map<string, number>();
    return (arr || []).filter((i: any) => (i.concepto || "").trim()).map((i: any) => {
      const c = `${i.rubro}|${(i.concepto || "").trim().toLowerCase()}`;
      const n = cnt.get(c) || 0; cnt.set(c, n + 1);
      return { ...i, _k: `${c}#${n}` };
    });
  };
  const postI = conClave(postulado?.items || []);
  const vivoI = conClave(items);
  const postMap = new Map(postI.map(i => [i._k, i]));
  const vivoMap = new Map(vivoI.map(i => [i._k, i]));
  const cambiados = postI.filter(p => {
    const v = vivoMap.get(p._k);
    return v && (v.cantidad || 0) * (v.costo_unit || 0) !== (p.cantidad || 0) * (p.costo_unit || 0);
  }).length;
  const nuevos = vivoI.filter(i => !postMap.has(i._k)).length;
  const quitados = postI.filter(p => !vivoMap.has(p._k)).length;
  const hayCambios = cambiados + nuevos + quitados > 0 || Math.abs(difTotal) >= 1;

  const cuerpo = (
    <div className="card" onBlur={guardarActual}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>💰 Presupuesto detallado</b>
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          {estado === "guardando" ? "guardando…" : estado === "error" ? "⚠ no se guardó" : "guardado ✓"}
        </span>
        {estimuloConcurso ? (
          <span style={{ color: "var(--dim)", fontSize: 11 }}>· estímulo del concurso: {money(estimuloConcurso)}</span>
        ) : null}
        {/* Ampliar a pantalla completa: la tabla es ancha y en la ficha se
            aprieta. El modal es position:fixed, escapa del ancho de la página
            —igual que el cronograma—. */}
        <button className="btn btn-ghost" style={{ padding: "4px 9px", fontSize: 12 }}
          title={ancho ? "Volver a la ficha" : "Abrir a pantalla completa"}
          onClick={() => setAncho(!ancho)}>{ancho ? "✕ Cerrar" : "⛶ Ampliar"}</button>
        {/* Plantillas: usar solo con el presupuesto vacío (suma, no reemplaza);
            guardar solo cuando hay algo que guardar. Igual que el cronograma. */}
        {!items.length && plantillas.length > 0 && !panel && (
          <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, color: "var(--accent)" }}
            onClick={() => setPanel("usar")}>📋 Usar plantilla</button>
        )}
        {items.length > 0 && !panel && (
          <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={() => setPanel("guardar")}>📋 Guardar como plantilla</button>
        )}
        <span style={{ flex: 1 }} />
        <label style={{ color: "var(--dim)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
          Tipo de cambio (S/ por US$)
          <Num value={tc} onChange={setTc} w={70} />
        </label>
      </div>

      {msg && <div style={{ color: msg.startsWith("✓") ? "var(--green)" : "var(--red)", fontSize: 12, marginTop: 8 }}>{msg}</div>}

      {/* Panel: usar plantilla (solo con presupuesto vacío) */}
      {panel === "usar" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <select style={{ ...inp, flex: 1, minWidth: 200 }} value={plSel} onChange={e => setPlSel(e.target.value)}>
            <option value="">— elegir plantilla —</option>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre} · {(p.items || []).length} ítems{p.categoria ? ` · ${p.categoria}` : ""}</option>)}
          </select>
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!plSel} onClick={usarPlantilla}>Cargar</button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setPanel("")}>Cancelar</button>
        </div>
      )}
      {/* Panel: guardar como plantilla */}
      {panel === "guardar" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <span style={{ color: "var(--dim)", fontSize: 11.5, width: "100%" }}>
            Se guardan los {items.length} ítems (rubro, concepto, unidad, cantidad, costo unitario) — sin las fuentes, que son de cada postulación.
          </span>
          <input style={{ ...inp, flex: 1, minWidth: 220 }} placeholder="Nombre de la plantilla *"
            value={nomPl} onChange={e => setNomPl(e.target.value)} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!nomPl.trim() || ocupado} onClick={guardarPl}>{ocupado ? "…" : "Guardar"}</button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setPanel("")}>Cancelar</button>
        </div>
      )}

      {/* Foto de lo postulado + comparación. En el fondo (ocultarFijar) sin
          versión vigente no hay nada que mostrar: se omite la card vacía. */}
      {(!ocultarFijar || postulado) && (
      <div className="card" style={{ margin: "12px 0", background: "var(--bg)", borderLeft: `3px solid ${postulado ? (hayCambios ? "var(--yellow)" : "var(--green)") : "var(--border)"}` }}>
        {!ocultarFijar && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <b style={{ fontSize: 12.5 }}>📸 Presupuesto postulado</b>
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 2 }}>
                {postuladoEn
                  ? <>Fijado el {new Date(postuladoEn).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · {money(totalPost)} — es lo que fue a DAFO.</>
                  : <>Aún no fijas la foto. Arma el presupuesto y fíjalo cuando esté listo para enviar.</>}
              </div>
            </div>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} disabled={ocupado} onClick={fijar}
              title="Congela el presupuesto actual como lo presentado a DAFO">
              {ocupado ? "…" : postulado ? "📸 Volver a fijar" : "📸 Fijar como postulado"}
            </button>
          </div>
        )}
        {postulado && (
          <div style={{ fontSize: 11.5, marginTop: ocultarFijar ? 0 : 6 }}>
            {!hayCambios ? (
              <span style={{ color: "var(--green)" }}>✅ El presupuesto vivo coincide con {refNombre}.</span>
            ) : (
              <span style={{ color: "var(--muted)" }}>
                <b style={{ color: "var(--yellow)" }}>Cambió desde {refNombre}:</b>{" "}
                total {money(totalPost)} → {money(total)} ({difTotal >= 0 ? "+" : "−"}{money(Math.abs(difTotal))})
                {cambiados > 0 && <> · {cambiados} ítems con otro monto</>}
                {nuevos > 0 && <> · {nuevos} nuevos</>}
                {quitados > 0 && <> · {quitados} quitados</>}
                {" "}— para la ejecución, esto es lo que va en la modificación de presupuesto.
              </span>
            )}
          </div>
        )}
      </div>
      )}

      {/* Medidor del tope del estímulo (70% en videojuego · 100% en el resto) */}
      <div style={{ margin: "12px 0 4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: "var(--muted)" }}>Estímulo: <b style={{ color: excede ? "var(--red)" : "var(--green)" }}>{money(totalEstimulo)}</b> · {(pctEst * 100).toFixed(0)}% del total</span>
          {tope < 1
            ? <span style={{ color: "var(--dim)" }}>tope {(tope * 100).toFixed(0)}% = {money(total * tope)}</span>
            : <span style={{ color: "var(--dim)" }}>sin contrapartida (hasta 100%)</span>}
        </div>
        <div style={{ position: "relative", height: 8, background: "var(--bg)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)" }}>
          <div style={{ height: "100%", width: `${Math.min(100, pctEst * 100)}%`, background: excede ? "var(--red)" : "var(--green)" }} />
          {tope < 1 && (
            <div style={{ position: "absolute", top: -2, bottom: -2, left: `${tope * 100}%`, width: 2, background: "var(--yellow)" }} title={`Tope ${(tope * 100).toFixed(0)}%`} />
          )}
        </div>
        {excede && (
          <div style={{ color: "var(--red)", fontSize: 11.5, marginTop: 5 }}>
            ⚠ El estímulo pasa del {(tope * 100).toFixed(0)}%. Falta contrapartida: sube «otras fuentes» en {money(totalEstimulo - total * tope)} más.
          </div>
        )}
      </div>

      {/* Tabla por rubro */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", margin: "10px 0 2px" }}>
          <button className="plg-todo" onClick={() => plegarTodoPre(false)}>⤢ Expandir todo</button>
          <button className="plg-todo" onClick={() => plegarTodoPre(true)}>⤡ Plegar todo</button>
        </div>
      )}
      <div className="pre-grid">
        <div className="pre-lbls">
          <span>Concepto</span><span>Unidad</span><span>Cant.</span><span>C. unit.</span>
          <span>Total</span><span>Otras fuentes</span><span>Estímulo</span><span />
        </div>
        {(() => {
          /* Se agrupan los rubros por su CATEGORÍA DAFO (1, 2…). Los que no
             tienen categoría conocida (videojuego, genéricos) van planos. */
          const cats: { catCod: string; catNombre: string; rubros: Rubro[] }[] = [];
          const sinCat: Rubro[] = [];
          for (const r of rubros) {
            const m = metaRubro(r.clave);
            if (!m) { sinCat.push(r); continue; }
            let g = cats.find(c => c.catCod === m.catCod);
            if (!g) { g = { catCod: m.catCod, catNombre: m.catNombre, rubros: [] }; cats.push(g); }
            g.rubros.push(r);
          }
          cats.sort((a, b) => a.catCod.localeCompare(b.catCod, undefined, { numeric: true }));

          const filaItem = (r: Rubro, i: ItemPre, idx: number) => {
            const t = totalDe(i);
            const rubroCod = metaRubro(r.clave)?.rubroCod;
            return (
              <div key={i.id} className="pre-row">
                <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  {rubroCod && <span className="pre-cod">{rubroCod}.{idx + 1}</span>}
                  <input style={{ ...inp, width: "100%" }} placeholder="Detalle del gasto"
                    value={i.concepto} onChange={e => setItem(i.id, { concepto: e.target.value })} />
                </span>
                <input style={{ ...inp, width: 72 }} placeholder="Meses…"
                  value={i.unidad} onChange={e => setItem(i.id, { unidad: e.target.value })} />
                <Num value={i.cantidad} onChange={n => setItem(i.id, { cantidad: n })} w={54} />
                <Num value={i.costo_unit} onChange={n => setItem(i.id, { costo_unit: n })} w={84} />
                <span className="pre-num" title={usd(t)}>{money(t)}</span>
                <Num value={i.otras} onChange={n => setItem(i.id, { otras: Math.min(n, t) })} w={84} />
                <span className="pre-num" style={{ color: "var(--green)" }}>{money(estimuloDe(i))}</span>
                <button className="pre-x" title="Quitar" onClick={() => delItem(i.id)}>✕</button>
              </div>
            );
          };
          const bloqueRubro = (r: Rubro) => {
            const its = items.filter(i => i.rubro === r.clave);
            const rubroCod = metaRubro(r.clave)?.rubroCod;
            const idR = `rubro:${r.clave}`;
            const col = !!colPre[idR];
            return (
              <div key={r.clave}>
                <div className="pre-rubro pre-fold" onClick={() => alternarCol(idR)}
                  title={col ? "Desplegar rubro" : "Plegar rubro"}>
                  <span style={{ gridColumn: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="pre-flecha">{col ? "▸" : "▾"}</span>
                    {rubroCod && <span style={{ color: "var(--dim)" }}>{rubroCod}</span>}
                    {r.nombre}
                    <span style={{ color: "var(--dim)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· {its.length}</span>
                  </span>
                  <span className="pre-rubro-tot" style={{ gridColumn: 5 }}>{money(subtotal(r.clave))}</span>
                </div>
                {!col && (
                  <>
                    {its.map((i, idx) => filaItem(r, i, idx))}
                    <button className="pre-add" onClick={() => addItem(r.clave)}>＋ ítem en {r.nombre}</button>
                  </>
                )}
              </div>
            );
          };

          return (
            <>
              {cats.map(cat => {
                const catTotal = cat.rubros.reduce((s, r) => s + subtotal(r.clave), 0);
                const idC = `cat:${cat.catCod}`;
                const colC = !!colPre[idC];
                return (
                  <div key={cat.catCod}>
                    <div className="pre-cat pre-fold" onClick={() => alternarCol(idC)}
                      title={colC ? "Desplegar categoría" : "Plegar categoría"}>
                      <span className="pre-flecha">{colC ? "▸" : "▾"}</span>
                      <b style={{ marginRight: 6 }}>{cat.catCod}</b>{cat.catNombre}
                      <span style={{ marginLeft: "auto" }}>{money(catTotal)}</span>
                    </div>
                    {!colC && cat.rubros.map(bloqueRubro)}
                  </div>
                );
              })}
              {sinCat.map(bloqueRubro)}
            </>
          );
        })()}
        <div className="pre-tot">
          <span>TOTAL</span>
          <span className="pre-num" title={usd(total)}>{money(total)}</span>
          <span className="pre-num">{money(totalOtras)}</span>
          <span className="pre-num" style={{ color: excede ? "var(--red)" : "var(--green)" }}>{money(totalEstimulo)}</span>
        </div>
      </div>

      {/* Plan de financiamiento */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 12.5 }}>🏦 Plan de financiamiento</b>
          <span style={{ color: cuadra ? "var(--green)" : "var(--yellow)", fontSize: 11.5 }}>
            {cuadra ? "✓ cuadra con el total" : `suma ${money(totalFuentes)} · el presupuesto es ${money(total)}`}
          </span>
        </div>
        <div className="pre-fu-grid" style={{ marginTop: 8 }}>
          <div className="pre-fu-lbls">
            <span>Fuente</span><span>País</span><span>Estado</span><span>Importe</span><span>%</span><span />
          </div>
          {fuentes.map(f => (
            <div key={f.id} className="pre-fu-row">
              <input style={{ ...inp, width: "100%" }} placeholder="Ministerio de Cultura, aporte propio…"
                value={f.fuente} onChange={e => setFuente(f.id, { fuente: e.target.value })} />
              <input style={{ ...inp, width: 90 }} value={f.pais} onChange={e => setFuente(f.id, { pais: e.target.value })} />
              <select style={{ ...inp, width: 120 }} value={f.estado} onChange={e => setFuente(f.id, { estado: e.target.value })}>
                {ESTADOS_FUENTE.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <Num value={f.importe} onChange={n => setFuente(f.id, { importe: n })} w={90} />
              <span className="pre-num" style={{ width: 48 }}>{total ? ((f.importe || 0) / total * 100).toFixed(0) : 0}%</span>
              <button className="pre-x" title="Quitar" onClick={() => delFuente(f.id)}>✕</button>
            </div>
          ))}
          <button className="pre-add" onClick={addFuente}>＋ fuente de financiamiento</button>
        </div>
      </div>
    </div>
  );

  /* El MISMO cuerpo, en la ficha o a pantalla completa. stopPropagation para
     que un clic dentro (o el blur de guardado) no cierre la ventana. */
  if (!ancho) return cuerpo;
  return (
    <div className="modal-fondo" onClick={() => setAncho(false)}>
      <div className="modal-ancho" onClick={e => e.stopPropagation()}>{cuerpo}</div>
    </div>
  );
}
