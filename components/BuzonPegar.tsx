"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apuntarBuzon } from "@/app/actions";
import { useAviso } from "@/components/useConfirmar";
import { leerBuzon, refBuzon, type MensajeBuzon } from "@/lib/buzonDafo";
import { normActa } from "@/lib/cartaDafo";
import { fechaCorta } from "@/lib/fechas";

/* ══════════════════════════════════════════════════════════════════════════
   📋 PEGAR EL BUZÓN DE COMUNICACIONES

   La tercera ventanilla de DAFO —después del correo y de la casilla— es un
   hilo por proyecto dentro de la plataforma de concursos. Ahí está la
   conversación de verdad, en los dos sentidos, y no llega a ninguna parte: si
   nadie entra, no existe.

   No hay API ni PDF que leer. Lo que sí se puede es seleccionar la tabla del
   buzón y pegarla aquí. Se parte en mensajes, se enseñan y se apuntan como
   hitos del fondo.

   ── LO QUE SE PEGA NO SE GUARDA HASTA QUE ALGUIEN MIRA ──
   Igual que con los PDF: la máquina parte el texto, la persona confirma. Y el
   titular se puede corregir antes de guardar, porque el que sale de la primera
   frase acierta casi siempre y «casi» no es «siempre».
   ══════════════════════════════════════════════════════════════════════════ */

export default function BuzonPegar({ postulacionId, codigoActa }: {
  postulacionId: string;
  /** El acta de ESTE fondo. El código de cada mensaje empieza por el acta a la
   *  que pertenece («060-2023-DAFO-29»), así que con esto se puede avisar de
   *  que lo pegado es de otro expediente — que es lo mismo que ya nos coló
   *  cuatro cartas ajenas por la casilla. */
  codigoActa?: string | null;
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const [texto, setTexto] = useState("");
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [fuera, setFuera] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);

  /* Se relee en cada tecla: pegar un texto largo y ver al momento cuántos
     mensajes salieron es lo que dice si el pegado sirvió. */
  const mensajes = useMemo(() => leerBuzon(texto), [texto]);
  /* Los que no son de este expediente. No se bloquean —a lo mejor el acta está
     mal cargada— pero se dicen y llegan desmarcados. */
  const ajeno = (m: MensajeBuzon) =>
    !!(codigoActa && m.expediente && normActa(m.expediente) !== normActa(codigoActa));
  const elegidos = mensajes.filter(m => !(fuera[m.codigo] ?? ajeno(m)));

  const tituloDe = (m: MensajeBuzon) => titulos[m.codigo] ?? m.titulo;

  const apuntar = async () => {
    if (ocupado || !elegidos.length) return;
    setOcupado(true);
    try {
      const r: any = await apuntarBuzon(postulacionId, elegidos.map(m => ({
        ref: refBuzon(m.codigo),
        fecha: m.fecha,
        /* Quién escribe decide el icono de la línea: 📤 lo que mandamos,
           📥 lo que nos dijeron. Leída de un vistazo, la conversación se
           entiende sin abrir nada. */
        tipo: m.deNosotros ? "envio" : "recepcion",
        titulo: tituloDe(m),
        /* El mensaje entero, con su código y su hora delante: dentro de un año
           hay que poder citarlo por su número. */
        detalle: `[${m.codigo} · ${m.remitente} · ${m.hora}]\n\n${m.texto}`,
      })));
      if (r?.error) { avisar(r.error); return; }
      const n = r?.ok || 0, rep = r?.repetidos || 0;
      const malos: string[] = r?.fallos || [];
      avisar(n
        ? `✓ ${n} mensaje(s) apuntado(s)${rep ? ` · ${rep} ya estaban` : ""}`
          + (malos.length ? ` · ${malos.length} no entraron: ${malos.join("; ")}` : ".")
        : malos.length ? `No entró ninguno: ${malos.join("; ")}`
          : `Todos esos mensajes ya estaban apuntados (${rep}).`);
      if (n) { setTexto(""); setTitulos({}); setFuera({}); router.refresh(); }
    } catch { avisar("No se pudo apuntar el buzón."); }
    finally { setOcupado(false); }
  };

  return (
    <div className="bz">
      {aviso}
      <p className="rc-dim bz-como">
        En la plataforma de concursos, abre <b>Buzón de comunicaciones</b>, selecciona la tabla
        entera (encabezado incluido), cópiala y pégala aquí. Se puede pegar el buzón completo cada
        vez: los mensajes que ya estén apuntados se reconocen por su código y no se repiten.
      </p>
      <textarea className="rp-input bz-caja" rows={6} value={texto} disabled={ocupado}
        aria-label="Pegar aquí la tabla del buzón de comunicaciones"
        onChange={e => setTexto(e.target.value)}
        placeholder="Pega aquí la tabla del buzón…" />

      {!!texto.trim() && !mensajes.length && (
        <p className="rp-sobra">
          ⚠ No encontré ningún mensaje en lo que pegaste. Cada fila tiene que traer quién escribe,
          su código (060-2023-DAFO-29) y la fecha con hora — que es lo que sale al seleccionar la
          tabla del buzón.
        </p>
      )}

      {mensajes.length > 0 && (
        <>
          <div className="bz-lista">
            {mensajes.map(m => (
              <div key={m.codigo} className={`bz-fila${(fuera[m.codigo] ?? ajeno(m)) ? " bz-off" : ""}`}>
                <label className="bz-chk" title="Quitar este mensaje de la carga">
                  <input type="checkbox" checked={!(fuera[m.codigo] ?? ajeno(m))} disabled={ocupado}
                    onChange={e => setFuera(f => ({ ...f, [m.codigo]: !e.target.checked }))}
                    aria-label={`Apuntar el mensaje ${m.codigo}`} />
                </label>
                <span className="bz-ico">{m.deNosotros ? "📤" : "📥"}</span>
                <span className="bz-meta">
                  <b>{fechaCorta(m.fecha)}</b>
                  <i className="cl-cod">{m.codigo} · {m.remitente}</i>
                  {ajeno(m) && (
                    <i className="cl-cod cl-dest" style={{ color: "var(--yellow)" }}>
                      ⚠ es del expediente {m.expediente}, no de este fondo
                    </i>
                  )}
                </span>
                <span className="bz-txt">
                  <input className="rp-input cl-inp" value={tituloDe(m)} disabled={ocupado}
                    aria-label={`Titular del mensaje ${m.codigo}`}
                    onChange={e => setTitulos(t => ({ ...t, [m.codigo]: e.target.value }))} />
                  {/* El mensaje entero, plegado: se guarda completo, pero en la
                      revisión ocupa lo que ocupa un renglón. */}
                  <details className="bz-det">
                    <summary>ver el mensaje completo</summary>
                    <div className="bz-cuerpo">{m.texto}</div>
                  </details>
                </span>
              </div>
            ))}
          </div>
          <div className="cl-pie">
            <button className="btn" disabled={ocupado || !elegidos.length} onClick={apuntar}>
              {ocupado ? "Apuntando…" : `Apuntar ${elegidos.length} mensaje(s)`}
            </button>
            <button className="btn btn-ghost" disabled={ocupado}
              onClick={() => { setTexto(""); setTitulos({}); setFuera({}); }}>Vaciar</button>
            <span className="rc-dim">
              Se guardan como hitos: 📤 lo que mandamos, 📥 lo que nos dijeron.
              {mensajes.length !== elegidos.length
                ? ` ${mensajes.length - elegidos.length} desmarcado(s) se quedan fuera.`
                : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
