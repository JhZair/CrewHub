"use client";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");

  const entrar = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo" style={{ justifyContent: "center", marginBottom: 14 }}>
          <span className="ic">⬡</span>
          <span>CrewHub<sup>+</sup></span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>
          El centro operativo de Kawsay.<br />Acceso solo para el equipo.
        </p>
        <button className="btn" style={{ width: "100%", padding: 12 }} onClick={entrar}>
          Entrar con Google
        </button>
        {error === "no-autorizado" && (
          <p className="err">Tu correo no está autorizado. Habla con John para que te agregue al equipo.</p>
        )}
        {/* No es lo mismo «no estás en la lista» que «no pude mirar la lista».
            Lo primero se arregla hablando con alguien; lo segundo, volviendo a
            intentarlo en un minuto. Decir lo primero cuando pasa lo segundo
            manda a pedir un permiso que ya se tiene. */}
        {error === "sin-comprobar" && (
          <p className="err">
            No se pudo comprobar tu acceso ahora mismo. Vuelve a intentarlo en
            un minuto; si sigue igual, avisa a John.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return <Suspense><LoginInner /></Suspense>;
}
