"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarCesionProyecto, quitarCesionProyecto } from "@/app/actions";
import {
  TIPOS, META_TIPO, tipoDe, estadoDe, firmadaSinPrueba,
  ROTULO_ESTADO, COLOR_ESTADO, deTipo,
  type FilaCesion, type TipoCesion, type EstadoCesion,
} from "@/lib/cesiones";

/* ══════════════════════════════════════════════════════════════════════════
   QUIÉN AUTORIZÓ QUÉ — la lista de cesiones de una persona

   El caso que lo pidió: Jennifer Pachaqutec sale en cámara Y suena su banda.
   Son dos permisos distintos que nadie firma en el mismo papel.

   ── POR QUÉ UNA LISTA Y NO UNAS BURBUJAS ──
   ⚠ La primera versión eran dos burbujas de 📷 y 🎵 metidas en la tira de
   botones de la derecha, junto a la ficha, el ＋, el 🚫 y la ✕. Y no se podía
   leer: John registró la cesión de imagen de Lino, volvió a la lista y no supo
   si estaba —el icono se veía igual antes y después, porque el estado se
   contaba en un carácter (·, ✓, ⚠) perdido entre seis botones grises—.
   Un dato que hay que descifrar es un dato que no está.

   Así que ahora es una LISTA, debajo del nombre, con el estado escrito con
   todas sus letras. Ocupa más y se lee de un vistazo, que es de lo que se
   trataba: la pregunta «¿tengo el papel de esta persona?» se contesta mirando,
   no pasando el ratón por encima de un emoji.

   ── LA DE IMAGEN SE PINTA SIEMPRE ──
   Aunque no exista. Toda persona del reparto confirmado necesita una —se la va
   a grabar— así que su ausencia es un dato, no un hueco. La de música solo
   aparece si existe: no se puede deducir quién aporta una obra, y acusar a
   veinte personas de que les falta un papel que quizá no corresponde llena la
   pantalla de un ámbar que nadie puede apagar.

   ── EL PANEL VA EN FLUJO, NO FLOTANDO ──
   ⚠ Con `position:absolute` el panel DESAPARECÍA dentro de un contenedor con
   `overflow:hidden`, y eso ya pasó con los papeles de la cláusula 5.4: se
   abría, no se veía nada, y parecía que el botón estaba roto.
   ══════════════════════════════════════════════════════════════════════════ */

const ESTADOS: EstadoCesion[] = ["pendiente", "firmada", "no_aplica"];

