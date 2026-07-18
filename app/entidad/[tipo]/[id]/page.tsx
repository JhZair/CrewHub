import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Mantenimiento } from "@/components/EntidadForm";
import { SUNAT_EMPRESA, DOCS_EMPRESA, RESERVA_EMPRESA, DNI_PERSONA, DOCS_PERSONA, SUNAT_PERSONA, GRUPO_TONO } from "@/lib/entidades";
import { rucDePersona } from "@/lib/ruc";
import { estado4ta, money } from "@/lib/cuarta";
import { diasDeVigencia, fmtVence, vigenciaVencida } from "@/lib/vigencia";
import Miembros from "@/components/Miembros";
import Credenciales from "@/components/Credenciales";
import ClienteProyecto from "@/components/ClienteProyecto";
import EquipoProyecto from "@/components/EquipoProyecto";
import Postulaciones from "@/components/Postulaciones";
import EmpresaPostulacion from "@/components/EmpresaPostulacion";
import EquipoPostulacion from "@/components/EquipoPostulacion";
import PrestamoEquipo from "@/components/PrestamoEquipo";
import CuentaAcceso from "@/components/CuentaAcceso";
import { BotonVerificarRuc, BotonVerificarDni, BotonRucPersona } from "@/components/VerificarSunat";
import Alerta from "@/components/Alerta";
import { urlPlataforma, conPlataforma, PLAT } from "@/lib/plataformas";
import {
  rendicionVencida, plazoRendicion, compromisoDe, empresaLibre,
  trabasEmpresa, trabasMiembro, dudasMiembro, SIN_COMPROMISO,
  reservaEmpresa, reservaMiembro, reservaCompleta,
} from "@/lib/fondos";
import HojaPostulacion from "@/components/HojaPostulacion";
import { sinBot } from "@/lib/personas";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import Copiar from "@/components/Copiar";
import EventoHistorial from "@/components/EventoHistorial";
import { claseEstado, rotuloEstado, esAviso } from "@/lib/estados";
import { contarHijos, type Familia } from "@/lib/familia";
import { icoTipo } from "@/lib/tipos";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import AvisoMini from "@/components/AvisoMini";
import TextoCorto from "@/components/TextoCorto";
import CVs from "@/components/CVs";
import FotoPersona from "@/components/FotoPersona";
import Materiales from "@/components/Materiales";
import LineaTiempo from "@/components/LineaTiempo";
import CronogramaProyecto from "@/components/CronogramaProyecto";
import TabsPanel from "@/components/TabsPanel";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ICO_ENT, nombreDe } from "@/lib/secciones";

/* PERFIL DE ENTIDAD VIVA — dos columnas:
   izquierda = el carné (datos estáticos, relaciones, credenciales)
   derecha  = la vida (publicaciones activas, cerradas, historial) */

/* El tercer elemento agrupa la fila en un bloque de color, igual que en el
   formulario: la ficha se lee con la misma estructura con la que se edita. */
const CONF: Record<string, { tabla: string; icono: string; campos: [string, string, string?][] }> = {
  proyecto: { tabla: "proyectos", icono: "📁", campos: [["Folio", "folio"], ["Tipo", "tipo"], ["Modalidad", "modalidad"], ["Etapa", "etapa"], ["Actividad", "estado_actividad"], ["RENCA", "renca"]] },
  empresa: { tabla: "empresas", icono: "🏢", campos: [
    ["Código", "codigo"], ["Razón social", "razon_social"], ["Relación", "relacion"],
    ["Región", "region"], ["Estado interno", "estado"], ["Constitución", "fecha_constitucion"],
    ["RUC", "ruc", SUNAT_EMPRESA], ["Domicilio fiscal", "domicilio_fiscal", SUNAT_EMPRESA],
    ["Estado SUNAT", "estado_sunat", SUNAT_EMPRESA], ["Condición SUNAT", "condicion_sunat", SUNAT_EMPRESA],
    ["Verificado", "fecha_verificacion_sunat", SUNAT_EMPRESA],
    ["RENCA", "renca", DOCS_EMPRESA], ["Vigencia de poder vence", "vigencia_poder_fecha", DOCS_EMPRESA],
    // La reserva del DAFO aparta media convocatoria para las de fuera de
    // Lima Metrop. y Callao, y pide estos tres por separado. Ver lib/fondos.
    ["Constituida en (SUNARP)", "sunarp_region_constitucion", RESERVA_EMPRESA],
    ["Domicilio registral (SUNARP)", "sunarp_region_domicilio", RESERVA_EMPRESA],
    ["Domicilio fiscal (SUNAT)", "sunat_region_domicilio", RESERVA_EMPRESA],
    ["Provincia de Lima", "provincia_lima", RESERVA_EMPRESA],
  ] },
  persona: { tabla: "personas", icono: "👤", campos: [
    ["Alias", "alias"], ["Tipo", "tipo"], ["Equipo", "equipo"], ["Estado", "estado"],
    ["Región", "region"], ["Comunero/a", "es_comunero"], ["Rol", "rol"],
    ["DNI", "ruc_dni", DNI_PERSONA], ["DNI vence", "dni_vencimiento", DNI_PERSONA],
    ["Verificado en RENIEC", "fecha_verificacion_reniec", DNI_PERSONA],
    // El nombre oficial, a la vista: si no coincide con el de arriba, el que
    // está mal es el nuestro — y las carpetas se arman con éste.
    ["Nombre en RENIEC", "nombre_reniec", DNI_PERSONA],
    ["Estado SUNAT", "estado_sunat", SUNAT_PERSONA], ["Condición SUNAT", "condicion_sunat", SUNAT_PERSONA],
    ["Verificado", "fecha_verificacion_sunat", SUNAT_PERSONA],
    ["Suspensión 4ta", "suspension_4ta_anio", SUNAT_PERSONA],
  ] },
  equipamiento: { tabla: "equipamiento", icono: "🎥", campos: [["Folio", "folio"], ["Categoría", "categoria"], ["Subcategoría", "subcategoria"], ["Estado", "estado"], ["Valor (S/)", "valor_compra"], ["Comprado en", "comprado_en"]] },
  lugar: { tabla: "lugares", icono: "📍", campos: [] },
  postulacion: { tabla: "postulaciones", icono: "🎯", campos: [["Código", "codigo"], ["Código plataforma DAFO", "codigo_plataforma"], ["Código del acta", "codigo_acta"], ["Estado", "estado"], ["Lenguas originarias", "lenguas_originarias"], ["Puntaje jurado", "puntaje_jurado"], ["Monto adjudicado (S/)", "monto_adjudicado"], ["Firma del acta", "fecha_firma_acta"], ["Límite de rendición", "fecha_limite_rendicion"], ["Prórroga", "fecha_prorroga"], ["Rendición entregada", "fecha_rendicion_real"]] },
  convocatoria: { tabla: "convocatorias", icono: "📜", campos: [["Código", "codigo"], ["Institución", "institucion"], ["Año", "anio"], ["Estado", "estado"], ["Monto del estímulo (S/)", "monto_adjudicado"]] },
  etiqueta: { tabla: "etiquetas", icono: "🏷️", campos: [] },
};

/* El rótulo de estado ya no se escribe aquí: era la novena copia de un mapa
   que en lib/estados.ts arranca diciendo «estaban duplicados en ocho archivos
   y ya habían empezado a divergir». Y había divergido otra vez —a esta copia
   le faltaban los íconos de en_pausa/resuelta/archivada—. Se importa. */
/* (El mapa de tipos salió a lib/tipos: eran diez copias, y a ésta le faltaba
   `conversacion`, así que caía al 💬 del `||` por accidente.) */

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

/* Presentación de valores en la ficha: dinero con miles, fechas legibles */
const CAMPOS_DINERO = ["monto_adjudicado", "valor_compra"];
const ICONO_ESTADO: Record<string, string> = {
  // postulaciones
  ganadora: "🏆", finalista: "⭐", finalista_no_ganadora: "🥈", enviada: "📨", no_seleccionada: "✖", retirada: "↩", en_preparacion: "🛠",
  // convocatorias
  postulacion: "📨", en_ejecucion: "🎬", rendicion_pendiente: "🧾", cerrada: "🗄",
  // empresas
  activa: "✅", en_constitucion: "🏗", inactiva: "💤",
};
/* ¿El dato de SUNAT está sano? Vale para empresas y personas por igual. */
const sunatOk = (key: string, val: any) =>
  key === "estado_sunat" ? val === "activo" : val === "habido";

/* Lo que se COPIA, que no es lo que se lee.
 *
 * `verFicha` decora para mirar: «⚠ 15 oct. 2025 — venció hace 3 d», «✅
 * vigente 2026», «en constitucion». Nada de eso sirve pegado en un formulario
 * de DAFO. Aquí sale el hecho pelado, tal como está guardado — salvo las
 * fechas, que se pasan a dd/mm/aaaa porque es lo que piden los formularios
 * peruanos, y nadie va a reescribir a mano un 2025-10-15 (que es exactamente
 * donde se pierde el dígito).
 *
 * El tooltip del componente muestra esta misma cadena, así que lo que se ve
 * prometido es lo que cae en el portapapeles.
 */
