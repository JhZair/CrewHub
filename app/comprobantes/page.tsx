import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Comprobantes from "@/components/Comprobantes";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import { etapasDe, CATEGORIAS_OPC } from "@/lib/etapas";
import { MESES, igvDelPeriodo, motivoNoDeclara } from "@/lib/obligaciones";

export const metadata: Metadata = { title: "🧾 Comprobantes" };

/* ── 🧾 LAS FACTURAS DE LA EMPRESA ──
 *
 * Todas: las que se rinden en un fondo DAFO y las que no. Hasta ahora solo
 * cabían las primeras —`comprobante.postulacion_id` era obligatorio— y por eso
 * las compras de la asociación con plata propia no estaban en ninguna parte.
 * Ver db/comprobante-empresa.sql.
 *
 * ── POR QUÉ UNA PANTALLA Y NO UN BLOQUE EN LA FICHA ──
 * Porque las facturas llegan a diario, no por periodo ni por proyecto. Este es
 * el sitio donde se abre el sobre y se apunta. El bloque del fondo y el
 * cálculo del IGV en /obligaciones son VISTAS de esto mismo, no otros sitios
 * donde cargar: una factura, un lugar, una respuesta a «¿ya está cargada?».
 *
 * ── EL PERIODO MANDA EN LA LECTURA ──
 * La lista se filtra por mes porque la pregunta que se hace aquí es siempre la
 * de un periodo: «¿qué tengo de octubre?». Y el total de arriba es exactamente
 * el número que /obligaciones usa para decir el resultado del mes — si los dos
 * no coinciden, uno de los dos está mal, y conviene poder verlo.
 */
