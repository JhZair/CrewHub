"use client";
import { useRouter } from "next/navigation";

/* Un filtro con MUCHAS opciones (p. ej. rol/especialidad) se vuelve un muro de
   chips. Este combo lo colapsa en un <select> que navega al elegir. Cada opción
   trae su href ya armado (server), así el componente solo empuja la ruta. */
export default function ComboFiltro({ value, placeholder, emptyHref, options }: {
  value: string;
  placeholder: string;
  /** A dónde ir cuando se elige el placeholder (quitar el filtro). */
  emptyHref: string;
  options: { val: string; label: string; href: string }[];
}) {
  const router = useRouter();
  const ir = (v: string) => {
    if (!v) return router.push(emptyHref);
    const o = options.find(x => x.val === v);
    if (o) router.push(o.href);
  };
  return (
    <select className="combo-filtro" value={value} onChange={e => ir(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
    </select>
  );
}
