"use client";
import { useEffect, useState } from "react";
import Copiar from "@/components/Copiar";

/* La hoja de postular: todo lo que se pide en el formulario, junto y en un
 * clic — y arriba, el veredicto.
 *
 * Nace de una pregunta que la ficha no podía responder: se veían los tres
 * responsables con su cargo y nada más. Ni sus DNI, ni si estaban vigentes,
 * ni su estado en SUNAT. Y una empresa no postula sola: firma alguien. Un
 * DNI vencido invalida esa firma, y un representante no habido arrastra a la
 * empresa entera. Estar «libre para postular» era un juicio hecho mirando
 * solo la mitad de lo que hay que mirar.
 *
 * El veredicto va arriba y los datos abajo, en ese orden a propósito: quien
 * abre esto viene con una pregunta («¿puedo postular con ésta?») antes que
 * con una tarea («llenar el formulario»). Contestar primero y servir después.
 */

type Miembro = {
  id: string; cargo: string | null;
  persona: any;            // nombre, alias, ruc_dni, dni_vencimiento, estado_sunat, condicion_sunat, nombre_reniec
  ruc: string | null;      // calculado del DNI, viene resuelto del servidor
  trabas: string[];        // lo que está mal
  dudas: string[];         // lo que no sabemos, que no es lo mismo
  reserva: Veredicto;      // su DNI, ¿cuenta para la reserva regional?
};
type Veredicto = "si" | "no" | "falta";

