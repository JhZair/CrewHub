"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearSitio, guardarEn, type Destino } from "@/app/equipamiento/acciones";
import { textoDeRuta, type Guardado, type Sitio, type Tramo } from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA ESTO — el control, en un solo sitio

   Lo usan la ficha del equipo y el panel de kits, y va a usarlo la vista por
   sitio. Escrito en tres, el de la ficha ofrecería crear un cajón nuevo y el
   de los kits no, y nadie sabría cuál es el bueno.

   ── ENSEÑA LA CADENA ENTERA, NO EL ÚLTIMO ESLABÓN ──
   «Depósito › Cajón 08 › Bolso Tenba» y no «Bolso Tenba»: para ir a buscarlo
   hace falta saber en qué cajón está el bolso. Es la misma razón por la que
   el modelo encadena en vez de guardar un texto.

   ── LO HEREDADO NO SE EDITA AQUÍ ──
   Una pieza atornillada está donde su anfitrión, y un equipo metido en su
   bolso está donde el bolso. En los dos casos el control ENSEÑA la ruta y dice
   de quién la hereda, pero el selector solo aparece cuando el dato es propio o
   no hay ninguno. Cambiar el sitio de la pieza sin desmontarla es imposible en
   la base —hay un `check`— y ofrecer un control que va a dar error es peor que
   no ofrecerlo: la salida es cambiar el sitio de quien la contiene, y eso se
   dice con un enlace en vez de con un mensaje rojo después de intentarlo.
   ══════════════════════════════════════════════════════════════════════════ */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Contenedor = {
  id: string; folio?: string | null; nombre: string;
  /** Dentro de qué va ESTE, para poder excluir a los descendientes del
   *  selector. Es `guardado_en_equipo` o `ensamblado_en`, lo que haya: la
   *  cadena de «dónde se guarda» sube por los dos. */
  dentroDe?: string | null;
};

