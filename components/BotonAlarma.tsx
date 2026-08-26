"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import Avatar from "@/components/Avatar";
import { encenderAlarma, apagarAlarma } from "@/app/actions";
import { olvidarZocalo } from "@/lib/zocalo";
import { pieAlarma, estadoAlarma, AVISO_ESCASEZ, type Alarma } from "@/lib/alarmas";

/* ══════════════════════════════════════════════════════════════════════════
   ENCENDER Y APAGAR LA ALARMA

   El único rojo del sistema que no calcula nadie. Ver db/alarmas.sql.

   ── EL FORMULARIO PIDE TRES COSAS Y LAS TRES SON EL DISEÑO ──
   Qué pasa, por qué es grave, y cuándo se revisa. La tercera es la que impide
   que esto se convierta en un adorno permanente: pasada esa fecha la alarma
   deja de hablar del problema y empieza a hablar de sí misma.

   No hay campo de «gravedad» ni de «prioridad». Una alarma es una sola cosa
   —grave— y una escala convierte la decisión de encenderla en la decisión más
   fácil de «ponerle nivel bajo», que es como no encenderla pero con ruido.
   ══════════════════════════════════════════════════════════════════════════ */
export default function BotonAlarma({
  entidadTipo, entidadId, tituloSugerido, esAdmin, alarma, vivas = 0, compacto, equipo = [],
}: {
  entidadTipo: string;
  entidadId: string;
  /** Con qué empieza el título: el nombre de lo que está en problemas. */
  tituloSugerido?: string;
  esAdmin: boolean;
  /** La alarma encendida de esta entidad, si la hay. */
  alarma?: Alarma | null;
  /** Cuántas hay encendidas en todo el sistema. Solo para avisar de la escasez. */
  vivas?: number;
  /** En la tarjeta de una lista: solo el botón, sin el bloque de detalle. */
  compacto?: boolean;
  /** El equipo entre el que se elige a quién le toca. */
  equipo?: { id: string; nombre?: string | null; avatar_url?: string | null; color?: string | null }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [f, setF] = useState({ titulo: tituloSugerido || "", motivo: "", revisarEl: "" });
  /* Quiénes la atienden. Es una LISTA ordenada y no un conjunto: el primero
     queda como responsable del caso, y ese orden lo decide quien enciende. */
  const [gente, setGente] = useState<string[]>([]);
  const tocar = (id: string) => setGente(p =>
    p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const [cierre, setCierre] = useState("");
  const [err, setErr] = useState("");
  const [ocupado, correr] = useTransition();

  const encender = () => {
    setErr("");
    correr(async () => {
      const r: any = await encenderAlarma({
        entidadTipo, entidadId, titulo: f.titulo, motivo: f.motivo,
        revisarEl: f.revisarEl, involucrados: gente,
      });
      if (r?.error) { setErr(r.error); return; }
      setAbierto(false);
      setF({ titulo: tituloSugerido || "", motivo: "", revisarEl: "" });
      setGente([]);
      /* La franja de arriba vive del zócalo, que se guarda por ruta: sin
         olvidarlo, encender aquí no la enciende allí hasta cambiar de página. */
      olvidarZocalo();
      router.refresh();
    });
  };

  const apagar = () => {
    if (!alarma) return;
    setErr("");
    correr(async () => {
      const r: any = await apagarAlarma(alarma.id, cierre);
      if (r?.error) { setErr(r.error); return; }
      setApagando(false); setCierre("");
      olvidarZocalo();
      router.refresh();
    });
  };

  /* ── CON LA ALARMA ENCENDIDA ──
     Se enseña a TODO el mundo, no solo a administración: el sentido de esto es
     que el equipo lo sepa. Lo que solo puede administración es apagarla. */
  if (alarma) {
    const e = estadoAlarma(alarma);
    return (
      <div className={`alarma-caja${compacto ? " alarma-caja-min" : ""}`}>
        <div className="alarma-tit">
          🚨 {alarma.titulo}
          {e.aviso && <span className="alarma-vieja"> · {e.aviso}</span>}
        </div>
        {!compacto && <div className="alarma-motivo">{alarma.motivo}</div>}
        {/* ── QUIÉN LA ATIENDE, CON CARA ──
            La primera pregunta al ver un rojo es «¿me toca a mí?», y hasta
            que no se contesta nadie hace nada. El primero lleva el caso: se
            dice, porque «somos tres» sin decir quién responde es la forma
            elegante de que no responda ninguno. */}
        {!!alarma.gente?.length && (
          <div className="alarma-gente">
            <span className="alarma-nota">le toca a</span>
            {alarma.gente.map((p, i) => (
              <span key={p.id} className="alarma-quien"
                title={i === 0 ? `${p.nombre} — lleva el caso` : p.nombre || ""}>
                <Avatar size={18} nombre={p.nombre} src={p.avatar_url} color={p.color} />
                <span>{p.nombre}</span>
                {i === 0 && <b className="alarma-jefe">lleva el caso</b>}
              </span>
            ))}
          </div>
        )}
        <div className="alarma-pie">
          <span>{pieAlarma(alarma)}{alarma.quien?.nombre ? ` · la encendió ${alarma.quien.nombre}` : ""}</span>
          {alarma.caso_id && (
            <Link href={`/caso/${alarma.caso_id}`} className="alarma-ir-caso">📋 ver el caso →</Link>
          )}
          {esAdmin && !apagando && (
            <button className="dato-btn" onClick={() => setApagando(true)}>✔ apagar</button>
          )}
        </div>
        {apagando && (
          <div className="alarma-form">
            {/* Apagar EXIGE contar cómo terminó, y por eso el campo está aquí y
                no en un pop-up de confirmación: la explicación es el acto, no
                un trámite antes del acto. */}
            <textarea value={cierre} onChange={e2 => setCierre(e2.target.value)} rows={2}
              placeholder="¿Cómo se resolvió? Dentro de un año, esto es lo único que va a quedar." />
            <div className="alarma-botones">
              <button className="btn" disabled={ocupado} onClick={apagar}>
                {ocupado ? "…" : "Apagar la alarma"}
              </button>
              <button className="btn btn-ghost" disabled={ocupado}
                onClick={() => { setApagando(false); setErr(""); }}>Cancelar</button>
            </div>
          </div>
        )}
        {err && <div className="err-inline">⚠ {err}</div>}
      </div>
    );
  }

  if (!esAdmin) return null;

  if (!abierto) {
    return (
      <button className={`alarma-btn${compacto ? " alarma-btn-min" : ""}`}
        onClick={() => setAbierto(true)}
        title="Encender una alarma: el equipo entero la ve en todas las pantallas hasta que se apague. Para lo grave que el sistema no puede deducir solo.">
        {/* En compacto, la palabra sola. El 🚨 al lado de un botón chico, en
            una barra que ya tiene íconos, se lee como decoración; «alarma» en
            rojo no se confunde con nada. El title dice lo que hace. */}
        {compacto ? "alarma" : "🚨 Encender alarma"}
      </button>
    );
  }

  const escasez = AVISO_ESCASEZ(vivas);
  /* ── EN COMPACTO EL FORMULARIO FLOTA ──
     El botón chico vive en una barra de controles o colgando de una tarjeta;
     abrir ahí dentro un bloque de cuatro campos empujaría toda la fila. Se
     despliega POR ENCIMA, anclado a la derecha del botón. */
  const cuerpo = (
    <div className={`alarma-caja alarma-caja-nueva${compacto ? " alarma-pop" : ""}`}>
      <div className="alarma-tit">🚨 Encender una alarma</div>
      {/* Se dice ANTES de escribir, no después de guardar: quien está a punto
          de encender la tercera tiene que poder parar aquí. */}
      {escasez && <div className="alarma-escasez">⚠ {escasez}</div>}
      <div className="alarma-form">
        <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })}
          placeholder="Qué pasa, en una línea (lo que verá todo el equipo)" />
        <textarea value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} rows={3}
          placeholder="Por qué es grave y qué hay que hacer. Quien lo lea tiene que poder actuar sin preguntarte." />
        {/* ── A QUIÉN LE TOCA ──
            Va ANTES de la fecha porque es la pregunta más difícil de las tres:
            escribir el problema es fácil, poner nombre a quien lo arregla es
            lo que convierte una queja en un encargo. */}
        <div className="alarma-elegir">
          <span className="alarma-nota">
            ¿A quién le toca? El primero que marques lleva el caso.
          </span>
          <div className="alarma-gente">
            {equipo.map(p => {
              const i = gente.indexOf(p.id);
              return (
                <button key={p.id} type="button" disabled={ocupado}
                  className={`alarma-quien alarma-elegible${i >= 0 ? " on" : ""}`}
                  onClick={() => tocar(p.id)}
                  title={i === 0 ? `${p.nombre} llevará el caso` : p.nombre || ""}>
                  <Avatar size={18} nombre={p.nombre} src={p.avatar_url} color={p.color} />
                  <span>{p.nombre}</span>
                  {i === 0 && <b className="alarma-jefe">lleva el caso</b>}
                </button>
              );
            })}
          </div>
        </div>
        <label className="alarma-fecha">
          <span>Se revisa el</span>
          <input type="date" value={f.revisarEl}
            onChange={e => setF({ ...f, revisarEl: e.target.value })} />
          <span className="alarma-nota">
            Obligatorio: pasada esa fecha, la alarma dirá que lleva días sin revisarse.
          </span>
        </label>
        <div className="alarma-botones">
          <button className="btn" disabled={ocupado} onClick={encender}>
            {ocupado ? "…" : "🚨 Encender"}
          </button>
          <button className="btn btn-ghost" disabled={ocupado}
            onClick={() => { setAbierto(false); setErr(""); }}>Cancelar</button>
          <span className="alarma-nota">
            Se abre un caso con esto y se avisa al equipo, una vez.
          </span>
        </div>
      </div>
      {err && <div className="err-inline">⚠ {err}</div>}
    </div>
  );
  return compacto ? <span className="alarma-pop-ancla">{cuerpo}</span> : cuerpo;
}
