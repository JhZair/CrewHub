"use client";
import { registrarMiJornada } from "@/app/actions";
import Avatar from "@/components/Avatar";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FRACCIONES } from "@/lib/jornadas";

const TIPOS: [string, string][] = [["rodaje", "🎬 Rodaje"], ["oficina", "🏢 Oficina"], ["scouting", "🚙 Scouting"]];


/* Registro PERSONAL: el usuario logueado registra su propia jornada. */
export default function MiJornada({ proyectos, mi }: {
  proyectos: { id: string; nombre: string }[];
  mi: {
    /** El nombre COMPLETO. Aquí uno se reconoce; el alias corto es para las
     *  tablas donde ya se sabe de quién se habla. */
    nombre: string;
    alias?: string | null;
    foto?: string | null;
    color?: string | null;
    /** Especialidades, de su ficha de persona (`personas.rol`). */
    rol?: string | null;
    tarifa_dia: number | null; tarifa_rodaje: number | null; tarifa_noche: number | null;
  } | null;
}) {
  const router = useRouter();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [fecha, setFecha] = useState(hoy);
  const [proyectoId, setProyectoId] = useState("");
  const [tipo, setTipo] = useState("rodaje");
  const [fraccion, setFraccion] = useState(1);
  const [noche, setNoche] = useState(false);
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  if (!mi) {
    return (
      <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
        <div className="panel-h" style={{ color: "var(--yellow)" }}>📓 Registrar mi jornada</div>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          Tu cuenta no está enlazada a una persona, así que no puedes registrar jornadas todavía.
          Pídele al administrador que enlace tu cuenta a tu ficha de persona.
        </p>
      </div>
    );
  }

  // scouting y oficina pagan con la tarifa de día; solo rodaje usa la de rodaje
  const base = tipo === "rodaje" ? (mi.tarifa_rodaje ?? mi.tarifa_dia) : mi.tarifa_dia;
  const nocheRate = mi.tarifa_noche ?? mi.tarifa_rodaje ?? mi.tarifa_dia;
  const nocheOk = tipo !== "oficina" && noche;   // en oficina no hay pernocte
  const extraNoche = nocheOk && nocheRate != null ? Number(nocheRate) : 0;
  const dia = base != null ? Number(base) * fraccion : 0;
  const monto = (base != null || (nocheOk && nocheRate != null)) ? dia + extraNoche : null;

  const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none", fontFamily: "inherit" } as const;

  const registrar = async () => {
    if (ocupado) return;
    setOcupado(true); setError(""); setOk("");
    const res: any = await registrarMiJornada(fecha, proyectoId || null, tipo, fraccion, nocheOk, notas);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    /* La nota se limpia con el pernocte: es de ESA jornada, y arrastrarla a la
       siguiente sería firmar el martes con lo que pasó el lunes. */
    setOk("Jornada registrada ✓"); setNoche(false); setNotas(""); router.refresh();
    setTimeout(() => setOk(""), 2500);
  };

  return (
    <div className="card">
      {/* Con cara y nombre completo. Decía «REGISTRAR MI JORNADA — JOHNO», y
          el alias suelto en mayúsculas no confirma nada: esta pantalla escribe
          en el sueldo de alguien, y lo primero que hay que poder comprobar es
          que ese alguien eres tú. */}
      <div className="panel-h" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>📓 Registrar mi jornada</span>
        <span style={{ color: "var(--dim)" }}>—</span>
        <Avatar nombre={mi.nombre} src={mi.foto} color={mi.color} size={22} />
        <span style={{ textTransform: "none" }}>{mi.nombre}</span>
        {mi.alias && (
          <i style={{ color: "var(--dim)", textTransform: "none", fontWeight: 400 }}>
            {mi.alias}
          </i>
        )}
      </div>

      {/* ── EN QUÉ TRABAJA ──
          Sus especialidades, de la ficha. Van en su propia línea y no pegadas
          al nombre porque son diez en algunos casos, y en la misma línea
          empujarían el nombre —que es lo único que no puede faltar aquí—.
          Si sale vacío no se pinta nada: mejor un hueco que un «sin rol», que
          se lee como un estado y es solo un dato que nadie cargó. */}
      {mi.rol && (
        <div style={{ color: "var(--dim)", fontSize: 11.5, margin: "-4px 0 10px" }}
          title={String(mi.rol).split(",").map(x => x.trim()).filter(Boolean).join(" · ")}>
          {String(mi.rol).split(",").map(x => x.trim()).filter(Boolean).join(" · ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: 150 }} />
        <MiniSelect
          value={proyectoId}
          options={[["", "🏢 Oficina (sin proyecto)"], ...proyectos.map(p => [p.id, `📁 ${p.nombre}`])]}
          onSelect={setProyectoId}
          buttonClass=""
          buttonStyle={{ ...inp, minWidth: 190 }} />
        <span className="jr-seg">
          {TIPOS.map(([v, l]) => (
            <button key={v} className={tipo === v ? "on" : ""}
              onClick={() => { setTipo(v); if (v === "oficina") setNoche(false); else setFraccion(1); }}>{l}</button>
          ))}
        </span>
        {tipo === "oficina" && (
          <span className="jr-seg">
            {FRACCIONES.map(f => (
              <button key={f.v} className={fraccion === f.v ? "on" : ""} onClick={() => setFraccion(f.v)}>
                <span className="jr-dur-ico">{f.ico}</span> {f.largo}
              </button>
            ))}
          </span>
        )}
        {tipo !== "oficina" && (
          <button className={`jr-chip ${noche ? "on" : ""}`} onClick={() => setNoche(n => !n)}
            title="Se pagó también la noche de camping en la puna">
            🏕 {noche ? "✓ " : ""}Pernocte{noche && nocheRate != null ? ` +S/ ${Math.round(Number(nocheRate))}` : ""}
          </button>
        )}
      </div>

      {/* ── LA NOTA ──
          Opcional, y de una línea: qué se hizo ese día, dónde, con quién. Es lo
          que convierte una fila de «1 · rodaje · S/ 160» en algo que se puede
          revisar tres meses después, cuando llega la liquidación y nadie
          recuerda por qué hubo rodaje un domingo.
          Va debajo y no en la fila de arriba a propósito: allí compite con los
          cuatro campos que SÍ deciden el monto, y este no decide nada. */}
      <input value={notas} onChange={e => setNotas(e.target.value)}
        placeholder="Nota (opcional): qué se hizo, dónde, con quién…"
        maxLength={300}
        onKeyDown={e => { if (e.key === "Enter") registrar(); }}
        style={{ ...inp, width: "100%", marginTop: 10 }} />

      {error && <div className="err-inline" style={{ marginTop: 10 }}>⚠ {error}</div>}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Esta jornada: <b style={{ color: "var(--teal)" }}>
            {monto != null ? `S/ ${Math.round(monto).toLocaleString("es-PE")}` : "sin tarifa registrada"}
          </b>
        </span>
        <span style={{ flex: 1 }} />
        {ok && <span style={{ color: "var(--green)", fontSize: 12.5 }}>{ok}</span>}
        <button className="btn" disabled={ocupado} onClick={registrar}>
          {ocupado ? "…" : "Registrar mi jornada"}
        </button>
      </div>
    </div>
  );
}