const crudo = (val: any) => {
  const s = String(val ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

const verFicha = (key: string, val: any, ent?: any) => {
  if (typeof val === "boolean") return val ? "✅ Sí" : "No";
  // La suspensión de 4ta vale por el año calendario y se pide de nuevo en enero
  if (key === "suspension_4ta_anio") {
    const a = Number(val), hoy = new Date().getFullYear();
    return a >= hoy ? `✅ vigente ${a}` : `⚠ venció en ${a} — renovar`;
  }
  /* La vigencia se guarda por su emisión (es lo que dice el papel) pero se
     lee por su vencimiento, que es lo que a uno le importa: nadie quiere
     restar 90 días de cabeza para saber si el certificado todavía sirve.

     El ⚠ solo si falta el RENCA: vencida es un hecho, pero «⚠» es un juicio
     —dice «resuelve esto»— y con el RENCA ya sacado no hay nada que resolver.
     La vigencia sirve para pedirlo; después, cumplió. */
  if (key === "vigencia_poder_fecha") {
    const d = diasDeVigencia(String(val));
    if (d >= 0) return `${fmtVence(String(val))} · en ${d} d`;
    return ent && !ent.renca
      ? `⚠ ${fmtVence(String(val))} — venció hace ${-d} d, y falta el RENCA`
      : `${fmtVence(String(val))} — venció hace ${-d} d, ya cumplió`;
  }
  const s = String(val);
  if (CAMPOS_DINERO.includes(key)) {
    const n = parseFloat(s);
    if (!isNaN(n)) return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))
    return new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
  if (key === "estado" && ICONO_ESTADO[s]) return `${ICONO_ESTADO[s]} ${s.replace(/_/g, " ")}`;
  return s.replace(/_/g, " ");
};

/* El nombre de la pestaña: «🏢 Aynicha Films», «📁 15 Emi».
   Se pide el nombre CORTO cuando lo hay (alias, nombre_corto) porque en una
   pestaña no cabe la razón social — y ésta es una ficha que John tiene
   abierta al lado del caso mientras trabaja. El ícono va primero: Chrome
   recorta por el final. */
export async function generateMetadata({ params }: { params: { tipo: string; id: string } }): Promise<Metadata> {
  const n = nombreDe(params.tipo);
  if (!n) return { title: "Ficha" };
  const supabase = createClient();
  const sel = ["id", n.campo, n.corto].filter(Boolean).join(",");
  const { data } = await supabase.from(n.tabla).select(sel).eq("id", params.id).single();
  const d = data as any;
  const nombre = d ? ((n.corto && d[n.corto]) || d[n.campo]) : null;
  return { title: `${ICO_ENT[params.tipo] || "📄"} ${nombre || "Ficha"}` };
}

export default async function Entidad({ params }: { params: { tipo: string; id: string } }) {
  const conf = CONF[params.tipo];
  if (!conf) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ent } = await supabase.from(conf.tabla).select("*").eq("id", params.id).single();
  if (!ent) notFound();

  const [{ data: vincs }, { data: eventos }, urlSunat] = await Promise.all([
    supabase.from("publicacion_vinculos")
      .select("publicacion_id")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .limit(300),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,actor:perfiles(nombre)")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .order("creado_en", { ascending: false }).limit(30),
    // El link de SUNAT sale del admin, no del código: si SUNAT lo cambia
    // —lo ha hecho— se corrige ahí sin esperar un deploy.
    urlPlataforma(PLAT.sunatConsultaRuc),
  ]);

  // Historial sin ruido: los cambios de estado_sunat/condicion_sunat ya
  // los resume el evento "Verificación SUNAT" del bot; se ocultan aquí.
  const eventosVis = (eventos || []).filter((e: any) =>
    !(e.tipo === "estado" && ["estado_sunat", "condicion_sunat"].includes(e.detalle?.campo)));

  const ids = (vincs || []).map((v: any) => v.publicacion_id);
  /* `cuerpo` va aquí porque en un aviso el título es solo el asunto: lo que
     hay que hacer está en el cuerpo. Sin él, la tarjeta obligaba a entrar al
     caso para leer la indicación — y a volver para darse por enterado. */
  const SEL_PUB = "id,titulo,cuerpo,tipo,estado,creado_en,fecha_limite,autor:perfiles!publicaciones_autor_id_fkey(nombre),resp:perfiles!publicaciones_responsable_fkey(nombre),comentarios(count)";
  // Si la persona tiene cuenta, su vida también son los casos que creó o le asignaron
  const uid = params.tipo === "persona" ? ent.usuario_id : null;
  const [porVinculo, porUsuario, misComs] = await Promise.all([
    ids.length
      ? supabase.from("publicaciones").select(SEL_PUB).in("id", ids)
      : Promise.resolve({ data: [] as any[] }),
    uid
      ? supabase.from("publicaciones").select(SEL_PUB)
          .or(`autor_id.eq.${uid},responsable.eq.${uid}`)
          .order("creado_en", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] as any[] }),
    uid
      ? supabase.from("comentarios").select("publicacion_id")
          .eq("autor_id", uid).limit(400)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  // Casos donde solo participó comentando (ni autor ni responsable ni vinculado)
  const yaTraidos = new Set([...(porVinculo.data || []), ...(porUsuario.data || [])].map((p: any) => p.id));
  const idsComentados = [...new Set((misComs.data || []).map((c: any) => c.publicacion_id))]
    .filter((id: string) => !yaTraidos.has(id));
  const porComentario = idsComentados.length
    ? await supabase.from("publicaciones").select(SEL_PUB).in("id", idsComentados)
    : { data: [] as any[] };
  const vistosPub = new Set<string>();
  const pubs = [...(porVinculo.data || []), ...(porUsuario.data || []), ...(porComentario.data || [])]
    .filter((p: any) => vistosPub.has(p.id) ? false : (vistosPub.add(p.id), true))
    .sort((a: any, b: any) => (b.creado_en || "").localeCompare(a.creado_en || ""));

  // Los datos importantes de cada caso: sub-casos y reacciones
  const idsP = pubs.map((p: any) => p.id);
  let hijosDe = new Map<string, Familia>();
  /* Las reacciones se guardan en crudo —con `usuario_id`— y no contadas.
     El conteo se saca de aquí cuando hace falta, pero al revés no se puede:
     con solo el número, la tarjeta no sabe si el 👀 es TUYO, y sin eso no hay
     botón "me enteré" que valga. Contar es tirar el dato que importa. */
  const reaccDe = new Map<string, Reaccion[]>();
  if (idsP.length) {
    const [hj, rc] = await Promise.all([
      supabase.from("publicaciones").select("padre_id,estado").in("padre_id", idsP),
      supabase.from("reacciones").select("publicacion_id,emoji,usuario_id").is("comentario_id", null).in("publicacion_id", idsP),
    ]);
    hijosDe = contarHijos(hj.data);
    (rc.data || []).forEach((r: any) => {
      const l = reaccDe.get(r.publicacion_id) || [];
      l.push({ emoji: r.emoji, usuario_id: r.usuario_id });
      reaccDe.set(r.publicacion_id, l);
    });
  }
  /* El equipo es el denominador de "Enterados N/M". Solo se pide si hay algún
     aviso a la vista: en una ficha sin avisos sería una consulta de más. */
  const equipoAvisos = pubs.some((p: any) => p.tipo === "aviso")
    // Qhaway no se entera de nada: reparte, no lee.
    ? sinBot((await supabase.from("perfiles").select("id,nombre").eq("activo", true)).data)
    : [];

  // Relaciones societarias
  let miembros: any[] = [], personasCat: any[] = [], cargosDe: any[] = [], postusEmp: any[] = [];
  // Lo que necesita la hoja para postular (solo se llena si es empresa)
  let comp = SIN_COMPROMISO, empLibre = false, trabasEmp: string[] = [], miembrosHoja: any[] = [];
  let partesReserva: any[] = [], reserva: "si" | "no" | "falta" = "falta";
  let clienteDe: { id: string; nombre: string } | null = null;
  let cronoActs: any[] = [], perfilesCat: any[] = [];
  let postusProy: any[] = [], equipoProy: any[] = [], plantillas: any[] = [];
  if (params.tipo === "proyecto") {
    const [pc, cl, ca, pf, pp, eq, pl] = await Promise.all([
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      ent.cliente_id
        ? supabase.from("personas").select("id,nombre,alias").eq("id", ent.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles(nombre)")
        /* La fecha manda; `orden` desempata lo que cae el mismo día —un día
           de rodaje tiene secuencia— y `creado_en` desempata el desempate,
           para que dos con el mismo orden no bailen entre recargas. */
        .eq("proyecto_id", params.id).order("fecha_inicio").order("orden").order("creado_en"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("id,codigo,estado,codigo_acta,monto_adjudicado,fecha_firma_acta,fecha_limite_rendicion,fecha_prorroga,acta_url,conv:convocatorias(id,codigo,nombre,anio)")
        .eq("proyecto_id", params.id).order("creado_en", { ascending: false }),
      /* Quién hace esta película, desde «idea». Distinto de
         `postulacion_equipo`: ese es quién se presentó a UN concurso. */
      supabase.from("proyecto_equipo")
        .select("id,cargo,desde,hasta,persona:personas(id,nombre,alias)")
        .eq("proyecto_id", params.id).order("cargo"),
      // Cronogramas que ya se usaron antes: «las coberturas son casi la misma»
      supabase.from("plantillas_cronograma")
        .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)")
        .order("nombre"),
    ]);
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    const _cl = (cl as any).data; clienteDe = _cl ? { id: _cl.id, nombre: _cl.alias || _cl.nombre } : null;
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postusProy = pp.data || [];
    equipoProy = eq.data || [];
    plantillas = (pl.data || []).map((x: any) => ({
      id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto,
      n: x.acts?.[0]?.count ?? 0,
    }));
  }
  let postus: any[] = [], proyectosCat: any[] = [], empresasCat: any[] = [];
  if (params.tipo === "convocatoria") {
    const [ca, pf, po, pr, em] = await Promise.all([
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles(nombre)")
        .eq("convocatoria_id", params.id).order("fecha_inicio").order("orden").order("creado_en"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("*, proy:proyectos(id,nombre), emp:empresas(id,nombre,codigo)")
        .eq("convocatoria_id", params.id).order("creado_en"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
      supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
    ]);
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postus = po.data || [];
    proyectosCat = pr.data || [];
    empresasCat = (em.data || []).map((x: any) => ({ id: x.id, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre }));
  }
  let prestamos: any[] = [], proyectosPrest: any[] = [];
  if (params.tipo === "equipamiento") {
    const [pr, pc, py] = await Promise.all([
      supabase.from("equipo_prestamos")
        .select("id,desde,hasta,nota,persona:personas(id,nombre,alias),proy:proyectos(id,nombre)")
        .eq("equipamiento_id", params.id).order("desde", { ascending: false }),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
    ]);
    prestamos = pr.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    proyectosPrest = py.data || [];
  }

  let postCtx: any = null, equipoPost: any[] = [];
  if (params.tipo === "postulacion") {
    const [ctx, eq, pc, ec] = await Promise.all([
      supabase.from("postulaciones")
        .select("proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre,codigo), conv:convocatorias(id,codigo,nombre,anio,monto_adjudicado,bases_url,hitos:cronograma_actividades(id,nombre,fecha_inicio,estado,clase))")
        .eq("id", params.id).single(),
      supabase.from("postulacion_equipo")
        .select("id,cargo,persona:personas(id,nombre,alias)")
        .eq("postulacion_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      /* Solo las que pueden postular de verdad: activas y nuestras. Ofrecer
         una externa o una cerrada sería invitar al error — el fondo lo
         rechazaría después, cuando ya no hay tiempo de cambiarla. */
      supabase.from("empresas").select("id,nombre,codigo")
        .eq("estado", "activa").order("nombre"),
    ]);
    postCtx = ctx.data;
    equipoPost = eq.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    empresasCat = (ec.data || []).map((x: any) => ({ ...x, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre }));

    /* El equipo del PROYECTO, que la postulación hereda y no repite.
       La directora no se teclea aquí: nace con el proyecto y viene con él.
       Esta consulta va aparte porque necesita el proyecto_id, que sale de la
       consulta de arriba — encadenada a propósito, es una sola fila. */
    const proyId = (postCtx?.proy as any)?.id;
    if (proyId) {
      const { data: pe } = await supabase.from("proyecto_equipo")
        .select("id,cargo,persona:personas(id,nombre,alias)")
        .eq("proyecto_id", proyId).order("cargo");
      equipoProy = pe || [];
    }
  }
  if (params.tipo === "empresa") {
    const [m, pc, pe] = await Promise.all([
      /* Los datos que decide si esta empresa puede postular NO son solo los
         suyos: firma un responsable, y un DNI vencido invalida esa firma.
         Antes esto traía nombre y alias — por eso la ficha listaba cargos y
         nadie veía que al presidente le había caducado el DNI. */
      supabase.from("empresa_miembros")
        /* `region` es la dirección del DNI y decide la reserva regional. Sin
           ella en el select, `reservaMiembro()` lee `undefined` y responde
           «sin región» aunque la ficha la tenga cargada — un hueco de consulta
           que se lee igual que un hueco de dato. Es exactamente contra lo que
           existe `SEL_FONDO` en lib/fondos.ts, y lo repetí aquí igual. */
        .select("id,cargo,fecha_inicio,fecha_fin,estado,persona:personas(id,nombre,alias,region,ruc_dni,dni_vencimiento,estado_sunat,condicion_sunat,nombre_reniec)")
        .eq("empresa_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      /* Con qué proyectos postuló, qué ganó y con qué equipo. Las fechas de
         rendición entran porque deciden si tiene un fondo encima —y por tanto
         si puede tomar otro—: sin `fecha_rendicion_real`, `ejecutando()`
         leería el hueco como «ya entregó». */
      supabase.from("postulaciones")
        .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real,proy:proyectos(id,nombre),conv:convocatorias(id,nombre,anio),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias))")
        .eq("empresa_id", params.id).order("creado_en", { ascending: false }),
    ]);
    miembros = m.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    postusEmp = pe.data || [];

    /* El veredicto se arma acá, en el servidor, con las mismas funciones que
       usa el listado de /empresas (lib/fondos.ts). Si la hoja decidiera por
       su cuenta, un día diría «lista» de una empresa que la lista muestra
       trabada, y nadie sabría cuál de las dos miente. */
    comp = compromisoDe(postusEmp);
    /* `miembros.length > 0` no es un detalle: sin él, `every` sobre una lista
       vacía devuelve true y la hoja declararía «lista para postular» a una
       empresa de la que no sabemos quién firma. El vacío no es un aprobado. */
    empLibre = empresaLibre(ent, comp)
      && miembros.length > 0
      && miembros.every(x => !trabasMiembro(x.persona).length);
    trabasEmp = trabasEmpresa(ent, comp);
    miembrosHoja = miembros.map((x: any) => ({
      id: x.id, cargo: x.cargo, persona: x.persona,
      // El RUC de una persona no se guarda: sale de su DNI (lib/ruc.ts)
      ruc: rucDePersona(x.persona?.ruc_dni) || null,
      trabas: trabasMiembro(x.persona),
      // Aparte de las trabas: lo que nadie miró no está mal, pero tampoco bien
      dudas: dudasMiembro(x.persona),
      // Su DNI, para la reserva regional (las bases piden esa dirección)
      reserva: reservaMiembro(x.persona),
    }));
    partesReserva = reservaEmpresa(ent);
    /* La empresa Y su gente: las bases piden que los responsables acrediten
       domicilio de región con su DNI. Antes esto era `veredictoReserva(partes)`
       —solo la empresa— y la hoja decía «✅ puede aplicar» con los tres
       responsables en «sin región», tres líneas más abajo. */
    reserva = reservaCompleta(partesReserva, miembrosHoja);
  }
  let postDe: any[] = [], equiposEnMano: any[] = [], clienteEnProy: any[] = [], cvsDe: any[] = [];
  let acum4ta = 0;   // lo girado este año en RHE
  let cuentaDe: { id: string; nombre: string; avatar_url?: string | null } | null = null;
  let cuentasLibres: { id: string; nombre: string }[] = [];
  let pulso: { cerr: number; creo: number; coments: number; ab: number; venc: number; ultimo: string } | null = null;
  if (params.tipo === "persona") {
    const [cg, cv, rh, pe, pr, cl] = await Promise.all([
      supabase.from("empresa_miembros")
        .select("id,cargo,estado,fecha_inicio,fecha_fin,empresa:empresas(id,nombre,codigo)")
        .eq("persona_id", params.id).order("estado"),
      supabase.from("persona_cv").select("*").eq("persona_id", params.id).order("enfoque"),
      // RHE del año: para vigilar su tope de 4ta
      supabase.from("rhe").select("monto,fecha")
        .eq("persona_id", params.id).gte("fecha", `${new Date().getFullYear()}-01-01`),
      // Con qué postuló, con quién y por cuál empresa: el contexto completo
      supabase.from("postulacion_equipo")
        .select("id,cargo,post:postulaciones(id,codigo,estado,monto_adjudicado,proy:proyectos(id,nombre),conv:convocatorias(id,nombre,anio),emp:empresas(id,nombre),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias)))")
        .eq("persona_id", params.id),
      supabase.from("equipo_prestamos")
        .select("id,desde,equipo:equipamiento(id,folio,nombre)")
        .eq("persona_id", params.id).is("hasta", null).order("desde", { ascending: false }),
      supabase.from("proyectos")
        .select("id,nombre,tipo")
        .eq("cliente_id", params.id).order("nombre"),
    ]);
    cargosDe = cg.data || [];
    cvsDe = cv.data || [];
    acum4ta = (rh.data || []).reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
    postDe = (pe.data || []).sort((a: any, b: any) =>
      (b.post?.conv?.anio || 0) - (a.post?.conv?.anio || 0));
    equiposEnMano = pr.data || [];
    clienteEnProy = cl.data || [];

    // Cuenta de acceso: perfil enlazado + cuentas que aún no tienen persona
    const [pf, up] = await Promise.all([
      // avatar_url: quien ya tiene cuenta trae su foto del login
      supabase.from("perfiles").select("id,nombre,avatar_url").eq("activo", true).order("nombre"),
      supabase.from("personas").select("usuario_id").not("usuario_id", "is", null),
    ]);
    const usadas = new Set((up.data || []).map((x: any) => x.usuario_id));
    const perfilesAll = sinBot(pf.data);
    cuentaDe = ent.usuario_id ? perfilesAll.find((p: any) => p.id === ent.usuario_id) || null : null;
    cuentasLibres = perfilesAll.filter((p: any) => !usadas.has(p.id));

    /* Pulso en CrewHub+: solo tiene sentido para quien tiene cuenta, porque
       la actividad se registra contra el usuario, no contra la persona.
       Mismas definiciones que /pulso, para no tener dos verdades. */
    if (ent.usuario_id) {
      const [ev, viv, co] = await Promise.all([
        supabase.from("actividad")
          .select("tipo,detalle,creado_en").eq("entidad_tipo", "publicacion")
          .eq("actor_id", ent.usuario_id).limit(4000),
        supabase.from("publicaciones").select("fecha_limite")
          .eq("responsable", ent.usuario_id)
          .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).limit(500),
        supabase.from("comentarios").select("id", { count: "exact", head: true })
          .eq("autor_id", ent.usuario_id),
      ]);
      const hoyStr = new Date().toISOString().slice(0, 10);
      let cerr = 0, creo = 0, ultimo = "";
      (ev.data || []).forEach((e: any) => {
        const det: any = e.detalle || {};
        if (e.tipo === "creado") creo++;
        else if (e.tipo === "estado" && det.campo === "estado" && det.a === "resuelta") cerr++;
        if (e.creado_en > ultimo) ultimo = e.creado_en;
      });
      pulso = {
        cerr, creo, ultimo,
        coments: co.count || 0,
        ab: (viv.data || []).length,
        venc: (viv.data || []).filter((p: any) => p.fecha_limite && p.fecha_limite < hoyStr).length,
      };
    }
  }

  let creds: any[] = [];
  if (params.tipo === "empresa" || params.tipo === "persona") {
    const { data } = await supabase.from("credenciales")
      .select("*, datos:credencial_datos(id,etiqueta,valor,verificado_en)")
      .eq(params.tipo === "empresa" ? "empresa_id" : "persona_id", params.id)
      .order("plataforma");
    /* El link y las entradas salen de la plataforma al leer, no de una copia
       guardada: la Clave SOL de esta empresa abre en tres sitios, y quien
       viene a declarar el IGV necesita el suyo, no el menú general. */
    creds = await conPlataforma(data || []);
  }

  const nombre = params.tipo === "postulacion"
    ? `${ent.codigo || postCtx?.conv?.codigo || "Postulación"} · ${postCtx?.proy?.nombre || ""}`.replace(/ · $/, "")
    : ent.nombre || ent.codigo || "—";
  const activas = (pubs || []).filter((p: any) => ["abierta", "en_progreso", "seguimiento"].includes(p.estado));
  const cerradas = (pubs || []).filter((p: any) => !["abierta", "en_progreso", "seguimiento"].includes(p.estado));

  const cardPub = (p: any) => {
    const hj = hijosDe.get(p.id);
    const rx = reaccDe.get(p.id) || [];
    const nComs = (p.comentarios as any)?.[0]?.count || 0;
    const esAv = esAviso(p.tipo);
    // Conteo por emoji, solo para la línea de meta de un caso normal: ahí las
    // reacciones son un dato que se lee, no un botón que se toca.
    const cuenta = new Map<string, number>();
    rx.forEach(r => cuenta.set(r.emoji, (cuenta.get(r.emoji) || 0) + 1));
    return (
      /* Enlace ESTIRADO, no <Link> envolviendo. Un aviso lleva dentro cosas
         que se tocan —«me enteré», reaccionar— y el cuerpo puede traer una
         URL que TextoRico convierte en <a>. Un <button> o un <a> dentro de
         otro <a> es HTML inválido: el navegador reordena el árbol al parsear
         y React revienta al hidratar porque el DOM ya no es el que mandó el
         servidor. Con la capa, lo interactivo solo necesita `fila-encima`.
         est-* aporta el tinte de identidad del estado, igual que en el feed. */
      <div key={p.id} className={`card link fila-cap est-${claseEstado(p.estado, p.tipo)}`}
        style={{ cursor: "pointer", padding: "12px 15px" }}>
        <Link href={`/caso/${p.id}`} className="fila-cubre" aria-label={p.titulo} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{icoTipo(p.tipo)}</span>
          <b style={{ flex: 1, fontSize: 13.5 }}>{p.titulo}</b>
          {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
          {/* Un aviso dice «Vigente», no «Sin Resolver»: nadie lo va a resolver */}
          <span className={`pill st-${claseEstado(p.estado, p.tipo)}`}>{rotuloEstado(p.estado, p.tipo)}</span>
        </div>

        {/* En un aviso el título es el asunto; la indicación está en el
            cuerpo. Mostrarlo aquí es el punto: un aviso se lee, no se abre.
            Y si es largo, «ver más» lo abre aquí mismo — mandarte a otra
            página a leer el final es el viaje que este bloque vino a
            ahorrar. */}
        {esAv && p.cuerpo && (
          <TextoCorto texto={p.cuerpo} className="aviso-cuerpo" />
        )}

        <div className="meta" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {(p.autor as any)?.nombre && <span>✍ {(p.autor as any).nombre.split(" ")[0]}</span>}
          <span>{fecha(p.creado_en)}</span>
          {nComs > 0 && <span>💬 {nComs}</span>}
          {hj && (
            <span style={{ color: hj.ok === hj.total ? "var(--green)" : "var(--yellow)" }}>
              🧩 {hj.ok}/{hj.total} sub-casos
            </span>
          )}
          {/* En un aviso las reacciones bajan al pie, donde se pueden tocar */}
          {!esAv && cuenta.size > 0 && (
            <span style={{ letterSpacing: .5 }}>
              {[...cuenta.entries()].map(([e, n]) => `${e}${n > 1 ? ` ${n}` : ""}`).join("  ")}
            </span>
          )}
        </div>

        {/* El pie del aviso: enterarse y reaccionar sin salir de aquí. Era lo
            que faltaba — un aviso que obliga a abrir otra página para decir
            "ya lo vi" no se lee: se ignora. */}
        {esAv && (
          <div className="fila-encima aviso-pie">
            <AvisoMini pubId={p.id}
              enterados={rx.filter(r => r.emoji === "👀").length}
              total={equipoAvisos.length || undefined}
              mio={rx.some(r => r.emoji === "👀" && r.usuario_id === user.id)} />
            <Reacciones pubId={p.id} reacciones={rx} userId={user.id} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {conf.icono} {params.tipo}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {/* A quien trabaja con nosotros le ponemos cara; a un contacto no */}
        {params.tipo === "persona" && ["personal", "colaborador", "colaborador eventual"].includes(ent.tipo || "") ? (
          <>
            {/* Si ya tiene cuenta, su avatar del login sirve de foto: no hay
                que pedirle otra. La subida solo la reemplaza si quiere. */}
            <FotoPersona personaId={params.id} nombre={ent.nombre} size={52}
              foto={ent.foto_url || cuentaDe?.avatar_url} propia={!!ent.foto_url} />
            {/* El nombre también se copia: es de los que Wilfredo pasa a
                mano a los formularios. El ícono queda fuera del valor —
                copiar «🏢 Kawsay Pacha» sería copiar mal. */}
            <h1 className="title-lg" style={{ margin: 0 }}>
              <Copiar valor={nombre} etiqueta="el nombre">{nombre}</Copiar>
            </h1>
          </>
        ) : (
          <h1 className="title-lg" style={{ margin: 0 }}>
            {conf.icono} <Copiar valor={nombre} etiqueta="el nombre">{nombre}</Copiar>
          </h1>
        )}
        {/* De quién es la empresa: se lee sin bajar a la ficha. Solo las
            propias generan alertas, así que conviene tenerlo a la vista. */}
        {params.tipo === "empresa" && ent.relacion && (() => {
          const t: Record<string, [string, string]> = {
            propia: ["var(--violet)", "rgba(167,139,250,.14)"],
            aliada: ["var(--teal)", "rgba(45,212,191,.12)"],
            externa: ["var(--dim)", "rgba(150,150,170,.10)"],
          };
          const [col, bg] = t[ent.relacion] || t.externa;
          return <span className="badge" style={{ color: col, background: bg }}>{ent.relacion}</span>;
        })()}
        {/* Aquí vivía un "＋ Publicar" que te mandaba al feed con la entidad
            pre-vinculada. Lo hace el FAB flotante, sin sacarte de la ficha. */}
      </div>

      <div className="perfil-grid">
        {/* ===== COLUMNA IZQUIERDA: el carné ===== */}
        <aside>
          <div className="card">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: conf.campos.length ? 12 : 0 }}>
              {/* En empresa, Drive/RENCA/Vigencia se muestran dentro del
                  bloque 📎 Documentos, junto al dato que respaldan. */}
              {!["empresa", "persona"].includes(params.tipo) && ent.carpeta_drive_url && (
                <a href={ent.carpeta_drive_url} target="_blank" rel="noopener noreferrer"
                  className="btn" style={{ background: "#1a73e8", fontSize: 12, padding: "7px 12px" }}>📂 Drive</a>
              )}
              {ent.bases_url && (
                <a href={ent.bases_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📖 Bases</a>
              )}
              {ent.presupuesto_url && (
                <a href={ent.presupuesto_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>💰 Presupuesto</a>
              )}
              {ent.matriz_jurado_url && (
                <a href={ent.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📊 Matriz jurado</a>
              )}
              {ent.acta_url && (
                <a href={ent.acta_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>🖋 Acta</a>
              )}
              {params.tipo !== "empresa" && ent.renca_url && (
                <a href={ent.renca_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>🎬 RENCA</a>
              )}
              {params.tipo !== "empresa" && ent.vigencia_poder_url && (
                <a href={ent.vigencia_poder_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📜 Vigencia</a>
              )}
              {/* En persona, CV/DNI/Firma/Drive van dentro del bloque 📎 Documentos */}
            </div>

            {/* Al personal y colaboradores activos el fondo les exige DNI y
                firma escaneados. A un contacto no se le pide nada. */}
            {params.tipo === "persona" && ent.estado === "activo"
              && ["personal", "colaborador", "colaborador eventual"].includes(ent.tipo || "")
              && (() => {
                const falta: string[] = [];
                if (!ent.dni_url) falta.push("DNI escaneado");
                if (!ent.firma_url) falta.push("firma escaneada");
                return falta.length > 0 && (
                  <Alerta tono="ambar"
                    titulo={`📎 Falta ${falta.join(" y ")}`}
                    detalle="Son obligatorios para postular a fondos. Cárgalos en ✏️ Editar." />
                );
              })()}

            {/* La suspensión de 4ta vence cada 31 de diciembre: si quedó en un
                año pasado, hay que renovarla o corresponde retener el 8%. */}
            {/* El tope de 4ta: si lo supera, la suspensión se rompe por el
                resto del año. Solo nosotros podemos verlo venir. */}
            {params.tipo === "persona" && acum4ta > 0 && (() => {
              const e = estado4ta(acum4ta, new Date().getFullYear());
              if (e.supero) return (
                <Alerta tono="roja"
                  titulo={`🏛 Superó el tope de 4ta: ${money(acum4ta)} de ${money(e.tope)}`}
                  detalle="Su suspensión se rompió: corresponde retenerle el 8% en los recibos de lo que resta del año, aunque después cobre menos. Ya no se recompone." />
              );
              if (e.cerca) return (
                <Alerta tono="ambar"
                  titulo={`🏛 Al ${e.pct}% del tope de 4ta — le quedan ${money(e.resta)}`}
                  detalle="Con nosotros lleva girado casi el límite del año. Si lo pasa, habrá que retenerle el 8% por el resto del año. Ojo: si factura por fuera, el tope real llega antes." />
              );
              return null;
            })()}

            {params.tipo === "persona" && ent.suspension_4ta_anio && (() => {
              const a = Number(ent.suspension_4ta_anio);
              if (a < new Date().getFullYear()) return (
                <Alerta tono="ambar"
                  titulo={`🏛 Suspensión de 4ta vencida (${a})`}
                  detalle="Caduca cada 31 de diciembre. Mientras no la renueve en SUNAT, a sus recibos por honorarios les corresponde la retención del 8%." />
              );
              // Vigente pero sin respaldo: si SUNAT la pide, no hay cómo probarla
              return !ent.suspension_4ta_url && (
                <Alerta tono="ambar"
                  titulo="🧾 Suspensión de 4ta sin constancia"
                  detalle={`Figura vigente ${a}, pero no está cargado el comprobante que emite SUNAT al tramitarla. Sin él no hay cómo sustentar por qué no se retuvo.`} />
              );
            })()}

            {/* El CV depende del rol: hace falta uno por cada cargo con el
                que postula, y DAFO lo exige en la carpeta. */}
            {params.tipo === "persona" && ent.estado === "activo"
              && ["personal", "colaborador", "colaborador eventual"].includes(ent.tipo || "")
              && (() => {
                if (!cvsDe.length) return (
                  <Alerta tono="ambar" titulo="📋 Sin ningún CV cargado"
                    detalle="El fondo exige el CV de cada miembro del equipo, con el enfoque del rol al que postula." />
                );
                // ¿Postula con cargos para los que no tiene CV con ese enfoque?
                const tiene = new Set(cvsDe.map((c: any) => c.enfoque));
                const sinCv = [...new Set(postDe.map((r: any) => r.cargo).filter(Boolean))]
                  .filter((c: any) => !tiene.has(c));
                if (sinCv.length) return (
                  <Alerta tono="ambar"
                    titulo={`📋 Postula como ${sinCv.join(", ")} pero no tiene CV con ese enfoque`}
                    detalle="Cada rol necesita su propio CV: el del director no sirve para presentarla como investigadora." />
                );
                const viejos = cvsDe.filter((c: any) =>
                  c.actualizado && (Date.now() - new Date(c.actualizado + "T12:00:00").getTime()) / 86400000 > 365);
                return viejos.length > 0 && (
                  <Alerta tono="ambar"
                    titulo={`📋 CV desactualizado: ${viejos.map((c: any) => c.enfoque).join(", ")}`}
                    detalle="Lleva más de un año sin rehacerse. Conviene refrescarlo antes de la próxima postulación." />
                );
              })()}

            {params.tipo === "persona" && ent.dni_vencimiento && (() => {
              const v = new Date(ent.dni_vencimiento);
              const dias = Math.ceil((v.getTime() - Date.now()) / 86400000);
              const fmt = v.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
              if (dias < 0) return (
                <Alerta tono="roja"
                  titulo={`🪪 DNI vencido — venció el ${fmt} (hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}).`}
                  detalle="Pide el DNI renovado y actualiza la fecha en ✏️ Editar." />
              );
              if (dias <= 45) return (
                <Alerta tono="ambar"
                  titulo={`🪪 DNI por vencer — vence el ${fmt} (en ${dias} ${dias === 1 ? "día" : "días"}).`}
                  detalle="Conviene renovarlo antes de la próxima postulación." />
              );
              return null;
            })()}

            {/* Una postulación se contradice sola con facilidad: se marca
                ganadora y nadie carga el acta, o se pone una prórroga que
                acorta el plazo en vez de estirarlo. La ficha lo dice. */}
            {params.tipo === "postulacion" && (() => {
              const al: any[] = [];
              const gano = ent.estado === "ganadora";
              if (gano) {
                const falta = [
                  !ent.codigo_acta && "el código del acta",
                  !ent.fecha_firma_acta && "la fecha de firma",
                  !ent.monto_adjudicado && "el monto adjudicado",
                  !ent.fecha_limite_rendicion && "la fecha límite de rendición",
                ].filter(Boolean);
                /* El plazo pasó y nadie registró la entrega. Es lo más grave
                   que le puede pasar a la empresa ante DAFO, y hasta hoy el
                   sistema lo leía como «fondo cerrado» y la daba por libre
                   para postular. */
                /* `verFicha("f", …)` y no `fmtVence`: el segundo le suma 90
                   días porque nació para las vigencias de poder, y aquí
                   diría una fecha tres meses más tarde. */
                if (rendicionVencida(ent)) al.push(
                  <Alerta key="debe" tono="roja"
                    titulo={`🧾 La rendición venció el ${verFicha("f", plazoRendicion(ent))} y no hay entrega registrada`}
                    detalle="Mientras esto siga así, la empresa figura comprometida y no aparece libre para postular. Si ya se entregó, ponle la fecha en «Rendición entregada el» con ✏️ Editar — eso cierra el fondo." />
                );
                if (falta.length) al.push(
                  <Alerta key="gan" tono="ambar"
                    titulo={`🏆 Ganadora, pero falta ${falta.join(", ")}`}
                    detalle="Sin estos datos el fondo no se puede seguir: no aparece en los montos ganados ni avisa cuando venza la rendición." />
                );
              } else if (ent.monto_adjudicado || ent.codigo_acta) {
                // Datos de fondo en algo que no ganó: o el estado está viejo,
                // o alguien se equivocó de postulación.
                al.push(
                  <Alerta key="inc" tono="ambar"
                    titulo={`🏆 Tiene datos del fondo, pero figura como «${String(ent.estado || "—").replace(/_/g, " ")}»`}
                    detalle="Si ya ganó, cambia el estado a ganadora. Si no, revisa: esos datos pueden ser de otra postulación." />
                );
              }
              if (ent.fecha_prorroga && ent.fecha_limite_rendicion
                && ent.fecha_prorroga < ent.fecha_limite_rendicion) al.push(
                <Alerta key="pro" tono="roja"
                  titulo="📅 La prórroga es anterior al límite de rendición"
                  detalle="Una prórroga estira el plazo, no lo acorta. Seguramente hay un error de tipeo en una de las dos fechas." />
              );
              if (ent.fecha_firma_acta && ent.fecha_limite_rendicion
                && ent.fecha_limite_rendicion < ent.fecha_firma_acta) al.push(
                <Alerta key="fir" tono="roja"
                  titulo="📅 La rendición vence antes de la firma del acta"
                  detalle="Revisa las dos fechas: no se puede rendir un fondo antes de haberlo firmado." />
              );
              return al.length ? <>{al}</> : null;
            })()}

            {params.tipo === "empresa" && ent.estado === "activa"
              && (ent.relacion || "propia") === "propia" && (() => {
              const al: any[] = [];
              // Sin RUC no hay nada que hacer: ni verificar, ni postular, ni firmar
              if (!ent.ruc) al.push(
                <Alerta key="ruc" tono="roja"
                  titulo="🏛 Sin RUC registrado"
                  detalle="Figura como activa pero no tiene RUC: no se puede verificar en SUNAT, ni postular, ni firmar contratos. Regístralo en ✏️ Editar." />
              );
              const est = ent.estado_sunat, cond = ent.condicion_sunat;
              if (est && est !== "activo") al.push(
                <Alerta key="sunat-e" tono="roja"
                  titulo={`🏛 SUNAT: ${String(est).replace(/_/g, " ")}`}
                  detalle="La empresa no está activa en SUNAT — no puede postular a fondos hasta regularizar." />
              );
              else if (cond === "no_habido") al.push(
                <Alerta key="sunat-c" tono="roja"
                  titulo="🏛 SUNAT: no habido"
                  detalle="Domicilio fiscal no habido — regulariza antes de presentar documentos o postular." />
              );
              if (!ent.renca) al.push(
                <Alerta key="renca" tono="ambar"
                  titulo="🎬 Sin RENCA registrado"
                  detalle="El RENCA es obligatorio para postular a fondos. Regístralo en ✏️ Editar." />
              );
              /* Solo si además falta el RENCA. La vigencia sirve para PEDIR el
                 RENCA; con el RENCA sacado ya cumplió, y esta alerta mandaba a
                 SUNARP a sacar un papel que no hacía falta —a una empresa que
                 podía postular ese mismo día—. */
              if (!ent.renca && vigenciaVencida(ent.vigencia_poder_fecha)) al.push(
                <Alerta key="vig" tono="ambar"
                  titulo={`📜 Sin RENCA y con la vigencia vencida el ${fmtVence(ent.vigencia_poder_fecha)}`}
                  detalle="Son dos trámites en fila: la vigencia se saca en SUNARP y con ella se pide el RENCA. Sin RENCA no se puede postular a ningún fondo." />
              );
              return al.length ? <>{al}</> : null;
            })()}

            {(() => {
            const pintarFila = ([lbl, key]: [string, string, string?]) =>
              ent[key] != null && ent[key] !== "" ? (
                <div className="ficha-row" key={key}>
                  <span className="fk">{lbl}</span>
                  <span className="fv" style={
                    // Estado y condición SUNAT: mismo código de color que su web
                    // (fondo verde si está sano, rojo si no)
                    key === "estado_sunat" || key === "condicion_sunat"
                      ? {
                          color: sunatOk(key, ent[key]) ? "var(--green)" : "var(--red)",
                          background: sunatOk(key, ent[key]) ? "rgba(46,204,113,.10)" : "rgba(255,77,94,.10)",
                          padding: "1px 8px", borderRadius: 6, fontWeight: 600,
                        }
                      // La suspensión de 4ta caduca cada 31 de diciembre
                      : key === "suspension_4ta_anio"
                        ? Number(ent[key]) >= new Date().getFullYear()
                          ? { color: "var(--green)", background: "rgba(46,204,113,.10)", padding: "1px 8px", borderRadius: 6, fontWeight: 600 }
                          : { color: "var(--red)", background: "rgba(255,77,94,.10)", padding: "1px 8px", borderRadius: 6, fontWeight: 600 }
                      : key === "dni_vencimiento" && new Date(ent[key]) < new Date() ? { color: "var(--red)", fontWeight: 700 }
                      /* Vencida en rojo SOLO si falta el RENCA: ahí es el
                         trámite que bloquea. Con el RENCA en mano no estorba,
                         y el rojo mandaría a resolver algo que no lo necesita. */
                      : key === "vigencia_poder_fecha" && vigenciaVencida(ent[key]) && !ent.renca
                        ? { color: "var(--red)", fontWeight: 700 }
                      : CAMPOS_DINERO.includes(key) ? { color: "var(--teal)", fontWeight: 700 } : undefined
                  }>
                    {/* El rol desplegable se queda fuera: ya es un botón (abre
                        y cierra), y dos botones encimados no obedecen a nadie. */}
                    {key === "rol" && String(ent[key]).split(",").length > 3 ? (
                      <details style={{ display: "inline" }}>
                        <summary style={{ cursor: "pointer", listStyle: "none" }}>
                          {String(ent[key]).split(",").slice(0, 3).map(s => s.trim()).join(", ")}
                          <i style={{ color: "var(--dim)" }}> … +{String(ent[key]).split(",").length - 3} ver más</i>
                        </summary>
                        {String(ent[key]).split(",").slice(3).map(s => s.trim()).join(", ")}
                      </details>
                    ) : (
                      <Copiar valor={crudo(ent[key])} etiqueta={lbl.toLowerCase()}>
                        {verFicha(key, ent[key], ent)}
                      </Copiar>
                    )}
                  </span>
                </div>
              ) : null;

            // Los botones viven en el bloque del dato al que pertenecen:
            // verificar/ficha con SUNAT, y los PDF con sus documentos.
            const lnk = { fontSize: 11.5, padding: "5px 10px" };
            const rucPer = params.tipo === "persona" ? rucDePersona(ent.ruc_dni) : null;
            const extras: Record<string, any> = params.tipo === "persona" ? {
              [DNI_PERSONA]: (
                <>
                  {ent.ruc_dni && <BotonVerificarDni personaId={params.id} />}
                  {ent.dni_url && <a href={ent.dni_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={lnk}>🪪 DNI ↗</a>}
                  {ent.firma_url && <a href={ent.firma_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={lnk}>✍️ Firma ↗</a>}
                </>
              ),
              [SUNAT_PERSONA]: rucPer && (
                <>
                  <span style={{ color: "var(--dim)", fontSize: 11.5, alignSelf: "center" }}>
                    RUC calculado: <b style={{ color: "var(--text)" }}>{rucPer}</b>
                  </span>
                  <BotonRucPersona personaId={params.id} />
                  <BotonFichaSunat numero={ent.ruc_dni} tipo="DNI" url={urlSunat} />
                  {ent.suspension_4ta_url && (
                    <a href={ent.suspension_4ta_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost" style={lnk}>🧾 Constancia 4ta ↗</a>
                  )}
                  {/* Cuánto lleva del tope de 4ta con nosotros este año */}
                  {acum4ta > 0 && (() => {
                    const e = estado4ta(acum4ta, new Date().getFullYear());
                    const col = e.supero ? "var(--red)" : e.cerca ? "var(--yellow)" : "var(--green)";
                    return (
                      <span style={{ width: "100%", marginTop: 2 }}>
                        <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                          <span style={{ color: "var(--dim)" }}>Girado {new Date().getFullYear()}:</span>
                          <b style={{ color: col }}>{money(acum4ta)}</b>
                          <span style={{ color: "var(--dim)" }}>de {money(e.tope)} · {e.pct}%</span>
                        </span>
                        <span style={{ display: "block", height: 4, background: "var(--bg)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                          <span style={{ display: "block", width: `${Math.min(100, e.pct)}%`, height: "100%", background: col }} />
                        </span>
                      </span>
                    );
                  })()}
                </>
              ),
              [DOCS_PERSONA]: (ent.carpeta_drive_url || ent.cv_url) && (
                <>
                  {ent.carpeta_drive_url && <a href={ent.carpeta_drive_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ ...lnk, background: "#1a73e8" }}>📂 Drive</a>}
                  {ent.cv_url && <a href={ent.cv_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={lnk}>📋 CV ↗</a>}
                </>
              ),
            } : params.tipo !== "empresa" ? {} : {
              [SUNAT_EMPRESA]: ent.ruc && (
                <>
                  <BotonVerificarRuc empresaId={params.id} />
                  <BotonFichaSunat numero={ent.ruc} url={urlSunat} />
                </>
              ),
              [DOCS_EMPRESA]: (
                <>
                  {ent.carpeta_drive_url && <a href={ent.carpeta_drive_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ ...lnk, background: "#1a73e8" }}>📂 Drive</a>}
                  {ent.renca_url && <a href={ent.renca_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={lnk}>🎬 RENCA ↗</a>}
                  {ent.vigencia_poder_url && <a href={ent.vigencia_poder_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={lnk}>📜 Vigencia ↗</a>}
                  {/* Todo lo que pide el formulario, junto: la empresa y sus
                      responsables. Vive aquí, con los papeles, porque es lo
                      mismo que se va a buscar cuando toque postular. */}
                  <HojaPostulacion empresa={ent} miembros={miembrosHoja}
                    trabasEmp={trabasEmp} libre={empLibre}
                    partesReserva={partesReserva} reserva={reserva} />
                </>
              ),
            };

            const sueltos = conf.campos.filter(c => !c[2]);
            /* Hay grupos que solo traen botones y ningún campo (ej. 📎
               Documentos de una persona): también deben pintarse. */
            const gruposF = [...new Set([
              ...conf.campos.map(c => c[2]).filter(Boolean),
              ...Object.keys(extras),
            ])] as string[];
            return (
              <>
                {sueltos.map(pintarFila)}
                {gruposF.map(g => {
                  const filas = conf.campos.filter(c => c[2] === g && ent[c[1]] != null && ent[c[1]] !== "");
                  const btns = extras[g];
                  if (!filas.length && !btns) return null;
                  const azul = GRUPO_TONO[g] === "azul";
                  const c1 = azul ? "59,130,246" : "244,180,0";
                  return (
                    <div key={g} style={{ marginTop: 10, padding: "6px 10px 8px", borderRadius: 10, border: `1px solid rgba(${c1},.25)`, background: `rgba(${c1},.04)` }}>
                      <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: azul ? "var(--blue)" : "var(--yellow)", fontWeight: 700, marginBottom: 2 }}>
                        {g.split("—")[0].trim()}
                      </div>
                      {filas.map(pintarFila)}
                      {btns && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{btns}</div>
                      )}
                    </div>
                  );
                })}
              </>
            );
            })()}
            {ent.descripcion && <p style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5, marginTop: 10 }}>{ent.descripcion}</p>}
            {params.tipo === "postulacion" && ent.feedback_jurado && (
              ent.feedback_jurado.length > 220 ? (
                <details className="jurado-box">
                  <summary>
                    <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b>
                    <span className="jx"><br />{ent.feedback_jurado.slice(0, ent.feedback_jurado.lastIndexOf(" ", 200))}… <i>ver más</i></span>
                  </summary>
                  <div style={{ marginTop: 6 }}>{ent.feedback_jurado}</div>
                </details>
              ) : (
                <div className="jurado-box">
                  <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b><br />
                  {ent.feedback_jurado}
                </div>
              )
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Mantenimiento tipo={params.tipo} id={params.id} valores={ent} />
              {/* Los de empresa (verificar / ficha SUNAT) van en el bloque 🏛 SUNAT */}
              {/* Verificar DNI vive ahora en el bloque 🪪 Identidad */}
            </div>
          </div>

          {params.tipo === "proyecto" && postusProy.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🎯 Postulaciones y fondos · {postusProy.length}</h4>
              {postusProy.map((p: any) => (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                  {/* línea 1: el concurso */}
                  <Link href={`/entidad/postulacion/${p.id}`}
                    style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, display: "block", lineHeight: 1.4 }}>
                    {ICONO_ESTADO[p.estado] || "🎯"} {p.conv?.nombre || p.codigo || "Postulación"} →
                  </Link>
                  {/* línea 2: año + estado */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>}
                    <span className="badge" style={{
                      color: p.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c",
                    }}>{(p.estado || "").replace(/_/g, " ")}</span>
                  </div>
                  {/* la ejecución, en su caja verde */}
                  {p.estado === "ganadora" && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 9, borderLeft: "3px solid var(--green)", fontSize: 11.5, color: "var(--muted)" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {p.codigo_acta && <span style={{ color: "var(--green)", fontWeight: 700 }}>{p.codigo_acta}</span>}
                        {p.monto_adjudicado && (
                          <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                            S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
                          </span>
                        )}
                        {p.fecha_firma_acta && <span>🖋 {verFicha("f", p.fecha_firma_acta)}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
                        {(p.fecha_prorroga || p.fecha_limite_rendicion) && (
                          <span style={{ color: "var(--yellow)" }}>
                            🧾 rinde: {verFicha("f", p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}
                          </span>
                        )}
                        {p.acta_url && (
                          <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta</a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {params.tipo === "proyecto" && (
            <>
              {/* Antes que el cliente: la directora es con quien nace el
                  proyecto; el cliente solo existe si es un encargo. */}
              <EquipoProyecto proyectoId={params.id} equipo={equipoProy} personas={personasCat} />
              <ClienteProyecto proyectoId={params.id} cliente={clienteDe} personas={personasCat} />
            </>
          )}

          {params.tipo === "convocatoria" && (
            <Postulaciones convocatoriaId={params.id} postulaciones={postus}
              proyectos={proyectosCat} empresas={empresasCat} />
          )}

          {params.tipo === "postulacion" && (
            <div style={{ marginTop: 14 }}>
              <TabsPanel
                /* Cuenta los dos: el del proyecto más el de esta postulación.
                   Si contara solo el de abajo, diría «Equipo · 4» de una
                   película que tiene nueve personas — y al quitar a la
                   directora de la postulación el número bajaría, como si se
                   hubiera ido. */
                labels={["🧭 Contexto", `👥 Equipo · ${equipoProy.length + equipoPost.length}`, "📎 Materiales"]}
                paneles={[
                  <div className="linked" key="ctx">
                    {postCtx?.proy && (
                      <div className="eq-row"><span className="cargo">Proyecto</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <Link href={`/entidad/proyecto/${postCtx.proy.id}`} style={{ color: "var(--text)" }}>📁 {postCtx.proy.nombre} →</Link>
                        </span></div>
                    )}
                    <EmpresaPostulacion postulacionId={params.id}
                      convocatoriaId={postCtx?.conv?.id || ""}
                      empresa={postCtx?.emp} empresas={empresasCat} />
                    {postCtx?.conv && (
                      <div className="eq-row"><span className="cargo">Concurso</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <Link href={`/entidad/convocatoria/${postCtx.conv.id}`} style={{ color: "var(--text)" }}>📜 {postCtx.conv.codigo} · {postCtx.conv.nombre} →</Link>
                        </span></div>
                    )}
                    {postCtx?.conv?.monto_adjudicado && (
                      <div className="eq-row"><span className="cargo">En juego</span>
                        <span style={{ flex: 1, textAlign: "right", color: "var(--teal)", fontWeight: 700 }}>
                          S/ {parseFloat(postCtx.conv.monto_adjudicado).toLocaleString("es-PE")}
                        </span></div>
                    )}
                    {postCtx?.conv?.bases_url && (
                      <div className="eq-row"><span className="cargo">Bases</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <a href={postCtx.conv.bases_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--violet)", fontWeight: 600 }}>📖 Bases del concurso ↗</a>
                        </span></div>
                    )}
                  </div>,
                  <div key="eq">
                    {/* El equipo del PROYECTO va primero y no se edita aquí:
                        la directora nace con el proyecto y la postulación la
                        hereda. Repetirla abajo sería tenerla en dos sitios —y
                        el día que cambie, cambiaría en uno solo.
                        Abajo, el equipo de ESTA postulación: quienes se suman
                        para este concurso en concreto. */}
                    {equipoProy.length > 0 && (
                      <div className="linked" style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
                            🎬 Equipo del proyecto · {equipoProy.length}
                          </h4>
                          <span style={{ flex: 1 }} />
                          {postCtx?.proy && (
                            <Link href={`/entidad/proyecto/${(postCtx.proy as any).id}`}
                              style={{ color: "var(--accent)", fontSize: 11.5 }}>editarlo en el proyecto →</Link>
                          )}
                        </div>
                        <p style={{ color: "var(--dim)", fontSize: 11, marginTop: 0, marginBottom: 8 }}>
                          Viene con el proyecto: no hace falta repetirlo aquí.
                        </p>
                        {equipoProy.map((m: any) => (
                          <div className="eq-row" key={m.id} style={{ alignItems: "center" }}>
                            <span className="cargo">{m.cargo}</span>
                            <span style={{ flex: 1, textAlign: "right" }}>
                              <Link href={`/entidad/persona/${m.persona?.id}`} style={{ color: "var(--text)" }}>
                                {m.persona?.alias || m.persona?.nombre} →
                              </Link>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <EquipoPostulacion postulacionId={params.id} equipo={equipoPost} personas={personasCat} />
                  </div>,
                  <Materiales key="mat" postulacionId={params.id} materiales={ent.materiales || {}} />,
                ]}
              />
            </div>
          )}

          {params.tipo === "empresa" && (
            <Miembros empresaId={params.id} miembros={miembros} personas={personasCat} />
          )}

          {params.tipo === "equipamiento" && (
            <PrestamoEquipo equipoId={params.id} prestamos={prestamos}
              personas={personasCat} proyectos={proyectosPrest} />
          )}

          {params.tipo === "persona" && cargosDe.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🏢 Cargos en empresas</h4>
              {cargosDe.map((c: any) => (
                <div key={c.id} className="eq-row" style={{ opacity: c.estado === "activo" ? 1 : .55 }}>
                  <span className="cargo">{c.cargo}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/empresa/${c.empresa?.id}`} style={{ color: "var(--text)" }}>
                      {c.empresa?.nombre} →
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}

          {params.tipo === "persona" && equiposEnMano.length > 0 && (
            <div className="linked" style={{ marginTop: 14, borderLeft: "3px solid var(--yellow)" }}>
              <h4>🎥 Equipos en su poder · {equiposEnMano.length}</h4>
              {equiposEnMano.map((r: any) => (
                <div key={r.id} className="eq-row" style={{ alignItems: "center" }}>
                  {r.equipo?.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{r.equipo.folio}</span>}
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/equipamiento/${r.equipo?.id}`} style={{ color: "var(--text)" }}>
                      {r.equipo?.nombre} →
                    </Link>
                    <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>
                      desde {new Date(r.desde + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {params.tipo === "persona" && clienteEnProy.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🤝 Cliente de proyectos · {clienteEnProy.length}</h4>
              {clienteEnProy.map((p: any) => (
                <div key={p.id} className="eq-row" style={{ alignItems: "center" }}>
                  {p.tipo && <span className="cargo">{p.tipo.replace(/_/g, " ")}</span>}
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/proyecto/${p.id}`} style={{ color: "var(--text)" }}>📁 {p.nombre} →</Link>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Un CV por cada rol con el que postula: el fondo lo exige así */}
          {params.tipo === "persona" && (
            <CVs personaId={params.id} cvs={cvsDe}
              especialidades={String(ent.rol || "").split(",").map(s => s.trim()).filter(Boolean)} />
          )}

          {(params.tipo === "empresa" || params.tipo === "persona") && (
            <Credenciales dueno={params.tipo as "empresa" | "persona"} duenoId={params.id} credenciales={creds} />
          )}

          {params.tipo === "persona" && (ent.usuario_id || ent.tipo === "personal") && (
            <CuentaAcceso personaId={params.id} cuenta={cuentaDe} libres={cuentasLibres} />
          )}
        </aside>

        {/* ===== COLUMNA DERECHA: la vida ===== */}
        <main>
          {/* Palmarés: lo primero que cuenta qué ha logrado esta persona */}
          {params.tipo === "persona" && postDe.length > 0 && (() => {
            const ganadas = postDe.filter((r: any) => r.post?.estado === "ganadora");
            const finalistas = postDe.filter((r: any) =>
              ["finalista", "finalista_no_ganadora"].includes(r.post?.estado));
            const resto = postDe.filter((r: any) => r.post?.estado !== "ganadora");
            const fila = (r: any) => {
              const p = r.post || {};
              // El resto del equipo: con quiénes lo sacó adelante
              const otros = (p.equipo || []).filter((e: any) => e.persona?.id !== params.id);
              return (
                <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <Link href={`/entidad/postulacion/${p.id}`}
                      style={{ color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>
                      {ICONO_ESTADO[p.estado] || "🎯"} {p.proy?.nombre || p.codigo} →
                    </Link>
                    <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.10)", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>
                      {r.cargo || "—"}
                    </span>
                    {p.conv?.anio && (
                      <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>
                    )}
                    {p.estado === "ganadora" && p.monto_adjudicado && (
                      <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", fontWeight: 700 }}>
                        S/ {Number(p.monto_adjudicado).toLocaleString("es-PE")}
                      </span>
                    )}
                    {p.estado !== "ganadora" && (
                      <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{(p.estado || "").replace(/_/g, " ")}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    {p.proy?.id && (
                      <Link href={`/entidad/proyecto/${p.proy.id}`}
                        style={{ color: "var(--dim)", fontSize: 11, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                        📁 ver proyecto →
                      </Link>
                    )}
                  </div>
                  {/* Con qué empresa y a qué concurso */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
                    {p.emp?.id && (
                      <Link href={`/entidad/empresa/${p.emp.id}`} className="badge"
                        style={{ color: "var(--muted)", background: "#1c1c2c" }}>🏢 {p.emp.nombre}</Link>
                    )}
                    {p.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: 11 }}>· {p.conv.nombre}</span>}
                  </div>
                  {/* Con quiénes */}
                  {otros.length > 0 && (
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>👥</span>
                      {otros.map((e: any, i: number) => (
                        <Link key={i} href={`/entidad/persona/${e.persona?.id}`} className="badge" title={e.cargo || ""}
                          style={{ color: "var(--violet)", background: "rgba(167,139,250,.10)", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                          {e.persona?.alias || e.persona?.nombre}
                          {e.cargo && <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {e.cargo}</span>}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            };
            return (
              <>
                {ganadas.length > 0 && (
                  <div className="card" style={{ marginBottom: 16, borderColor: "rgba(46,204,113,.3)" }}>
                    <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Palmarés · {ganadas.length}</div>
                    <div style={{ color: "var(--muted)", fontSize: 11.5 }}>
                      {ganadas.length} estímulo{ganadas.length === 1 ? "" : "s"} ganado{ganadas.length === 1 ? "" : "s"}
                      {finalistas.length > 0 && ` · ${finalistas.length} finalista${finalistas.length === 1 ? "" : "s"}`}
                      {` · ${postDe.length} postulaciones en total`}
                    </div>
                    {ganadas.map(fila)}
                  </div>
                )}
                {resto.length > 0 && (
                  <div className="card" style={{ marginBottom: 16 }}>
                    <div className="panel-h">🎯 En postulaciones · {resto.length}</div>
                    {resto.map(fila)}
                  </div>
                )}
              </>
            );
          })()}

          {/* Su trabajo dentro del sistema: solo para quien tiene cuenta */}
          {pulso && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="panel-h" style={{ margin: 0 }}>📊 Pulso en CrewHub+</div>
                <span style={{ flex: 1 }} />
                <Link href="/pulso" style={{ color: "var(--dim)", fontSize: 11, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                  ver el del equipo →
                </Link>
              </div>
              {/* Cinco cifras en una sola línea: se leen de un vistazo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10 }}>
                {([
                  [pulso.cerr, "cerrados", "var(--green)", "Casos que llevó hasta resuelta"],
                  [pulso.ab, "a su cargo", pulso.ab ? "var(--yellow)" : "var(--dim)", "Casos vivos donde es responsable"],
                  [pulso.venc, "vencidos", pulso.venc ? "var(--red)" : "var(--green)", "A su cargo y con la fecha límite pasada"],
                  [pulso.creo, "creados", "var(--violet)", "Casos que abrió"],
                  [pulso.coments, "comentarios", "var(--blue)", "Comentarios escritos"],
                ] as [number, string, string, string][]).map(([n, l, c, t], i) => (
                  <div key={i} title={t}
                    style={{ background: "var(--bg)", borderRadius: 10, padding: "9px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: c, lineHeight: 1.2 }}>{n}</div>
                    <div style={{ fontSize: 9.5, color: "var(--dim)", textTransform: "uppercase", letterSpacing: .6 }}>{l}</div>
                  </div>
                ))}
              </div>
              {pulso.ultimo && (
                <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "10px 0 0" }}>
                  Última actividad: {fecha(pulso.ultimo)}
                </p>
              )}
            </div>
          )}

          {/* Palmarés: lo primero que cuenta qué ha logrado esta empresa */}
          {params.tipo === "empresa" && postusEmp.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="panel-h">🎯 Postuló con · {postusEmp.length}</div>
              {postusEmp.map((p: any) => (
                <div key={p.id} style={{ borderTop: "1px solid var(--border)", padding: "9px 0" }}>
                  <Link href={`/entidad/postulacion/${p.id}`}
                    style={{ color: "var(--text)", fontWeight: 600, fontSize: 13.5, display: "block", lineHeight: 1.4 }}>
                    {ICONO_ESTADO[p.estado] || "🎯"} {p.proy?.nombre || p.codigo || "Postulación"} →
                  </Link>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                    {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>}
                    <span className="badge" style={{
                      color: p.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c",
                    }}>{(p.estado || "").replace(/_/g, " ")}</span>
                    {p.estado === "ganadora" && p.monto_adjudicado && (
                      <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", fontWeight: 700 }}>
                        S/ {Number(p.monto_adjudicado).toLocaleString("es-PE")}
                      </span>
                    )}
                    {p.conv?.nombre && (
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>· {p.conv.nombre}</span>
                    )}
                    {p.proy?.id && (
                      <Link href={`/entidad/proyecto/${p.proy.id}`}
                        style={{ color: "var(--dim)", fontSize: 11, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                        📁 ver proyecto →
                      </Link>
                    )}
                  </div>
                  {/* Quiénes lo hicieron posible */}
                  {(p.equipo || []).length > 0 && (
                    <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>👥</span>
                      {p.equipo.map((e: any, i: number) => (
                        <Link key={i} href={`/entidad/persona/${e.persona?.id}`} className="badge"
                          title={e.cargo || ""}
                          style={{ color: "var(--violet)", background: "rgba(167,139,250,.10)", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                          {e.persona?.alias || e.persona?.nombre}
                          {e.cargo && <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {e.cargo}</span>}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {(() => {
            const vida = (
              <>
                <div className="h4" style={{ marginTop: 0 }}>
                  🔥 Activas · {activas.length}
                </div>
                {activas.map(cardPub)}
                {/* Vacío aquí es buena señal: conviene que se lea así */}
                {!activas.length && (
                  <div className="empty" style={{ padding: "18px 0" }}>
                    Sin casos abiertos sobre {nombre} — todo en orden.
                  </div>
                )}

                {cerradas.length > 0 && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                      ✅ Resueltas y archivadas · {cerradas.length}
                    </summary>
                    <div style={{ marginTop: 10 }}>{cerradas.map(cardPub)}</div>
                  </details>
                )}

                {/* Abierto por defecto: Activas suele estar vacío (buena señal)
                    y Resueltas va cerrado, así que el historial es lo vivo aquí. */}
                {eventosVis.length > 0 && (
                  <details open style={{ marginTop: 16 }}>
                    <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                      🕐 Historial de {nombre} · {eventosVis.length} eventos
                    </summary>
                    {/* El mismo componente que usa el historial acumulado. Esta
                        ficha tenía su copia inline —idéntica palabra por
                        palabra— aunque el componente ya existía y su comentario
                        pide justo lo contrario. Dos copias que hoy dicen lo
                        mismo son dos copias que mañana no. */}
                    <div className="tl" style={{ marginTop: 12 }}>
                      {eventosVis.map((e: any, i: number) => (
                        <EventoHistorial key={i} e={e} hora={fecha(e.creado_en)} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            );

            if (params.tipo === "postulacion") {
              const enJuego = ["en_preparacion", "enviada", "finalista"].includes(ent.estado);
              const hitosConc = (postCtx?.conv?.hitos || [])
                .filter((h: any) => h.clase === "hito_externo" && h.estado !== "cancelada")
                .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1));
              // Ganadora: su ruta ya no es el concurso, es la ejecución
              const rutaEjec = ent.estado === "ganadora" ? [
                ent.fecha_firma_acta && { fecha: ent.fecha_firma_acta, titulo: "Firma del acta de compromiso", icono: "🖋", color: "var(--green)" },
                ent.fecha_limite_rendicion && { fecha: ent.fecha_limite_rendicion, titulo: `Límite de rendición${ent.fecha_prorroga ? " (original)" : ""}`, icono: "🧾", color: ent.fecha_prorroga ? "#4a4a5e" : "var(--yellow)" },
                ent.fecha_prorroga && { fecha: ent.fecha_prorroga, titulo: "Límite de rendición (prórroga)", icono: "⏳", color: "var(--yellow)" },
                /* El final del camino. Sin este hito la ruta terminaba en un
                   plazo, no en un hecho — y el plazo no dice si se entregó. */
                ent.fecha_rendicion_real && { fecha: ent.fecha_rendicion_real, titulo: "Rendición entregada — fondo cerrado", icono: "✅", color: "var(--green)" },
              ].filter(Boolean) as any[] : [];
              return (
                <>
                  {enJuego && hitosConc.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <div className="panel-h">📅 Línea de tiempo del concurso — la carrera de esta postulación</div>
                      <LineaTiempo eventos={hitosConc.map((h: any) => ({
                        fecha: h.fecha_inicio, titulo: h.nombre, icono: "🏛",
                        color: h.estado === "finalizada" ? "#4a4a5e" : "var(--violet)",
                      }))} />
                    </div>
                  )}
                  {rutaEjec.length > 0 && (
                    <div className="card" style={{ marginBottom: 16, borderColor: "rgba(46,204,113,.3)" }}>
                      <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Camino de ejecución — del acta a la rendición</div>
                      <LineaTiempo eventos={rutaEjec} />
                    </div>
                  )}
                  {ent.estado === "ganadora" && !rutaEjec.length && (
                    <Alerta tono="ambar"
                      titulo="🏆 Ganadora sin fechas de ejecución"
                      detalle="Registra acta y rendición en ✏️ Editar." />
                  )}
                  {vida}
                </>
              );
            }
            if (params.tipo !== "proyecto" && params.tipo !== "convocatoria") return vida;

            const vivasCrono = cronoActs.filter((a: any) => a.estado !== "cancelada");
            const proxima = vivasCrono
              .filter((a: any) => a.estado === "planificada")
              .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1))[0];
            const etiquetaCrono = `📅 Cronograma · ${vivasCrono.length}` +
              (proxima ? ` · próx. ${new Date(proxima.fecha_inicio + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : "");

            return (
              <TabsPanel
                labels={[`🔥 Actividad viva · ${activas.length}`, etiquetaCrono]}
                paneles={[
                  vida,
                  <CronogramaProyecto key="crono" dueno={params.tipo as "proyecto" | "convocatoria"}
                    duenoId={params.id} actividades={cronoActs} perfiles={perfilesCat}
                    plantillas={plantillas} tipoProyecto={ent.tipo || ""} />,
                ]}
              />
            );
          })()}
        </main>
      </div>
    </div>
  );
}