export default function CesionesPersona({
  proyectoId, personaId, nombre, cesiones,
}: {
  proyectoId: string;
  personaId: string;
  nombre: string;
  /** SOLO las de esta persona. Vienen ya repartidas desde el servidor para no
   *  filtrar la lista entera una vez por fila. */
  cesiones: FilaCesion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<FilaCesion | null>(null);
  const [tipo, setTipo] = useState<TipoCesion>("imagen");
  const [estado, setEstado] = useState<EstadoCesion>("pendiente");
  const [url, setUrl] = useState("");
  const [firmado, setFirmado] = useState("");
  const [obra, setObra] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [quitando, setQuitando] = useState<string | null>(null);

  const nueva = (t: TipoCesion) => {
    /* ⚠ `quitando` se limpia SIEMPRE al abrir. Sin esto, cerrar el panel con la
       ✕ dejando un «¿quitar?» a medias hacía que la próxima vez se abriera con
       el botón destructivo ya armado, por una interacción que el usuario había
       abandonado. */
    setQuitando(null);
    setEditando(null); setTipo(t); setEstado("pendiente");
    setUrl(""); setFirmado(""); setObra(""); setMotivo(""); setNota("");
    setError(""); setAbierto(true);
  };

  const editar = (c: FilaCesion) => {
    setQuitando(null);
    setEditando(c);
    setTipo(tipoDe(c)); setEstado(estadoDe(c));
    setUrl(c.url || ""); setFirmado(c.firmado_en || ""); setObra(c.obra || "");
    setMotivo(c.motivo || ""); setNota(c.nota || "");
    setError(""); setAbierto(true);
  };

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    let r: any;
    try {
      r = await guardarCesionProyecto(proyectoId, {
        id: editando?.id, personaId, tipo, estado, url,
        firmadoEn: firmado, obra, motivo, nota,
      });
    } catch (e: any) {
      /* Sin esto, un corte deja el botón en «…» para siempre y sin decir nada.
         Es la misma red que en las demás acciones de esta ronda. */
      setOcupado(false);
      setError(`No hubo respuesta: ${e?.message || "se cortó"}. Recarga antes de repetir.`);
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(false); setEditando(null);
    router.refresh();
  };

  const quitar = async (id: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await quitarCesionProyecto(id, proyectoId);
    setOcupado(false);
    setQuitando(null);
    if (r?.error) { setError(r.error); return; }
    /* El panel se cierra: quedarse abierto sobre una fila que ya no existe
       invita a pulsar Guardar y recibir «ya no existe». */
    setAbierto(false); setEditando(null);
    router.refresh();
  };

  const img = deTipo(cesiones, "imagen")[0];
  const otras = [...deTipo(cesiones, "musica"), ...deTipo(cesiones, "otro")];

  /* ── UNA FILA DE LA LISTA ──
     Función y NO componente: un componente definido dentro del render es un
     tipo nuevo en cada pasada, React lo desmonta y lo vuelve a montar, y el
     panel abierto se cerraría solo al escribir. Ya costó una tanda. */
  const linea = (c: FilaCesion) => {
    const t = tipoDe(c), e = estadoDe(c);
    const dudosa = firmadaSinPrueba(c);
    /* El color lo manda la duda por encima del estado: «firmada sin documento»
       no puede salir del mismo verde que una firmada con su PDF, o el verde
       deja de significar nada. */
    const col = dudosa ? "var(--yellow)" : COLOR_ESTADO[e];
    return (
      <button key={c.id} type="button" className="cesl-fila" onClick={() => editar(c)}
        title={`${META_TIPO[t].largo}\n\nClic para editarla.`}>
        <span className="cesl-ico">{META_TIPO[t].ico}</span>
        <span className="cesl-que">{META_TIPO[t].corto}</span>
        <span className="cesl-est" style={{ color: col }}>
          {dudosa ? "firmada, falta el documento" : ROTULO_ESTADO[e]}
        </span>
        {/* Lo que se autorizó, cuando el tipo lo nombra: «Las Patronas — huayno
            del cargo». En la de imagen no hay nada que nombrar: es la persona. */}
        {c.obra && <span className="cesl-obra">{c.obra}</span>}
        {e === "no_aplica" && c.motivo && <span className="cesl-obra">{c.motivo}</span>}
        {c.firmado_en && <span className="cesl-fecha">{c.firmado_en}</span>}
        {c.url && <span className="cesl-doc">📎 documento</span>}
      </button>
    );
  };

  return (
    <div className="cesl">
      {img ? linea(img) : (
        /* No existe, y eso se dice con palabras. Antes era un «📷…» que se
           confundía con el «📷·» de una registrada pero pendiente, y por eso
           no se sabía si la de Lino se había guardado. */
        <button type="button" className="cesl-fila cesl-falta"
          onClick={() => nueva("imagen")}
          title={`${META_TIPO.imagen.largo}\n\nClic para registrarla.`}>
          <span className="cesl-ico">{META_TIPO.imagen.ico}</span>
          {/* Del mismo sitio que las demás: escrito a mano aquí, el día que el
              rótulo cambie —y acaba de cambiar— la fila de «no hay ninguna»
              diría algo distinto de las que sí existen. */}
          <span className="cesl-que">{META_TIPO.imagen.corto}</span>
          <span className="cesl-est">sin registrar</span>
        </button>
      )}
      {otras.map(linea)}

      <button type="button" className="cesl-mas"
        title="Registrar otra autorización: música, material de archivo…"
        onClick={() => nueva(deTipo(cesiones, "musica").length ? "otro" : "musica")}>
        ＋ autorización
      </button>

      {abierto && (
        /* En FLUJO, no flotando: ver la nota de la cabecera. */
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>{editando ? "Editar" : "Nueva"} cesión · {nombre}</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => { setAbierto(false); setEditando(null); }}>✕</button>
          </div>

          <div className="ces-campos">
            <label>
              <span>Qué autoriza</span>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoCesion)}>
                {TIPOS.map(t => (
                  <option key={t} value={t}>{META_TIPO[t].ico} {META_TIPO[t].corto}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select value={estado} onChange={e => setEstado(e.target.value as EstadoCesion)}>
                {ESTADOS.map(e2 => <option key={e2} value={e2}>{ROTULO_ESTADO[e2]}</option>)}
              </select>
            </label>
          </div>

          {/* Lo que hace ese tipo, dicho entero. «música» a secas no distingue
              la que se compuso de la que ya existía, y esa diferencia es
              justamente la que hizo falta el día que apareció Jennifer. */}
          <div className="ces-ayuda">{META_TIPO[tipo].largo}</div>

          {tipo !== "imagen" && (
            <label className="ces-l">
              <span>Qué obra</span>
              <input value={obra} maxLength={200}
                placeholder="Las Patronas — huayno de la fiesta"
                onChange={e => setObra(e.target.value)} />
            </label>
          )}

          <div className="ces-campos">
            <label>
              <span>Documento</span>
              <input value={url} maxLength={500} placeholder="enlace al PDF firmado"
                onChange={e => setUrl(e.target.value)} />
            </label>
            <label>
              <span>Firmado el</span>
              <input type="date" value={firmado} onChange={e => setFirmado(e.target.value)} />
            </label>
          </div>

          {estado === "firmada" && !url.trim() && (
            /* Se avisa ANTES de guardar, no después: sin el papel esto es
               alguien diciendo que hay una firma. Se deja guardar igual —el
               escaneo puede llegar mañana— pero el recuento no lo dará por
               bueno y la línea lo dirá en ámbar. */
            <div className="ces-aviso">
              ⚠ Firmada sin documento: se guarda, pero cuenta como pendiente de prueba hasta que esté el PDF.
            </div>
          )}

          {estado === "no_aplica" && (
            <label className="ces-l">
              <span>Por qué no aplica</span>
              <input value={motivo} maxLength={200}
                placeholder="es material de archivo con licencia libre…"
                onChange={e => setMotivo(e.target.value)} />
            </label>
          )}

          <label className="ces-l">
            <span>Nota</span>
            <input value={nota} maxLength={300} placeholder="opcional"
              onChange={e => setNota(e.target.value)} />
          </label>

          {error && <div className="err-inline">⚠ {error}</div>}

          <div className="ces-pie">
            {editando && (
              quitando === editando.id ? (
                <span style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center" }}>
                  ¿quitar el registro?
                  <button className="ces-si" onClick={() => quitar(editando.id)}>sí</button>
                  <button className="ces-no" onClick={() => setQuitando(null)}>no</button>
                </span>
              ) : (
                /* Quitar BORRA el registro. Revocar una cesión que existió se
                   marca `no aplica` con su motivo, que deja rastro; esto es
                   para deshacer un alta equivocada. */
                <button className="ces-quitar" disabled={ocupado}
                  title="Borra el registro. Si la cesión existió y se revocó, márcala «no aplica» con el motivo."
                  onClick={() => setQuitando(editando.id)}>Quitar</button>
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
