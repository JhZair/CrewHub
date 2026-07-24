import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { BotonVerificarLote } from "@/components/VerificarSunat";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import Avatar from "@/components/Avatar";
import { alertaSunat, empresaDeCasa, esNuestra, esProblematico, textoSunat } from "@/lib/sunat";
import { REL_EMPRESA, EST_EMPRESA, completitud } from "@/lib/entidades";
import { TXT } from "@/lib/texto";
import Completitud from "@/components/Completitud";
import { CERRADOS } from "@/lib/familia";
import { fmtVence, vigenciaVencida } from "@/lib/vigencia";
import {
  enJuego, ejecutando, rendicionVencida, rendicionSinPlazo, plazoRendicion,
  empresaLibre, trabasEmpresa, puedePedirRenca, SIN_COMPROMISO, SEL_FONDO,
} from "@/lib/fondos";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import { buscadorDe, pal } from "@/lib/buscar";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🏢 Empresas" };

const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

/* Los rótulos van en plural porque aquí titulan filtros («Activas · 8»);
   el color y el vocabulario salen de lib/entidades, que es donde viven. */
const EST_META: Record<string, [string, string]> = {
  activa: ["Activas", EST_EMPRESA.activa[1]],
  en_constitucion: ["En constitución", EST_EMPRESA.en_constitucion[1]],
  inactiva: ["Inactivas", EST_EMPRESA.inactiva[1]],
  en_proceso_de_cierre: ["En cierre", EST_EMPRESA.en_proceso_de_cierre[1]],
  cerrada: ["Cerradas", EST_EMPRESA.cerrada[1]],
};

const TIPOS = ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"];
const ICONO_POST: Record<string, string> = {
  en_preparacion: "🛠", enviada: "📨", finalista: "⭐",
};
const REL_META = REL_EMPRESA;   // vive en lib/entidades: lo usan varias pantallas

/* Solo somos responsables de las propias y activas: son las únicas que
   deben exigir acción. El resto es contexto, no tarea.
   La regla vive en lib/sunat.ts, junto a la que decide si abrir un caso:
   si aquí y allá no dijeran lo mismo, el sistema alertaría de cosas que no
   te tocan, o te abriría casos que la lista no muestra. */
const nosCompete = esNuestra;


