import Link from "next/link";
import Avatar from "@/components/Avatar";
import Firma, { type Quien } from "@/components/Firma";
import { haceDias } from "@/lib/fechas";
import type { EmpresaPropia } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   LA PANTALLA DE ENTRADA: TODAS LAS EMPRESAS DE UN VISTAZO

   Entrar a /comprobantes abría la primera empresa de la lista. Eso se leía
   como una decisión —«estás en Wilkakalle»— cuando nadie había elegido nada, y
   dejaba a las otras catorce detrás de un clic que no se sabía que hacía
   falta dar. Peor: la pregunta con la que se entra aquí casi nunca es «qué
   tiene Wilkakalle», es «dónde falta cargar».

   Esto contesta esa pregunta. Por empresa y del año que estés mirando:
   cuántos comprobantes hay, cuánto IGV suman las compras y las ventas, y
   cuándo fue la última vez que alguien cargó algo.

   ── EL SILENCIO ES EL DATO ──
   Una empresa sin comprobantes no sale vacía: sale DICIENDO que no tiene
   ninguno. Es lo que se viene a buscar. Y la fecha de la última carga es el
   otro medio dato: «tres meses sin tocar» no es un número que aparezca en
   ninguna parte y es exactamente la señal de que algo se quedó atrás.
   ══════════════════════════════════════════════════════════════════════════ */

const soles = (n: number) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  if (!m) return "";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
};

/** Cuánto hace, en palabras. Un «hace 4 meses» dice más que una fecha. */
export type FilaResumen = {
  empresaId: string;
  comprobantes: number;
  igvCompras: number;
  igvVentas: number;
  /** Fecha del último comprobante CARGADO (no la del documento). */
  ultimaCarga?: string | null;
  ultimaPor?: Quien | null;
};

export default function ResumenEmpresas({ empresas, logos, filas, anio, href }: {
  empresas: EmpresaPropia[];
  logos?: Record<string, string>;
  filas: Map<string, FilaResumen>;
  anio: number;
  /** Cómo se llega a la pantalla de una empresa. La arma la página, que es
   *  quien sabe qué más lleva la URL. */
  href: (empresaId: string) => string;
}) {
  const vacio: FilaResumen = { empresaId: "", comprobantes: 0, igvCompras: 0, igvVentas: 0 };
  const total = empresas.reduce((s, e) => {
    const f = filas.get(e.id) || vacio;
    return {
      comprobantes: s.comprobantes + f.comprobantes,
      igvCompras: s.igvCompras + f.igvCompras,
      igvVentas: s.igvVentas + f.igvVentas,
    };
  }, { comprobantes: 0, igvCompras: 0, igvVentas: 0 });

  /* Las que no tienen nada, al final: la lista se lee de arriba abajo buscando
     movimiento, y catorce ceros arriba entierran las tres que sí trabajaron.
     Dentro de cada grupo manda la última carga — lo más reciente primero. */
  const orden = [...empresas].sort((a, b) => {
    const fa = filas.get(a.id), fb = filas.get(b.id);
    const na = fa?.comprobantes || 0, nb = fb?.comprobantes || 0;
    if ((na > 0) !== (nb > 0)) return nb - na;
    return String(fb?.ultimaCarga || "").localeCompare(String(fa?.ultimaCarga || ""))
      || a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="res-emp-tit">
        <b>Todas las empresas · {anio}</b>
        <span style={{ color: "var(--dim)" }}>
          {total.comprobantes} comprobante(s) · IGV compras {soles(total.igvCompras)}
          {total.igvVentas > 0 && <> · ventas {soles(total.igvVentas)}</>}
        </span>
      </div>

      <div className="res-emp-cab">
        <span>Empresa</span>
        <span style={{ textAlign: "right" }}>Comprobantes</span>
        <span style={{ textAlign: "right" }}>IGV compras</span>
        <span style={{ textAlign: "right" }}>IGV ventas</span>
        <span>Última carga</span>
      </div>

      {orden.map(e => {
        const f = filas.get(e.id) || vacio;
        const sin = f.comprobantes === 0;
        return (
          <Link key={e.id} href={href(e.id)} className={`res-emp-fila${sin ? " fila-tenue" : ""}`}>
            <span className="res-emp-nom">
              <Avatar nombre={e.nombre} src={logos?.[e.id]} size={22} />
              <b>{e.nombre}</b>
            </span>
            <span style={{ textAlign: "right" }}>
              {sin ? <i style={{ color: "var(--dim)" }}>ninguno</i> : f.comprobantes}
            </span>
            <span style={{ textAlign: "right", color: sin ? "var(--dim)" : "var(--text)" }}>
              {sin ? "—" : soles(f.igvCompras)}
            </span>
            <span style={{ textAlign: "right", color: sin ? "var(--dim)" : "var(--text)" }}>
              {sin ? "—" : soles(f.igvVentas)}
            </span>
            {/* La última carga es de CrewHub, no la fecha de la factura: dice
                cuándo se tocó esto por última vez, que es lo que delata lo
                abandonado. Con el nombre de quien lo hizo, para saber a quién
                preguntar. */}
            <span className="res-emp-ult">
              {f.ultimaCarga ? (
                <>
                  <span title={`Último comprobante cargado el ${dmy(String(f.ultimaCarga).slice(0, 10))}`}>
                    {haceDias(f.ultimaCarga)}
                  </span>
                  {f.ultimaPor && (
                    <>
                      <span style={{ color: "var(--dim)" }}>·</span>
                      <Firma quien={f.ultimaPor} />
                    </>
                  )}
                </>
              ) : (
                <i style={{ color: "var(--dim)" }}>sin cargas en {anio}</i>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
