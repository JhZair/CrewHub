"use client";
import Avatar from "@/components/Avatar";
import ActivarPush from "@/components/ActivarPush";
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
            <Link href="/agenda" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>📅 Agenda</Link>
            <Link href="/pulso" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>📊 Pulso del equipo</Link>
            <Link href="/jornadas" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>📓 Jornadas</Link>
            <Link href="/llaves" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>🔑 Llaves</Link>
            {esAdmin && (
              /* `esAdmin` aquí quiere decir «administración o finanzas»: quien
                 lleva la plata entra a las dos, aunque en /admin solo vea el
                 panel de recibos. La lección de ayer es que el permiso sin la
                 puerta no existe — se dio la llave y no había por dónde
                 entrar, y el síntoma fue «no lo veo», sin ningún error. */
              <>
                <Link href="/caja" onClick={() => setAbierto(false)} className="btn btn-ghost"
                  style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>💰 Caja</Link>
                <Link href="/admin" onClick={() => setAbierto(false)} className="btn btn-ghost"
                  style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>⚙ Administración</Link>
              </>
            )}
            <ActivarPush />
            <a href="/auth/signout" className="btn btn-ghost"
              style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>⎋ Salir</a>
          </div>
        </>
      )}
    </span>
  );
}
