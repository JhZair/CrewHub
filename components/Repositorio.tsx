"use client";
import { guardarObjeto, borrarObjeto } from "@/app/actions";
import LinkVerificable from "@/components/LinkVerificable";
import FormObjeto, { OBJETO_VACIO } from "@/components/FormObjeto";
import MiniObjeto from "@/components/MiniObjeto";
import VistaObjeto from "@/components/VistaObjeto";
import TextoCorto from "@/components/TextoCorto";
import { icoObjeto, lblObjeto, ordenObjeto } from "@/lib/objetos";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* 📚 REPOSITORIO — todo lo que se sabe de una entidad y no cabe en su ficha.
   Obras, investigaciones, prensa, premios, redes, notas. Agrupado por tipo,
   con el verificador de links por objeto para que no se vuelva un cementerio
   de enlaces muertos. Los CVs tienen sección aparte (su enfoque se cruza con
   el cargo de cada postulación), aunque vivan en la misma tabla. */

const fmt = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
/* `creado_en` es un timestamp, no una fecha: se formatea aparte (sin el
   T12:00 que necesitan las columnas `date`). */
const fmtHora = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

/** «agregado por JohnO · 22 jul. 2026» — en un solo sitio, se usa dentro y
    fuera del sello según el objeto tenga link o no. */
const procedencia = (o: { autor?: string | null; creado_en?: string | null }) =>
  `agregado${o.autor ? ` por ${o.autor}` : ""}${o.creado_en ? ` · ${fmtHora(o.creado_en)}` : ""}`;

/** A qué apunta y qué se movió encima. Solo se pintan los que existen: una
    fila de ceros no informa, estorba. */
function Chips({ o }: { o: Obj }) {
  return (
    <>
      {!!o.n_vinculos && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>🔗 {o.n_vinculos}</span>}
      {!!o.n_comentarios && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>💬 {o.n_comentarios}</span>}
      {!!o.n_casos && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>🗂 {o.n_casos}</span>}
    </>
  );
}

type Obj = {
  id: string; tipo: string; titulo: string;
  url?: string | null; fecha?: string | null; notas?: string | null;
  creado_en?: string | null;
  /** Alias de quien lo agregó, ya resuelto en el servidor. */
  autor?: string | null;
  /** Contexto, contado en el servidor: a qué apunta, y qué se movió encima. */
  n_vinculos?: number;
  n_comentarios?: number;
  n_casos?: number;
};

const VACIO = OBJETO_VACIO;

