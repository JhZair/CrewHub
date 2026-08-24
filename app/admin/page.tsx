import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import TabsPanel from "@/components/TabsPanel";
import CuentasPanel, { type Cuenta } from "@/components/CuentasPanel";
import TarifasEditor from "@/components/TarifasEditor";
import BitacoraJornadas from "@/components/BitacoraJornadas";
import LiquidacionAdmin from "@/components/LiquidacionAdmin";
import BotonDestacar from "@/components/BotonDestacar";
import RheAdmin from "@/components/RheAdmin";
import PlataformasAdmin from "@/components/PlataformasAdmin";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { buscadorDe, pal } from "@/lib/buscar";
import { estado4ta } from "@/lib/cuarta";
import { etapaLiquidacion, diasParado, atascada, pagoDe, DIAS_ATASCO } from "@/lib/pagos";
import { ejecutando, rendicionVencida, SEL_FONDO } from "@/lib/fondos";
import { haceOEn } from "@/lib/fechas";
import { ICO_ENT, rutaEntidad, tipoCanonico } from "@/lib/secciones";
import { BOT, mapaAlias } from "@/lib/personas";
import Link from "@/components/Enlace";
import { plazoDe, diasHasta } from "@/lib/plazo";
import { colorTipo, rotuloTipo } from "@/lib/tipos";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "⚙ Administración" };

/* Administración — temas de gestión que el usuario común no toca:
   aprobar jornadas, liquidar el mes (recibos) y tarifas del personal. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* (Los colores salieron a lib/tipos. Éste era el caso más raro de los diez:
   guardaba SOLO los colores, en un mapa aparte, con los mismos nombres y los
   mismos valores hexadecimales que los otros nueve.) */

/* Dona de jornadas: SVG a mano, sin librería.
   Un anillo de dos tramos no justifica traerse Chart.js —200 KB para dibujar
   dos arcos—, y una librería más es una cosa más que actualizar. El truco es
   `stroke-dasharray` sobre un círculo: el primer tramo mide lo aprobado y el
   resto queda al descubierto. */
function Dona({ aprobadas, pendientes }: { aprobadas: number; pendientes: number }) {
  const total = aprobadas + pendientes;
  const R = 52, C = 2 * Math.PI * R;
  const pct = total ? aprobadas / total : 0;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" role="img"
      aria-label={`${aprobadas} de ${total} jornadas aprobadas`}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--yellow)" strokeWidth="14" opacity=".85" />
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--green)" strokeWidth="14"
        strokeDasharray={`${C * pct} ${C}`} strokeLinecap="butt"
        transform="rotate(-90 64 64)" />
      <text x="64" y="61" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="800">{total}</text>
      <text x="64" y="78" textAnchor="middle" fill="var(--dim)" fontSize="10"
        letterSpacing="1" style={{ textTransform: "uppercase" }}>jornadas</text>
    </svg>
  );
}

function Leyenda({ col, n, txt, total }: { col: string; n: number; txt: string; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: "inline-block" }} />
      <b style={{ color: "var(--text)" }}>{n}</b>
      <span style={{ color: "var(--muted)" }}>{txt}</span>
      <span style={{ color: "var(--dim)" }}>· {pct}%</span>
    </div>
  );
}

