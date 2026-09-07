"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarObraMusical, quitarObraMusical } from "@/app/musica/acciones";
import { ROTULO_ESTADO_AUT, type EstadoAutorizacion } from "@/lib/clearance";
import {
  ORIGENES, META_ORIGEN, ROTULO_CAMPO, MAX_CAMPO, PLANES, ROTULO_PLAN,
  origenDe, pegasDe, gravedadDe, llevaPersona, COLOR_GRAVEDAD,
  type FilaObra, type Origen, type PlanIA, type MapaPermisos,
} from "@/lib/obrasMusicales";

/* ══════════════════════════════════════════════════════════════════════════
   LA MÚSICA DE UNA PELÍCULA — la lista y el formulario

   ── EL FORMULARIO CAMBIA SEGÚN EL ORIGEN ──
   Es lo único importante de este componente. Un formulario con los catorce
   campos siempre visibles pide el ISWC de un tema de Suno —que no lo tiene— y
   el prompt de un huayno tradicional. Cada origen enseña SUS campos, y la
   lista de cuáles son vive en `lib/obrasMusicales`, no aquí: la pantalla no es
   sitio para una regla que también usa el recuento.

   ── EL PANEL VA EN FLUJO ──
   ⚠ Con `position:absolute` desaparecería dentro de cualquier contenedor con
   `overflow:hidden`, y eso ya pasó dos veces en este proyecto: se abría, no se
   veía nada, y parecía que el botón estaba roto.

   ── LAS FILAS SE PINTAN CON UNA FUNCIÓN, NO CON UN COMPONENTE ──
   ⚠ Un componente definido dentro del render es un tipo nuevo en cada pasada:
   React desmonta y vuelve a montar, y el campo que estabas escribiendo pierde
   lo escrito y el foco. Ya costó una tanda averiguarlo.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que la pantalla sabe del reparto: quién está y qué permisos de música
 *  tiene, para poder atar la obra al papel que ya existe. */
export type PersonaReparto = {
  id: string;
  nombre: string;
  /** Solo los permisos de música de esa persona. La de imagen no autoriza que
   *  suene su tema, y ofrecerla aquí invitaría a atar el papel equivocado. */
  permisos: { id: string; obra?: string | null; estado?: string | null }[];
};

type Borrador = {
  id?: string;
  titulo: string; origen: Origen;
  personaId: string; autorizacionId: string;
  autor: string; iswc: string;
  consultadoEn: string; consultadoNota: string;
  pruebaUrl: string; vigenteHasta: string;
  herramienta: string; planIa: string; prompt: string; aporteHumano: string;
  resueltoComo: string; donde: string; nota: string;
};

const VACIO: Borrador = {
  titulo: "", origen: "dominio_publico",
  personaId: "", autorizacionId: "",
  autor: "", iswc: "", consultadoEn: "", consultadoNota: "",
  pruebaUrl: "", vigenteHasta: "",
  herramienta: "", planIa: "", prompt: "", aporteHumano: "",
  resueltoComo: "", donde: "", nota: "",
};

const deFila = (o: FilaObra): Borrador => ({
  id: o.id,
  titulo: o.titulo || "", origen: origenDe(o),
  personaId: o.persona_id || "", autorizacionId: o.autorizacion_id || "",
  autor: o.autor || "", iswc: o.iswc || "",
  consultadoEn: o.consultado_en || "", consultadoNota: o.consultado_nota || "",
  pruebaUrl: o.prueba_url || "", vigenteHasta: o.vigente_hasta || "",
  herramienta: o.herramienta || "", planIa: o.plan_ia || "",
  prompt: o.prompt || "", aporteHumano: o.aporte_humano || "",
  resueltoComo: o.resuelto_como || "", donde: o.donde || "", nota: o.nota || "",
});

/** Los campos que se escriben en una caja alta. El prompt y el aporte humano
 *  son párrafos; el resto cabe en una línea. */
const AREAS = new Set(["prompt", "aporteHumano", "consultadoNota", "resueltoComo", "nota"]);

