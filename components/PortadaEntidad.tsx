"use client";
import { guardarImagenEntidad } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();

  const subir = async (campo: "portada" | "cartel", f?: File) => {
    if (!f || subiendo) return;
    setSubiendo(campo);
    const r = await subirImagen(f);
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
    <div className={`ent-hero ${conCartel ? "con-cartel" : ""}`}
      style={color ? ({ ["--ent-c" as any]: color }) : undefined}>
      <div className="ent-hero-banner">
        {portada
          ? // eslint-disable-next-line @next/next/no-img-element
            <img src={portada} alt="" referrerPolicy="no-referrer" />
          : <span className="ent-hero-ph">{editable ? "Sube una portada" : ""}</span>}
        {controles("portada", !!portada)}
      </div>
      {conCartel && (
        <div className={`ent-hero-cartel ${cartel ? "tiene-img" : ""}`}>
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