export default async function Empresas({ searchParams }: {
  searchParams: { q?: string; e?: string; sunat?: string; t?: string; r?: string; f?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const t = searchParams?.t || "";
  const r = searchParams?.r || "";
  const f = searchParams?.f || "";
  const sunat = searchParams?.sunat === "1";
  const listar = !!(q || e || sunat || t || r || f);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: emps }, { data: vincs }, { data: postsEmp }, { data: coms }, urlSunat,
         { data: directoras }, { data: medias }] = await Promise.all([
    supabase.from("empresas").select("*").order("codigo"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "empresa"),
    /* SEL_FONDO trae todo lo que necesita la regla. Si faltara
       `fecha_rendicion_real`, `ejecutando()` leería el hueco como «ya
       entregó» y la empresa saldría libre sin serlo. */
    supabase.from("postulaciones")
      .select(`${SEL_FONDO},codigo,proyecto_id,proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(codigo,nombre,anio)`)
      .not("empresa_id", "is", null),
    /* Solo los de caso: desde que los objetos del repositorio comentan en
       esta misma tabla, sin el filtro sus filas gastan el tope de PostgREST
       (1000) y el contador 💬 se queda corto en silencio. */
    supabase.from("comentarios").select("publicacion_id").not("publicacion_id", "is", null),
    // El link de SUNAT sale del admin, no del código: si SUNAT lo cambia
    // —lo ha hecho— se corrige ahí sin esperar un deploy.
    urlPlataforma(PLAT.sunatConsultaRuc),
    /* Quién dirige cada proyecto. Cierra el triángulo en este listado: la
       fila ya decía con qué proyecto está en concurso, y le faltaba con quién
       — que es la mitad del compromiso. */
    supabase.from("proyecto_equipo")
      .select("proyecto_id,cargo,persona:personas(id,nombre,alias)")
      .or("cargo.ilike.%direc%,cargo.ilike.%codirec%"),
    /* El logo/cartel de cada empresa, para el avatar de la fila. Se trae de
       entidad_media —la misma tabla que la portada de la ficha— y si no hay,
       Avatar cae a las iniciales con el color de la relación. */
    supabase.from("entidad_media").select("entidad_id,cartel_url").eq("entidad_tipo", "empresa"),
  ]);

  const logos = new Map<string, string>();
  (medias || []).forEach((m: any) => { if (m.cartel_url) logos.set(m.entidad_id, m.cartel_url); });

  // Actividad real en CrewHub+: en qué estado están sus casos y cuánto se conversó
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((c: any) => comentPorPub.set(c.publicacion_id, (comentPorPub.get(c.publicacion_id) || 0) + 1));

  type Act = { abiertas: number; progreso: number; cerradas: number; coments: number; total: number };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const a = act.get(v.entidad_id) || { abiertas: 0, progreso: 0, cerradas: 0, coments: 0, total: 0 };
    const est = (v.pub as any)?.estado;
    a.total++;
    if (est === "abierta") a.abiertas++;
    else if (["en_progreso", "seguimiento", "en_pausa"].includes(est)) a.progreso++;
    else if (CERRADOS.includes(est)) a.cerradas++;   // resuelta | descartada
    a.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, a);
  });
  const VACIO: Act = { abiertas: 0, progreso: 0, cerradas: 0, coments: 0, total: 0 };

  const todas = emps || [];
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global

  /* En juego y ejecutando viven en lib/fondos.ts: la misma regla estaba
     escrita aquí y en /qhaway, y ya empezaban a no decir lo mismo. */
  const marca = new Map<string, {
    total: number; ganadas: number; casi: number; monto: number;
    juego: number; ejec: number; debe: number; sinPlazo: number;
  }>();
  (postsEmp || []).forEach((p: any) => {
    const m = marca.get(p.empresa_id) || { total: 0, ganadas: 0, casi: 0, monto: 0, juego: 0, ejec: 0, debe: 0, sinPlazo: 0 };
    m.total++;
    if (p.estado === "ganadora") { m.ganadas++; m.monto += parseFloat(p.monto_adjudicado) || 0; }
    if (p.estado === "finalista_no_ganadora") m.casi++;
    if (enJuego(p)) m.juego++;
    if (ejecutando(p)) m.ejec++;
    if (rendicionVencida(p)) m.debe++;        // el plazo pasó y no hay entrega
    if (rendicionSinPlazo(p)) m.sinPlazo++;   // ganó y nadie cargó para cuándo rinde
    marca.set(p.empresa_id, m);
  });

  /* La cadena de papeles, en el orden real:
   *
   *   vigencia de poder  →  sirve para PEDIR el RENCA
   *   RENCA              →  sirve para POSTULAR
   *
   * La vigencia no es requisito del fondo: es requisito del trámite anterior.
   * Una vez que el RENCA está, ya cumplió — exigirla para postular era pedir
   * dos veces el mismo papel, en dos momentos distintos de la cadena.
   *
   * No era un detalle: con la regla vieja el sistema decía «1 libre» cuando
   * había 9 empresas que podían postular hoy mismo. Ocho oportunidades
   * apagadas por un papel que ya no hacía falta.
   */
  /* Las reglas viven en lib/fondos.ts: las lee esta lista y también la hoja
     de postulación de la ficha. Escritas dos veces, un día dirían cosas
     distintas — que es como empezó todo esto. */
  // Quién dirige cada proyecto, para cerrar el triángulo en cada fila
  const dirigeProy = new Map<string, any[]>();
  (directoras || []).forEach((d: any) => {
    if (!d.persona) return;
    const l = dirigeProy.get(d.proyecto_id) || [];
    l.push(d.persona); dirigeProy.set(d.proyecto_id, l);
  });

  const compDe = (x: any) => marca.get(x.id) || SIN_COMPROMISO;
  const libre = (x: any) => empresaLibre(x, compDe(x));
  const trabas = (x: any) => trabasEmpresa(x, compDe(x));

  // Filtro por fondos: cada opción con su prueba
  // A un trámite de distancia (lib/fondos.ts): le falta el RENCA y tiene con
  // qué pedirlo. No es un descarte, es una candidata.
  const casiLibre = (x: any) => puedePedirRenca(x, compDe(x));

  const PRUEBA_F: Record<string, (x: any) => boolean> = {
    libre: x => libre(x) || casiLibre(x),
    juego: x => (marca.get(x.id)?.juego || 0) > 0,
    ejecutando: x => (marca.get(x.id)?.ejec || 0) > 0,
    ganadoras: x => (marca.get(x.id)?.ganadas || 0) > 0,
    postularon: x => marca.has(x.id),
    nunca: x => !marca.has(x.id),
  };

  // Requiere atención = mal en SUNAT Y es nuestra responsabilidad
  const alertas = todas.filter(alertaSunat);
  const filtradas = todas.filter((x: any) =>
    (!e || x.estado === e) &&
    (!t || x.tipo === t) &&
    (!r || (x.relacion || "externa") === r) &&
    (!f || PRUEBA_F[f]?.(x)) &&
    // Antes el chip contaba con una regla y el filtro listaba con otra: decía
    // "⚠ SUNAT · 2" y al entrar te enseñaba una sola. Ahora es la misma.
    (!sunat || alertaSunat(x)) &&
    // Región, domicilio, RENCA y la clasificación entran al pajar: son las
    // otras formas de recordar una empresa cuando el nombre no viene
    (!q || coincide(pal(
      x.nombre, x.razon_social, x.codigo, x.region, x.domicilio_fiscal,
      x.ruc && `ruc ${x.ruc}`, x.renca && `renca ${x.renca}`,
      x.estado, x.relacion, x.tipo, x.estado_sunat, x.condicion_sunat))));
  const cnt = (est: string) => todas.filter((x: any) => x.estado === est).length;
  const cntF = (k: string) => todas.filter(PRUEBA_F[k]).length;

  // Palmarés competitivo: qué empresa gana, roza y persiste
  const palmares = todas
    .filter((x: any) => marca.has(x.id))
    .map((x: any) => ({ emp: x, ...marca.get(x.id)! }))
    .sort((a, b) => b.ganadas - a.ganadas || b.casi - a.casi || b.total - a.total)
    .slice(0, 10);

  /* La edición viva es la del año en curso; las de años anteriores son
     ediciones pasadas —quedan como contexto, apagadas— aunque su postulación
     siga marcada «en concurso» por dato viejo. */
  const anioActual = new Date().getFullYear();

  const Fila = (emp: any) => {
    const a = act.get(emp.id) || VACIO;
    const m = marca.get(emp.id);
    const esLibre = libre(emp);
    const casi = !esLibre && casiLibre(emp);   // candidata: apagada, no descartada
    const alerta = alertaSunat(emp);
    /* Tres motivos para bajarle la luz a una fila, y ninguno es «esto no
       sirve» — son «mira aquí después»:
         · casi       → todavía no puede postular, le falta un trámite
         · externa    → puede, pero es segunda opción: primero las de casa
         · no activa  → en constitución, inactiva, cerrando o cerrada
       `empresaDeCasa` vive en lib/sunat.ts y es la misma que apaga las
       externas en el buscador. Si aquí la escribiera aparte, un día una
       empresa saldría apagada en una pantalla y encendida en la otra.

       Y la regla que las cruza a las tres: NO SE APAGA LO QUE EL FILTRO
       PIDIÓ. Si entras a «En constitución · 5» y las cinco salen al 32%, la
       pantalla te está diciendo que lo que buscaste no importa. Apagar es
       para lo que aparece sin que lo llames. */
    const porEstado = emp.estado !== "activa" && e !== emp.estado;
    const porRelacion = !empresaDeCasa(emp) && r !== emp.relacion;
    const tenue = casi || porRelacion || porEstado;
    /* Las trabas que YA tienen su chip arriba: repetirlas es ruido. Se filtran
       aquí y no en `trabasEmpresa` porque la función decide —la usan la hoja
       de postulación y el filtro `casiLibre`, donde no hay chips que las
       cuenten—; esto es solo cómo se ve una fila. La regla, una vez; la
       pantalla, la que corresponda. */
    const CON_CHIP = /en concurso|ejecutando|rendición vencida|SUNAT|no habido|sin RUC|^(no activa|en constitución|inactiva|en proceso de cierre|cerrada)$/i;
    const sinChip = trabas(emp).filter(t => !CON_CHIP.test(t));
    /* Lo que tiene encima, con nombre: las que están en concurso y las que
       está ejecutando. El chip «⏳ 3 en concurso» decía cuántas y no cuáles, y
       «cuáles» es lo único accionable: un número no se puede abrir. El dato ya
       venía en la consulta —proyecto y convocatoria— y se tiraba.
       Las dos juntas porque son los dos motivos por los que una empresa no
       está libre, y quien mira la fila quiere ver de qué se trata. */
    const suyas = (postsEmp || []).filter((p: any) =>
      p.empresa_id === emp.id && (enJuego(p) || ejecutando(p)));
    return (
      /* Enlace estirado: la tarjeta entera lleva a la empresa mediante una
         capa invisible, y así los chips de dentro pueden ser enlaces propios.
         Con <Link> envolviendo todo serían un <a> dentro de otro <a> — HTML
         inválido: el navegador los reordena y React revienta al hidratar. */
      <div key={emp.id} className={`card link fila-cap${tenue ? " fila-tenue" : ""}`}
        style={{ cursor: "pointer", padding: "11px 16px" }}>
        <Link href={`/entidad/empresa/${emp.id}`} className="fila-cubre"
          aria-label={emp.nombre} />
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          {/* Avatar: el logo cargado, o las iniciales con el color de la
              relación (propia / aliada / externa) cuando no hay logo. */}
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            <Avatar nombre={emp.nombre} src={logos.get(emp.id)}
              color={REL_META[emp.relacion]?.[1]} size={38} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
          {/* línea 1: quién es */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: TXT.titulo }}>{emp.nombre}</b>
            {emp.relacion && (
              <span className="badge" style={{ color: REL_META[emp.relacion]?.[1] || "var(--dim)", background: "#1c1c2c" }}>
                {emp.relacion}
              </span>
            )}
            {emp.tipo && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{emp.tipo}</span>}
            {/* Lista para postular, o candidata a un trámite de distancia */}
            {esLibre && (
              <span className="badge" title="RUC y SUNAT en regla, RENCA en mano y sin nada encima: ni en concurso ni ejecutando. Las bases dejarían presentar dos con la misma empresa, pero solo se premia una al año — por eso aquí «libre» significa sin comprometer."
                style={{ color: "var(--green)", background: "rgba(46,204,113,.14)", fontWeight: 700 }}>
                ✅ libre para postular
              </span>
            )}
            {casi && (
              <span className="badge" title="Cumple todo lo demás y tiene la vigencia de poder vigente: falta tramitar el RENCA"
                style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontWeight: 700 }}>
                📋 puede pedir el RENCA
              </span>
            )}
            {/* Debiendo: el plazo pasó y nadie registró la entrega. Antes esto
                era invisible —se daba por cerrada— y es justo lo que impide
                postular. En rojo, delante de todo. */}
            {m && m.debe > 0 && (
              <span className="badge" title="El plazo de rendición pasó y no hay entrega registrada. Si ya se entregó, ponle la fecha en la postulación."
                style={{ color: "var(--red)", background: "rgba(255,77,94,.14)", fontWeight: 700 }}>
                🔴 rendición vencida
              </span>
            )}
            {m && m.debe === 0 && m.sinPlazo > 0 && (
              <span className="badge" title="Ganó un fondo y nadie cargó para cuándo debe rendir. Falta el dato — antes esto la dejaba pasar como libre."
                style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                🎬 ejecutando · sin plazo
              </span>
            )}
            {m && m.debe === 0 && m.sinPlazo === 0 && m.ejec > 0 && (
              <span className="badge" title="Tiene un fondo ganado con rendición pendiente, en plazo"
                style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)" }}>🎬 ejecutando</span>
            )}
            {/* En concurso: la partida sigue viva, es lo más accionable */}
            {m && m.juego > 0 && (
              <span className="badge" title={`${m.juego} postulación(es) en curso`}
                style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", fontWeight: 700 }}>
                ⏳ {m.juego} en concurso
              </span>
            )}
            {/* Palmarés: lo que ha logrado ante los fondos */}
            {m && m.ganadas > 0 && (
              <span className="badge" title={`${m.ganadas} fondo(s) ganado(s)`}
                style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>🏆 {m.ganadas}</span>
            )}
            {m && m.casi > 0 && (
              <span className="badge" title={`${m.casi} vez/veces finalista sin ganar`}
                style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>🥈 {m.casi}</span>
            )}
            {m && m.total > 0 && (
              <span className="badge" title={`${m.total} postulación(es) en total`}
                style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>🎯 {m.total}</span>
            )}
            {alerta && (
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
                ⚠ {textoSunat(emp)}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{
              color: EST_META[emp.estado]?.[1] || "var(--dim)", background: "#1c1c2c",
            }}>{(emp.estado || "—").replace(/_/g, " ")}</span>
          </div>

          {/* línea 2: su vida en CrewHub+ */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 7, fontSize: TXT.micro }}>
            {emp.codigo && <span style={{ color: "var(--dim)" }}>{emp.codigo}</span>}
            {/* Sin RUC solo alarma si figura activa: en constitución es normal */}
            {emp.ruc ? (
              <BotonFichaSunat numero={emp.ruc} tipo="RUC" compacto url={urlSunat} />
            ) : nosCompete(emp) ? (
              <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠ sin RUC</span>
            ) : null}
            {emp.razon_social && (
              <span style={{ color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {emp.razon_social}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {/* Qué le falta para poder postular — pero solo lo que no está ya
                dicho arriba. La fila llegó a decir «3 en concurso» tres veces:
                el chip ⏳ de la línea 1, esta línea, y los tres proyectos por
                su nombre en la línea 3. Repetir un dato no lo hace más cierto;
                solo tapa al que sí es nuevo, que suele ser «sin RENCA». */}
            {!esLibre && sinChip.length > 0 && (
              <span style={{ color: casi ? "var(--yellow)" : "var(--dim)" }}
                title={`Requisitos que no cumple para postular:\n${trabas(emp).join("\n")}`}>
                🚫 {sinChip.join(" · ")}
              </span>
            )}
            {m && m.monto > 0 && (
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                S/ {m.monto.toLocaleString("es-PE")} ganado
              </span>
            )}
            {a.abiertas > 0 && <span style={{ color: "var(--red)" }}>❗ {a.abiertas} sin resolver</span>}
            {a.progreso > 0 && <span style={{ color: "var(--yellow)" }}>🔄 {a.progreso} en progreso</span>}
            {a.cerradas > 0 && <span style={{ color: "var(--green)" }}>✅ {a.cerradas}</span>}
            {a.coments > 0 && <span style={{ color: "var(--muted)" }}>💬 {a.coments}</span>}
            {!a.total && <span style={{ color: "var(--dim)" }}>sin actividad</span>}
          </div>

          {/* línea 3: con QUÉ. Solo aparece si hay algo encima — que es
              cuando la pregunta existe. */}
          {suyas.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
              marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--border)", fontSize: TXT.micro }}>
              {suyas.map((p: any) => {
                /* El chip dice en qué punto está, porque «ejecutando» a secas
                   no distingue lo que hay que hacer: si va tarde, entregar;
                   si no hay plazo, cargarlo; si está en plazo, nada. */
                const ej = ejecutando(p);
                const debe = rendicionVencida(p);
                const sinPlazo = rendicionSinPlazo(p);
                const f = plazoRendicion(p);
                const d = ej && f ? -diasDesde(f) : null;   // + faltan, − pasaron
                const col = debe ? "var(--red)" : sinPlazo ? "var(--yellow)"
                  : ej ? "var(--teal)" : "var(--violet)";
                const fondo = debe ? "rgba(255,77,94,.14)" : sinPlazo ? "rgba(244,180,0,.12)"
                  : ej ? "rgba(45,212,191,.12)" : "rgba(167,139,250,.12)";
                const cola = debe ? ` · 🔴 venció hace ${-d!}d`
                  : sinPlazo ? " · ⚠ sin plazo cargado"
                  : ej ? ` · rinde en ${d}d` : "";
                // Edición pasada: la convocatoria es de un año anterior. Se
                // apaga —contexto, no lo activo—; ejecutando no se toca, que
                // sigue siendo trabajo vivo aunque el fondo sea de otro año.
                const anioConv = Number((p.conv as any)?.anio) || 0;
                const vieja = !ej && anioConv > 0 && anioConv < anioActual;
                return (
                  <Link key={p.id} href={`/entidad/postulacion/${p.id}`}
                    className={`badge fila-encima${vieja ? " edicion-pasada" : ""}`}
                    title={`${String(p.estado || "").replace(/_/g, " ")}`
                      + `${(p.conv as any)?.nombre ? ` · ${(p.conv as any).nombre}` : ""}`
                      + `${(p.conv as any)?.anio ? ` ${(p.conv as any).anio}` : ""}`
                      + (debe ? "\nEl plazo pasó y no hay entrega registrada. Si ya se entregó, ponle la fecha en la postulación." : "")
                      + (sinPlazo ? "\nGanó y nadie cargó para cuándo debe rendir." : "")
                      + "\n— ir a la postulación"}
                    style={{ color: col, background: fondo, fontWeight: debe ? 700 : 400,
                      textTransform: "none", letterSpacing: 0, textDecoration: "none",
                      // Todos al mismo tamaño (legibles); las ediciones pasadas
                      // se apagan por clase y se encienden al pasar el cursor.
                      fontSize: 11.5 }}>
                    {/* El proyecto es lo que identifica la postulación en la
                        cabeza de uno; la convocatoria en código, que es corta —
                        con el nombre completo el chip no cabría. El nombre
                        largo queda en el tooltip. */}
                    {ej ? "🎬" : ICONO_POST[p.estado] || "⏳"} {(p.proy as any)?.nombre_corto || (p.proy as any)?.nombre || p.codigo || "Postulación"}
                    {/* Con quién: el tercer vértice. La fila decía con qué
                        proyecto está comprometida esta empresa y callaba con
                        quién — que es la mitad del matrimonio. */}
                    {(dirigeProy.get(p.proyecto_id) || []).map((d: any) => (
                      <i key={d.id} style={{ color: "var(--accent)", fontStyle: "normal", fontWeight: 700 }}>
                        {" · 🎬 "}{d.alias || d.nombre}
                      </i>
                    ))}
                    {(p.conv as any) && (
                      <i style={{ opacity: .65, fontStyle: "normal" }}>
                        {" · "}{(p.conv as any).codigo || (p.conv as any).nombre}
                        {(p.conv as any).anio ? ` ${(p.conv as any).anio}` : ""}
                      </i>
                    )}
                    {cola} ↗
                  </Link>
                );
              })}
            </div>
          )}

          {(() => {
            const c = completitud("empresa", emp);
            return <Completitud mini pct={c.pct} llenos={c.llenos} total={c.total} faltan={c.faltan} />;
          })()}
          </div>{/* fin columna de contenido, junto al avatar */}
        </div>
      </div>
    );
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        {/* El atajo a 📁 Proyectos vivía aquí porque la nav solo estaba en el
            feed. Ahora la nav está en todas: repetirlo al lado solo confunde. */}
        <Link href="/casos/empresa" className="btn btn-ghost"
          title="Todos los casos, agrupados por empresa">🗂 Casos</Link>
        <Link href="/historial/empresa" className="btn btn-ghost"
          title="Todo lo que se movió en las empresas, por periodo">🕐 Historial</Link>
        <Link href="/entidad/empresa/nuevo" className="btn">＋ Nueva empresa</Link>
      </div>
      <h1 className="title-lg">🏢 Empresas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {t && <input type="hidden" name="t" value={t} />}
        {r && <input type="hidden" name="r" value={r} />}
        {f && <input type="hidden" name="f" value={f} />}
        {sunat && <input type="hidden" name="sunat" value="1" />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Nombre, razón social, RUC, RENCA, «en cierre», «aliada»…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/empresas" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Relación">
          {Object.entries(REL_META).map(([k, [lbl, col]]) => (
            <Chip key={k} href={`/empresas?r=${k}`} on={r === k} color={col}>
              {lbl} · {todas.filter((x: any) => (x.relacion || "externa") === k).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([k, [lbl, col]]) => (
            <Chip key={k} href={`/empresas?e=${k}`} on={e === k} color={col}>
              {lbl} · {cnt(k)}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Tipo">
          {TIPOS.map(tt => {
            const n = todas.filter((x: any) => x.tipo === tt).length;
            return n === 0 ? null : (
              <Chip key={tt} href={`/empresas?t=${tt}`} on={t === tt}>{tt} · {n}</Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Fondos">
          <Chip href="/empresas?f=libre" on={f === "libre"} color="var(--green)"
            title="Listas: RENCA en mano, papeles en regla y sin nada encima — ni en concurso ni ejecutando. El +N son las que solo necesitan tramitar el RENCA: ya tienen la vigencia de poder con que pedirlo.">
            ✅ libres para postular · {todas.filter(libre).length}
            {todas.filter(casiLibre).length > 0 && ` +${todas.filter(casiLibre).length}`}
          </Chip>
          <Chip href="/empresas?f=juego" on={f === "juego"} color="var(--violet)">
            ⏳ en concurso · {cntF("juego")}
          </Chip>
          {/* Ejecutando y ganadoras se parecen y no son lo mismo: la primera
              es deuda viva, la segunda es palmarés. Dan el mismo número
              mientras no haya ninguna rendición registrada como entregada —
              y eso no es un empate, es un aviso: para el sistema ningún
              fondo se cerró nunca. Los tooltips lo dicen, porque el número
              solo no lo puede decir. */}
          <Chip href="/empresas?f=ejecutando" on={f === "ejecutando"} color="var(--teal)"
            title="Ganó un fondo y todavía no entregó la rendición. Se cierra poniéndole la fecha de entrega a la postulación — no vence solo con el calendario.">
            🎬 ejecutando · {cntF("ejecutando")}
          </Chip>
          <Chip href="/empresas?f=ganadoras" on={f === "ganadoras"} color="var(--green)"
            title="Ganó algún fondo alguna vez. Es palmarés: no baja nunca, aunque ya haya rendido.">
            🏆 ganadoras · {cntF("ganadoras")}
          </Chip>
          <Chip href="/empresas?f=postularon" on={f === "postularon"} color="var(--blue)">
            🎯 postularon · {cntF("postularon")}
          </Chip>
          <Chip href="/empresas?f=nunca" on={f === "nunca"}>
            nunca postuló · {cntF("nunca")}
          </Chip>
        </FilaFiltro>
        {/* Para limpiar ya está "✕ Panel" arriba: no duplicamos el botón */}
        <FilaFiltro titulo="Atención">
          <Chip href="/empresas?sunat=1" on={sunat}
            color={alertas.length ? "var(--red)" : "var(--green)"}>
            ⚠ SUNAT · {alertas.length}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {(() => {
            // Activa y propia pero sin RUC: no puede verificarse ni postular
            const sinRuc = todas.filter((x: any) => nosCompete(x) && !x.ruc);
            return sinRuc.length > 0 && (
              <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
                <div className="panel-h" style={{ color: "var(--red)" }}>
                  🏛 Sin RUC registrado — no pueden verificarse ni postular
                </div>
                {sinRuc.map((x: any) => (
                  <div className="info-row" key={x.id}>
                    <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                      {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                    </Link>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--red)", fontSize: TXT.micro, fontWeight: 700 }}>falta el RUC</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {alertas.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>⚠ Salud SUNAT — requiere atención</div>
              {alertas.map((x: any) => (
                <div className="info-row" key={x.id}>
                  <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                    {x.codigo ? `${x.codigo} · ` : ""}{x.nombre}
                  </Link>
                  <span style={{ flex: 1 }} />
                  {/* Ojo: aquí había un x.estado_sunat.replace() directo. Una
                      empresa puede entrar a esta lista solo por "no habido",
                      con estado_sunat en null, y eso tumbaba toda la página. */}
                  <span style={{ color: "var(--red)", fontSize: TXT.micro, fontWeight: 700 }}>
                    {textoSunat(x)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(() => {
            /* Vigencia vencida Y sin RENCA: ahí sí bloquea, y bloquea dos
               veces. La vigencia es el papel con que se pide el RENCA, y sin
               RENCA no se postula — o sea, dos trámites en fila y el primero
               caducado.
               Antes esta alerta salía para toda vigencia vencida y decía
               «renovar antes de postular». Era falso: con el RENCA en mano
               se postula igual. Reclamaba un papel que ya cumplió. */
            const anejas = todas.filter((x: any) =>
              nosCompete(x) && !x.renca && vigenciaVencida(x.vigencia_poder_fecha));
            return anejas.length > 0 && (
              <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
                <div className="panel-h" style={{ color: "var(--yellow)" }}>
                  📜 Vigencia vencida y sin RENCA — hay que renovarla para poder pedirlo
                </div>
                {anejas.map((x: any) => (
                  <div className="info-row" key={x.id}>
                    <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                      {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                    </Link>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--yellow)", fontSize: TXT.micro, fontWeight: 700 }}>
                      venció el {fmtVence(x.vigencia_poder_fecha)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* La sección «En concurso ahora» se quitó: eso ya vive en la página
              de postulaciones, y repetirlo aquí —en la lista de empresas—
              confundía sobre de qué trata esta pantalla. */}

          {palmares.length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🏅 Palmarés — quién gana, quién roza, quién persiste</div>
              {palmares.map(({ emp, total, ganadas, casi, monto }) => (
                <div className="info-row" key={emp.id}>
                  <Avatar nombre={emp.nombre} src={logos.get(emp.id)}
                    color={REL_META[emp.relacion]?.[1]} size={26} />
                  <Link href={`/entidad/empresa/${emp.id}`} style={{ fontWeight: 600 }}>
                    {emp.codigo ? `${emp.codigo} · ` : ""}{emp.nombre} →
                  </Link>
                  {ganadas > 0 && (
                    <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>
                      🏆 {ganadas}
                    </span>
                  )}
                  {casi > 0 && (
                    <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                      🥈 {casi}
                    </span>
                  )}
                  <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>
                    🎯 {total} intento{total === 1 ? "" : "s"}
                  </span>
                  <span style={{ flex: 1 }} />
                  {monto > 0 && (
                    <span style={{ color: "var(--teal)", fontSize: TXT.micro, fontWeight: 700 }}>
                      S/ {monto.toLocaleString("es-PE")} ganado
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            {/* "Del grupo" era mentira: la mayoría son terceros. El color
                dice de quién es cada una; el borde rojo, solo lo que nos toca. */}
            <div className="panel-h">🏢 Todas las empresas · {todas.length}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {todas.map((x: any) => {
                const alerta = alertaSunat(x);
                const col = REL_META[x.relacion]?.[1];
                const base: any = { display: "inline-flex", alignItems: "center", gap: 6 };
                const estilo = alerta ? { ...base, borderColor: "var(--red)", color: "var(--red)" }
                  : x.relacion === "propia" || x.relacion === "aliada" ? { ...base, color: col } : base;
                return (
                  <Link key={x.id} href={`/entidad/empresa/${x.id}`} className="vtab"
                    title={`${x.relacion || "externa"}${x.tipo ? ` · ${x.tipo}` : ""}`}
                    style={estilo}>
                    <Avatar nombre={x.nombre} src={logos.get(x.id)}
                      color={REL_META[x.relacion]?.[1]} size={18} />
                    {x.nombre}
                  </Link>
                );
              })}
            </div>
            <p style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "10px 0 0" }}>
              <span style={{ color: "var(--violet)" }}>propias</span> ·{" "}
              <span style={{ color: "var(--teal)" }}>aliadas</span> · externas ·{" "}
              <span style={{ color: "var(--red)" }}>requiere atención</span>
            </p>
          </div>

          {/* La Ronda SUNAT va al final: es una herramienta de mantenimiento
              (reverificar RUCs en lote), no lo primero que se viene a mirar. */}
          <div className="card">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="panel-h" style={{ margin: 0 }}>🔄 Ronda SUNAT</div>
              <span style={{ flex: 1 }} />
              <BotonVerificarLote />
            </div>
            <p style={{ color: "var(--dim)", fontSize: TXT.micro, margin: "8px 0 0" }}>
              Consulta el RUC de todas las activas y actualiza estado, condición y fecha de verificación.
              Bot Qhaway deja de contar "sin verificar" por 60 días.
            </p>
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: TXT.micro, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {r && ` · ${r}`}{t && ` · ${t}`}
            {f === "juego" ? " · en concurso" : f === "ganadoras" ? " · ganadoras"
              : f === "postularon" ? " · postularon" : f === "nunca" ? " · nunca postuló" : ""}
            {sunat && " · con alerta SUNAT"}{q && ` · «${q}»`}
          </div>
          {/* Agrupadas por tipo: las eirl con las eirl, las asociaciones juntas */}
          {(() => {
            const orden = [...TIPOS, ""];   // "" recoge las que no tienen tipo
            const grupos = orden
              .map(tt => ({ tt, filas: filtradas.filter((x: any) => (x.tipo || "") === tt) }))
              .filter(g => g.filas.length > 0);
            return grupos.map(({ tt, filas }) => (
              <div key={tt || "sin"} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                    {tt || "sin tipo"} · {filas.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                {filas.map(Fila)}
              </div>
            ));
          })()}
          {!filtradas.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
        </>
      )}
    </div>
  );
}