/** De la columna de la base al campo del borrador. La lista de campos por
 *  origen habla en nombres de columna —es lo que guarda la base— y el
 *  formulario en camelCase. Un solo mapa, aquí. */
const CAMPO: Record<string, keyof Borrador> = {
  autor: "autor", iswc: "iswc",
  consultado_en: "consultadoEn", consultado_nota: "consultadoNota",
  prueba_url: "pruebaUrl", vigente_hasta: "vigenteHasta",
  herramienta: "herramienta", plan_ia: "planIa", prompt: "prompt",
  aporte_humano: "aporteHumano", resuelto_como: "resueltoComo",
};

export default function ObrasProyecto({
  proyectoId, obras, reparto = [], permisos, permisosFallaron = false, hoy,
}: {
  proyectoId: string;
  obras: FilaObra[];
  reparto?: PersonaReparto[];
  /** Los permisos por id, para poder mirar su ESTADO. Que el vínculo exista no
   *  dice nada: un permiso nace «sin empezar», y una obra atada a un permiso sin
   *  firmar no está resuelta por mucho que el id esté puesto. */
  permisos?: MapaPermisos | null;
  /** Si la consulta de permisos falló. Entonces se calla en vez de acusar: una
   *  lista vacía por fallo diría que nadie ha firmado nada. */
  permisosFallaron?: boolean;
  /** El día de hoy en Lima, calculado en el servidor. ⚠ No se usa `new Date()`
   *  aquí: a partir de las 7 de la tarde en Perú ya sería mañana, y una
   *  licencia se daría por vencida un día antes. */
  hoy: string;
}) {
  const router = useRouter();
  const [b, setB] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [quitando, setQuitando] = useState<string | null>(null);

  const set = (k: keyof Borrador, v: string) =>
    setB(x => (x ? { ...x, [k]: v } : x));

  const abrirNueva = () => {
    /* ⚠ `quitando` se limpia SIEMPRE al abrir. Sin esto, cerrar el panel con un
       «¿quitar?» a medias hacía que la próxima vez apareciera con el botón
       destructivo ya armado, por una interacción abandonada. */
    setQuitando(null); setError(""); setB({ ...VACIO });
  };
  const abrirEdicion = (o: FilaObra) => {
    setQuitando(null); setError(""); setB(deFila(o));
  };
  const cerrar = () => { setB(null); setError(""); setQuitando(null); };

  const guardar = async () => {
    if (!b || ocupado) return;
    setOcupado(true); setError("");
    let r: any;
    try {
      r = await guardarObraMusical(proyectoId, {
        id: b.id, titulo: b.titulo, origen: b.origen,
        personaId: b.personaId || null, autorizacionId: b.autorizacionId || null,
        autor: b.autor, iswc: b.iswc,
        consultadoEn: b.consultadoEn, consultadoNota: b.consultadoNota,
        pruebaUrl: b.pruebaUrl, vigenteHasta: b.vigenteHasta,
        herramienta: b.herramienta, planIa: b.planIa, prompt: b.prompt,
        aporteHumano: b.aporteHumano, resueltoComo: b.resueltoComo,
        donde: b.donde, nota: b.nota,
      });
    } catch (e: any) {
      /* Sin esto, un corte deja el botón en «…» para siempre y sin decir nada. */
      setOcupado(false);
      setError(`No hubo respuesta: ${e?.message || "se cortó"}. Recarga antes de repetir.`);
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    cerrar();
    router.refresh();
  };

  const quitar = async (id: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await quitarObraMusical(id, proyectoId);
    setOcupado(false); setQuitando(null);
    if (r?.error) { setError(r.error); return; }
    /* El panel se cierra: quedarse abierto sobre una fila que ya no existe
       invita a pulsar Guardar y recibir «ya no está». */
    cerrar();
    router.refresh();
  };

  /* ── LAS FILAS, ORDENADAS POR LO QUE LES FALTA ──
     Lo que no se puede usar arriba. Es a lo que se entra. */
  const PESO = { bloqueo: 0, falta: 1 } as Record<string, number>;
  /* Si los permisos no se pudieron leer se pasa `null`, y la regla entonces no
     dice ni que sí ni que no sobre el papel. Callar es mejor que acusar. */
  const mapaCes = permisosFallaron ? null : permisos;
  const ordenadas = [...obras].sort((x, y) => {
    const gx = gravedadDe(x, hoy, mapaCes), gy = gravedadDe(y, hoy, mapaCes);
    return (gx ? PESO[gx] : 2) - (gy ? PESO[gy] : 2)
      || (x.titulo || "").localeCompare(y.titulo || "", "es");
  });

  const persona = (id?: string | null) => reparto.find(p => p.id === id);

  const pintarFila = (o: FilaObra) => {
    const org = origenDe(o);
    const g = gravedadDe(o, hoy, mapaCes);
    const ps = pegasDe(o, hoy, mapaCes);
    const p = persona(o.persona_id);
    return (
      <div key={o.id} className="trt-fila">
        <div className="mus-top">
          <span className="mus-org" title={META_ORIGEN[org].largo}>
            {META_ORIGEN[org].ico} {META_ORIGEN[org].corto}
          </span>
          <span className="trt-nom">{o.titulo || "(sin título)"}</span>
          {g && (
            <span className="mus-marca" style={{ color: COLOR_GRAVEDAD[g] }}>
              {g === "bloqueo" ? "🚫 no se puede usar" : "⚠ falta"}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="trt-acc" disabled={ocupado}
            onClick={() => abrirEdicion(o)}>editar</button>
        </div>

        <div className="trt-pie">
          {o.autor && <span>{o.autor}</span>}
          {o.iswc && <span className="chip-tenue">{o.iswc}</span>}
          {o.herramienta && <span>{o.herramienta}</span>}
          {o.plan_ia && <span className="chip-tenue">plan {ROTULO_PLAN[o.plan_ia as PlanIA] || o.plan_ia}</span>}
          {p && <span>aporta {p.nombre}</span>}
          {/* Que el papel EXISTE, sin prometer que dice lo que hace falta. */}
          {o.prueba_url && (
            <a href={o.prueba_url} target="_blank" rel="noopener noreferrer"
              className="trt-doc">📎 el papel</a>
          )}
          {o.autorizacion_id && <span className="chip-tenue">🔗 atada a su permiso</span>}
          {o.consultado_en && <span>consultado el {o.consultado_en}</span>}
          {/* ⚠ La licencia se enseña SIEMPRE, no solo cuando ya venció. Antes
              solo aparecía como pega el día después de caducar, y una que
              caduca la semana que viene era invisible — que es justo cuando
              todavía se puede hacer algo. */}
          {o.vigente_hasta && (
            <span style={{ color: o.vigente_hasta < hoy ? "var(--red)" : undefined }}>
              vale hasta {o.vigente_hasta}
            </span>
          )}
          {o.donde && <span>{o.donde}</span>}
        </div>

        {/* Cada pega en su línea y con su color. Juntas en una sola frase, la
            que bloquea se lee como una más de la lista. */}
        {ps.map((pg, i) => (
          <div key={i} className="mus-pega" style={{ color: COLOR_GRAVEDAD[pg.gravedad] }}>
            {pg.gravedad === "bloqueo" ? "🚫" : "·"} {pg.txt}
          </div>
        ))}

        {o.consultado_nota && <div className="trt-nota">«{o.consultado_nota}»</div>}
        {/* ⚠ El prompt se guardaba, se pedía en el formulario y NO se enseñaba
            en ninguna parte: la única forma de leerlo era abrir «editar». Y es
            de lo que hay que poder repasar sin tocar nada — un prompt que
            nombra a un artista es el único escenario donde la música generada
            salpica de verdad. */}
        {o.prompt && <div className="trt-nota">Prompt: <i>{o.prompt}</i></div>}
        {o.aporte_humano && <div className="trt-nota">Aporte humano: {o.aporte_humano}</div>}
        {o.resuelto_como && <div className="trt-nota">Resuelto: {o.resuelto_como}</div>}
        {o.nota && <div className="trt-nota">{o.nota}</div>}
      </div>
    );
  };

  /* ── EL CAMPO, SEGÚN SU NOMBRE ──
     Una función y no un componente, por lo dicho en la cabecera. */
  const pintarCampo = (col: string) => {
    if (!b) return null;
    const k = CAMPO[col];
    if (!k) return null;
    const rot = ROTULO_CAMPO[col as keyof FilaObra];
    const val = String(b[k] ?? "");

    if (col === "plan_ia") {
      return (
        <label key={col} className="ces-l">
          <span>{rot?.txt}</span>
          <select value={val} onChange={e => set(k, e.target.value)}>
            <option value="">— elige el plan —</option>
            {PLANES.map(p => <option key={p} value={p}>{ROTULO_PLAN[p]}</option>)}
          </select>
        </label>
      );
    }
    if (col === "consultado_en" || col === "vigente_hasta") {
      return (
        <label key={col} className="ces-l">
          <span>{rot?.txt}</span>
          <input type="date" value={val} onChange={e => set(k, e.target.value)} />
        </label>
      );
    }
    /* ⚠ El tope REAL del campo, el mismo que usa el servidor. Con un 2000 fijo
       aquí, escribir 900 caracteres de «qué decía la ficha del catálogo» se
       guardaba recortado a 500 sin error y sin que se notara hasta recargar. */
    const max = MAX_CAMPO[col] ?? 200;
    if (AREAS.has(k)) {
      return (
        <label key={col} className="ces-l">
          <span>{rot?.txt}{rot?.pista ? ` — ${rot.pista}` : ""}</span>
          <textarea value={val} rows={2} maxLength={max}
            onChange={e => set(k, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={col} className="ces-l">
        <span>{rot?.txt}</span>
        <input value={val} maxLength={max} placeholder={rot?.pista || ""}
          onChange={e => set(k, e.target.value)} />
      </label>
    );
  };

  const yo = b ? persona(b.personaId) : undefined;

  return (
    <div className="mus">
      {obras.length ? ordenadas.map(pintarFila) : (
        <div className="trt-vacio">
          Todavía no hay ninguna obra apuntada. Va aquí <b>toda</b> la música que
          suena: la que compras, la que te ceden, la que suena sola en el lugar y
          la que genera una máquina.
        </div>
      )}

      {/* Sin `puedeEditar`: no hay roles en este sistema —el control es sesión
          + RLS— y el prop existía sin que nadie lo pasara nunca. Un permiso que
          siempre vale `true` no es un permiso, es una rama que nadie prueba. */}
      {!b && (
        <button type="button" className="btn btn-ghost trt-btn"
          style={{ marginTop: 10 }} onClick={abrirNueva}>＋ Obra musical</button>
      )}

      {b && (
        /* En FLUJO, no flotando: ver la nota de la cabecera. */
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>{b.id ? "Editar" : "Nueva"} obra musical</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={cerrar}>✕</button>
          </div>

          <label className="ces-l">
            <span>Cómo se llama en la película</span>
            <input value={b.titulo} maxLength={200} placeholder="Fatal Destino"
              onChange={e => set("titulo", e.target.value)} />
          </label>

          <label className="ces-l">
            <span>De dónde sale</span>
            <select value={b.origen}
              onChange={e => set("origen", e.target.value as Origen)}>
              {ORIGENES.map(o => (
                <option key={o} value={o}>{META_ORIGEN[o].ico} {META_ORIGEN[o].corto}</option>
              ))}
            </select>
          </label>

          {/* Qué es ese origen, dicho entero. Es lo que evita que «licenciada» y
              «biblioteca» se rellenen indistintamente. */}
          <div className="ces-ayuda">{META_ORIGEN[b.origen].largo}</div>

          {/* ⚠ Cambiar el origen a uno sin persona BORRA el vínculo al permiso,
              y el selector desaparece en cuanto lo cambias: sin este aviso se
              pierde el papel firmado por tocar un desplegable, sin ver lo que
              se está a punto de perder. Se avisa antes de guardar, que es
              cuando todavía se puede volver atrás. */}
          {b.id && !llevaPersona(b.origen) && (b.personaId || b.autorizacionId) && (
            <div className="ces-aviso">
              ⚠ Este origen no lleva persona detrás: al guardar se soltará
              {b.autorizacionId ? " el vínculo con su permiso y" : ""} quién la aporta.
              El papel no se borra —sigue en ⚖ clearance— pero esta obra
              dejará de apuntar a él.
            </div>
          )}

          {/* Solo los campos de ESTE origen. */}
          {META_ORIGEN[b.origen].campos.map(c => pintarCampo(String(c)))}

          {llevaPersona(b.origen) && (
            <>
              <label className="ces-l">
                <span>Quién la aporta — tiene que estar en el reparto</span>
                <select value={b.personaId}
                  onChange={e => {
                    /* Al cambiar de persona, el permiso atado deja de valer:
                       era de la otra. Sin esto se guardaría el papel de alguien
                       distinto y la acción lo rechazaría con un error que la
                       pantalla podía haber evitado. */
                    set("autorizacionId", "");
                    set("personaId", e.target.value);
                  }}>
                  <option value="">— nadie del reparto —</option>
                  {reparto.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>

              {yo && (
                /* Si la consulta de permisos falló, NO se dice que no tiene
                   ninguna: sería acusarla de aportar música sin autorizar por
                   un fallo del servidor, y no habría clic que lo apagara. */
                permisosFallaron ? (
                  <div className="ces-ayuda">
                    No se pudieron leer los permisos, así que no se puede ofrecer
                    ninguno para atar. Recarga cuando el aviso de arriba se vaya.
                  </div>
                ) : yo.permisos.length ? (
                  <label className="ces-l">
                    <span>Su permiso de interpretación — así las dos pantallas dicen lo mismo</span>
                    <select value={b.autorizacionId} onChange={e => set("autorizacionId", e.target.value)}>
                      <option value="">— sin atar —</option>
                      {yo.permisos.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.obra || "permiso de interpretación"}
                          {c.estado ? ` · ${ROTULO_ESTADO_AUT[c.estado as EstadoAutorizacion] || c.estado}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="ces-aviso">
                    ⚠ {yo.nombre} no tiene ningún permiso de interpretación registrado.
                    Regístraselo en ⚖ clearance —que es el único sitio donde se registran—:
                    sin él, esto dice que aporta música que no ha autorizado.
                  </div>
                )
              )}
            </>
          )}

          <label className="ces-l">
            <span>{ROTULO_CAMPO.donde?.txt} — {ROTULO_CAMPO.donde?.pista}</span>
            <input value={b.donde} maxLength={200}
              onChange={e => set("donde", e.target.value)} />
          </label>

          <label className="ces-l">
            <span>Nota</span>
            <textarea value={b.nota} rows={2} maxLength={1000} placeholder="opcional"
              onChange={e => set("nota", e.target.value)} />
          </label>

          {error && <div className="err-inline">⚠ {error}</div>}

          <div className="ces-pie">
            {b.id && (
              quitando === b.id ? (
                <span style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center" }}>
                  ¿quitar la obra?
                  <button className="ces-si" onClick={() => quitar(b.id!)}>sí</button>
                  <button className="ces-no" onClick={() => setQuitando(null)}>no</button>
                </span>
              ) : (
                <button className="ces-quitar" disabled={ocupado}
                  title="Borra el registro. Si la obra se cayó del montaje, mejor déjala con una nota: saber qué se descartó evita volver a buscarlo."
                  onClick={() => setQuitando(b.id!)}>Quitar</button>
              )
            )}
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
              disabled={ocupado} onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
