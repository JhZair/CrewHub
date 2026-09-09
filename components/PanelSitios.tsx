"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { crearSitio, renombrarSitio, moverSitio, borrarSitio } from "@/app/equipamiento/acciones";
import { textoDeRuta, resolvedorDeGuardado, type Sitio, type EqGuardable } from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   📍 SITIOS — LA PREGUNTA AL REVÉS

   Las otras pantallas contestan «¿dónde se guarda esto?». Esta contesta «¿qué
   hay en el Cajón 07?», que es la que se hace con el cajón delante: se abre
   para ver si está todo, o para meter algo y saber qué más había.

   ── DOS NÚMEROS POR SITIO, Y NO UNO ──
   «2 · 30» quiere decir dos cosas colgando directamente —dos bolsos— y treinta
   contando lo que va dentro de ellos. Un solo número no puede decir las dos:
   con «2» nadie encuentra el trípode que está en el bolso; con «30» abrir el
   cajón y ver dos cosas parece un error.

   ── LO QUE NO TIENE SITIO, TAMBIÉN ES UNA RESPUESTA ──
   El bloque de abajo es el que hace que esto sirva de algo: una lista de
   sitios bonita sobre un inventario donde cuatrocientos equipos no tienen
   ninguno da la impresión de que el dato está puesto. El número de lo que
   falta va arriba del todo por eso mismo.
   ══════════════════════════════════════════════════════════════════════════ */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type EqEnSitio = EqGuardable & {
  categoria?: string | null;
  estado?: string | null;
};

