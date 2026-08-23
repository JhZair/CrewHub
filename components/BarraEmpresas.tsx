"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import { motivoNoDeclara } from "@/lib/obligaciones";
import { ordenarEmpresas, type EmpresaPropia } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   LA BARRA DE EMPRESAS — una sola, para las pantallas que trabajan por empresa

   Nació dentro de /comprobantes y ya se pedía en /obligaciones. Sale aquí antes
   de que existan dos: dos barras con el mismo aspecto pero distinto orden, o
   una con logo y otra sin él, es exactamente lo que hace que el equipo dude de
   si está mirando lo mismo.

   ── POR QUÉ ES DE CLIENTE, VIVIENDO EN UN LAYOUT ──
   El objetivo era dejar de traer la lista en cada clic. Puesta en un layout,
   Next no la vuelve a renderizar cuando solo cambia `?emp=`, así que las
   empresas y sus logos se cargan UNA vez por visita.
   Pero un layout no recibe los parámetros de la URL, y esta barra los necesita
   para dos cosas: saber cuál está encendida y CONSERVAR el resto —el año y el
   mes que estás mirando—. Sin eso, cambiar de empresa te devolvería al periodo
   por defecto y perderías dónde estabas.
   Como componente de cliente lee la URL viva y arma cada enlace conservando lo
   demás. Los datos siguen llegando del servidor, una sola vez.

   ── EL ORDEN Y EL APAGADO NO SE DECIDEN AQUÍ ──
   Quién está operando lo dice `motivoNoDeclara`, en lib/obligaciones, que es
   la misma regla que usa la pantalla de declaraciones. Una segunda definición
   de «activa» en un componente visual es como acaban discrepando dos pantallas
   sobre la misma empresa.
   Apagadas, no escondidas: una empresa cerrada conserva las facturas de cuando
   operaba, y esconderla las volvería inalcanzables.
   ══════════════════════════════════════════════════════════════════════════ */
export default function BarraEmpresas({ empresas, logos, param = "emp", inicio }: {
  empresas: EmpresaPropia[];
  logos?: Record<string, string>;
  /** El parámetro de la URL que identifica a la empresa abierta. */
  param?: string;
  /** Rótulo de la pestaña que vuelve al resumen (sin empresa). Si no se pasa,
   *  esa pestaña no existe — hay pantallas donde «ninguna» no es un estado. */
  inicio?: string;
}) {
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const actual = sp?.get(param) || "";

  /* El orden sale de lib/empresasPropias, el mismo que usa la página para
     decidir qué empresa abrir sin `?emp=`. Ordenar aquí por separado haría que
     la pestaña encendida y los datos cargados fueran de empresas distintas. */
  const orden = ordenarEmpresas(empresas, e => !motivoNoDeclara(e));

  /* El resto de la URL se conserva tal cual: el año y el mes que estás
     mirando no son de la empresa, son de la pregunta que te estás haciendo. */
  const hrefDe = (id: string) => {
    const q = new URLSearchParams(sp?.toString() || "");
    q.set(param, id);
    return `${pathname}?${q.toString()}`;
  };
  /* Volver al resumen es QUITAR el parámetro, no ponerle un valor especial:
     así la URL del resumen es `/comprobantes` a secas y se puede compartir sin
     arrastrar un «emp=todas» que no significa nada fuera de esta pantalla. */
  const hrefSinEmpresa = () => {
    const q = new URLSearchParams(sp?.toString() || "");
    q.delete(param);
    const t = q.toString();
    return t ? `${pathname}?${t}` : pathname;
  };

  /* ── SIN `?emp=` NO HAY NINGUNA ENCENDIDA ──
     Antes se encendía la primera, porque la página abría la primera. Eso hacía
     que entrar a /comprobantes pareciera una decisión —«estás en Wilkakalle»—
     cuando en realidad nadie había elegido nada, y las otras catorce empresas
     quedaban detrás de un clic que no se sabía que hacía falta dar.
     Ahora no seleccionar es un estado con su propia pantalla: el resumen de
     todas. La barra lo refleja no encendiendo ninguna. */
  const encendida = actual;

  if (!empresas.length) return null;

  return (
    <div className="tv-vistas">
      {/* La vuelta al resumen. Es la única pestaña que QUITA el parámetro en
          vez de ponerlo, y por eso va primera: es el estado del que se sale. */}
      {inicio && (
        <Link href={hrefSinEmpresa()} className={`vtab${!actual ? " on" : ""}`}
          title="Resumen de todas las empresas">
          {inicio}
        </Link>
      )}
      {orden.map(e => {
        const m = motivoNoDeclara(e);
        return (
          <Link key={e.id} href={hrefDe(e.id)}
            className={`vtab cmpp-emp${e.id === encendida ? " on" : ""}${m ? " fila-tenue" : ""}`}
            title={m ? `${e.nombre} — ${m.ayuda}` : e.nombre}>
            {/* Sin logo cargado, <Avatar/> pone las iniciales sobre el color de
                la entidad: un hueco haría saltar los nombres de posición
                pestaña a pestaña. */}
            <Avatar nombre={e.nombre} src={logos?.[e.id]} size={18} />
            {e.nombre}
          </Link>
        );
      })}
    </div>
  );
}
