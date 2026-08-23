import { mapaAlias } from "@/lib/personas";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Obligaciones from "@/components/Obligaciones";
import { resumenPeriodos, DIAS_AVISO, situacionPeriodo } from "@/lib/obligaciones";
import ResumenObligaciones, { type FilaObl } from "@/components/ResumenObligaciones";
import { conRuc } from "@/lib/empresasPropias";
import { hilosDeFilas } from "@/lib/rendicionHilo";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import { repLegalDeEmpresas } from "@/lib/repLegal";

export const metadata: Metadata = { title: "📅 Obligaciones" };

/* ── 📅 LO QUE VENCE SOLO ──
 *
 * Las declaraciones ante SUNAT de cada empresa: mensual de IGV-Renta y jurada
 * anual. No las pide nadie y no las asigna nadie — vencen, y la multa crece
 * con el tiempo.
 *
 * Sustituye una tabla de SeaTable que funcionaba salvo por dos cosas: los
 * meses había que crearlos a mano (y un mes que nadie crea no vence, no alerta
 * y no se echa de menos) y la fecha de vencimiento se tecleaba de memoria.
 * Ver db/obligaciones.sql y lib/obligaciones.ts.
 *
 * ── ABIERTO A TODO EL EQUIPO, A PROPÓSITO ──
 * Aquí no se mira `es_admin`, ni en la pantalla ni en las acciones, y las
 * políticas de db/obligaciones.sql dejan escribir a cualquier `authenticated`.
 * No es un olvido: se decidió así. Quien entra a CrewHub es del colectivo, y
 * poner una puerta entre esa persona y «marcar declarado» solo conseguiría que
 * el mes venciera esperando a que apareciera un administrador.
 *
 * Lo que sí conviene saber de esa decisión: cualquiera puede marcar un periodo
 * como declarado sin haberlo declarado, o dar de baja una obligación viva. No
 * hay malicia que temer, pero sí despistes, y el semáforo en verde de un mes
 * que nadie presentó es exactamente el fallo que este módulo existe para
 * evitar. Por eso el importador de SOL importa: lo que viene de la constancia
 * trae número de orden y fecha reales, y eso no se marca a mano por error.
 *
 * Si algún día entra gente de fuera del colectivo, el interruptor ya existe
 * —`perfiles.es_admin`, que usan jornadas, liquidaciones y expedientes— y hay
 * que cerrarlo en los DOS sitios: aquí y en las políticas RLS. Cerrarlo solo
 * en la pantalla no cierra nada.
 *
 * ── SOLO LAS EMPRESAS PROPIAS ──
 * Una empresa aliada o externa declara lo suyo por su cuenta; ponerla aquí
 * sería reclamarnos un trabajo que no es nuestro, y con el semáforo en rojo
 * de por vida. Es la misma regla que ya aplica la alerta SUNAT de /empresas.
 */
