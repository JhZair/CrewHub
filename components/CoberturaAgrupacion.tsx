"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { sumarIntegrante, quitarIntegrante, guardarAutorizacion,
  cambiarEstadoAutorizacion } from "@/app/clearance/acciones";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import {
  coberturaAgrupacion, resumenCobertura, ROTULO_CALIDAD, ROTULO_ESTADO_AUT,
  type FilaAutorizacion, type EstadoAutorizacion,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   «1 DE 11» — la regla R1, hecha pantalla

   Jennifer Pachaqutec firmó por Las Patronas. Eso compromete a la banda como
   colectivo —que toquen, que se les grabe— pero el derecho de intérprete de
   cada música es de cada música: el D. Leg. 822 lo dice de los derechos
   conexos del artista intérprete o ejecutante, y son personales.

   Hasta ayer el sistema contaba esa firma como once. Este componente existe
   para que no se pueda volver a creer: enseña el número, y las que faltan por
   su nombre.

   ── POR QUÉ SE NOMBRAN LAS QUE FALTAN ──
   «Faltan diez firmas» es un lamento. «Faltan Rosa, Elena y ocho más» es una
   tarea con final. La diferencia entre las dos frases es si alguien se pone.

   ── LAS FILAS SE PINTAN CON FUNCIONES, NO CON COMPONENTES ──
   ⚠ Un componente definido dentro del render es un tipo nuevo en cada pasada:
   React desmonta y vuelve a montar, y el campo que se está escribiendo pierde
   lo escrito y el foco. Ya costó una tanda averiguarlo.
   ══════════════════════════════════════════════════════════════════════════ */

export type IntegranteVista = {
  personaId: string;
  nombre: string;
  instrumento?: string | null;
};

export type AgrupacionVista = {
  id: string;
  nombre: string;
  tipo?: string | null;
  procedencia?: string | null;
  representanteId?: string | null;
  representanteNombre?: string | null;
  /** Lo que dice quien representa que son. Puede no coincidir con la lista, y
   *  esa diferencia es justo lo que hay que ver. */
  numeroDeclarado?: number | null;
  integrantes: IntegranteVista[];
};

export default function CoberturaAgrupacion({
  proyectoId, agrupacion, autorizaciones, personas, tipoInterpretacion = "interpretacion_musical",
}: {
  proyectoId: string;
  agrupacion: AgrupacionVista;
  /** TODAS las del proyecto: la cobertura filtra las suyas. */
  autorizaciones: FilaAutorizacion[];
  personas: CatalogoItem[];
  tipoInterpretacion?: "interpretacion_musical" | "interpretacion_danza";
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [instrumento, setInstrumento] = useState("");
  const [hoyFirma, setHoyFirma] = useState<Record<string, string>>({});

  const c = coberturaAgrupacion(
    agrupacion.id,
    agrupacion.integrantes.map(i => i.personaId),
    autorizaciones,
  );

  /* ⚠ TAMBIÉN EN EL CATÁLOGO, no solo entre las integrantes. El caso canónico
     es justo el contrario: Jennifer firma por Las Patronas y no tiene por qué
     estar dada de alta como integrante —el día 1 no lo está—. Buscando solo en
     la lista, el aviso que existe para que «1 de 11» no se lea como «firmado»
     decía «Firmó (sin nombre) como representante». */
  const nombreDe = (id: string) =>
    agrupacion.integrantes.find(i => i.personaId === id)?.nombre
    || personas.find(p => p.id === id)?.nombre
    || "(sin nombre)";

  /** La autorización de esa persona en esta banda, si existe. */
  /* ⚠ DEL MISMO TIPO que esta agrupación. Aceptando los dos, una integrante de
     un conjunto de danza que además tuviera una interpretación MUSICAL suya en
     el mismo proyecto salía marcada ✓ aquí, y «firmó» habría movido la
     autorización equivocada. */
  const autDe = (personaId: string) =>
    autorizaciones.find(a =>
      a.otorgante_persona_id === personaId
      && a.calidad_firmante === "titular"
      && a.tipo === tipoInterpretacion
      && (a.objeto_agrupacion_id === agrupacion.id || a.objeto_persona_id === personaId));

  const conError = async (fn: () => Promise<any>) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    let r: any;
    try { r = await fn(); }
    catch (e: any) {
      /* Sin esto, un corte deja el botón en «…» para siempre y sin decir nada. */
      setOcupado(false);
      setError(`No hubo respuesta: ${e?.message || "se cortó"}. Recarga antes de repetir.`);
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  /** Registrar que alguien firmó lo suyo. Es el gesto que más se repite, así
   *  que va en un botón de la fila y no dentro de un formulario. */
  const marcarFirmada = (personaId: string) => {
    const f = (hoyFirma[personaId] || "").trim();
    if (!f) { setError("Pon la fecha en que firmó antes de marcarla."); return; }
    const ya = autDe(personaId);
    return conError(() => ya
      ? cambiarEstadoAutorizacion(ya.id, proyectoId, "firmada", f)
      : guardarAutorizacion(proyectoId, {
          tipo: tipoInterpretacion,
          otorganteTipo: "persona", otorgantePersonaId: personaId,
          calidadFirmante: "titular",
          objetoAgrupacionId: agrupacion.id,
          estado: "firmada", firmadoEl: f,
        }));
  };

  const completa = c.integrantes > 0 && c.firmaron + c.noAplican >= c.integrantes;
  /* Lo que la representante dice que son, frente a los nombres que tenemos. La
     diferencia es una tarea de campo, no un error del sistema. */
  const faltanNombres = (agrupacion.numeroDeclarado || 0) - c.integrantes;

  const pintarIntegrante = (i: IntegranteVista) => {
    const a = autDe(i.personaId);
    const firmada = a?.estado === "firmada";
    const noAplica = a?.estado === "no_aplica";
    /* ⚠ Una NEGATIVA registrada no es «aún no se le ha pedido». Salía en el
       mismo ámbar y con el botón «firmó» al lado, que la habría convertido en
       una firma de un clic. Se dice lo que es, en rojo, y sin botón. */
    const rechazada = a?.estado === "rechazada";
    return (
      <div key={i.personaId} className="cob-fila">
        <span className="cob-marca" style={{
          color: firmada ? "var(--green)" : rechazada ? "var(--red)"
            : noAplica ? "var(--dim)" : "var(--yellow)",
        }}>{firmada ? "✓" : rechazada ? "✕" : noAplica ? "—" : "·"}</span>
        <Link href={`/entidad/persona/${i.personaId}`} className="cob-nom">{i.nombre}</Link>
        {i.instrumento && <span className="cob-inst">{i.instrumento}</span>}
        <span className="cob-est" style={{
          color: firmada ? "var(--green)" : rechazada ? "var(--red)"
            : noAplica ? "var(--dim)" : "var(--yellow)",
        }}>
          {firmada ? `firmó el ${a!.firmado_el}`
            : a ? ROTULO_ESTADO_AUT[a.estado as EstadoAutorizacion] || String(a.estado)
            : "sin pedir"}
        </span>
        <span style={{ flex: 1 }} />
        {!firmada && !noAplica && !rechazada && (
          <>
            <input type="date" className="cob-fecha" value={hoyFirma[i.personaId] || ""}
              onChange={e => setHoyFirma(h => ({ ...h, [i.personaId]: e.target.value }))} />
            <button type="button" className="trt-acc" disabled={ocupado}
              onClick={() => marcarFirmada(i.personaId)}>firmó</button>
          </>
        )}
        <button type="button" className="cob-x" disabled={ocupado}
          title="Sacarla de la lista de integrantes. ⚠ Su firma NO se borra: si firmó, el papel sigue valiendo."
          onClick={() => conError(() => quitarIntegrante(agrupacion.id, i.personaId))}>✕</button>
      </div>
    );
  };

  return (
    <div className="cob">
      <div className="cob-cab">
        <b className="cob-titulo">{agrupacion.nombre}</b>
        {agrupacion.procedencia && <span className="chip-tenue">{agrupacion.procedencia}</span>}
        <span className="cob-n" style={{ color: completa ? "var(--green)" : "var(--yellow)" }}>
          {completa ? "✓ " : "⚠ "}{c.firmaron} de {c.integrantes}
        </span>
      </div>

      <div className="cob-resumen">{resumenCobertura(c)}</div>

      {/* ⚠ EL AVISO QUE DA SENTIDO A TODO ESTO.
          Se pinta cuando existe la firma del colectivo y todavía faltan
          individuales, que es exactamente el estado en el que el sistema
          anterior decía que estaba todo resuelto. */}
      {c.hayFirmaDeRepresentante && !completa && (
        <div className="ces-aviso">
          ⚠ Firmó {c.representanteEsLaAgrupacion
            ? `la agrupación${agrupacion.representanteNombre ? `, representada por ${agrupacion.representanteNombre}` : ""}`
            : nombreDe(c.representanteId || "")}
          {" "}{ROTULO_CALIDAD.representante_agrupacion.txt}. {ROTULO_CALIDAD.representante_agrupacion.cubre}
        </div>
      )}

      {faltanNombres > 0 && (
        <div className="cob-nota">
          Dice que son {agrupacion.numeroDeclarado} y tenemos {c.integrantes} nombres:
          faltan {faltanNombres} por identificar. Sin su ficha no se les puede pedir la firma.
        </div>
      )}

      {agrupacion.integrantes.length
        ? agrupacion.integrantes.map(pintarIntegrante)
        : (
          <div className="trt-vacio">
            Ningún integrante registrado. Con la lista vacía, «0 de 0» no significa
            que esté todo firmado: significa que no se sabe a cuántas personas hay
            que pedirles el papel.
          </div>
        )}

      <div className="cob-pie">
        {abierto ? (
          <>
            <EntPicker etiqueta="👤 elegir persona" items={personas}
              onPick={pid => conError(async () => {
                const r = await sumarIntegrante(agrupacion.id, pid, instrumento);
                if (!r?.error) { setInstrumento(""); setAbierto(false); }
                return r;
              })} />
            <input className="cob-inst-in" value={instrumento} maxLength={120}
              placeholder="instrumento o rol (opcional)"
              onChange={e => setInstrumento(e.target.value)} />
            <button type="button" className="cob-x" onClick={() => setAbierto(false)}>✕</button>
          </>
        ) : (
          <button type="button" className="cesl-mas" disabled={ocupado}
            onClick={() => { setError(""); setAbierto(true); }}>＋ integrante</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
    </div>
  );
}
