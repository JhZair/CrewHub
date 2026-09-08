"use client";
import { guardarFotoPersona } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";
import { ATRIBUTO, meToca } from "@/lib/destinoPaste";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const router = useRouter();

  /* Ctrl+V con el mouse SOBRE el avatar: pega la foto directo (copiada de la
     web o pantallazo). Solo si el foco no está en un campo de texto.
     Quién se lleva el pegado lo decide `meToca` mirando quién está bajo el
     ratón EN ESE INSTANTE, y no un estado de hover guardado: `encima` puede
     quedarse pegado si el `mouseleave` nunca llega —el diálogo de archivos
     del sistema, una capa que se abre encima— y entonces este avatar se
     quedaría con pegados de toda la pantalla. Está contado en
     lib/destinoPaste. `encima` sigue existiendo, pero solo para pintar. */
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      if (!meToca("foto-persona")) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const f = Array.from(e.clipboardData?.items || [])
        .find(i => i.type.startsWith("image/"))?.getAsFile();
      if (f) { e.preventDefault(); subir(f); }
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ⚠ `try/finally` en las dos. `guardarFotoPersona` es una acción de servidor
     y RECHAZA si se cae la red: sin esto la excepción salía de aquí, `subiendo`
     se quedaba en true y el avatar se quedaba a media opacidad, sin aceptar
     otro intento, hasta recargar — y sin decir por qué. */
  const subir = async (f?: File) => {
    if (!f || subiendo) return;
    setSubiendo(true); setError("");
    try {
      const lista = await prepararImagen(f, MEDIDAS.foto);
      const r = await subirImagen(lista);
      if (r.error || !r.url) { setError(r.error || "No se pudo subir"); return; }
      const res: any = await guardarFotoPersona(personaId, r.url);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Se cortó la conexión");
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async () => {
    if (subiendo) return;
    setSubiendo(true); setError("");
    try {
      const res: any = await guardarFotoPersona(personaId, null);
      /* El error se DICE. Se descartaba: quitar la foto podía fallar por
         permisos y la pantalla se quedaba igual, como si no hubieras pulsado. */
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Se cortó la conexión");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "none" }} className="foto-p"
      {...{ [ATRIBUTO]: "foto-persona" }}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
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
