"use client";
import { verificarRucSunat, verificarSunatLote, verificarDniReniec } from "@/app/actions";
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
        style={{ fontSize: 12, padding: "7px 12px" }}>
        {ocupado ? "Consultando..." : "🪪 Verificar DNI (RENIEC)"}
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
        style={{ fontSize: 12, padding: "5px 12px" }}>
        {ocupado ? "Verificando…" : "🔄 Verificar todas en SUNAT"}
      </button>
      {msg && <span style={{ fontSize: 11.5, color: msg.startsWith("✔") ? "var(--green)" : "var(--yellow)" }}>{msg}</span>}
    </span>
  );
}