export default function Repositorio({ entidadTipo, entidadId, objetos, verif }: {
  entidadTipo: string; entidadId: string;
  objetos: Obj[];
  /** Verificaciones de link, indexadas por `objeto:<id>`. */
  verif: Record<string, { url: string; por?: string | null; en?: string | null; correcto?: boolean }>;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...VACIO });
  const [abierto, setAbierto] = useState(false);
  const [plegado, setPlegado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");

  const limpiar = () => { setF({ ...VACIO }); setAbierto(false); setError(""); };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true); setError("");
    const r: any = await guardarObjeto({
      id: f.id || null, entidadTipo, entidadId,
      tipo: f.tipo, titulo: f.titulo, url: f.url, fecha: f.fecha, notas: f.notas,
    });
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    limpiar(); router.refresh();
  };

  const quitar = async (id: string) => {
    const r: any = await borrarObjeto(id, entidadTipo, entidadId);
    setBorrando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };

  const editar = (o: Obj) => {
    setF({
      id: o.id, tipo: o.tipo, titulo: o.titulo,
      url: o.url || "", fecha: o.fecha || "", notas: o.notas || "",
    });
    setAbierto(true);
  };

  // Agrupado por tipo, en el orden de la lista (no alfabético: la lista tiene
  // un orden pensado, de lo que más pesa a lo que menos).
  const grupos = [...new Set(objetos.map(o => o.tipo))]
    .sort((a, b) => ordenObjeto(a) - ordenObjeto(b))
    .map(t => ({ tipo: t, items: objetos.filter(o => o.tipo === t) }));

  return (
    /* El margen superior va en CSS, no aquí: un estilo en línea gana a
       cualquier selector, así que la regla que alinea el arranque de las dos
       columnas de la ficha (`.perfil-grid > main > :first-child`) no podía
       anularlo y la columna ancha se quedaba 14 px por debajo del carné. */
    <div className="linked repo">
      {/* PLEGABLE. Con tres objetos el panel ya ocupa media pantalla y empuja
          hacia abajo todo lo demás de la ficha; con quince es una página
          entera de material dentro de otra página. El título dice cuántos hay,
          que es lo que se necesita saber cuando está cerrado. */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: plegado ? 0 : 8 }}>
        <button className="repo-toggle" onClick={() => setPlegado(p => !p)}
          title={plegado ? "Mostrar el repositorio" : "Plegar el repositorio"}>
          <span className="repo-flecha">{plegado ? "▸" : "▾"}</span>
          📚 Repositorio · {objetos.length}
        </button>
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => { setPlegado(false); setAbierto(true); }}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {abierto && (
        <FormObjeto f={f} setF={setF} error={error} guardando={guardando}
          onCancelar={limpiar} onGuardar={guardar} />
      )}

      {!plegado && grupos.map(g => (
        <div key={g.tipo} className="repo-grupo">
          <div className="repo-grupo-h">{icoObjeto(g.tipo)} {lblObjeto(g.tipo)} · {g.items.length}</div>
          {g.items.map(o => (
            /* Fila estilo lista de videos: la imagen a la izquierda y a tamaño
               real, el texto a la derecha. En un repositorio audiovisual la
               portada identifica el objeto más rápido que el título. */
            <div key={o.id} className="repo-fila">
              <div className="repo-fila-top">
              <MiniObjeto url={o.url} ico={icoObjeto(o.tipo)} />
              <div className="repo-fila-cuerpo">
              <div className="repo-cab">
                {/* Se abre en un pop-up para verlo y conversar al vuelo, sin
                    salir de la ficha; «Abrir completo» lleva a su página. */}
                <VistaObjeto objetoId={o.id}>
                  {abrir => (
                    <button type="button" className="repo-tit" onClick={abrir}><b>{o.titulo}</b></button>
                  )}
                </VistaObjeto>
                {o.fecha && <span className="repo-fecha">{fmt(o.fecha)}</span>}
                <span style={{ flex: 1 }} />
                <button className="dato-btn" title="Editar" onClick={() => editar(o)}>✎</button>
                {borrando === o.id ? (
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(o.id)}>sí</button>
                    {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
                  </span>
                ) : (
                  <button style={{ color: "var(--dim)" }} title="Quitar" onClick={() => setBorrando(o.id)}>✕</button>
                )}
              </div>
              {o.notas && <TextoCorto texto={o.notas} corte={220} className="repo-notas" />}
              </div>
              </div>

              {/* EL SELLO, A TODO EL ANCHO DE LA FILA — fuera de la columna de
                  texto. Metido junto al título tenía el ancho descontando los
                  176 px de la miniatura, y sus cinco piezas se partían en dos
                  renglones. Abajo, de borde a borde, entran holgadas.
                  Los chips 🔗💬🗂 viajan dentro: son contexto del mismo tipo
                  —qué se sabe de esto— y tenían su propia fila para nada. */}
              {o.url ? (
                <LinkVerificable franja tipo={entidadTipo} id={entidadId} campo={`objeto:${o.id}`}
                  url={o.url} etiqueta={lblObjeto(o.tipo)} icono={icoObjeto(o.tipo)}
                  verif={verif[`objeto:${o.id}`]} origen={procedencia(o)}
                  extra={<Chips o={o} />} />
              ) : (
                /* Una nota puede no tener link, y entonces no hay nada que
                   verificar: queda solo la procedencia. */
                <div className="repo-item-pie">
                  <span className="repo-pie">{procedencia(o)}</span>
                  <span className="repo-item-chips"><Chips o={o} /></span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {!objetos.length && !abierto && !plegado && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Vacío. Aquí va lo que no cabe en la ficha: obras, investigaciones, prensa, premios, redes, notas.
        </div>
      )}
    </div>
  );
}
