"use client";
import { confirmarMiMes, reabrirMiMes, guardarRhe } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hoyLima } from "@/lib/fechas";
import { rotuloMedio } from "@/lib/pagos";

const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

type RheMio = {
  id: string; numero: string | null; fecha: string; monto: number; url: string | null;
  pagado_en: string | null; pagado_url: string | null; pagado_medio: string | null;
};

/* El ciclo de pago del mes, lado de la persona: confirmar (firma), ver el
   recibo cuando el admin liquida, y REGISTRAR EL RHE PROPIO. El mes es
   automático; esto es el cierre. */
export default function CicloMes({ anio, mes, mesNombre, liq, personaId, rhes, celda = false }: {
  anio: number; mes: number; mesNombre: string; liq: any | null;
  personaId?: string | null; rhes?: RheMio[];
  /* ── COMO UNA TARJETA MÁS DEL PAGO ──
   * Mientras el mes está abierto o confirmado, esto es una frase y un botón, y
   * ocupaba una banda entera del ancho de la página por encima de «Mi pago».
   * Justo debajo, la fila de tarjetas tiene cuatro huecos y solo tres cosas
   * que poner. El estado del ciclo ES parte de la misma pregunta —cuánto
   * llevo, cuánto me aprobaron, qué falta, y si ya lo cerré— así que su sitio
   * es el cuarto hueco.
   * Una vez LIQUIDADO deja de caber: ahí aparece el recibo, con su importe, su
   * fecha y el formulario para registrar el RHE. Eso sigue siendo un panel
   * entero, y la página lo pinta donde estaba. */
  celda?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    setOcupado(true); const r: any = await fn(); setOcupado(false);
    if (r?.error) alert(r.error); else router.refresh();
  };

  if (celda && liq?.estado !== "liquidado") {
    const confirmado = liq?.estado === "confirmado";
    /* Sin borde de color: es una tarjeta MÁS de la fila del pago, no una
       alerta. El realce va en «Registrar mi jornada», que es la única cosa de
       esta pantalla que pide una acción todos los días — confirmar el mes se
       hace una vez, y ya lo anuncia su botón. */
    return (
      <div className="kpi kpi-ciclo">
        <span className="l">📅 Mi ciclo · {mesNombre}</span>
        <span className="n" style={{
          fontSize: 19, color: confirmado ? "var(--green)" : "var(--text)",
        }}>
          {confirmado ? "Confirmado" : "Abierto"}
        </span>
        <span className="s">
          {confirmado
            ? <>el {fmt(liq.confirmado_en)} · esperando liquidación</>
            : "confírmalo cuando esté completo"}
        </span>
        {confirmado
          ? <button className="btn btn-ghost" disabled={ocupado}
              style={{ marginTop: 6, fontSize: 12, padding: "5px 10px" }}
              onClick={() => run(() => reabrirMiMes(anio, mes))}>↩ Reabrir</button>
          : <button className="btn" disabled={ocupado}
              style={{ marginTop: 6, fontSize: 12, padding: "6px 10px" }}
              onClick={() => run(() => confirmarMiMes(anio, mes))}>
              {ocupado ? "…" : "✓ Confirmar mi mes"}
            </button>}
      </div>
    );
  }

  if (liq?.estado === "liquidado") {
    return (
      <div className="card" style={{ borderColor: "rgba(46,204,113,.4)", background: "rgba(46,204,113,.05)" }}>
        <div className="panel-h" style={{ color: "var(--green)" }}>🧾 Recibo interno · {mesNombre} {anio}</div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "var(--teal)" }}>{money(liq.total_monto)}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{liq.total_jornadas} jornadas</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--dim)", fontSize: 12 }}>Liquidado el {fmt(liq.liquidado_en)}</span>
        </div>
        <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "8px 0 0" }}>
          Mes cerrado. Para corregir algo, pide al administrador que reabra la liquidación.
        </p>

        {/* ── TU RECIBO ──
            Esto antes solo se podía hacer desde /admin, así que el recibo de
            quien lo gira él mismo tenía que pasar por administración para
            entrar al sistema. Todo lo que no alcanzaba a teclear una sola
            persona se quedaba fuera, y lo que no está no se rinde.
            Aparece aquí y no en otra pantalla porque este es el momento en que
            la persona SABE el importe: acaba de leerlo arriba. Girar el recibo
            por otra cifra es el error que esto evita. */}
        {personaId && <MiRecibo liq={liq} personaId={personaId} rhes={rhes || []} />}
      </div>
    );
  }

  if (liq?.estado === "confirmado") {
    return (
      <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 13.5 }}>✅ Confirmaste tu mes de {mesNombre}</span>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>el {fmt(liq.confirmado_en)} · esperando que el admin lo liquide</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" disabled={ocupado} style={{ fontSize: 12 }}
            onClick={() => run(() => reabrirMiMes(anio, mes))}>↩ Reabrir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>📅 Tu ciclo de <b>{mesNombre}</b> está abierto — registra tus jornadas y confírmalo cuando esté completo.</span>
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={ocupado} onClick={() => run(() => confirmarMiMes(anio, mes))}>
          {ocupado ? "…" : "✓ Confirmar mi mes"}
        </button>
      </div>
    </div>
  );
}