export default function HojaPostulacion({
  empresa, miembros, trabasEmp, libre, partesReserva, reserva,
}: {
  empresa: any;
  miembros: Miembro[];
  trabasEmp: string[];
  libre: boolean;
  partesReserva: { que: string; v: Veredicto; region: string }[];
  reserva: Veredicto;
}) {
  const [abierto, setAbierto] = useState(false);

  // Escape cierra: es lo que la mano hace sin pensar
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [abierto]);

  const conProblema = miembros.filter(m => m.trabas.length > 0);
  const conDuda = miembros.filter(m => !m.trabas.length && m.dudas.length > 0);
  /* Listo de verdad = la empresa Y su gente. Antes «libre» solo miraba la
     empresa, y con eso alguien podía irse tranquilo a postular con un
     presidente de DNI vencido. */
  const todoOk = libre && conProblema.length === 0;
  // Puede postular, pero hay cosas que nadie miró. No es lo mismo que estar bien.
  const conReparo = todoOk && conDuda.length > 0;

  return (
    <>
      <button className="btn" onClick={() => setAbierto(true)}
        title="Todo lo que pide el formulario, junto: la empresa y sus responsables"
        style={{ fontSize: 12, padding: "7px 12px", width: "100%",
          background: todoOk ? "var(--green)" : undefined,
          color: todoOk ? "#06210f" : undefined, fontWeight: 700 }}>
        {todoOk ? "✅" : "⚠"} Hoja para postular
      </button>

      {abierto && (
        <div className="modal-fondo" onClick={() => setAbierto(false)}>
          <div className="modal-caja" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <b style={{ fontSize: 15 }}>📋 Hoja para postular</b>
              <span style={{ flex: 1 }} />
              <button onClick={() => setAbierto(false)}
                style={{ color: "var(--dim)", background: "none", border: "none",
                  cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* ── El veredicto, primero ── */}
            <div className="card" style={{
              marginBottom: 14,
              borderColor: todoOk ? "rgba(46,204,113,.4)" : "rgba(244,180,0,.4)",
              background: todoOk ? "rgba(46,204,113,.07)" : "rgba(244,180,0,.06)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14,
                color: todoOk ? "var(--green)" : "var(--yellow)" }}>
                {todoOk ? "✅ Lista para postular" : "⚠ Todavía no"}
              </div>
              {todoOk ? (
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  {/* Antes decía «sus 3 responsables con DNI vigente y SUNAT
                      sano» sin mirar si alguien lo había comprobado. Afirmar
                      que está sano lo que nunca se consultó es peor que no
                      decir nada: da tranquilidad falsa justo antes de firmar. */}
                  Papeles de la empresa en regla, sin fondos encima, y nada objetable
                  en sus {miembros.length} responsable(s).
                  {conReparo && (
                    <div style={{ color: "var(--yellow)", marginTop: 5 }}>
                      ⚠ Pero hay datos que nadie comprobó — el sistema no puede decir que estén bien:
                      {" "}{conDuda.map(m => `${m.persona?.alias || m.persona?.nombre?.split(" ")[0]} (${m.dudas.join(", ")})`).join(" · ")}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  {trabasEmp.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <b style={{ color: "var(--dim)" }}>La empresa:</b>{" "}
                      <span style={{ color: "var(--yellow)" }}>{trabasEmp.join(" · ")}</span>
                    </div>
                  )}
                  {conProblema.map(m => (
                    <div key={m.id} style={{ marginBottom: 3 }}>
                      <b style={{ color: "var(--dim)" }}>{m.cargo || "Responsable"}
                        {" "}({m.persona?.alias || m.persona?.nombre}):</b>{" "}
                      <span style={{ color: "var(--red)" }}>{m.trabas.join(" · ")}</span>
                    </div>
                  ))}
                  {!miembros.length && (
                    <div style={{ color: "var(--red)" }}>
                      Sin responsables registrados — alguien tiene que firmar.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── La empresa ── */}
            <div className="h4" style={{ marginTop: 0 }}>🏢 La empresa</div>
            <div className="card" style={{ marginBottom: 14 }}>
              <Dato lbl="Razón social" v={empresa.razon_social || empresa.nombre} />
              <Dato lbl="RUC" v={empresa.ruc} />
              <Dato lbl="Domicilio fiscal" v={empresa.domicilio_fiscal} />
              <Dato lbl="RENCA" v={empresa.renca} />
              <Dato lbl="Constitución" v={fecha(empresa.fecha_constitucion)} />
              <Dato lbl="Vigencia de poder (emisión)" v={fecha(empresa.vigencia_poder_fecha)} />
            </div>

            {/* ── La reserva regional ──
                No es un puntaje: es plata apartada. En Cortometrajes 2026 son
                S/ 279,000 de S/ 558,000 — la mitad del concurso— para
                empresas fuera de Lima Metrop. y Callao. Va aquí y no en un
                aviso porque no es un problema que resolver: es una puerta que
                puede estar abierta y nadie sabía. */}
            <div className="h4">🗺 Reserva regional</div>
            <div className="card" style={{ marginBottom: 14,
              borderColor: reserva === "si" ? "rgba(46,204,113,.35)"
                : reserva === "no" ? "var(--border)" : "rgba(244,180,0,.35)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6,
                color: reserva === "si" ? "var(--green)"
                  : reserva === "no" ? "var(--dim)" : "var(--yellow)" }}>
                {reserva === "si" ? "✅ Puede aplicar a la reserva"
                  : reserva === "no" ? "— No aplica: figura en Lima Metropolitana o Callao"
                  : "⚠ No se puede saber todavía"}
              </div>
              {/* Decir QUÉ falta, no solo que falta. Un «⚠ no se puede saber»
                  encima de quince filas deja a alguien buscando cuál está en
                  gris. */}
              {reserva === "falta" && (() => {
                const sinDni = miembros.filter(m => m.reserva === "falta");
                const sinEmp = partesReserva.filter(p => p.v === "falta");
                return (
                  <div style={{ color: "var(--yellow)", fontSize: 11.5, marginBottom: 6 }}>
                    Falta{" "}
                    {[
                      sinEmp.length && `${sinEmp.length} dato(s) de la empresa`,
                      !miembros.length && "cargar quién firma",
                      sinDni.length && `la región del DNI de ${sinDni.map(m => m.persona?.alias || m.persona?.nombre?.split(" ")[0]).join(", ")}`,
                    ].filter(Boolean).join(" · ")}
                    . Las bases piden que los responsables acrediten domicilio de región
                    con su documento de identidad.
                  </div>
                );
              })()}
              {partesReserva.map((p, i) => (
                <div className="ficha-row" key={i}>
                  <span className="fk" style={{ fontSize: 10.5 }}>{p.que}</span>
                  <span className="fv" style={{
                    color: p.v === "si" ? "var(--green)" : p.v === "no" ? "var(--red)" : "var(--dim)",
                    background: p.v === "si" ? "rgba(46,204,113,.07)"
                      : p.v === "no" ? "rgba(255,77,94,.09)" : "transparent",
                    borderRadius: 6, padding: "1px 7px",
                  }}>
                    {p.v === "si" ? `✅ ${p.region}`
                      : p.v === "no" ? `⛔ ${p.region}`
                      : p.region === "Lima" ? "⚠ Lima — falta la provincia"
                      : "⚠ sin cargar"}
                  </span>
                </div>
              ))}
              {/* La dirección del DNI de cada responsable: las bases la piden
                  «según los datos consignados en sus documentos de identidad». */}
              {miembros.map(m => (
                <div className="ficha-row" key={m.id}>
                  <span className="fk" style={{ fontSize: 10.5 }}>
                    DNI de {m.persona?.alias || m.persona?.nombre?.split(" ")[0]}
                  </span>
                  <span className="fv" style={{
                    color: m.reserva === "si" ? "var(--green)" : m.reserva === "no" ? "var(--red)" : "var(--dim)",
                    background: m.reserva === "si" ? "rgba(46,204,113,.07)"
                      : m.reserva === "no" ? "rgba(255,77,94,.09)" : "transparent",
                    borderRadius: 6, padding: "1px 7px",
                  }}>
                    {m.reserva === "si" ? `✅ ${m.persona?.region}`
                      : m.reserva === "no" ? `⛔ ${m.persona?.region}`
                      : m.persona?.region === "Lima" ? "⚠ Lima — falta la provincia"
                      : "⚠ sin región"}
                  </span>
                </div>
              ))}
              {/* Lo que el sistema no puede saber. Decirlo es parte del
                  trabajo: una hoja que calla lo que no sabe deja a alguien
                  creyendo que ya está. */}
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                Esto no lo puede comprobar el sistema, y va aparte en la carpeta:
                la Declaración Jurada de que la empresa produce principalmente en la región,
                que el proyecto contemple al menos una actividad fuera de Lima y Callao,
                y —en Cortometrajes— ejecutar ≥30% del estímulo en bienes y servicios de regiones,
                con el equipo técnico y las jefaturas de área en su mayoría con DNI de región.
              </div>
            </div>

            {/* ── Sus responsables ── */}
            <div className="h4">👥 Responsables · {miembros.length}</div>
            {miembros.map(m => (
              <div className="card" key={m.id} style={{ marginBottom: 10,
                borderColor: m.trabas.length ? "rgba(255,77,94,.3)" : undefined }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)" }}>
                    {m.cargo || "—"}
                  </span>
                  <b style={{ fontSize: 13.5 }}>{m.persona?.nombre}</b>
                  {m.trabas.length > 0 && (
                    <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)", fontWeight: 700 }}>
                      ⚠ {m.trabas.join(" · ")}
                    </span>
                  )}
                </div>
                {/* El nombre RENIEC es el que pide el formulario, no el nuestro */}
                <Dato lbl="Nombre en RENIEC" v={m.persona?.nombre_reniec}
                  falta="sin verificar en RENIEC — el formulario pide el nombre oficial" />
                <Dato lbl="DNI" v={m.persona?.ruc_dni} />
                <Dato lbl="DNI vence" v={fecha(m.persona?.dni_vencimiento)}
                  estado={venceMal(m.persona?.dni_vencimiento) ? "mal" : "ok"}
                  falta="sin fecha — puede que no caduque, o que nadie la cargó" />
                {/* El RUC no se guarda: se calcula del DNI. Nadie lo verificó
                    contra SUNAT, así que es deducción, no comprobación. */}
                <Dato lbl="RUC (del DNI)" v={m.ruc} estado="duda" />
                <Dato lbl="SUNAT" copiar={false}
                  estado={m.trabas.some(t => /sunat|habido/i.test(t)) ? "mal" : "ok"}
                  v={m.persona?.estado_sunat
                    ? `${String(m.persona.estado_sunat).replace(/_/g, " ")} · ${String(m.persona.condicion_sunat || "").replace(/_/g, " ")}`.trim()
                    : ""}
                  falta="sin verificar — no sabemos si está activo y habido" />
              </div>
            ))}
            {!miembros.length && (
              <div className="empty">Sin responsables registrados.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* dd/mm/aaaa: es lo que piden los formularios, y reescribir un 2025-10-15 a
   mano es volver al problema que esto vino a resolver. */
const fecha = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
// Vencido de verdad. Sin fecha no se pinta rojo: no saber ≠ estar mal.
const venceMal = (f?: string | null) =>
  !!f && f < new Date().toISOString().slice(0, 10);

/* Una fila de la hoja, en tres estados y no en dos:
 *
 *   ok    → verde tenue. Está, y lo comprobamos.
 *   mal   → rojo tenue. Está, y está mal.
 *   duda  → gris. Nadie lo miró — y eso NO es verde.
 *
 * El tercero es el que faltaba y el que más importa: sin él, «no verificado»
 * se pinta igual que «verificado y correcto», y la pantalla afirma cosas que
 * nadie comprobó. Los colores son tenues a propósito: el dato manda, el color
 * acompaña — si el verde grita, ya no se lee el RUC.
 *
 * El hueco se dice, no se esconde: un dato que falta al llenar un formulario
 * importa más que uno que está, porque es el que te va a detener.
 */
function Dato({ lbl, v, falta, copiar = true, estado = "ok" }: {
  lbl: string; v?: string | null; falta?: string; copiar?: boolean;
  estado?: "ok" | "mal" | "duda";
}) {
  const s = String(v ?? "").trim();
  const col = estado === "mal" ? "var(--red)" : estado === "duda" ? "var(--dim)" : "var(--green)";
  const fondo = estado === "mal" ? "rgba(255,77,94,.09)"
    : estado === "duda" ? "transparent" : "rgba(46,204,113,.07)";
  return (
    <div className="ficha-row">
      <span className="fk">{lbl}</span>
      <span className="fv" style={s ? {
        color: col, background: fondo, borderRadius: 6, padding: "1px 7px",
      } : undefined}>
        {s ? (copiar ? <Copiar valor={s} etiqueta={lbl.toLowerCase()}>{s}</Copiar> : s)
          : <i style={{ color: "var(--dim)", fontStyle: "normal", fontSize: 11.5 }}>
              ⚠ {falta || "falta"}
            </i>}
      </span>
    </div>
  );
}
