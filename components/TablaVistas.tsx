"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Copiar from "@/components/Copiar";
import { guardarVista, borrarVista } from "@/app/actions";
import { OPS, aplicar, columnasDe, comoTexto, RUTA_DE, type Columna, type Filtro, type Orden, type ConfigVista } from "@/lib/tabla";

/* TABLA CON VISTAS — filtrar, ordenar, ocultar columnas, y guardarlo con un
 * nombre. Lo que SeaTable daba y se perdió al migrar.
 *
 * Vive AL LADO de la lista de fichas, no en su lugar: una ficha enseña avatar,
 * palmarés y completitud —cosas calculadas— y meterlas en columnas sería
 * reimplementarlas peor. Esto sirve para lo otro: comparar muchas filas por
 * pocos campos, que es justo lo que hoy obliga a exportar a mano.
 *
 * Todo ocurre en el cliente sobre las filas ya cargadas. Son cientos, no
 * millones: filtrar en el servidor añadiría una espera por tecla a cambio de
 * nada.
 */

type Vista = { id: string; nombre: string; icono?: string | null; usuario_id: string | null; config: ConfigVista };

/* ── LA MISMA TABLA, TAMBIÉN PARA ELEGIR ──
 *
 * Sumar a alguien al personal de un fondo se hacía con un buscador por nombre:
 * perfecto cuando ya sabes a quién quieres, inútil cuando la pregunta es «¿a
 * qué sonidistas de Cusco podríamos llamar?». Eso —filtrar por tipo, equipo,
 * región, especialidad— ya estaba resuelto aquí y solo en /personas.
 *
 * La opción cómoda era copiar la tabla al pop-up con dos columnas y un botón.
 * Sería una segunda tabla con sus propios filtros, su propio orden y sus
 * propias vistas, divergiendo de la primera desde el día siguiente. Así que se
 * le añade un MODO a esta: las mismas columnas, los mismos operadores y las
 * mismas vistas guardadas, con una columna de acción delante.
 *
 * `seleccion` ausente = la tabla de siempre, sin un solo cambio de aspecto.
 */
export type ModoSeleccion = {
  /** Ids que ya están en la lista de destino: se marcan y no se pueden sumar
   *  dos veces. Es la mitad de lo que se viene a mirar — sin esto hay que
   *  memorizar a quién ya añadiste mientras cambias de filtro. */
  yaEstan: string[];
  onElegir: (fila: any) => void;
  ocupado?: boolean;
  /** Qué se dice de quien ya está («ya está en el fondo»). */
  yaTxt?: string;
  /** Qué dice el botón de sumar. */
  addTxt?: string;
};