export default async function ObligacionesPage({ searchParams }: {
  searchParams: { emp?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pedido = searchParams?.emp || "";

  const [emp, obl, perf, aliasPers, urlSol] = await Promise.all([
    /* `fecha_constitucion`: es el suelo de los periodos —una empresa no declara
       antes de existir— y lo que la pantalla ofrece como arranque por defecto. */
    /* ── UNA EMPRESA, O TODAS ──
       Con `?emp=` se pide solo esa: la pantalla de una empresa no necesita las
       otras catorce, y hasta ahora las traía siempre. Sin parámetro se traen
       todas, porque el resumen las cuenta a todas.
       `fecha_constitucion` es el suelo de los periodos —una empresa no declara
       antes de existir— y lo que la pantalla ofrece como arranque. */
    (pedido
      ? supabase.from("empresas").select("id,nombre,ruc,estado,relacion,fecha_constitucion")
          .eq("id", pedido).eq("relacion", "propia")
      : supabase.from("empresas").select("id,nombre,ruc,estado,relacion,fecha_constitucion")
          .eq("relacion", "propia").order("nombre")),
    /* Con empresa elegida, solo sus obligaciones: las de las otras catorce no
       se pintan ni se cuentan en esa pantalla. */
    (pedido
      ? supabase.from("obligacion")
          .select("id,entidad_id,entidad_tipo,clase,periodicidad,dias_aviso,activa,responsable,desde")
          .eq("entidad_tipo", "empresa").eq("entidad_id", pedido)
      : supabase.from("obligacion")
          .select("id,entidad_id,entidad_tipo,clase,periodicidad,dias_aviso,activa,responsable,desde")),
    /* `avatar_url` y `color`: quien responde de una declaración se reconoce de
       un vistazo por la cara, no leyendo un nombre en gris al pie del bloque.
       El color es el respaldo cuando no hay foto — lo usa <Avatar/> para las
       iniciales. */
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
    /* ── EL ALIAS CORTO ──
       `perfiles.nombre` guarda el largo («Katherine Pérez Díaz»); el corto que
       usa el equipo —«KatyP»— vive en `personas.alias`, cruzado por
       `usuario_id`. En una fila de veintiocho periodos el largo no cabe, y no
       es como se llaman entre ellos.
       Mismo cruce y misma función que /admin, /caja y las fichas: `mapaAlias`.
       Escribirlo aquí a mano habría sido la quinta versión de «cómo se llama
       corto esta persona». */
    supabase.from("personas").select("usuario_id,alias")
      .not("alias", "is", null).not("usuario_id", "is", null),
    /* La puerta a SUNAT sale de `plataformas`, como todas las demás del
       sistema: si SUNAT cambia la URL se corrige en un sitio. Si la clave no
       está cargada, el botón sencillamente no se pinta — mejor que un enlace
       roto que enseña a no fiarse de los enlaces. */
    urlPlataforma(PLAT.sunatSol),
  ]);

  /* Sin RUC no hay último dígito, sin dígito no hay fecha de vencimiento y sin
     fecha no hay nada que vigilar: esas empresas solo alargaban la lista con
     ceros. Se ven en /empresas, que es donde se corrige lo que les falta.
     El criterio es el mismo que usa la barra, importado del mismo sitio. */
  const empresas = ((emp.data || []) as any[]).filter(conRuc);
  /* ── LA CARA DE CADA EMPRESA Y DE QUIEN FIRMA ──
     Diez asociaciones con nombres que empiezan igual («Asoc Pumachay», «Asoc
     Pichiuchallay», «Asoc Pumahuasi») se distinguen antes por su logo que por
     su nombre. Y el representante legal importa aquí más que en ningún otro
     listado: es quien tiene la Clave SOL y quien responde si algo se venció.
     Los dos van por lote, nunca uno por empresa. */
  const idsEmp = empresas.map((e: any) => e.id);
  const idsObl = ((obl.data || []) as any[]).map((o: any) => o.id);

  /* ── EL SUELO DE LOS COMPROBANTES ──
     Antes salía del año del periodo más antiguo, y los periodos se piden ahora
     en la MISMA tanda: esperarlos para acotar esto habría costado un viaje
     entero. La constitución vale igual de suelo y se conoce ya —un periodo no
     puede ser anterior a que la empresa exista— así que se usa esa.
     Sin fecha cargada no se pone suelo: inventarlo escondería facturas que sí
     cuentan. */
  const aniosNac = empresas
    .map((e: any) => Number(String(e.fecha_constitucion || "").slice(0, 4)))
    .filter((a: number) => a > 1990);
  const anioMin = aniosNac.length ? Math.min(...aniosNac) : null;

  /* ── LOS COMPROBANTES, ACOTADOS POR LO QUE LA PANTALLA PUEDE ENSEÑAR ──
     Esta consulta no tenía ningún filtro: se traía TODOS los comprobantes que
     existen, de todas las empresas y de todos los años, en cada render de la
     página. Es la que peor envejecía — los periodos crecen doce al año por
     empresa, pero las facturas crecen a cientos, y esto se volvía a pedir en
     cada refresco.
     Ahora se acota por las dos cosas que la pantalla realmente puede usar:
       · las empresas propias, que son las únicas que se listan;
       · desde el primer año que hay periodo, porque un comprobante anterior a
         cualquier periodo no entra en ningún cálculo.
     Va en esta segunda tanda porque el suelo de fechas sale de los periodos,
     que se piden en la primera. No cuesta un viaje más: comparte tanda con los
     logos y el representante legal, que ya estaban aquí.

     `empresa_id` puede no existir todavía: si falta db/comprobante-empresa.sql
     la consulta falla entera y el resultado se queda en manual, que es
     exactamente el estado anterior. No tumba la pantalla. */
  const [media, repLegal, per, cmp, hilos] = await Promise.all([
    idsEmp.length
      ? supabase.from("entidad_media").select("entidad_id,cartel_url")
          .eq("entidad_tipo", "empresa").in("entidad_id", idsEmp)
      : Promise.resolve({ data: [] as any[] }),
    repLegalDeEmpresas(supabase, idsEmp),
    /* ── LOS PERIODOS, DE LAS OBLIGACIONES QUE SE VAN A PINTAR ──
       Se traen todos los de esas obligaciones, y es deliberado: el semáforo de
       cada cabecera —«9 vencidos · 26 declarados · 22 fuera de plazo de 28»—
       se calcula sobre TODOS, y acotarlos por año lo haría mentir sin avisar.
       Lo que cambió es CUÁNTAS obligaciones son: con una empresa elegida, las
       suyas. Antes se traían los periodos de las quince siempre.
       Las columnas son las diecisiete que la pantalla usa de verdad; `*`
       arrastraba el jsonb de rectificaciones y las casillas por varios cientos
       de filas. */
    idsObl.length
      ? supabase.from("obligacion_periodo").select(
          "id,obligacion_id,anio,mes,vence,declarado_en,declarado_por,declarado_orden," +
          "registrado_en,nro_orden,rectificaciones,resultado,monto,nota,caso_id," +
          "igv_debito,igv_credito").in("obligacion_id", idsObl)
      : Promise.resolve({ data: [] as any[] }),
    /* ── LOS COMPROBANTES, ACOTADOS POR LO QUE LA PANTALLA PUEDE ENSEÑAR ──
       Esta consulta no tenía ningún filtro: traía TODOS los comprobantes que
       existen, de todas las empresas y de todos los años, en cada render. Es
       la que peor envejecía — los periodos crecen doce al año por empresa,
       pero las facturas crecen a cientos.
       Ahora, las de las empresas que se pintan y desde que la primera existe.
       `empresa_id` puede no existir todavía: si falta db/comprobante-empresa.sql
       la consulta falla entera y el resultado se queda en manual, que es
       exactamente el estado anterior. No tumba la pantalla. */
    idsEmp.length
      ? (anioMin
          ? supabase.from("comprobante").select("empresa_id,fecha,igv,sentido")
              .in("empresa_id", idsEmp).gte("fecha", `${anioMin}-01-01`)
          : supabase.from("comprobante").select("empresa_id,fecha,igv,sentido")
              .in("empresa_id", idsEmp))
      : Promise.resolve({ data: [] as any[] }),
    /* ── EL HILO, PREGUNTANDO POR LA COLUMNA Y NO POR LOS IDS ──
       Antes iba en su propio `await`, con la lista COMPLETA de identificadores
       de periodo: tres consultas de varios cientos de UUID en la URL, creciendo
       doce por empresa y año, para averiguar que hay un comentario. Con
       `todas` se pide al revés —«los hilos que existan»— y lo que viaja pasa a
       depender de cuántas conversaciones hay, no de cuántas filas.
       Y al entrar en esta tanda deja de ser una espera propia. */
    hilosDeFilas(supabase, "obligacion_periodo", [], { todas: true }),
  ]);
  const periodosCrudos = ((per as any).data || []) as any[];
  /* El alias se pega al perfil aquí y no en el componente: así la pantalla
     recibe «la persona» ya completa y no tiene que cruzar dos listas cada vez
     que quiere escribir un nombre. */
  const alias = mapaAlias((aliasPers as any).data as any);
  const perfilesCortos = (((perf as any).data || []) as any[])
    .map((x: any) => ({ ...x, corto: alias[x.id] || null }));
  const logos: Record<string, string> = {};
  ((media as any).data || []).forEach((m: any) => {
    if (m.cartel_url) logos[m.entidad_id] = m.cartel_url;
  });
  const rls: Record<string, any> = {};
  repLegal.forEach((v, k) => { rls[k] = v; });

  /* Si falta la migración, las dos consultas de obligaciones vuelven con su
     queja y `data` en nulo. La pantalla se abre igual y lo explica arriba: un
     error en blanco haría pensar que no hay nada que declarar. */
  const error = (obl as any)?.error?.message || (per as any)?.error?.message || null;
  /* El aviso del cálculo va aparte del de las obligaciones: son dos
     migraciones distintas y decir «falta db/obligaciones.sql» cuando lo que
     falta es la otra manda a correr el archivo equivocado. */
  const errorIgv = (cmp as any)?.error?.message || null;
  const obligaciones = (obl.data || []) as any[];

  /* El contador de comentarios y los 👀 tienen que estar EN LA LISTA: una
     conversación de cuatro mensajes sobre noviembre 2024 es invisible si hay
     que abrir mes por mes para descubrirla.
     Si falta db/obligacion-hilo.sql `hilos` vuelve vacío con su queja y la
     pantalla sigue —sin contadores— en vez de caerse. */
  const periodos = periodosCrudos.map((p: any) => ({
    ...p,
    nComentarios: hilos.conteo.get(p.id) || 0,
    reacciones: hilos.reacciones.get(p.id) || [],
    caso: hilos.casos.get(p.id) || null,
  }));

  /* El titular. Se calcula aquí y no en el cliente porque es lo primero que se
     lee y no debe depender de desplegar nada. */
  const diasPorObl = new Map(obligaciones.map((o: any) => [o.id, o.dias_aviso ?? DIAS_AVISO]));
  const res = resumenPeriodos(
    periodosCrudos.map((p: any) => ({ ...p, _d: diasPorObl.get(p.obligacion_id) })));
  const vencidos = periodosCrudos.filter((p: any) =>
    !p.declarado_en && p.vence && String(p.vence).slice(0, 10) <
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })).length;

  /* ── EL RESUMEN DE TODAS, CUANDO NO HAY NINGUNA ELEGIDA ──
     Se cuenta con las MISMAS reglas que la pantalla de una empresa —
     `situacionPeriodo` y los días de aviso de cada obligación—, no con un
     criterio propio: dos formas de decir «vencido» acaban dando dos números
     para el mismo mes, y entonces no se cree ninguno. */
  const resumen = new Map<string, FilaObl>();
  if (!pedido) {
    /* El nombre de quien apuntó sale de los perfiles ya traídos; no vale una
       consulta más para poner un nombre al lado de una fecha. */
    const nombreDe = new Map<string, string>(
      perfilesCortos.map((x: any) => [x.id, x.corto || x.nombre]));
    const oblDeEmp = new Map<string, string>(
      obligaciones.map((o: any) => [o.id, o.entidad_id]));
    periodosCrudos.forEach((p: any) => {
      const eid = oblDeEmp.get(p.obligacion_id);
      if (!eid) return;
      const a = resumen.get(eid)
        || { empresaId: eid, vencidos: 0, porVencer: 0, declarados: 0, total: 0, ultima: null, ultimaPor: null };
      a.total++;
      const sit = situacionPeriodo(p, diasPorObl.get(p.obligacion_id) ?? DIAS_AVISO);
      if (sit === "declarado") a.declarados++;
      else if (sit === "vencido") a.vencidos++;
      else if (sit === "por_vencer") a.porVencer++;
      /* El último apunte es de CrewHub (`registrado_en`), no la fecha de
         SUNAT: dice cuándo se tocó esto por última vez, que es lo que delata
         a la empresa que nadie mira. */
      if (p.registrado_en && String(p.registrado_en) > String(a.ultima || "")) {
        a.ultima = p.registrado_en;
        a.ultimaPor = nombreDe.get(p.declarado_por) || null;
      }
      resumen.set(eid, a);
    });
  }

  return (
    /* La cabecera, el rótulo y la barra viven en el `layout`: no dependen de
       qué empresa mires y así no se vuelven a pedir en cada clic. */
    <>

      {errorIgv && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          El resultado de cada periodo no se puede calcular todavía ({errorIgv}).
          Falta correr <b>db/comprobante-empresa.sql</b>, que es lo que hace que una
          factura sea de la empresa y no solo de un fondo. Mientras tanto se puede
          fijar a mano.
        </div>
      )}
      <div className="eqf-res">
        {vencidos > 0
          ? <span style={{ color: "var(--red)" }}>
              🔴 <b>{vencidos}</b> periodo{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"} sin declarar
            </span>
          : <span style={{ color: "var(--green)" }}>✅ nada vencido</span>}
        {res.sinFecha > 0 && (
          <span style={{ color: "var(--violet)" }}
            title="Existen los periodos pero el cronograma de SUNAT de esos años no está cargado en vencimiento_oficial. No es que no venzan: es que falta el dato.">
            ⚠ {res.sinFecha} sin fecha de vencimiento
          </span>
        )}
        <span style={{ color: "var(--dim)" }}>{res.declarados} declarados de {res.total}</span>
      </div>

      {/* ── SIN EMPRESA ELEGIDA: TODAS EN UNA COLUMNA DE ROJOS ──
          La pantalla apilaba las quince con sus bloques plegables, así que
          para saber quién debía algo había que desplegar, mirar y plegar,
          empresa por empresa. El semáforo estaba —cada cabecera lo tenía— pero
          repartido en quince sitios que no se leen juntos. */}
      {!pedido ? (
        <ResumenObligaciones empresas={empresas} logos={logos} filas={resumen}
          href={id => `/obligaciones?emp=${id}`} />
      ) : (
        <Obligaciones
          empresas={empresas}
          logos={logos}
          repLegal={rls}
          obligaciones={obligaciones}
          periodos={periodos}
          perfiles={perfilesCortos}
          comprobantes={(cmp.data || []) as any[]}
          urlSol={urlSol || null}
          userId={user.id}
          hiloError={hilos.error}
          error={error}
        />
      )}
    </>
  );
}
