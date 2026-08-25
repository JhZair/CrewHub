import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { ejecutando, plazoRendicion, rendicionVencida, rendicionSinPlazo } from "@/lib/fondos";
import { faltanEstados, textoFaltan, seVigila, cierreDe } from "@/lib/estadosCuenta";
import { hoyLima } from "@/lib/fechas";
import { CATEGORIAS_OPC } from "@/lib/etapas";

export const metadata: Metadata = { title: "🎬 Fondos en ejecución" };

/* ── FONDOS EN EJECUCIÓN — el panel de los proyectos ganados ──
   Las postulaciones que ganaron dejan de ser expediente y pasan a ser dinero
   y obra en marcha. Aquí están todas juntas, con su reloj: cuándo rinden, si
   van tarde, si falta cargarles el desembolso. Cada una lleva a su página de
   ejecución. */

const fmt = (n: any) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default async function FondosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("postulaciones")
    .select("id,codigo,estado,monto_adjudicado,fecha_desembolso,fecha_limite_rendicion," +
      "fecha_prorroga,fecha_rendicion_real,proy:proyectos(id,nombre)," +
      /* `categoria` faltaba, y es lo que agrupa: la línea gris de cada tarjeta
         enseña el NOMBRE de la convocatoria («Cine Indígena», «DOCU-Producción»)
         y eso es el concurso concreto, no la clase de fondo. Nueve tarjetas con
         nueve nombres distintos no se pueden leer por familia. */
      "conv:convocatorias(nombre,anio,categoria),emp:empresas(id,nombre)")
    .eq("estado", "ganadora");

  const fondos = (data || []) as any[];

  /* ── LO QUE FALTA DEL BANCO, EN LA TARJETA ──
     La burbuja del menú cuenta fondos con estados de cuenta sin cargar. Si al
     llegar aquí no se ve CUÁL, el número no se puede cuadrar y deja de
     creerse; y el aviso vivía dentro de la ficha, en una sub-sección plegada.
     Una consulta por lote —no una por tarjeta—, y la cuenta la hace la misma
     `faltanEstados` que usa la ficha, para que las tres pantallas no puedan
     discrepar. */
  const faltanEc = new Map<string, ReturnType<typeof faltanEstados>>();
  {
    const vigilados = fondos.filter(f => f.estado === "ganadora" && seVigila(f));
    if (vigilados.length) {
      const { data: ec, error } = await supabase.from("estado_cuenta")
        .select("postulacion_id,periodo").in("postulacion_id", vigilados.map(f => f.id));
      /* Si la consulta falla, `data` viene en null y NO se pinta nada. Sin esta
         guarda, un fallo dejaba el mapa vacío y todas las tarjetas salían con
         la serie entera faltando: la alarma más alta posible justo cuando el
         sistema no sabe nada. */
      if (!error) {
        const porFondo = new Map<string, string[]>();
        (ec || []).forEach((e: any) =>
          porFondo.set(e.postulacion_id, [...(porFondo.get(e.postulacion_id) || []), e.periodo]));
        const hoy = hoyLima();
        vigilados.forEach(f => faltanEc.set(f.id, faltanEstados(
          porFondo.get(f.id) || [], f.fecha_desembolso, hoy, cierreDe(f))));
      }
    }
  }

  /* ── LOS CARTELES, EN UNA CONSULTA ──
   * El póster del proyecto y el logo de la empresa viven en `entidad_media`,
   * no en sus tablas: se piden aparte y por lote, nunca uno por fila.
   * Ojo con `entidad_id`: es único entre tablas (uuid), pero la clave del mapa
   * lleva el TIPO igual. Sin él, un proyecto y una empresa con el mismo id
   * —imposible hoy, barato de asegurar— se pisarían. */
  const carteles = new Map<string, string>();
  {
    const ids = [...new Set(fondos.flatMap((f: any) =>
      [f.proy?.id, f.emp?.id]).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: mm } = await supabase.from("entidad_media")
        .select("entidad_tipo,entidad_id,cartel_url").in("entidad_id", ids);
      (mm || []).forEach((m: any) => {
        if (m.cartel_url) carteles.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url);
      });
    }
  }
  /* Con imagen, su cartel; sin ella, un icono de relleno del mismo tamaño.
     NUNCA un hueco: una fila con póster y otra sin él dejan de estar alineadas
     y la lista se lee en zig-zag. */
  const mini = (tipo: string, id?: string | null, relleno = "🎞") => {
    const u = id ? carteles.get(`${tipo}:${id}`) : null;
    return u
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={u} alt="" className="fondo-mini" referrerPolicy="no-referrer" />
      : <span className="fondo-mini fondo-mini-rell">{relleno}</span>;
  };
  // En ejecución primero (los que aún deben algo), luego los rendidos.
  const vivos = fondos.filter(f => ejecutando(f));
  const rendidos = fondos.filter(f => !ejecutando(f));
  vivos.sort((a, b) => (plazoRendicion(a) || "9999") < (plazoRendicion(b) || "9999") ? -1 : 1);

  /* ── LOS NUEVE, POR FAMILIA ──
   *
   * Nueve fondos en una columna se leen de arriba abajo y ya: no hay forma de
   * ver que tres son de cine indígena y dos de videojuego sin recorrerlos uno
   * por uno. Y la familia decide cosas —qué etapas tiene, qué pide DAFO, quién
   * lo lleva—, así que es el corte que de verdad separa.
   *
   * El orden NO es alfabético ni por tamaño: es el de `CATEGORIAS`, el mismo
   * catálogo que define las etapas de cada tipo. Un orden distinto aquí y allá
   * obliga a reaprender la lista en cada pantalla.
   *
   * Dentro de cada grupo se conserva el orden por plazo que ya traía `vivos`:
   * lo que vence antes, arriba. Agrupar no puede costar la urgencia.
   */
  const ORDEN_CAT = CATEGORIAS_OPC;
  const gruposVivos = (() => {
    const m = new Map<string, any[]>();
    vivos.forEach(f => {
      const k = (f.conv?.categoria || "").trim();
      m.set(k, [...(m.get(k) || []), f]);
    });
    return [...m.entries()]
      .map(([cat, fs]) => ({
        cat,
        // Sin categoría cargada no se inventa una: se dice, y en ámbar, porque
        // es un dato que falta en la convocatoria y se arregla allí.
        nombre: cat || "Sin categoría en la convocatoria",
        fs,
        total: fs.reduce((s, f) => s + Number(f.monto_adjudicado || 0), 0),
      }))
      .sort((a, b) => {
        if (!a.cat) return 1;
        if (!b.cat) return -1;
        const ia = ORDEN_CAT.indexOf(a.cat), ib = ORDEN_CAT.indexOf(b.cat);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || b.total - a.total;
      });
  })();

  const ficha = (f: any) => {
    const vencida = rendicionVencida(f);
    const sinPlazo = rendicionSinPlazo(f);
    const rendido = !ejecutando(f);
    const chip = rendido
      ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
      : vencida
        ? { ico: "🔴", txt: `Venció ${dmy(plazoRendicion(f))}`, col: "var(--red)" }
        : sinPlazo
          ? { ico: "⚠", txt: "Sin plazo cargado", col: "var(--yellow)" }
          : { ico: "🎬", txt: `Rinde ${dmy(plazoRendicion(f))}`, col: "var(--teal)" };
    /* ── SIN DESEMBOLSO = APAGADO ──
       Un fondo ganado al que no le ha entrado la plata no se ejecuta: no hay
       nada que rendir, ni recibos que revisar, ni plazo que corra de verdad.
       Cuatro de los nueve están así, y ocupaban el mismo peso que los que sí
       tienen dinero moviéndose — que son los que traen a esta pantalla.
       Se apaga, no se esconde: sigue en su categoría, cuenta en el total y se
       enciende entero al pasar el cursor. Y el aviso «sin desembolso» se queda
       dentro, porque es lo único que hay que hacer con él. */
    const apagada = !f.fecha_desembolso && !rendido;
    return (
      <Link key={f.id} href={`/fondo/${f.id}`}
        className={`card fondo-fila${apagada ? " fila-tenue" : ""}`}>
        {/* ── EL CARTEL DE LA PELÍCULA Y EL LOGO DE LA EMPRESA ──
            Nueve códigos «PO-0xx» son nueve códigos: la obra se reconoce por su
            cartel mucho antes que por su número, y quién la produce por su
            logo. Los dos juntos, el póster grande y el logo pequeño encima de
            su esquina, dicen de un vistazo lo que las dos líneas de texto
            dicen leyendo. */}
        <span className="fondo-minis">
          {mini("proyecto", f.proy?.id, "🎞")}
          <span className="fondo-mini-emp">{mini("empresa", f.emp?.id, "🏢")}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {f.codigo}{f.proy?.nombre ? ` · ${f.proy.nombre}` : ""}
            {f.conv?.anio ? <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {f.conv.anio}</span> : null}
          </div>
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 2 }}>
            {f.emp?.nombre || ""}{f.conv?.nombre ? ` · ${f.conv.nombre}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "var(--teal)", fontWeight: 700, fontSize: 13 }}>
            {f.monto_adjudicado ? fmt(f.monto_adjudicado) : "—"}
          </div>
          <div style={{ color: chip.col, fontSize: 11.5, marginTop: 2 }}>{chip.ico} {chip.txt}</div>
          {!f.fecha_desembolso && !rendido && (
            <div style={{ color: "var(--yellow)", fontSize: 10.5, marginTop: 1 }}>sin desembolso</div>
          )}
          {/* En rojo, como dentro de la ficha: el último mes que se exige es un
              mes ya CERRADO, así que lo que falta lleva un mes de retraso. */}
          {(() => {
            const t = faltanEc.get(f.id);
            const txt = t && textoFaltan(t);
            return txt
              ? <div style={{ color: "var(--red)", fontSize: 10.5, marginTop: 1 }}>⚠ {txt}</div>
              : null;
          })()}
        </div>
      </Link>
    );
  };

  return (
    <div className="shell" style={{ maxWidth: "min(900px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>proyectos ganados, en marcha</span>
      </div>
      <h1 className="title-lg">🎬 Fondos en ejecución · {vivos.length}</h1>

      {vivos.length === 0 && rendidos.length === 0 && (
        <div className="empty">Aún no hay fondos ganados registrados.</div>
      )}
      {gruposVivos.map(g => (
        <div key={g.cat || "__sin"} style={{ marginBottom: 16 }}>
          <div className={`sec-h${g.cat ? "" : " sec-h-pend"}`}>
            🎬 {g.nombre}
            {/* El total de la familia. Es la cifra que contesta «¿dónde está
                metido el dinero?», y sin ella el grupo solo dice cuántos son —
                que es lo de menos cuando uno vale S/ 510,000 y otro S/ 50,000. */}
            <span className="sec-h-dato">{fmt(g.total)}</span>
            <span className="sec-h-sub">
              {g.fs.length} {g.fs.length === 1 ? "fondo" : "fondos"}
              {!g.cat && " — cárgale la categoría a su convocatoria"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.fs.map(ficha)}
          </div>
        </div>
      ))}

      {rendidos.length > 0 && (
        <>
          {/* Los rendidos NO se agrupan por categoría: ya no hay nada que
              decidir sobre ellos, y partirlos en cinco bloques de uno haría
              parecer trabajo lo que es archivo. */}
          <div className="sec-h sec-h-off" style={{ marginTop: 22 }}>
            ✅ Rendidos · {rendidos.length}
            <span className="sec-h-sub">cerrados — se guardan por si los preguntan</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rendidos.map(ficha)}
          </div>
        </>
      )}
    </div>
  );
}
