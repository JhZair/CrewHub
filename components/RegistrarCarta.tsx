"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registrarCarta } from "@/app/casilla/acciones";
import { useAviso } from "@/components/useConfirmar";

/* ══════════════════════════════════════════════════════════════════════════
   REGISTRAR UNA CARTA DE LA CASILLA ELECTRÓNICA

   La Plataforma Virtual del Ministerio no manda correo de todo y no tiene API:
   si nadie entra a mirar, la carta no existe para nosotros. Y las que llegan
   ahí son justo las que muerden — «SEGUNDO REQUERIMIENTO DE OBLIGACIONES DEL
   ACTA DE COMPROMISO».

   Aquí no se promete vigilancia: se ofrece un sitio donde dejarla en cuanto se
   ve. Aterriza en la MISMA bandeja que los correos, porque es la misma
   pregunta —«¿qué nos ha dicho DAFO?»— y dos bandejas serían dos respuestas.

   ── EL NÚMERO DE CARTA ES LO ÚNICO OBLIGATORIO ADEMÁS DE LA FECHA ──
   Es la llave anti-duplicado. En la casilla de PO-005 la misma carta figura
   CUATRO VECES, notificada el mismo día a la misma hora; registrada por
   número, la segunda pasada corrige la primera en vez de inventar un cuarto
   requerimiento que nunca existió.
   ══════════════════════════════════════════════════════════════════════════ */

export default function RegistrarCarta({
  opciones, hoy,
}: {
  opciones: { id: string; etiqueta: string; enJuego?: boolean }[];
  /** El día de hoy en Lima, dicho por el servidor. */
  hoy: string;
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (ocupado) return;
    const d = new FormData(e.currentTarget);
    setOcupado(true);
    try {
      const r: any = await registrarCarta({
        numero: String(d.get("numero") || ""),
        asunto: String(d.get("asunto") || ""),
        fecha: String(d.get("fecha") || ""),
        postulacionId: String(d.get("post") || "") || null,
        docUrl: String(d.get("url") || ""),
        responderHasta: String(d.get("hasta") || "") || null,
        sistema: String(d.get("sistema") || ""),
        destinatario: String(d.get("destinatario") || ""),
        ajena: d.get("ajena") === "on",
      });
      if (r?.error) { avisar(r.error); return; }
      setAbierto(false);
      router.refresh();
    } catch { avisar("No se pudo registrar la carta."); }
    finally { setOcupado(false); }
  };

  return (
    <div className="rc">
      {aviso}
      <div className="rc-cab">
        <button type="button" className="btn btn-ghost rc-btn" onClick={() => setAbierto(!abierto)}>
          {abierto ? "Cancelar" : "＋ Registrar una carta de la casilla electrónica"}
        </button>
        {!abierto && (
          <span className="rc-dim">
            Lo que llega a la Plataforma Virtual no avisa a ninguna parte: si nadie entra a mirar,
            aquí no existe.
          </span>
        )}
      </div>

      {abierto && (
        <form className="rc-form" onSubmit={enviar}>
          <label className="rc-lbl rc-full">
            Número de la carta
            <input name="numero" required className="rp-input rc-ancho"
              placeholder="CARTA N° 000500-2025-DAFO-DGIA-VMPCIC/MC" />
            <span className="rc-ayuda">
              Cópialo tal cual. Es lo que evita registrar cuatro veces la misma carta.
            </span>
          </label>
          <label className="rc-lbl rc-full">
            De qué va
            <input name="asunto" className="rp-input rc-ancho"
              placeholder="Segundo requerimiento de obligaciones del acta de compromiso N° 061-2023-DAFO" />
          </label>
          <div className="rc-fila">
            <label className="rc-lbl">
              Notificada el
              <input name="fecha" type="date" required max={hoy} defaultValue={hoy} className="rp-input" />
            </label>
            <label className="rc-lbl">
              Responder hasta
              <input name="hasta" type="date" className="rp-input" />
              <span className="rc-ayuda">Si tiene plazo. Sin esto no puede avisar.</span>
            </label>
            <label className="rc-lbl">
              Sistema
              <input name="sistema" className="rp-input" placeholder="SGD" defaultValue="SGD" />
            </label>
          </div>
          <label className="rc-lbl rc-full">
            ¿De qué fondo es?
            <select name="post" className="rp-sel rc-ancho" defaultValue="">
              <option value="">— sin vincular por ahora —</option>
              {opciones.map(o => (
                <option key={o.id} value={o.id}>{o.enJuego ? "• " : ""}{o.etiqueta}</option>
              ))}
            </select>
            {/* El número del acta que sale en el asunto es lo que lo dice
                («…ACTA DE COMPROMISO N° 061-2023-DAFO»). Sin vincular, la carta
                queda en la bandeja pero no aparece en la vida de ningún fondo. */}
            <span className="rc-ayuda">
              El asunto suele decirlo: «…del acta de compromiso N° 061-2023-DAFO».
            </span>
          </label>
          {/* ── LA QUE NO ES NUESTRA ──
              Pasó de verdad: nos notificaron cuatro veces el requerimiento del
              acta 061-2023-DAFO, dirigido a otro presidente y otra asociación.
              Eso no se borra —es la prueba de que ese día nos notificaron algo
              que no nos correspondía— pero tampoco puede reclamarnos nada: se
              guarda sin fondo, sin plazo y fuera de los pendientes. */}
          <div className="rc-ajena">
            <label className="rc-check">
              <input type="checkbox" name="ajena" />
              <b>No es nuestra</b> — nos la notificaron por error, va dirigida a otro beneficiario
            </label>
            <label className="rc-lbl rc-full">
              ¿A nombre de quién viene?
              <input name="destinatario" className="rp-input rc-ancho"
                placeholder="ROBERTO TAFUR SHUPINGAHUA · ASOCIACIÓN … — quien figura en la carta" />
              <span className="rc-ayuda">
                Es lo que explica, dentro de un año, por qué está marcada como ajena.
              </span>
            </label>
          </div>
          <label className="rc-lbl rc-full">
            Enlace al documento
            <input name="url" className="rp-input rc-ancho"
              placeholder="https://… (el PDF que se descarga de «Ver Documento») — opcional" />
          </label>
          <div className="rc-fila">
            <button className="btn" type="submit" disabled={ocupado}>Registrar</button>
            <span className="rc-dim">
              Si ya estaba registrada, se corrige la que hay — no se duplica.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