export default function TablaVistas({ entidad, filas, vistas, seleccion }: {
  /* Solo cadenas y datos cruzan desde el servidor. Las columnas llevan
     funciones (`valor`) y se resuelven AQUÍ, ya en el cliente: pasarlas como
     prop es el error «Functions cannot be passed directly to Client
     Components», que el typecheck no detecta y solo aparece al abrir la
     página. Es la tercera vez en este proyecto; por eso deja de ser posible. */
  entidad: string;
  filas: any[];
  vistas: Vista[];
  seleccion?: ModoSeleccion;
}) {
  /* Las columnas se calculan CON LAS FILAS delante: la lista curada, más todo
     lo que la ficha guarda, más lo que llegó en los datos y nadie declaró.
     `useMemo` porque `columnasDe` recorre una muestra de filas y esto se
     renderiza en cada tecla del filtro. */
  const columnas = useMemo(() => columnasDe(entidad, filas), [entidad, filas]);
  const hrefDe = (f: any) => (RUTA_DE[entidad] || ((id: string) => "#"))(f.id);
  const router = useRouter();
  const DEF = columnas.slice(0, 7).map(c => c.key);
  const [cols, setCols] = useState<string[]>(DEF);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [orden, setOrden] = useState<Orden>(null);
  const [panel, setPanel] = useState<"" | "cols" | "filtros" | "orden" | "vistas">("");
  const [vistaId, setVistaId] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [compartida, setCompartida] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const visibles = useMemo(
    () => cols.map(k => columnas.find(c => c.key === k)).filter(Boolean) as Columna[],
    [cols, columnas]);
  /* Cuenta solo los que de verdad filtran: anunciar «2 filtros» cuando uno
     está a medio escribir hace dudar del resultado que se está viendo. */
  const nFiltran = filtros.filter(f => {
    const c = columnas.find(x => x.key === f.col);
    const op = OPS[c?.tipo || "texto"].find(o => o.op === f.op);
    return op?.sinValor || String(f.val || "").trim() !== "";
  }).length;
  const datos = useMemo(
    () => aplicar(filas, filtros, orden, columnas),
    [filas, filtros, orden, columnas]);
  /* Un Set y no un `includes` sobre el array: esto se pregunta una vez por
     fila pintada y la lista de destino puede tener decenas. */
  const yaSet = useMemo(() => new Set(seleccion?.yaEstan || []), [seleccion?.yaEstan]);
  const yaAqui = seleccion ? datos.filter((f: any) => yaSet.has(f.id)).length : 0;

  const cargar = (v: Vista) => {
    setVistaId(v.id); setNombre(v.nombre);
    setCompartida(v.usuario_id === null);
    setCols(v.config?.cols?.length ? v.config.cols : DEF);
    setFiltros(v.config?.filtros || []);
    setOrden(v.config?.orden || null);
    setPanel("");
  };
  const limpiar = () => {
    setVistaId(""); setNombre(""); setCols(DEF); setFiltros([]); setOrden(null);
  };

  async function guardar(comoNueva = false) {
    if (!nombre.trim()) { setMsg("Ponle un nombre."); return; }
    setOcupado(true); setMsg("");
    const r: any = await guardarVista(entidad, nombre, { cols, filtros, orden },
      compartida, comoNueva ? null : (vistaId || null));
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    setMsg("✔ guardada"); setTimeout(() => setMsg(""), 3000);
    router.refresh();
  }
  async function borrar() {
    if (!vistaId) return;
    setOcupado(true);
    const r: any = await borrarVista(vistaId);
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    limpiar(); router.refresh();
  }

  const cambiarOrden = (k: string) =>
    setOrden(o => (o?.col === k ? (o.asc ? { col: k, asc: false } : null) : { col: k, asc: true }));

  const pinta = (c: Columna, f: any) => {
    const v = c.valor ? c.valor(f) : f[c.key];
    if (c.tipo === "booleano" && (v === true || v === false)) return v ? "sí" : "no";
    /* `comoTexto` y no `String`: ahora se listan TODAS las columnas de la
       tabla, y entre ellas hay `text[]` y `jsonb`. `String` los pintaba como
       «[object Object]». */
    const s = comoTexto(v);
    if (s === "") return <span className="tv-vacio">—</span>;
    /* Un enlace es un enlace, no una cadena de 140 caracteres que rompe la
       columna. Se pinta corto y se abre en otra pestaña. */
    if (/^https?:\/\//i.test(s)) {
      return <a href={s} target="_blank" rel="noopener noreferrer" className="tv-url" title={s}>abrir ↗</a>;
    }
    /* Los datos que se transcriben a formularios salen copiables aquí también:
       la tabla es justo donde uno viene a sacar un DNI o un correo. */
    if (/dni|ruc|telefono|teléfono|email|correo/i.test(c.key + c.lbl)) {
      return <Copiar valor={s} etiqueta={c.lbl} />;
    }
    return s;
  };

  return (
    <div>
      {/* ── Barra: vistas guardadas + los tres controles ── */}
      <div className="tv-barra">
        <div className="tv-vistas">
          {vistas.map(v => (
            <button key={v.id} className={`vtab${vistaId === v.id ? " on" : ""}`}
              onClick={() => cargar(v)}
              title={v.usuario_id === null ? "Compartida con el equipo" : "Solo tuya"}>
              {v.usuario_id === null ? "👥" : "🔒"} {v.nombre}
            </button>
          ))}
          {(vistaId || filtros.length > 0 || orden) && (
            <button className="vtab" onClick={limpiar}>✕ limpiar</button>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <button className={`vtab${panel === "cols" ? " on" : ""}`}
          onClick={() => setPanel(p => p === "cols" ? "" : "cols")}>
          👁 {columnas.length - cols.length} ocultas
        </button>
        <button className={`vtab${panel === "filtros" ? " on" : ""}`}
          onClick={() => setPanel(p => p === "filtros" ? "" : "filtros")}>
          ⚗ {nFiltran} filtro{nFiltran === 1 ? "" : "s"}
        </button>
        {/* Las cabeceras ya ordenaban al hacer clic, pero eso no se ve —y algo
            que hay que descubrir no existe para quien no sabe que está—. El
            botón dice además POR QUÉ columna se está ordenando, que es lo que
            uno se pregunta al ver una lista y no entender su orden. */}
        <button className={`vtab${panel === "orden" ? " on" : ""}`}
          onClick={() => setPanel(p => p === "orden" ? "" : "orden")}>
          ↕ {orden ? `${columnas.find(c => c.key === orden.col)?.lbl} ${orden.asc ? "↑" : "↓"}` : "Sin ordenar"}
        </button>
        <button className={`vtab${panel === "vistas" ? " on" : ""}`}
          onClick={() => setPanel(p => p === "vistas" ? "" : "vistas")}>💾 Guardar vista</button>
      </div>

      {panel === "cols" && (
        <div className="card tv-panel">
          <div className="tv-panel-h">Columnas · {cols.length} de {columnas.length}</div>
          <div className="tv-cols">
            {columnas.map(c => (
              <label key={c.key} className="tv-chk">
                <input type="checkbox" checked={cols.includes(c.key)}
                  onChange={() => setCols(s => s.includes(c.key)
                    ? s.filter(x => x !== c.key)
                    /* Se añade al FINAL y no en el orden del catálogo: la
                       columna que acabas de encender aparece donde miras. */
                    : [...s, c.key])} />
                {c.lbl}
              </label>
            ))}
          </div>
        </div>
      )}

      {panel === "filtros" && (
        <div className="card tv-panel">
          <div className="tv-panel-h">
            Filtros — columnas distintas se suman con «y»; dos «es» de la misma columna, con «o»
          </div>
          {filtros.map((f, i) => {
            const c = columnas.find(x => x.key === f.col);
            const ops = OPS[c?.tipo || "texto"];
            const opDef = ops.find(o => o.op === f.op);
            /* El conector se DIBUJA: si no se ve, «Tipo es personal» seguido de
               «Tipo es colaborador» se lee como una resta y no como una suma. */
            const previo = i > 0 ? filtros[i - 1] : null;
            const conector = !previo ? "" : (previo.col === f.col && f.op === "es" && previo.op === "es") ? "o" : "y";
            /* Un filtro sin valor no filtra —y está bien que no lo haga—, pero
               si se ve igual que los demás parece que sí. En gris se lee lo
               que es: escrito a medias, todavía sin efecto. */
            const inerte = !opDef?.sinValor && !String(f.val || "").trim();
            return (
              <div key={i} className={`tv-filtro${inerte ? " tv-inerte" : ""}`}>
                {conector && <span className="tv-conector">{conector}</span>}
                <select className="hf-sel" value={f.col}
                  onChange={e => setFiltros(s => s.map((x, j) => j === i
                    ? { col: e.target.value, op: OPS[columnas.find(c2 => c2.key === e.target.value)?.tipo || "texto"][0].op, val: "" }
                    : x))}>
                  {columnas.map(c2 => <option key={c2.key} value={c2.key}>{c2.lbl}</option>)}
                </select>
                <select className="hf-sel" value={f.op}
                  onChange={e => setFiltros(s => s.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}>
                  {ops.map(o => <option key={o.op} value={o.op}>{o.lbl}</option>)}
                </select>
                {!opDef?.sinValor && (
                  c?.tipo === "opcion" && c.opciones?.length ? (
                    <select className="hf-sel" value={f.val || ""}
                      onChange={e => setFiltros(s => s.map((x, j) => j === i ? { ...x, val: e.target.value } : x))}>
                      <option value="">—</option>
                      {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="ent-lote-inp" style={{ width: 170 }}
                      type={c?.tipo === "fecha" ? "date" : "text"}
                      value={f.val || ""} placeholder="valor…"
                      onChange={e => setFiltros(s => s.map((x, j) => j === i ? { ...x, val: e.target.value } : x))} />
                  )
                )}
                <button className="vtab" onClick={() => setFiltros(s => s.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          <button className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12 }}
            onClick={() => setFiltros(s => [...s, { col: columnas[0].key, op: OPS[columnas[0].tipo][0].op, val: "" }])}>
            + Añadir filtro
          </button>
        </div>
      )}

      {panel === "orden" && (
        <div className="card tv-panel">
          <div className="tv-panel-h">Ordenar por</div>
          <div className="tv-filtro">
            <select className="hf-sel" value={orden?.col || ""}
              onChange={e => setOrden(e.target.value ? { col: e.target.value, asc: orden?.asc ?? true } : null)}>
              <option value="">— sin ordenar —</option>
              {columnas.map(c => <option key={c.key} value={c.key}>{c.lbl}</option>)}
            </select>
            {orden && (
              <button className="vtab" onClick={() => setOrden({ ...orden, asc: !orden.asc })}>
                {orden.asc ? "↑ de menor a mayor" : "↓ de mayor a menor"}
              </button>
            )}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
              También se ordena haciendo clic en el título de una columna.
            </span>
          </div>
        </div>
      )}

      {panel === "vistas" && (
        <div className="card tv-panel">
          <div className="tv-panel-h">
            {vistaId ? "Actualizar esta vista, o guardarla como otra" : "Guardar esta configuración"}
          </div>
          <div className="tv-filtro">
            <input className="ent-lote-inp" style={{ width: 240 }} placeholder="Nombre de la vista…"
              value={nombre} onChange={e => setNombre(e.target.value)} />
            <label className="tv-chk">
              <input type="checkbox" checked={compartida} onChange={e => setCompartida(e.target.checked)} />
              compartida con el equipo
            </label>
            <button className="btn" disabled={ocupado} onClick={() => guardar(false)}>
              {vistaId ? "Actualizar" : "Guardar"}
            </button>
            {vistaId && (
              <>
                <button className="btn btn-ghost" disabled={ocupado} onClick={() => guardar(true)}>Guardar como nueva</button>
                <button className="btn btn-ghost" disabled={ocupado} onClick={borrar}
                  style={{ color: "var(--red)" }}>Borrar</button>
              </>
            )}
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("⚠") ? "var(--red)" : "var(--green)" }}>{msg}</span>}
          </div>
        </div>
      )}

      <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "8px 0 4px" }}>
        {datos.length} de {filas.length} filas
        {orden && <> · ordenado por <b>{columnas.find(c => c.key === orden.col)?.lbl}</b> {orden.asc ? "↑" : "↓"}</>}
        {/* Cuántos de los que estás viendo AHORA ya están dentro. El total sin
            filtrar no dice nada; lo que se quiere saber es si el filtro que
            acabas de escribir trae gente nueva o los mismos de siempre. */}
        {seleccion && yaAqui > 0 && (
          <> · <b style={{ color: "var(--green)" }}>{yaAqui}</b> ya {yaAqui === 1 ? "está" : "están"}</>
        )}
      </div>

      <div className="tv-scroll">
        <table className="tv-tabla">
          <thead>
            <tr>
              {/* La acción va DELANTE del nombre. Detrás obligaría a recorrer
                  la fila entera —y con scroll horizontal, a buscarla fuera de
                  pantalla— justo en el gesto que se repite veinte veces. */}
              {seleccion && <th className="tv-sel-th" />}
              {visibles.map(c => (
                <th key={c.key} onClick={() => cambiarOrden(c.key)} title="Clic para ordenar"
                  className={orden?.col === c.key ? "orden-on" : ""}
                  style={{ minWidth: c.ancho || 120 }}>
                  {c.lbl}
                  <span className="tv-th-ord">{orden?.col === c.key ? (orden.asc ? "↑" : "↓") : "↕"}</span>
                </th>
              ))}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {datos.map((f, i) => {
              const ya = seleccion ? yaSet.has(f.id) : false;
              return (
              <tr key={f.id || i} className={ya ? "tv-ya" : ""}>
                {seleccion && (
                  <td className="tv-sel-td">
                    {ya
                      /* Marcado, no oculto y no apagado. Quien ya está sigue
                         siendo parte de la respuesta a «¿a quién tengo?» —y si
                         desapareciera al añadirlo, el clic parecería un error. */
                      ? <span className="tv-ya-chk" title={seleccion.yaTxt || "Ya está en la lista"}>✔</span>
                      : <button className="tv-add" disabled={seleccion.ocupado}
                          title={seleccion.addTxt || "Sumar"}
                          onClick={() => seleccion.onElegir(f)}>＋</button>}
                  </td>
                )}
                {visibles.map((c, j) => (
                  <td key={c.key}>
                    {j === 0
                      ? <span className="tv-primera">
                          {/* `foto_url` solo existe en personas; en empresas el
                              Avatar cae a las iniciales, que es lo correcto —el
                              logo vive en `entidad_media` y traerlo aquí sería
                              una consulta más por una miniatura de 22px. */}
                          <Avatar nombre={f.nombre} src={f.foto_url} size={22} />
                          {/* Eligiendo, la tabla vive dentro de un pop-up sobre
                              otra pantalla: seguir el enlace en la misma
                              pestaña tiraría el trabajo a medias —los filtros
                              escritos y los que ya llevabas sumados—. */}
                          <Link href={hrefDe(f)} {...(seleccion ? { target: "_blank" } : {})}>
                            {c.valor ? c.valor(f) : f[c.key]}
                          </Link>
                        </span>
                      : pinta(c, f)}
                  </td>
                ))}
                <td>
                  <Link href={hrefDe(f)} className="tv-ir" title="Abrir la ficha"
                    {...(seleccion ? { target: "_blank" } : {})}>→</Link>
                </td>
              </tr>
              );
            })}
            {datos.length === 0 && (
              <tr><td colSpan={visibles.length + (seleccion ? 2 : 1)} className="tv-vacio" style={{ padding: 18 }}>
                Ninguna fila pasa estos filtros.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