export default function PanelSitios({ sitios, equipos, kits, cortado }: {
  sitios: Sitio[];
  equipos: EqEnSitio[];
  kits: { id: string; nombre: string; guardado_sitio?: string | null; guardado_en_equipo?: string | null }[];
  cortado: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEd, setNombreEd] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [aviso, setAviso] = useState("");

  const resolver = useMemo(() => resolvedorDeGuardado(sitios, equipos), [sitios, equipos]);

  /* Qué cuelga de cada sitio: las listas y los números, en UN solo recorrido.
     `lib/sitios` llegó a tener un `contarPorSitio` que devolvía solo las
     cifras; se quitó al escribir esto, porque pintar la lista obliga a
     recorrer igual y tener las dos cosas separadas es tener dos criterios de
     «qué cuenta como estar aquí» que se van a separar. */
  const contenido = useMemo(() => {
    const m = new Map<string, { directo: EqEnSitio[]; total: number; kits: typeof kits }>();
    sitios.forEach(s => m.set(s.id, { directo: [], total: 0, kits: [] }));
    for (const e of equipos) {
      const g = resolver.de(e.id);
      const enRuta = g.ruta.filter(t => t.tipo === "sitio");
      if (!enRuta.length) continue;
      /* Directo solo si NO hay un bolso de por medio: en el cajón está el
         bolso, y dentro del bolso la cámara. */
      const hayBolso = g.ruta.some(t => t.tipo === "equipo");
      const cercano = enRuta[enRuta.length - 1];
      if (!hayBolso) m.get(cercano.id)?.directo.push(e);
      enRuta.forEach(t => { const x = m.get(t.id); if (x) x.total++; });
    }
    for (const k of kits) {
      const g = resolver.deKit(k);
      const enRuta = g.ruta.filter(t => t.tipo === "sitio");
      if (enRuta.length) m.get(enRuta[enRuta.length - 1].id)?.kits.push(k);
    }
    return m;
  }, [sitios, equipos, kits, resolver]);

  /* Lo que NO tiene sitio: ni propio, ni heredado de nadie. `origen: "ninguno"`
     ya lo dice; los rotos y los bucles van aparte porque el arreglo es otro. */
  const sinSitio = useMemo(
    () => equipos.filter(e => resolver.de(e.id).origen === "ninguno"),
    [equipos, resolver],
  );
  const conProblema = useMemo(
    () => equipos.filter(e => { const g = resolver.de(e.id); return g.roto || g.bucle; }),
    [equipos, resolver],
  );

  const hijosDe = useMemo(() => {
    const m = new Map<string | null, Sitio[]>();
    sitios.forEach(s => {
      const k = s.dentro_de || null;
      m.set(k, [...(m.get(k) || []), s]);
    });
    m.forEach(v => v.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    return m;
  }, [sitios]);

  const casa = (s: Sitio) => {
    const ps = nrm(q).split(/\s+/).filter(Boolean);
    if (!ps.length) return true;
    const dentro = contenido.get(s.id);
    const txt = nrm([s.nombre, ...(dentro?.directo || []).map(e => `${e.folio || ""} ${e.nombre}`),
      ...(dentro?.kits || []).map(k => k.nombre)].join(" "));
    return ps.every(p => txt.includes(p));
  };

  async function correr(fn: () => Promise<any>, alTerminar?: (r: any) => void) {
    setOcupado(true); setErr(""); setAviso("");
    try {
      const r = await fn();
      if (r?.error) { setErr(r.error); return; }
      alTerminar?.(r);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "No se pudo completar.");
    } finally { setOcupado(false); }
  }

  const alterna = (id: string) => setAbiertos(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  /* ── UN SITIO Y LOS SUYOS, RECURSIVO ──
     El sangrado va por nivel, igual que en el árbol de ensamblados y por el
     mismo motivo: las flechas alineadas se pueden recorrer con la vista. */
  const pintaSitio = (s: Sitio, nivel: number): React.ReactNode => {
    const hijos = hijosDe.get(s.id) || [];
    const dentro = contenido.get(s.id) || { directo: [], total: 0, kits: [] };
    const visible = casa(s) || hijos.some(h => casa(h));
    if (!visible) return null;
    const abierta = !!q || abiertos.has(s.id);
    const enEd = editando === s.id;

    return (
      <Fragment key={s.id}>
        <div className="sit-fila">
          {nivel > 0 && <span className="sit-sangria" style={{ width: nivel * 18 }} aria-hidden />}
          {/* ⚠ Editando, el `<button>` NO se pinta. Estuvo con el `<input>`
              dentro: un campo de texto dentro de un botón es HTML inválido
              —contenido interactivo anidado— y además cada clic para poner el
              cursor plegaba el sitio. Se cambia la fila entera, que es lo que
              de verdad cambia de modo. */}
          {enEd ? (
            <span className="sit-plegar">
              <span className="panel-flecha" aria-hidden>▾</span>
              <span className="sit-ico" aria-hidden>📍</span>
              <input className="ent-lote-inp" autoFocus value={nombreEd}
                onChange={e => setNombreEd(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") correr(() => renombrarSitio(s.id, nombreEd), () => setEditando(null));
                  if (e.key === "Escape") setEditando(null);
                }}
                style={{ maxWidth: 260 }} />
            </span>
          ) : (
            <button type="button" className="sit-plegar" aria-expanded={abierta}
              onClick={() => alterna(s.id)}
              title={abierta ? `Ocultar lo que hay en «${s.nombre}»` : `Ver lo que hay en «${s.nombre}»`}>
              <span className="panel-flecha" aria-hidden>{abierta ? "▾" : "▸"}</span>
              <span className="sit-ico" aria-hidden>📍</span>
              <b className="sit-nom">{s.nombre}</b>
            </button>
          )}
          {/* Los dos números. En gris el total cuando coincide con el directo:
              repetir «3 · 3» es ruido en una lista de veinte cajones. */}
          <span className="sit-cifras">
            {dentro.directo.length + dentro.kits.length}
            {dentro.total !== dentro.directo.length && (
              <span className="sit-total"> · {dentro.total} dentro</span>
            )}
          </span>
          <span className="spacer" />
          {enEd ? (
            <>
              <button type="button" className="dato-btn" disabled={ocupado}
                onClick={() => correr(() => renombrarSitio(s.id, nombreEd), () => setEditando(null))}>
                guardar
              </button>
              <button type="button" className="dato-btn" onClick={() => setEditando(null)}>cancelar</button>
            </>
          ) : (
            <>
              <button type="button" className="dato-btn"
                onClick={() => { setEditando(s.id); setNombreEd(s.nombre); }}>renombrar</button>
              {/* ⚠ Mover DENTRO y no solo «sacar». Con el botón solo, la
                  jerarquía se podía deshacer pero no construir: los sitios
                  anidados solo existirían si los creaba la migración. Un
                  `select` y no un buscador: son los sitios que hay, y son
                  pocos — un desplegable de veinte no necesita filtro.
                  La opción de sacar es el valor vacío del mismo control, para
                  que meter y sacar no sean dos sitios distintos. */}
              {otrosSitios.length > 0 && (
                <select className="ent-select sit-dentrode" disabled={ocupado}
                  value={s.dentro_de || ""}
                  title="Dentro de qué sitio está este"
                  onChange={e => correr(() => moverSitio(s.id, e.target.value || null))}>
                  <option value="">— suelto —</option>
                  {otrosSitios.filter(o => o.id !== s.id).map(o => (
                    <option key={o.id} value={o.id}>dentro de {o.nombre}</option>
                  ))}
                </select>
              )}
              <button type="button" className="dato-btn" disabled={ocupado}
                style={{ color: "var(--red)" }}
                onClick={() => {
                  const n = dentro.directo.length + dentro.kits.length + hijos.length;
                  if (n && !confirm(
                    `Borrar «${s.nombre}». Nada se borra con él, pero ${dentro.directo.length} equipo(s) y `
                    + `${dentro.kits.length} kit(s) se quedan SIN SITIO, y ${hijos.length} sitio(s) que estaban `
                    + `dentro pasan a estar sueltos. ¿Sigo?`)) return;
                  correr(() => borrarSitio(s.id), (r: any) =>
                    setAviso(`Borrado. Se quedaron sin sitio ${r.equipos} equipo(s) y ${r.kits} kit(s); `
                      + `${r.sitios} sitio(s) pasaron a estar sueltos.`));
                }}>borrar</button>
            </>
          )}
        </div>

        {abierta && (dentro.directo.length > 0 || dentro.kits.length > 0) && (
          <div className="sit-dentro" style={{ marginLeft: (nivel + 1) * 18 + 22 }}>
            {dentro.kits.map(k => (
              <div key={k.id} className="sit-cosa">
                <span aria-hidden>🧰</span> <span className="sit-cosa-n">{k.nombre}</span>
                <span className="sit-cosa-t">kit</span>
              </div>
            ))}
            {dentro.directo.map(e => {
              const g = resolver.de(e.id);
              /* Lo que este equipo lleva DENTRO se cuenta con la cadena, no con
                 una segunda consulta: `total` menos lo directo es exactamente
                 lo que cuelga de los bolsos que hay aquí. */
              return (
                <div key={e.id} className="sit-cosa">
                  {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                  <Link href={`/entidad/equipamiento/${e.id}`} className="sit-cosa-n">{e.nombre}</Link>
                  {g.ruta.some(t => t.tipo === "equipo") && (
                    <span className="sit-cosa-t">{textoDeRuta(g.ruta)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {abierta && hijos.map(h => pintaSitio(h, nivel + 1))}
      </Fragment>
    );
  };

  const raices = hijosDe.get(null) || [];
  /* Para el desplegable de «dentro de». Los DESCENDIENTES no se filtran aquí:
     `moverSitio` sube la cadena y lo rechaza con una frase que explica por qué,
     y filtrarlos pediría recorrer el árbol por cada fila para quitar opciones
     que casi nadie va a elegir. El que sí se quita es él mismo, que es el error
     evidente. */
  const otrosSitios = sitios;

  return (
    <>
      {/* ── LO QUE FALTA, ARRIBA ──
          Una lista de sitios sobre un inventario donde cuatrocientos equipos no
          tienen ninguno da la impresión de que el dato ya está puesto. */}
      {(sinSitio.length > 0 || conProblema.length > 0) && (
        <div className="card sit-faltan">
          {sinSitio.length > 0 && (
            <div>
              <b style={{ color: "var(--yellow)", fontSize: 13 }}>
                ⚠ {sinSitio.length} equipo(s) sin sitio anotado
              </b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                Ni propio ni heredado de un bolso. Se anota desde la ficha de
                cada uno, en el bloque 📍.
              </div>
            </div>
          )}
          {conProblema.length > 0 && (
            <div style={{ marginTop: sinSitio.length ? 10 : 0 }}>
              <b style={{ color: "var(--red)", fontSize: 13 }}>
                ⚠ {conProblema.length} con la cadena rota o en bucle
              </b>
              <div className="sit-rotos">
                {conProblema.slice(0, 20).map(e => (
                  <Link key={e.id} href={`/entidad/equipamiento/${e.id}`} className="sit-roto">
                    {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                    {e.nombre}
                  </Link>
                ))}
                {conProblema.length > 20 && (
                  <span className="sit-cosa-t">y {conProblema.length - 20} más</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {cortado && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ La lista llegó al tope</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Se leyeron los primeros mil equipos o sitios, así que estas cuentas
            van cortas y alguno puede salir como «apunta a algo que no está».
            No es la base: es esta lista.
          </div>
        </div>
      )}

      <div className="card">
        <div className="ens-cab">
          <b style={{ fontSize: 14 }}>📍 {sitios.length} sitio{sitios.length === 1 ? "" : "s"}</b>
          <span className="spacer" />
          <input className="ent-lote-inp" placeholder="Buscar un sitio, o algo que esté dentro…"
            value={q} onChange={e => setQ(e.target.value)} />
          <input className="ent-lote-inp" placeholder="Nuevo sitio…" value={nuevo}
            onChange={e => setNuevo(e.target.value)} style={{ maxWidth: 180 }} />
          <button type="button" className="btn" disabled={ocupado || !nuevo.trim()}
            onClick={() => correr(() => crearSitio(nuevo.trim()), () => setNuevo(""))}>
            ＋ Sitio
          </button>
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
        {aviso && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>{aviso}</div>}

        {!sitios.length && (
          <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 10, lineHeight: 1.55 }}>
            No hay sitios todavía. Un sitio es un mueble o un estante —«Cajón
            07», «Depósito»—, no un bolso: los bolsos son equipos y ya están en
            el inventario, así que una cosa se guarda «en el Bolso Tenba» y el
            Bolso Tenba se guarda «en el Cajón 08».
          </div>
        )}

        <div className="sit-arbol">{raices.map(s => pintaSitio(s, 0))}</div>
      </div>
    </>
  );
}
