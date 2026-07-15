"use client";
import { verificarRucSunat, verificarSunatLote, verificarDniReniec, verificarRucPersona } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Botón RENIEC: ¿el nombre registrado coincide con el DNI? */
export function BotonVerificarDni({ personaId }: { personaId: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const verificar = async () => {
    if (ocupado) return;
    setOcupado(true); setMsg("");
    const r: any = await verificarDniReniec(personaId);
    setOcupado(false);
    if (r?.error) { setMsg("⚠ " + r.error); return; }
    setMsg(r.coincide
      ? `✔ RENIEC: ${r.nombreReniec}`
      : `⚠ RENIEC dice: ${r.nombreReniec} — revisa el nombre registrado`);
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-ghost" disabled={ocupado} onClick={verificar}
        title="Consulta el DNI en RENIEC y confirma que el nombre registrado sea el correcto"
        style={{ fontSize: 12, padding: "7px 12px" }}>
        {ocupado ? "Consultando..." : "🪪 Verificar DNI (RENIEC)"}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("✔") ? "var(--green)" : "var(--yellow)" }}>{msg}</span>}
    </span>
  );
}

/* Persona natural: su RUC se calcula del DNI y se consulta en SUNAT.
   Sirve para saber si puede emitir recibo por honorarios. */
export function BotonRucPersona({ personaId }: { personaId: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const verificar = async () => {
    if (ocupado) return;
    setOcupado(true); setMsg("");
    const r: any = await verificarRucPersona(personaId);
    setOcupado(false);
    if (r?.error) { setMsg("⚠ " + r.error); return; }
    setMsg(r.estado ? `✔ RUC ${r.ruc}: ${r.estado} · ${r.condicion}` : `⚠ SUNAT no halló el RUC ${r.ruc}`);
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-ghost" disabled={ocupado} onClick={verificar}
        title="Calcula su RUC desde el DNI y lo consulta en SUNAT"
        style={{ fontSize: 12, padding: "7px 12px" }}>
        {ocupado ? "Consultando..." : "🔄 Verificar RUC en SUNAT"}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("✔") ? "var(--green)" : "var(--yellow)" }}>{msg}</span>}
    </span>
  );
}

/* Botón individual: verifica UNA empresa contra SUNAT */
export function BotonVerificarRuc({ empresaId }: { empresaId: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const verificar = async () => {
    if (ocupado) return;
    setOcupado(true); setMsg("");
    const r: any = await verificarRucSunat(empresaId);
    setOcupado(false);
    if (r?.error) { setMsg("⚠ " + r.error); return; }
    setMsg(r.cambio ? `⚠ cambió: ${r.estado} · ${r.condicion}` : `✔ ${r.estado} · ${r.condicion}`);
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-ghost" disabled={ocupado} onClick={verificar}
        title="Consulta su RUC en SUNAT y actualiza estado, condición y fecha de verificación"
        style={{ fontSize: 12, padding: "7px 12px" }}>
        {ocupado ? "Consultando..." : "🔄 Verificar en SUNAT"}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("✔") ? "var(--green)" : "var(--yellow)" }}>{msg}</span>}
    </span>
  );
}

/* Botón de lote: verifica TODAS las activas (la ronda SUNAT completa) */
export function BotonVerificarLote() {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const correr = async () => {
    if (ocupado || !confirmar()) return;
    setOcupado(true); setMsg("Consultando empresa por empresa…");
    const r: any = await verificarSunatLote();
    setOcupado(false);
    if (r?.error) { setMsg("⚠ " + r.error); return; }
    setMsg(`✔ ${r.ok} verificadas` +
      (r.alertas?.length ? ` · ⚠ con problemas: ${r.alertas.join("; ")}` : " · todas sanas") +
      (r.fallas?.length ? ` · sin respuesta: ${r.fallas.length}` : ""));
    router.refresh();
  };
  const confirmar = () => true;

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-ghost" disabled={ocupado} onClick={correr}
        title="Consulta una por una todas las empresas activas con RUC. Puede tardar; el cron ya lo hace solo cada lunes"
        style={{ fontSize: 12, padding: "5px 12px" }}>
        {ocupado ? "Verificando…" : "🔄 Verificar todas en SUNAT"}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("✔") ? "var(--green)" : "var(--yellow)" }}>{msg}</span>}
    </span>
  );
}
