import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Mantenimiento } from "@/components/EntidadForm";
import { SUNAT_EMPRESA, DOCS_EMPRESA, DNI_PERSONA, DOCS_PERSONA, SUNAT_PERSONA, GRUPO_TONO, completitud, REGIONES, COLOR_ENTIDAD, TIPO_COLOR } from "@/lib/entidades";
import { rucDePersona } from "@/lib/ruc";
import { estado4ta, money } from "@/lib/cuarta";
import { diasDeVigencia, fmtVence, vigenciaVencida } from "@/lib/vigencia";
import Miembros from "@/components/Miembros";
import Credenciales from "@/components/Credenciales";
import ClienteProyecto from "@/components/ClienteProyecto";
import EquipoProyecto from "@/components/EquipoProyecto";
import ActoresProyecto from "@/components/ActoresProyecto";
import Pasos from "@/components/Pasos";
import Postulaciones from "@/components/Postulaciones";
import EmpresaPostulacion from "@/components/EmpresaPostulacion";
import EquipoPostulacion from "@/components/EquipoPostulacion";
import PrestamoEquipo from "@/components/PrestamoEquipo";
import CuentaAcceso from "@/components/CuentaAcceso";
import Expediente from "@/components/Expediente";
import { BotonVerificarRuc, BotonVerificarDni, BotonRucPersona } from "@/components/VerificarSunat";
import Alerta from "@/components/Alerta";
import { urlPlataforma, conPlataforma, PLAT } from "@/lib/plataformas";
import { hoyLima } from "@/lib/fechas";
import {
  rendicionVencida, plazoRendicion, compromisoDe, empresaLibre,
  trabasEmpresa, trabasMiembro, dudasMiembro, SIN_COMPROMISO,
  reservaEmpresa, reservaMiembro, reservaCompleta, EN_JUEGO,
} from "@/lib/fondos";
import HojaPostulacion from "@/components/HojaPostulacion";
import { sinBot, mapaAlias, conAlias, esDirectorObra } from "@/lib/personas";
import { TXT } from "@/lib/texto";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import Copiar from "@/components/Copiar";
import EventoHistorial from "@/components/EventoHistorial";
import EventoGrupo from "@/components/EventoGrupo";
import PersonaChip from "@/components/PersonaChip";
import { palmaresDePersona } from "@/lib/palmares";
import EmpresaChip from "@/components/EmpresaChip";
import HistorialFicha from "@/components/HistorialFicha";
import { resolverNombres, nombresDeEventos, conNombresEventos } from "@/lib/nombres";
import { agruparEventos } from "@/lib/agrupar";
import { claseEstado, rotuloEstado, esAviso, avisoVencido } from "@/lib/estados";
import { contarHijos, CERRADOS, type Familia } from "@/lib/familia";
import { icoTipo } from "@/lib/tipos";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import AvisoMini from "@/components/AvisoMini";
import TextoCorto from "@/components/TextoCorto";
import CVs from "@/components/CVs";
import Repositorio from "@/components/Repositorio";
import MuroProyecto from "@/components/MuroProyecto";
import DestacadosMuro from "@/components/DestacadosMuro";
import HiloPostulacionBtn from "@/components/HiloPostulacionBtn";
import SelloResultado from "@/components/SelloResultado";
import { resultadoPostulacion, resultadoConvocatoria, colorEstadoPost } from "@/lib/resultados";
import { ordenarEquipo, rangoRol } from "@/lib/rolesEquipo";
import { DIAS_CV, icoObjeto } from "@/lib/objetos";
import FotoPersona from "@/components/FotoPersona";
import PortadaEntidad from "@/components/PortadaEntidad";
import Miniatura from "@/components/Miniatura";
import { previewCandidates } from "@/lib/drive";
import Materiales from "@/components/Materiales";
import LineaTiempo from "@/components/LineaTiempo";
import CronogramaProyecto from "@/components/CronogramaProyecto";
import CronogramaPostulacion from "@/components/CronogramaPostulacion";
import Presupuesto from "@/components/Presupuesto";
import CredencialesRef from "@/components/CredencialesRef";
import ContactosPostulacion from "@/components/ContactosPostulacion";
import TablaSimple from "@/components/TablaSimple";
import EquipoPorcentajes from "@/components/EquipoPorcentajes";
import Precontratos from "@/components/Precontratos";
import { etapasDe } from "@/lib/etapas";
import { rubrosDe, topeEstimuloDe } from "@/lib/rubros";
import { TABLAS_EXP, materialTablaDe, plantillaConExtras, esVideojuego } from "@/lib/tablas-expediente";
import TabsPanel from "@/components/TabsPanel";
import Avatar from "@/components/Avatar";
import Plegable from "@/components/Plegable";
import CasosLista, { type CasoMeta } from "@/components/CasosLista";
import MuroAvisos from "@/components/MuroAvisos";
import VistaRapida from "@/components/VistaRapida";
import FilasDatos, { camposSecundarios } from "@/components/MasDatos";
import LinkVerificable from "@/components/LinkVerificable";
import Completitud from "@/components/Completitud";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ICO_ENT, nombreDe, grafiasDe, TABLA_DE, tipoCanonico } from "@/lib/secciones";
import { estadoKit, resumenKit, type PiezaKit } from "@/lib/kits";
import { ordenarActores, rotuloActores, leerActor, personaDe } from "@/lib/actores";
import { metaEstado, colorEstadoEq, txtEstadoEq, selloEquipo } from "@/lib/estadosEquipo";
import PiezasKit from "@/components/PiezasKit";
import Ensamblado from "@/components/Ensamblado";
import ComboDelEquipo from "@/components/ComboDelEquipo";

/* PERFIL DE ENTIDAD VIVA — dos columnas:
   izquierda = el carné (datos estáticos, relaciones, credenciales)
   derecha  = la vida (publicaciones activas, cerradas, historial) */

/* El tercer elemento agrupa la fila en un bloque de color, igual que en el
   formulario: la ficha se lee con la misma estructura con la que se edita. */
const CONF: Record<string, { tabla: string; icono: string; campos: [string, string, string?][] }> = {
  proyecto: { tabla: "proyectos", icono: "📁", campos: [["Folio", "folio"], ["Tipo", "tipo"], ["Modalidad", "modalidad"], ["Relación", "relacion"], ["Etapa", "etapa"], ["Actividad", "estado_actividad"], ["RENCA", "renca"]] },
  empresa: { tabla: "empresas", icono: "🏢", campos: [
    ["Código", "codigo"], ["Razón social", "razon_social"], ["Relación", "relacion"],
    ["Región", "region"], ["Estado interno", "estado"], ["Constitución", "fecha_constitucion"],
    ["RUC", "ruc", SUNAT_EMPRESA], ["Domicilio fiscal", "domicilio_fiscal", SUNAT_EMPRESA],
    ["Estado SUNAT", "estado_sunat", SUNAT_EMPRESA], ["Condición SUNAT", "condicion_sunat", SUNAT_EMPRESA],
    ["Verificado", "fecha_verificacion_sunat", SUNAT_EMPRESA],
    ["N° partida electrónica", "partida_electronica", DOCS_EMPRESA],
    ["RENCA", "renca", DOCS_EMPRESA], ["Vigencia de poder vence", "vigencia_poder_fecha", DOCS_EMPRESA],
    /* El domicilio fiscal desglosado (departamento/provincia/distrito) es info
       censal manual: baja al bloque «Ver más», como el domicilio del DNI de una
       persona. No se lista aquí ni va en el panel SUNAT (que es lo automático). */
  ] },
  persona: { tabla: "personas", icono: "👤", campos: [
    ["Alias", "alias"], ["Tipo", "tipo"], ["Equipo", "equipo"], ["Estado", "estado"],
    ["Comunero/a", "es_comunero"], ["Rol", "rol"],
    // El domicilio del DNI (dirección/departamento/provincia/distrito) NO se
    // lista aquí: es info censal secundaria y baja sola al bloque «Ver más».
    ["DNI", "ruc_dni", DNI_PERSONA], ["DNI vence", "dni_vencimiento", DNI_PERSONA],
    ["Verificado en RENIEC", "fecha_verificacion_reniec", DNI_PERSONA],
    // El nombre oficial, a la vista: si no coincide con el de arriba, el que
    // está mal es el nuestro — y las carpetas se arman con éste.
    ["Nombre en RENIEC", "nombre_reniec", DNI_PERSONA],
    ["Estado SUNAT", "estado_sunat", SUNAT_PERSONA], ["Condición SUNAT", "condicion_sunat", SUNAT_PERSONA],
    ["Verificado", "fecha_verificacion_sunat", SUNAT_PERSONA],
    ["Suspensión 4ta", "suspension_4ta_anio", SUNAT_PERSONA],
  ] },
  /* ⚠ Esta lista y la de `FORM_CONF` (lib/entidades) son DOS: una dice qué se
     escribe y la otra qué se lee. Añadir un campo solo al formulario lo deja
     guardándose sin que nadie pueda verlo —que es lo que pasó con
     `fecha_compra`, y antes con la propia columna en la base—. Al tocar una,
     mirar la otra. */
  equipamiento: { tabla: "equipamiento", icono: "🎥", campos: [["Folio", "folio"], ["Categoría", "categoria"], ["Subcategoría", "subcategoria"], ["Estado", "estado"], ["Valor (S/)", "valor_compra"], ["Fecha de compra", "fecha_compra"], ["Comprado en", "comprado_en"]] },
  /* El COMBO DE COMPRA. Hereda de la ficha genérica lo que necesita —carné,
     bitácora, historial y repositorio— y ahí es donde vive el comprobante:
     la boleta es UNA por compra, y pegarla en las seis fichas del combo DJI
     serían seis copias del mismo papel y ninguna la buena. */
  compra: { tabla: "compras", icono: "🧾", campos: [
    ["Código", "codigo"], ["Proveedor", "proveedor"], ["Fecha", "fecha"],
    ["Total", "total"], ["Moneda", "moneda"],
  ] },
  lugar: { tabla: "lugares", icono: "📍", campos: [] },
  postulacion: { tabla: "postulaciones", icono: "🎯", campos: [["Código", "codigo"], ["Código plataforma DAFO", "codigo_plataforma"], ["Código del acta", "codigo_acta"], ["Estado", "estado"], ["Lenguas originarias", "lenguas_originarias"], ["Puntaje jurado", "puntaje_jurado"], ["Monto adjudicado (S/)", "monto_adjudicado"], ["Firma del acta", "fecha_firma_acta"], ["Desembolso del estímulo", "fecha_desembolso"], ["Límite de rendición", "fecha_limite_rendicion"], ["Prórroga", "fecha_prorroga"], ["Rendición entregada", "fecha_rendicion_real"]] },
  convocatoria: { tabla: "convocatorias", icono: "📜", campos: [["Código", "codigo"], ["Institución", "institucion"], ["Año", "anio"], ["Estado", "estado"], ["Monto del estímulo (S/)", "monto_adjudicado"]] },
  etiqueta: { tabla: "etiquetas", icono: "🏷️", campos: [] },
};

/* El color por TIPO de entidad vive en lib/entidades (COLOR_ENTIDAD): lo
   comparten esta ficha y el buscador general para que sea el mismo azul de
   «persona» o naranja de «equipamiento» en todos lados. */

/* Grupos que bajan al bloque plegable «Ver más» (vacío por ahora: Documentos,
   Identidad y SUNAT quedan a la vista). Se conserva el mecanismo por si algún
   grupo conviene plegarlo más adelante. */
const GRUPOS_SECUNDARIOS = new Set<string>([]);

/* Campos pasivos por entidad: datos de referencia (códigos, folios, fechas de
   trámite, identificadores) que no son lo primero que se mira. Bajan al bloque
   plegable «Ver más» para que arriba queden los datos de trabajo —estado,
   etapa, montos, plazos— y sus alertas.
   Persona baja TODO su bloque base porque su ficha se consulta por el
   DNI/SUNAT y los papeles (bloques que quedan arriba), no por su alias. */
