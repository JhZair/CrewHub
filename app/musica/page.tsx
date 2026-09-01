import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Plegable from "@/components/Plegable";
import Realtime from "@/components/Realtime";
import ObrasProyecto, { type PersonaReparto } from "@/components/ObrasProyecto";
import { createClient } from "@/lib/supabase/server";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";
import {
  diagnosticar, ordenarPeliculas, resumirDiagnostico, resumen,
  META_ORIGEN, META_FALTA_PELI,
  type FilaObra, type MapaCesiones,
} from "@/lib/obrasMusicales";
import { TIPOS_CON_GUION, peliculaViva } from "@/lib/tratamiento";

export const metadata: Metadata = { title: "🎵 Música" };

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ MÚSICA SUENA EN CADA PELÍCULA

   ── POR QUÉ UNA PANTALLA Y NO UN BLOQUE EN CADA FICHA ──
   Porque la pregunta que hace falta contestar no es «¿qué música lleva este
   documental?» sino «¿qué me falta aclarar antes de estrenar algo?», y esa
   cruza todas las películas. Diez temas repartidos en tres proyectos, mirados
   de uno en uno, son treinta clics y ninguna vista de conjunto.
   Es la misma razón por la que /guion existe, y por eso esta pantalla está
   calcada de aquélla: dos hermanas que se comportan distinto se leen como dos
   criterios distintos, y no lo son.

   ── EL MISMO CONJUNTO DE PELÍCULAS QUE EL GUION ──
   `TIPOS_CON_GUION` y `peliculaViva` se reutilizan a propósito. Si esta
   pantalla decidiera por su cuenta qué es una película, el día que alguien
   añada un tipo nuevo aparecería en una lista y no en la otra, sin que nada
   avise.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function IndiceMusica({
  searchParams,
}: { searchParams?: { todas?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  /* Para el realtime: el navegador no tiene la sesión de Supabase, la tiene el
     servidor. Ver components/Realtime.tsx. */
  const { data: { session } } = await supabase.auth.getSession();

  /* El filtro va en la URL y no en estado de cliente: así se puede enlazar
     «enséñame también las terminadas» y sobrevive a una recarga. */
  const todas = searchParams?.todas === "1";
  const hoy = hoyLima();

  const [proys, obras, actores, cesiones] = await Promise.all([
    supabase.from("proyectos").select("id,nombre,nombre_corto,tipo,etapa")
      .in("tipo", TIPOS_CON_GUION).order("nombre").limit(techo(400) + 1),
    supabase.from("proyecto_obra")
      .select("id,proyecto_id,titulo,origen,persona_id,cesion_id,autor,iswc," +
        "consultado_en,consultado_nota,prueba_url,vigente_hasta,herramienta," +
        "plan_ia,prompt,aporte_humano,resuelto_como,donde,nota")
      .order("titulo").limit(techo(900) + 1),
    /* El reparto de todos los proyectos, flaco: solo hace falta para el
       desplegable de «quién la aporta». Una consulta por película serían
       quince viajes para pintar una lista. */
    supabase.from("proyecto_actores")
      .select("proyecto_id,persona_id,situacion,persona:personas(id,nombre,alias)")
      /* Solo quien está DENTRO. Atar la música a alguien que se descartó dice
         que aporta algo a una película en la que no sale. Es el mismo filtro
         que usa /personas, y `situacion` puede ser NULL en las filas anteriores
         a db/proyecto-actores-situacion.sql: esas son gente que ya estaba. */
      .or("situacion.eq.confirmada,situacion.is.null")
      .not("persona_id", "is", null).limit(techo(900) + 1),
    supabase.from("proyecto_cesion")
      /* `url` hace falta: una cesión que dice «firmada» sin documento no es una
         firma, y la obra atada a ella no puede salir en verde. */
      .select("id,proyecto_id,persona_id,tipo,estado,obra,url")
      .eq("tipo", "musica").limit(techo(500) + 1),
  ]);

  /* ⚠ Los errores NO se tragan con `|| []`. Una lista vacía por fallo se lee
     como «no falta ninguna música por aclarar», que es lo contrario de la
     verdad sobre unos papeles cuya ausencia impide estrenar. Es el error más
     caro que hemos tenido en este proyecto. */
  const eProy = (proys as any)?.error?.message || null;
  const eObra = (obras as any)?.error?.message || null;
  const fallo = eProy || eObra;

  /* ── EL REPARTO Y LAS CESIONES, CON SU PROPIO AVISO ──
     ⚠ No basta con vigilar las dos consultas grandes. Si falla el reparto, el
     desplegable «quién la aporta» sale vacío; y si fallan las cesiones, TODAS
     las personas reciben el aviso ámbar de «no tiene ninguna cesión de música
     registrada», que es una acusación falsa que ningún clic puede apagar.
     No tumban la pantalla —las obras se leen igual— pero tienen que decirse. */
  const eLado = (actores as any)?.error?.message || (cesiones as any)?.error?.message || null;

  /* La sonda del tope: se pide una fila de más y si vuelve, la lista está
     cortada y el recuento hablaría de menos de lo que hay.
     ⚠ Las cuatro consultas piden la fila de sonda y las cuatro la miran. Pedir
     el `+1` y no compararlo es pagar la sonda para no vigilar nada — el error
     que ya cometimos en /buscar con un aviso que no podía encenderse. */
  const cortadoObras = ((obras.data || []) as any[]).length > techo(900);
  const cortadoProys = ((proys.data || []) as any[]).length > techo(400);
  const cortadoLado = ((actores.data || []) as any[]).length > techo(900)
    || ((cesiones.data || []) as any[]).length > techo(500);
  const listaObras = ((obras.data || []) as any[]).slice(0, techo(900)) as FilaObra[];

  /* ── EL REPARTO Y SUS CESIONES, EN UN SOLO RECORRIDO ──
     Un `filter` por película dentro del `map` de abajo sería recorrer la lista
     entera una vez por proyecto. */
  const cesDe = new Map<string, { id: string; obra?: string | null; estado?: string | null }[]>();
  /* Y el mapa por ID, que es el que mira la regla: una obra atada a una cesión
     PENDIENTE no está resuelta, y antes de esto salía en verde mientras la
     ficha del proyecto la pintaba en ámbar. */
  const cesPorId: MapaCesiones = new Map();
  for (const c of ((cesiones.data || []) as any[])) {
    const k = `${c.proyecto_id}|${c.persona_id}`;
    cesDe.set(k, [...(cesDe.get(k) || []), { id: c.id, obra: c.obra, estado: c.estado }]);
    cesPorId.set(c.id, { estado: c.estado, url: c.url });
  }
  const repartoDe = new Map<string, PersonaReparto[]>();
  for (const a of ((actores.data || []) as any[])) {
    const p = Array.isArray(a.persona) ? a.persona[0] : a.persona;
    if (!p?.id) continue;
    const ya = repartoDe.get(a.proyecto_id) || [];
    /* La misma persona puede tener DOS filas en el reparto —como ella misma y
       como «la cantante»—: el desplegable la enseñaría dos veces. */
    if (ya.some(x => x.id === p.id)) continue;
    repartoDe.set(a.proyecto_id, [...ya, {
      id: p.id,
      nombre: p.nombre || p.alias || "(sin nombre)",
      cesiones: cesDe.get(`${a.proyecto_id}|${p.id}`) || [],
    }]);
  }

  /* ── EL MAPA SOLO SI ES FIABLE ──
     ⚠ Un mapa INCOMPLETO es peor que ninguno: la regla, al no encontrar un id
     que sí existe, dice «la cesión atada ya no existe o dejó de ser de música»
     — una acusación falsa que ningún clic puede apagar. Así que si la consulta
     falló o se cortó, se pasa `null` y la regla calla sobre el papel.
     El mismo criterio que usa el componente para las filas. */
  const cesFiables = (eLado || cortadoLado) ? null : cesPorId;

  const peliculas = ((proys.data || []) as any[]).slice(0, techo(400))
    .filter(p => todas || peliculaViva(p));
  const filas = ordenarPeliculas(peliculas.map(p => diagnosticar(p, listaObras, hoy, cesFiables)));
  const res = resumirDiagnostico(filas);
  const ocultas = Math.min(((proys.data || []) as any[]).length, techo(400)) - peliculas.length;

  /* ── LAS OBRAS QUE NO SE VEN EN NINGUNA PARTE ──
     `proyecto_obra` se pide sin filtrar por proyecto, y `diagnosticar` solo se
     queda con las de las películas visibles. Si a un proyecto se le cambia el
     `tipo` a uno fuera de TIPOS_CON_GUION, su música desaparece de aquí y de
     todas partes — y `?todas=1` no la rescata, porque ese filtro es de etapa,
     no de tipo. Se cuenta y se dice: una obra que nadie puede ver es peor que
     una obra sin resolver. */
  const idsVisibles = new Set(filas.map(f => f.peli.id));
  const huerfanas = listaObras.filter(o => !o.proyecto_id || !idsVisibles.has(o.proyecto_id)).length;

  return (
    <div className="shell">
      {/* Levantar diez temas es trabajo de varias personas a la vez, y cada una
          tiene que ver lo que ya buscó la otra o se busca dos veces. Va también
          `proyecto_cesion`: firmar un papel en la ficha del proyecto tiene que
          apagar el aviso de aquí. */}
      <Realtime tablas={["proyecto_obra", "proyecto_cesion"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar"><Volver /></div>
      <h1 className="title-lg">🎵 Música</h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        Toda la música que suena en cada película y de dónde sale. Lo que decide
        qué hay que averiguar no es el título ni el autor: es el <b>origen</b>.
        Un tema de dominio público pide una fecha de consulta al catálogo; uno
        hecho con IA, el plan con el que se generó; uno que toca una banda en
        cámara, la cesión de quien lo interpreta — <i>y la composición sigue
        siendo de su autor</i>.
      </div>

      {fallo && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudo leer la música: <code>{fallo}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(fallo) && (
            <> <b>Falta correr <code>db/proyecto-obra.sql</code> en Supabase.</b></>
          )}
          <div style={{ marginTop: 4 }}>
            Los números de abajo <b>no</b> se pintan: un cero aquí no significa que
            esté todo aclarado, significa que no se sabe.
          </div>
        </div>
      )}

      {eLado && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudo leer el reparto o las cesiones: <code>{eLado}</code>
          <div style={{ marginTop: 4 }}>
            Las obras se leen igual, pero el desplegable de «quién la aporta» sale
            vacío y <b>no se dice nada sobre las cesiones</b>: callar es mejor que
            acusar de un papel que no se ha podido mirar.
          </div>
        </div>
      )}

      {(cortadoObras || cortadoProys || cortadoLado) && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ La lista se cortó en el tope de la API
          {cortadoObras && <> (más de {techo(900)} obras)</>}
          {cortadoProys && <> (más de {techo(400)} películas)</>}
          {cortadoLado && <> (el reparto o las cesiones)</>}
          . El recuento habla solo de lo que se leyó, así que puede haber más
          pendiente del que dice.
        </div>
      )}

      {!!huerfanas && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ Hay {huerfanas} obra{huerfanas === 1 ? "" : "s"} apuntada{huerfanas === 1 ? "" : "s"} en
          proyectos que esta pantalla no enseña —normalmente porque al proyecto se
          le cambió el tipo a uno que no lleva guion—. No sale{huerfanas === 1 ? "" : "n"} ni
          aquí ni en ningún otro sitio.
        </div>
      )}

      {!fallo && (
        <div className="card gx-diag">
          <div className="gx-nums">
            <span className="gx-n">
              <b>{res.peliculas}</b> película{res.peliculas === 1 ? "" : "s"}
            </span>
            <span className="gx-n"><b>{res.obras}</b> obra{res.obras === 1 ? "" : "s"}</span>
            {!!res.conBloqueo && (
              <span className="gx-n" style={{ color: META_FALTA_PELI.bloqueada.col }}
                title={META_FALTA_PELI.bloqueada.ayuda}>
                🚫 <b>{res.conBloqueo}</b> con música que no se puede usar
              </span>
            )}
            {!!res.conFalta && (
              <span className="gx-n" style={{ color: META_FALTA_PELI["con-falta"].col }}
                title={META_FALTA_PELI["con-falta"].ayuda}>
                ⚠ <b>{res.conFalta}</b> con algo por aclarar
              </span>
            )}
            {!!res.sinMusica && (
              <span className="gx-n" style={{ color: META_FALTA_PELI["sin-musica"].col }}
                title={META_FALTA_PELI["sin-musica"].ayuda}>
                <b>{res.sinMusica}</b> sin nada apuntado
              </span>
            )}
            {!res.conBloqueo && !res.conFalta && !!res.obras && (
              <span className="gx-n" style={{ color: "var(--green)" }}>
                ✔ todo aclarado
              </span>
            )}
            <span style={{ flex: 1 }} />
            <Link href={todas ? "/musica" : "/musica?todas=1"} className="gx-filtro">
              {todas ? "ocultar las terminadas" : `ver también las terminadas${ocultas > 0 ? ` (${ocultas})` : ""}`}
            </Link>
          </div>
        </div>
      )}

      {filas.map(f => {
        const p = f.peli;
        const nombre = p.nombre_corto || p.nombre || "(sin nombre)";
        /* De qué está hecha la película, en el resumen del plegable: «3 🕊 · 2 🤖»
           dice más de un vistazo que un número solo. */
        const mezcla = Object.entries(f.rec.porOrigen)
          .filter(([, n]) => n > 0)
          .map(([o, n]) => `${n} ${META_ORIGEN[o as keyof typeof META_ORIGEN].ico}`)
          .join(" · ");
        return (
          <div key={p.id} style={{ scrollMarginTop: 12 }}>
            {/* ⚠ `abiertoPorDefecto` solo se lee AL MONTAR: si el usuario pliega
                una a mano, se queda plegada para siempre. Es lo que queremos —
                lo que ya revisó no vuelve a abrirse cada vez. */}
            <Plegable
              id={`musica:peli:${p.id}`}
              abiertoPorDefecto={f.falta === "bloqueada" || f.falta === "con-falta"}
              titulo={
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{nombre}</span>
                  {f.falta && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: META_FALTA_PELI[f.falta].col }}
                      title={META_FALTA_PELI[f.falta].ayuda}>
                      {f.falta === "bloqueada" ? "🚫 no se puede usar"
                        : f.falta === "con-falta" ? "⚠ por aclarar" : "sin nada apuntado"}
                    </span>
                  )}
                </span>
              }
              resumen={
                <span style={{ fontSize: 11.5, color: "var(--dim)" }}>
                  {resumen(f.rec) || "sin obras"}{mezcla ? ` · ${mezcla}` : ""}
                </span>
              }>
              <ObrasProyecto
                proyectoId={p.id}
                obras={f.obras}
                reparto={repartoDe.get(p.id) || []}
                cesiones={cesFiables}
                /* Si las cesiones no se pudieron leer O llegaron cortadas, el
                   componente calla en vez de acusar de un papel que nadie ha
                   podido mirar entero. Va también el flag para que el panel no
                   diga «no tiene ninguna cesión registrada». */
                cesionesFallaron={!!eLado || cortadoLado}
                hoy={hoy} />
              <div style={{ marginTop: 8 }}>
                <Link href={`/entidad/proyecto/${p.id}`} className="gx-filtro">
                  ir a la ficha de {nombre} →
                </Link>
              </div>
            </Plegable>
          </div>
        );
      })}

      {!filas.length && !fallo && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          No hay ninguna película en marcha.
          {!todas && <> ¿Están todas terminadas? <Link href="/musica?todas=1" className="gx-filtro">verlas igualmente</Link>.</>}
        </div>
      )}

      {!fallo && !!filas.length && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
          <b>Un recordatorio incómodo.</b> Que un huayno sea tradicional no
          significa que esté libre: «Valicha» tiene dos registros en APDAYC, uno
          marcado <code>DP</code> y otro a nombre de una persona, y «Fatal
          Destino» tiene quince, ninguno en dominio público. Lo que vale como
          diligencia no es haber acertado — es haber mirado y saber cuándo.
          Por eso la fecha de consulta es obligatoria aquí y el autor no.
        </div>
      )}
    </div>
  );
}
