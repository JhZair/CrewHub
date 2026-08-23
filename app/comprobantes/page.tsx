import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Comprobantes from "@/components/Comprobantes";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import { etapasDe, CATEGORIAS_OPC } from "@/lib/etapas";
import { MESES, igvDelPeriodo, motivoNoDeclara } from "@/lib/obligaciones";
import { empresasPropiasConLogo, conRuc, type EmpresaPropia } from "@/lib/empresasPropias";
import ResumenEmpresas, { type FilaResumen } from "@/components/ResumenEmpresas";
import { repLegalDeEmpresas } from "@/lib/repLegal";
import Avatar from "@/components/Avatar";
import Copiar from "@/components/Copiar";
import { mapaAlias } from "@/lib/personas";

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

  /* ══ SOLO LO QUE DEPENDE DE LA EMPRESA ELEGIDA ══
     La lista de empresas y sus logos viven en el `layout` y no se vuelven a
     pedir al cambiar de pestaña. Aquí, cuando la URL ya dice cuál —o sea,
     siempre después del primer clic— se pide ESA empresa y ninguna más.
     Antes se traían las quince en cada clic para usar una.

     El caso sin `?emp=` es la primera entrada: ahí sí hace falta la lista, y
     solo para saber cuál abrir. La regla de cuál es «la primera» sale de
     `ordenarEmpresas`, la misma que usa la barra para encender la pestaña —si
     cada una ordenara por su cuenta, entrar sin parámetros encendería una
     pestaña y cargaría los datos de otra. No daría error: se vería una lista
     de facturas bajo el nombre equivocado. */
  const pedido = searchParams?.emp || "";
  /* `razon_social` y `tipo`: la cabecera dice el nombre LEGAL completo, no el
     corto de la pestaña. En un comprobante lo que vale es la razón social. */
  const SEL_EMP = "id,nombre,razon_social,tipo,ruc,relacion,estado,fecha_constitucion";

  const [{ data: perfil }, { data: aliasPers }, elegida] = await Promise.all([
    supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle(),
    /* El alias corto del equipo. Mismo cruce y misma función que /caja,
       /obligaciones, /admin y las fichas: `mapaAlias`. */
    supabase.from("personas").select("usuario_id,alias")
      .not("alias", "is", null).not("usuario_id", "is", null),
    pedido
      ? supabase.from("empresas").select(SEL_EMP)
          .eq("id", pedido).eq("relacion", "propia").maybeSingle()
          .then((r: any) => r.data || null)
      /* ── SIN `?emp=` NO SE ELIGE POR NADIE ──
         Aquí se abría la primera empresa de la lista. Se leía como una
         decisión cuando nadie había decidido nada, y la pregunta con la que
         de verdad se entra a esta pantalla no es «qué tiene Wilkakalle» sino
         «dónde falta cargar». Ahora «ninguna» es un estado con su propia
         pantalla: el resumen de todas. */
      : Promise.resolve(null),
  ]);
  const esAdmin = !!(perfil?.es_admin || perfil?.es_finanzas);
  const alias = mapaAlias(aliasPers as any);

  /* Si el `?emp=` de la URL no existe o no es propia, `elegida` viene en nulo y
     la pantalla lo dice. Antes esto no podía pasar porque se buscaba dentro de
     una lista ya filtrada; ahora que se pide por id, un enlace viejo a una
     empresa borrada tiene que tener respuesta. */
  const empresa = elegida;
  const empId = empresa?.id || "";

  /* ── LA FICHA DE QUIÉN FACTURA ──
     Quién es la empresa se mira al empezar a cargar comprobantes: la razón
     social va en la factura, el RUC se teclea en SOL y el representante legal
     es a quien hay que llamar si algo falta. Estaban a dos pantallas de
     distancia —en /empresas— y se acababa abriendo otra pestaña para
     comprobar un dígito.
     Las dos consultas son de UNA empresa y van juntas: el logo y quién firma.
     `repLegalDeEmpresas` no es una columna, deduce el cargo vigente — misma
     regla que /obligaciones, para que las dos pantallas nombren al mismo. */
  const [repLegal, logoEmp] = empId
    ? await Promise.all([
        repLegalDeEmpresas(supabase, [empId]),
        supabase.from("entidad_media").select("cartel_url")
          .eq("entidad_tipo", "empresa").eq("entidad_id", empId).maybeSingle(),
      ])
    : [new Map(), { data: null } as any];
  const rl = repLegal.get(empId) || null;
  const logo = (logoEmp as any)?.data?.cartel_url || null;

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

  /* ══ EL RESUMEN DE TODAS, CUANDO NO HAY NINGUNA ELEGIDA ══
     Una sola consulta para las quince empresas: los comprobantes del año con
     las cinco columnas que el panel necesita, agrupadas aquí en memoria. La
     alternativa —una consulta por empresa— serían quince viajes para pintar
     quince filas, y crecería con cada asociación nueva.
     `creado_en` y quién: la última carga es de CrewHub, no la fecha de la
     factura. Es lo que delata lo abandonado — «tres meses sin tocar» no
     aparece en ningún otro sitio. */
  let resumen = new Map<string, FilaResumen>();
  let todas: EmpresaPropia[] = [];
  let logosTodas: Record<string, string> = {};
  if (!empresa) {
    const r = await empresasPropiasConLogo(supabase);
    todas = r.empresas.filter(conRuc);
    logosTodas = r.logos;
    const ids = todas.map(e => e.id);
    const { data: filas } = ids.length
      ? await supabase.from("comprobante")
          .select("empresa_id,igv,sentido,creado_en,creado:perfiles!creado_por(nombre)")
          .in("empresa_id", ids)
          .gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`)
      : { data: [] as any[] };

    (filas || []).forEach((f: any) => {
      const k = f.empresa_id;
      if (!k) return;
      const a = resumen.get(k)
        || { empresaId: k, comprobantes: 0, igvCompras: 0, igvVentas: 0, ultimaCarga: null, ultimaPor: null };
      a.comprobantes++;
      if (f.sentido === "venta") a.igvVentas += Number(f.igv || 0);
      else a.igvCompras += Number(f.igv || 0);
      /* La más reciente gana. Se compara como texto porque son ISO: ordenan
         igual que como fechas y sin construir un Date por fila. */
      if (f.creado_en && String(f.creado_en) > String(a.ultimaCarga || "")) {
        a.ultimaCarga = f.creado_en;
        const q = Array.isArray(f.creado) ? f.creado[0] : f.creado;
        a.ultimaPor = q?.nombre || null;
      }
      resumen.set(k, a);
    });
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
    /* La cabecera, el rótulo y la barra de empresas viven en el `layout`: no
       dependen de qué empresa mires y así no se vuelven a pedir en cada clic.
       Aquí queda solo lo que sí cambia. */
    <>
      {/* ── QUIÉN FACTURA ──
          El nombre corto está en la pestaña; aquí va el legal, que es el que
          aparece en el comprobante. El RUC se copia de un clic porque su
          destino es el casillero de SOL, y un dígito mal no da error: devuelve
          otra empresa. Y quien firma, con cara: es a quien se llama cuando
          falta una factura. */}
      {empresa && (
        <div className="cmpp-ficha">
          <Avatar nombre={empresa.nombre} src={logo} size={38} />
          <div className="cmpp-ficha-txt">
            <b>{empresa.razon_social || empresa.nombre}</b>
            <span className="cmpp-ficha-sub">
              {empresa.ruc
                ? <Copiar valor={String(empresa.ruc)} etiqueta="RUC">RUC {empresa.ruc}</Copiar>
                : <i style={{ color: "var(--yellow)" }}>sin RUC</i>}
              {empresa.fecha_constitucion && (
                <span title="Fecha de constitución. Es el suelo de esta pantalla: no hay comprobantes anteriores.">
                  · desde {new Date(`${String(empresa.fecha_constitucion).slice(0, 10)}T12:00:00`)
                    .toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </span>
          </div>
          {/* Sin representante legal se DICE, no se deja el hueco: en una
              empresa que factura, no saber quién firma es un dato que falta,
              no un espacio vacío. */}
          <span className="cmpp-ficha-rl" title={rl?.cargo || "Representante legal"}>
            {rl ? (
              <>
                <Avatar nombre={rl.nombre} src={rl.foto} size={22} />
                <span>{rl.alias || rl.nombre}</span>
              </>
            ) : (
              <i style={{ color: "var(--dim)" }}>sin representante legal</i>
            )}
          </span>
        </div>
      )}

      {/* ── SIN EMPRESA ELEGIDA: TODAS DE UN VISTAZO ──
          La pregunta con la que se entra aquí casi nunca es «qué tiene esta
          empresa», es «dónde falta cargar». El panel la contesta antes de
          pedir un clic. */}
      {!empresa && (
        <ResumenEmpresas empresas={todas} logos={logosTodas} filas={resumen} anio={anio}
          href={id => `/comprobantes?emp=${id}&anio=${anio}&mes=${mes}`} />
      )}

      {/* El periodo va en la URL y no en estado del cliente para que un mes
          concreto se pueda enlazar — es lo que permite el atajo desde la fila
          de /obligaciones. */}
      {empresa && (
        <div className="cmpp-barra">
          <span style={{ flex: 1 }} />
          <div className="tv-vistas">
            {anios.map(a => (
              <Link key={a} href={q({ anio: a })} className={`vtab${a === anio ? " on" : ""}`}>{a}</Link>
            ))}
          </div>
        </div>
      )}

      {/* Los meses cuelgan de la empresa abierta, igual que los años: sin
          empresa no hay periodo que filtrar. */}
      {empresa && (
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
            alias={alias}
          />
        </div>
      )}
    </>
  );
}
