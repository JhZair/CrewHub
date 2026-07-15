"use client";
import { useRouter } from "next/navigation";
import NavIconos from "@/components/NavIconos";
import Link from "next/link";

/* El bloque de navegación de toda pantalla interna: inicio, regreso con
   memoria, y los accesos a las secciones.
   Los íconos viven aquí porque <Volver> ya está en las 19 pantallas: era
   eso, o pegar la misma nav en diecinueve archivos y que se fueran
   separando con el tiempo. Si algún día hay una cabecera de verdad, esto
   se muda entero.
   `nav` en false para las pantallas que no la quieran. */
export default function Volver({ etiqueta = "← Volver", nav = true }:
  { etiqueta?: string; nav?: boolean }) {
  const router = useRouter();
  const volver = () => {
    if (typeof window !== "undefined" && window.history.length > 2) router.back();
    else router.push("/");
  };
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/" className="btn btn-ghost" title="Ir al inicio"
        style={{ fontWeight: 800, color: "var(--violet)" }}>⬡</Link>
      <button className="btn btn-ghost" onClick={volver}>{etiqueta}</button>
      {nav && <NavIconos />}
    </span>
  );
}
