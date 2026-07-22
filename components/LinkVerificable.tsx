"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { marcarLink } from "@/app/actions";
import VisorArchivo from "@/components/VisorArchivo";
import { previewCandidates } from "@/lib/drive";

/* Link de documento con verificador de contenido. Junto al botón para abrir se
   muestra una miniatura del archivo real (Drive o imagen directa) para cazar el
   que quedó equivocado, y el veredicto de un humano: ✓ Correcto o ✗ Incorrecto.
   El veredicto se guarda contra la URL: si el link cambia, vuelve a «sin
   revisar». Volver a tocar el mismo veredicto lo quita. */
export default function LinkVerificable({ tipo, id, campo, url, etiqueta, icono, verif, linea, franja, origen, extra }: {
  tipo: string; id: string; campo: string; url: string;
  etiqueta: string; icono: string;
  /* PROCEDENCIA: «agregado por JohnO · 22 jul. 2026». Va en la misma banda que
     el veredicto porque las dos contestan la misma pregunta —¿de dónde salió
     esto y me puedo fiar?— y separarlas dejaba dos renglones grises seguidos
     que se leían como uno solo mal maquetado.
     Pero no son lo mismo y la banda lo nota: la procedencia es un hecho fijo
     (quién lo trajo, nunca cambia) y va a la izquierda, en texto apagado; el
     veredicto es un juicio revocable atado a ESTA url —si el link cambia
     vuelve a «sin revisar»— y va a la derecha, con sus botones. */
  origen?: string | null;
  /** Contexto extra a la izquierda (los chips 🔗 💬 🗂 del repositorio). */
  extra?: ReactNode;
  verif?: { url: string; por?: string | null; en?: string | null; correcto?: boolean } | null;
  /** Todo en una sola fila (para listas donde el alto importa). */
  linea?: boolean;
  /* SELLO: una banda fina y sin miniatura, para cuando la imagen del archivo
     ya está en la página. Es un renglón de estado —quién revisó y cuándo—, no
     una tarjeta: mezclarlo con la miniatura hacía un bloque alto que competía
     con el contenido y no se leía como lo que es. */
  franja?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [zoom, setZoom] = useState(false);
  // Candidatos de miniatura; si uno falla (Drive intermitente) se prueba el
  // siguiente. Al agotarlos, no se muestra miniatura (en vez de un ícono roto).
  const miniCand = previewCandidates(url, 220);
  const [mi, setMi] = useState(0);
  const mini = mi < miniCand.length ? miniCand[mi] : null;
  // Veredicto vigente solo si es para ESTE mismo link (si cambió, no cuenta).
  // La acción guarda la url con .trim(), así que se compara normalizada.
  const vig = !!verif && verif.url === (url || "").trim();
  const ok = vig && verif!.correcto !== false;
  const malo = vig && verif!.correcto === false;

  // (El Esc y el bloqueo del scroll los maneja VisorArchivo.)

  const marcar = async (correcto: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await marcarLink(tipo, id, campo, url, correcto, etiqueta);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  };

  const fecha = verif?.en ? new Date(verif.en).toLocaleDateString("es-PE", { day: "numeric", month: "short" }) : "";
  const quien = (verif?.por || "").split(" ")[0];
  const firma = quien || fecha ? ` · ${[quien, fecha].filter(Boolean).join(" · ")}` : "";

  return (
    <div className={`link-verif ${ok ? "ok" : malo ? "malo" : ""} ${linea || franja ? "lv-linea" : ""} ${franja ? "lv-franja" : ""}`}>
      {mini && !franja && (
        <button className="lv-mini" onClick={() => setZoom(true)} title="Ver el contenido del link">
          <img src={mini} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={() => setMi(i => i + 1)} />
        </button>
      )}
      <div className="lv-cuerpo">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost lv-abrir">
          {icono} {etiqueta} ↗
        </a>

        {origen && <span className="lv-origen">{origen}</span>}
        {extra}

        {/* Veredicto actual. En la banda estrecha el ✅ verde YA dice
            «revisado»: repetir la palabra costaba 65 px que hacían saltar los
            botones a un segundo renglón. */}
        {ok && <span className="lv-sello lv-ok" title={`Revisado${firma}`}>
          {franja ? `✅${firma.replace(/^ · /, " ")}` : `✅ Revisado${firma}`}
        </span>}
        {malo && <span className="lv-sello lv-bad" title="El contenido está equivocado — hay que corregir el link">
          {franja ? `⚠ Equivocado${firma}` : `⚠ Contenido equivocado${firma} — corrige el link`}
        </span>}
        {!vig && <span className="lv-sello lv-pend">Sin revisar</span>}

        {/* El humano decide: correcto / incorrecto (toca de nuevo para quitar).
            Sin veredicto van con palabra —hay que invitar a revisar—; una vez
            resuelto basta el símbolo. Lo pendiente pide voz; lo resuelto no. */}
        <div className="lv-marcas">
          <button className={`lv-m lv-mok ${ok ? "on" : ""}`} onClick={() => marcar(true)} disabled={ocupado}
            title={ok ? "Quitar la revisión" : "El contenido es el correcto"}>
            {franja && vig ? "✓" : "✓ Correcto"}
          </button>
          <button className={`lv-m lv-mno ${malo ? "on" : ""}`} onClick={() => marcar(false)} disabled={ocupado}
            title={malo ? "Quitar la revisión" : "El contenido está equivocado — hay que corregir el link"}>
            {franja && vig ? "✗" : "✗ Incorrecto"}
          </button>
        </div>
      </div>

      {/* Un solo visor para toda la app: aquí se le añaden los dos botones del
          veredicto, que es lo único propio de esta pantalla. Antes esta lightbox
          solo sabía mostrar imágenes, así que verificar un PDF de Drive era
          mirar su portada y creerle; ahora abre el visor real. */}
      {zoom && <VisorArchivo url={url} onClose={() => setZoom(false)} acciones={<>
        {!ok && <button className="btn" onClick={() => marcar(true)} disabled={ocupado}>{ocupado ? "…" : "✓ Es correcto"}</button>}
        {!malo && <button className="btn btn-ghost" onClick={() => marcar(false)} disabled={ocupado}>✗ Está equivocado</button>}
      </>} />}
    </div>
  );
}
