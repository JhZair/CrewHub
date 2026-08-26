"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarCarta } from "@/app/casilla/acciones";
import { subirAdjunto } from "@/lib/subirImagen";
import { textoDePdf } from "@/lib/leerPdf";
import { leerCarta, diaHabilTras, fondosDeActa, normActa, type CartaLeida } from "@/lib/cartaDafo";
import { useAviso } from "@/components/useConfirmar";

/* ══════════════════════════════════════════════════════════════════════════
   📥 CARGA POR LOTE DE CARTAS DE LA CASILLA

   Registrar una carta a mano son seis campos: número, fecha, asunto, fondo,
   plazo y enlace. Con veinte cartas atrasadas eso son ciento veinte tecleos y
   veinte oportunidades de que el número quede mal — y un número mal tecleado
   es una carta registrada dos veces.

   Todo eso está dentro del PDF. Se sueltan los archivos, se leen EN EL
   NAVEGADOR (lib/leerPdf.ts: el PDF no viaja a ningún servidor para leerse) y
   se enseña lo que se entendió de cada uno para que una persona lo confirme.

   ── LA MÁQUINA ACOTA, LA PERSONA DECIDE ──
   Nada se guarda hasta que alguien mira la tabla y pulsa. Lo que no se
   entendió se enseña vacío y en ámbar, no relleno a ojo: una fecha inventada
   en un requerimiento con plazo es exactamente el error que cuesta el fondo.

   ── EL PDF SÍ SE SUBE, PERO DESPUÉS ──
   Leerlo es local; guardarlo es una decisión aparte, y se hace solo con los
   que se registran. Es la prueba: el día del descargo hay que poder enseñar la
   carta, no solo decir que llegó.
   ══════════════════════════════════════════════════════════════════════════ */

type Fila = {
  archivo: File;
  carta: CartaLeida;
  /** El fondo emparejado por el número de acta, o "" si no se pudo. */
  postId: string;
  fecha: string;
  hasta: string;
  numero: string;
  asunto: string;
  /** Ya registrada en esta tanda; no se vuelve a mandar. */
  hecha?: boolean;
  /** Hay más de un fondo con esa acta: lo elige una persona. */
  variosFondos?: boolean;
  /** No entra en el registro (PDF repetido en la misma lista). */
  fuera?: boolean;
  /** Nos la notificaron pero va dirigida a otro: se guarda como prueba del
   *  error, sin fondo y sin plazo. */
  ajena?: boolean;
  error?: string | null;
};