export default function DondeSeGuarda({
  que, id, guardado, sitios, contenedores, compacto, error, cortado,
}: {
  que: "equipo" | "kit";
  id: string;
  /** Ya resuelto por `lib/sitios`: la pantalla que lo monta tiene las listas y
   *  las resuelve una vez para todas sus filas. */
  guardado: Guardado;
  sitios: Sitio[];
  /** Equipos que pueden contener a otros. Los da la pantalla: aquí no se sabe
   *  cuál es el inventario ni conviene traerlo por cada fila. */
  contenedores: Contenedor[];
  /** En una lista: solo el texto y un lápiz. En una ficha: el bloque entero. */
  compacto?: boolean;
  /** Lo que falló al leer sitios o equipos. Se DICE: sin la migración corrida
   *  el bloque saldría «sin sitio anotado» con el selector vacío, indistinguible
   *  de un equipo al que nadie le ha puesto sitio. */
  error?: string | null;
  /** Si la lista de equipos o de sitios llegó al techo de la API. Cambia lo que
   *  significa un «apunta a algo que ya no está». */
  cortado?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  /* Abrir y cerrar limpia lo escrito y el error: sin esto, un fallo se quedaba
     pegado y al volver a abrir salía el rojo de hace diez minutos encima de
     una lista nueva. */
  const alternar = () => { setAbierto(a => !a); setErr(""); setQ(""); };

  /* ⚠ ROTO o EN BUCLE no es «heredado»: es «no se sabe», y ahí SÍ hace falta
     el control — es la única forma de arreglarlo. Estaba mirando solo `origen`,
     que sigue diciendo «contenedor» aunque el contenedor no exista, y el bloque
     salía con un texto rojo, ningún botón y una frase que pedía «rómpela
     cambiando uno de los pasos» sin ofrecer con qué. En un bucle de dos bolsos
     los dos extremos quedaban así: callejón sin salida.
     La excepción es lo ATORNILLADO: ahí el check de la base prohíbe el sitio
     propio pase lo que pase, así que el control seguiría sin poder guardar. */
  const atornillado = guardado.origen === "ensamblado";
  const heredado = atornillado
    || (guardado.origen === "contenedor" && !guardado.roto && !guardado.bucle);
  /* De quién lo hereda: el último tramo de la cadena, que es siempre el equipo
     que lo contiene. Sirve para el enlace de «cámbialo ahí». */
  const deQuien: Tramo | null = heredado && guardado.ruta.length
    ? guardado.ruta[guardado.ruta.length - 1]
    : null;

  /* ⚠ Los DESCENDIENTES fuera del selector. `guardarEn` los rechaza subiendo
     la cadena, pero ofrecerlos y dar el error después del clic es lo que este
     archivo dice arriba que no hay que hacer. Lo que va DENTRO de esto no
     puede contenerlo: son los que tienen a `id` en su propia cadena.
     Se calcula con los mismos datos que ya viajaron —`contenedores` trae los
     dos punteros— sin pedir nada más. */
  const prohibidos = useMemo(() => {
    const dentroDe = new Map<string, string | null>(
      contenedores.map(c => [c.id, c.dentroDe ?? null]));
    const malo = new Set<string>([id]);
    for (const c of contenedores) {
      let cursor: string | null = c.id;
      const vistos = new Set<string>();
      while (cursor && !vistos.has(cursor)) {
        vistos.add(cursor);
        if (cursor === id) { malo.add(c.id); break; }
        cursor = dentroDe.get(cursor) ?? null;
      }
    }
    return malo;
  }, [contenedores, id]);

  const opciones = useMemo(() => {
    const ps = nrm(q).split(/\s+/).filter(Boolean);
    const casa = (t: string) => ps.every(p => nrm(t).includes(p));
    const sit = sitios.filter(s => casa(s.nombre));
    const eqs = contenedores.filter(c => !prohibidos.has(c.id) && casa(`${c.folio || ""} ${c.nombre}`));
    return { sitios: sit.slice(0, 30), equipos: eqs.slice(0, 30), nSitios: sit.length };
  }, [sitios, contenedores, q, prohibidos]);

  async function poner(destino: Destino) {
    setOcupado(true); setErr("");
    try {
      const r: any = await guardarEn(que, [id], destino);
      if (r?.error) { setErr(r.error); return; }
      setAbierto(false); setQ("");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar.");
    } finally { setOcupado(false); }
  }

  async function crearYPoner() {
    const nombre = q.trim();
    if (!nombre) return;
    setOcupado(true); setErr("");
    try {
      const r: any = await crearSitio(nombre);
      if (r?.error) { setErr(r.error); setOcupado(false); return; }
      /* Se crea Y se pone en la misma pulsación: crear un cajón para luego
         tener que buscarlo en la lista es el paso que sobra. */
      await poner({ sitio: r.id });
    } catch (e: any) {
      setErr(e?.message || "No se pudo crear el sitio.");
      setOcupado(false);
    }
  }

  /* ── EL TEXTO, QUE ES LO QUE SE LEE ── */
  const texto = guardado.bucle
    ? "⟲ la cadena da vueltas — revísalo"
    : guardado.roto
    ? "⚠ apunta a algo que ya no está"
    : guardado.ruta.length
    ? textoDeRuta(guardado.ruta)
    : "sin sitio anotado";

  const tono = guardado.bucle || guardado.roto
    ? "var(--red)"
    : guardado.ruta.length ? "var(--text)" : "var(--dim)";

  const selector = (
    <div className="dsg-selector">
      <input className="ent-lote-inp" autoFocus placeholder="Buscar un sitio o el bolso donde va…"
        value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%" }} />
      <div className="dsg-lista">
        {/* Quitar el sitio es una respuesta, no un borrado: «ya no sé dónde
            va» es distinto de «nunca lo anoté», y la única forma de decirlo. */}
        {guardado.origen === "propio" && (
          <button type="button" className="dsg-op" disabled={ocupado}
            onClick={() => poner(null)}>
            <span className="dsg-ico">✕</span> quitarle el sitio
          </button>
        )}
        {opciones.sitios.map(s => (
          <button key={s.id} type="button" className="dsg-op" disabled={ocupado}
            onClick={() => poner({ sitio: s.id })}>
            <span className="dsg-ico">📍</span> {s.nombre}
          </button>
        ))}
        {opciones.equipos.map(c => (
          <button key={c.id} type="button" className="dsg-op" disabled={ocupado}
            onClick={() => poner({ equipo: c.id })}>
            <span className="dsg-ico">🎒</span>
            {c.folio && <span className="badge kit-folio">{c.folio}</span>}
            {c.nombre}
          </button>
        ))}
        {/* ⚠ Crear solo si NO hay ya un sitio con ese nombre en la lista de
            arriba: sin esta guarda, escribir «Cajón 07» ofrece a la vez
            elegirlo y crearlo, y el segundo botón hace un cajón duplicado…
            o no, porque `crearSitio` devuelve el que ya estaba. Ofrecer dos
            caminos para lo mismo es lo que hay que evitar, no el duplicado. */}
        {/* ⚠ Contra `sitios` entero y no contra `opciones.sitios`, que está
            recortado a treinta: con el sitio exacto en la posición treinta y
            uno se ofrecían los dos caminos a la vez. */}
        {q.trim() && !sitios.some(s => nrm(s.nombre) === nrm(q.trim())) && (
          <button type="button" className="dsg-op dsg-crear" disabled={ocupado}
            onClick={crearYPoner}>
            ＋ crear el sitio «{q.trim()}» y guardarlo ahí
          </button>
        )}
        {!opciones.sitios.length && !opciones.equipos.length && !q.trim() && (
          <div className="dsg-vacio">
            No hay sitios todavía. Escribe uno —«Cajón 07», «Depósito»— y se crea.
          </div>
        )}
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>⚠ {err}</div>}
      <button type="button" className="dato-btn" onClick={alternar}>cerrar</button>
    </div>
  );

  if (compacto) {
    return (
      <span className="dsg-compacto">
        <span style={{ color: tono }} title={heredado && deQuien
          ? `Lo hereda de ${deQuien.nombre}` : undefined}>📍 {texto}</span>
        {!heredado && (
          <button type="button" className="dato-btn" onClick={alternar}>
            {guardado.ruta.length ? "cambiar" : "anotar"}
          </button>
        )}
        {abierto && selector}
      </span>
    );
  }

  return (
    <div className="card dsg-bloque">
      <div className="dsg-cab">
        <b style={{ fontSize: 13 }}>📍 Dónde se guarda</b>
        {!heredado && (
          <button type="button" className="dato-btn" onClick={alternar}>
            {guardado.ruta.length ? "cambiar" : "anotar"}
          </button>
        )}
      </div>

      <div className="dsg-ruta" style={{ color: tono }}>
        {guardado.ruta.length
          ? guardado.ruta.map((t, i) => (
            <span key={t.id} className="dsg-tramo">
              {i > 0 && <span className="dsg-sep">›</span>}
              <span className={t.tipo === "sitio" ? "dsg-sitio" : "dsg-equipo"}>
                {t.tipo === "sitio" ? "📍" : "🎒"} {t.nombre}
              </span>
            </span>
          ))
          : texto}
      </div>

      {/* Por qué no se puede editar aquí, y dónde sí. Sin esta línea, el bloque
          es un dato sin botón y se lee como que la pantalla está rota. */}
      {heredado && deQuien && (
        <div className="dsg-porque">
          {guardado.origen === "ensamblado"
            ? <>Está atornillado dentro de <b>{deQuien.nombre}</b>, así que se guarda donde él.
                Para darle sitio propio hay que desmontarlo.</>
            : <>Va dentro de <b>{deQuien.nombre}</b>. Cambia el sitio de ese
                para mover todo lo que lleva dentro.</>}
        </div>
      )}
      {guardado.bucle && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          La cadena de contenedores da vueltas sobre sí misma, así que no se
          puede decir dónde acaba. Hay que romperla cambiando uno de los pasos.
        </div>
      )}
      {guardado.roto && !guardado.bucle && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          {cortado
            /* Con la lista cortada, acusar a la base sería mentir: el sitio
               existe y no llegó en esta tanda. */
            ? <>Apunta a algo que no llegó: la lista de equipos o de sitios se
                cortó en el tope de la API. No es que no exista.</>
            : <>Apunta a un sitio o a un equipo que ya no existe. Vuelve a
                anotarlo.</>}
        </div>
      )}
      {/* Sin la migración corrida esto salía «sin sitio anotado» con el
          selector vacío: idéntico a un equipo al que nadie le puso sitio. */}
      {error && (
        <div className="dsg-porque" style={{ color: "var(--red)" }}>
          ⚠ No se pudo leer dónde se guarda.{" "}
          {/(does not exist|schema cache|PGRST20)/i.test(error)
            ? <>Falta correr <code>db/sitios.sql</code> en Supabase.</>
            : <code style={{ fontSize: 11 }}>{error}</code>}
        </div>
      )}

      {abierto && !heredado && selector}
    </div>
  );
}