const CAMPOS_SECUNDARIOS: Record<string, string[]> = {
  persona: ["alias", "tipo", "equipo", "estado", "region", "es_comunero", "rol"],
  proyecto: ["folio", "modalidad", "renca"],
  // Como persona: todo su bloque base baja a «Ver más»; arriba quedan los
  // paneles de trabajo (SUNAT, Documentos) con sus verificaciones.
  empresa: ["codigo", "razon_social", "relacion", "region", "estado", "fecha_constitucion"],
  convocatoria: ["codigo"],
  postulacion: ["codigo", "codigo_plataforma", "codigo_acta", "lenguas_originarias", "fecha_firma_acta"],
  equipamiento: ["folio", "comprado_en"],
  compra: ["codigo", "moneda"],
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
const CAMPOS_DINERO = ["monto_adjudicado", "valor_compra", "total"];
const ICONO_ESTADO: Record<string, string> = {
  // postulaciones
  ganadora: "🏆", finalista: "⭐", finalista_no_ganadora: "🥈", enviada: "📨", no_seleccionada: "✖", retirada: "↩", en_preparacion: "🛠",
  // convocatorias (su ciclo de vida real)
  planificada: "📅", abierta: "📣", en_evaluacion: "⚖️", con_resultados: "🏆", finalizada: "🏁", cancelada: "🚫",
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
  /* La postulación se nombra aparte: su `campo` es el código («PO-040»), que
     en una pestaña no dice de qué película ni de qué año es. Y son justo las
     que se repiten —el mismo proyecto al mismo concurso tres años seguidos—,
     así que sin el año hay tres pestañas idénticas. */
  if (params.tipo === "postulacion") {
    const { data } = await supabase.from("postulaciones")
      .select("codigo,proy:proyectos(nombre),conv:convocatorias(codigo,anio)")
      .eq("id", params.id).maybeSingle();
    const d = data as any;
    if (!d) return { title: `${ICO_ENT.postulacion || "🎯"} Postulación` };
    const t = [`${d.codigo || d.conv?.codigo || "Postulación"} · ${d.proy?.nombre || ""}`.replace(/ · $/, ""),
               d.conv?.anio || null].filter(Boolean).join(" · ");
    return { title: `${ICO_ENT.postulacion || "🎯"} ${t}` };
  }
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

  const [{ data: vincs }, { data: eventos, count: nEventos }, urlSunat] = await Promise.all([
    supabase.from("publicacion_vinculos")
      .select("publicacion_id")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .limit(300),
    /* Las DOS grafías: la ruta dice «proyecto» pero el trigger de la bitácora
       escribe el nombre de la tabla, «proyectos». Preguntando solo por la
       singular, la creación de la entidad y todos sus cambios de estado, etapa,
       prioridad y responsable quedaban fuera —sin error y sin hueco visible—.
       Y `count` para poder decir cuántos hay de verdad: el número del rótulo
       venía de las filas traídas, así que un historial de 214 eventos se
       anunciaba como «30», que es justo el tope. */
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,actor_id,actor:perfiles(nombre)", { count: "exact" })
      .in("entidad_tipo", grafiasDe(params.tipo)).eq("entidad_id", params.id)
      .order("creado_en", { ascending: false }).limit(120),
    // El link de SUNAT sale del admin, no del código: si SUNAT lo cambia
    // —lo ha hecho— se corrige ahí sin esperar un deploy.
    urlPlataforma(PLAT.sunatConsultaRuc),
  ]);

  // Historial sin ruido: los cambios de estado_sunat/condicion_sunat ya
  // los resume el evento "Verificación SUNAT" del bot; se ocultan aquí.
  // Los actores salen con su alias (JohnO) en vez del nombre completo.
  const { data: aliasPers } = await supabase.from("personas").select("usuario_id,alias")
    .not("alias", "is", null).not("usuario_id", "is", null);
  const alias = mapaAlias(aliasPers);
  /* ── QUÉ PASÓ EN ESTE PROYECTO, no solo en su ficha ──
     Hasta aquí el historial contaba únicamente los eventos dirigidos al
     proyecto mismo. Pero abrir un caso de «A-roll», resolverlo, mover una
     actividad del cronograma o presentar una postulación SON cosas que pasaron
     en el proyecto; vivían cada una en su propia ficha y desde el proyecto no
     se veían. Es un cambio de criterio, no un arreglo: el historial deja de
     responder «qué le pasó a esta ficha» y responde «qué pasó aquí».

     Se pregunta por `entidad_id` sin filtrar el tipo: los uuid no se repiten
     entre tablas, así que un solo pedido trae los eventos de casos, actividades
     y postulaciones a la vez. En trozos, porque un proyecto con 200 casos haría
     una URL que el servidor corta.

     Los EQUIPOS no entran por esta vía a propósito: los eventos de una cámara
     son de la cámara, no de este proyecto —la misma cámara rueda en cinco—. Su
     salida a este rodaje se anota como evento del proyecto al entregarla. */
  let eventosHijos: any[] = [];
  let totalHijos = 0;
  /* Eventos de las «hijas» (actividades del cronograma y postulaciones). Se
     traen para proyecto, convocatoria y postulación —los tres dueños de un
     cronograma— para que el historial refleje TODO cambio del cronograma
     (crear, cambiar estado/responsable, cancelar), no solo lo que la app anota
     a mano contra el padre. Antes solo corría para proyecto: por eso en una
     convocatoria no salía la creación de un hito. */
  if (["proyecto", "convocatoria", "postulacion"].includes(params.tipo)) {
    const colDueno = `${params.tipo}_id`;
    const [ca, po] = await Promise.all([
      supabase.from("cronograma_actividades").select("id").eq(colDueno, params.id).limit(500),
      // Una postulación no tiene postulaciones hijas.
      params.tipo === "postulacion"
        ? Promise.resolve({ data: [] as any[] })
        : supabase.from("postulaciones").select("id").eq(colDueno, params.id).limit(200),
    ]);
    const ids = [...new Set([
      ...(vincs || []).map((v: any) => v.publicacion_id),
      ...(ca.data || []).map((x: any) => x.id),
      ...(po.data || []).map((x: any) => x.id),
    ].filter(Boolean))] as string[];

    const TROZO = 80;
    const trozos: string[][] = [];
    for (let i = 0; i < ids.length; i += TROZO) trozos.push(ids.slice(i, i + TROZO));
    const res = await Promise.all(trozos.map(t =>
      supabase.from("actividad")
        .select("tipo,detalle,creado_en,actor_id,entidad_tipo,entidad_id,actor:perfiles(nombre)", { count: "exact" })
        .in("entidad_id", t).order("creado_en", { ascending: false }).limit(120)));
    eventosHijos = res.flatMap(r => r.data || [])
      /* Los cambios del cronograma que la app registra a mano CON NOMBRE (crear,
         responsable, etapa, cancelar) dejan además un evento genérico del trigger
         de la BD, sin nombre. Se descartan aquí para no duplicar ni mostrar el
         genérico. Se conservan las transiciones automáticas (materializada,
         finalizada) y todo lo que no sea del cronograma. */
      .filter((e: any) => {
        if (e.entidad_tipo !== "cronograma_actividades") return true;
        if (e.tipo === "creado") return false;
        if (e.tipo === "estado") {
          const campo = e.detalle?.campo;
          if (campo === "responsable" || campo === "etapa") return false;
          if (campo === "estado" && e.detalle?.a === "cancelada") return false;
        }
        return true;
      });
    totalHijos = res.reduce((n, r) => n + (r.count ?? 0), 0);

    /* El nombre de DÓNDE pasó cada cosa. Sin esto una línea dice «cambió el
       estado de abierta a resuelta» y no dice de qué: el historial se vuelve
       una lista de sucesos sin sujeto. Una consulta por tabla, no por evento. */
    const porTabla = new Map<string, Set<string>>();
    eventosHijos.forEach((e: any) => {
      const t = tipoCanonico(e.entidad_tipo || "");
      if (!TABLA_DE[t]) return;
      if (!porTabla.has(t)) porTabla.set(t, new Set());
      porTabla.get(t)!.add(e.entidad_id);
    });
    const nomEnt = new Map<string, string>();
    await Promise.all([...porTabla.entries()].map(async ([t, idsT]) => {
      const [tabla, campo] = TABLA_DE[t];
      const { data } = await supabase.from(tabla).select(`id,${campo}`).in("id", [...idsT]);
      (data || []).forEach((r: any) => nomEnt.set(`${t}:${r.id}`, r[campo] || "—"));
    }));
    eventosHijos = eventosHijos.map((e: any) => ({
      ...e, entidadNombre: nomEnt.get(`${tipoCanonico(e.entidad_tipo || "")}:${e.entidad_id}`),
    }));
  }

  /* Los posts del MURO (bitácora) son publicaciones, pero NO son trabajo: viven
     en su pestaña Muro. Sus eventos («creó la publicación»…) no entran al
     historial de trabajo —confunden y llevaban a una página de caso que no les
     aplica—. Se detectan entre los ids de publicación tocados por los eventos. */
  const idsPubEv = [...new Set(eventosHijos
    .filter((e: any) => ["publicaciones", "publicacion"].includes(e.entidad_tipo))
    .map((e: any) => e.entidad_id))] as string[];
  let idsBitacora = new Set<string>();
  if (idsPubEv.length) {
    const { data: bits } = await supabase.from("publicaciones")
      .select("id").eq("tipo", "bitacora").in("id", idsPubEv);
    idsBitacora = new Set((bits || []).map((x: any) => x.id));
  }

  /* Se funden y se reordenan como una sola línea de tiempo: el orden lo da la
     hora, no de qué tabla vino cada cosa. */
  const eventosTodos = [...(eventos || []), ...eventosHijos]
    .filter((e: any) => !idsBitacora.has(e.entidad_id))
    .sort((a: any, b: any) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : 0))
    .slice(0, 120);

  // Traduce los UUID sueltos (responsable, etc.) a nombres antes de mostrar.
  const nomEv = await nombresDeEventos(supabase, eventosTodos);
  const eventosVis = conAlias(conNombresEventos(eventosTodos.filter((e: any) =>
    !(e.tipo === "estado" && ["estado_sunat", "condicion_sunat"].includes(e.detalle?.campo))), nomEv) as any[], alias);
  /* Cuántos hay DE VERDAD, no cuántos cupieron. El rótulo mostraba las filas
     traídas, así que una ficha con 214 eventos anunciaba exactamente el tope de
     la consulta —un número redondo que parecía un total y era un techo—. */
  const totEventos = (nEventos ?? 0) + totalHijos || eventosVis.length;

  /* LO QUE ESTA PERSONA HIZO EN TODO EL SISTEMA — no solo sobre su ficha.
     Es lo mismo que el diario (/historial) filtrado por ella: `actividad`
     donde el ACTOR es su cuenta. Se resuelve el nombre de cada entidad tocada
     para que se lea «RT-Peli · cambió el cartel», como en el diario. Solo si
     la persona tiene cuenta enlazada (sin actor no hay actividad suya). */
  let actividadUsuario: any[] = [];
  const uidPersona = params.tipo === "persona" ? ent.usuario_id : null;
  if (uidPersona) {
    const { data: actsU } = await supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
      .eq("actor_id", uidPersona)
      .order("creado_en", { ascending: false }).limit(80);
    const nombresU = await resolverNombres(supabase,
      (actsU || []).map((a: any) => ({ tipo: a.entidad_tipo, id: a.entidad_id })));
    const nomEvU = await nombresDeEventos(supabase, actsU || []);
    actividadUsuario = conAlias(conNombresEventos((actsU || []).map((a: any) => {
      const nom = nombresU.get(`${a.entidad_tipo}:${a.entidad_id}`) || undefined;
      return { ...a, entidadNombre: nom, entidadTitulo: nom };
    }), nomEvU) as any[], alias);
  }

  const ids = (vincs || []).map((v: any) => v.publicacion_id);
  /* `cuerpo` va aquí porque en un aviso el título es solo el asunto: lo que
     hay que hacer está en el cuerpo. Sin él, la tarjeta obligaba a entrar al
     caso para leer la indicación — y a volver para darse por enterado. */
  const SEL_PUB = "id,titulo,cuerpo,tipo,estado,archivado_en,creado_en,fecha_limite,autor_id,responsable,autor:perfiles!publicaciones_autor_id_fkey(nombre),resp:perfiles!publicaciones_responsable_fkey(nombre),comentarios(count)";
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
      /* `.not(publicacion_id, is, null)`: los comentarios de objetos del
         repositorio viven en esta misma tabla con publicacion_id vacío. Sin
         el filtro, ese null llega al `.in("id", …)` de abajo, Postgres no lo
         puede castear a uuid y la consulta entera falla — se traga con `|| []`
         y la ficha pierde en silencio los casos donde solo comentó. */
      ? supabase.from("comentarios").select("publicacion_id")
          .eq("autor_id", uid).not("publicacion_id", "is", null).limit(400)
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
    const [hj, rc, pf] = await Promise.all([
      supabase.from("publicaciones").select("padre_id,estado,archivado_en").in("padre_id", idsP),
      supabase.from("reacciones").select("publicacion_id,emoji,usuario_id").is("comentario_id", null).in("publicacion_id", idsP),
      // Nombres de quienes reaccionaron, para el acuse en el tooltip.
      supabase.from("perfiles").select("id,nombre"),
    ]);
    hijosDe = contarHijos(hj.data);
    const nombrePerfil = new Map(((pf.data as any[]) || []).map((x: any) => [x.id, x.nombre]));
    (rc.data || []).forEach((r: any) => {
      const l = reaccDe.get(r.publicacion_id) || [];
      l.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nombrePerfil.get(r.usuario_id) });
      reaccDe.set(r.publicacion_id, l);
    });
  }
  /* Nombre de CUALQUIER cuenta —también inactivas—, para atribuir «quién creó»
     un hito del cronograma. El creador puede haber dejado el equipo, y ese es
     justo el caso donde saber quién fue importa más; los mapas de nómina activa
     lo perderían. Una consulta chica que corre para cualquier ficha. */
  const nombreCuenta = new Map(
    (((await supabase.from("perfiles").select("id,nombre")).data as any[]) || []).map((x: any) => [x.id, x.nombre])
  );

  /* El equipo es el denominador de "Enterados N/M". Solo se pide si hay algún
     aviso a la vista: en una ficha sin avisos sería una consulta de más. */
  const equipoAvisos = pubs.some((p: any) => p.tipo === "aviso")
    // Qhaway no se entera de nada: reparte, no lee.
    ? sinBot((await supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true)).data)
    : [];

  /* 🧱 MURO reutilizable (proyecto y empresa): las notas de bitácora (tipo
     'bitacora') vinculadas a ESTA entidad, con su cuerpo/imágenes, etiquetas
     propias (datos_extra.tags), reacciones (ya en reaccDe) y comentarios. */
  const cargarMuro = async (): Promise<{ posts: any[]; etqs: string[] }> => {
    const un1 = (x: any) => (Array.isArray(x) ? x[0] : x);
    const idsBit = pubs.filter((p: any) => p.tipo === "bitacora").map((p: any) => p.id);
    if (!idsBit.length) return { posts: [], etqs: [] };
    const [bitFull, bitComs, bitVin] = await Promise.all([
      supabase.from("publicaciones")
        .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,datos_extra,autor:perfiles!publicaciones_autor_id_fkey(nombre,color,avatar_url)")
        .in("id", idsBit),
      supabase.from("comentarios")
        .select("id,publicacion_id,cuerpo,imagenes,creado_en,editado_en,autor_id,autor:perfiles(nombre,color,avatar_url)")
        .in("publicacion_id", idsBit).order("creado_en"),
      // A qué muro pertenece cada nota (su vínculo). El muro de persona junta las
      // bitácoras que el usuario dejó por todo el sistema; conviene ver la fuente.
      supabase.from("publicacion_vinculos").select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", idsBit),
    ]);
    /* Fuente de cada nota: su entidad de origen (proyecto/empresa/persona —los
       únicos con muro). Si es la ficha actual, es «nativa» (sin chip); si es otra,
       se resuelve su nombre para mostrar de dónde viene. */
    const homeDe = new Map<string, { tipo: string; id: string }>();
    (bitVin.data || []).forEach((v: any) => { if (!homeDe.has(v.publicacion_id)) homeDe.set(v.publicacion_id, { tipo: v.entidad_tipo, id: v.entidad_id }); });
    const porTipoF: Record<string, Set<string>> = {};
    homeDe.forEach(h => { if (!(h.tipo === params.tipo && h.id === params.id)) (porTipoF[h.tipo] ||= new Set()).add(h.id); });
    const TABLA_MURO: Record<string, string> = { proyecto: "proyectos", empresa: "empresas", persona: "personas" };
    const nombreFuente = new Map<string, string>();
    await Promise.all(Object.entries(porTipoF).map(async ([tipo, ids]) => {
      const tabla = TABLA_MURO[tipo]; if (!tabla) return;
      const { data } = await supabase.from(tabla).select("id,nombre").in("id", [...ids]);
      (data || []).forEach((r: any) => nombreFuente.set(`${tipo}:${r.id}`, r.nombre));
    }));
    /* REACCIONES DE LOS COMENTARIOS. Las de la NOTA ya venían (reaccDe), pero
       esa consulta lleva `.is("comentario_id", null)` a propósito —una
       reacción a un comentario no es una reacción a la nota— y nadie pedía
       las otras. Así que el muro pintaba comentarios sin reaccionar mientras
       la ficha de un caso sí las tiene: la misma acción existía o no según
       por dónde entraras.
       Y con `👀` significando «lo leí y lo tengo presente», poder ponerlo en
       la respuesta de alguien no es un adorno: es el acuse. */
    const idsComs = (bitComs.data || []).map((c: any) => c.id);
    const rxComs = new Map<string, Reaccion[]>();
    if (idsComs.length) {
      const [{ data: rcc }, { data: pfc }] = await Promise.all([
        supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", idsComs),
        supabase.from("perfiles").select("id,nombre"),
      ]);
      const nom = new Map(((pfc as any[]) || []).map((x: any) => [x.id, x.nombre]));
      (rcc || []).forEach((r: any) => {
        const l = rxComs.get(r.comentario_id) || [];
        l.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nom.get(r.usuario_id) });
        rxComs.set(r.comentario_id, l);
      });
    }
    const comsDe = new Map<string, any[]>();
    (bitComs.data || []).forEach((c: any) => {
      const l = comsDe.get(c.publicacion_id) || [];
      l.push({ ...c, autor: un1(c.autor), reacciones: rxComs.get(c.id) || [] });
      comsDe.set(c.publicacion_id, l);
    });
    const posts = (bitFull.data || [])
      .map((p: any) => ({
        id: p.id, cuerpo: p.cuerpo, imagenes: p.imagenes || [], creado_en: p.creado_en, editado_en: p.editado_en, autor_id: p.autor_id,
        autor: un1(p.autor),
        tags: Array.isArray(p.datos_extra?.tags) ? p.datos_extra.tags : [],
        destacado: !!p.datos_extra?.destacado || typeof p.datos_extra?.destacado_orden === "number",
        destOrden: typeof p.datos_extra?.destacado_orden === "number" ? p.datos_extra.destacado_orden : 0,
        reacciones: reaccDe.get(p.id) || [],
        comentarios: comsDe.get(p.id) || [],
        // Fuente: solo si la nota es de OTRO muro (no la ficha actual) y se pudo
        // resolver su nombre. La nota nativa no lleva chip.
        fuente: (() => {
          const h = homeDe.get(p.id);
          if (!h || (h.tipo === params.tipo && h.id === params.id)) return null;
          const nom = nombreFuente.get(`${h.tipo}:${h.id}`);
          return nom ? { tipo: h.tipo, id: h.id, nombre: nom } : null;
        })(),
      }))
      .sort((a: any, b: any) => (b.creado_en || "").localeCompare(a.creado_en || ""));
    const etqs = [...new Set(posts.flatMap((p: any) => p.tags))].sort() as string[];
    return { posts, etqs };
  };

  // Relaciones societarias
  let miembros: any[] = [], personasCat: any[] = [], cargosDe: any[] = [], postusEmp: any[] = [];
  // Lo que necesita la hoja para postular (solo se llena si es empresa)
  let comp = SIN_COMPROMISO, empLibre = false, trabasEmp: string[] = [], miembrosHoja: any[] = [];
  let partesReserva: any[] = [], reserva: "si" | "no" | "falta" = "falta";
  let clienteDe: { id: string; nombre: string } | null = null;
  let cronoActs: any[] = [], perfilesCat: any[] = [], cronoPost: any[] = [], plantelPost: any[] = [];
  let postusProy: any[] = [], equipoProy: any[] = [], plantillas: any[] = [], actoresProy: any[] = [];
  /* Por qué la lista de personajes vino vacía, si vino vacía por un error.
     Una consulta que falla devuelve `data: null`, y `|| []` la convierte en
     «no hay ninguno»: exactamente lo mismo que se ve cuando de verdad no hay
     ninguno. Pasó —al pedir una columna que aún no existía en la base, la
     sección dijo «· 0» con dos personajes dentro— y no había forma de notarlo
     desde la pantalla. El error viaja y se muestra. */
  let actoresError = "";
  let nSecuencias = 0;
  let muroPosts: any[] = [], muroEtqs: any[] = [];
  // Interacción de cada postulación (💬 comentarios + 😊 reacciones), para
  // mostrar el resumen en las tarjetas de las tres fichas. Se llena abajo, una
  // vez cargadas las postulaciones de la rama que corresponda.
  let contadoresPost: Record<string, { c: number; r: number }> = {};
  if (params.tipo === "proyecto") {
    const [pc, cl, ca, pf, pp, eq, pl, ac, gu] = await Promise.all([
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      ent.cliente_id
        ? supabase.from("personas").select("id,nombre,alias").eq("id", ent.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles!responsable(nombre)")
        /* La fecha manda; `orden` desempata lo que cae el mismo día —un día
           de rodaje tiene secuencia— y `creado_en` desempata el desempate,
           para que dos con el mismo orden no bailen entre recargas. */
        .eq("proyecto_id", params.id).order("fecha_inicio").order("orden").order("creado_en"),
      supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("id,codigo,estado,codigo_acta,monto_adjudicado,fecha_firma_acta,fecha_limite_rendicion,fecha_prorroga,acta_url,matriz_jurado_url,puntaje_jurado,feedback_jurado,conv:convocatorias(id,codigo,nombre,anio),emp:empresas(id,nombre),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url))")
        .eq("proyecto_id", params.id).order("creado_en", { ascending: false }),
      /* Quién hace esta película, desde «idea». Distinto de
         `postulacion_equipo`: ese es quién se presentó a UN concurso. */
      supabase.from("proyecto_equipo")
        .select("id,cargo,desde,hasta,persona:personas(id,nombre,alias,foto_url,tipo)")
        .eq("proyecto_id", params.id).order("cargo"),
      // Cronogramas que ya se usaron antes: «las coberturas son casi la misma»
      supabase.from("plantillas_cronograma")
        .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)")
        .order("nombre"),
      /* Actores sociales: los personajes de la vida real que retrata el
         documental. Relación aparte del equipo. */
      supabase.from("proyecto_actores")
        .select(`id,rol,descripcion,orden,personaje,imagen_url,imagenes,arquetipo,edad,genero,
          rasgos,quiere,quiere_como,necesita,necesita_como,notas,
          persona:personas(id,nombre,alias,foto_url)`)
        .eq("proyecto_id", params.id).order("orden").order("creado_en"),
      /* Cuántas secuencias de guion tiene, para el botón «✍ Guion». Va en
         esta ronda y no después: una consulta suelta detrás de un
         `Promise.all` es un viaje de ida y vuelta en serie en cada carga. */
      supabase.from("guion_secuencias")
        .select("id", { count: "exact", head: true }).eq("proyecto_id", params.id),
    ]);
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    const _cl = (cl as any).data; clienteDe = _cl ? { id: _cl.id, nombre: _cl.alias || _cl.nombre } : null;
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postusProy = pp.data || [];
    /* Logo (cartel) de cada empresa que postuló, para el chip con imagen. */
    const idsEmpProy = [...new Set(postusProy.map((p: any) => p.emp?.id).filter(Boolean))] as string[];
    if (idsEmpProy.length) {
      const { data: mediaEmp } = await supabase.from("entidad_media")
        .select("entidad_id,cartel_url").eq("entidad_tipo", "empresa").in("entidad_id", idsEmpProy);
      const logoDe = new Map<string, string>();
      (mediaEmp || []).forEach((mm: any) => { if (mm.cartel_url) logoDe.set(mm.entidad_id, mm.cartel_url); });
      postusProy = postusProy.map((p: any) => ({ ...p, _logoEmp: p.emp?.id ? logoDe.get(p.emp.id) || null : null }));
    }
    equipoProy = eq.data || [];
    // Protagonistas primero, luego secundarios, luego los demás.
    actoresProy = ordenarActores(ac.data || []);
    /* Solo la cuenta: el botón dice si hay tratamiento escrito dentro. Un
       botón que se ve igual con y sin contenido no invita a entrar.
       `head: true` no trae filas, solo el número. */
    nSecuencias = gu.count || 0;
    actoresError = (ac as any).error?.message || "";

    /* 🧱 MURO — reutiliza el helper compartido (mismo muro que empresa). */
    { const m = await cargarMuro(); muroPosts = m.posts; muroEtqs = m.etqs; }
    plantillas = (pl.data || []).map((x: any) => ({
      id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto,
      n: x.acts?.[0]?.count ?? 0,
    }));
  }
  let postus: any[] = [], proyectosCat: any[] = [], empresasCat: any[] = [], cartelesProy: Record<string, string> = {}, logosEmp: Record<string, string> = {};
  if (params.tipo === "convocatoria") {
    const [ca, pf, po, pr, em, mm] = await Promise.all([
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles!responsable(nombre)")
        .eq("convocatoria_id", params.id).order("fecha_inicio").order("orden").order("creado_en"),
      supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
      /* Cada postulación con su proyecto, la empresa que la presentó y su
         equipo —para dar contexto en la pestaña sin entrar a cada una. */
      supabase.from("postulaciones")
        .select("*, proy:proyectos(id,nombre), emp:empresas(id,nombre,codigo), equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url))")
        .eq("convocatoria_id", params.id).order("creado_en"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
      supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
      // Pósters (cartel) de proyecto Y logo de empresa, para ponerle cara a cada
      // postulación y a la empresa que la presenta.
      supabase.from("entidad_media").select("entidad_id,entidad_tipo,cartel_url").in("entidad_tipo", ["proyecto", "empresa"]),
    ]);
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postus = po.data || [];
    proyectosCat = pr.data || [];
    empresasCat = (em.data || []).map((x: any) => ({ id: x.id, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre }));
    (mm.data || []).forEach((m: any) => {
      if (!m.cartel_url) return;
      if (m.entidad_tipo === "proyecto") cartelesProy[m.entidad_id] = m.cartel_url;
      else if (m.entidad_tipo === "empresa") logosEmp[m.entidad_id] = m.cartel_url;
    });
  }
  let prestamos: any[] = [], proyectosPrest: any[] = [], prestamoPerfiles: { id: string; nombre: string }[] = [], bitacoraEq: any[] = [];
  let relacionados: any[] = []; const cartelRel = new Map<string, string>();
  /* De qué kits forma parte este equipo, y cómo están sus compañeros de kit. */
  let kitsDelEq: { id: string; nombre: string; uso?: string | null; retirado: boolean; piezas: PiezaKit[] }[] = [];
  /* Unidades de un combo de compra, y —al revés— de qué combo vino un equipo. */
  let comboDelEq: any = null;
  let comprasCat: any[] = [];
  let hermanasCombo: PiezaKit[] = [];
  /* ENSAMBLADO — de qué está hecho este equipo, y dentro de qué está él. */
  let piezasMontadas: PiezaKit[] = [];
  let montadoEn: { id: string; folio?: string | null; nombre: string; cartel?: string | null } | null = null;
  let candidatosMontar: any[] = [];
  /* (Aquí se cargaban las unidades de un combo para su ficha. La ficha se
     fue: un combo se registra una vez y no se toca, así que no necesitaba
     página con repositorio, casos y portada. Lo reemplaza la vista al
     vuelo de components/VistaCompra, y editar sus unidades vive en el
     panel de combos de /equipamiento.) */
  if (params.tipo === "equipamiento") {
    const [pr, pc, py] = await Promise.all([
      supabase.from("equipo_prestamos")
        .select("id,desde,hasta,nota,persona:personas(id,nombre,alias,foto_url),proy:proyectos(id,nombre)")
        .eq("equipamiento_id", params.id).order("desde", { ascending: false }),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
    ]);
    prestamos = pr.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    proyectosPrest = py.data || [];

    /* Equipos relacionados (automático): de la misma categoría, con los de la
       misma SUBcategoría primero —de una cámara de acción, las otras cámaras de
       acción antes que cualquier cámara—. Se excluye a sí mismo y a las bajas. */
    if (ent.categoria) {
      const { data: relRaw } = await supabase.from("equipamiento")
        .select("id,nombre,folio,estado,categoria,subcategoria")
        .eq("categoria", ent.categoria).neq("id", params.id).neq("estado", "de_baja")
        .order("folio").limit(80);
      const sub = (ent.subcategoria || "").trim().toLowerCase();
      relacionados = (relRaw || [])
        .sort((a: any, b: any) => (sub && (b.subcategoria || "").toLowerCase() === sub ? 1 : 0) - (sub && (a.subcategoria || "").toLowerCase() === sub ? 1 : 0))
        .slice(0, 8);
      const idsRel = relacionados.map((r: any) => r.id);
      if (idsRel.length) {
        const { data: mmR } = await supabase.from("entidad_media")
          .select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento").in("entidad_id", idsRel);
        (mmR || []).forEach((m: any) => { if (m.cartel_url) cartelRel.set(m.entidad_id, m.cartel_url); });
      }
    }
    /* Se traen TODAS las compras, no solo la suya: la sección se ve siempre
       y desde ella se puede asignar. Un panel que solo aparece cuando el
       dato ya está no sirve para ponerlo. */
    {
      const { data } = await supabase.from("compras")
        .select("id,codigo,nombre,proveedor,fecha,total,moneda")
        .order("fecha", { ascending: false, nullsFirst: false }).limit(300);
      comprasCat = data || [];
      comboDelEq = ent.compra_id ? (data || []).find((c: any) => c.id === ent.compra_id) || null : null;
    }

    /* ── ENSAMBLADO ──
       Tres cosas: lo que lleva dentro, dentro de qué está él, y qué se le
       puede montar. Los candidatos se filtran en el SERVIDOR y no en la
       pantalla: traer los 260 equipos para descartar 30 sería mover el
       inventario entero por una lista de veinte. */
    if (params.tipo === "equipamiento") {
      const [{ data: dentro }, { data: cont }, { data: libres }, { data: mmTodos }] = await Promise.all([
        supabase.from("equipamiento")
          .select("id,folio,nombre,estado,categoria,subcategoria,valor_compra")
          .eq("ensamblado_en", params.id).order("folio"),
        ent.ensamblado_en
          ? supabase.from("equipamiento").select("id,folio,nombre").eq("id", ent.ensamblado_en).maybeSingle()
          : Promise.resolve({ data: null }),
        /* Solo lo que de verdad se puede atornillar hoy: ni prestado, ni ya
           montado en otra cosa, ni de baja/perdido. Ofrecer lo que el
           servidor va a rechazar es hacer que el rechazo llegue después del
           clic. */
        supabase.from("equipamiento")
          .select("id,folio,nombre,categoria,subcategoria,estado")
          .is("ensamblado_en", null)
          .in("estado", ["disponible", "no_aparece", "en_reparacion"])
          .neq("id", params.id).order("folio"),
        /* Los carteles de TODO el equipamiento, en una consulta. Se elige
           entre doscientos equipos mirando fotos —«la placa negra, no la
           otra»— y el escogedor los pintaba todos con el 🎥 de relleno: el
           `select` de candidatos traía folio y nombre y nada más, así que la
           foto llegaba vacía sin que nada fallara. */
        supabase.from("entidad_media").select("entidad_id,cartel_url")
          .eq("entidad_tipo", "equipamiento"),
      ]);
      const cartelTodos = new Map<string, string>();
      (mmTodos || []).forEach((m: any) => { if (m.cartel_url) cartelTodos.set(m.entidad_id, m.cartel_url); });
      /* Las piezas montadas salen del mismo mapa: eran una segunda consulta
         para un subconjunto de lo que la de arriba ya traía. */
      const cartelD = cartelTodos;
      piezasMontadas = (dentro || []).map((d: any) => ({
        id: d.id, folio: d.folio, nombre: d.nombre, estado: d.estado, quien: null,
        cartel: cartelD.get(d.id) || null,
        categoria: d.categoria, subcategoria: d.subcategoria,
        valor: d.valor_compra ? Number(d.valor_compra) : null,
      }));
      const c1 = Array.isArray(cont) ? (cont as any)[0] : cont;
      /* Con su foto, del mapa que ya está cargado. «Está atornillada dentro
         de A-236 · IDOGEAR - Cinturón MOLLE» son ocho palabras para algo que
         se reconoce de un vistazo, y quien lee esto va a ir a BUSCARLO
         físicamente: la foto es la instrucción. */
      montadoEn = c1 ? { id: c1.id, folio: c1.folio, nombre: c1.nombre,
        cartel: cartelTodos.get(c1.id) || null } : null;
      candidatosMontar = (libres || []).map((e: any) => ({ ...e, cartel: cartelTodos.get(e.id) || null }));
    }

    /* QUÉ LLEVA MONTADO DENTRO CADA UNO DE ESTOS EQUIPOS.
       El panel de /equipamiento ya lo decía —«🔩 3 piezas»— y la ficha no,
       así que el mismo kit contaba trece cosas en una pantalla y veintitrés
       en la otra. Es el número que se firma al entregar y el que se cuenta al
       volver, y no puede depender de por dónde entraste a mirarlo.

       UNA consulta para toda la lista, no una por pieza: son quince equipos y
       serían quince viajes para pintar un contador. */
    const montadasDe = async (ids: string[]) => {
      const m = new Map<string, { id: string; folio?: string | null; nombre: string;
        cartel?: string | null; estado?: string | null }[]>();
      if (!ids.length) return m;
      const { data: dd } = await supabase.from("equipamiento")
        .select("id,folio,nombre,estado,ensamblado_en").in("ensamblado_en", ids);
      if (!dd?.length) return m;
      /* Con foto: el pop-up de las piezas se lee mirando, igual que la lista
         del kit. Sin cartel salen cinco cámaras de emoji indistinguibles. */
      const { data: mmD } = await supabase.from("entidad_media")
        .select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento")
        .in("entidad_id", dd.map((x: any) => x.id));
      const cD = new Map<string, string>();
      (mmD || []).forEach((x: any) => { if (x.cartel_url) cD.set(x.entidad_id, x.cartel_url); });
      dd.forEach((d: any) => {
        m.set(d.ensamblado_en, [...(m.get(d.ensamblado_en) || []), {
          id: d.id, folio: d.folio, nombre: d.nombre, estado: d.estado,
          cartel: cD.get(d.id) || null,
        }]);
      });
      return m;
    };

    /* Lo demás que vino en la misma compra, con su foto y quién lo tiene.
       Se lista en la ficha y no detrás de un enlace: «¿qué más vino con
       esto?» es LA pregunta que contesta la procedencia, y hacerla costar un
       clic es dejarla sin contestar. */
    if (ent.compra_id) {
      const { data: herm } = await supabase.from("equipamiento")
        .select("id,folio,nombre,estado,categoria,subcategoria,valor_compra").eq("compra_id", ent.compra_id).order("folio");
      const idsH = (herm || []).map((h: any) => h.id);
      if (idsH.length) {
        const [{ data: mmH }, { data: prH }] = await Promise.all([
          supabase.from("entidad_media").select("entidad_id,cartel_url")
            .eq("entidad_tipo", "equipamiento").in("entidad_id", idsH),
          supabase.from("equipo_prestamos")
            .select("equipamiento_id,persona:personas(nombre,alias)")
            .in("equipamiento_id", idsH).is("hasta", null),
        ]);
        const u1 = (x: any) => (Array.isArray(x) ? x[0] : x);
        const cartelH = new Map<string, string>();
        (mmH || []).forEach((m: any) => { if (m.cartel_url) cartelH.set(m.entidad_id, m.cartel_url); });
        const tieneH = new Map<string, string>();
        (prH || []).forEach((f: any) => {
          const pe = u1(f.persona);
          tieneH.set(f.equipamiento_id, pe?.alias || pe?.nombre || "alguien");
        });
        const montH = await montadasDe(idsH);
        hermanasCombo = (herm || []).map((h: any) => ({
          id: h.id, folio: h.folio, nombre: h.nombre, estado: h.estado,
          quien: tieneH.get(h.id) || null, cartel: cartelH.get(h.id) || null,
          categoria: h.categoria || null, subcategoria: h.subcategoria || null,
          valor: h.valor_compra ? Number(h.valor_compra) : null,
          montadas: montH.get(h.id) || [],
        }));
      }
    }

    /* ── DE QUÉ KIT ES ──
       Un equipo no sabe solo que forma parte de algo: la ficha decía todo lo
       suyo —categoría, folio, quién lo tiene— y nada de que sin él «Entrevista
       PRO» sale coja. Y esa es justo la pregunta al ver que está en uso.
       Se traen también sus compañeros de kit con su estado, porque saber que
       pertenece a un kit sin saber si el kit está entero no decide nada. */
    {
      const { data: mis } = await supabase.from("kit_equipos")
        .select("kit_id").eq("equipamiento_id", params.id);
      const idsKit = [...new Set((mis || []).map((x: any) => x.kit_id))];
      if (idsKit.length) {
        const [{ data: ks }, { data: todas }] = await Promise.all([
          supabase.from("kits").select("id,nombre,uso,retirado_en").in("id", idsKit).order("nombre"),
          supabase.from("kit_equipos").select("kit_id,equipamiento_id").in("kit_id", idsKit),
        ]);
        const idsEq = [...new Set((todas || []).map((x: any) => x.equipamiento_id))];
        const [{ data: eqsK }, { data: fuera }, { data: mmK }] = await Promise.all([
          /* `compra_id` para poder partir la lista por procedencia: un kit de
             quince piezas armado con tres compras se lee mucho mejor por
             combo que como una pared de miniaturas. */
          supabase.from("equipamiento").select("id,folio,nombre,estado,compra_id,categoria,subcategoria,valor_compra").in("id", idsEq),
          supabase.from("equipo_prestamos")
            .select("equipamiento_id,persona:personas(nombre,alias)")
            .in("equipamiento_id", idsEq).is("hasta", null),
          supabase.from("entidad_media").select("entidad_id,cartel_url")
            .eq("entidad_tipo", "equipamiento").in("entidad_id", idsEq),
        ]);
        const cartelK = new Map<string, string>();
        (mmK || []).forEach((m: any) => { if (m.cartel_url) cartelK.set(m.entidad_id, m.cartel_url); });
        const u1 = (x: any) => (Array.isArray(x) ? x[0] : x);
        const tiene = new Map<string, string>();
        (fuera || []).forEach((f: any) => {
          const pe = u1(f.persona);
          tiene.set(f.equipamiento_id, pe?.alias || pe?.nombre || "alguien");
        });
        const eqPorId = new Map((eqsK || []).map((e: any) => [e.id, e]));
        /* En qué OTROS kits está cada pieza. Se pregunta por equipamiento_id y
           NO se filtra `todas`: `todas` solo conoce los kits de ESTE equipo, y
           una pieza puede compartir bolsa con otra en un kit que este equipo
           no pisa. Reutilizarlo habría salido corto sin fallar. */
        const kitsPorPieza = new Map<string, { id: string; nombre: string }[]>();
        {
          const { data: memb } = await supabase.from("kit_equipos")
            .select("equipamiento_id,kit:kits(id,nombre,retirado_en)").in("equipamiento_id", idsEq);
          (memb || []).forEach((r: any) => {
            /* Objeto o arreglo según cómo PostgREST resuelva la clave. Leer
               solo una de las dos formas sale vacío y parece que la pieza no
               está en ningún kit. */
            const kk = Array.isArray(r.kit) ? r.kit[0] : r.kit;
            if (!kk || kk.retirado_en) return;
            kitsPorPieza.set(r.equipamiento_id,
              [...(kitsPorPieza.get(r.equipamiento_id) || []), { id: kk.id, nombre: kk.nombre }]);
          });
        }
        /* Los combos de esas piezas, en una consulta. `comprasCat` ya está en
           memoria más abajo, pero se carga después y solo para el desplegable
           de esta ficha: apoyarse en él ataría el orden de dos bloques que hoy
           no se conocen. */
        const idsCompraK = [...new Set((eqsK || []).map((e: any) => e.compra_id).filter(Boolean))] as string[];
        const comboK = new Map<string, any>();
        if (idsCompraK.length) {
          /* Y cuántas unidades tiene cada combo ENTERO, que no es lo mismo que
             cuántas de ellas están en este kit. Sin las dos cifras, un grupo
             de dos piezas de un combo de tres se lee como que la compra trajo
             dos. */
          const [{ data: cbs }, { data: uds }] = await Promise.all([
            supabase.from("compras").select("id,codigo,nombre").in("id", idsCompraK),
            supabase.from("equipamiento").select("id,compra_id").in("compra_id", idsCompraK),
          ]);
          const nPorCompra = new Map<string, number>();
          (uds || []).forEach((u: any) => nPorCompra.set(u.compra_id, (nPorCompra.get(u.compra_id) || 0) + 1));
          (cbs || []).forEach((c: any) => comboK.set(c.id,
            { codigo: c.codigo, nombre: c.nombre, nUnidades: nPorCompra.get(c.id) ?? null }));
        }
        const montK = await montadasDe(idsEq);
        kitsDelEq = (ks || []).map((k: any) => ({
          id: k.id, nombre: k.nombre, uso: k.uso, retirado: !!k.retirado_en,
          piezas: (todas || []).filter((t: any) => t.kit_id === k.id)
            .map((t: any) => eqPorId.get(t.equipamiento_id))
            .filter(Boolean)
            .map((e: any) => ({
              id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado,
              quien: tiene.get(e.id) || null, cartel: cartelK.get(e.id) || null,
              combo: e.compra_id ? comboK.get(e.compra_id) || null : null,
              kits: kitsPorPieza.get(e.id) || [],
              categoria: e.categoria || null, subcategoria: e.subcategoria || null,
              valor: e.valor_compra ? Number(e.valor_compra) : null,
              montadas: montK.get(e.id) || [],
            })),
        }));
      }
    }

    // La bitácora de cada préstamo (comentarios con prestamo_id) + la bitácora
    // SUELTA del equipo (comentarios con equipamiento_id, sin depender de un uso),
    // ambas con sus reacciones (por comentario_id) y quién reaccionó (acuse).
    {
      const un1 = (x: any) => (Array.isArray(x) ? x[0] : x);
      const comSel = "id,prestamo_id,equipamiento_id,cuerpo,imagenes,etiquetas,es_dano,responde_a,fecha_evento,creado_en,editado_en,autor_id,autor:perfiles(nombre,color,avatar_url)";
      const [{ data: coms }, { data: comsEq }, { data: perfsC }] = await Promise.all([
        prestamos.length
          ? supabase.from("comentarios").select(comSel).in("prestamo_id", prestamos.map((p: any) => p.id)).order("creado_en")
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("comentarios").select(comSel).eq("equipamiento_id", params.id).order("creado_en"),
        supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
      ]);
      const comIds = [...(coms || []), ...(comsEq || [])].map((c: any) => c.id);
      const { data: rxC } = comIds.length
        ? await supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", comIds)
        : { data: [] as any[] };
      const nomPerf = new Map(((perfsC as any[]) || []).map((x: any) => [x.id, x.nombre]));
      const rxDe = new Map<string, any[]>();
      (rxC || []).forEach((r: any) => {
        const l = rxDe.get(r.comentario_id) || [];
        l.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nomPerf.get(r.usuario_id) });
        rxDe.set(r.comentario_id, l);
      });
      prestamoPerfiles = ((perfsC as any[]) || []).map((x: any) => ({ id: x.id, nombre: x.nombre }));
      const porP = new Map<string, any[]>();
      (coms || []).forEach((c: any) => {
        const l = porP.get(c.prestamo_id) || [];
        l.push({ ...c, autor: un1(c.autor), reacciones: rxDe.get(c.id) || [] });
        porP.set(c.prestamo_id, l);
      });
      prestamos = prestamos.map((p: any) => ({ ...p, comentarios: porP.get(p.id) || [] }));
      bitacoraEq = (comsEq || []).map((c: any) => ({ ...c, autor: un1(c.autor), reacciones: rxDe.get(c.id) || [] }));
    }
  }

  let postCtx: any = null, equipoPost: any[] = [], credsEmp: any[] = [], contactosPost: any[] = [], plantillasPre: any[] = [], hitosConc: any[] = [];
  let otrasPostus: any[] = [];   // otras ediciones del MISMO proyecto (para cruzar equipo/empresa)
  let cartelProy: string | null = null;
  let portadaProy: string | null = null;
  let cartelEmp: string | null = null;
  let repLegal: any = null;   // el/la representante legal de la empresa, con foto
  let cronoListo = false, cronoResumen = "", presuListo = false, presuResumen = "";
  let seedBenef: { rol: string; cantidad: number }[] = [];
  let precontN = 0, precontFirm = 0;
  /* Qué caso atiende cada sección del expediente. El puente vive en
     `postulaciones.expediente_casos` (clave → id); aquí se resuelven título,
     estado y responsable para poder mostrarlo sin entrar al caso. */
  let casosExp: Record<string, { id: string; titulo: string; estado: string; resp?: string | null }> = {};
  const autoExp: Record<string, string> = {};
  if (params.tipo === "postulacion") {
    const [ctx, eq, pc, ec] = await Promise.all([
      supabase.from("postulaciones")
        .select("proy:proyectos(id,nombre,tipo,renca), emp:empresas(id,nombre,codigo,ruc,razon_social,renca,partida_electronica,estado_sunat,domicilio_fiscal,region,departamento_fiscal,provincia_fiscal,distrito_fiscal), conv:convocatorias(id,codigo,nombre,anio,categoria,monto_adjudicado,bases_url,plantilla_formulario,hitos:cronograma_actividades(id,nombre,fecha_inicio,estado,clase,creado_por))")
        .eq("id", params.id).single(),
      supabase.from("postulacion_equipo")
        .select("id,cargo,cv_url,cv_actualizado,persona:personas(id,nombre,alias,foto_url,tipo,es_comunero,ruc_dni,genero,nacionalidad,autoident,lengua_materna,otras_lenguas,discapacidad,direccion,region,provincia,distrito,fecha_nacimiento)")
        .eq("postulacion_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      /* Solo las que pueden postular de verdad: activas y nuestras. Ofrecer
         una externa o una cerrada sería invitar al error — el fondo lo
         rechazaría después, cuando ya no hay tiempo de cambiarla. */
      supabase.from("empresas").select("id,nombre,codigo")
        .eq("estado", "activa").order("nombre"),
    ]);
    /* Si ESTA consulta falla, la ficha se degrada entera y en silencio: sin
       proyecto, sin empresa, sin concurso, con `autoExp` vacío y —lo peor— sin
       `plantilla_formulario`, lo que cambia la pestaña 🗂 Expediente por la
       📎 Materiales antigua sin decir nada. Que quede en el log del servidor. */
    if (ctx.error) console.error("ficha postulación · contexto:", ctx.error.message);
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
      const [{ data: pe }, { data: mp }] = await Promise.all([
        supabase.from("proyecto_equipo")
          .select("id,cargo,persona:personas(id,nombre,alias,foto_url,tipo,es_comunero,ruc_dni,genero,nacionalidad,autoident,lengua_materna,otras_lenguas,discapacidad,direccion,region,provincia,distrito,fecha_nacimiento)")
          .eq("proyecto_id", proyId).order("cargo"),
        // Cartel + banner del proyecto: el cartel para la cabecera de la pestaña
        // Equipo, y el banner (portada) para la cabecera del carné —así se ve de
        // un vistazo QUÉ proyecto está compitiendo en esta postulación.
        supabase.from("entidad_media").select("portada_url,cartel_url")
          .eq("entidad_tipo", "proyecto").eq("entidad_id", proyId).maybeSingle(),
      ]);
      equipoProy = pe || [];
      cartelProy = (mp as any)?.cartel_url || null;
      portadaProy = (mp as any)?.portada_url || null;
      /* OTRAS ediciones del mismo proyecto: con qué empresa y equipo se presentó
         antes —para cruzar la información entre convocatorias. Excluye ESTA. */
      const { data: op } = await supabase.from("postulaciones")
        .select("id,codigo,estado,creado_en,emp:empresas(id,nombre),conv:convocatorias(id,codigo,nombre,anio),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url))")
        .eq("proyecto_id", proyId).neq("id", params.id)
        .order("creado_en", { ascending: false });
      otrasPostus = op || [];
      /* Logo (cartel) de cada empresa de esas ediciones, para ponerle cara al
         nombre —igual que el trío de arriba. */
      const idsEmpEdic = [...new Set(otrasPostus.map((o: any) => o.emp?.id).filter(Boolean))] as string[];
      if (idsEmpEdic.length) {
        const { data: mediaEdic } = await supabase.from("entidad_media")
          .select("entidad_id,cartel_url").eq("entidad_tipo", "empresa").in("entidad_id", idsEmpEdic);
        const cartelEmpDe = new Map<string, string>();
        (mediaEdic || []).forEach((m: any) => { if (m.cartel_url) cartelEmpDe.set(m.entidad_id, m.cartel_url); });
        otrasPostus = otrasPostus.map((o: any) => ({ ...o, _cartelEmp: o.emp?.id ? cartelEmpDe.get(o.emp.id) || null : null }));
      }
    }
    // El cartel/logo de la EMPRESA: es el otro protagonista del concurso y va
    // junto al del proyecto en la cabecera de contexto de la pestaña Equipo.
    const empId = (postCtx?.emp as any)?.id;
    if (empId) {
      const [{ data: me }, { data: rls }] = await Promise.all([
        supabase.from("entidad_media").select("cartel_url")
          .eq("entidad_tipo", "empresa").eq("entidad_id", empId).maybeSingle(),
        // El/la representante legal: quien firma por la empresa ante el fondo.
        // Mismo criterio de prioridad que el auto-llenado (representante > presidente/titular/gerente).
        supabase.from("empresa_miembros")
          .select("cargo,persona:personas(id,nombre,alias,foto_url)")
          .eq("empresa_id", empId).eq("estado", "activo"),
      ]);
      cartelEmp = (me as any)?.cartel_url || null;
      const prioRL = (c: string) => /representante/i.test(c) ? 0 : /presidente|titular|gerente/i.test(c) ? 1 : 9;
      const rl = (rls || [])
        .filter((m: any) => prioRL(m.cargo || "") < 9)
        .sort((a: any, b: any) => prioRL(a.cargo || "") - prioRL(b.cargo || ""))[0];
      if (rl?.persona) repLegal = { ...(Array.isArray(rl.persona) ? rl.persona[0] : rl.persona), cargo: rl.cargo };
    }

    /* Para el listado del equipo: por cada miembro (postulación + proyecto),
       ¿tiene CV? y ¿su precontrato está firmado/pendiente? Son los datos que el
       fondo revisa PERSONA por persona. Un solo query de CVs para todos. */
    const un1p = (x: any) => (Array.isArray(x) ? x[0] : x);
    const idsMiembro = [...new Set([...equipoPost, ...equipoProy]
      .map((m: any) => un1p(m.persona)?.id).filter(Boolean))] as string[];
    /* CVs de cada miembro CON su enfoque, link y fecha: el chip valida que el CV
       sea para el ROL de esta postulación y esté vigente —DAFO no acepta uno
       viejo ni de otro rol; el enfoque cambia con el cargo. */
    const cvPorPersona = new Map<string, any[]>();
    if (idsMiembro.length) {
      const { data: cvs } = await supabase.from("objetos")
        .select("id,entidad_id,titulo,url,actualizado").eq("entidad_tipo", "persona").eq("tipo", "cv").in("entidad_id", idsMiembro);
      (cvs || []).forEach((c: any) => {
        const l = cvPorPersona.get(c.entidad_id) || [];
        l.push({ id: c.id, enfoque: c.titulo, url: c.url, actualizado: c.actualizado });
        cvPorPersona.set(c.entidad_id, l);
      });
    }
    // Precontrato por persona: su id (para bajar el .docx) y su estado.
    const prePorPersona = new Map<string, { id: string; estado: string }>();
    ((ent.precontratos as any) || []).forEach((p: any) => {
      if (p?.persona_id) prePorPersona.set(p.persona_id, { id: p.id || "", estado: p.estado === "firmado" ? "firmado" : "pendiente" });
    });
    const normCv = (s: string) => (s || "").trim().toLowerCase();
    const enriquecer = (m: any) => {
      const p = un1p(m.persona);
      const cvs = (p?.id ? cvPorPersona.get(p.id) : null) || [];
      const c = normCv(m.cargo);
      // El CV cubre el rol si su enfoque es la raíz del cargo (Productor cubre
      // Productor Ejecutivo, no al revés) — misma regla que la alerta de CV.
      const cv = cvs.find((x: any) => { const e = normCv(x.enfoque); return e && (c === e || c.startsWith(e + " ")); });
      const vigente = cv ? !(cv.actualizado && (Date.now() - new Date(cv.actualizado + "T12:00:00").getTime()) / 86400000 > DIAS_CV) : false;
      const pre = p?.id ? prePorPersona.get(p.id) : null;
      /* CV PRESENTADO (db/cv-postulacion.sql): si la fila del equipo tiene su
         propio cv_url, ESE es el CV de la carpeta — validación binaria, sin
         vigencia (nació para esta postulación, no caduca). El CV general por
         enfoque queda degradado a sugerencia (`_cvBase`): «úsalo de base para
         preparar el de esta postulación». Las filas de proyecto no tienen
         cv_url y conservan la lógica inferida de siempre — es identidad. */
      const propio = m.cv_url
        ? { url: m.cv_url as string, id: null, vigente: true, propio: true }
        : null;
      return { ...m, persona: p,
        _cv: propio || (cv ? { url: cv.url || null, id: cv.id, vigente, propio: false } : null),
        _pre: pre || null };
    };
    equipoPost = equipoPost.map(enriquecer);
    equipoProy = equipoProy.map(enriquecer);

    /* 🗂 EXPEDIENTE — auto-llenado: lo que la base ya sabe, no se teclea.
       ⚠ CONTRATO DE CLAVES: cada clave de `autoExp` debe COINCIDIR EXACTA con
       la clave `k` de un campo de `convocatorias.plantilla_formulario`, o no
       conecta (el campo queda vacío para llenar a mano). Al armar una plantilla
       nueva, usar estas claves para lo que se auto-llena:
         · ruc, razon_social, estado_sunat, renca_empresa, partida_electronica,
           domicilio_legal, departamento, provincia, distrito → de la EMPRESA
           (además, cualquier campo de empresa se empareja también por etiqueta)
         · rep_legal_nombre, rep_legal_doc  → del representante legal
         · titulo_proyecto, renca_obra      → del PROYECTO
         · equipo_personal     → tabla censal del equipo (con ⚠ lo que falta)
         · monto_solicitado    → total del ESTÍMULO del presupuesto
       (El cronograma y el presupuesto NO van por aquí: tienen su sección.) */
    const e = postCtx?.emp, py = postCtx?.proy;
    // La plantilla del formulario DAFO: la usamos para emparejar por etiqueta.
    const plantForm = (postCtx?.conv as any)?.plantilla_formulario as any[] | undefined;
    if (e) {
      autoExp.ruc = e.ruc || "";
      autoExp.razon_social = e.razon_social || e.nombre || "";
      autoExp.estado_sunat = e.estado_sunat || "";
      autoExp.renca_empresa = e.renca || "";
      autoExp.partida_electronica = e.partida_electronica || "";
      autoExp.domicilio_legal = e.domicilio_fiscal || "";
      /* Domicilio fiscal desglosado (Departamento · Provincia · Distrito),
         como lo pide DAFO. Si falta el departamento fiscal, cae en la región. */
      autoExp.departamento = e.departamento_fiscal || e.region || "";
      autoExp.provincia = e.provincia_fiscal || "";
      autoExp.distrito = e.distrito_fiscal || "";
      /* Y por ETIQUETA, para plantillas cuyas claves no siguen el contrato:
         emparejamos cada campo de EMPRESA (no RL) por lo que su etiqueta pide. */
      const empValor = (et: string): string | null => {
        const s = et.toLowerCase();
        if (/partida\s*electr[oó]nica|n[°º.]?\s*de\s*partida/.test(s)) return e.partida_electronica || null;
        /* El departamento/provincia/distrito solo se toma de la EMPRESA cuando la
           etiqueta es su domicilio; NO cuando es una ubicación del PROYECTO
           («provincia de rodaje», «departamento de ejecución», «región de las
           actividades»…), para no colar el domicilio fiscal donde no va. */
        const esUbicacionProyecto = /rodaje|ejecuci|actividad|localiz|filmaci|grabaci|proyecto|obra/.test(s);
        if (!esUbicacionProyecto) {
          if (/departamento/.test(s)) return e.departamento_fiscal || e.region || null;
          if (/provincia/.test(s)) return e.provincia_fiscal || null;
          if (/distrito/.test(s)) return e.distrito_fiscal || null;
        }
        return null;
      };
      (Array.isArray(plantForm) ? plantForm : []).forEach((sec: any) =>
        (sec?.campos || []).forEach((campo: any) => {
          const et = String(campo?.etiqueta || "");
          if (/^\s*rl\b|representante\s+legal/i.test(et)) return;   // los RL van aparte
          const val = empValor(et);
          if (val && !autoExp[campo.k]) autoExp[campo.k] = val;
        }));
      /* El representante legal —el presidente/titular de la empresa—: su perfil
         ya guarda TODO lo censal que el expediente pide del RL. Traemos a los
         cargos que pueden serlo y elegimos por prioridad (representante primero,
         luego presidente/titular/gerente). */
      const { data: rl } = await supabase.from("empresa_miembros")
        .select("cargo,persona:personas(nombre,ruc_dni,nacionalidad,genero,fecha_nacimiento,autoident,lengua_materna,otras_lenguas,discapacidad,direccion,region,provincia,distrito)")
        .eq("empresa_id", e.id).eq("estado", "activo");
      const prioridadRL = (c: string) =>
        /representante/i.test(c) ? 0 : /presidente|titular|gerente/i.test(c) ? 1 : 9;
      const r: any = (rl || [])
        .filter((m: any) => prioridadRL(m.cargo || "") < 9)
        .sort((a: any, b: any) => prioridadRL(a.cargo || "") - prioridadRL(b.cargo || ""))[0];
      if (r?.persona) {
        const rp = r.persona;
        // Claves «clásicas» por compatibilidad con plantillas que ya las usan.
        autoExp.rep_legal_nombre = rp.nombre || "";
        autoExp.rep_legal_doc = rp.ruc_dni ? `DNI ${rp.ruc_dni}` : "";
        /* Y, además, emparejamos por ETIQUETA cada campo «RL - …» de la
           plantilla con el dato del perfil: la clave de la plantilla puede ser
           cualquiera, pero su etiqueta dice qué pide. Así el RL se llena solo,
           igual que la empresa. */
        const rlValor = (et: string): string | null => {
          const s = et.toLowerCase();
          if (/nombre|apellido/.test(s)) return rp.nombre || null;
          if (/nacionalidad/.test(s)) return rp.nacionalidad || null;
          if (/documento|dni|identidad|pasaporte|carnet/.test(s)) return rp.ruc_dni ? `DNI ${rp.ruc_dni}` : null;
          if (/nacimiento/.test(s)) return rp.fecha_nacimiento || null;
          if (/g[eé]nero|sexo/.test(s)) return rp.genero || null;
          if (/autoident|[eé]tnic/.test(s)) return rp.autoident || null;
          if (/lengua|idioma/.test(s)) return rp.lengua_materna
            ? (rp.otras_lenguas ? `${rp.lengua_materna} (+${rp.otras_lenguas})` : rp.lengua_materna) : null;
          if (/discapacidad/.test(s)) return rp.discapacidad || null;
          // Domicilio del DNI del RL (el censo lo pide igual que para el equipo).
          if (/direcci[oó]n/.test(s)) return rp.direccion || null;
          if (/departamento/.test(s)) return rp.region || null;
          if (/provincia/.test(s)) return rp.provincia || null;
          if (/distrito/.test(s)) return rp.distrito || null;
          return null;
        };
        (Array.isArray(plantForm) ? plantForm : []).forEach((sec: any) =>
          (sec?.campos || []).forEach((campo: any) => {
            const et = String(campo?.etiqueta || "");
            if (!/^\s*rl\b|representante\s+legal/i.test(et)) return;   // solo campos del RL
            const val = rlValor(et);
            if (val && !autoExp[campo.k]) autoExp[campo.k] = val;
          }));
      }
    }
    if (py) {
      autoExp.titulo_proyecto = py.nombre || "";
      autoExp.renca_obra = py.renca || "";
    }
    /* La tabla censal de la plataforma, generada desde la ficha de cada
       persona. Lo que falta se marca con ⚠ para cazarlo antes del envío:
       cada ⚠ es un dato que la plataforma va a exigir sí o sí. */
    const filaCensal = (m: any) => {
      const p = m.persona || {};
      const f = (v: any, etiqueta: string) => v || `⚠${etiqueta}`;
      return [
        `${m.cargo || "⚠cargo"}: ${p.nombre || ""}`,
        `  DNI ${f(p.ruc_dni, "DNI")} · ${f(p.nacionalidad, "nacionalidad")} · ${f(p.genero, "género")}${p.fecha_nacimiento ? ` · nac. ${p.fecha_nacimiento}` : ""}`,
        `  ${f(p.autoident, "autoident. étnica")} · lengua: ${f(p.lengua_materna, "lengua")}${p.otras_lenguas ? ` (+${p.otras_lenguas})` : ""} · discapacidad: ${f(p.discapacidad, "discapacidad")}`,
        `  domicilio: ${p.direccion ? p.direccion + " — " : ""}${f(p.region, "región")} / ${f(p.provincia, "provincia")} / ${f(p.distrito, "distrito")}`,
      ].join("\n");
    };
    /* Sin repetir a nadie: quien está en el equipo de la postulación Y en el
       del proyecto (p. ej. la directora) sale una sola vez en la tabla censal.
       Gana el de la postulación (va primero). */
    const vistosCensal = new Set<string>();
    const equipoCensal = [...equipoPost, ...equipoProy].filter((m: any) => {
      const id = m.persona?.id;
      if (!id) return true;                      // sin id no se deduplica, pero tampoco se pierde
      if (vistosCensal.has(id)) return false;
      vistosCensal.add(id); return true;
    });
    const equipoTxt = equipoCensal.map(filaCensal).join("\n\n");
    if (equipoTxt) autoExp.equipo_personal = equipoTxt;
    /* El monto solicitado = lo que se pide AL ESTÍMULO = suma de item.estimulo
       del presupuesto real (total del ítem menos la contrapartida). Antes usaba
       el monto del concurso, que es el TOPE del fondo, no lo que pides. */
    const preItems = ((ent.presupuesto as any)?.items || []) as any[];
    const totalEstim = preItems.reduce((s, i) => s + Math.max(0, (i.cantidad || 0) * (i.costo_unit || 0) - (i.otras || 0)), 0);
    if (totalEstim > 0) autoExp.monto_solicitado = `S/ ${Math.round(totalEstim).toLocaleString("es-PE")}`;
    else if (postCtx?.conv?.monto_adjudicado)
      /* Sin presupuesto armado se muestra el tope del concurso como REFERENCIA,
         con ⚠ — que es la marca que impide contarlo como listo (`listoDe`) y
         evita que alguien lo copie a DAFO tal cual. El comentario de arriba
         dice que el tope no es lo que pides, y sin el ⚠ este `else` lo volvía
         a colar: ✅ verde, copiable, y mal. */
      autoExp.monto_solicitado =
        `⚠ referencia — tope del concurso: S/ ${Math.round(parseFloat(postCtx.conv.monto_adjudicado)).toLocaleString("es-PE")} (arma el presupuesto)`;
    Object.keys(autoExp).forEach(k => { if (!autoExp[k]) delete autoExp[k]; });

    /* Cronograma PROPIO de la postulación (independiente del plan del
       proyecto) + plantillas por tipo + perfiles, para su pestaña. */
    const [cp, pl2, pf2] = await Promise.all([
      supabase.from("cronograma_actividades").select("*, resp:perfiles!responsable(nombre)")
        .eq("postulacion_id", params.id)
        .order("etapa").order("orden").order("fecha_inicio").order("creado_en"),
      supabase.from("plantillas_cronograma")
        .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)").order("nombre"),
      supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
    ]);
    /* El responsable de una actividad de POSTULACIÓN vive en
       `responsable_persona` (el equipo que se presenta), no en `responsable`
       (las cuentas del sistema) — ver db/crono-responsable-persona.sql. Se
       normaliza aquí, al leer, para que el componente del cronograma siga
       hablando de `responsable` y no haya que ramificarlo por dentro. */
    /* La nómina que ve el cronograma de postulación son PERSONAS del equipo,
       pero `creado_por` es una CUENTA del sistema (otra tabla). Adjuntamos aquí
       su nombre (de `nombreCuenta`, que incluye inactivos) como `_creadoPor`
       para que el componente lo muestre sin cruzar los dos universos de ids. */
    cronoPost = (cp.data || []).map((a: any) => ({
      ...a, responsable: a.responsable_persona || null,
      _creadoPor: nombreCuenta.get(a.creado_por) || null,
    }));
    perfilesCat = pf2.data || [];
    /* 🧱 Muro de la postulación — mismo motor que proyecto/empresa/persona: junta
       las notas de bitácora vinculadas a esta postulación. */
    { const mm = await cargarMuro(); muroPosts = mm.posts; muroEtqs = mm.etqs; }
    /* Y su «nómina» es el equipo de postulación, con el cargo al lado: en una
       lista de ocho nombres, «Programador/a» es lo que te dice a quién le toca.
       Una persona con dos cargos sale una vez con los dos.
       Si el equipo está vacío no hay a quién asignar, y eso es correcto: se
       agrega gente al equipo primero. Caer de vuelta a los perfiles guardaría
       un id de cuenta en una columna que apunta a personas. */
    const cargos = new Map<string, string[]>();
    const nombres = new Map<string, string>();
    const fotos = new Map<string, string | null>();
    for (const m of equipoPost as any[]) {
      const p = m?.persona; if (!p?.id) continue;
      nombres.set(p.id, p.alias || p.nombre || "—");
      fotos.set(p.id, p.foto_url || null);
      cargos.set(p.id, [...(cargos.get(p.id) || []), m.cargo].filter(Boolean));
    }
    plantelPost = [...nombres].map(([id, n]) => ({
      id, nombre: (cargos.get(id) || []).length ? `${n} · ${(cargos.get(id) || []).join(" / ")}` : n,
      foto: fotos.get(id) || null,
    }));
    plantillas = (pl2.data || []).map((x: any) => ({
      id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto, n: x.acts?.[0]?.count ?? 0,
    }));

    /* Credenciales de la empresa, a la mano para entrar a DAFO o al correo sin
       ir a su ficha. `conPlataforma` agrega el link y las entradas al leer. */
    if (postCtx?.emp?.id) {
      const { data: cd } = await supabase.from("credenciales")
        .select("*, datos:credencial_datos(id,etiqueta,valor)")
        .eq("empresa_id", postCtx.emp.id).order("plataforma");
      credsEmp = await conPlataforma(cd || []);
    }
    /* Los contactos declarados en el formulario de ESTA postulación —móvil,
       fijo y los dos correos—. Cuelgan de la postulación y no de la empresa:
       el correo 2 suele ser el personal de quien la presentó. */
    const { data: cdp } = await supabase.from("credencial_datos")
      .select("id,etiqueta,valor,verificado_en")
      .eq("postulacion_id", params.id).order("etiqueta");
    contactosPost = cdp || [];

    // Plantillas de presupuesto (reusables por categoría).
    const { data: plPre } = await supabase.from("plantillas_presupuesto")
      .select("id,nombre,categoria,items").order("nombre");
    plantillasPre = plPre || [];

    // Hitos del concurso, para la línea de tiempo (va en la columna pequeña).
    hitosConc = ((postCtx?.conv as any)?.hitos || [])
      .filter((h: any) => h.clase === "hito_externo" && h.estado !== "cancelada")
      .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1));

    /* Estado y resumen del cronograma y el presupuesto, para que el expediente
       enlace a sus secciones dedicadas (Sección C y D) en vez de duplicarlas. */
    const vivC = cronoPost.filter((a: any) => a.estado !== "cancelada");
    cronoListo = vivC.length > 0;
    cronoResumen = cronoListo
      ? `${vivC.length} actividades${ent.cronograma_postulado_en ? " · foto fijada" : ""}`
      : "aún sin actividades";
    const preIt = ((ent.presupuesto as any)?.items || []) as any[];
    const preTot = preIt.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
    const preEst = preIt.reduce((s, i) => s + Math.max(0, (i.cantidad || 0) * (i.costo_unit || 0) - (i.otras || 0)), 0);
    /* LISTO ≠ EMPEZADO. Tener ítems no es tener un presupuesto presentable: las
       bases fijan dos reglas duras y el editor ya las mide en pantalla, pero el
       expediente no las miraba. Con un solo ítem daba el punto por bueno y
       llegaba a decir «100% — a la plataforma solo a copiar y pegar» sobre un
       presupuesto que excede el tope del estímulo o cuyo plan de financiamiento
       no cuadra: el peor momento para enterarse es el día del envío. */
    const preFue = ((ent.presupuesto as any)?.fuentes || []) as any[];
    const preTotFue = preFue.reduce((s, f) => s + (f.importe || 0), 0);
    const preTope = topeEstimuloDe((postCtx?.conv as any)?.categoria);
    const preExcede = preTope < 1 && preTot > 0 && preEst / preTot > preTope + 1e-9;
    const preCuadra = Math.abs(preTotFue - preTot) < 1;
    presuListo = preIt.length > 0 && !preExcede && preCuadra;
    presuResumen = preIt.length === 0
      ? "aún sin ítems"
      : [`costo S/ ${Math.round(preTot).toLocaleString("es-PE")}`,
         `estímulo S/ ${Math.round(preEst).toLocaleString("es-PE")}`,
         `${preIt.length} ítems`,
         preExcede ? `⚠ el estímulo pasa del ${Math.round(preTope * 100)}%` : null,
         !preCuadra ? "⚠ el financiamiento no cuadra con el costo" : null,
         ent.presupuesto_postulado_en ? "foto fijada" : null,
        ].filter(Boolean).join(" · ");

    /* Semilla de «Participantes/beneficiarios»: una fila por CARGO del equipo
       nombrado (proyecto + postulación, sin repetir persona). Es solo sugerencia
       —la tabla la ofrece cuando aún no hay datos guardados— para no reteclear a
       quien ya está en el equipo; luego se le suman los puestos sin nombre. */
    const vistosBen = new Set<string>();
    seedBenef = Object.entries(
      [...equipoPost, ...equipoProy].reduce((acc: Record<string, number>, m: any) => {
        const pid = m?.persona?.id;
        if (pid) { if (vistosBen.has(pid)) return acc; vistosBen.add(pid); }
        const rol = ((m?.cargo || "") as string).trim() || "Equipo";
        acc[rol] = (acc[rol] || 0) + 1;
        return acc;
      }, {})
    ).map(([rol, cantidad]) => ({ rol, cantidad: cantidad as number }));

    /* Precontratos para el checklist del expediente. "Firmado" solo cuenta si
       aún apunta a un ítem del presupuesto (uno huérfano no debe marcar listo). */
    const preItemIds = new Set(((ent.presupuesto as any)?.items || []).map((i: any) => i.id));
    const precLista = (ent.precontratos as any) || [];
    precontN = precLista.length;
    precontFirm = precLista.filter((x: any) => {
      if (x?.estado !== "firmado") return false;
      const ids = Array.isArray(x.item_ids) ? x.item_ids : (x.item_id ? [x.item_id] : []);
      return ids.some((id: string) => preItemIds.has(id));
    }).length;

    /* Los casos que atienden cada sección. Si alguno fue borrado simplemente
       no aparece y el botón vuelve a ofrecer encargarla — mejor que enlazar a
       un caso fantasma. */
    const mapa = (ent.expediente_casos as any) || {};
    const idsCaso = Object.values(mapa).filter(Boolean) as string[];
    if (idsCaso.length) {
      /* Vivos: un caso archivado o descartado no debe seguir apareciendo como
         «encargado» — la sección se leería atendida cuando no lo está. Al no
         resolverlo, el botón vuelve a ofrecer encargarla y la acción libera
         la clave vieja antes de crear la nueva. */
      const { data: cs } = await supabase.from("publicaciones")
        .select("id,titulo,estado,resp:perfiles!publicaciones_responsable_fkey(nombre)")
        .in("id", idsCaso).is("archivado_en", null).neq("estado", "descartada");
      const porId = new Map((cs || []).map((c: any) => [c.id, c]));
      Object.entries(mapa).forEach(([clave, cid]) => {
        const c = porId.get(cid as string);
        if (c) casosExp[clave] = { id: c.id, titulo: c.titulo, estado: c.estado, resp: (c as any).resp?.nombre || null };
      });
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
        .select("id,cargo,fecha_inicio,fecha_fin,estado,persona:personas(id,nombre,alias,foto_url,region,ruc_dni,dni_vencimiento,estado_sunat,condicion_sunat,nombre_reniec)")
        .eq("empresa_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      /* Con qué proyectos postuló, qué ganó y con qué equipo. Las fechas de
         rendición entran porque deciden si tiene un fondo encima —y por tanto
         si puede tomar otro—: sin `fecha_rendicion_real`, `ejecutando()`
         leería el hueco como «ya entregó». */
      supabase.from("postulaciones")
        .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real,codigo_acta,fecha_firma_acta,acta_url,matriz_jurado_url,puntaje_jurado,feedback_jurado,proy:proyectos(id,nombre),conv:convocatorias(id,nombre,anio),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url))")
        .eq("empresa_id", params.id).order("creado_en", { ascending: false }),
    ]);
    miembros = m.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    postusEmp = pe.data || [];
    /* Portadas de los proyectos con que postuló, para el chip con imagen. */
    const idsProyEmp = [...new Set(postusEmp.map((p: any) => p.proy?.id).filter(Boolean))] as string[];
    if (idsProyEmp.length) {
      const { data: mediaProy } = await supabase.from("entidad_media")
        .select("entidad_id,cartel_url").eq("entidad_tipo", "proyecto").in("entidad_id", idsProyEmp);
      (mediaProy || []).forEach((mm: any) => { if (mm.cartel_url) cartelesProy[mm.entidad_id] = mm.cartel_url; });
    }

    /* 🧱 Muro de la empresa — mismo componente y motor que el del proyecto.
       Necesita perfiles (para el @ de las menciones) y sus notas de bitácora. */
    const { data: pfE } = await supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre");
    perfilesCat = pfE || [];
    { const mm = await cargarMuro(); muroPosts = mm.posts; muroEtqs = mm.etqs; }

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
  let proyectosPropios: any[] = [];   // proyectos donde es del equipo (proyecto_equipo)
  let proyectosActor: any[] = [];     // obras donde figura como actor social (proyecto_actores)
  // Cartel (póster) de las entidades que aparecen en la trayectoria — clave `${tipo}:${id}`.
  let carteles = new Map<string, string>();
  let rheGirados: any[] = [];   // todos los RHE que giró, con su proyecto (pestaña Economía)
  let acum4ta = 0;   // lo girado este año en RHE
  let cuentaDe: { id: string; nombre: string; avatar_url?: string | null } | null = null;
  let cuentasLibres: { id: string; nombre: string }[] = [];
  let pulso: { cerr: number; creo: number; coments: number; ab: number; venc: number; ultimo: string } | null = null;
  if (params.tipo === "persona") {
    const [cg, cv, rh, pe, pr, cl, rg, pq, pa] = await Promise.all([
      supabase.from("empresa_miembros")
        .select("id,cargo,estado,fecha_inicio,fecha_fin,empresa:empresas(id,nombre,codigo)")
        .eq("persona_id", params.id).order("estado"),
      /* Los CVs viven en `objetos` (tipo='cv', titulo=enfoque) desde que el
         repositorio generalizó `persona_cv`. Se leen aparte porque su sección
         y sus alertas cruzan el enfoque con el cargo de cada postulación. */
      supabase.from("objetos").select("id,titulo,url,actualizado")
        .eq("entidad_tipo", "persona").eq("entidad_id", params.id).eq("tipo", "cv").order("titulo"),
      // RHE del año: para vigilar su tope de 4ta
      supabase.from("rhe").select("monto,fecha")
        .eq("persona_id", params.id).gte("fecha", `${new Date().getFullYear()}-01-01`),
      // Con qué postuló, con quién y por cuál empresa: el contexto completo
      supabase.from("postulacion_equipo")
        .select("id,cargo,cv_url,post:postulaciones(id,codigo,estado,monto_adjudicado,proy:proyectos(id,nombre),conv:convocatorias(id,nombre,anio),emp:empresas(id,nombre),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url)))")
        .eq("persona_id", params.id),
      supabase.from("equipo_prestamos")
        .select("id,desde,equipo:equipamiento(id,folio,nombre)")
        .eq("persona_id", params.id).is("hasta", null).order("desde", { ascending: false }),
      supabase.from("proyectos")
        .select("id,nombre,tipo")
        .eq("cliente_id", params.id).order("nombre"),
      // Todos los RHE girados por la persona, con su proyecto/fondo (para el
      // desglose por proyecto en la pestaña Economía — Mujunakuy y demás).
      supabase.from("rhe")
        .select("id,monto,fecha,numero,concepto,post:postulaciones(id,codigo,estado,proy:proyectos(id,nombre),conv:convocatorias(anio))")
        .eq("persona_id", params.id).order("fecha", { ascending: false }),
      /* Sus proyectos: en qué obras participa y con qué cargo. La relación vive
         en `proyecto_equipo` (del lado del proyecto). Es lo más «suyo» de su
         trayectoria —su filmografía—, y no se mostraba en ningún lado del perfil. */
      supabase.from("proyecto_equipo")
        .select("id,cargo,proy:proyectos(id,nombre,nombre_corto,tipo,etapa,estado_actividad)")
        .eq("persona_id", params.id),
      /* Y las obras donde figura como ACTOR SOCIAL (protagonista, comunero): la
         relación vive en `proyecto_actores`. Se mostraba del lado del proyecto
         pero no en la trayectoria de la persona —donde también es «lo suyo»—. */
      supabase.from("proyecto_actores")
        .select("id,rol,descripcion,personaje,proy:proyectos(id,nombre,nombre_corto,tipo,etapa,estado_actividad)")
        .eq("persona_id", params.id),
    ]);
    cargosDe = cg.data || [];
    rheGirados = rg.data || [];
    // Solo con proyecto real (una fila huérfana sin proyecto no dice nada) y con
    // los que se mueven arriba: dirigir pesa, y lo terminado va al final.
    proyectosPropios = (pq.data || []).filter((r: any) => r.proy).sort((a: any, b: any) => {
      const vivo = (x: any) => (x.proy?.estado_actividad || "activo") === "activo" && x.proy?.etapa !== "finalizado" ? 1 : 0;
      const dir = (x: any) => /direc|codirec/i.test(x.cargo || "") ? 1 : 0;
      return (vivo(b) - vivo(a)) || (dir(b) - dir(a)) || String(a.proy?.nombre).localeCompare(String(b.proy?.nombre));
    });
    // Obras como actor social: los vivos arriba, luego alfabético.
    proyectosActor = (pa.data || []).filter((r: any) => r.proy).sort((a: any, b: any) => {
      const vivo = (x: any) => (x.proy?.estado_actividad || "activo") === "activo" && x.proy?.etapa !== "finalizado" ? 1 : 0;
      return (vivo(b) - vivo(a)) || String(a.proy?.nombre).localeCompare(String(b.proy?.nombre));
    });
    // `titulo` → `enfoque`: la sección de CVs y sus alertas siguen igual.
    cvsDe = (cv.data || []).map((c: any) => ({ ...c, enfoque: c.titulo }));
    acum4ta = (rh.data || []).reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
    /* Una persona puede tener VARIAS filas en la misma postulación (Director +
       Autor): dedup por postulación para que su tarjeta no se duplique (sus
       roles se juntan luego, dentro de la fila, desde el equipo de la postu). */
    {
      const vistas = new Set<string>();
      postDe = (pe.data || [])
        .sort((a: any, b: any) => (b.post?.conv?.anio || 0) - (a.post?.conv?.anio || 0))
        .filter((r: any) => {
          const pid = r.post?.id; if (!pid) return true;
          if (vistas.has(pid)) return false;
          vistas.add(pid); return true;
        });
    }
    equiposEnMano = pr.data || [];
    clienteEnProy = cl.data || [];

    /* Carteles de las obras y empresas de su trayectoria: para adornar las
       filas con el póster del proyecto / logo de la empresa. Un solo query
       para todos los ids referenciados (proyectos + empresas). */
    const idsProy = new Set<string>();
    proyectosPropios.forEach((r: any) => r.proy?.id && idsProy.add(r.proy.id));
    proyectosActor.forEach((r: any) => r.proy?.id && idsProy.add(r.proy.id));
    clienteEnProy.forEach((p: any) => p.id && idsProy.add(p.id));
    postDe.forEach((r: any) => r.post?.proy?.id && idsProy.add(r.post.proy.id));
    rheGirados.forEach((r: any) => r.post?.proy?.id && idsProy.add(r.post.proy.id));
    const idsEmp = new Set<string>();
    cargosDe.forEach((c: any) => c.empresa?.id && idsEmp.add(c.empresa.id));
    postDe.forEach((r: any) => r.post?.emp?.id && idsEmp.add(r.post.emp.id));
    const idsMedia = [...idsProy, ...idsEmp];
    if (idsMedia.length) {
      const { data: mm } = await supabase.from("entidad_media")
        .select("entidad_tipo,entidad_id,cartel_url").in("entidad_id", idsMedia);
      (mm || []).forEach((m: any) => {
        if (m.cartel_url) carteles.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url);
      });
    }

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

    /* 🧱 Muro de la persona — mismo motor que proyecto/empresa. Reusa los
       perfiles ya cargados (para el @) y sus notas de bitácora. */
    perfilesCat = perfilesAll;
    { const mm = await cargarMuro(); muroPosts = mm.posts; muroEtqs = mm.etqs; }

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
          .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
          .is("archivado_en", null).limit(500),
        supabase.from("comentarios").select("id", { count: "exact", head: true })
          .eq("autor_id", ent.usuario_id),
      ]);
      const hoyStr = hoyLima();
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

  /* 📚 Repositorio: la cola infinita de la entidad (obras, prensa, premios…).
     Los CVs se excluyen: tienen su propia sección con la lógica del enfoque,
     aunque vivan en la misma tabla. Se estrena en persona. */
  const { data: objData } = await supabase.from("objetos")
    .select("id,tipo,titulo,url,fecha,notas,datos,creado_en,creado_por,quien:perfiles(nombre)")
    .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
    .neq("tipo", "cv")
    .order("fecha", { ascending: false, nullsFirst: false }).order("creado_en", { ascending: false });
  /* La procedencia del dato es parte del dato: quién lo trajo, con su alias
     (JohnO) como en el resto del sistema, y cuándo. */
  /* Y su contexto: a qué apunta, y qué se movió encima. Tres consultas planas
     acotadas a estos objetos —no un count embebido por fila—. Sin esto había
     que entrar a cada objeto para saber si alguien había hablado de él. */
  const idsObj = (objData || []).map((o: any) => o.id);
  const [{ data: ovs }, { data: ocs }, { data: oks }] = idsObj.length
    ? await Promise.all([
        supabase.from("objeto_vinculos").select("objeto_id").in("objeto_id", idsObj),
        supabase.from("comentarios").select("objeto_id").in("objeto_id", idsObj),
        supabase.from("publicacion_vinculos").select("entidad_id")
          .eq("entidad_tipo", "objeto").in("entidad_id", idsObj),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }] as any;
  const cuenta = (filas: any[], campo: string) => {
    const m = new Map<string, number>();
    (filas || []).forEach((r: any) => m.set(r[campo], (m.get(r[campo]) || 0) + 1));
    return m;
  };
  const nOV = cuenta(ovs, "objeto_id"), nOC = cuenta(ocs, "objeto_id"), nOK = cuenta(oks, "entidad_id");
  const objetosDe: any[] = (objData || []).map((o: any) => ({
    ...o, autor: (o.creado_por && alias[o.creado_por]) || o.quien?.nombre || null,
    n_vinculos: nOV.get(o.id) || 0,
    n_comentarios: nOC.get(o.id) || 0,
    n_casos: nOK.get(o.id) || 0,
    // Destacado en el muro (mismo modelo que las notas, en objetos.datos).
    destacado: !!o.datos?.destacado || typeof o.datos?.destacado_orden === "number",
    destOrden: typeof o.datos?.destacado_orden === "number" ? o.datos.destacado_orden : 0,
  }));

  /* MATERIALES DESTACADOS QUE LA PERSONA CREÓ EN OTROS MUROS.
     El carné personal junta las notas que dejó por el sistema (por autoría);
     con los materiales había una asimetría: solo traía los de su propio carné.
     Así, un material que creó DENTRO de un proyecto y destacó no aparecía en
     sus destacados. Aquí se traen esos —creados por la persona, dueño ajeno,
     y destacados— para mostrarlos agrupados por su proyecto de origen. */
  let objDestExternos: any[] = [];
  if (params.tipo === "persona" && ent.usuario_id) {
    const { data: objExt } = await supabase.from("objetos")
      .select("id,tipo,titulo,url,fecha,datos,entidad_tipo,entidad_id,creado_por,quien:perfiles(nombre)")
      .eq("creado_por", ent.usuario_id)
      .not("datos->>destacado_orden", "is", null)   // solo destacados (extracción de texto: null-check estándar)
      .neq("entidad_id", params.id)
      .limit(200);
    // Se reconfirma el destacado en JS: la correctitud no depende solo del filtro
    // de la base, y se excluye por si acaso cualquier objeto de este mismo carné.
    const externos = (objExt || []).filter((o: any) =>
      (o.datos?.destacado || typeof o.datos?.destacado_orden === "number")
      && !(o.entidad_tipo === params.tipo && o.entidad_id === params.id));
    // Nombre del muro de origen (dueño) de cada material.
    const TABLA_MURO2: Record<string, string> = { proyecto: "proyectos", empresa: "empresas", persona: "personas" };
    const porTipoO: Record<string, Set<string>> = {};
    externos.forEach((o: any) => { if (TABLA_MURO2[o.entidad_tipo]) (porTipoO[o.entidad_tipo] ||= new Set()).add(o.entidad_id); });
    const nombreOrigen = new Map<string, string>();
    await Promise.all(Object.entries(porTipoO).map(async ([tipo, ids]) => {
      const { data } = await supabase.from(TABLA_MURO2[tipo]).select("id,nombre").in("id", [...ids]);
      (data || []).forEach((r: any) => nombreOrigen.set(`${tipo}:${r.id}`, r.nombre));
    }));
    objDestExternos = externos.map((o: any) => ({
      ...o, autor: (o.creado_por && alias[o.creado_por]) || o.quien?.nombre || null,
      destacado: true,
      destOrden: typeof o.datos?.destacado_orden === "number" ? o.datos.destacado_orden : 0,
      fuenteObj: nombreOrigen.has(`${o.entidad_tipo}:${o.entidad_id}`)
        ? { tipo: o.entidad_tipo, id: o.entidad_id, nombre: nombreOrigen.get(`${o.entidad_tipo}:${o.entidad_id}`)! }
        : null,
    })).filter((o: any) => o.fuenteObj);   // sin nombre de origen no se puede agrupar
  }

  /* Objetos de OTROS que apuntan a esta entidad: el «Libro Khipukamaq» es de
     Jesús y es la base de «Los Khipus», así que el proyecto tiene que verlo
     —con su procedencia— sin que el libro deje de ser de su autor. */
  const { data: objVin } = await supabase.from("objeto_vinculos")
    .select("obj:objetos(id,tipo,titulo,url,fecha,entidad_tipo,entidad_id)")
    .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id);
  const objetosVinculados = (objVin || []).map((r: any) => r.obj).filter(Boolean);
  const duenosObj = await (async () => {
    const m = new Map<string, string>();
    const pares = objetosVinculados.map((o: any) => ({ tipo: o.entidad_tipo, id: o.entidad_id }));
    const porTipo = new Map<string, string[]>();
    pares.forEach((p: any) => porTipo.set(p.tipo, [...(porTipo.get(p.tipo) || []), p.id]));
    await Promise.all([...porTipo.entries()].map(async ([t, ids]) => {
      const n = nombreDe(t);
      if (!n) return;
      const { data } = await supabase.from(n.tabla)
        .select(["id", n.campo, n.corto].filter(Boolean).join(",")).in("id", ids);
      (data || []).forEach((r: any) => m.set(`${t}:${r.id}`, (n.corto && r[n.corto]) || r[n.campo] || "—"));
    }));
    return m;
  })();

  /* Verificaciones de contenido de los links de documentos (DNI, firma, CV…):
     quién confirmó que el link apunta al archivo correcto, y contra qué url.
     Se indexa por campo para pasárselo a cada botón. */
  /* Para CUALQUIER entidad: el repositorio verifica los links de sus objetos
     (campo `objeto:<id>`), no solo los documentos de persona y empresa. */
  const verifDe: Record<string, { url: string; por?: string | null; en?: string | null; correcto?: boolean }> = {};
  {
    const { data: vf } = await supabase.from("link_verificaciones")
      .select("campo,url,correcto,verificado_en,por:perfiles(nombre)")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id);
    (vf || []).forEach((r: any) => {
      verifDe[r.campo] = { url: r.url, por: r.por?.nombre, en: r.verificado_en, correcto: r.correcto };
    });
  }

  /* El AÑO en el título de la postulación. Un proyecto se presenta al mismo
     concurso varios años seguidos —«PO-040 · HexaFill» aparecía tres veces
     idéntico en el buscador, en los chips y en la pestaña del navegador— y el
     año es lo único que los distingue de un vistazo. Sale de la convocatoria,
     que es donde vive de verdad; si no la hay, el título queda como estaba. */
  /* El AÑO de la edición es parte del nombre: distingue la de 2026 de la de
     2025. En la postulación sale de su convocatoria; en la convocatoria, de su
     propio `anio`. Va pegado al título con « · », como un dato más del nombre. */
  const nombre = params.tipo === "postulacion"
    ? [`${ent.codigo || postCtx?.conv?.codigo || "Postulación"} · ${postCtx?.proy?.nombre || ""}`.replace(/ · $/, ""),
       postCtx?.conv?.anio || null].filter(Boolean).join(" · ")
    : params.tipo === "convocatoria"
    ? [ent.nombre || ent.codigo || "—", ent.anio || null].filter(Boolean).join(" · ")
    : ent.nombre || ent.codigo || "—";

  /* «Puesto por» también en el cronograma de proyecto/convocatoria: resolvemos
     el nombre de la cuenta creadora (incluidas inactivas) y lo adjuntamos, para
     que el componente no dependa de la nómina activa que recibe. */
  cronoActs = cronoActs.map((a: any) => ({ ...a, _creadoPor: a._creadoPor ?? (nombreCuenta.get(a.creado_por) || null) }));

  /* Contador del chip de cada postulación: cuántas NOTAS tiene su MURO (la
     conversación de una postulación vive en su muro; el chip lleva ahí). Se
     cuentan las bitácoras vinculadas a cada postulación, sobre los ids de la
     rama que se haya cargado. */
  {
    const idsPost = [
      ...postusProy.map((p: any) => p.id),
      ...postusEmp.map((p: any) => p.id),
      ...postDe.map((r: any) => r.post?.id),
    ].filter(Boolean) as string[];
    const uniq = [...new Set(idsPost)];
    if (uniq.length) {
      const { data: vinc } = await supabase.from("publicacion_vinculos")
        .select("entidad_id, publi:publicaciones(tipo)")
        .eq("entidad_tipo", "postulacion").in("entidad_id", uniq);
      for (const id of uniq) contadoresPost[id] = { c: 0, r: 0 };
      (vinc || []).forEach((v: any) => {
        const tipo = Array.isArray(v.publi) ? v.publi[0]?.tipo : v.publi?.tipo;
        if (tipo === "bitacora" && contadoresPost[v.entidad_id]) contadoresPost[v.entidad_id].c++;
      });
    }
  }

  /* Activas = vivas y a la vista. Cerradas = terminadas (resuelta/descartada)
     O archivadas —lo archivado es memoria de esta entidad y aquí sí se ve, en
     su cajón—. Ojo: `en_pausa` ahora cae en activas, que es lo correcto —está
     detenido, no cerrado—; antes caía en «cerradas» por descarte. */
  /* Un aviso VENCIDO (pasó su fecha límite) deja de regir y cae en «cerradas»
     solo, sin archivarlo a mano: sale del muro y del listado activo. */
  // Las notas de bitácora no son «trabajo»: viven en su pestaña Muro, no en la
  // lista de casos activos/cerrados.
  const pubsTrabajo = (pubs || []).filter((p: any) => p.tipo !== "bitacora");
  const activas = pubsTrabajo.filter((p: any) => !p.archivado_en && !CERRADOS.includes(p.estado) && !avisoVencido(p.tipo, p.fecha_limite));
  const cerradas = pubsTrabajo.filter((p: any) => p.archivado_en || CERRADOS.includes(p.estado) || avisoVencido(p.tipo, p.fecha_limite));

  const cardPub = (p: any) => {
    const hj = hijosDe.get(p.id);
    const rx = reaccDe.get(p.id) || [];
    const nComs = (p.comentarios as any)?.[0]?.count || 0;
    const esAv = esAviso(p.tipo);
    // Conteo por emoji, solo para la línea de meta de un caso normal: ahí las
    // reacciones son un dato que se lee, no un botón que se toca.
    const cuenta = new Map<string, number>();
    rx.forEach(r => cuenta.set(r.emoji, (cuenta.get(r.emoji) || 0) + 1));
    /* El AUTOR de un aviso ya está enterado: lo escribió él. Cuenta como
       enterado sin tener que clicar «me enteré» (era ilógico pedírselo). */
    const vistos = new Set(rx.filter(r => r.emoji === "👀").map(r => r.usuario_id));
    if (esAv && p.autor_id) vistos.add(p.autor_id);
    const esAutorAviso = esAv && p.autor_id === user.id;
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
          <b style={{ flex: 1, fontSize: TXT.meta }}>{p.titulo}</b>
          {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
          {/* Un aviso dice «Vigente», no «Sin Resolver»: nadie lo va a resolver.
              Si venció (pasó su fecha), ya no rige → «Vencido» en gris, no «Vigente». */}
          {avisoVencido(p.tipo, p.fecha_limite)
            ? <span className="pill st-descartada">📢 Vencido</span>
            : <span className={`pill st-${claseEstado(p.estado, p.tipo)}`}>{rotuloEstado(p.estado, p.tipo)}</span>}
          {/* Interactuar al vuelo, sin abrir otra pestaña */}
          <VistaRapida pubId={p.id} />
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
          {/* Vencimiento del aviso: hasta cuándo rige. En rojo si ya venció. */}
          {esAv && p.fecha_limite && (() => {
            const dl = /T/.test(p.fecha_limite) ? p.fecha_limite : p.fecha_limite + "T12:00:00";
            const pasado = new Date(dl) < new Date();
            return (
              <span title="Vencimiento del aviso" style={{ color: pasado ? "var(--red)" : "var(--yellow)" }}>
                ⏳ {pasado ? "venció" : "vence"} {new Date(dl).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            );
          })()}
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
              enterados={vistos.size}
              total={equipoAvisos.length || undefined}
              mio={vistos.has(user.id)}
              esAutor={esAutorAviso} />
            <Reacciones pubId={p.id} reacciones={rx} userId={user.id} />
          </div>
        )}
      </div>
    );
  };

  /* Portada (banner) + cartel (póster) de la entidad. Una fila por entidad en
     `entidad_media`; puede no existir todavía (imágenes opcionales). Para las
     personas solo se usa el banner: su avatar sigue en `personas.foto_url`. */
  const { data: media } = await supabase.from("entidad_media")
    .select("portada_url,cartel_url")
    .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id).maybeSingle();
  const conCartel = params.tipo !== "persona";

  /* Drive como «pestaña»: la carpeta Drive es un repositorio de contenido amplio,
     la misma lógica en toda entidad. Va en la fila de pestañas, justo antes del
     Historial (TabsPanel lo inserta ahí). Abre en otra pestaña del navegador. */
  const driveTab = ent.carpeta_drive_url ? (
    <a href={ent.carpeta_drive_url} target="_blank" rel="noopener noreferrer"
      className="vtab vtab-drive" title="Carpeta en Drive">📂 Drive ↗</a>
  ) : null;

  /* Veredicto del concurso para el carné: mismo sello estampado sobre la ficha
     de identidad. Postulación → su resultado; convocatoria → si ya cerró. */
  const resCarne = params.tipo === "postulacion" ? resultadoPostulacion(ent.estado)
    : params.tipo === "convocatoria" ? resultadoConvocatoria(ent.estado)
    /* Y un equipo fuera de juego —en reparación, no aparece, perdido, de
       baja—. El sello ya existía y el carné ya sabía estamparlo: lo único que
       faltaba era decir cuándo. Una línea, no un componente nuevo. */
    : params.tipo === "equipamiento" ? selloEquipo(ent.estado)
    : null;

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: TXT.chip, textTransform: "uppercase", letterSpacing: 1 }}>
          {conf.icono} {params.tipo}
        </span>
      </div>

      {/* Cabecera visual: banner de fondo + cartel encima. Editable por
          cualquiera del equipo, como el resto de la ficha. */}
      <PortadaEntidad tipo={params.tipo} id={params.id} nombre={nombre}
        portada={media?.portada_url} cartel={media?.cartel_url}
        color={COLOR_ENTIDAD[params.tipo] || "var(--violet)"}
        editable conCartel={conCartel} />

      {/* El nombre arranca a la derecha del cartel que sobresale. Pero cuando
          hay stepper (postulación/convocatoria/proyecto) el título arranca desde
          el inicio: el mini-cronograma de la derecha se come el espacio y un
          nombre largo necesita todo el ancho. El cartel queda arriba-izquierda,
          sin estorbar (no se solapa con esta fila). */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16,
        paddingLeft: conCartel && !["postulacion", "convocatoria", "proyecto"].includes(params.tipo) ? 108 : 0 }}>
        {/* A quien trabaja con nosotros le ponemos cara; a un contacto no.
            El actor social también lleva cara —su imagen (comunero, protagonista)
            es parte esencial de la obra, no un adorno—. */}
        {params.tipo === "persona" && ["personal", "colaborador", "colaborador eventual", "actor social"].includes(ent.tipo || "") ? (
          <>
            {/* Si ya tiene cuenta, su avatar del login sirve de foto: no hay
                que pedirle otra. La subida solo la reemplaza si quiere. */}
            {/* Grande y montada sobre el banner, como el cartel de las demás
                entidades: la cara es la identidad de la ficha, no un adorno. */}
            <span style={{ marginTop: -46, marginLeft: 18, zIndex: 2, borderRadius: "50%",
              border: "1px solid var(--border2)",
              boxShadow: "0 6px 18px rgba(0,0,0,.45)", lineHeight: 0 }}>
              <FotoPersona personaId={params.id} nombre={ent.nombre} size={96}
                foto={ent.foto_url || cuentaDe?.avatar_url} propia={!!ent.foto_url} />
            </span>
            {/* El nombre también se copia: es de los que Wilfredo pasa a
                mano a los formularios. El ícono queda fuera del valor —
                copiar «🏢 Kawsay Pacha» sería copiar mal. */}
            <h1 className="title-lg" style={{ margin: 0 }}>
              <Copiar valor={nombre} etiqueta="el nombre">{nombre}</Copiar>
            </h1>
          </>
        ) : (
          <h1 className="title-lg" style={{ margin: 0 }}>
            <Copiar valor={nombre} etiqueta="el nombre">{nombre}</Copiar>
          </h1>
        )}
        {/* De quién es (empresa o proyecto): nuestro, de un aliado o externo —
            se lee sin bajar a la ficha. En empresa, solo las propias generan
            alertas. */}
        {(params.tipo === "empresa" || params.tipo === "proyecto") && ent.relacion && (() => {
          const t: Record<string, [string, string]> = {
            propia: ["var(--violet)", "rgba(167,139,250,.14)"],
            aliada: ["var(--teal)", "rgba(45,212,191,.12)"],
            externa: ["var(--dim)", "rgba(150,150,170,.10)"],
          };
          const [col, bg] = t[ent.relacion] || t.externa;
          return <span className="badge" style={{ color: col, background: bg }}>{ent.relacion}</span>;
        })()}
        {/* El mismo gesto para otras entidades: un dato de identidad junto al
            nombre, sin bajar a la ficha. El tipo del proyecto y de la persona;
            el estado de la postulación (que es lo que la define). */}
        {params.tipo === "proyecto" && ent.tipo && (() => {
          // El badge del tipo de proyecto usa SU color de identidad (documental
          // teal, animación rosa…), no un azul fijo para todos.
          const c = TIPO_COLOR[String(ent.tipo)] || "var(--dim)";
          return (
            <span className="badge" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
              {String(ent.tipo).replace(/_/g, " ")}
            </span>
          );
        })()}
        {params.tipo === "persona" && ent.tipo && (
          // Subtipo de persona (personal/colaborador…): en la familia de la
          // persona (azul), no en teal —que es el color de empresa—.
          <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>
            {String(ent.tipo).replace(/_/g, " ")}
          </span>
        )}
        {/* Postulación y convocatoria son carreras con ciclo de vida: su estado
            cambia según avanzan. En vez de un badge estático (y de entrar al
            formulario para editarlo), un mini-cronograma editable ahí mismo. */}
        {(params.tipo === "postulacion" || params.tipo === "convocatoria") && (
          <Pasos tipo={params.tipo} id={params.id} estado={ent.estado} />
        )}
        {/* El proyecto también avanza por etapas (idea → … → finalizado): su
            mini-cronograma toma la `etapa`, no el estado. */}
        {params.tipo === "proyecto" && (
          <Pasos tipo="proyecto" id={params.id} estado={ent.etapa} subtipo={ent.tipo} />
        )}
        {/* El guion vive en su propia pantalla: la línea de tiempo narrativa
            es ancha —36 px por minuto— y no cabe junto al carné. Desde aquí
            se entra; el botón dice si ya hay algo escrito dentro. */}
        {params.tipo === "proyecto" && (
          <Link href={`/guion/${params.id}`} className="btn btn-ghost"
            style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}>
            ✍ Guion{nSecuencias ? ` · ${nSecuencias} sec` : ""}
          </Link>
        )}
        {/* Aquí vivía un "＋ Publicar" que te mandaba al feed con la entidad
            pre-vinculada. Lo hace el FAB flotante, sin sacarte de la ficha. */}
      </div>

      <div className="perfil-grid">
        {/* ===== COLUMNA IZQUIERDA: el carné ===== */}
        <aside>
          {/* Veredicto también sobre el carné: si el concurso terminó, el
              resultado se estampa sobre la ficha (con «✕» para cerrarlo). */}
          <div className={`card${resCarne ? " con-sello" : ""}`} style={resCarne ? { position: "relative" } : undefined}>
            {resCarne && <SelloResultado {...resCarne} variante="carne" />}
            {/* Cabecera del carné: QUIÉN compite. El banner del proyecto (con su
                cartel y nombre) al tope, para que a simple vista se lea de qué
                proyecto es esta postulación —no solo el sello del concurso. */}
            {params.tipo === "postulacion" && postCtx?.proy && (portadaProy || cartelProy) && (
              <Link href={`/entidad/proyecto/${postCtx.proy.id}`} className="post-banner"
                style={portadaProy ? { backgroundImage: `url(${portadaProy})` } : undefined}
                title={`Ir al proyecto: ${postCtx.proy.nombre}`}>
                <span className="post-banner-vel" />
                {cartelProy && <img src={cartelProy} alt="" referrerPolicy="no-referrer" className="post-banner-cartel" />}
                <span className="post-banner-txt">
                  <span className="post-banner-nom">{postCtx.proy.nombre}</span>
                  {postCtx.proy.tipo && <span className="post-banner-tipo">{postCtx.proy.tipo}</span>}
                </span>
              </Link>
            )}
            {/* Completitud de la ficha. Para los tipos sin campos de formulario
                (lugar, etiqueta) el componente se oculta solo. En postulación,
                convocatoria y proyecto no se muestra: la barra no aporta ahí. */}
            {!["postulacion", "convocatoria", "proyecto", "equipamiento"].includes(params.tipo) && (() => {
              const c = completitud(params.tipo, ent);
              return <Completitud pct={c.pct} llenos={c.llenos} total={c.total} faltan={c.faltan} />;
            })()}
            {/* 🎥 Equipo audiovisual: lo primero que se necesita saber es su
                ESTADO y QUIÉN lo tiene ahora. Va destacado al tope del carné; el
                registro de préstamos completo vive en su pestaña. */}
            {params.tipo === "equipamiento" && (() => {
              const actual = (prestamos as any[]).find(p => !p.hasta);
              /* De lib/estadosEquipo: esta copia pintaba «perdido» en
                 var(--red) y la lista de abajo en var(--dano). */
              const m = metaEstado(ent.estado);
              const est: [string, string] = [`${m.ico} ${m.txt}`, m.color];
              const fmtD = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div className="carne-equipo">
                  <div className="ce-estado" style={{ color: est[1] }}>{est[0]}</div>
                  {actual ? (
                    <div className="ce-portador" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <Link href={`/entidad/persona/${actual.persona?.id}`} style={{ flexShrink: 0 }}>
                        {actual.persona?.foto_url
                          ? // eslint-disable-next-line @next/next/no-img-element
                            <img src={actual.persona.foto_url} alt="" referrerPolicy="no-referrer"
                              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border2)" }} />
                          : <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</span>}
                      </Link>
                      <div style={{ minWidth: 0 }}>
                        <div>🤝 <Link href={`/entidad/persona/${actual.persona?.id}`} style={{ color: "var(--text)", fontWeight: 700 }}>{actual.persona?.alias || actual.persona?.nombre}</Link> lo tiene</div>
                        {actual.proy && <div className="ce-sub">para <Link href={`/entidad/proyecto/${actual.proy.id}`} style={{ color: "var(--violet)" }}>{actual.proy.nombre}</Link></div>}
                        <div className="ce-sub">desde {fmtD(actual.desde)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="ce-libre">Nadie lo tiene ahora — libre para prestar.</div>
                  )}
                </div>
              );
            })()}
            {/* 🎭 Actor(es) social(es): los personajes reales del documental —el
                corazón humano del proyecto—. Van al TOPE del carné, con su
                rostro grande. Normalmente uno; a veces dos, lado a lado. */}
            {params.tipo === "proyecto" && actoresProy.length > 0 && (
              <div className="carne-actores" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", marginBottom: 4 }}>
                {/* El rótulo lo decide el tipo, igual que en la pestaña: si aquí
                    dijera «actores sociales» y allá «personajes», serían dos
                    nombres para la misma lista en la misma pantalla. */}
                <div className="ca-titulo">
                  {rotuloActores(ent.tipo).ico}{" "}
                  {actoresProy.length > 1
                    ? `${rotuloActores(ent.tipo).titulo} · ${actoresProy.length}`
                    : rotuloActores(ent.tipo).titulo}
                </div>
                <div className="ca-lista">
                  {actoresProy.map((a: any) => {
                    const L = leerActor(a);
                    const q = personaDe(a);
                    /* Sin persona NO hay enlace. Con `href` a un id inexistente
                       salía `/entidad/persona/undefined`: un enlace roto que
                       parece bueno hasta que alguien lo pulsa. */
                    const cara = a.imagen_url || q?.foto_url;
                    const dentro = (
                      <>
                        {cara
                          ? // eslint-disable-next-line @next/next/no-img-element
                            <img src={cara} alt="" referrerPolicy="no-referrer" className="ca-foto" />
                          : <span className="ca-foto ca-foto-ph">🎭</span>}
                        <span className="ca-txt">
                          <span className="ca-nom">{L.titulo}</span>
                          {(L.pie || a.rol) && (
                            <span className="ca-rol">{[a.rol, L.pie].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </>
                    );
                    const tit = a.descripcion || L.titulo;
                    return q?.id
                      ? <Link key={a.id} href={`/entidad/persona/${q.id}`} className="ca-item" title={tit}>{dentro}</Link>
                      : <span key={a.id} className="ca-item" title={tit}>{dentro}</span>;
                  })}
                </div>
              </div>
            )}
            {/* 👥 Miembros de la empresa (activos) con su rostro, al tope del
                carné —quién la constituye—, igual que los actores de un
                proyecto. La edición/altas siguen en la pestaña Trayectoria. */}
            {params.tipo === "empresa" && (() => {
              const act = miembros.filter((m: any) => m.estado === "activo");
              if (!act.length) return null;
              const fmtDesde = (f?: string | null) => f
                ? new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
                : null;
              return (
                <div className="carne-actores" style={{ marginTop: 0, paddingTop: 0, borderTop: "none", marginBottom: 4 }}>
                  <div className="ca-lista">
                    {act.map((m: any) => (
                      <Link key={m.id} href={`/entidad/persona/${m.persona?.id}`} className="ca-item"
                        title={m.cargo || m.persona?.nombre}>
                        {m.persona?.foto_url
                          ? // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.persona.foto_url} alt="" referrerPolicy="no-referrer" className="ca-foto" />
                          : <span className="ca-foto ca-foto-ph">👤</span>}
                        <span className="ca-txt">
                          <span className="ca-nom">{m.persona?.alias || m.persona?.nombre || "—"}</span>
                          {m.cargo && <span className="ca-rol">{m.cargo}</span>}
                          {fmtDesde(m.fecha_inicio) && <span className="ca-desde">desde {fmtDesde(m.fecha_inicio)}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* La sinopsis/logline del proyecto: sube aquí, debajo de los actores
                —es de qué va la obra, el corazón—, antes de los datos técnicos
                (tipo, etapa, folio). En las demás entidades sigue al pie. */}
            {params.tipo === "proyecto" && ent.descripcion && (
              <p style={{ color: "var(--muted)", fontSize: TXT.micro, lineHeight: 1.5, margin: "2px 0 12px" }}>{ent.descripcion}</p>
            )}
            {/* Los enlaces del expediente (Drive, Bases, Matriz jurado, Acta…)
                se bajaron al pie del carné, junto al botón Editar: son
                herramientas, no datos, y arriba robaban la primera vista. */}

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
                /* ¿Postula con cargos que ningún CV cubre? Un CV BASE cubre sus
                   variantes: «Productor/a» vale para «Productor/a Ejecutivo/a».
                   La regla es por raíz —el enfoque del CV es prefijo del cargo—,
                   no coincidencia exacta, que marcaba «sin CV» a alguien que sí
                   tenía el de Productor solo porque postulaba como Ejecutivo. No
                   funciona al revés: un CV especializado no cubre el rol base. */
                const norm = (s: string) => s.trim().toLowerCase();
                const enfoques = cvsDe.map((c: any) => norm(c.enfoque));
                const cubierto = (cargo: string) => {
                  const c = norm(cargo);
                  return enfoques.some(e => c === e || c.startsWith(e + " "));
                };
                /* Solo la edición vigente: el CV se exige para lo que se va a
                   presentar ahora. Haber dirigido en 2020 no reclama un CV de
                   director hoy —esa postulación ya se cerró—. Sin fecha, se
                   asume vigente para no ocultar un pendiente real.
                   Y si la fila del equipo ya tiene su CV PRESENTADO (cv_url,
                   db/cv-postulacion.sql), ese cargo está cumplido: el CV
                   general pasa a ser materia prima, no requisito. */
                const anioActual = new Date().getFullYear();
                const cargosVigentes = postDe
                  .filter((r: any) => (r.post?.conv?.anio ?? anioActual) >= anioActual)
                  .filter((r: any) => !r.cv_url)
                  .map((r: any) => r.cargo).filter(Boolean);
                const sinCv = [...new Set(cargosVigentes)].filter((c: any) => !cubierto(c));
                if (sinCv.length) return (
                  <Alerta tono="ambar"
                    titulo={`📋 Postula como ${sinCv.join(", ")} pero no tiene CV con ese enfoque`}
                    detalle="Cada rol necesita su propio CV: el del director no sirve para presentarla como investigadora." />
                );
                const viejos = cvsDe.filter((c: any) =>
                  c.actualizado && (Date.now() - new Date(c.actualizado + "T12:00:00").getTime()) / 86400000 > DIAS_CV);
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
                    {/* Antes el rol se truncaba con su propio «+N ver más»,
                        pero ahora vive dentro del bloque «Ver más» del carné:
                        un desplegable dentro de otro sobra. Se muestra entero. */}
                    <Copiar valor={crudo(ent[key])} etiqueta={lbl.toLowerCase()}>
                      {verFicha(key, ent[key], ent)}
                    </Copiar>
                  </span>
                </div>
              ) : null;

            // Los botones viven en el bloque del dato al que pertenecen:
            // verificar/ficha con SUNAT, y los PDF con sus documentos.
            const rucPer = params.tipo === "persona" ? rucDePersona(ent.ruc_dni) : null;
            /* El botón de verificación AUTOMÁTICA (RENIEC/SUNAT) va en la esquina
               superior derecha de su panel, no mezclado con los documentos. */
            const verificarBtn: Record<string, any> = params.tipo === "persona"
              ? { [DNI_PERSONA]: ent.ruc_dni ? <BotonVerificarDni personaId={params.id} /> : null,
                  [SUNAT_PERSONA]: rucPer ? <BotonRucPersona personaId={params.id} /> : null }
              : params.tipo === "empresa"
              ? { [SUNAT_EMPRESA]: ent.ruc ? <BotonVerificarRuc empresaId={params.id} /> : null }
              : {};
            const extras: Record<string, any> = params.tipo === "persona" ? {
              [DNI_PERSONA]: (
                <>
                  {/* El DNI (número) va arriba con sus datos de verificación
                      —vence, verificado en RENIEC, nombre RENIEC—; las fotos
                      escaneadas (DNI y firma) van al final del panel. */}
                  {ent.dni_url && <LinkVerificable tipo={params.tipo} id={params.id} campo="dni_url" url={ent.dni_url} etiqueta="DNI" icono="🪪" verif={verifDe.dni_url} />}
                  {ent.firma_url && <LinkVerificable tipo={params.tipo} id={params.id} campo="firma_url" url={ent.firma_url} etiqueta="Firma" icono="✍️" verif={verifDe.firma_url} />}
                </>
              ),
              [SUNAT_PERSONA]: rucPer && (
                <>
                  <span style={{ color: "var(--dim)", fontSize: TXT.chip, alignSelf: "center" }}>
                    RUC calculado: <b style={{ color: "var(--text)" }}>{rucPer}</b>
                  </span>
                  <BotonFichaSunat numero={ent.ruc_dni} tipo="DNI" url={urlSunat} />
                  {ent.suspension_4ta_url && (
                    <LinkVerificable tipo={params.tipo} id={params.id} campo="suspension_4ta_url" url={ent.suspension_4ta_url} etiqueta="Constancia 4ta" icono="🧾" verif={verifDe.suspension_4ta_url} />
                  )}
                  {/* Cuánto lleva del tope de 4ta con nosotros este año */}
                  {acum4ta > 0 && (() => {
                    const e = estado4ta(acum4ta, new Date().getFullYear());
                    const col = e.supero ? "var(--red)" : e.cerca ? "var(--yellow)" : "var(--green)";
                    return (
                      <span style={{ width: "100%", marginTop: 2 }}>
                        <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: TXT.chip }}>
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
              /* «OTROS DOCUMENTOS» se retiró: el CV legado (cv_url) se migró a los
                 CVs por enfoque (persona_cv) de la pestaña 🏆 Trayectoria, y la
                 carpeta Drive sale como chip limpio abajo. No queda nada que
                 mostrar en un panel aparte. */
            } : params.tipo !== "empresa" ? {} : {
              [SUNAT_EMPRESA]: ent.ruc && (
                <>
                  <BotonFichaSunat numero={ent.ruc} url={urlSunat} />
                </>
              ),
              [DOCS_EMPRESA]: (
                <>
                  {/* RENCA y Vigencia suben junto a su campo (linkDeCampo). Drive
                      se mudó a la fila de pestañas, como en todas las entidades.
                      La HojaPostulacion (elegibilidad DAFO) está en su pestaña. */}
                </>
              ),
            };
            /* Cada documento escaneado va JUNTO a su campo —RENCA bajo su código,
               DNI bajo su número—, no amontonados abajo. Lo que no tiene campo
               propio (firma, CV, Drive…) queda en `extras`, al final del panel. */
            const linkDeCampo: Record<string, any> = params.tipo === "empresa" ? {
              partida_electronica: ent.partida_electronica_url && <LinkVerificable tipo={params.tipo} id={params.id} campo="partida_electronica_url" url={ent.partida_electronica_url} etiqueta="Partida electrónica" icono="📄" verif={verifDe.partida_electronica_url} />,
              renca: ent.renca_url && <LinkVerificable tipo={params.tipo} id={params.id} campo="renca_url" url={ent.renca_url} etiqueta="RENCA" icono="🎬" verif={verifDe.renca_url} />,
              vigencia_poder_fecha: ent.vigencia_poder_url && <LinkVerificable tipo={params.tipo} id={params.id} campo="vigencia_poder_url" url={ent.vigencia_poder_url} etiqueta="Vigencia de poder" icono="📜" verif={verifDe.vigencia_poder_url} />,
            } : {};
            /* (Persona: el DNI escaneado NO se interleava con el número —sus
               datos de verificación deben quedar juntos arriba—, va al final del
               panel junto con la firma; ver extras[DNI_PERSONA].) */

            const sueltos = conf.campos.filter(c => !c[2]);
            /* Hay grupos que solo traen botones y ningún campo (ej. 📎
               Documentos de una persona): también deben pintarse. */
            const gruposF = [...new Set([
              ...conf.campos.map(c => c[2]).filter(Boolean),
              ...Object.keys(extras),
            ])] as string[];
            const renderGrupo = (g: string) => {
              const camposG = conf.campos.filter(c => c[2] === g);
              const tieneFila = (c: [string, string, string?]) => ent[c[1]] != null && ent[c[1]] !== "";
              const btns = extras[g];
              const vBtn = verificarBtn[g];
              // Hay contenido si algún campo está lleno o si trae un doc escaneado.
              const hayFilas = camposG.some(c => tieneFila(c) || linkDeCampo[c[1]]);
              if (!hayFilas && !btns && !vBtn) return null;
              const azul = GRUPO_TONO[g] === "azul";
              /* Sección plegable con MEMORIA (Plegable, nivel 3): el carné se
                 puede colapsar sección por sección y recuerda el estado. El
                 tinte le da a IDENTIDAD/SUNAT su color (azul/ámbar). */
              return (
                <Plegable key={g} id={`${params.tipo}:${params.id}:grupo:${g}`} nivel={3}
                  tinte={azul ? "var(--blue)" : "var(--yellow)"}
                  titulo={
                    <span style={{ fontSize: TXT.chip, textTransform: "uppercase", letterSpacing: 1, color: azul ? "var(--blue)" : "var(--yellow)", fontWeight: 700 }}>
                      {g.split("—")[0].trim()}
                    </span>
                  }>
                  {vBtn && (
                    <div className={`grupo-verif ${azul ? "gv-azul" : "gv-amber"}`}
                      style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {vBtn}
                    </div>
                  )}
                  {/* Cada campo lleno + (si lo tiene) su documento escaneado.
                      Los que traen documento van en su propia CAJA —RENCA,
                      Vigencia, Partida quedan claramente separados—; el resto,
                      como filas normales. */}
                  {camposG.flatMap(c => {
                    const link = linkDeCampo[c[1]];
                    const fila = tieneFila(c);
                    if (!fila && !link) return [];
                    if (link) return [
                      <div key={`doc-${c[1]}`} className="doc-bloque">
                        {fila && pintarFila(c)}
                        <div style={{ marginTop: fila ? 6 : 0 }}>{link}</div>
                      </div>,
                    ];
                    return [pintarFila(c)];
                  })}
                  {btns && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{btns}</div>
                  )}
                </Plegable>
              );
            };
            // Primarios a la vista; lo secundario (campos base descriptivos +
            // grupos plegables + campos sueltos extra) en un solo «Ver más», para
            // que la ficha cargue sin saturarse.
            const secKeys = new Set(CAMPOS_SECUNDARIOS[params.tipo] || []);
            const sueltosVis = sueltos.filter(c => !secKeys.has(c[1]));
            const sueltosSec = sueltos.filter(c => secKeys.has(c[1]));
            const gruposPri = gruposF.filter(g => !GRUPOS_SECUNDARIOS.has(g));
            const gruposSec = gruposF.filter(g => GRUPOS_SECUNDARIOS.has(g));
            const extraCampos = camposSecundarios(params.tipo, ent, conf.campos.map(c => c[1]));
            const secDibujados = gruposSec.map(renderGrupo).filter(Boolean);
            const nBase = sueltosSec.filter(c => ent[c[1]] != null && ent[c[1]] !== "").length;
            const nVerMas = nBase + extraCampos.length;
            const haySec = nVerMas > 0 || secDibujados.length > 0;
            /* Postulación, convocatoria y proyecto tienen POCA info de
               referencia: no la escondemos tras «Ver más», se muestra toda. */
            const sinVerMas = ["postulacion", "convocatoria", "proyecto", "equipamiento"].includes(params.tipo);
            const secInner = (
              <div style={{ marginTop: 2 }}>
                {sueltosSec.map(pintarFila)}
                <FilasDatos campos={extraCampos} valores={ent} />
                {secDibujados}
              </div>
            );
            return (
              <>
                {sueltosVis.map(pintarFila)}
                {gruposPri.map(renderGrupo)}
                {/* La carpeta Drive se mudó a la fila de pestañas (antes del
                    Historial), como en todas las entidades. */}
                {haySec && (sinVerMas ? secInner : (
                  <details className="mas-datos">
                    <summary>Ver más{nVerMas ? <span className="md-n">{nVerMas}</span> : null}</summary>
                    {secInner}
                  </details>
                ))}
              </>
            );
            })()}
            {/* En proyecto la descripción ya subió (debajo de los actores); aquí
                se mantiene para las demás entidades. */}
            {params.tipo !== "proyecto" && ent.descripcion && <p style={{ color: "var(--muted)", fontSize: TXT.micro, lineHeight: 1.5, marginTop: 10 }}>{ent.descripcion}</p>}
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
            {/* Enlaces del expediente, en una sola fila al pie del carné (si son
                muchos, se desplazan de lado en vez de saltar de línea). */}
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", marginTop: 12 }}>
              {/* Drive se mudó a la fila de pestañas (antes del Historial): es un
                  repositorio de contenido, la misma lógica en toda entidad. */}
              {ent.bases_url && (
                <a href={ent.bases_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>📖 Bases</a>
              )}
              {ent.presupuesto_url && (
                <a href={ent.presupuesto_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>💰 Presupuesto</a>
              )}
              {ent.matriz_jurado_url && (
                <a href={ent.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>📊 Del jurado</a>
              )}
              {ent.acta_url && (
                <a href={ent.acta_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>🖋 Acta compromiso</a>
              )}
              {params.tipo !== "empresa" && ent.renca_url && (
                <a href={ent.renca_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>🎬 RENCA</a>
              )}
              {params.tipo !== "empresa" && ent.vigencia_poder_url && (
                <a href={ent.vigencia_poder_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: TXT.chip, padding: "7px 9px", whiteSpace: "nowrap", flex: "0 0 auto" }}>📜 Vigencia</a>
              )}
              {/* En persona, CV/DNI/Firma/Drive van dentro del bloque 📎 Documentos */}
            </div>
            <div className="carne-acciones" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Mantenimiento tipo={params.tipo} id={params.id} valores={ent} />
              {/* ＋ NUEVO, DESDE LA FICHA. Dar de alta varios seguidos es lo
                  normal —llega una compra y son ocho equipos— y el único botón
                  para crear estaba en el listado: había que volver, buscarlo y
                  empezar. El sitio donde acabas después de crear uno es
                  justamente donde hace falta poder crear el siguiente.
                  Solo para los tipos que se dan de alta en tanda; una empresa
                  o un proyecto se crean de uno en uno y ahí sería ruido. */}
              {["equipamiento", "persona", "lugar"].includes(params.tipo) && (
                <Link href={`/entidad/${params.tipo}/nuevo`} className="btn btn-ghost"
                  title={`Registrar otro ${conf.tabla === "equipamiento" ? "equipo" : params.tipo}`}>
                  ＋ Nuevo
                </Link>
              )}
              {/* Los de empresa (verificar / ficha SUNAT) van en el bloque 🏛 SUNAT */}
              {/* Verificar DNI vive ahora en el bloque 🪪 Identidad */}
            </div>
          </div>

          {/* ── DE QUÉ COMPRA VINO ──
              La procedencia contesta «¿está en garantía?», «¿qué más vino con
              esto?» y «¿cuánto costó de verdad?». Estaba en `comprado_en`, un
              texto suelto que no llevaba a ninguna parte.
              Se ve SIEMPRE, con combo o sin él: si el panel solo apareciera
              cuando el dato ya está, no habría forma de ponerlo. */}
          {/* ── DE QUÉ ESTÁ HECHO ──
              Va ANTES del combo y de los kits porque es lo más físico de los
              tres: el combo dice con qué entró, el kit con qué sale, y esto
              qué ES la cosa que tienes delante. */}
          {params.tipo === "equipamiento" && (
            <Ensamblado equipoId={params.id} montadoEn={montadoEn}
              piezas={piezasMontadas} candidatos={candidatosMontar as any} />
          )}

          {params.tipo === "equipamiento" && (
            <ComboDelEquipo equipoId={params.id} combo={comboDelEq} hermanas={hermanasCombo}
              compras={comprasCat.map((c: any) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))} />
          )}

          {/* ── DE QUÉ KITS FORMA PARTE ──
              Va ANTES de «equipos relacionados» porque no es lo mismo: el kit
              es una decisión que alguien tomó —esto sale junto—, y lo
              relacionado es un parecido que calcula la máquina. Lo decidido
              manda sobre lo inferido. */}
          {/* (Aquí se listaban las unidades del combo, en su ficha. Ahora eso
              lo enseña la vista al vuelo, y manejarlas vive en el panel de
              combos de /equipamiento — que es donde se piensa en equipos.) */}

          {params.tipo === "equipamiento" && kitsDelEq.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
                📦 {kitsDelEq.length === 1 ? "Forma parte de un kit" : `Forma parte de ${kitsDelEq.length} kits`}
              </h4>
              {kitsDelEq.map(k => {
                const est = estadoKit(k.piezas);
                const res = resumenKit(est);
                /* Este equipo se marca dentro de la lista: sin señal hay que
                   buscar el folio propio entre cinco para saber cuál es. */
                const ordenadas = [...est.libres, ...est.prestadas, ...est.vetadas];
                return (
                  <div key={k.id} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                      <Link href={`/equipamiento?kit=${k.id}#entregar`} style={{ fontSize: TXT.micro, fontWeight: 700, color: "var(--violet)" }}>
                        📦 {k.nombre}
                      </Link>
                      {k.uso && <span className="badge kit-uso">{k.uso}</span>}
                      {k.retirado && <span className="badge" style={{ color: "var(--dim)", background: "rgba(255,255,255,.05)", fontSize: 10.5 }}>retirado</span>}
                      <span style={{ color: res.color, fontSize: TXT.chip, fontWeight: 600 }}>{res.txt}</span>
                    </div>
                    <PiezasKit piezas={ordenadas} yo={params.id} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Equipos relacionados (automático por categoría): de una cámara de
              acción, las otras cámaras de acción y demás cámaras. Al pie del
              carné, con su foto y estado; cada uno enlaza a su ficha. */}
          {params.tipo === "equipamiento" && relacionados.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
                🔗 Equipos relacionados
              </h4>
              {relacionados.map((r: any) => {
                const cartel = cartelRel.get(r.id);

                return (
                  <Link key={r.id} href={`/entidad/equipamiento/${r.id}`} className="info-row" style={{ textDecoration: "none" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 7, flexShrink: 0, overflow: "hidden", background: "var(--bg)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
                      {cartel
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cartel} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : "🎥"}
                    </span>
                    {r.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{r.folio}</span>}
                    <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{r.nombre}</b>
                    <span style={{ color: colorEstadoEq(r.estado), fontSize: TXT.chip }}>{txtEstadoEq(r.estado)}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Postulaciones y fondos, equipo del proyecto y cliente ya no viven
              en el carné: se mudaron a la pestaña «Trayectoria» del proyecto
              (main), igual que los miembros de una empresa. */}

          {/* Las postulaciones de la convocatoria ya no viven en el carné: se
              mudaron a su pestaña «Postulaciones» (main), con más espacio. */}

          {params.tipo === "postulacion" && (
            <div style={{ marginTop: 14 }}>
              {/* Contexto y Equipo se mudaron a la pestaña «👥 Equipo» de la
                  columna ancha (en una postulación el equipo pesa, y ahí tiene
                  espacio). El carné se queda con los accesos y el calendario. */}
              {/* La línea de tiempo del concurso va en la columna pequeña: es
                  una referencia (fechas del Ministerio), no el trabajo — la
                  columna ancha queda para el cronograma y el presupuesto. */}
              {hitosConc.length > 0 && EN_JUEGO.includes(ent.estado) && (
                <div className="card" style={{ marginTop: 14 }}>
                  <div className="panel-h">📅 Línea de tiempo del concurso — la carrera de esta postulación</div>
                  <LineaTiempo eventos={hitosConc.map((h: any) => ({
                    fecha: h.fecha_inicio, titulo: h.nombre, icono: "🏛",
                    color: h.estado === "finalizada" ? "#4a4a5e" : "var(--violet)",
                    autor: (nombreCuenta.get(h.creado_por) || "").split(" ")[0] || undefined,
                  }))} />
                </div>
              )}
              {/* Los accesos de la empresa van al final del carné: son una
                  herramienta (entrar a DAFO / al correo), no datos de la
                  postulación — cierran la columna sin robar la vista. */}
              {/* Primero lo de la POSTULACIÓN y después lo de la empresa: son
                  cosas distintas y el orden lo dice —lo declarado en este
                  expediente arriba, la herramienta para entrar abajo—. */}
              <ContactosPostulacion postulacionId={params.id} datos={contactosPost} />
              <CredencialesRef creds={credsEmp} empresaId={(postCtx?.emp as any)?.id} />
            </div>
          )}

          {/* 📌 Destacados del muro: lo importante del proyecto a la mano —notas
              del muro Y material del repositorio, mezclados y reordenables
              (arrastrar y soltar). Solo donde hay muro: proyecto/empresa/persona. */}
          {["proyecto", "empresa", "persona"].includes(params.tipo) && (() => {
            const destPosts = muroPosts.filter((p: any) => p.destacado).map((p: any) => ({
              kind: "post" as const, id: p.id, orden: p.destOrden ?? 0,
              cuerpo: p.cuerpo, imagen: (p.imagenes || [])[0] || null, nImgs: (p.imagenes || []).length,
              fecha: new Date(p.creado_en).toLocaleDateString("es-PE", { day: "numeric", month: "short" }),
              tag: (p.tags || [])[0] || null,
              fuente: p.fuente || null,   // muro de origen (si es de otro carné)
            }));
            // Material destacado: los de este carné (fuente propia) + los que la
            // persona creó en OTROS muros (fuente = su proyecto de origen).
            const destObjsPropios = objetosDe.filter((o: any) => o.destacado).map((o: any) => ({
              kind: "obj" as const, id: o.id, orden: o.destOrden ?? 0,
              titulo: o.titulo, tipo: o.tipo, url: o.url, autor: o.autor || null,
              fecha: o.fecha ? new Date(o.fecha + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : null,
              fuente: null,   // el material del repositorio vive en este carné
            }));
            const destObjsExternos = objDestExternos.map((o: any) => ({
              kind: "obj" as const, id: o.id, orden: o.destOrden ?? 0,
              titulo: o.titulo, tipo: o.tipo, url: o.url, autor: o.autor || null,
              fecha: o.fecha ? new Date(o.fecha + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : null,
              fuente: o.fuenteObj,   // el proyecto/empresa donde la persona lo creó
            }));
            const destObjs = [...destObjsPropios, ...destObjsExternos];
            const destacados = [...destPosts, ...destObjs]
              .sort((a, b) => a.orden - b.orden)
              .map(({ orden, ...rest }) => rest);
            return destacados.length > 0 ? (
              <DestacadosMuro entidadTipo={params.tipo} entidadId={params.id} entidadNombre={(ent as any).nombre} items={destacados} />
            ) : null;
          })()}

          {/* Los miembros/plantilla de la empresa se mudaron a la pestaña
              🏆 Trayectoria (columna derecha). */}

          {/* El registro de préstamos (prestar / devolver / historial) se mudó a
              la pestaña 🤝 Préstamos de la columna ancha; en el carné solo queda
              el resumen de arriba (estado + quién lo tiene). */}

          {/* «Cargos en empresas» y «CVs por enfoque» se mudaron a la pestaña
              🏆 Trayectoria (columna derecha): son recorrido profesional —dónde
              milita, su hoja de vida— no papeles de identidad del carné. */}

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
                    <span style={{ color: "var(--dim)", fontSize: TXT.chip, marginLeft: 8 }}>
                      desde {new Date(r.desde + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* «Cliente de proyectos» y los CVs por enfoque viven ahora en la
              pestaña 🏆 Trayectoria (columna derecha). */}

          {/* El repositorio se mudó a la columna ancha: el carné es «quién es»,
              y las obras y referencias son su producción — crecen, y con cinco
              campos y miniaturas no caben en una columna angosta. */}

          {(params.tipo === "empresa" || params.tipo === "persona") && (
            <Credenciales dueno={params.tipo as "empresa" | "persona"} duenoId={params.id} credenciales={creds} />
          )}

          {params.tipo === "persona" && (ent.usuario_id || ent.tipo === "personal") && (
            <CuentaAcceso personaId={params.id} cuenta={cuentaDe} libres={cuentasLibres} />
          )}
        </aside>

        {/* ===== COLUMNA DERECHA: la vida ===== */}
        <main>
          {/* 📚 Repositorio: todo lo que se sabe y no cabe en el formulario.
              En cualquier entidad — un proyecto acumula referencias y prensa
              igual que una persona acumula obras. En PERSONA, EMPRESA y PROYECTO
              vive en su propia pestaña (abajo), no aquí arriba. */}
          {params.tipo !== "persona" && params.tipo !== "empresa" && params.tipo !== "proyecto" && params.tipo !== "convocatoria" && params.tipo !== "postulacion" && params.tipo !== "equipamiento" && (
            <>
              <Repositorio entidadTipo={params.tipo} entidadId={params.id}
                objetos={objetosDe} verif={verifDe} />
              {/* Objetos de OTROS que apuntan aquí: el libro de Jesús que sostiene
                  este proyecto. Se muestra con su procedencia, no se apropia. */}
              {objetosVinculados.length > 0 && (
                <div className="linked" style={{ marginTop: 14 }}>
                  <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                  {objetosVinculados.map((o: any) => (
                    <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                      {previewCandidates(o.url, 200).length
                        ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                        : <span>{icoObjeto(o.tipo)}</span>}
                      <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                      <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                        de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* La columna ancha de la postulación (armado, expediente, ejecución,
              repositorio, historial) se ensambla en pestañas dentro de la rama
              `postulacion` del IIFE de abajo, junto al resto de las entidades. */}
          {/* El palmarés (postulaciones) y los miembros de la empresa se mudaron
              a la pestaña 🏆 Trayectoria (columna derecha). */}
          {(() => {
            /* El historial, solo la línea de tiempo (sin el <details>): así se
               puede montar tanto dentro de `vida` (plegado, para los demás
               tipos) como suelto en su propia pestaña (persona). */
            /* Los filtros del diario, aquí dentro. El agrupado, el `conEntidad`
               por línea y el «nada con esos filtros» viven en el componente:
               una ficha que reúne 120 eventos de casos, cronograma y
               postulaciones no se lee de corrido, se hojea. */
            const histInner = (
              <HistorialFicha vacio="Sin eventos registrados aún." total={totEventos}
                eventos={(eventosVis as any[]).map(e => ({ ...e, hora: fecha(e.creado_en) }))} />
            );
            /* Metadatos de un caso para la lista con filtros. «Mío» = soy el
               responsable (viewer); apagado = me incumbe pero lo trabaja otro. */
            const metaCaso = (p: any): CasoMeta => ({
              id: p.id,
              titulo: p.titulo || "",
              rotulo: rotuloEstado(p.estado, p.tipo),
              clase: claseEstado(p.estado, p.tipo),
              resp: (p.resp as any)?.nombre ? (p.resp as any).nombre.split(" ")[0] : null,
              mio: p.responsable === user?.id,
              marca: p.responsable === user?.id ? null
                : p.autor_id === user?.id ? "delegado" : "mencion",
              node: cardPub(p),
            });
            /* Los AVISOS no son casos: rigen, no se resuelven. Van a su muro
               —arriba, sin filtros—; los casos, a la lista de abajo. */
            const avisosAct = activas.filter((p: any) => esAviso(p.tipo));
            const casosAct = activas.filter((p: any) => !esAviso(p.tipo));
            /* El trabajo: muro de avisos + casos activos + cerrados. */
            const trabajoNode = (
              <>
                <MuroAvisos id={`persona:${params.id}`} avisos={avisosAct.map(cardPub)} />
                <div className="h4" style={{ marginTop: 0 }}>
                  🔥 Casos activos · {casosAct.length}
                </div>
                {/* Con muchos casos, filtros + vistas + búsqueda (que también
                    alcanza las cerradas); con pocos, la lista pelada. */}
                {casosAct.length > 6 ? (
                  <CasosLista ambitoId={params.id}
                    misInicial={!!user && ent.usuario_id === user.id}
                    casos={casosAct.map(metaCaso)}
                    cerrados={cerradas.map(metaCaso)} />
                ) : (
                  <>
                    {casosAct.map(cardPub)}
                    {!casosAct.length && (
                      <div className="empty" style={{ padding: "18px 0" }}>
                        Sin casos abiertos sobre {nombre} — todo en orden.
                      </div>
                    )}
                    {cerradas.length > 0 && (
                      <details style={{ marginTop: 16 }}>
                        <summary style={{ color: "var(--muted)", fontSize: TXT.micro, cursor: "pointer", padding: "6px 0" }}>
                          ✅ Cerradas y archivadas · {cerradas.length}
                        </summary>
                        <div style={{ marginTop: 10 }}>{cerradas.map(cardPub)}</div>
                      </details>
                    )}
                  </>
                )}
              </>
            );
            /* `vida` = trabajo + historial (plegado). Para persona, el historial
               se saca a su propia pestaña, así que allí se usan por separado. */
            const vida = (
              <>
                {trabajoNode}
                {eventosVis.length > 0 && (
                  <details open style={{ marginTop: 16 }}>
                    <summary style={{ color: "var(--muted)", fontSize: TXT.micro, cursor: "pointer", padding: "6px 0" }}>
                      🕐 Historial de {nombre} · {totEventos} eventos
                    </summary>
                    {histInner}
                  </details>
                )}
              </>
            );

            if (params.tipo === "postulacion") {
              // (La línea de tiempo del concurso se calcula arriba —hitosConc— y
              //  se muestra en la columna pequeña.)
              const esGanadora = ent.estado === "ganadora";
              const conPlantilla = !!(postCtx?.conv as any)?.plantilla_formulario;
              const nMat = ((ent.material_archivo as any) || []).length;
              const nBen = ((ent.beneficiarios as any) || []).length;
              const dim = (t: string) => <span style={{ color: "var(--dim)", fontWeight: 400 }}>{t}</span>;
              /* Extras del formulario de VIDEOJUEGO: la tabla de material cambia
                 a «materiales gráficos», aparece la de prototipo, y el checklist
                 gana el campo «Producto que resultará». */
              const catConv = (postCtx?.conv as any)?.categoria as string | undefined;
              const esVJ = esVideojuego(catConv);
              const matTabla = materialTablaDe(catConv);
              const nProto = ((ent.prototipo as any) || []).length;
              /* Obra de terceros: es CONDICIONAL. El combo «Usa obra de terceros»
                 vive en la plantilla; si su respuesta es «Sí», mostramos la tabla. */
              const plantFormR = (postCtx?.conv as any)?.plantilla_formulario as any[] | undefined;
              const claveTerceros = (Array.isArray(plantFormR) ? plantFormR : [])
                .flatMap((s: any) => s?.campos || [])
                .find((c: any) => /obra\s+de\s+terceros/i.test(String(c?.etiqueta || "")))?.k as string | undefined;
              const usaTerceros = !!claveTerceros
                && /^s[ií]/i.test(String((ent.expediente as any)?.[claveTerceros]?.v || ""));
              const nTerceros = ((ent.obra_terceros as any) || []).length;
              /* La postulación termina su ciclo cuando se gana: la EJECUCIÓN es
                 otro ciclo y tiene su propio sitio (📁 fondos en ejecución →
                 /fondo/[id]). Por eso aquí no hay pestaña de ejecución; el
                 armado, para una ganadora, solo enlaza a esa página. */

              /* Las secciones del expediente —cronograma, presupuesto, material,
                 precontratos, beneficiarios—, dentro de la pestaña 🗂 Expediente
                 debajo de su checklist. Una GANADORA no borra nada: su
                 cronograma y presupuesto POSTULADOS quedan como la foto de con
                 qué ganó; arriba, una tarjeta la lleva a la ejecución del fondo,
                 donde vive el presupuesto y cronograma REALES de los dos años. */
              const armadoNode = (
                <div>
                  {esGanadora && (
                    <Link href={`/fondo/${params.id}`} className="card"
                      style={{ display: "block", textDecoration: "none", marginBottom: 14,
                        borderColor: "rgba(46,204,113,.4)", background: "rgba(46,204,113,.06)" }}>
                      <div style={{ fontWeight: 700, fontSize: TXT.meta, color: "var(--green)" }}>
                        🎬 Este fondo está en ejecución
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: TXT.chip, marginTop: 4 }}>
                        Abajo queda lo que se postuló —la foto de con qué ganó—. El presupuesto real, el
                        cronograma de dos años, los estados de cuenta, los pagos (RHE) y la rendición
                        viven en su propia página.
                      </div>
                      <div style={{ color: "var(--accent)", fontSize: TXT.micro, marginTop: 8, fontWeight: 600 }}>
                        Abrir ejecución del fondo →
                      </div>
                    </Link>
                  )}
                  <div style={{ scrollMarginTop: 12 }}>
                    <Plegable id={`post:${params.id}:crono`} ancla="sec-cronograma"
                      titulo={esGanadora ? "📅 Cronograma postulado" : "📅 Cronograma"}
                      abiertoPorDefecto={!esGanadora}
                      resumen={dim(cronoResumen || "")}>
                      <CronogramaPostulacion key={`crono-${params.id}`} postulacionId={params.id}
                        actividades={cronoPost} perfiles={plantelPost}
                        plantillas={plantillas} tipoProyecto={(postCtx?.proy as any)?.tipo || ""}
                        etapas={etapasDe((postCtx?.conv as any)?.categoria)}
                        postulado={ent.cronograma_postulado || null}
                        postuladoEn={ent.cronograma_postulado_en || null} />
                    </Plegable>
                  </div>
                  <div style={{ scrollMarginTop: 12 }}>
                    <Plegable id={`post:${params.id}:presu`} ancla="sec-presupuesto"
                      titulo={esGanadora ? "💰 Presupuesto postulado" : "💰 Presupuesto"} abiertoPorDefecto={false}
                      resumen={dim(presuResumen || "")}>
                      <Presupuesto key={`pre-${params.id}`} postulacionId={params.id}
                        rubros={rubrosDe((postCtx?.conv as any)?.categoria)}
                        categoria={(postCtx?.conv as any)?.categoria}
                        inicial={ent.presupuesto || null}
                        plantillas={plantillasPre}
                        postulado={ent.presupuesto_postulado || null}
                        postuladoEn={ent.presupuesto_postulado_en || null}
                        estimuloConcurso={(postCtx?.conv as any)?.monto_adjudicado ? parseFloat((postCtx.conv as any).monto_adjudicado) : null} />
                    </Plegable>
                  </div>
                  <div style={{ scrollMarginTop: 12 }}>
                    <Plegable id={`post:${params.id}:mat`} ancla="sec-material" titulo={matTabla.titulo} abiertoPorDefecto={false}
                      resumen={nMat ? dim(`${nMat} filas`) : dim("sin material (o no aplica)")}>
                      <TablaSimple key={`mat-${params.id}`} postulacionId={params.id}
                        tabla={matTabla} inicial={(ent.material_archivo as any) || null} />
                    </Plegable>
                  </div>
                  {/* Solo videojuego: prototipo / vertical slice ejecutable. */}
                  {esVJ && (
                    <div style={{ scrollMarginTop: 12 }}>
                      <Plegable id={`post:${params.id}:proto`} ancla="sec-prototipo" titulo={TABLAS_EXP.prototipo.titulo} abiertoPorDefecto={false}
                        resumen={nProto ? dim(`${nProto} filas`) : dim("sin prototipo (o no aplica)")}>
                        <TablaSimple key={`proto-${params.id}`} postulacionId={params.id}
                          tabla={TABLAS_EXP.prototipo} inicial={(ent.prototipo as any) || null} />
                      </Plegable>
                    </div>
                  )}
                  <div style={{ scrollMarginTop: 12 }}>
                    <Plegable id={`post:${params.id}:prec`} ancla="sec-precontratos" titulo="📝 Precontratos" abiertoPorDefecto={false}
                      resumen={precontN ? dim(`${precontFirm}/${precontN} firmados`) : dim("sin precontratos (o no aplica)")}>
                      <Precontratos key={`prec-${params.id}`} postulacionId={params.id}
                        equipo={[...equipoPost, ...equipoProy]}
                        items={((ent.presupuesto as any)?.items) || []}
                        inicial={(ent.precontratos as any) || null} />
                    </Plegable>
                  </div>
                  <div style={{ scrollMarginTop: 12 }}>
                    <Plegable id={`post:${params.id}:ben`} ancla="sec-beneficiarios" titulo="👥 Beneficiarios" abiertoPorDefecto={false}
                      resumen={nBen ? dim(`${nBen} filas`) : dim("sin filas (o no aplica)")}>
                      <TablaSimple key={`ben-${params.id}`} postulacionId={params.id}
                        tabla={TABLAS_EXP.beneficiarios} inicial={(ent.beneficiarios as any) || null} seed={seedBenef} />
                    </Plegable>
                  </div>
                  {/* Condicional: solo si «usa obra de terceros» = Sí. */}
                  {usaTerceros && (
                    <div style={{ scrollMarginTop: 12 }}>
                      <Plegable id={`post:${params.id}:terceros`} ancla="sec-obra-terceros" titulo={TABLAS_EXP.obra_terceros.titulo} abiertoPorDefecto={false}
                        resumen={nTerceros ? dim(`${nTerceros} filas`) : dim("pendiente — la declaraste")}>
                        <TablaSimple key={`ter-${params.id}`} postulacionId={params.id}
                          tabla={TABLAS_EXP.obra_terceros} inicial={(ent.obra_terceros as any) || null} />
                      </Plegable>
                    </div>
                  )}
                </div>
              );

              /* 🗂 EXPEDIENTE (primera pestaña): el checklist DAFO arriba —el
                 estado del dossier, con % y enlaces— y debajo las secciones que
                 se llenan (el armado).
                 En las postulaciones sin plantilla, el checklist es la vista
                 Materiales v1 —pero esa lista es para ARMAR—. Una ganadora ya
                 ganó: su expediente queda como la foto de lo que ganó, así que
                 no lleva ese checklist genérico. */
              const expedienteNode = (
                <>
                  {conPlantilla && (
                    <Expediente postulacionId={params.id}
                      plantilla={plantillaConExtras((postCtx?.conv as any).plantilla_formulario, catConv)}
                      expediente={ent.expediente || {}}
                      auto={autoExp}
                      cronoListo={cronoListo} cronoResumen={cronoResumen}
                      presuListo={presuListo} presuResumen={presuResumen}
                      materialN={nMat}
                      benefN={nBen}
                      precontN={precontN}
                      precontFirm={precontFirm}
                      casos={casosExp}
                      regiones={REGIONES}
                      categoria={catConv}
                      prototipoN={nProto}
                      usaTerceros={usaTerceros}
                      tercerosN={nTerceros}
                      rutaFondo={esGanadora ? `/fondo/${params.id}` : undefined} />
                  )}
                  {!conPlantilla && !esGanadora && (
                    <Materiales postulacionId={params.id} materiales={ent.materiales || {}} />
                  )}
                  <div style={{ marginTop: 16 }}>{armadoNode}</div>
                </>
              );

              /* 👥 EQUIPO (segunda pestaña): el contexto de la postulación
                 (proyecto, empresa, concurso, lo que está en juego, bases) y el
                 equipo —el del proyecto, heredado, y el de esta postulación—.
                 En una postulación el equipo pesa, y aquí tiene espacio. */
              // Contexto DAFO de una persona del equipo: qué es, de dónde, y si
              // es comunero/a (la reserva regional y la comunidad puntúan).
              const ctxPersona = (p: any) =>
                [p?.tipo, p?.region, p?.es_comunero ? "🌱 comunero/a" : ""].filter(Boolean).join(" · ");
              /* La directora completa el trío del concurso (proyecto × empresa ×
                 directora): es quien da la cara ante el jurado. Nace con el
                 proyecto (proyecto_equipo); si no, se busca en el equipo de la
                 postulación. Un director/a o codirector/a. */
              const directora = (equipoProy.find((r: any) => esDirectorObra(r.cargo))
                || equipoPost.find((r: any) => esDirectorObra(r.cargo)))?.persona || null;
              // Veredicto del concurso (si ya terminó): se estampa sobre la cancha.
              const resPost = resultadoPostulacion(ent.estado);
              const equipoNode = (
                <>
                  {/* Cabecera de contexto: el proyecto con su cartel y, de un
                      vistazo, la empresa, el concurso (categoría y año) y lo que
                      está en juego. Es la cancha en la que corre este equipo. */}
                  <div className="linked">
                    <div className={`post-resultado-wrap${resPost ? " con-resultado" : ""}`}>
                    {/* Los DOS protagonistas del concurso, lado a lado con su
                        imagen: el proyecto que compite y la empresa que lo
                        presenta. El «×» de por medio los lee como un enfrentamiento
                        en la cancha (el concurso). */}
                    {(postCtx?.proy || postCtx?.emp) && (
                      <div className="post-duo">
                        {postCtx?.proy && (
                          <Link href={`/entidad/proyecto/${postCtx.proy.id}`} className="post-duo-lado">
                            {cartelProy
                              ? // eslint-disable-next-line @next/next/no-img-element
                                <img src={cartelProy} alt="" referrerPolicy="no-referrer" className="post-duo-img" />
                              : <span className="post-duo-emoji">📁</span>}
                            <span className="post-duo-nom">{postCtx.proy.nombre}</span>
                            {postCtx.proy.tipo && <span className="post-duo-sub">{postCtx.proy.tipo}</span>}
                          </Link>
                        )}
                        {postCtx?.proy && postCtx?.emp && <span className="post-duo-x">×</span>}
                        {postCtx?.emp && (
                          /* Empresa + su representante legal DEBAJO (quien firma). */
                          <div className="post-duo-col">
                            <Link href={`/entidad/empresa/${postCtx.emp.id}`} className="post-duo-lado">
                              {cartelEmp
                                ? // eslint-disable-next-line @next/next/no-img-element
                                  <img src={cartelEmp} alt="" referrerPolicy="no-referrer" className="post-duo-img" />
                                : <span className="post-duo-emoji">🏢</span>}
                              <span className="post-duo-nom">{postCtx.emp.nombre}</span>
                              <span className="post-duo-sub">empresa</span>
                            </Link>
                            {repLegal ? (
                              <Link href={`/entidad/persona/${repLegal.id}`} className="post-duo-rl">
                                {repLegal.foto_url
                                  ? // eslint-disable-next-line @next/next/no-img-element
                                    <img src={repLegal.foto_url} alt="" referrerPolicy="no-referrer" className="post-duo-rl-foto" />
                                  : <span className="post-duo-rl-foto post-duo-rl-ph">🖋</span>}
                                <span className="post-duo-rl-txt">
                                  <span className="post-duo-rl-nom">{repLegal.alias || repLegal.nombre}</span>
                                  <span className="post-duo-rl-rol">Rep. legal</span>
                                </span>
                              </Link>
                            ) : (
                              <div className="post-duo-rl post-duo-vacio">
                                <span className="post-duo-rl-foto post-duo-rl-ph">🖋</span>
                                <span className="post-duo-rl-txt"><span className="post-duo-rl-nom">Falta rep. legal</span></span>
                              </div>
                            )}
                          </div>
                        )}
                        {/* La directora cierra el trío: siempre su espacio —vacío es
                            señal de que FALTA, es dato clave de la postulación. */}
                        {(postCtx?.proy || postCtx?.emp) && <span className="post-duo-x">×</span>}
                        {directora ? (
                          <Link href={`/entidad/persona/${directora.id}`} className="post-duo-lado">
                            {directora.foto_url
                              ? // eslint-disable-next-line @next/next/no-img-element
                                <img src={directora.foto_url} alt="" referrerPolicy="no-referrer" className="post-duo-img post-duo-persona" />
                              : <span className="post-duo-emoji">🎬</span>}
                            <span className="post-duo-nom">{directora.alias || directora.nombre}</span>
                            <span className="post-duo-sub">dirige</span>
                          </Link>
                        ) : (
                          <div className="post-duo-lado post-duo-vacio">
                            <span className="post-duo-emoji post-duo-emoji-vacio">🎬</span>
                            <span className="post-duo-nom" style={{ color: "var(--dim)" }}>Falta directora</span>
                            <span className="post-duo-sub post-duo-sub-vacio">dirige</span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* La CANCHA del concurso: el monto por el que compiten, al
                        centro y grande; al lado, las reglas de juego (las bases);
                        debajo, qué concurso es. Antes era una tabla de filas —se
                        lee mucho mejor así, de un vistazo. */}
                    {postCtx?.conv && (
                      <div className="post-cancha">
                        {postCtx.conv.monto_adjudicado && (
                          <div className="pc-monto">
                            <span className="pc-cifra">S/ {parseFloat(postCtx.conv.monto_adjudicado).toLocaleString("es-PE")}</span>
                            <span className="pc-lbl">en juego</span>
                          </div>
                        )}
                        {postCtx.conv.bases_url && (
                          <a href={postCtx.conv.bases_url} target="_blank" rel="noopener noreferrer" className="pc-bases">
                            <span>📖 Reglas de juego</span>
                            <span className="pc-sub">las bases del concurso ↗</span>
                          </a>
                        )}
                        <Link href={`/entidad/convocatoria/${postCtx.conv.id}`} className="pc-conc">
                          📜 {postCtx.conv.codigo} · {postCtx.conv.nombre}
                          {(postCtx.conv.categoria || postCtx.conv.anio) ? ` · ${[postCtx.conv.categoria, postCtx.conv.anio].filter(Boolean).join(" · ")}` : ""} →
                        </Link>
                      </div>
                    )}
                      {/* VEREDICTO: cuando el concurso terminó, el resultado se
                          estampa GRANDE sobre la cancha (con el trío atenuado
                          detrás). No captura clics —los enlaces siguen vivos—;
                          su «✕» lo cierra. */}
                      {resPost && <SelloResultado {...resPost} variante="cancha" />}
                    </div>
                    {/* Cambiar la empresa que presenta (su nombre ya está arriba). */}
                    <EmpresaPostulacion postulacionId={params.id}
                      convocatoriaId={postCtx?.conv?.id || ""}
                      empresa={postCtx?.emp} empresas={empresasCat} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    {/* El equipo de ESTA postulación va PRIMERO —es lo que se arma
                        y edita aquí—; debajo, el del proyecto, que se hereda (la
                        directora nace con el proyecto y no se repite). */}
                    <EquipoPostulacion postulacionId={params.id} equipo={equipoPost} personas={personasCat} />
                    {equipoProy.length > 0 && (
                      <div className="linked" style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <h4 style={{ margin: 0, fontSize: TXT.chip, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
                            🎬 Equipo del proyecto · {equipoProy.length}
                          </h4>
                          <span style={{ flex: 1 }} />
                          {postCtx?.proy && (
                            <Link href={`/entidad/proyecto/${(postCtx.proy as any).id}`}
                              style={{ color: "var(--accent)", fontSize: TXT.chip }}>editarlo en el proyecto →</Link>
                          )}
                        </div>
                        <p style={{ color: "var(--dim)", fontSize: TXT.chip, marginTop: 0, marginBottom: 8 }}>
                          Viene con el proyecto: no hace falta repetirlo aquí.
                        </p>
                        {equipoProy.map((m: any) => {
                          const p = m.persona || {};
                          const ctx = ctxPersona(p);
                          return (
                            <div className="eq-card" key={m.id}>
                              <Avatar nombre={p.nombre} src={p.foto_url} size={60} />
                              <div className="eq-card-main">
                                <div className="eq-card-top">
                                  <Link href={`/entidad/persona/${p.id}`} className="eq-card-nom" title={p.nombre}>{p.alias || p.nombre} →</Link>
                                  <span className="eq-card-cargo">{m.cargo}</span>
                                </div>
                                {ctx && <div className="eq-card-ctx">{ctx}</div>}
                                <div className="eq-card-chips">
                                  {m._cv ? (
                                    <a href={m._cv.url || `/objeto/${m._cv.id}`} target="_blank" rel="noopener noreferrer"
                                      className={`eq-chip eq-chip-link ${m._cv.vigente ? "ok" : "warn"}`}>
                                      📄 {m._cv.vigente ? "CV" : "CV viejo"} ↗
                                    </a>
                                  ) : <span className="eq-chip falta">📄 sin CV</span>}
                                  {m._pre ? (
                                    m._pre.id ? (
                                      <a href={`/api/precontrato?post=${params.id}&pre=${m._pre.id}`} target="_blank" rel="noopener noreferrer"
                                        className={`eq-chip eq-chip-link ${m._pre.estado === "firmado" ? "ok" : "warn"}`}>
                                        📝 {m._pre.estado} ↗
                                      </a>
                                    ) : <span className={`eq-chip ${m._pre.estado === "firmado" ? "ok" : "warn"}`}>📝 {m._pre.estado}</span>
                                  ) : <span className="eq-chip dim">📝 sin precontrato</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Cumplimiento calculado: % peruano/domiciliado y % regional
                        del equipo completo (proyecto + postulación). */}
                    <EquipoPorcentajes equipo={[...equipoPost, ...equipoProy]} />
                  </div>
                  {/* EDICIONES ANTERIORES: con qué empresa y equipo se presentó
                      ESTE proyecto en otras convocatorias —para cruzar la
                      información entre ediciones (quién iba, con quién, cómo le
                      fue). Al pie de la pestaña Equipo. */}
                  {otrasPostus.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4 style={{ margin: "0 0 4px", fontSize: TXT.chip, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
                        🔁 Ediciones anteriores del proyecto · {otrasPostus.length}
                      </h4>
                      <p style={{ color: "var(--dim)", fontSize: TXT.chip, marginTop: 0, marginBottom: 10 }}>
                        Con qué empresa y equipo se presentó este proyecto en otras convocatorias.
                      </p>
                      {otrasPostus.map((o: any) => (
                        <div key={o.id} className="edic-ant">
                          <div className="edic-ant-h">
                            <Link href={`/entidad/postulacion/${o.id}`} className="edic-ant-tit">
                              {ICONO_ESTADO[o.estado] || "🎯"} {o.codigo || "Postulación"}{o.conv?.nombre ? ` · ${o.conv.nombre}` : ""}{o.conv?.anio ? ` · ${o.conv.anio}` : ""} →
                            </Link>
                            <span className="badge" style={{ color: o.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c", textTransform: "none", letterSpacing: 0 }}>
                              {(o.estado || "").replace(/_/g, " ")}
                            </span>
                          </div>
                          {/* La empresa como chip clicable, igual que las personas. */}
                          <div className="edic-ant-emp">
                            {o.emp?.id ? (
                              <EmpresaChip id={o.emp.id} nombre={o.emp.nombre}
                                logo={o._cartelEmp} titulo={o.emp.nombre} />
                            ) : (
                              <span className="edic-ant-emp-ph" style={{ color: "var(--red)" }}>🏢 sin empresa</span>
                            )}
                          </div>
                          {(o.equipo || []).length > 0 && (
                            <div className="edic-ant-eq">
                              {o.equipo.map((e: any, i: number) => (
                                <PersonaChip key={i} id={e.persona?.id} nombre={e.persona?.nombre} size={24}
                                  alias={e.persona?.alias} foto={e.persona?.foto_url} rol={e.cargo} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );

              /* 📚 REPOSITORIO: obras y referencias de esta postulación, más las
                 de otros que la sostienen. */
              const repoNode = (
                <>
                  <Repositorio entidadTipo={params.tipo} entidadId={params.id}
                    objetos={objetosDe} verif={verifDe} />
                  {objetosVinculados.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                      {objetosVinculados.map((o: any) => (
                        <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                          {previewCandidates(o.url, 200).length
                            ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                            : <span>{icoObjeto(o.tipo)}</span>}
                          <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                            de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              );

              /* 🕐 HISTORIAL: solo la línea de tiempo de eventos. Los casos
                 (avisos + trabajo) salieron a su propia pestaña «Casos», como en
                 el resto de entidades. */
              const historialNode = eventosVis.length > 0 ? histInner : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin eventos registrados aún.</div>
              );

              /* 📝 MURO de la postulación: mismo componente que empresa/proyecto.
                 Un lugar para las notas del equipo mientras se arma la postulación
                 —avances, pendientes, acuerdos—, con imágenes, @menciones y
                 reacciones. Las notas cuelgan de la propia postulación. */
              const muroNode = (
                <MuroProyecto proyectoId={params.id} entidadTipo="postulacion" userId={user.id}
                  perfiles={perfilesCat} sugerencias={muroEtqs} posts={muroPosts} materiales={objetosDe} />
              );

              return (
                <TabsPanel extra={driveTab} masUltima
                  labels={[
                    `📝 Muro · ${muroPosts.length}`,
                    conPlantilla || esGanadora ? "🗂 Expediente" : "📎 Materiales",
                    `👥 Equipo · ${equipoProy.length + equipoPost.length}`,
                    `📋 Casos · ${activas.length}`,
                    `📚 Repositorio${objetosDe.length ? ` · ${objetosDe.length}` : ""}`,
                    `🕐 Historial · ${totEventos}`,
                  ]}
                  paneles={[
                    muroNode,
                    expedienteNode,
                    equipoNode,
                    trabajoNode,
                    repoNode,
                    historialNode,
                  ]}
                  iconoSolo={[4, 5]}
                />
              );
            }
            /* PERSONA: la columna de la vida en pestañas (como los fondos), para
               no apilar Trayectoria + Trabajo + Pulso en un solo scroll. */
            if (params.tipo === "persona") {
              /* Miniatura del cartel de una obra/empresa, para adornar las filas
                 de la trayectoria. Si esa entidad no tiene cartel cargado,
                 devuelve null (la fila queda como antes, sin hueco). */
              const poster = (t: string, pid?: string | null, size = 42) => {
                const url = pid ? carteles.get(`${t}:${pid}`) : null;
                if (!url) return null;
                // eslint-disable-next-line @next/next/no-img-element
                return <img src={url} alt="" className="tr-poster" referrerPolicy="no-referrer"
                  style={{ width: size, height: size }} />;
              };
              const empLogo = (id?: string | null) => (id ? carteles.get(`empresa:${id}`) : null);
              /* Agrupa el equipo por persona y junta TODOS sus cargos (una misma
                 persona puede tener varios en la postulación: Directora + Autora),
                 ordenando sus roles por importancia y a las personas por su rol más
                 importante. Así no se «pierde» un rol por elegir una sola fila. */
              const equipoConRoles = (equipo: any[]) => {
                const byId = new Map<string, { persona: any; cargos: string[] }>();
                for (const e of equipo || []) {
                  const pid = e.persona?.id; if (!pid) continue;
                  const cur = byId.get(pid) || { persona: e.persona, cargos: [] };
                  const c = (e.cargo || "").trim();
                  if (c && !cur.cargos.includes(c)) cur.cargos.push(c);
                  byId.set(pid, cur);
                }
                return [...byId.values()]
                  .map(x => ({ ...x, cargos: [...x.cargos].sort((a, b) => rangoRol(a) - rangoRol(b)) }))
                  .sort((a, b) => (rangoRol(a.cargos[0]) - rangoRol(b.cargos[0]))
                    || (a.persona?.nombre || "").localeCompare(b.persona?.nombre || ""));
              };
              const filaPost = (r: any) => {
                const p = r.post || {};
                const equipo = equipoConRoles(p.equipo || []);
                // Los roles de ESTA persona (todos), y el resto del equipo.
                const logo = empLogo(p.emp?.id);
                return (
                  <div key={r.id} className="tray-post" style={{ display: "flex", gap: 12, alignItems: "flex-start", ["--est-col" as any]: colorEstadoPost(p.estado) }}>
                    {poster("proyecto", p.proy?.id, 56)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Misma lógica que la tarjeta de empresa: estado en la
                        ESQUINA SUPERIOR DERECHA con su color de identidad. */}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <Link href={`/entidad/postulacion/${p.id}`}
                        style={{ color: "var(--text)", fontWeight: 600, fontSize: TXT.base, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                        {ICONO_ESTADO[p.estado] || "🎯"} {p.proy?.nombre || p.codigo} →
                      </Link>
                      <span className="badge" style={{ color: colorEstadoPost(p.estado), background: `color-mix(in srgb, ${colorEstadoPost(p.estado)} 15%, transparent)`, whiteSpace: "nowrap", flex: "none" }}>
                        {(p.estado || "").replace(/_/g, " ")}
                      </span>
                      <HiloPostulacionBtn postulacionId={p.id} nComentarios={contadoresPost[p.id]?.c || 0} nReacciones={contadoresPost[p.id]?.r || 0} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                      {p.conv?.anio && (
                        <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>
                      )}
                      {p.estado === "ganadora" && p.monto_adjudicado && (
                        <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", fontWeight: 700 }}>
                          S/ {Number(p.monto_adjudicado).toLocaleString("es-PE")}
                        </span>
                      )}
                      {p.emp?.id && (
                        <Link href={`/entidad/empresa/${p.emp.id}`} className="post-proy-chip" title={p.emp.nombre}>
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                          ) : (
                            <span className="post-proy-chip-ph">🏢</span>
                          )}
                          <span className="post-proy-chip-txt">{p.emp.nombre}</span>
                        </Link>
                      )}
                      {p.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· {p.conv.nombre}</span>}
                      {p.proy?.id && (
                        <Link href={`/entidad/proyecto/${p.proy.id}`} className="post-proy-chip" title={p.proy?.nombre || "proyecto"}>
                          {carteles.get(`proyecto:${p.proy.id}`) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={carteles.get(`proyecto:${p.proy.id}`)} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                          ) : (
                            <span className="post-proy-chip-ph">📁</span>
                          )}
                          <span className="post-proy-chip-txt">{p.proy?.nombre || "—"} →</span>
                        </Link>
                      )}
                    </div>
                    {equipo.length > 0 && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                        {equipo.map((e: any, i: number) => {
                          const roles = e.cargos.join(" · ");
                          const esYo = e.persona?.id === params.id;
                          return (
                            <PersonaChip key={i} id={e.persona?.id} nombre={e.persona?.nombre}
                              alias={e.persona?.alias} foto={e.persona?.foto_url}
                              rol={roles} titulo={roles} yo={esYo} />
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>
                );
              };
              const ganadas = postDe.filter((r: any) => r.post?.estado === "ganadora");
              const resto = postDe.filter((r: any) => r.post?.estado !== "ganadora");
              /* Trayectoria = todo el recorrido profesional, en este orden:
                 logros (Palmarés) → intentos (postulaciones) → dónde milita
                 (cargos) → su papelería de experiencia (CVs por enfoque). Las
                 dos últimas vivían en el carné; son trayectoria, no identidad. */
              const cargosNode = cargosDe.length > 0 ? (
                <div className="linked" style={{ marginTop: 14 }}>
                  <h4>🏢 Cargos en empresas · {cargosDe.length}</h4>
                  <div style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "-2px 0 8px" }}>
                    Cargos que ocupa —o ha ocupado— en las empresas del ecosistema.
                  </div>
                  {cargosDe.map((c: any) => {
                    const activo = c.estado === "activo";
                    const anio = c.fecha_inicio ? String(c.fecha_inicio).slice(0, 4) : "";
                    return (
                      <div key={c.id} className="eq-row" style={{ alignItems: "center", opacity: activo ? 1 : .55 }}>
                        {poster("empresa", c.empresa?.id, 40)}
                        <span className="cargo">{c.cargo}</span>
                        {!activo && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· inactivo</span>}
                        <span style={{ flex: 1 }} />
                        {anio && <span style={{ color: "var(--dim)", fontSize: TXT.chip, marginRight: 8 }}>desde {anio}</span>}
                        <Link href={`/entidad/empresa/${c.empresa?.id}`} style={{ color: "var(--text)" }}>
                          {c.empresa?.nombre} →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : null;
              /* Sus proyectos (su filmografía): dónde participa y con qué cargo.
                 Dirigir se resalta 🎬; lo que ya no se mueve va atenuado. */
              const nDirige = proyectosPropios.filter((r: any) => /direc|codirec/i.test(r.cargo || "")).length;
              const proyectosNode = proyectosPropios.length > 0 ? (
                <div className="linked" style={{ marginTop: 14 }}>
                  <h4>🎬 Proyectos / Filmografía · {proyectosPropios.length}</h4>
                  <div style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "-2px 0 8px" }}>
                    Obras en las que participa, con su cargo{nDirige > 0 ? ` · dirige ${nDirige}` : ""}. Los terminados van atenuados.
                  </div>
                  {proyectosPropios.map((r: any) => {
                    const dir = /direc|codirec/i.test(r.cargo || "");
                    const vivo = (r.proy?.estado_actividad || "activo") === "activo" && r.proy?.etapa !== "finalizado";
                    const ctx = [r.proy?.tipo?.replace(/_/g, " "), r.proy?.etapa?.replace(/_/g, " ")].filter(Boolean).join(" · ");
                    return (
                      <div key={r.id} className="eq-row" style={{ alignItems: "center", opacity: vivo ? 1 : .6 }}>
                        {poster("proyecto", r.proy?.id, 40)}
                        <span className="cargo" style={dir ? { color: "var(--accent)" } : undefined}>{dir ? "🎬 " : ""}{r.cargo || "—"}</span>
                        {ctx && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· {ctx}</span>}
                        <span style={{ flex: 1 }} />
                        <Link href={`/entidad/proyecto/${r.proy.id}`} style={{ color: "var(--text)" }}>
                          📁 {r.proy.nombre_corto || r.proy.nombre} →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : null;
              /* Obras donde es ACTOR SOCIAL (protagonista, comunero): su
                 aparición ante la cámara. Va aparte de la filmografía de crew
                 —es otro tipo de aporte— con 🎭 en teal, como en /personas. */
              const proyectosActorNode = proyectosActor.length > 0 ? (
                <div className="linked" style={{ marginTop: 14 }}>
                  <h4>🎭 Como actor social · {proyectosActor.length}</h4>
                  <div style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "-2px 0 8px" }}>
                    Obras en las que aparece (protagonista, comunero, sujeto). Los terminados van atenuados.
                  </div>
                  {proyectosActor.map((r: any) => {
                    const vivo = (r.proy?.estado_actividad || "activo") === "activo" && r.proy?.etapa !== "finalizado";
                    const ctx = [r.proy?.tipo?.replace(/_/g, " "), r.proy?.etapa?.replace(/_/g, " ")].filter(Boolean).join(" · ");
                    return (
                      <div key={r.id} className="eq-row" style={{ alignItems: "flex-start", gap: 12, opacity: vivo ? 1 : .6 }}>
                        {poster("proyecto", r.proy?.id, 56)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {/* A quién interpretó, cuando personaje y persona son
                                cosas distintas. El campo se traía y se tiraba:
                                quien pone la voz a Robomac veía «Protagonista» y
                                nunca de quién. */}
                            <span className="cargo" style={{ color: "var(--teal)" }}>
                              🎭 {r.personaje || r.rol || "actor social"}
                            </span>
                            {r.personaje && r.rol && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· {r.rol}</span>}
                            {ctx && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· {ctx}</span>}
                            <span style={{ flex: 1 }} />
                            <Link href={`/entidad/proyecto/${r.proy.id}`} style={{ color: "var(--text)" }}>
                              📁 {r.proy.nombre} →
                            </Link>
                          </div>
                          {/* El personaje: su descripción en la obra, aprovechando el
                              ancho de la tarjeta (antes solo se veía del lado del proyecto). */}
                          {r.descripcion && (
                            <div style={{ color: "var(--muted)", fontSize: TXT.micro, marginTop: 5, lineHeight: 1.5 }}>
                              {r.descripcion}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null;
              const cvsNode = (
                <CVs personaId={params.id} cvs={cvsDe}
                  especialidades={String(ent.rol || "").split(",").map(s => s.trim()).filter(Boolean)} />
              );
              /* Proyectos donde es el CLIENTE (encargó el trabajo), no donde
                 participa: otra relación, por eso va aparte y al final. */
              const clienteNode = clienteEnProy.length > 0 ? (
                <div className="linked" style={{ marginTop: 14 }}>
                  <h4>🤝 Cliente de proyectos · {clienteEnProy.length}</h4>
                  <div style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "-2px 0 8px" }}>
                    Proyectos que encargó a la productora: aquí es el cliente, no del equipo.
                  </div>
                  {clienteEnProy.map((p: any) => (
                    <div key={p.id} className="eq-row" style={{ alignItems: "center" }}>
                      {poster("proyecto", p.id, 40)}
                      {p.tipo && <span className="cargo">{p.tipo.replace(/_/g, " ")}</span>}
                      <span style={{ flex: 1, textAlign: "right" }}>
                        <Link href={`/entidad/proyecto/${p.id}`} style={{ color: "var(--text)" }}>📁 {p.nombre} →</Link>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null;
              // Contexto del palmarés: cuánto estímulo ha adjudicado en total.
              /* Los NÚMEROS salen de lib/palmares (la misma definición que
                 /personas, /empresas y la vista rápida); las LISTAS se siguen
                 armando aquí, que es lo propio de esta pantalla.
                 Antes esta ficha juntaba `finalista` con `finalista_no_ganadora`
                 bajo un solo «N finalistas», así que decía 3 donde las demás
                 pantallas decían 2 — y las dos parecían correctas. Un concurso
                 todavía abierto no es un «casi»: es una postulación viva. */
              const pal = palmaresDePersona(postDe);
              const montoGanado = pal.monto;
              const trayectoria = (
                <>
                  {/* Palmarés y «En postulaciones» ya no comparten tarjeta: son dos
                      cosas distintas —lo ganado y lo intentado— y cada una lee mejor
                      en su propio bloque, con su contexto. */}
                  {ganadas.length > 0 && (
                    <div className="card">
                      <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Palmarés · {ganadas.length}</div>
                      <div style={{ color: "var(--muted)", fontSize: TXT.micro }}>
                        {ganadas.length} estímulo{ganadas.length === 1 ? "" : "s"} ganado{ganadas.length === 1 ? "" : "s"}
                        {pal.rozo > 0 && ` · ${pal.rozo} llegó a la final sin ganar`}
                        {pal.vivas > 0 && ` · ${pal.vivas} finalista aún en juego`}
                        {` · ${pal.total} postulaciones en total`}
                        {montoGanado > 0 && <> · <b style={{ color: "var(--teal)" }}>S/ {montoGanado.toLocaleString("es-PE")} adjudicado</b></>}
                      </div>
                      <div className="tray-postus">{ganadas.map(filaPost)}</div>
                    </div>
                  )}
                  {resto.length > 0 && (
                    <div className="card" style={{ marginTop: ganadas.length ? 14 : 0 }}>
                      <div className="panel-h">🎯 En postulaciones · {resto.length}</div>
                      <div style={{ color: "var(--muted)", fontSize: TXT.micro }}>
                        Concursos a los que se presentó{pal.rozo > 0 ? ` · ${pal.rozo} llegó a la final sin ganar` : ""}.
                      </div>
                      <div className="tray-postus">{resto.map(filaPost)}</div>
                    </div>
                  )}
                  {/* «Sin postulaciones» solo si NO tiene otra trayectoria: para un
                      actor social (sujeto del documental, no del equipo que postula)
                      el mensaje es ruido —la postulación del proyecto es de la
                      productora, no suya—. Si tiene obras o cargos, no se muestra. */}
                  {postDe.length === 0 && cargosDe.length === 0 && proyectosPropios.length === 0
                    && proyectosActor.length === 0 && clienteEnProy.length === 0 && (
                    <div className="empty" style={{ padding: "18px 0" }}>Sin postulaciones registradas para {nombre}.</div>
                  )}
                  {cargosNode}
                  {proyectosNode}
                  {proyectosActorNode}
                  {cvsNode}
                  {clienteNode}
                </>
              );
              const pulsoNode = pulso ? (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="panel-h" style={{ margin: 0 }}>📊 Pulso en CrewHub+</div>
                    <span style={{ flex: 1 }} />
                    <Link href="/pulso" style={{ color: "var(--dim)", fontSize: TXT.chip, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                      ver el del equipo →
                    </Link>
                  </div>
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
                        <div style={{ fontSize: TXT.chip, color: "var(--dim)", textTransform: "uppercase", letterSpacing: .6 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {pulso.ultimo && (
                    <p style={{ color: "var(--dim)", fontSize: TXT.chip, margin: "10px 0 0" }}>
                      Última actividad: {fecha(pulso.ultimo)}
                    </p>
                  )}
                </div>
              ) : null;
              // Repositorio: su propia pestaña (con «Del repositorio» debajo).
              const repositorioNode = (
                <>
                  <Repositorio entidadTipo={params.tipo} entidadId={params.id}
                    objetos={objetosDe} verif={verifDe} />
                  {objetosVinculados.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                      {objetosVinculados.map((o: any) => (
                        <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                          {previewCandidates(o.url, 200).length
                            ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                            : <span>{icoObjeto(o.tipo)}</span>}
                          <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                            de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              );
              // Economía: los RHE que giró, agrupados por proyecto/fondo (Mujunakuy…).
              const totalHist = rheGirados.reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
              const anio = new Date().getFullYear();
              const totGrupo = (its: any[]) => its.reduce((s, r) => s + Number(r.monto || 0), 0);
              const porProy = new Map<string, { nombre: string; codigo?: string; postId?: string; proyId?: string; estado?: string; items: any[] }>();
              for (const r of rheGirados) {
                const pid = r.post?.proy?.id || r.post?.id || "otros";
                if (!porProy.has(pid)) porProy.set(pid, {
                  nombre: r.post?.proy?.nombre || r.post?.codigo || "Sin proyecto",
                  codigo: r.post?.codigo, postId: r.post?.id, proyId: r.post?.proy?.id, estado: r.post?.estado, items: [],
                });
                porProy.get(pid)!.items.push(r);
              }
              const gruposRhe = [...porProy.values()].sort((a, b) => totGrupo(b.items) - totGrupo(a.items));
              const dmy = (f?: string | null) => {
                const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
                return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
              };
              const economiaNode = rheGirados.length === 0 ? (
                <div className="empty" style={{ padding: "18px 0" }}>
                  Aún no hay RHE girados por {nombre}. Se registran desde la ejecución de cada fondo.
                </div>
              ) : (
                <div>
                  <div className="card" style={{ marginBottom: 12, display: "flex", gap: 22, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "var(--dim)", fontSize: TXT.chip, textTransform: "uppercase", letterSpacing: ".4px" }}>Girado histórico</div>
                      <div style={{ color: "var(--teal)", fontWeight: 800, fontSize: 17, marginTop: 2 }}>{money(totalHist)}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--dim)", fontSize: TXT.chip, textTransform: "uppercase", letterSpacing: ".4px" }}>Este año ({anio})</div>
                      <div style={{ color: "var(--muted)", fontWeight: 800, fontSize: 17, marginTop: 2 }}>{money(acum4ta)}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--dim)", fontSize: TXT.chip, textTransform: "uppercase", letterSpacing: ".4px" }}>N.º de RHE</div>
                      <div style={{ color: "var(--text)", fontWeight: 800, fontSize: 17, marginTop: 2 }}>{rheGirados.length}</div>
                    </div>
                  </div>
                  {gruposRhe.map(g => {
                    const tot = totGrupo(g.items);
                    const ruta = g.estado === "ganadora" && g.postId ? `/fondo/${g.postId}` : g.postId ? `/entidad/postulacion/${g.postId}` : null;
                    return (
                      <Plegable key={g.postId || g.nombre} nivel={2}
                        id={`persona:${params.id}:rhe:${g.postId || g.nombre}`}
                        abiertoPorDefecto={gruposRhe.length <= 2}
                        titulo={g.proyId && carteles.get(`proyecto:${g.proyId}`)
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{poster("proyecto", g.proyId, 30)}{g.nombre}</span>
                          : `🎬 ${g.nombre}`}
                        resumen={
                          <span>
                            <b style={{ color: "var(--muted)" }}>{g.items.length} RHE</b>
                            <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700 }}>{money(tot)}</span>
                          </span>
                        }>
                        {ruta && (
                          <Link href={ruta} style={{ color: "var(--violet)", fontSize: TXT.chip, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                            {g.estado === "ganadora" ? "Abrir ejecución del fondo →" : "Abrir postulación →"}
                          </Link>
                        )}
                        {g.items.map((r: any) => (
                          <div key={r.id} className="rhe-fila" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.045)" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ color: "var(--teal)", fontWeight: 700, fontSize: TXT.meta }}>{money(r.monto)}</span>
                                <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>{dmy(r.fecha)}{r.numero ? ` · ${r.numero}` : ""}</span>
                              </div>
                              {r.concepto && (
                                <div style={{ color: "var(--muted)", fontSize: TXT.chip, marginTop: 2, lineHeight: 1.4 }}>
                                  {r.concepto.charAt(0) + r.concepto.slice(1).toLowerCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </Plegable>
                    );
                  })}
                </div>
              );
              /* Nombre corto para filtrar el diario por esta persona (misma regla
                 que /historial: «John Oros Condori» → «John O.»). */
              const cortoNombre = (() => {
                const pp = String(cuentaDe?.nombre || ent.nombre || "").trim().split(/\s+/);
                return pp.length > 1 ? `${pp[0]} ${pp[1][0]}.` : (pp[0] || "");
              })();
              /* LO QUE HIZO en todo el sistema (como el diario filtrado por ella)
                 + los cambios sobre ESTA ficha. Dos cosas distintas —qué hizo vs
                 qué le pasó— cada una en su bloque. */
              const histGlobal = actividadUsuario.length > 0 ? (
                <Plegable id={`persona:${params.id}:hist-sistema`} nivel={2}
                  titulo="🌐 Su actividad en el sistema" resumen={`${actividadUsuario.length} eventos`}>
                  <Link href={`/historial?a=${encodeURIComponent(cortoNombre)}`}
                    style={{ color: "var(--dim)", fontSize: TXT.chip, textDecoration: "underline dotted", textUnderlineOffset: 3, display: "inline-block", marginBottom: 6 }}>
                    ver todo en el diario →
                  </Link>
                  <div className="tl">
                    {agruparEventos(actividadUsuario as any[]).map((f, i) =>
                      f.grupo
                        ? <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => fecha(x.creado_en)} conEntidad />
                        : <EventoHistorial key={i} e={f.solo} hora={fecha(f.solo.creado_en)} conEntidad />
                    )}
                  </div>
                </Plegable>
              ) : null;
              const historialNode = (actividadUsuario.length > 0 || eventosVis.length > 0) ? (
                <>
                  {histGlobal}
                  {eventosVis.length > 0 && (
                    <Plegable id={`persona:${params.id}:hist-ficha`} nivel={2}
                      titulo="📄 Cambios en esta ficha" resumen={`${totEventos} eventos`}
                      abiertoPorDefecto={actividadUsuario.length === 0}>
                      {histInner}
                    </Plegable>
                  )}
                </>
              ) : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin actividad registrada todavía.</div>
              );
              /* El contador de la pestaña cuenta TODO lo que ahora vive dentro:
                 postulaciones + cargos + proyectos + CVs + proyectos como
                 cliente. Antes solo contaba postulaciones y se quedaba corto. */
              const nTrayectoria = postDe.length + cargosDe.length + proyectosPropios.length
                + proyectosActor.length + cvsDe.length + clienteEnProy.length;
              const muroPer = (
                <MuroProyecto proyectoId={params.id} entidadTipo="persona" userId={user.id}
                  perfiles={perfilesCat} sugerencias={muroEtqs} posts={muroPosts} materiales={objetosDe} />
              );
              return (
                <TabsPanel extra={driveTab} masUltima
                  labels={[
                    `📝 Muro · ${muroPosts.length}`,
                    `🏆 Trayectoria · ${nTrayectoria}`,
                    `📋 Casos · ${activas.length}`,
                    `📚 Repositorio · ${objetosDe.length}`,
                    `🧾 Economía · ${rheGirados.length}`,
                    `🕐 Historial · ${actividadUsuario.length + totEventos}`,
                  ]}
                  paneles={[
                    muroPer,
                    trayectoria,
                    <>{pulsoNode}{trabajoNode}</>,
                    repositorioNode,
                    economiaNode,
                    historialNode,
                  ]}
                  iconoSolo={[3, 5]}
                />
              );
            }
            /* EMPRESA: mismo patrón de pestañas que la persona, con su contenido
               propio. Trayectoria = sus postulaciones (palmarés) + sus miembros;
               Elegibilidad DAFO = la HojaPostulacion; Historial = solo lo que le
               pasó a su ficha (una empresa no «actúa», no tiene cuenta). */
            if (params.tipo === "empresa") {
              /* Orden CRONOLÓGICO: lo más reciente arriba (por año de la
                 convocatoria, descendente); a igual año, el mejor desenlace
                 primero (ganó → finalista → en proceso → descartada). Antes
                 mandaba el desenlace y mezclaba años; ahora manda el tiempo. */
              const rankPostEmp = (e?: string) =>
                e === "ganadora" ? 0
                : (e === "finalista" || e === "finalista_no_ganadora") ? 1
                : ["en_preparacion", "enviada", "en_subsanacion", "apta"].includes(e || "") ? 2 : 3;
              const postusEmpOrd = [...postusEmp].sort((a: any, b: any) => {
                const y = (Number(b.conv?.anio) || 0) - (Number(a.conv?.anio) || 0);
                if (y) return y;
                return rankPostEmp(a.estado) - rankPostEmp(b.estado);
              });
              const empPostusCard = postusEmpOrd.length > 0 ? (
                <div className="card">
                  <div className="panel-h">🎯 Postuló con · {postusEmpOrd.length}</div>
                  <div className="tray-postus">
                  {postusEmpOrd.map((p: any) => (
                    <div key={p.id} className="tray-post" style={{ display: "flex", gap: 12, alignItems: "flex-start", ["--est-col" as any]: colorEstadoPost(p.estado) }}>
                      {/* Imagen del proyecto arriba a la izquierda (igual que en
                          la ficha de persona): solo si tiene portada. */}
                      {p.proy?.id && cartelesProy[p.proy.id] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cartelesProy[p.proy.id]} alt="" referrerPolicy="no-referrer" className="tr-poster" style={{ width: 56, height: 56, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Estado a la ESQUINA SUPERIOR DERECHA, con su color de
                          identidad (el mismo que tiñe la tarjeta). */}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Link href={`/entidad/postulacion/${p.id}`}
                          style={{ color: "var(--text)", fontWeight: 600, fontSize: TXT.meta, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                          {ICONO_ESTADO[p.estado] || "🎯"} {p.proy?.nombre || p.codigo || "Postulación"} →
                        </Link>
                        <span className="badge" style={{ color: colorEstadoPost(p.estado), background: `color-mix(in srgb, ${colorEstadoPost(p.estado)} 15%, transparent)`, whiteSpace: "nowrap", flex: "none" }}>
                          {(p.estado || "").replace(/_/g, " ")}
                        </span>
                        <HiloPostulacionBtn postulacionId={p.id} nComentarios={contadoresPost[p.id]?.c || 0} nReacciones={contadoresPost[p.id]?.r || 0} />
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                        {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>}
                        {p.estado === "ganadora" && p.monto_adjudicado && (
                          <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", fontWeight: 700 }}>
                            S/ {Number(p.monto_adjudicado).toLocaleString("es-PE")}
                          </span>
                        )}
                        {p.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>· {p.conv.nombre}</span>}
                        {p.proy?.id && (
                          <Link href={`/entidad/proyecto/${p.proy.id}`} className="post-proy-chip" title={p.proy?.nombre || "proyecto"}>
                            {cartelesProy[p.proy.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cartelesProy[p.proy.id]} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                            ) : (
                              <span className="post-proy-chip-ph">📁</span>
                            )}
                            <span className="post-proy-chip-txt">{p.proy?.nombre || "—"} →</span>
                          </Link>
                        )}
                      </div>
                      {/* El fallo, con el mismo contexto que la ficha del proyecto:
                          acta de compromiso (con su código) + firma, matriz del
                          jurado y fecha de rendición. */}
                      {p.estado === "ganadora" && (p.acta_url || p.codigo_acta || p.fecha_firma_acta || p.matriz_jurado_url || p.fecha_prorroga || p.fecha_limite_rendicion) && (
                        <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 9, borderLeft: "3px solid var(--green)", fontSize: TXT.chip, color: "var(--muted)" }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            {(p.acta_url || p.codigo_acta || p.fecha_firma_acta) && (
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                {p.acta_url
                                  ? <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</a>
                                  : <span style={{ color: "var(--dim)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</span>}
                                {p.fecha_firma_acta && <span>🖋 firmada {verFicha("f", p.fecha_firma_acta)}</span>}
                              </span>
                            )}
                            {p.matriz_jurado_url && (
                              <a href={p.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                                title="Matriz de evaluación del jurado" style={{ color: "var(--violet)" }}>📊 Matriz jurado</a>
                            )}
                            {(p.fecha_prorroga || p.fecha_limite_rendicion) && (
                              <span style={{ color: "var(--yellow)" }}>
                                🧾 rinde: {verFicha("f", p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Puntaje y comentario del jurado — gane o pierda. */}
                      {p.puntaje_jurado && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ color: "var(--yellow)", fontWeight: 700, fontSize: TXT.micro }}>
                            ⚖️ {p.puntaje_jurado} pts — matriz del jurado
                          </span>
                        </div>
                      )}
                      {p.feedback_jurado && (
                        p.feedback_jurado.length > 180 ? (
                          <details className="jurado-box" style={{ marginTop: 8 }}>
                            <summary>
                              <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b>
                              <span className="jx"><br />{p.feedback_jurado.slice(0, p.feedback_jurado.lastIndexOf(" ", 180))}… <i>ver más</i></span>
                            </summary>
                            <div style={{ marginTop: 6 }}>{p.feedback_jurado}</div>
                          </details>
                        ) : (
                          <div className="jurado-box" style={{ marginTop: 8 }}>
                            <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b><br />
                            {p.feedback_jurado}
                          </div>
                        )
                      )}
                      {(p.equipo || []).length > 0 && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                          {ordenarEquipo(p.equipo).map((e: any, i: number) => (
                            <PersonaChip key={i} id={e.persona?.id} nombre={e.persona?.nombre}
                              alias={e.persona?.alias} foto={e.persona?.foto_url} rol={e.cargo} />
                          ))}
                        </div>
                      )}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin postulaciones registradas para {nombre}.</div>
              );
              /* Antigüedad: fecha de constitución + años cumplidos desde
                 entonces (una trayectoria empieza por cuándo nació la empresa). */
              const fundada = ent.fecha_constitucion ? new Date(ent.fecha_constitucion + "T12:00:00") : null;
              const aniosFund = fundada && !isNaN(+fundada)
                ? Math.max(0, Math.floor((Date.now() - fundada.getTime()) / (365.25 * 24 * 3600 * 1000)))
                : null;
              const trayectoriaEmp = (
                <>
                  {empPostusCard}
                  {/* Miembros y cargos es su propia tarjeta (`.linked` ya es una
                      caja): «con quién compite» arriba, «quién la constituye»
                      abajo — dos cosas distintas, separadas. */}
                  <Miembros empresaId={params.id} miembros={miembros} personas={personasCat} />
                  {/* La antigüedad cierra la trayectoria: cuándo nació y cuánto
                      lleva —el dato de fondo, al pie. */}
                  {fundada && !isNaN(+fundada) && (
                    <div className="card emp-fundada">
                      <span>🏛 Fundada el {fundada.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}</span>
                      {aniosFund != null && (
                        <span className="emp-fundada-anios">{aniosFund === 0 ? "menos de 1 año" : `${aniosFund} año${aniosFund === 1 ? "" : "s"}`} de fundada</span>
                      )}
                    </div>
                  )}
                </>
              );
              const dafoNode = (
                <HojaPostulacion inline empresa={ent} miembros={miembrosHoja}
                  trabasEmp={trabasEmp} libre={empLibre}
                  bloqueada={comp.ejec > 0} enConcurso={comp.juego > 0}
                  partesReserva={partesReserva} reserva={reserva} />
              );
              const repoEmp = (
                <>
                  <Repositorio entidadTipo={params.tipo} entidadId={params.id} objetos={objetosDe} verif={verifDe} />
                  {objetosVinculados.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                      {objetosVinculados.map((o: any) => (
                        <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                          {previewCandidates(o.url, 200).length
                            ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                            : <span>{icoObjeto(o.tipo)}</span>}
                          <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                            de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              );
              const histEmp = eventosVis.length > 0 ? histInner : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin actividad registrada todavía.</div>
              );
              const muroEmp = (
                <MuroProyecto proyectoId={params.id} entidadTipo="empresa" userId={user.id}
                  perfiles={perfilesCat} sugerencias={muroEtqs} posts={muroPosts} materiales={objetosDe} />
              );
              return (
                <TabsPanel extra={driveTab} masUltima
                  labels={[
                    `📝 Muro · ${muroPosts.length}`,
                    `🏆 Trayectoria · ${postusEmp.length + miembros.length}`,
                    `📋 Casos · ${activas.length}`,
                    "🎬 Elegibilidad DAFO",
                    `📚 Repositorio · ${objetosDe.length}`,
                    `🕐 Historial · ${totEventos}`,
                  ]}
                  paneles={[muroEmp, trayectoriaEmp, trabajoNode, dafoNode, repoEmp, histEmp]}
                  iconoSolo={[4, 5]}
                />
              );
            }
            /* EQUIPAMIENTO en pestañas, como el resto: Casos · Préstamos ·
               Repositorio · Historial. El registro de préstamos (prestar,
               devolver, historial de uso) vive en su propia pestaña; el carné
               solo lleva el resumen (estado + quién lo tiene ahora). */
            if (params.tipo === "equipamiento") {
              const bitacoraNode = (
                <PrestamoEquipo equipoId={params.id} prestamos={prestamos}
                  personas={personasCat} proyectos={proyectosPrest} userId={user.id}
                  perfiles={prestamoPerfiles} bitacora={bitacoraEq} estado={ent.estado} />
              );
              // Total de entradas de la línea: comentarios (sueltos + de cada uso)
              // + eventos de uso (inicio + fin).
              const nComsBita = bitacoraEq.length + prestamos.reduce((s: number, p: any) => s + (p.comentarios?.length || 0), 0);
              const nEventos = prestamos.reduce((s: number, p: any) => s + (p.hasta ? 2 : 1), 0);
              const nBita = nComsBita + nEventos;
              const repoEq = (
                <>
                  <Repositorio entidadTipo={params.tipo} entidadId={params.id} objetos={objetosDe} verif={verifDe} />
                  {objetosVinculados.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                      {objetosVinculados.map((o: any) => (
                        <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                          {previewCandidates(o.url, 200).length
                            ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                            : <span>{icoObjeto(o.tipo)}</span>}
                          <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                            de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              );
              const histEq = eventosVis.length > 0 ? histInner : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin actividad registrada todavía.</div>
              );
              return (
                <TabsPanel extra={driveTab} masUltima
                  labels={[
                    `🗒 Bitácora · ${nBita}`,
                    `📋 Casos · ${activas.length}`,
                    `📚 Repositorio · ${objetosDe.length}`,
                    `🕐 Historial · ${totEventos}`,
                  ]}
                  paneles={[bitacoraNode, trabajoNode, repoEq, histEq]}
                  iconoSolo={[3]}
                />
              );
            }
            if (params.tipo !== "proyecto" && params.tipo !== "convocatoria") return vida;

            // Cronograma: común a proyecto y convocatoria
            const vivasCrono = cronoActs.filter((a: any) => a.estado !== "cancelada");
            const proxima = vivasCrono
              .filter((a: any) => a.estado === "planificada")
              .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1))[0];
            const etiquetaCrono = `📅 Crono · ${vivasCrono.length}` +
              (proxima ? ` · próx. ${new Date(proxima.fecha_inicio + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : "");
            const cronoNode = (
              <CronogramaProyecto key="crono" dueno={params.tipo as "proyecto" | "convocatoria"}
                duenoId={params.id} actividades={cronoActs} perfiles={perfilesCat}
                plantillas={plantillas} tipoProyecto={ent.tipo || ""} />
            );

            /* PROYECTO en pestañas, como empresa/persona:
                 Trabajo → Cronograma → Trayectoria → Repositorio → Historial.
               La Trayectoria reúne lo que antes vivía apilado en el carné:
               postulaciones y fondos, el equipo del proyecto y su cliente. */
            if (params.tipo === "proyecto") {
              // Lo más reciente arriba (por año de la convocatoria descendente).
              const postusProyOrd = [...postusProy].sort((a: any, b: any) =>
                (Number(b.conv?.anio) || 0) - (Number(a.conv?.anio) || 0));
              const postusCard = postusProyOrd.length > 0 ? (
                <div className="linked">
                  <h4>🎯 Postulaciones y fondos · {postusProyOrd.length}</h4>
                  <div className="tray-postus">
                  {postusProyOrd.map((p: any) => (
                    <div key={p.id} className="tray-post" style={{ ["--est-col" as any]: colorEstadoPost(p.estado) }}>
                      {/* Misma lógica que empresa/persona: estado en la ESQUINA
                          SUPERIOR DERECHA con su color de identidad. */}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <Link href={`/entidad/postulacion/${p.id}`}
                          style={{ color: "var(--text)", fontWeight: 600, fontSize: TXT.meta, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                          {ICONO_ESTADO[p.estado] || "🎯"} {p.conv?.nombre || p.codigo || "Postulación"} →
                        </Link>
                        <span className="badge" style={{ color: colorEstadoPost(p.estado), background: `color-mix(in srgb, ${colorEstadoPost(p.estado)} 15%, transparent)`, whiteSpace: "nowrap", flex: "none" }}>
                          {(p.estado || "").replace(/_/g, " ")}
                        </span>
                        <HiloPostulacionBtn postulacionId={p.id} nComentarios={contadoresPost[p.id]?.c || 0} nReacciones={contadoresPost[p.id]?.r || 0} />
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{p.conv.anio}</span>}
                        {/* Con qué empresa se presentó: contexto que faltaba —un
                            proyecto se presenta a través de una persona jurídica. */}
                        {p.emp && (
                          <Link href={`/entidad/empresa/${p.emp.id}`} className="post-proy-chip" title={p.emp.nombre}>
                            {p._logoEmp ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p._logoEmp} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                            ) : (
                              <span className="post-proy-chip-ph">🏢</span>
                            )}
                            <span className="post-proy-chip-txt">{p.emp.nombre} →</span>
                          </Link>
                        )}
                      </div>
                      {p.estado === "ganadora" && (
                        <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 9, borderLeft: "3px solid var(--green)", fontSize: TXT.chip, color: "var(--muted)" }}>
                          {/* Qué ganó: el monto adjudicado */}
                          {p.monto_adjudicado && (
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                                S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
                              </span>
                            </div>
                          )}
                          {/* El acta con su código (139-2025-DAFO ES el código del
                              acta) y su firma van juntas: el 🖋 es la fecha en que
                              se firmó ESE documento, no un dato suelto. */}
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
                            {(p.acta_url || p.codigo_acta || p.fecha_firma_acta) && (
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                {p.acta_url
                                  ? <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</a>
                                  : <span style={{ color: "var(--dim)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</span>}
                                {p.fecha_firma_acta && <span>🖋 firmada {verFicha("f", p.fecha_firma_acta)}</span>}
                              </span>
                            )}
                            {/* La matriz del jurado, junto al acta —como en la
                                ficha de la postulación: son los dos papeles del
                                fallo. */}
                            {p.matriz_jurado_url && (
                              <a href={p.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                                title="Matriz de evaluación del jurado" style={{ color: "var(--violet)" }}>📊 Matriz jurado</a>
                            )}
                            {(p.fecha_prorroga || p.fecha_limite_rendicion) && (
                              <span style={{ color: "var(--yellow)" }}>
                                🧾 rinde: {verFicha("f", p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Lo que dijo el jurado: puntaje de la matriz y su
                          comentario. Va para cualquier postulación evaluada —gane
                          o pierda—, porque el fallo del jurado no es solo del que
                          ganó. */}
                      {p.puntaje_jurado && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ color: "var(--yellow)", fontWeight: 700, fontSize: TXT.micro }}>
                            ⚖️ {p.puntaje_jurado} pts — matriz del jurado
                          </span>
                        </div>
                      )}
                      {/* El comentario, con «ver más»: largo se recorta y se abre
                          en su sitio; corto se muestra entero. Mismo patrón que la
                          ficha de la postulación. */}
                      {p.feedback_jurado && (
                        p.feedback_jurado.length > 180 ? (
                          <details className="jurado-box" style={{ marginTop: 8 }}>
                            <summary>
                              <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b>
                              <span className="jx"><br />{p.feedback_jurado.slice(0, p.feedback_jurado.lastIndexOf(" ", 180))}… <i>ver más</i></span>
                            </summary>
                            <div style={{ marginTop: 6 }}>{p.feedback_jurado}</div>
                          </details>
                        ) : (
                          <div className="jurado-box" style={{ marginTop: 8 }}>
                            <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b><br />
                            {p.feedback_jurado}
                          </div>
                        )
                      )}
                      {/* El equipo con que se presentó a ESE concurso (distinto
                          del equipo del proyecto). En la ganadora es «el equipo
                          ganador»: el dato de contexto que faltaba. */}
                      {(p.equipo || []).length > 0 && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                          {ordenarEquipo(p.equipo).map((e: any, i: number) => (
                            <PersonaChip key={i} id={e.persona?.id} nombre={e.persona?.nombre}
                              alias={e.persona?.alias} foto={e.persona?.foto_url} rol={e.cargo} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              ) : null;
              /* Orden de la Trayectoria: primero quién hace la película (el
                 equipo del proyecto), luego su recorrido ante los fondos —cada
                 postulación con su empresa y su equipo ganador—, y al final el
                 cliente, que solo existe si el proyecto es un encargo. */
              const trayectoriaProy = (
                <>
                  <EquipoProyecto proyectoId={params.id} equipo={equipoProy} personas={personasCat} />
                  {/* Los actores sociales van junto al equipo: ambos son las
                      personas del proyecto —quienes lo hacen y a quiénes retrata. */}
                  {/* El tipo decide cómo se llama esto: en documental son
                      actores sociales —la persona ES el personaje—; en ficción
                      y animación son personajes, con o sin intérprete. */}
                  <ActoresProyecto proyectoId={params.id} actores={actoresProy}
                    personas={personasCat} tipo={ent.tipo} error={actoresError} />
                  {postusCard}
                  <ClienteProyecto proyectoId={params.id} cliente={clienteDe} personas={personasCat} />
                </>
              );
              const repoProy = (
                <>
                  <Repositorio entidadTipo={params.tipo} entidadId={params.id} objetos={objetosDe} verif={verifDe} />
                  {objetosVinculados.length > 0 && (
                    <div className="linked" style={{ marginTop: 14 }}>
                      <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                      {objetosVinculados.map((o: any) => (
                        <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                          {previewCandidates(o.url, 200).length
                            ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                            : <span>{icoObjeto(o.tipo)}</span>}
                          <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                            de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              );
              const histProy = eventosVis.length > 0 ? histInner : (
                <div className="empty" style={{ padding: "18px 0" }}>Sin actividad registrada todavía.</div>
              );
              const muroNode = (
                <MuroProyecto proyectoId={params.id} userId={user.id}
                  perfiles={perfilesCat} sugerencias={muroEtqs} posts={muroPosts} materiales={objetosDe} />
              );
              return (
                <TabsPanel extra={driveTab} masUltima
                  labels={[
                    `📝 Muro · ${muroPosts.length}`,
                    etiquetaCrono,
                    `🏆 Trayectoria · ${postusProy.length + equipoProy.length + actoresProy.length}`,
                    `📋 Casos · ${activas.length}`,
                    `📚 Repositorio · ${objetosDe.length}`,
                    `🕐 Historial · ${totEventos}`,
                  ]}
                  paneles={[muroNode, cronoNode, trayectoriaProy, trabajoNode, repoProy, histProy]}
                  iconoSolo={[3, 4, 5]}
                />
              );
            }

            /* CONVOCATORIA en pestañas, como el resto:
                 Trabajo → Cronograma → Postulaciones → Repositorio → Historial.
               Su dominio propio son las postulaciones (a qué proyectos/empresas
               presentamos a este concurso) y el cronograma del concurso. */
            const postusConv = (
              <Postulaciones convocatoriaId={params.id} postulaciones={postus}
                proyectos={proyectosCat} empresas={empresasCat} carteles={cartelesProy} logosEmp={logosEmp} />
            );
            const repoConv = (
              <>
                <Repositorio entidadTipo={params.tipo} entidadId={params.id} objetos={objetosDe} verif={verifDe} />
                {objetosVinculados.length > 0 && (
                  <div className="linked" style={{ marginTop: 14 }}>
                    <h4>📚 Del repositorio · {objetosVinculados.length}</h4>
                    {objetosVinculados.map((o: any) => (
                      <Link key={o.id} href={`/objeto/${o.id}`} className="info-row" style={{ textDecoration: "none" }}>
                        {previewCandidates(o.url, 200).length
                          ? <Miniatura url={o.url} size={42} alt={o.titulo} />
                          : <span>{icoObjeto(o.tipo)}</span>}
                        <b style={{ flex: 1, fontSize: TXT.micro, color: "var(--text)" }}>{o.titulo}</b>
                        <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                          de {duenosObj.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—"}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            );
            const histConv = eventosVis.length > 0 ? histInner : (
              <div className="empty" style={{ padding: "18px 0" }}>Sin actividad registrada todavía.</div>
            );
            /* Postulaciones primero: en una convocatoria, lo que se viene a ver
               es a qué presentamos. Luego el cronograma del concurso, y después
               el trabajo/repositorio/historial. */
            return (
              <TabsPanel extra={driveTab} masUltima
                labels={[
                  `🎯 Postulaciones · ${postus.length}`,
                  etiquetaCrono,
                  `📋 Casos · ${activas.length}`,
                  `📚 Repositorio · ${objetosDe.length}`,
                  `🕐 Historial · ${totEventos}`,
                ]}
                paneles={[postusConv, cronoNode, trabajoNode, repoConv, histConv]}
                iconoSolo={[4]}
              />
            );
          })()}
        </main>
      </div>
    </div>
  );
}