export default function CartasLote({
  opciones, posts, fondoFijo,
}: {
  opciones: { id: string; etiqueta: string; enJuego?: boolean }[];
  /** Las postulaciones con su número de acta: es lo único que dice de qué
   *  fondo es cada carta. */
  posts: { id: string; codigo_acta?: string | null }[];
  /** ── DENTRO DE UN FONDO ──
   *  Cuando esto se abre desde la pestaña «Vida del fondo», el fondo ya se
   *  sabe: es este. Entonces el emparejamiento por acta deja de ser una
   *  búsqueda y pasa a ser una COMPROBACIÓN —¿el acta de esta carta es la de
   *  este fondo?—, que es justo la pregunta que habría evitado registrar como
   *  nuestras cuatro cartas de otro beneficiario. */
  fondoFijo?: { id: string; etiqueta: string; codigo_acta?: string | null } | null;
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [hechas, setHechas] = useState(0);
  /* El recuadro se enciende mientras se arrastra encima: sin esa señal, quien
     arrastra no sabe si va a soltar en el sitio bueno. */
  const [arrastra, setArrastra] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = async (files: FileList | null) => {
    if (!files?.length || ocupado) return;
    setLeyendo(true);
    const nuevas: Fila[] = [];
    /* Los números que ya están en la lista, para no meter el mismo PDF dos
       veces. La base lo aguantaría —el `upsert` corrige en vez de duplicar—
       pero el recuento diría «2 registradas» siendo una sola carta. */
    const yaEnLista = new Set(filas.map(f => f.numero.trim().toUpperCase()).filter(Boolean));
    for (const f of Array.from(files)) {
      let texto = "";
      try { texto = await textoDePdf(await f.arrayBuffer()); } catch { texto = ""; }
      const carta = leerCarta(texto);
      const candidatos = fondosDeActa(carta.acta, posts);
      const num = carta.numero || "";
      const repetida = !!num && yaEnLista.has(num.toUpperCase());
      if (num) yaEnLista.add(num.toUpperCase());

      /* ── ¿ES DE ESTE FONDO? ──
         Dentro de un fondo, la carta se vincula sola SALVO que su acta sea
         otra. Ese «salvo» es lo importante: es exactamente lo que pasó con las
         cuatro cartas del acta 061-2023 cargadas en el fondo del acta
         060-2023. Antes se vinculaba lo que casaba; ahora, además, se dice lo
         que NO casa. */
      const actaAjena = !!(fondoFijo && carta.acta && fondoFijo.codigo_acta
        && normActa(carta.acta) !== normActa(fondoFijo.codigo_acta));
      const postId = fondoFijo
        ? (actaAjena ? "" : fondoFijo.id)
        : (candidatos.length === 1 ? candidatos[0].id : "");

      nuevas.push({
        archivo: f, carta,
        postId,
        variosFondos: candidatos.length > 1,
        fecha: carta.fecha || "",
        /* El plazo se calcula, pero se puede corregir: el cálculo NO cuenta
           feriados y eso puede mover la fecha uno o dos días. */
        hasta: carta.fecha && carta.plazoDias ? (diaHabilTras(carta.fecha, carta.plazoDias) || "") : "",
        numero: num,
        asunto: carta.asunto || "",
        error: !texto.trim()
          ? "No se pudo leer el PDF. Si es un escaneo (una foto dentro del PDF) no tiene texto que leer: regístralo a mano en la casilla."
          : repetida ? "Esta carta ya está en la lista de arriba: se quita para no contarla dos veces."
            : actaAjena
              ? `⚠ Esta carta es del acta ${carta.acta} y este fondo es del acta ${fondoFijo!.codigo_acta}. Revisa a quién va dirigida: si no es tuya, márcala «no es nuestra».`
              : carta.aviso || null,
        fuera: repetida,
      });
    }
    setFilas(f => [...f, ...nuevas]);
    setLeyendo(false);
  };

  const set = (i: number, patch: Partial<Fila>) =>
    setFilas(fs => fs.map((f, n) => n === i ? { ...f, ...patch } : f));

  /* Listas = las que tienen lo mínimo para registrarse: número y fecha. Sin
     número no hay llave anti-duplicado; sin fecha, la línea de tiempo no sabe
     dónde ponerla. */
  const lista = (f: Fila) => !!f.numero.trim() && !!f.fecha && !f.hecha && !f.fuera;
  const listas = filas.filter(lista).length;

  const registrarTodas = async () => {
    if (ocupado) return;
    setOcupado(true);
    let ok = 0;
    try {
      /* Una a una y no en paralelo: veinte subidas simultáneas al Storage se
         atragantan, y aquí no hay ninguna prisa que justifique el riesgo. */
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        if (!lista(f)) continue;
        /* ⚠ CADA FILA EN SU PROPIO `try`. Sin esto, un corte de red a mitad de
           un lote de veinte reventaba el bucle: el botón se quedaba en
           «Registrando…» para siempre, las ya registradas sin marcar, y quien
           recargaba las mandaba otra vez. */
        try {
          /* El PDF primero: si falla la subida se registra igual la carta, sin
             enlace. Perder el registro entero por un adjunto sería cambiar un
             problema chico por uno grande. */
          let url: string | null = null;
          const sub = await subirAdjunto(f.archivo);
          if (sub.error) set(i, { error: `La carta se registra, pero el PDF no se pudo guardar: ${sub.error}` });
          else url = sub.url || null;

          const r: any = await registrarCarta({
            numero: f.numero, asunto: f.asunto, fecha: f.fecha,
            postulacionId: f.postId || null,
            docUrl: url, responderHasta: f.hasta || null,
            codigo: f.carta.codigo, firmante: f.carta.firmante,
            destinatario: f.carta.destinatario, ajena: !!f.ajena,
            sistema: "SGD",
          });
          if (r?.error) { set(i, { error: r.error }); continue; }
          ok++;
          set(i, { hecha: true, error: null });
        } catch {
          set(i, { error: "No se pudo registrar esta carta (¿se cayó la conexión?). Vuelve a pulsar: las que ya entraron no se repiten." });
        }
      }
    } finally {
      setOcupado(false);
      setHechas(h => h + ok);
    }
    if (ok) router.refresh();
    else avisar("No se registró ninguna. Mira el motivo en cada fila.");
  };

  return (
    <div className="cl">
      {aviso}
      {/* ── SOLTAR DE VERDAD ──
          Esto era un `<label>` con el input dentro: se podía hacer clic, pero
          ARRASTRAR encima no hacía nada —el navegador abría el PDF en otra
          pestaña— y el recuadro decía «soltar aquí». Un cartel que promete algo
          que la pantalla no hace.
          Mismo trato que el importador de SOL (components/ImportarSol.tsx):
          `onDragOver` con `preventDefault` —sin eso el navegador se queda el
          archivo— y el clic abre el selector. Las dos vías, siempre. */}
      <div className={`cl-soltar${arrastra ? " cl-encima" : ""}${ocupado ? " cl-quieto" : ""}`}
        onDragOver={e => { e.preventDefault(); if (!ocupado) setArrastra(true); }}
        onDragLeave={() => setArrastra(false)}
        onDrop={e => { e.preventDefault(); setArrastra(false); cargar(e.dataTransfer.files); }}
        onClick={() => { if (!ocupado) entrada.current?.click(); }}>
        <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple
          className="cl-file" disabled={ocupado}
          onChange={e => { cargar(e.target.files); e.target.value = ""; }} />
        <b>
          📥 Suelta aquí los PDF de la casilla electrónica — o haz clic para elegirlos
          {fondoFijo ? " · se vincularán a este fondo" : ""}
        </b>
        {/* Las dos cosas, dichas: leerlos es local, guardarlos no. El PDF de
            una carta lleva nombres y a veces DNI, y quien la sube tiene derecho
            a saber que queda accesible por su enlace a quien lo tenga. */}
        <span className="rc-dim">
          Se leen aquí, en tu ordenador: no se suben para leerlos. Al registrarlas, el PDF sí se
          guarda como prueba —queda accesible para quien tenga el enlace—.
        </span>
      </div>

      {leyendo && <p className="rc-dim">Leyendo los PDF…</p>}

      {filas.length > 0 && (
        <>
          <div className="cl-tabla">
            <div className="cl-fila cl-head">
              <span>Archivo</span><span>Carta</span><span>Notificada</span>
              <span>Responder hasta</span><span>Fondo</span>
            </div>
            {filas.map((f, i) => (
              <div key={`${f.archivo.name}-${i}`} className={`cl-fila${f.hecha ? " cl-ok" : ""}`}>
                <span className="cl-arch" title={f.archivo.name}>
                  {f.hecha ? "✓ " : ""}{f.archivo.name}
                  {f.carta.codigo && <i className="cl-cod">código {f.carta.codigo}</i>}
                  {/* ── A QUIÉN VA DIRIGIDA ──
                      Aquí saltó el error de verdad: cuatro cartas notificadas
                      a nosotros iban a nombre de otro presidente y otra
                      asociación. Sin este renglón, se habrían registrado como
                      nuestras y habrían pedido una respuesta que no nos tocaba
                      dar. */}
                  {f.carta.destinatario && (
                    <i className="cl-cod cl-dest">
                      para {f.carta.destinatario}
                      {f.carta.entidad ? ` · ${f.carta.entidad}` : ""}
                    </i>
                  )}
                  <label className="cl-ajena" title="Nos la notificaron, pero va dirigida a otro beneficiario">
                    <input type="checkbox" checked={!!f.ajena} disabled={f.hecha || ocupado}
                      onChange={e => set(i, { ajena: e.target.checked })} />
                    no es nuestra
                  </label>
                </span>
                <span className="cl-num">
                  <input value={f.numero} disabled={f.hecha || ocupado}
                    aria-label={`Número de la carta de ${f.archivo.name}`}
                    onChange={e => set(i, { numero: e.target.value })}
                    className={`rp-input cl-inp${f.numero ? "" : " cl-falta"}`}
                    placeholder="CARTA N° …" />
                  <input value={f.asunto} disabled={f.hecha || ocupado}
                    aria-label={`Asunto de ${f.archivo.name}`}
                    onChange={e => set(i, { asunto: e.target.value })}
                    className="rp-input cl-inp cl-asunto" placeholder="asunto" />
                </span>
                <span>
                  <input type="date" value={f.fecha} disabled={f.hecha || ocupado}
                    aria-label={`Fecha de notificación de ${f.archivo.name}`}
                    onChange={e => set(i, { fecha: e.target.value })}
                    className={`rp-input cl-inp${f.fecha ? "" : " cl-falta"}`} />
                  {f.carta.hora && <i className="cl-cod">firmada {f.carta.hora}</i>}
                </span>
                <span>
                  <input type="date" value={f.ajena ? "" : f.hasta} disabled={f.hecha || ocupado || !!f.ajena}
                    aria-label={`Plazo para responder de ${f.archivo.name}`}
                    onChange={e => set(i, { hasta: e.target.value })}
                    className="rp-input cl-inp" />
                  {f.carta.plazoDias
                    ? <i className="cl-cod">{f.carta.plazoDias} días hábiles · sin contar feriados</i>
                    : <i className="cl-cod">la carta no pone plazo</i>}
                </span>
                <span>
                  <select value={f.ajena ? "" : f.postId} disabled={f.hecha || ocupado || !!f.ajena}
                    aria-label={`Fondo de ${f.archivo.name}`}
                    onChange={e => set(i, { postId: e.target.value })}
                    className={`rp-sel cl-inp${f.postId ? "" : " cl-falta"}`}>
                    <option value="">— sin vincular —</option>
                    {opciones.map(o => (
                      <option key={o.id} value={o.id}>{o.enJuego ? "• " : ""}{o.etiqueta}</option>
                    ))}
                  </select>
                  {f.carta.acta ? (
                    <i className="cl-cod">
                      acta {f.carta.acta}
                      {/* «Ninguno» y «varios» no se arreglan igual: el primero
                          pide cargar el acta en la ficha del fondo; el segundo,
                          elegir aquí. El mismo texto para los dos mandaba a
                          buscar donde no era. */}
                      {f.postId ? "" : f.variosFondos
                        ? " — hay varios fondos con esa acta: elige"
                        : " — ningún fondo tiene esa acta cargada"}
                    </i>
                  ) : (
                    <i className="cl-cod">la carta no dice de qué acta es</i>
                  )}
                </span>
                {f.error && <span className="cl-err" role="alert">⚠ {f.error}</span>}
              </div>
            ))}
          </div>

          <div className="cl-pie">
            <button className="btn" disabled={ocupado || !listas} onClick={registrarTodas}>
              {ocupado ? "Registrando…" : `Registrar ${listas} carta(s)`}
            </button>
            <button className="btn btn-ghost" disabled={ocupado}
              onClick={() => { setFilas([]); setHechas(0); }}>Vaciar la lista</button>
            {hechas > 0 && <span className="cl-hechas">✓ {hechas} registrada(s)</span>}
            <span className="rc-dim">
              {/* Se dice por qué una fila no se va a mandar, en vez de dejar
                  el botón contando menos de las que hay. */}
              {filas.length - listas - filas.filter(f => f.hecha).length > 0
                ? `${filas.length - listas - filas.filter(f => f.hecha).length} sin número o sin fecha: se quedan fuera hasta completarlas.`
                : "Una carta ya registrada se corrige, no se duplica: la llave es su número."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
