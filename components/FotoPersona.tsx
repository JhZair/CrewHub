"use client";
import { guardarFotoPersona } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* La foto del perfil: se sube con un clic sobre el avatar. Si no hay,
   Avatar cae de vuelta a las iniciales, así que nunca se ve un hueco.
   `propia` distingue la foto cargada aquí de la heredada de su cuenta
   (esa no se puede borrar desde acá: sale de su login). */
export default function FotoPersona({ personaId, nombre, foto, propia, size = 56 }: {
  personaId: string; nombre?: string | null; foto?: string | null;
  propia?: boolean; size?: number;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const subir = async (f?: File) => {
    if (!f || subiendo) return;
    setSubiendo(true); setError("");
    const r = await subirImagen(f);
    if (r.error || !r.url) { setError(r.error || "No se pudo subir"); setSubiendo(false); return; }
    const res: any = await guardarFotoPersona(personaId, r.url);
    setSubiendo(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  const quitar = async () => {
    if (subiendo) return;
    setSubiendo(true);
    await guardarFotoPersona(personaId, null);
    setSubiendo(false);
    router.refresh();
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "none" }} className="foto-p">
      <label title={propia ? "Cambiar la foto" : foto ? "Foto de su cuenta — clic para reemplazarla" : "Subir una foto"}
        style={{ cursor: "pointer", display: "inline-flex", opacity: subiendo ? .5 : 1 }}>
        <Avatar nombre={nombre} src={foto} size={size} />
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { subir(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {propia && !subiendo && (
        <button onClick={quitar} title="Quitar la foto (volverá la de su cuenta, si tiene)" className="foto-x"
          style={{ position: "absolute", top: -4, right: -4, background: "var(--panel)", border: "1px solid var(--border2)", borderRadius: "50%", width: 18, height: 18, fontSize: 10, color: "var(--red)", cursor: "pointer", lineHeight: 1 }}>×</button>
      )}
      {error && <span style={{ color: "var(--red)", fontSize: 10.5, marginLeft: 6, alignSelf: "center" }}>{error}</span>}
    </span>
  );
}