const soles = (n: any) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ComprobantesPage({ searchParams }: {
  searchParams: { emp?: string; anio?: string; mes?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, { data: emps }] = await Promise.all([
    supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle(),
    /* Solo las propias: las facturas de una empresa aliada las lleva ella.
       Misma regla que /obligaciones. */
    /* `estado` para separar las que operan de las que no, y
       `fecha_constitucion` porque es el suelo del navegador de años: ofrecer
       2024 a una empresa nacida en 2025 es ofrecer una pantalla que solo puede
       salir vacía. */
    supabase.from("empresas").select("id,nombre,ruc,relacion,estado,fecha_constitucion")
      .eq("relacion", "propia").order("nombre"),
  ]);
  const esAdmin = !!(perfil?.es_admin || perfil?.es_finanzas);
  /* ── SOLO LAS QUE TIENEN RUC ──
     Sin RUC no hay quien emita ni reciba comprobantes a su nombre, así que una
     empresa sin RUC en esta lista es una pestaña que no lleva a ningún sitio:
     se abre, sale vacía, y no hay forma de que deje de estarlo. Es la misma
     regla que ya separa los bloques en /obligaciones — aquí ni siquiera hace
     falta enseñarlas apagadas, porque no hay nada que apagar.

     Se mira que HAYA once dígitos, no que el dígito verificador cuadre. Con
     `rucValido` una empresa con el RUC mal tecleado desaparecería de la lista
     sin decir por qué, y sus facturas con ella: el error se arregla en
     /empresas, no escondiendo a quien lo tiene. */
  const empresas = ((emps || []) as any[])
    .filter(e => String(e.ruc || "").replace(/\D/g, "").length === 11);
  const sinRuc = (emps || []).length - empresas.length;

  /* ── LAS QUE OPERAN, PRIMERO Y ENCENDIDAS ──
     El criterio no se escribe aquí: `motivoNoDeclara` ya decide en
     /obligaciones qué empresa está operando hoy, y tener dos definiciones de
     «activa» en dos pantallas es garantizar que un día discrepen.
     Apagadas, no escondidas: una empresa cerrada sigue teniendo facturas de
     cuando operaba, y esconderla las haría inalcanzables. Se ven en gris, al
     final, y siguen abriéndose con un clic. */
  const activa = (e: any) => !motivoNoDeclara(e);
  const empresasOrdenadas = [...empresas.filter(activa), ...empresas.filter(e => !activa(e))];

  /* La empresa elegida, o la primera. Sin empresas propias no hay nada que
     enseñar y se dice, en vez de pintar una pantalla vacía sin explicación. */
  const empId = searchParams?.emp || empresasOrdenadas[0]?.id || "";
  const empresa = empresas.find((e: any) => e.id === empId) || null;

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  /* Por defecto, el mes PASADO y no el actual: el periodo que se está
     declarando ahora es el anterior, y abrir en el mes en curso obliga a
     retroceder uno cada vez. */
  const pasado = new Date(`${hoy.slice(0, 8)}01T12:00:00`);
  pasado.setMonth(pasado.getMonth() - 1);
  /* ── LOS DOS EXTREMOS DEL CALENDARIO ──
     Arriba, el año en curso: no hay facturas del futuro, y un 2027 en la barra
     solo sirve para llevar a una pantalla vacía.
     Abajo, el año en que se constituyó la empresa: una asociación creada en
     2025 no tuvo comprobantes en 2024, así que ese botón no es una opción, es
     un callejón. Sin fecha cargada no se pone suelo — inventarlo escondería
     años que sí pueden tener facturas. */
  const anioHoy = Number(hoy.slice(0, 4));
  const anioNace = empresa?.fecha_constitucion
    ? Number(String(empresa.fecha_constitucion).slice(0, 4)) : null;
  const acotar = (a: number) =>
    Math.min(anioHoy, anioNace ? Math.max(anioNace, a) : a);

  /* El año pedido también se acota: se llega aquí por enlaces —desde
     /obligaciones, o de uno guardado— y un `?anio=2027` daría una lista vacía
     sin decir por qué. Mejor caer en el año más cercano que sí existe. */
  const anio = acotar(Number(searchParams?.anio) || pasado.getFullYear());
  /* `mes = 0` es «todo el año», no un error: para revisar un ejercicio entero
     antes de la jurada anual hace falta verlo de corrido. */
  const mes = searchParams?.mes !== undefined
    ? Number(searchParams.mes) : pasado.getMonth() + 1;

  let comprobantes: any[] = [];
  let error: string | null = null;
  let fondos: { id: string; nombre: string }[] = [];
  let categoria: string | null = null;

  if (empresa) {
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    const [cmp, post] = await Promise.all([
      /* `creado:perfiles!creado_por(...)`: sin esto la fila no sabe quién la
         registró y el bloque lo cuenta como «carga directa» — una etiqueta
         tranquila y falsa sobre algo cargado desde el formulario. Con foto,
         porque abajo se pinta la cara. */
      supabase.from("comprobante")
        .select("*, creado:perfiles!creado_por(nombre,avatar_url,color)")
        .eq("empresa_id", empresa.id).gte("fecha", desde).lte("fecha", hasta)
        .order("fecha", { ascending: false }),
      /* Los fondos de esta empresa, para poder imputar. Solo los ganados: a
         una postulación que no ganó no se le rinde nada. */
      supabase.from("postulaciones")
        .select("id,codigo,estado,proy:proyectos(nombre),conv:convocatorias(categoria)")
        .eq("empresa_id", empresa.id).eq("estado", "ganadora"),
    ]);
    error = (cmp as any)?.error?.message || null;
    comprobantes = (cmp.data || []) as any[];
    fondos = ((post.data || []) as any[]).map((p: any) => ({
      id: p.id,
      nombre: `${p.codigo}${p.proy?.nombre ? ` · ${p.proy.nombre}` : ""}`,
    }));
    categoria = ((post.data || [])[0] as any)?.conv?.categoria || null;
  }

  // Lo que se pinta: el año entero, o solo el mes elegido.
  const visibles = mes >= 1 && mes <= 12
    ? comprobantes.filter((c: any) => Number(String(c.fecha).slice(5, 7)) === mes)
    : comprobantes;

  /* El IGV del periodo visible, con la MISMA función que usa /obligaciones.
     Calcularlo aquí por separado habría dado dos números que casi siempre
     coinciden — y el día que no, nadie sabría cuál creer. */
  const igv = mes >= 1 && mes <= 12
    ? igvDelPeriodo(comprobantes, anio, mes)
    : (() => {
        const d = comprobantes.filter((c: any) => c.sentido === "venta")
          .reduce((s: number, c: any) => s + Number(c.igv || 0), 0);
        const cr = comprobantes.filter((c: any) => c.sentido !== "venta")
          .reduce((s: number, c: any) => s + Number(c.igv || 0), 0);
        return { debito: d, credito: cr, aPagar: d - cr, comprobantes: comprobantes.length };
      })();

  const q = (o: Record<string, any>) => {
    const p = new URLSearchParams({ emp: empId, anio: String(anio), mes: String(mes), ...o });
    return `/comprobantes?${p.toString()}`;
  };
  /* La ventana sigue siendo relativa al año MIRADO —así se camina hacia atrás
     tantos años como haga falta— pero recortada por los dos extremos, y sin
     repetidos cuando el recorte hace coincidir varios. */
  const anios = [anio + 1, anio, anio - 1, anio - 2]
    .map(acotar)
    .filter((a, i, l) => l.indexOf(a) === i)
    .sort((a, b) => b - a);

  return (
    <div className="shell" style={{ maxWidth: "min(1180px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>compras y ventas de la empresa</span>
      </div>

      <h1 className="title-lg">🧾 Comprobantes</h1>
      <p className="fondo-nat-sub">
        Todas las facturas y boletas de cada empresa: las que se rinden en un fondo DAFO
        y las que no. De aquí sale el IGV de cada mes en <Link href="/obligaciones">obligaciones</Link>.
      </p>

      {empresas.length === 0 && (
        /* Decir CUÁL de los dos vacíos es: «no hay ninguna» y «las que hay no
           tienen RUC» se arreglan en sitios distintos. */
        <div className="empty">
          {sinRuc > 0
            ? `Ninguna empresa propia tiene RUC cargado (${sinRuc} sin RUC). Cárgalo en /empresas y aparecerán aquí.`
            : "No hay empresas propias registradas."}
        </div>
      )}

      {/* ── QUÉ EMPRESA Y QUÉ PERIODO ──
          Las tres decisiones de esta pantalla, juntas y siempre a la vista. El
          periodo va en la URL y no en estado del cliente para que un mes
          concreto se pueda enlazar — es lo que permite el atajo desde la fila
          de /obligaciones. */}
      {empresas.length > 0 && (
        <div className="cmpp-barra">
          <div className="tv-vistas">
            {empresasOrdenadas.map((e: any) => {
              const m = motivoNoDeclara(e);
              return (
                <Link key={e.id} href={`/comprobantes?emp=${e.id}&anio=${anio}&mes=${mes}`}
                  className={`vtab${e.id === empId ? " on" : ""}${m ? " fila-tenue" : ""}`}
                  title={m ? `${e.nombre} — ${m.ayuda}` : e.nombre}>
                  {e.nombre}
                </Link>
              );
            })}
          </div>
          <span style={{ flex: 1 }} />
          <div className="tv-vistas">
            {anios.map(a => (
              <Link key={a} href={q({ anio: a })} className={`vtab${a === anio ? " on" : ""}`}>{a}</Link>
            ))}
          </div>
        </div>
      )}

      {empresas.length > 0 && (
        <div className="cmpp-meses">
          <Link href={q({ mes: 0 })} className={`vtab${mes === 0 ? " on" : ""}`}
            title="Todo el año, para revisar un ejercicio completo">todo {anio}</Link>
          {MESES.map((m, i) => {
            const n = comprobantes.filter((c: any) =>
              Number(String(c.fecha).slice(5, 7)) === i + 1).length;
            return (
              <Link key={m} href={q({ mes: i + 1 })}
                className={`vtab${mes === i + 1 ? " on" : ""}${n === 0 ? " fila-tenue" : ""}`}
                title={n ? `${n} comprobante(s)` : "Sin comprobantes cargados de este mes"}>
                {m.slice(0, 3)}{n > 0 && <b style={{ marginLeft: 4, color: "var(--teal)" }}>{n}</b>}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── EL NÚMERO QUE VA A LA DECLARACIÓN ──
          Débito menos crédito, con la misma función que /obligaciones. Si este
          total no cuadra con lo que se declaró en SOL, falta o sobra una
          factura — y eso es exactamente lo que esta pantalla existe para
          poder ver antes de declarar, no después. */}
      {empresa && (
        <div className="eqf-res">
          <span>
            <b>{visibles.length}</b> comprobante{visibles.length === 1 ? "" : "s"}
            {mes >= 1 && mes <= 12 ? ` de ${MESES[mes - 1]} ${anio}` : ` de ${anio}`}
          </span>
          <span style={{ color: "var(--dim)" }}>
            IGV de ventas <b style={{ color: "var(--text)" }}>{soles(igv.debito)}</b>
          </span>
          <span style={{ color: "var(--dim)" }}>
            IGV de compras <b style={{ color: "var(--text)" }}>{soles(igv.credito)}</b>
          </span>
          <span style={{ color: igv.aPagar > 0 ? "var(--yellow)" : igv.aPagar < 0 ? "var(--green)" : "var(--dim)" }}
            title="Débito menos crédito. Negativo es saldo a favor y arrastra al mes siguiente.">
            {igv.aPagar > 0 ? `A pagar ${soles(igv.aPagar)}`
              : igv.aPagar < 0 ? `Saldo a favor ${soles(-igv.aPagar)}`
              : "En cero"}
          </span>
          {!esAdmin && (
            <span style={{ color: "var(--dim)" }}
              title="Registrar y corregir comprobantes es de administración (db/rhe-permisos.sql). Leerlos, de todo el equipo.">
              · solo lectura
            </span>
          )}
        </div>
      )}

      {empresa && (
        <div className="card">
          <Comprobantes
            empresaId={empresa.id}
            fondos={fondos}
            comprobantes={visibles as any}
            /* Etapa y rubro solo tienen sentido dentro de un fondo. Fuera se
               ofrecen igual —una compra imputada a un fondo los necesita— y se
               sacan de la categoría de su convocatoria. */
            etapas={etapasDe(categoria).map(e => ({ id: e.clave, nombre: e.nombre }))}
            rubros={[]}
            esAdmin={esAdmin}
            error={error}
            urlSunat={await urlPlataforma(PLAT.sunatConsultaRuc)}
            userId={user.id}
          />
        </div>
      )}
    </div>
  );
}
