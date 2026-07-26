"use client";
import { guardarFotoPersona } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";
import { destinoPaste } from "@/lib/destinoPaste";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* La foto del perfil: se sube con un clic sobre el avatar. Si no hay,
   Avatar cae de vuelta a las iniciales, así que nunca se ve un hueco.
   `propia` distingue la foto cargada aquí de la heredada de su cuenta
   (esa no se puede borrar desde acá: sale de su login). */
export default function FotoPersona({ personaId, nombre, foto, propia, size = 56 }: {
  personaId: string; nombre?: string | null; foto?: string | null;
  propia?: boolean; size?: number;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [encima, setEncima] = useState(false);   // mouse sobre el avatar
  const [error, setError] = useState("");
  const encimaRef = useRef(false);
  encimaRef.current = encima;
  const router = useRouter();

  /* Ctrl+V con el mouse SOBRE el avatar: pega la foto directo (copiada de
     la web o pantallazo). Solo si el foco no está en un campo de texto. */
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      if (!encimaRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const f = Array.from(e.clipboardData?.items || [])
        .find(i => i.type.startsWith("image/"))?.getAsFile();
      if (f) { e.preventDefault(); subir(f); }
    };
    document.addEventListener("paste", h);
    return () => {
      document.removeEventListener("paste", h);
      destinoPaste.reclamado = false;  // no dejar la bandera izada al salir
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subir = async (f?: File) => {
    if (!f || subiendo) return;
    setSubiendo(true); setError("");
    const lista = await prepararImagen(f, MEDIDAS.foto);
    const r = await subirImagen(lista);
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
    <span style={{ position: "relative", display: "inline-flex", flex: "none" }} className="foto-p"
      onMouseEnter={() => { setEncima(true); destinoPaste.reclamado = true; }}
      onMouseLeave={() => { setEncima(false); destinoPaste.reclamado = false; }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith("image/")) subir(f);
      }}>
      <label title={propia ? "Cambiar la foto · o pega con Ctrl+V, o arrástrala aquí" : foto ? "Foto de su cuenta — clic, Ctrl+V o arrastre para reemplazarla" : "Subir una foto · clic, Ctrl+V o arrástrala aquí"}
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
