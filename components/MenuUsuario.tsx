"use client";
import Avatar from "@/components/Avatar";
import Link from "next/link";
import { useState } from "react";

/* La esquina del usuario, compacta: solo el avatar.
   Nombre, rol y Salir viven en el menú desplegable. */
export default function MenuUsuario({ nombre, rol, color, src, esAdmin, personaId }: {
  nombre?: string | null; rol?: string | null;
  color?: string | null; src?: string | null; esAdmin?: boolean | null;
  personaId?: string | null;   // su ficha de persona, si la cuenta está vinculada
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setAbierto(!abierto)} title={nombre || "Cuenta"}
        style={{ background: "transparent", border: abierto ? "2px solid var(--violet)" : "2px solid transparent", borderRadius: "50%", padding: 1, cursor: "pointer", lineHeight: 0 }}>
        <Avatar nombre={nombre} color={color} size={34} src={src} />
      </button>
      {abierto && (
        <>
          <span className="rx-fondo" onClick={() => setAbierto(false)} />
          <div className="menu-usuario">
            <b style={{ fontSize: 13.5 }}>{nombre}</b>
            <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{rol || "Equipo"}</span>
            {/* Solo si su cuenta está vinculada a una ficha de persona */}
            {personaId && (
              <Link href={`/entidad/persona/${personaId}`} onClick={() => setAbierto(false)} className="btn btn-ghost"
                style={{ marginTop: 10, fontSize: 12.5, textAlign: "center" }}>👤 Mi perfil</Link>
            )}
            <Link href="/tablero" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: personaId ? 6 : 10, fontSize: 12.5, textAlign: "center" }}>🗂 Tablero</Link>
            <Link href="/pulso" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>📊 Pulso del equipo</Link>
            <Link href="/jornadas" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>📓 Jornadas</Link>
            {esAdmin && (
              <Link href="/admin" onClick={() => setAbierto(false)} className="btn btn-ghost"
                style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>⚙ Administración</Link>
            )}
            <Link href="/etiquetas" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>🏷️ Etiquetas</Link>
            <a href="/auth/signout" className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>⎋ Salir</a>
          </div>
        </>
      )}
    </span>
  );
}