export default async function Admin({ searchParams }: {
  searchParams: {
    lm?: string; s?: string; fd?: string; qd?: string; jm?: string;
    /* De dónde viene el «＋ registrar el recibo» de la liquidación: quién,
       qué mes paga y por cuánto. Van en la URL y no en un estado compartido
       porque cruzan una pestaña, y una URL además se puede pegar en un
       mensaje: «regístrale el recibo a Michel». */
    rhe_de?: string; rhe_liq?: string; rhe_monto?: string;
    ra?: string;   // año que se está mirando en 🧾 RHE (0 = el actual)
  };
}) {
  /* Sección activa. Antes entraba directo a «aprobar jornadas» porque era lo
     más frecuente; ahora abre la portada, que dice si hay jornadas por
     aprobar y además todo lo demás que espera. Entrar a una tarea concreta
     escondía las otras cinco. */
  const s = searchParams?.s || "portada";
  const fd = searchParams?.fd || "";                  // filtro dentro de Destacados
  const qd = (searchParams?.qd || "").trim();          // búsqueda dentro de Destacados
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* ── QUIÉN ENTRA, Y A QUÉ ──
     `es_admin` da esta pantalla entera: aprobar jornadas, liquidar meses,
     tarifas, plataformas. `es_finanzas` da SOLO el panel de RHE, que es el
     trabajo del asistente de administración — registrar recibos de terceros y
     atarlos a su mes.
     No se le da `es_admin` «porque es de confianza»: un permiso que se amplía
     para conceder otro distinto es como se acaban repartiendo llaves maestras,
     y aquí las otras pestañas deciden pagos y congelan meses. */
  const { data: perfil } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).single();
  const soloFinanzas = !perfil?.es_admin && !!perfil?.es_finanzas;
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return (
      <div className="shell">
        <div className="topbar"><Volver /></div>
        <div className="empty">⚙ Esta sección es solo para administración.</div>
      </div>
    );
  }

  // Mes a liquidar (por defecto el actual; navegable)
  const lmOff = parseInt(searchParams?.lm || "0", 10) || 0;
  const hoy = new Date();
  const bl = new Date(hoy.getFullYear(), hoy.getMonth() + lmOff, 1);
  const lAnio = bl.getFullYear(); const lMes = bl.getMonth(); // 0-indexado
  const pad = (n: number) => String(n).padStart(2, "0");
  const lInicio = `${lAnio}-${pad(lMes + 1)}-01`;
  const lFin = `${lMes === 11 ? lAnio + 1 : lAnio}-${pad(lMes === 11 ? 1 : lMes + 2)}-01`;

  const anioActual = hoy.getFullYear();
  /* El año que se está mirando en el panel de RHE. Antes era siempre el actual
     y eso escondía un fallo callado: el formulario acepta cualquier fecha, así
     que un recibo de un año pasado se guardaba bien y desaparecía de la lista
     al instante. El único indicio era su ausencia, que se lee como «no se
     guardó» — y el segundo intento crea el duplicado. */
  const raOff = parseInt(searchParams?.ra || "0", 10) || 0;
  const rAnio = anioActual + raOff;

  const [{ data: personas }, { data: cobrables }, { data: rhes }, { data: jornsPend },
         { data: proyectos }, { data: jornsMes }, { data: liqs, error: eLiqs }, { data: liqsAnio },
         { data: plats }, { data: credsPlat }, { data: vivos },
         { data: ganadoras }, { data: activid },
         { data: cuentasBase }, { data: escrito, error: eEscrito },
         { data: fichasCuenta }, { data: fichasElegibles },
         { data: invitados, error: eInv }] = await Promise.all([
    // `usuario_id`: llave para poner el alias del actor en la actividad reciente
    /* ⚠ QUIÉN SALE EN TARIFAS = QUIÉN PUEDE COBRAR UNA JORNADA.
       Esto filtraba `tipo = 'personal'` y ya, pero `registrarMiJornada`
       (app/actions.ts) busca la ficha por `usuario_id` y NO mira el tipo: con
       la cuenta enlazada, cualquiera puede registrar jornadas. Ruby entró el
       24 ago como `colaborador`, registró su primer caso y no aparecía aquí —
       o sea que podía apuntar jornadas y administración no tenía dónde ponerle
       la tarifa. El importe le habría salido «sin tarifa» para siempre, sin
       error y sin sitio donde arreglarlo.
       Dos reglas para la misma cosa en dos archivos. Ahora es una: entra quien
       tiene cuenta enlazada (puede cobrar hoy) y quien es `personal` aunque
       todavía no la tenga (va a poder). */
    supabase.from("personas").select("id,nombre,alias,tipo,foto_url,usuario_id,estado,tarifa_dia,tarifa_rodaje,tarifa_noche")
      .or("tipo.eq.personal,usuario_id.not.is.null").order("nombre"),
    // A quién se le puede girar un RHE, y los del año en curso
    supabase.from("personas").select("id,nombre,alias,suspension_4ta_anio")
      .in("tipo", ["personal", "colaborador", "colaborador eventual", "independiente"])
      .eq("estado", "activo").order("nombre"),
    supabase.from("rhe").select("*")
      .gte("fecha", `${rAnio}-01-01`).lt("fecha", `${rAnio + 1}-01-01`)
      .order("fecha", { ascending: false }).limit(400),
    supabase.from("jornadas")
      /* Las tarifas viajan CON la jornada y no en un mapa aparte sacado de
       `personas`: aquella consulta filtra por `tipo = 'personal'`, así que la
       jornada de un colaborador se habría quedado sin tarifa y su ↻ no habría
       aparecido — sin decir por qué. Aquí, toda fila que se pinta trae la
       suya. */
    /* ⚠ UNA SOLA CADENA, sin concatenar. supabase-js deduce el tipo del
       resultado LEYENDO este literal: partido en dos con un `+` deja de poder
       leerlo y todas las filas pasan a ser `GenericStringError`, con lo que
       `j.monto` deja de existir cincuenta líneas más abajo. Compila mal en un
       sitio que no tiene nada que ver con este. */
    .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,notas,per:personas(nombre,alias,foto_url,tarifa_dia,tarifa_rodaje,tarifa_noche),proy:proyectos(nombre)")
      .eq("aprobada", false).order("fecha", { ascending: false }).limit(400),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    /* `proy` y `fecha` entran para la portada: sin proyecto no se puede decir
       en qué se fue el mes, que es la única pregunta que un gráfico de barras
       contesta mejor que una tabla. */
    /* `id`, `tipo` y `noche` entran para poder ABRIR el detalle de cada
       persona antes de liquidar: firmar S/ 2,310 sin ver de qué se componen
       es pedirle a alguien que confíe en un total. */
    supabase.from("jornadas").select("id,persona_id,fecha,tipo,noche,fraccion,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
      .gte("fecha", lInicio).lt("fecha", lFin).order("fecha", { ascending: false }).limit(3000),
    /* `id` y las dos fechas, no solo el estado: desde que el expediente de
       pago se deduce (lib/pagos.ts), el `id` es por donde cuelgan sus recibos
       y las fechas son las que dicen si está atascado o cerrado. */
    supabase.from("liquidaciones").select("id,persona_id,estado,liquidado_en,cerrado_en")
      .eq("anio", lAnio).eq("mes", lMes + 1),
    /* Todas las liquidaciones del año, para el selector «¿qué mes paga este
       recibo?» del panel de RHE. Van aparte de las de arriba porque aquello es
       un mes y esto es el año entero: un recibo de octubre puede estar pagando
       agosto, y forzarlo al mes en pantalla habría hecho imposible registrarlo
       bien justo en el caso en que el vínculo más importa. */
    /* Este año y el pasado. Con solo el actual había un callejón de calendario:
       el mes se liquida a principios del siguiente, así que el recibo que paga
       DICIEMBRE lleva fecha de enero — y en enero, diciembre ya no estaba en la
       lista. Ese mes no se podía enlazar nunca, y sin recibo enlazado tampoco
       se podía cerrar: quedaba «sin recibo» para siempre, con su recibo
       delante. */
    supabase.from("liquidaciones").select("id,persona_id,anio,mes,estado,cerrado_en")
      .gte("anio", rAnio - 1).lte("anio", rAnio).order("anio").order("mes"),
    // Las puertas del sistema + qué credenciales entran por cada una.
    // `puertas` son las entradas adicionales: Clave SOL es una cuenta con
    // tres sitios distintos, y con un solo `url` entraba uno.
    supabase.from("plataformas")
      .select("*,puertas:plataforma_puertas(id,titulo,url,notas,orden)")
      .order("nombre"),
    supabase.from("credenciales").select("plataforma"),
    /* Casos vivos, para elegir cuáles suben a la cabecera del feed.
       Estaba en 60 y ordenado por creación descendente: los que se caían
       eran los MÁS VIEJOS, o sea los olvidados, los sin fecha — justo los
       que esta pantalla existe para rescatar. Y los contadores del menú y
       de los chips se calculaban sobre ese recorte, así que podían mentir.
       300 cubre de sobra el tamaño real (unos 25 vivos) y el aviso de abajo
       avisa si algún día no alcanza. */
    supabase.from("publicaciones")
      .select("id,tipo,titulo,fecha_limite,destacado_hasta")
      .in("estado", ["abierta", "en_progreso", "seguimiento"])
      .is("archivado_en", null)   // lo archivado no se destaca ni se lista aquí
      .neq("tipo", "bitacora")    // las notas del muro solo viven en su proyecto
      .order("creado_en", { ascending: false }).limit(300),
    /* Para la portada: lo que espera acción en dinero de fondos. Las
       rendiciones vencidas son lo más caro que hay callado en el sistema —
       una empresa que le debe una rendición a DAFO no puede postular. */
    supabase.from("postulaciones")
      .select(`${SEL_FONDO},proy:proyectos(nombre),emp:empresas(id,nombre)`)
      .eq("estado", "ganadora"),
    // Los últimos movimientos, de quien sea: es el pulso del sistema
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
      .order("creado_en", { ascending: false }).limit(12),
    /* ── LAS CUENTAS ──
       TODAS, encendidas y apagadas: esta es la única pantalla desde la que se
       vuelve a encender una, y una lista que esconde lo apagado no tiene de
       dónde recuperarlo. */
    supabase.from("perfiles")
      .select("id,nombre,avatar_url,color,rol,activo,es_admin,es_finanzas,creado_en")
      .order("nombre"),
    /* ── CUÁNTO HA ESCRITO CADA CUENTA ──
       Lo cuenta POSTGRES, no esta página. La primera versión se traía las dos
       columnas de `autor_id` enteras y agrupaba en memoria, y eso tenía un
       fallo que este panel no se puede permitir: PostgREST corta en 1.000
       filas por defecto y no avisa. Con más de mil comentarios, el recorte es
       arbitrario —no hay `order`— y una cuenta con trabajo real podía salir
       con «nada». Este panel existe para decidir a quién se apaga: un número
       que se equivoca aquí hace que alguien apague a un compañero.
       `resumen_cuentas()` lo define db/cuentas-activas.sql. Si la migración no
       está corrida devuelve error, y entonces la columna dice «—» en vez de un
       cero que sería mentira. */
    supabase.rpc("resumen_cuentas"),
    /* ── CON QUÉ PERSONA ESTÁ ENLAZADA CADA CUENTA ──
       `personas.usuario_id` es lo que ata una cuenta de Google a la ficha de
       una persona del colectivo, y es el dato que contesta «¿esta quién es?»
       sin depender de `auth.users`. Una cuenta SIN ficha no es delito —alguien
       recién llegado empieza así— pero junto a un «nada» en lo que ha escrito
       es el retrato del login de paso.
       Va aparte de la consulta de personas de arriba porque aquélla pide solo
       `tipo = personal` y aquí interesan todas las que tengan cuenta. */
    /* ── DOS CONSULTAS, Y LA DIFERENCIA IMPORTA ──
       1) Las fichas YA ATADAS, sin filtrar por tipo. `tipo` vale «contacto»
          por defecto en el esquema, así que filtrar aquí haría desaparecer
          enlaces existentes: la fila diría «sin ficha» y, si alguien elegía
          otra, el enlace invisible se borraría sin avisar. Son una docena. */
    supabase.from("personas").select("id,nombre,alias,usuario_id,tipo,rol")
      .not("usuario_id", "is", null),
    /* 2) Las que se pueden ELEGIR. Aquí sí se filtra: `personas` guarda
          también proveedores, bancos y contactos heredados de SeaTable, y
          ofrecer «Banco BCP» como ficha de una cuenta de acceso es una opción
          que solo sirve para equivocarse. Los cuatro tipos son los mismos que
          usa el panel de RHE para decidir a quién se le gira un recibo.
          El tope va explícito porque el de PostgREST son mil filas y recorta
          sin avisar. */
    supabase.from("personas").select("id,nombre,alias,usuario_id,tipo")
      .in("tipo", ["personal", "colaborador", "colaborador eventual", "independiente"])
      .order("nombre").limit(2000),
    /* La lista de invitados. Solo administración puede leerla (RLS), y si
       falta db/invitaciones.sql vuelve con su queja y la pantalla lo dice en
       vez de enseñar un bloque de invitar que no invitaría nada. */
    supabase.from("cuenta_permitida").select("email,nota,creado_en")
      .order("creado_en", { ascending: false }),
  ]);

  /* Las cuentas, con lo que ha escrito cada una pegado. Va aquí y no en el
     panel porque contar es del servidor: al componente le llega la respuesta,
     no los datos para deducirla. */
  const escritoPor = new Map<string, { email: string | null; casos: number; comentarios: number }>(
    ((escrito || []) as any[]).map((r: any) =>
      [r.id, { email: r.email || null,
               casos: Number(r.casos || 0), comentarios: Number(r.comentarios || 0) }]));
  const atadas = (fichasCuenta || []) as any[];
  const fichaDe = new Map<string, { id: string; nombre: string; tipo?: string | null; rol?: string | null }>(
    atadas.map((f: any) =>
      [f.usuario_id, { id: f.id, nombre: f.alias || f.nombre, tipo: f.tipo, rol: f.rol }]));
  /* Para el selector: las elegibles MÁS las que ya están atadas aunque sean de
     otro tipo. Sin esa unión, una cuenta enlazada a una ficha de tipo
     «contacto» no encontraría la suya en su propio desplegable — vería «sin
     ficha» teniendo una, y elegir otra habría borrado la primera.
     El nombre va completo, con el alias entre paréntesis: aquí se ELIGE y hay
     que reconocer a quién; el corto es para las listas donde ya se sabe de
     quién se habla. */
  const rotulo = (f: any) =>
    f.alias && f.alias !== f.nombre ? `${f.nombre} (${f.alias})` : f.nombre;
  const porId = new Map<string, any>();
  [...((fichasElegibles || []) as any[]), ...atadas].forEach((f: any) => porId.set(f.id, f));
  const fichasParaElegir = [...porId.values()]
    .map((f: any) => ({ id: f.id, nombre: rotulo(f), libre: !f.usuario_id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  /* Invitados que TODAVÍA no han entrado. Los que ya tienen cuenta salen en la
     tabla de abajo con su nombre y su cara; repetirlos aquí como un correo
     suelto sería la misma persona dos veces diciendo cosas distintas.
     ⚠ Saber quién ya entró depende del correo, y el correo solo llega si la
     función de db/cuentas-activas.sql está al día. Sin él, el cruce da vacío y
     TODOS los invitados saldrían como pendientes —incluidos los que trabajan
     aquí a diario, con una ✕ al lado que les quitaría la entrada—. Cuando no
     se puede cruzar, la lista no se enseña: mejor sin ella que con gente que
     no debería estar. */
  const yaEntraron = new Set(
    ((cuentasBase || []) as any[]).map((c: any) => (escritoPor.get(c.id)?.email || "").toLowerCase())
      .filter(Boolean));
  const sinInvitaciones = !!eInv;
  const cuentas: Cuenta[] = ((cuentasBase || []) as any[]).map((c: any) => ({
    ...c, ...(escritoPor.get(c.id) || { email: null, casos: 0, comentarios: 0 }),
    persona: fichaDe.get(c.id) || null,
  }));
  /* Sin la migración no hay conteo, y entonces NO se enseña un cero: un cero
     falso en esta columna es lo que haría apagar a quien no toca. */
  const sinConteo = !!eEscrito;
  /* ── LA MIGRACIÓN CORRIDA A MEDIAS ──
     `resumen_cuentas` ganó la columna del correo DESPUÉS de su primera
     versión. Si la base se quedó con aquélla, la función responde —los conteos
     salen— pero sin correo, y la pantalla decía «sin ficha de persona» en las
     doce filas como si el dato no existiera. No es que no exista: es que la
     función es vieja. La pregunta se contesta sin preguntar nada más: si
     vinieron filas y ninguna trae siquiera la CLAVE `email`, es la de antes. */
  const correoViejo = !sinConteo && ((escrito || []) as any[]).length > 0
    && !("email" in (((escrito || []) as any[])[0] || {}));

  /* Va aquí y no arriba porque depende de las dos banderas de la migración:
     escrito antes, TypeScript lo canta —y con razón, porque en tiempo de
     ejecución habría leído `undefined` y la lista habría salido con todo el
     mundo dentro. */
  const puedoCruzar = !sinConteo && !correoViejo;
  /* ── LA OTRA LISTA, LA QUE NO SE VEÍA ──
     Mientras `ALLOWED_EMAILS` exista, las dos listas se suman en la puerta. Y
     eso tenía una consecuencia fea: quitar a alguien desde aquí no le quitaba
     la entrada si su correo seguía en la variable, y la pantalla decía que sí.
     Se enseñan las dos, marcadas. Los del entorno traen un botón para pasarlos
     a la lista de la base — que es el paso previo a poder borrar la variable
     de Vercel y acabar con las dos verdades.
     Se lee en el servidor: `process.env` no existe en el navegador. */
  const delEntorno = (process.env.ALLOWED_EMAILS || "")
    .split(",").map((x: string) => x.trim().toLowerCase()).filter(Boolean);
  const enLaTabla = new Set(((invitados || []) as any[]).map((i: any) => String(i.email).toLowerCase()));

  const invitacionesPend = puedoCruzar
    ? [
        ...((invitados || []) as any[])
          .filter((i: any) => !yaEntraron.has(String(i.email).toLowerCase()))
          .map((i: any) => ({ ...i, origen: "lista" as const })),
        /* Los que solo están en la variable y todavía no han entrado. Son los
           que se perderían el día que se borre `ALLOWED_EMAILS`, y hasta ahora
           no había forma de saber que existían. */
        ...delEntorno
          .filter((e: string) => !enLaTabla.has(e) && !yaEntraron.has(e))
          .map((e: string) => ({ email: e, nota: null, origen: "entorno" as const })),
      ]
    : [];
  /* Los que están en las DOS. Quitarlos de la lista no les quita la entrada, y
     eso hay que decirlo en el momento, no descubrirlo mañana. */
  const tambienEnEntorno = delEntorno.filter((e: string) => enLaTabla.has(e));
  /* Encendidas y sin una sola línea escrita: el retrato del login de paso.
     No se apagan solas —una persona recién llegada empieza así— pero es lo
     que hay que ir a mirar. */
  const cuentasDePaso = sinConteo
    ? 0 : cuentas.filter(c => c.activo && !c.casos && !c.comentarios).length;

  const aliasMap = mapaAlias(personas as any);   // actor → alias (JohnO) en la actividad
  /* `tipo` viaja para poder decirlo en la fila. Con la lista ampliada, ver
     «RubyO» junto a los de planilla sin más contexto invita a pensar que
     alguien se equivocó de tabla; con la etiqueta apagada al lado, se lee que
     está ahí porque tiene cuenta y puede cobrar. */
  const tarifaLista = (personas || []).map((p: any) => ({
    id: p.id, nombre: p.alias || p.nombre,
    tipo: p.tipo === "personal" ? null : (p.tipo || null),
    tarifa_dia: p.tarifa_dia, tarifa_rodaje: p.tarifa_rodaje, tarifa_noche: p.tarifa_noche,
  }));
  /* ── QUÉ MES SE REVISA ──
     Antes se traía «desde el mes más viejo con algo pendiente», y eso dejaba
     un agujero: un mes SIN pendientes no se cargaba nunca, así que una
     jornada ya aprobada de julio era inalcanzable para el admin. El servidor
     sí la deja borrar —`borrarJornada` solo se planta si el mes está
     liquidado o confirmado— pero no había forma de llegar a ella desde la
     pantalla. Un permiso que existe y no tiene puerta es un permiso que no
     existe.
     Ahora el mes se navega, como en «Liquidar mes». Arranca en el más viejo
     con algo pendiente —que es a lo que uno viene— y desde ahí se mueve.
     Va en secuencia y no en el Promise.all porque el rango depende de lo que
     devuelva la primera consulta. */
  const fechasPend = (jornsPend || []).map((j: any) => String(j.fecha)).sort();
  const ymPend = fechasPend.length ? fechasPend[0].slice(0, 7) : null;
  /* Sin `jm` en la URL se abre el mes de lo pendiente; con `jm` manda la URL.
     El offset se cuenta desde HOY para que «‹ mes anterior» sea siempre lo
     mismo, se venga de donde se venga. */
  const jmOff = searchParams?.jm != null ? (parseInt(searchParams.jm, 10) || 0)
    : ymPend ? (Number(ymPend.slice(0, 4)) - hoy.getFullYear()) * 12 + (Number(ymPend.slice(5, 7)) - 1 - hoy.getMonth())
    : 0;
  const bj = new Date(hoy.getFullYear(), hoy.getMonth() + jmOff, 1);
  const jAnio = bj.getFullYear(), jMes = bj.getMonth();
  const jInicio = `${jAnio}-${pad(jMes + 1)}-01`;
  const jFin = `${jMes === 11 ? jAnio + 1 : jAnio}-${pad(jMes === 11 ? 1 : jMes + 2)}-01`;
  const { data: jornsCtx } = await supabase.from("jornadas")
    /* Las tarifas viajan CON la jornada y no en un mapa aparte sacado de
       `personas`: aquella consulta filtra por `tipo = 'personal'`, así que la
       jornada de un colaborador se habría quedado sin tarifa y su ↻ no habría
       aparecido — sin decir por qué. Aquí, toda fila que se pinta trae la
       suya. */
    /* ⚠ UNA SOLA CADENA, sin concatenar. supabase-js deduce el tipo del
       resultado LEYENDO este literal: partido en dos con un `+` deja de poder
       leerlo y todas las filas pasan a ser `GenericStringError`, con lo que
       `j.monto` deja de existir cincuenta líneas más abajo. Compila mal en un
       sitio que no tiene nada que ver con este. */
    .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,notas,per:personas(nombre,alias,foto_url,tarifa_dia,tarifa_rodaje,tarifa_noche),proy:proyectos(nombre)")
    .gte("fecha", jInicio).lt("fecha", jFin)
    .order("fecha", { ascending: false }).limit(3000);

  /* `filasJornadas` es lo que se PINTA: el mes elegido ENTERO, aprobadas
     incluidas, porque para ver los huecos hace falta el mes completo —con
     solo lo pendiente, un día ya aprobado se dibujaría como «no trabajado»,
     una mentira justo sobre lo que ya se revisó. */
  const filasJornadas = (jornsCtx || []).map((j: any) => ({
    id: j.id, persona_id: j.persona_id, proyecto_id: j.proyecto_id, aprobada: j.aprobada,
    fecha: j.fecha, persona: j.per?.alias || j.per?.nombre || "—",
    /* El largo va aparte: la cabecera del grupo lo usa para decir de quién es
       la tarjeta, y las filas siguen con el corto. */
    personaLargo: j.per?.nombre || null,
    /* La cara, para la cabecera de su tarjeta. Viene del mismo embebido: no
       cuesta una consulta, solo una columna más. */
    personaFoto: j.per?.foto_url || null,
    proyecto: j.proy?.nombre || null, tipo: j.tipo, fraccion: j.fraccion, noche: j.noche, monto: j.monto,
    /* La nota de quien registró la jornada. AQUÍ es donde de verdad hace
       falta: esta es la pantalla en la que se aprueba y se liquida, y «¿por
       qué hubo rodaje un domingo?» se pregunta un mes después, mirando esta
       tabla. Sin traerla, el campo solo se leía a sí mismo en /jornadas. */
    notas: j.notas || null,
  }));
  /* La tarifa vigente de cada persona con jornadas este mes. Es lo que deja al
     ↻ de la bitácora ENSEÑAR el importe recalculado en vez de prometerlo. */
  const tarifasPorPersona: Record<string, any> = {};
  (jornsCtx || []).forEach((j: any) => {
    const p = Array.isArray(j.per) ? j.per[0] : j.per;
    if (j.persona_id && p) tarifasPorPersona[j.persona_id] = {
      tarifa_dia: p.tarifa_dia ?? null,
      tarifa_rodaje: p.tarifa_rodaje ?? null,
      tarifa_noche: p.tarifa_noche ?? null,
    };
  });

  /* De `jornsPend` —TODO lo pendiente— y no de `filasJornadas`, que ahora es
     un mes solo. Si el contador leyera lo pintado, navegar a un mes sin
     pendientes pondría «0 jornadas esperando aprobación» en la portada con
     siete esperando en otro mes. El aviso mentiría, y hacia el lado que hace
     que no se revise. */
  const porAprobar = (jornsPend || []);

  /* ── EL EXPEDIENTE DE PAGO, DEDUCIDO ──
     Va en dos pasos y no en el Promise.all de arriba porque depende de él: sin
     los ids de las liquidaciones del mes no se sabe qué recibos pedir. Son dos
     idas más a la base y solo cuando hay algo liquidado.

     Ninguna de estas consultas guarda un estado: traen los HECHOS —qué recibos
     cuelgan de cada mes, cuáles tienen respaldo en el estado de cuenta— y la
     etapa la calcula lib/pagos.ts a partir de ellos. Por eso no puede quedarse
     vieja: no hay nada que actualizar. */
  /* Si esa consulta falla, `liqs` viene null y TODO mes liquidado se pinta como
     «— abierto» con su botón de liquidar: el panel invitaría a rehacer lo ya
     hecho. La causa casi siempre es la misma —falta correr
     db/pagos-expediente.sql, y PostgREST rechaza la consulta entera por una
     columna que no existe—, así que se dice, en vez de dejar que el silencio
     se lea como «no hay nada liquidado». */
  const avisoLiq = eLiqs
    ? (/cerrado_en|liquidado_en/.test(eLiqs.message)
        ? "Falta correr db/pagos-expediente.sql en Supabase: hasta entonces el estado de las liquidaciones no se puede leer."
        : `No se pudo leer el estado de las liquidaciones: ${eLiqs.message}`)
    : null;

  /* ── DÓNDE ESTÁ EL TRABAJO, MIRE EL MES QUE MIRE ──
     Lo que la pestaña de Jornadas hace bien y a las otras dos les faltaba: con
     el mes navegable, entrar a uno tranquilo y no ver nada se lee como «no hay
     nada pendiente» — y puede haber cinco expedientes parados en marzo. El
     contador va en el navegador, al lado de las flechas, y cuenta TODO, no el
     mes en pantalla.
     Se piden solo las fechas y sin tope alto: son unas decenas de filas al año
     y lo único que hay que hacer con ellas es contarlas. */
  const { data: expAbiertos } = await supabase.from("liquidaciones")
    .select("liquidado_en").eq("estado", "liquidado").is("cerrado_en", null).limit(600);
  const nExpAbiertos = (expAbiertos || []).length;
  const nExpParados = (expAbiertos || []).filter((l: any) =>
    l.liquidado_en && diasParado({ liquidado_en: l.liquidado_en, estado: "liquidado" }) !== null
      && (diasParado({ liquidado_en: l.liquidado_en, estado: "liquidado" }) as number) >= DIAS_ATASCO).length;

  const liqIds = (liqs || []).map((l: any) => l.id).filter(Boolean);
  let rhesDelMes: any[] = [];
  let conMovimiento = new Set<string>();
  if (liqIds.length) {
    const { data: rl } = await supabase.from("rhe")
      .select("id,liquidacion_id,numero,url,monto,pagado_en,pagado_nota,pagado_url,pagado_medio")
      .in("liquidacion_id", liqIds);
    rhesDelMes = rl || [];
    if (rhesDelMes.length) {
      const { data: mv } = await supabase.from("movimiento_banco")
        .select("rhe_id").in("rhe_id", rhesDelMes.map(r => r.id));
      conMovimiento = new Set((mv || []).map((m: any) => m.rhe_id).filter(Boolean));
    }
  }
  const rhesDeLiq = new Map<string, any[]>();
  rhesDelMes.forEach(r => {
    const l = rhesDeLiq.get(r.liquidacion_id) || [];
    l.push(r); rhesDeLiq.set(r.liquidacion_id, l);
  });

  const liqDe = new Map((liqs || []).map((l: any) => [l.persona_id, l]));
  const estadoDe = new Map((liqs || []).map((l: any) => [l.persona_id, l.estado]));
  const agg = new Map<string, { nombre: string; dias: number; pend: number; monto: number }>();
  (jornsMes || []).forEach((j: any) => {
    const a = agg.get(j.persona_id) || { nombre: j.per?.alias || j.per?.nombre || "—", dias: 0, pend: 0, monto: 0 };
    a.dias += Number(j.fraccion || 0);
    if (!j.aprobada) a.pend++;
    a.monto += j.aprobada ? Number(j.monto || 0) : 0;
    agg.set(j.persona_id, a);
  });
  /* El detalle de cada persona, para desplegarlo en la fila. Se arma del mismo
     `jornsMes` que ya calcula los totales: si viniera de otra consulta, un día
     el total y el detalle dirían cosas distintas y no habría forma de saber
     cuál miente. */
  const detalleLiq = new Map<string, any[]>();
  (jornsMes || []).forEach((j: any) => {
    const l = detalleLiq.get(j.persona_id) || [];
    l.push({
      id: j.id, fecha: j.fecha, tipo: j.tipo, noche: j.noche,
      fraccion: Number(j.fraccion || 0), monto: Number(j.monto || 0),
      aprobada: !!j.aprobada, proyecto: (j.proy as any)?.nombre || null,
    });
    detalleLiq.set(j.persona_id, l);
  });
  const filasLiq = [...agg.entries()]
    .map(([personaId, a]) => {
      const liq = liqDe.get(personaId) || null;
      const rs = (liq ? rhesDeLiq.get(liq.id) : null) || [];
      const etapa = etapaLiquidacion(liq, rs, conMovimiento);
      return {
        personaId, nombre: a.nombre, dias: a.dias, pend: a.pend, monto: a.monto,
        estado: estadoDe.get(personaId) || null,
        items: detalleLiq.get(personaId) || [],
        liquidacionId: (liq?.id as string) || null,
        etapa,
        /* Los días se cuentan desde que se liquidó, no desde el fin del mes:
           lo que se mide es cuánto lleva parado el expediente en nuestras
           manos, no cuánto hace del trabajo. */
        dias_parado: diasParado(liq),
        atascada: atascada(liq, etapa),
        recibos: rs.map((r: any) => ({
          id: r.id, numero: r.numero, url: r.url, monto: Number(r.monto || 0),
          pago: pagoDe(r, conMovimiento), nota: r.pagado_nota as string | null,
          pagadoUrl: (r.pagado_url as string) || null,
          medio: (r.pagado_medio as string) || null,
        })),
      };
    })
    .sort((x, y) => x.nombre.localeCompare(y.nombre));

  /* Cuántos rozan o pasaron el tope de 4ta: eso es lo que pide atención.
     SIEMPRE del año en curso, aunque el panel esté mirando 2024. El tope es
     anual y el que puede romperse hoy es el de este año; un contador que
     cambiara al navegar hacia atrás diría «0 personas cerca del tope» con dos
     a punto de pasarlo — la alarma se apagaría por mirar otra cosa.
     Cuando ya estamos en el año actual se reusa lo cargado; solo se pide otra
     vez cuando el panel se fue a otro año. */
  const anioHoy = anioActual;
  let rhesDelAnioHoy: any[] = rhes || [];
  if (rAnio !== anioHoy) {
    const { data } = await supabase.from("rhe").select("persona_id,monto")
      .gte("fecha", `${anioHoy}-01-01`).lt("fecha", `${anioHoy + 1}-01-01`).limit(2000);
    rhesDelAnioHoy = data || [];
  }
  const acum4ta = new Map<string, number>();
  rhesDelAnioHoy.forEach((r: any) => acum4ta.set(r.persona_id, (acum4ta.get(r.persona_id) || 0) + Number(r.monto || 0)));
  const nCerca = [...acum4ta.values()].filter(v => {
    const e = estado4ta(v, anioHoy);
    return e.cerca || e.supero;
  }).length;

  // Menú: cada sección con su contador, para ver qué pide atención sin entrar
  const ahoraMs = Date.now();
  const nDestacados = (vivos || []).filter((p: any) =>
    p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahoraMs).length;
  /* Cuántas credenciales entran por cada puerta, y cuáles no tienen link:
     una plataforma sin URL obliga a buscarla en Google, que es justo donde
     aparecen las páginas falsas. Por eso el contador del menú cuenta las
     que faltan, no las que hay. */
  const usosPlat = new Map<string, number>();
  (credsPlat || []).forEach((c: any) => {
    const k = String(c.plataforma || "").trim().toLowerCase();
    if (k) usosPlat.set(k, (usosPlat.get(k) || 0) + 1);
  });
  const plataformas = (plats || []).map((p: any) => ({
    ...p, usos: usosPlat.get(String(p.nombre || "").trim().toLowerCase()) || 0,
    // El `orden` se respeta acá y no en la consulta: ordenar una tabla
    // embebida en PostgREST es frágil, y son tres filas.
    puertas: [...(p.puertas || [])].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));
  const platSinLink = plataformas.filter((p: any) => !p.url).length;

  /* ── Portada ──
     Las tarjetas cuentan TRABAJO, no tráfico. La referencia contaba
     incidencias, tendencias y cumplimiento SLA porque monitorea un flujo de
     cientos; aquí somos seis y lo que importa no es cuánto pasó sino qué
     espera a alguien. Cada número es algo que se hace, y por eso cada tarjeta
     lleva a donde se hace. */
  const sinLiquidar = filasLiq.filter(f => f.estado !== "liquidado").length;
  const debiendo = (ganadoras || []).filter(rendicionVencida);
  const montoDebiendo = debiendo.reduce((s, p: any) => s + (parseFloat(p.monto_adjudicado) || 0), 0);
  const ejecutandoN = (ganadoras || []).filter(ejecutando).length;
  const montoPorAprobar = porAprobar.reduce((s, j) => s + (Number(j.monto) || 0), 0);

  const KPIS: {
    k: string; ico: string; col: string; n: number | string; label: string;
    pie?: string; href: string; urge?: boolean;
  }[] = [
    { k: "jornadas", ico: "✅", col: "var(--yellow)", n: porAprobar.length,
      label: "Jornadas por aprobar",
      pie: montoPorAprobar > 0 ? `S/ ${montoPorAprobar.toLocaleString("es-PE")} en juego` : "nada pendiente",
      href: "/admin?s=jornadas", urge: porAprobar.length > 0 },
    { k: "liquidar", ico: "🧾", col: "var(--teal)", n: sinLiquidar,
      label: `Por liquidar · ${MESES[lMes]}`,
      pie: filasLiq.length ? `de ${filasLiq.length} con jornadas` : "sin jornadas este mes",
      href: `/admin?s=liquidar&lm=${lmOff}`, urge: sinLiquidar > 0 },
    { k: "rhe", ico: "📊", col: nCerca > 0 ? "var(--red)" : "var(--green)", n: nCerca,
      label: "Cerca o sobre el tope de 4ta",
      pie: `tope ${anioHoy}`, href: "/admin?s=rhe", urge: nCerca > 0 },
    /* Lo más caro que el sistema tenía callado: una rendición vencida impide
       postular a esa empresa. Hasta hoy se daba por cerrada sola. */
    { k: "debiendo", ico: "🔴", col: "var(--red)", n: debiendo.length,
      label: "Rendiciones vencidas",
      pie: debiendo.length ? `S/ ${montoDebiendo.toLocaleString("es-PE")} sin rendir` : "ninguna",
      href: "/postulaciones?f=debiendo", urge: debiendo.length > 0 },
    { k: "ejecutando", ico: "🎬", col: "var(--violet)", n: ejecutandoN,
      label: "Fondos en ejecución",
      pie: "ganados y sin entregar", href: "/postulaciones?f=ejecutando" },
    { k: "plataformas", ico: "🔗", col: platSinLink > 0 ? "var(--yellow)" : "var(--dim)", n: platSinLink,
      label: "Plataformas sin link",
      pie: platSinLink ? "se busca en Google, ahí viven las falsas" : "todas con puerta",
      href: "/admin?s=plataformas", urge: platSinLink > 0 },
  ];

  // Jornadas del mes: la dona de aprobadas vs pendientes
  const jAprob = (jornsMes || []).filter((j: any) => j.aprobada).length;
  const jPend = (jornsMes || []).length - jAprob;

  /* En qué se fue el mes. Barras y no tabla porque la pregunta es
     comparativa: cuál se llevó más días, no cuántos exactamente. */
  const porProy = new Map<string, number>();
  (jornsMes || []).forEach((j: any) => {
    const n = (j.proy as any)?.nombre || "Sin proyecto";
    porProy.set(n, (porProy.get(n) || 0) + Number(j.fraccion || 0));
  });
  const barras = [...porProy.entries()]
    .map(([nombre, dias]) => ({ nombre, dias }))
    .sort((a, b) => b.dias - a.dias).slice(0, 6);
  const maxBarra = Math.max(1, ...barras.map(b => b.dias));

  /* Las alertas salen de reglas que ya existen en otras pantallas: si aquí
     escribiera otras, un día el admin diría que todo está bien mientras el
     vigía grita. */
  const ALERTAS: { txt: string; col: string; href: string }[] = [
    debiendo.length > 0 && { txt: `${debiendo.length} rendición(es) vencida(s) — esas empresas no pueden postular`, col: "var(--red)", href: "/postulaciones?f=debiendo" },
    nCerca > 0 && { txt: `${nCerca} persona(s) cerca o sobre el tope de 4ta ${anioHoy}`, col: "var(--red)", href: "/admin?s=rhe" },
    porAprobar.length > 0 && { txt: `${porAprobar.length} jornada(s) esperando aprobación`, col: "var(--yellow)", href: "/admin?s=jornadas" },
    sinLiquidar > 0 && { txt: `${sinLiquidar} persona(s) sin liquidar en ${MESES[lMes]}`, col: "var(--yellow)", href: `/admin?s=liquidar&lm=${lmOff}` },
    platSinLink > 0 && { txt: `${platSinLink} plataforma(s) sin link cargado`, col: "var(--yellow)", href: "/admin?s=plataformas" },
  ].filter(Boolean) as any[];

  /* (Aquí vivían SECCIONES, GRUPOS y META: el menú lateral con sus tres
     grupos —Hoy / Dinero / Configuración—. Se fue con la barra. Lo que
     agrupaba se conserva en el ORDEN de las pestañas, que va de lo de cada
     semana a lo que se toca una vez al año. Un rótulo de grupo no cabe en
     una fila de pestañas, y fingirlo con separadores habría sido copiar la
     forma sin la función.) */

  /* ── A QUÉ HORA Y QUÉ DÍAS TRABAJA CADA UNO, EN EL MES QUE SE REVISA ──
     La lupa de un día contesta «¿qué hizo el martes?»; esto contesta la de
     antes: «¿a qué hora trabaja esta persona, y fue un mes parejo?». Un mes de
     jornadas de oficina todas iguales no lo dice, y el sistema sí lo sabe.

     Lo cuenta la BASE, no esta página. Antes se traían las filas del mes y se
     contaban aquí, con `.limit(20000)` y sin orden — y un LIMIT sin orden no
     devuelve «las primeras», devuelve las que el plan encuentre. El plan
     cambia cuando cambia un filtro, y así fue como la semana del 10 de julio,
     que era el pico del mes, desapareció entera de la franja: seiscientas
     cuarenta y tres cosas que la ventana del día sí lista. No falló nada.
     `franjas_actividad` agrupa por persona, día y hora de una pasada y
     devuelve conteos: unos cientos de filas en vez de decenas de miles, sin
     límite que sortear y exacto por definición. La zona horaria vive DENTRO
     de la función, así que la hora y el día no pueden discrepar entre sí.

     Las tres fuentes que suma —`actividad` sin los de tipo comentario,
     `comentarios` y `publicaciones`— son las mismas que lista la ventana del
     día: la barra tiene que medir lo que uno va a encontrar al abrirla, o el
     pico de un martes no se puede comprobar.
     Fuera quedan los préstamos y los recibos. No por peso: `creado_en` se
     añadió a `equipo_prestamos` hace nada y los préstamos viejos lo tienen en
     nulo, así que contarlos borraría de la silueta justo los meses anteriores
     —callando, que es lo peor—. Los recibos son del mes, no del día.
     Es una silueta, no un parte contable: por eso no lleva números. */
  const horasPorPersona: Record<string, number[]> = {};
  const diasPorPersona: Record<string, number[]> = {};
  const diasDelMesJ = new Date(jAnio, jMes + 1, 0).getDate();
  let faltaFranjas = false;
  {
    const { data: fr, error: eFr } = await supabase.rpc("franjas_actividad", {
      p_desde: `${jInicio}T00:00:00-05:00`,
      p_hasta: `${jFin}T00:00:00-05:00`,
    });
    /* Sin la función no se dibuja NADA. La versión de antes seguiría pintando
       —mal— y una silueta equivocada es peor que ninguna: se lee igual de
       bien y se cree igual. Mejor el aviso de que falta correr el SQL. */
    if (eFr) faltaFranjas = true;
    /* De cuenta (perfiles.id) a persona: la jornada es de una PERSONA y la
       actividad la firma un USUARIO. Quien no tiene cuenta no aporta barras —y
       no pasa nada: su fila simplemente no lleva franja. */
    const personaDeUsuario = new Map<string, string>();
    (personas || []).forEach((p: any) => { if (p.usuario_id) personaDeUsuario.set(p.usuario_id, p.id); });
    (fr || []).forEach((f: any) => {
      const pid = personaDeUsuario.get(f.usuario_id);
      if (!pid) return;
      const h = Number(f.hora), d = Number(f.dia), n = Number(f.n) || 0;
      if (h >= 0 && h < 24) (horasPorPersona[pid] ||= Array(24).fill(0))[h] += n;
      if (d >= 1 && d <= diasDelMesJ) (diasPorPersona[pid] ||= Array(diasDelMesJ).fill(0))[d - 1] += n;
    });
  }

  /* ── QUIÉN NO REGISTRÓ NADA ESTE MES ──
     La lista de abajo se arma de las jornadas que hay, así que quien no anotó
     ninguna no sale: no aparece vacío, desaparece. Y desde fuera «no trabajó»
     y «no lo anotó» son la misma ausencia — solo que a uno de los dos hay que
     ir a preguntarle antes de cerrar el mes.
     El sistema sabe distinguirlos: si esa persona dejó rastro —comentó, movió
     equipos, abrió casos— es que trabajó. Por eso la condición no es «está en
     la planilla» sino «tiene franja»: a quien no tocó el sistema no hay nada
     que reclamarle, y una lista con todo el personal cada mes se deja de leer
     a la tercera vez. */
  const conJornada = new Set((filasJornadas || []).map((f: any) => f.persona_id));
  const ausentesJ = (personas || [])
    .filter((p: any) => p.estado !== "inactivo" && p.estado !== "vetado")
    .filter((p: any) => !conJornada.has(p.id))
    .filter((p: any) => (horasPorPersona[p.id] || diasPorPersona[p.id]))
    /* Nombre completo y cara, como en las tarjetas de quienes SÍ registraron:
       una lista donde unos salen con foto y otros no se lee como si los
       segundos estuvieran a medias. */
    .map((p: any) => ({ id: p.id, nombre: p.nombre || p.alias, foto: p.foto_url || null }));

  /* ── LOS PANELES, UNO POR SECCIÓN ──
     Antes cada bloque se pintaba con `{s === "x" && (…)}` dentro del return.
     Ahora son variables y las reparte `TabsPanel`, el mismo de la ficha de un
     fondo y de cada entidad: la administración era la única pantalla del
     sistema con un menú lateral propio, y aprender dos formas de moverse por
     lo mismo es aprender de más. */
      const panelPortada = (
        <>
          {/* ── Tarjetas: lo que espera acción ──
              Cada número es algo que alguien tiene que hacer, y por eso cada
              tarjeta es un enlace a donde se hace. Un número que no lleva a
              ninguna parte es un adorno. */}
          <div className="adm-kpis">
            {KPIS.map(k => (
              <Link key={k.k} href={k.href} className={`adm-kpi${k.urge ? " urge" : ""}`}>
                <span className="adm-kpi-ico" style={{ color: k.col, background: `color-mix(in srgb, ${k.col} 14%, transparent)` }}>
                  {k.ico}
                </span>
                <span className="adm-kpi-n" style={{ color: k.n === 0 ? "var(--dim)" : k.col }}>{k.n}</span>
                <span className="adm-kpi-lbl">{k.label}</span>
                {k.pie && <span className="adm-kpi-pie">{k.pie}</span>}
              </Link>
            ))}
          </div>

          <div className="adm-portada">
            <div>
              {/* ── Jornadas del mes ── */}
              <div className="card">
                <div className="panel-h">📅 Jornadas de {MESES[lMes]} · {(jornsMes || []).length}</div>
                {(jornsMes || []).length === 0 ? (
                  <div className="empty">Sin jornadas registradas este mes.</div>
                ) : (
                  <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                    <Dona aprobadas={jAprob} pendientes={jPend} />
                    <div style={{ fontSize: 12.5 }}>
                      <Leyenda col="var(--green)" n={jAprob} txt="aprobadas" total={(jornsMes || []).length} />
                      <Leyenda col="var(--yellow)" n={jPend} txt="por aprobar" total={(jornsMes || []).length} />
                      {jPend > 0 && (
                        <Link href="/admin?s=jornadas" style={{ color: "var(--accent)", fontSize: 11.5, display: "block", marginTop: 8 }}>
                          → aprobarlas
                        </Link>
                      )}
                    </div>
                    {/* En qué se fue el mes. Barras porque la pregunta es
                        comparativa: cuál se llevó más, no cuántos exactos. */}
                    {barras.length > 0 && (
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)", fontWeight: 700, marginBottom: 8 }}>
                          Días por proyecto
                        </div>
                        {barras.map(b => (
                          <div key={b.nombre} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, fontSize: 11.5 }}>
                            <span style={{ width: 110, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {b.nombre}
                            </span>
                            <span style={{ flex: 1, height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden" }}>
                              <span style={{ display: "block", height: "100%", borderRadius: 4,
                                width: `${(b.dias / maxBarra) * 100}%`, background: "var(--accent)" }} />
                            </span>
                            <b style={{ width: 34, textAlign: "right", color: "var(--text)" }}>{b.dias}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              {/* ── Alertas ── */}
              <div className="card">
                <div className="panel-h">🔔 Alertas</div>
                {ALERTAS.length === 0 ? (
                  <div className="empty" style={{ padding: "10px 0" }}>Nada pendiente. Buena señal.</div>
                ) : ALERTAS.map((a, i) => (
                  <Link key={i} href={a.href} className="adm-alerta">
                    <span style={{ color: a.col }}>●</span>
                    <span style={{ flex: 1 }}>{a.txt}</span>
                    <span style={{ color: "var(--dim)" }}>›</span>
                  </Link>
                ))}
              </div>

              {/* ── Actividad reciente ── */}
              <div className="card">
                <div className="panel-h">🕐 Últimos movimientos</div>
                {(activid || []).length === 0 ? (
                  <div className="empty" style={{ padding: "10px 0" }}>Sin actividad.</div>
                ) : (activid || []).map((a: any, i: number) => {
                  const cuerpo = (
                    <>
                      <span>{ICO_ENT[tipoCanonico(a.entidad_tipo)] || "•"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ color: a.actor ? "var(--text)" : "var(--teal)" }}>
                          {aliasMap[a.actor_id] || a.actor?.nombre || BOT}
                        </b>
                        <i style={{ color: "var(--dim)", fontStyle: "normal" }}>
                          {" "}{a.detalle?.campo ? `cambió ${a.detalle.campo.replace(/_/g, " ")}` : a.tipo}
                        </i>
                      </span>
                      <span style={{ color: "var(--dim)", fontSize: 10.5, whiteSpace: "nowrap" }}>
                        {haceOEn(a.creado_en)}
                      </span>
                    </>
                  );
                  /* rutaEntidad decide: casos → /caso, entidades con ficha →
                     /entidad, y lo que no tiene página (o los nombres en plural
                     que escribe el trigger) → sin enlace, para no caer en 404. */
                  const ruta = rutaEntidad(a.entidad_tipo, a.entidad_id);
                  return ruta
                    ? <Link key={i} href={ruta} className="adm-act">{cuerpo}</Link>
                    : <div key={i} className="adm-act">{cuerpo}</div>;
                })}
              </div>

              {/* ── Acciones rápidas ── */}
              <div className="card">
                <div className="panel-h">⚡ Acciones rápidas</div>
                <div className="adm-acc">
                  <Link href="/jornadas" className="btn btn-ghost">📅 Registrar jornada</Link>
                  <Link href="/entidad/empresa/nuevo" className="btn btn-ghost">🏢 Nueva empresa</Link>
                  <Link href="/entidad/persona/nuevo" className="btn btn-ghost">👤 Nueva persona</Link>
                  {/* `/historial` es el global; `/historial/[tipo]` espera un
                      tipo real de entidad — «todo» le habría dado una página
                      vacía sin decir por qué. */}
                  <Link href="/historial" className="btn btn-ghost">🕐 Historial completo</Link>
                </div>
              </div>
            </div>
          </div>
        </>
      );

      const panelDestacados = (() => {
        const ahora = Date.now();
        /* `dias()` vivía aquí con `T23:59:59` y umbrales propios —rojo a los
           3 días, amarillo a los 15— mientras el feed pone el rojo a los 2 y
           el amarillo a los 7. Sale de lib/plazo. */
        const fijado = (p: any) => !!p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahora;

        const PRUEBA_D: Record<string, (p: any) => boolean> = {
          fijados: fijado,
          sin_fecha: p => !p.fecha_limite,
          vencidos: p => !!p.fecha_limite && diasHasta(p.fecha_limite) < 0,
          avisos: p => p.tipo === "aviso",
        };
        const coincide = buscadorDe(qd);   // el mismo motor que el resto
        const filtrados = (vivos || []).filter((p: any) =>
          (!fd || PRUEBA_D[fd]?.(p)) && (!qd || coincide(pal(p.titulo, p.tipo))));
        const cntD = (k: string) => (vivos || []).filter(PRUEBA_D[k]).length;

        // Los ya destacados primero; luego lo que vence antes
        const lista = [...filtrados].sort((a: any, b: any) => {
          if (fijado(a) !== fijado(b)) return fijado(a) ? -1 : 1;
          if (!!a.fecha_limite !== !!b.fecha_limite) return a.fecha_limite ? -1 : 1;
          return (a.fecha_limite || "") < (b.fecha_limite || "") ? -1 : 1;
        });
        return (
          <>
            <div className="h4" style={{ marginTop: 0 }}>📌 Destacados del feed</div>
            <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
              Lo que clavas aquí sube a la cabecera del feed. <b>Nada sube solo</b>: si todo
              destaca, nada destaca — un caso con fecha ya se ve en el feed, en el tablero y en
              el mensaje de la mañana. Esto es para lo que no te puedes permitir que se pierda.
              El destacado <b>caduca solo</b>: con la fecha límite del caso, o a las 2 semanas.
            </p>
            {/* Si algún día hay más de 300 vivos, decirlo — el recorte se
                llevaría los más antiguos, que son los que hay que rescatar */}
            {(vivos || []).length >= 300 && (
              <div className="card" style={{ borderColor: "rgba(244,180,0,.4)", color: "var(--yellow)", fontSize: 12.5 }}>
                ⚠ Hay 300 casos vivos o más y esta lista solo carga los 300 más recientes.
                Los más antiguos no aparecen — avísame para paginar esto.
              </div>
            )}

            {/* El único listado del sistema que no tenía buscador */}
            <form className="card" style={{ display: "flex", gap: 10, padding: 10 }}>
              <input type="hidden" name="s" value="destacados" />
              {fd && <input type="hidden" name="fd" value={fd} />}
              <span className="buscador-lista">
                <span className="bg-lupa">🔍</span>
                <input name="qd" defaultValue={qd} placeholder="Buscar el caso por título…" />
              </span>
              <button className="btn" type="submit">Buscar</button>
            </form>

            <PanelFiltros limpiar="/admin?s=destacados" mostrarLimpiar={!!fd || !!qd}>
              <FilaFiltro titulo="Ver">
                <Chip href="/admin?s=destacados&fd=fijados" on={fd === "fijados"} color="var(--yellow)"
                  title="Los que están arriba del feed ahora mismo">
                  📌 destacados ahora · {cntD("fijados")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=sin_fecha" on={fd === "sin_fecha"} color="var(--violet)"
                  title="Sin fecha límite: nunca van a asomar por sí solos">
                  📅 sin fecha · {cntD("sin_fecha")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=vencidos" on={fd === "vencidos"} color="var(--red)">
                  ⚠ vencidos · {cntD("vencidos")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=avisos" on={fd === "avisos"} color="var(--violet)">
                  📢 avisos · {cntD("avisos")}
                </Chip>
              </FilaFiltro>
            </PanelFiltros>

            <div className="card">
              {lista.map((p: any) => {
                // Sin `estado`: aquí un caso resuelto CON fecha debe seguir
                // mostrando su fecha, no caer en la rama de «sin fecha».
                const pl = plazoDe(p.fecha_limite);
                return (
                  <div className="info-row" key={p.id} style={{ gap: 10, flexWrap: "wrap" }}>
                    {/* Con su ícono: esta lista es de administración y el
                        tipo se leía en texto crudo, «aviso», sin el 📢. */}
                    <span className="badge" style={{
                      color: colorTipo(p.tipo),
                      background: `${colorTipo(p.tipo)}22`,
                    }}>{rotuloTipo(p.tipo)}</span>
                    <Link href={`/caso/${p.id}`} style={{ fontWeight: 600, fontSize: 12.5 }}>{p.titulo}</Link>
                    {fijado(p) && (
                      <span className="badge" title="Está en la cabecera del feed"
                        style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>📌 arriba</span>
                    )}
                    <span style={{ flex: 1 }} />
                    {pl ? (
                      <span style={{ color: pl.color, fontSize: 11.5, fontWeight: 700 }}>
                        {pl.vencido ? `vencido hace ${-pl.d} d` : pl.d === 0 ? "vence hoy" : `en ${pl.d} d`}
                      </span>
                    ) : (
                      // Sin fecha, el caso no aparece en ningún radar por su cuenta:
                      // es justo el que más se pierde, y para el que existe esto.
                      <span style={{ color: "var(--dim)", fontSize: 11.5 }}>sin fecha</span>
                    )}
                    <BotonDestacar pubId={p.id} hasta={p.destacado_hasta} />
                  </div>
                );
              })}
              {!lista.length && <div className="empty">Sin casos con este filtro.</div>}
            </div>
          </>
        );
      })();

      const panelPlataformas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🔗 Plataformas</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Dónde se entra. El link vive <b>aquí una vez</b>, no repetido en cada credencial:
            al guardarlo, las credenciales de esa plataforma que no tengan uno propio lo heredan.
            Sin link, el equipo busca la plataforma en Google y entra por el primer resultado —
            que es exactamente donde viven las páginas falsas.
          </p>
          <p style={{ color: "var(--dim)", fontSize: 12, marginTop: -4 }}>
            Si una cuenta abre en varios sitios, cuélgale <b>otra entrada</b> con el nombre de para
            qué sirve: nadie entra «a SUNAT», entra a declarar el IGV. Y comprueba cada link con
            su ↗ — un link que nadie abrió es un link que no sabemos si sirve.
          </p>
          <PlataformasAdmin plataformas={plataformas} />
        </>
      );

      const panelJornadas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>
            ✅ Jornadas · <span style={{ textTransform: "capitalize" }}>{MESES[jMes]} {jAnio}</span>
          </div>
          {/* NAVEGADOR DE MES. Sin él solo se veían los meses que TENÍAN algo
              pendiente, así que una jornada ya aprobada de un mes cerrado no
              se podía corregir desde ninguna parte —aunque el servidor sí lo
              permite—. Igual que en «Liquidar mes», para que las dos pantallas
              de administración se manejen igual. */}
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=jornadas&jm=${jmOff - 1}`} className="vtab">‹ mes anterior</Link>
            {jmOff !== 0 && <Link href="/admin?s=jornadas&jm=0" className="vtab">actual</Link>}
            {jmOff < 0 && <Link href={`/admin?s=jornadas&jm=${jmOff + 1}`} className="vtab">siguiente ›</Link>}
            {/* Adónde está lo que espera. Con el mes navegable, entrar a uno
                tranquilo y no ver nada no debe leerse como «no hay nada». */}
            {porAprobar.length > 0 && (
              <span style={{ marginLeft: "auto", color: "var(--yellow)", fontSize: 12 }}>
                ⏳ {porAprobar.length} por aprobar en total
              </span>
            )}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Al aprobar, la jornada entra al monto «a pagar». Puedes editar o borrar cualquiera —también
            una ya aprobada— mientras el mes de esa persona no esté confirmado ni liquidado.
          </p>
          {faltaFranjas && (
            <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
              <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ Sin franjas de actividad</b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                Falta correr <code>db/franjas-actividad.sql</code> en Supabase. Las jornadas de abajo
                están completas; lo que falta son las dos siluetas bajo cada nombre — y se prefiere no
                dibujarlas a dibujarlas mal, que es lo que hacía la versión anterior.
              </div>
            </div>
          )}
          {/* Sin plegable: la pestaña ya es la sección, el mes ya está en el
              título de arriba y el «por aprobar» al lado del navegador. Un
              rótulo que repite sus dos vecinos y que al cerrarse deja la
              pantalla vacía no es un control, es un estorbo. */}
          <BitacoraJornadas items={filasJornadas} esAdmin miPersonaId="" proyectos={proyectos || []}
            porMes diasVacios plegable={false}
            horasPorPersona={horasPorPersona} diasPorPersona={diasPorPersona}
            mesFranja={jInicio} ausentes={ausentesJ} tarifas={tarifasPorPersona} />
        </>
      );

      const panelLiquidar = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 Liquidar mes · <span style={{ textTransform: "capitalize" }}>{MESES[lMes]} {lAnio}</span></div>
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=liquidar&lm=${lmOff - 1}`} className="vtab">‹ mes anterior</Link>
            {lmOff !== 0 && <Link href="/admin?s=liquidar" className="vtab">actual</Link>}
            {lmOff < 0 && <Link href={`/admin?s=liquidar&lm=${lmOff + 1}`} className="vtab">siguiente ›</Link>}
            {/* Lo mismo que hace Jornadas con «⏳ N por aprobar en total»: con
                el mes navegable, un mes tranquilo no puede parecer que no queda
                trabajo. Aquí lo pendiente son los expedientes liquidados y sin
                cerrar, estén en el mes que estén. */}
            {nExpAbiertos > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 12,
                color: nExpParados > 0 ? "var(--yellow)" : "var(--dim)" }}>
                {nExpParados > 0
                  ? `⏳ ${nExpParados} expediente(s) parados · ${nExpAbiertos} sin cerrar en total`
                  : `${nExpAbiertos} expediente(s) sin cerrar en total`}
              </span>
            )}
          </div>
          {avisoLiq && (
            <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>{avisoLiq}</div>
          )}
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Liquidar genera el recibo interno (congela lo aprobado) y bloquea el mes de esa persona. Solo se puede si no quedan jornadas por aprobar.
            Después, el expediente avanza solo: se da por pagado cuando el recibo tiene su comprobante y consta la salida del dinero.
          </p>
          <LiquidacionAdmin anio={lAnio} mes={lMes + 1} filas={filasLiq} />
        </>
      );

      const panelRhe = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 RHE y tope de 4ta · {rAnio}</div>
          {/* Navegador de año. Sin él, un recibo con fecha de un año pasado se
              guardaba y desaparecía: el formulario acepta cualquier fecha pero
              la lista solo enseñaba el año en curso, y una fila que se esfuma
              se lee como «no se guardó». */}
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=rhe&ra=${raOff - 1}`} className="vtab">‹ {rAnio - 1}</Link>
            {raOff !== 0 && <Link href="/admin?s=rhe" className="vtab">actual</Link>}
            {raOff < 0 && <Link href={`/admin?s=rhe&ra=${raOff + 1}`} className="vtab">{rAnio + 1} ›</Link>}
            {/* Y aquí lo urgente es el tope de 4ta, que es del año EN CURSO
                aunque estés mirando 2024. Al lado de las flechas por el mismo
                motivo que en las otras dos: es lo que no puede perderse de
                vista al navegar. */}
            {nCerca > 0 && (
              <span style={{ marginLeft: "auto", color: "var(--red)", fontSize: 12 }}>
                ⚠ {nCerca} persona(s) cerca o sobre el tope de 4ta {anioHoy}
              </span>
            )}
          </div>
          {raOff !== 0 && (
            /* El tope es del año en curso y esta lista no lo es. Decirlo evita
               leer «va por S/ 12,000» como si fuera lo que cuenta hoy. */
            <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10, fontSize: 12 }}>
              Estás viendo {rAnio}. El tope de 4ta que corre es el de {anioHoy}.
            </div>
          )}
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Los recibos que giramos por cuenta de quienes nos delegan su clave SOL.
            Importan por dos razones: la rendición del fondo, y sobre todo el <b>tope de 4ta</b> —
            si alguien lo supera, su suspensión se rompe y corresponde retenerle el 8%
            por el resto del año. Nadie más se va a dar cuenta.
          </p>
          <RheAdmin anio={rAnio}
            personas={(cobrables || []).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre, suspension_4ta_anio: p.suspension_4ta_anio }))}
            proyectos={proyectos || []} rhes={(rhes || []) as any}
            liquidaciones={(liqsAnio || []) as any}
            pre={searchParams?.rhe_de ? {
              personaId: searchParams.rhe_de,
              liquidacionId: searchParams.rhe_liq || "",
              monto: searchParams.rhe_monto || "",
            } : null} />
        </>
      );

      const panelTarifas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>💰 Tarifas del personal</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Tarifas por día (S/ normal, rodaje y noche), usadas para calcular el pago de jornadas.
          </p>
          <TarifasEditor personas={tarifaLista} abierto />
        </>
      );
  const panelCuentas = (
    <>
      <h3 style={{ margin: "4px 0 2px", fontSize: 14 }}>👤 Cuentas</h3>
      <CuentasPanel cuentas={cuentas} yo={user.id} sinConteo={sinConteo}
        correoViejo={correoViejo} personas={fichasParaElegir}
        invitaciones={invitacionesPend} sinInvitaciones={sinInvitaciones}
        puedoCruzar={puedoCruzar} tambienEnEntorno={tambienEnEntorno} />
    </>
  );
  /* El orden es el de la frecuencia: la portada, lo de cada semana, el dinero
     del mes y al final lo que se toca una vez al año. `masUltima` manda
     Plataformas al menú «⋯», que es donde vive lo que casi nunca se abre. */
  const TODAS: [string, string, React.ReactNode][] = [
    ["portada", "🏠 Portada", panelPortada],
    ["jornadas", `✅ Jornadas${porAprobar.length ? ` · ${porAprobar.length}` : ""}`, panelJornadas],
    ["liquidar", `🧾 Liquidar${sinLiquidar ? ` · ${sinLiquidar}` : ""}`, panelLiquidar],
    ["rhe", `🧾 RHE y 4ta${nCerca ? ` · ${nCerca}` : ""}`, panelRhe],
    ["tarifas", "💰 Tarifas", panelTarifas],
    ["plataformas", `🔗 Plataformas${platSinLink ? ` · ${platSinLink}` : ""}`, panelPlataformas],
    /* Destacados baja al final. El orden de estas pestañas es el de la
       FRECUENCIA —lo de cada semana primero, lo del mes después, lo del año al
       final— y destacar un caso es de las cosas que menos se tocan; estaba
       tercera empujando el dinero hacia la derecha. */
    ["destacados", `📌 Destacados${nDestacados ? ` · ${nDestacados}` : ""}`, panelDestacados],
    /* La última, o sea la que `masUltima` manda al menú «⋯»: se toca cuando
       alguien nuevo entra o alguien se va, y eso pasa dos veces al año.
       Plataformas vuelve a la fila con eso, y está bien: su contador señala
       algo por arreglar —una puerta sin enlace— y esto no.
       El número NO son las cuentas que hay, son las que están encendidas sin
       haber escrito nunca nada. Ese es el aviso: alguien que entró una vez y
       sigue saliendo en el combo de asignar. Un contador que solo dice cuánta
       gente hay no pide que lo abras. */
    ["cuentas", `👤 Cuentas${cuentasDePaso ? ` · ${cuentasDePaso}` : ""}`, panelCuentas],
  ];
  /* Con el rol de finanzas, una sola pestaña. Enseñar las demás apagadas sería
     peor que esconderlas: invita a pulsarlas y a preguntar por qué no funcionan.
     Y el permiso lo exige además el motor de la base (db/rhe-permisos.sql), así
     que esto es la puerta, no la cerradura. */
  const PESTANAS = soloFinanzas ? TODAS.filter(([k]) => k === "rhe") : TODAS;
  /* `?s=` sigue mandando cuál abre. No es nostalgia: las alertas de la portada,
     los navegadores de mes y los enlaces que ya circulan apuntan a
     `/admin?s=jornadas&jm=-1`, y una pestaña que no sabe leer su propia URL
     los rompe todos en silencio. */
  const iSel = Math.max(0, PESTANAS.findIndex(([k]) => k === s));

  return (
    /* El mismo ancho que /obligaciones, /comprobantes y /caja. Aquí hay tablas
       de jornadas, de recibos y de cuentas: son pantallas de trabajar, y a 860
       las columnas que hay que comparar se parten. */
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {soloFinanzas ? "registro de recibos" : "solo administración"}
        </span>
      </div>
      <h1 className="title-lg">⚙ Administración</h1>
      {soloFinanzas && (
        /* Se DICE por qué solo hay una pestaña. Sin esto, quien recuerde la
           pantalla con siete y la vea con una piensa que algo se rompió. */
        <p style={{ color: "var(--dim)", fontSize: 12, margin: "0 0 10px" }}>
          Tienes acceso al registro de recibos. Las jornadas, las liquidaciones y las tarifas
          las lleva administración.
        </p>
      )}

      {/* `perezoso`: siete secciones con sus tablas y editores no se montan
          para enseñar una. Cada panel arranca la primera vez que se abre y a
          partir de ahí se queda montado — así no se pierde el filtro ni el
          scroll al ir y volver, que es lo que costaría desmontarlos al salir. */}
      <TabsPanel inicial={iSel} masUltima perezoso
        labels={PESTANAS.map(([, l]) => l)}
        paneles={PESTANAS.map(([k, , nodo]) => <div key={k}>{nodo}</div>)} />
    </div>
  );
}
