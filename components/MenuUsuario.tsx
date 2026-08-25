"use client";
import Avatar from "@/components/Avatar";
import ActivarPush from "@/components/ActivarPush";
import Link from "@/components/Enlace";
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
            {/* ── AQUÍ SOLO LO QUE ES TUYO ──
                Agenda, Pulso del equipo, Llaves y Caja se fueron al menú de
                Secciones. Estaban aquí por acumulación, no por criterio: un
                menú de cuenta es para tu perfil, tus avisos y salir, y quien
                busca «dónde está la caja» abre el menú de navegar, no su foto.
                Con dos menús que llevan a sitios, la respuesta a «¿dónde
                estaba eso?» era «prueba en los dos».
                Se quedan tus jornadas: son TUYAS —tus días trabajados— y por
                eso siguen colgando de tu avatar.
                ── «MI TABLERO» SE FUE ──
                Estaba aquí de cuando el tablero no figuraba en el menú de
                secciones y este era la única puerta. Ahora está en las dos, y
                dos caminos al mismo sitio obligan a preguntarse cuál es cuál:
                «Mi tablero» sonaba a una pantalla distinta —la mía— cuando es
                exactamente la misma con el filtro de siempre. Y el menú de
                secciones ya lleva sus burbujas, así que la puerta que se queda
                es además la que avisa. */}
            <Link href="/jornadas" onClick={() => setAbierto(false)} className="btn btn-ghost"
              style={{ marginTop: personaId ? 6 : 10, fontSize: 12.5, textAlign: "center" }}>📓 Mis jornadas</Link>
            {esAdmin && (
              /* `esAdmin` aquí quiere decir «administración o finanzas»: quien
                 lleva la plata entra a las dos, aunque en /admin solo vea el
                 panel de recibos. La lección de ayer es que el permiso sin la
                 puerta no existe — se dio la llave y no había por dónde
                 entrar, y el síntoma fue «no lo veo», sin ningún error. */
              <Link href="/admin" onClick={() => setAbierto(false)} className="btn btn-ghost"
                style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>⚙ Administración</Link>
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
