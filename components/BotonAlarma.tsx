"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { encenderAlarma, apagarAlarma } from "@/app/actions";
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
  entidadTipo, entidadId, tituloSugerido, esAdmin, alarma, vivas = 0, compacto,
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
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [f, setF] = useState({ titulo: tituloSugerido || "", motivo: "", revisarEl: "" });
  const [cierre, setCierre] = useState("");
  const [err, setErr] = useState("");
  const [ocupado, correr] = useTransition();

  const encender = () => {
    setErr("");
    correr(async () => {
      const r: any = await encenderAlarma({
        entidadTipo, entidadId, titulo: f.titulo, motivo: f.motivo, revisarEl: f.revisarEl,
      });
      if (r?.error) { setErr(r.error); return; }
      setAbierto(false);
      setF({ titulo: tituloSugerido || "", motivo: "", revisarEl: "" });
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
        🚨 {compacto ? "alarma" : "Encender alarma"}
      </button>
    );
  }

  const escasez = AVISO_ESCASEZ(vivas);
  return (
    <div className="alarma-caja alarma-caja-nueva">
      <div className="alarma-tit">🚨 Encender una alarma</div>
      {/* Se dice ANTES de escribir, no después de guardar: quien está a punto
          de encender la tercera tiene que poder parar aquí. */}
      {escasez && <div className="alarma-escasez">⚠ {escasez}</div>}
      <div className="alarma-form">
        <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })}
          placeholder="Qué pasa, en una línea (lo que verá todo el equipo)" />
        <textarea value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} rows={3}
          placeholder="Por qué es grave y qué hay que hacer. Quien lo lea tiene que poder actuar sin preguntarte." />
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
}
