"use client";
import { guardarImagenEntidad } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* LA CABECERA DE UNA ENTIDAD: portada (banner) + cartel (póster).
   Dos imágenes que se suben AL VUELO, con un clic sobre cada control —igual
   que la foto de una persona—. La portada va de fondo, apaisada; el cartel se
   monta encima, a la izquierda, sobresaliendo por abajo. Si no hay imagen, la
   portada muestra un degradado y el cartel las iniciales: nunca un hueco roto.
   `conCartel=false` deja solo el banner (las personas ya tienen su avatar). */
export default function PortadaEntidad({ tipo, id, portada, cartel, nombre, color, editable = false, conCartel = true }: {
  tipo: string; id: string;
  portada?: string | null; cartel?: string | null;
  nombre?: string | null;
  /** Color del tipo de entidad, para distinguirlas (borde del cartel, tinte). */
  color?: string | null;
  editable?: boolean; conCartel?: boolean;
}) {
  const [subiendo, setSubiendo] = useState<"portada" | "cartel" | null>(null);
  // A qué zona cae un Ctrl+V: la última sobre la que pasó el mouse (portada por defecto)
  const [zona, setZona] = useState<"portada" | "cartel">("portada");
  const router = useRouter();

  /* Ctrl+V directo: copias una imagen (de la web, un pantallazo) y pegas
     sobre la página — cae en la zona donde esté el mouse. Si el foco está
     en un campo de texto, no interferimos: ese paste es del campo. */
  useEffect(() => {
    if (!editable) return;
    const h = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const f = Array.from(e.clipboardData?.items || [])
        .find(i => i.type.startsWith("image/"))?.getAsFile();
      if (f) { e.preventDefault(); subir(zona, f); }
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, zona, subiendo]);

  /* Arrastrar y soltar: un archivo de imagen desde el explorador, directo
     sobre el banner o el cartel. */
  const enDrop = (campo: "portada" | "cartel") => (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) subir(campo, f);
  };

  const subir = async (campo: "portada" | "cartel", f?: File) => {
    if (!f || subiendo) return;
    setSubiendo(campo);
    // El sistema prepara la imagen: reduce y comprime al tamaño de la cabecera
    const lista = await prepararImagen(f, MEDIDAS[campo]);
    const r = await subirImagen(lista);
    if (r.error || !r.url) { setSubiendo(null); alert(r.error || "No se pudo subir la imagen"); return; }
    const res: any = await guardarImagenEntidad(tipo, id, campo, r.url);
    setSubiendo(null);
    if (res?.error) { alert(res.error); return; }
    router.refresh();
  };

  const quitar = async (campo: "portada" | "cartel") => {
    if (subiendo) return;
    setSubiendo(campo);
    await guardarImagenEntidad(tipo, id, campo, null);
    setSubiendo(null);
    router.refresh();
  };

  const ini = (nombre || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  const controles = (campo: "portada" | "cartel", hay: boolean) => editable && (
    <span className="ent-hero-ctrl">
      <label title={hay ? "Cambiar imagen" : "Subir imagen"} style={{ opacity: subiendo === campo ? .5 : 1 }}>
        {subiendo === campo ? "…" : hay ? "✎" : "＋"}
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { subir(campo, e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {hay && subiendo !== campo && (
        <button title="Quitar" onClick={() => quitar(campo)}>×</button>
      )}
    </span>
  );

  return (
    <div className={`ent-hero ${conCartel ? "con-cartel" : ""} ${tipo === "equipamiento" ? "ent-hero--alto" : ""}`}
      style={color ? ({ ["--ent-c" as any]: color }) : undefined}>
      <div className="ent-hero-banner"
        onMouseEnter={() => setZona("portada")}
        onDragOver={e => editable && e.preventDefault()}
        onDrop={enDrop("portada")}>
        {portada
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={portada} alt="" referrerPolicy="no-referrer" />
          : <span className="ent-hero-ph">{editable ? "Sube una portada — o pega con Ctrl+V, o arrástrala aquí" : ""}</span>}
        {controles("portada", !!portada)}
      </div>
      {conCartel && (
        <div className={`ent-hero-cartel ${cartel ? "tiene-img" : ""}`}
          onMouseEnter={() => setZona("cartel")}
          onMouseLeave={() => setZona("portada")}
          onDragOver={e => editable && e.preventDefault()}
          onDrop={enDrop("cartel")}>
          {cartel
            ? // eslint-disable-next-line @next/next/no-img-element
              <img src={cartel} alt={nombre || ""} referrerPolicy="no-referrer" />
            : <span className="ent-hero-ini">{ini}</span>}
          {controles("cartel", !!cartel)}
        </div>
      )}
    </div>
  );
}