/* ── EL RECIBO PROPIO ──
 *
 * Registrar un RHE era tarea exclusiva de administración, exigida por el motor
 * de la base (db/auditoria-financiera.sql). La razón era buena —que ningún dato
 * de plata se toque sin dejar huella— pero el efecto era un cuello de botella:
 * quien gira su propio recibo tenía que mandárselo a alguien para que lo
 * tecleara. db/rhe-permisos.sql abrió la puerta justa: cada uno puede escribir
 * el recibo girado A SU NOMBRE, y la auditoría sigue registrando quién lo hizo.
 *
 * El importe viene puesto con el de la liquidación. No es comodidad: girar el
 * RHE por una cifra distinta de la liquidada es el error caro de este proceso
 * —descuadra la rendición y no se ve hasta que alguien suma— y se evita
 * simplemente no obligando a teclear el número dos veces.
 */
function MiRecibo({ liq, personaId, rhes }: {
  liq: any; personaId: string; rhes: RheMio[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  /* El concepto va PRELLENADO y editable, no fijo. Prellenado porque nadie
     debería teclear «Jornadas de 07/2026» a mano; editable porque el que manda
     es el que dice el recibo de verdad: si en SUNAT se escribió «Servicios de
     producción audiovisual», el informe a DAFO tiene que decir eso y no lo que
     el sistema dedujo. Un concepto inventado por el sistema no se descubre
     hasta que alguien compara el informe con el PDF, y para entonces ya se
     entregó.
     El PROYECTO no se pide, y es a propósito: un recibo que cubre un mes
     entero abarca varios —o ninguno— y obligar a elegir uno inventaría el
     dato. El eje que usa la rendición es la postulación del fondo, y eso lo
     asigna administración desde /fondo, con el presupuesto delante. */
  const [f, setF] = useState({
    numero: "", fecha: hoyLima(), monto: String(Math.round(Number(liq?.total_monto || 0))),
    url: "",
    concepto: `Jornadas de ${liq?.mes ? String(liq.mes).padStart(2, "0") : "—"}/${liq?.anio || ""}`,
  });

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await guardarRhe({
      personaId, numero: f.numero, fecha: f.fecha, monto: f.monto, url: f.url,
      concepto: f.concepto,
      retencion: "", proyectoId: "",
      liquidacionId: liq?.id,
      /* Se registra a sí mismo, así que lo giró él. Preguntarlo sería pedir un
         dato que la propia acción ya contesta. */
      giradoPor: "propio",
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(false); router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  if (rhes.length) {
    return (
      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 9,
        display: "flex", flexDirection: "column", gap: 5 }}>
        {rhes.map(r => (
          <div key={r.id} style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>🧾 {r.numero || "sin número"}</span>
            <span style={{ color: "var(--teal)", fontWeight: 700 }}>{money(Number(r.monto))}</span>
            {r.url
              ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="dato-btn">📎 recibo</a>
              : <span style={{ color: "var(--yellow)" }}>📎 falta el PDF</span>}
            <span style={{ flex: 1 }} />
            {/* Lo que la persona de verdad quiere saber al entrar aquí: si ya
                le pagaron. Estaba en el sistema y solo lo veía administración. */}
            {r.pagado_en ? (
              <span style={{ color: "var(--green)" }}>
                🟢 {rotuloMedio(r.pagado_medio)} el {fmt(r.pagado_en)}
                {r.pagado_url && (
                  <> · <a href={r.pagado_url} target="_blank" rel="noopener noreferrer">voucher</a></>
                )}
              </span>
            ) : (
              <span style={{ color: "var(--muted)" }}>→ pendiente de pago</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (!abierto) {
    return (
      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 9,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", fontSize: 12, flex: 1, minWidth: 220 }}>
          Si giraste tu recibo por este monto, regístralo aquí para que entre a la rendición.
        </span>
        <button className="btn btn-ghost" style={{ fontSize: 12 }}
          onClick={() => setAbierto(true)}>＋ Registrar mi RHE</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })}
          placeholder="E001-123" style={{ ...inp, width: 120 }} />
        <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })}
          style={{ ...inp, width: 145 }} />
        <input value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })}
          inputMode="decimal" title="Viene con el monto liquidado. Cámbialo solo si giraste por otra cifra."
          style={{ ...inp, width: 100 }} />
        <input value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })}
          placeholder="Concepto"
          title="Copia aquí el concepto tal como lo escribiste en el recibo: es lo que va al informe de DAFO."
          style={{ ...inp, width: 190 }} />
        <input value={f.url} onChange={e => setF({ ...f, url: e.target.value })}
          placeholder="Link del PDF del recibo"
          style={{ ...inp, flex: 1, minWidth: 160 }} />
        <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "6px 13px" }}
          onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
        <button className="btn btn-ghost" style={{ fontSize: 12 }}
          onClick={() => { setAbierto(false); setError(""); }}>Cancelar</button>
      </div>
      <p style={{ color: "var(--dim)", fontSize: 11, margin: "7px 0 0" }}>
        El monto viene del mes liquidado: cámbialo solo si de verdad giraste otra cifra.
        El concepto va como lo dejes — que diga lo mismo que tu recibo, porque es lo que va al informe.
      </p>
    </div>
  );
}
