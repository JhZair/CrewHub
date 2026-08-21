import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Obligaciones from "@/components/Obligaciones";
import { resumenPeriodos, DIAS_AVISO } from "@/lib/obligaciones";
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
export default async function ObligacionesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [emp, obl, per, perf, urlSol] = await Promise.all([
    /* `fecha_constitucion`: es el suelo de los periodos —una empresa no declara
       antes de existir— y lo que la pantalla ofrece como arranque por defecto. */
    supabase.from("empresas").select("id,nombre,ruc,estado,relacion,fecha_constitucion")
      .eq("relacion", "propia").order("nombre"),
    supabase.from("obligacion")
      .select("id,entidad_id,entidad_tipo,clase,periodicidad,dias_aviso,activa,responsable,desde"),
    /* ── LOS PERIODOS ENTEROS, PERO CON LAS COLUMNAS JUSTAS ──
       Se siguen trayendo todos, y es deliberado: el semáforo de cada cabecera
       —«9 vencidos · 26 declarados · 22 fuera de plazo de 28»— se calcula sobre
       TODOS, y acotarlos por año lo haría mentir sin avisar. Son doce por
       empresa y año, no miles.
       Lo que sí sobraba eran las columnas. `select("*")` arrastraba el jsonb de
       rectificaciones, los cuatro importes de casillas y media docena de campos
       que esta pantalla no mira, multiplicado por varios cientos de filas. Se
       piden las diecisiete que se usan de verdad — la lista sale de leer el
       componente, no de adivinar. */
    supabase.from("obligacion_periodo").select(
      "id,obligacion_id,anio,mes,vence,declarado_en,declarado_por,declarado_orden," +
      "registrado_en,nro_orden,rectificaciones,resultado,monto,nota,caso_id," +
      "igv_debito,igv_credito"),
    /* `avatar_url` y `color`: quien responde de una declaración se reconoce de
       un vistazo por la cara, no leyendo un nombre en gris al pie del bloque.
       El color es el respaldo cuando no hay foto — lo usa <Avatar/> para las
       iniciales. */
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
    /* La puerta a SUNAT sale de `plataformas`, como todas las demás del
       sistema: si SUNAT cambia la URL se corrige en un sitio. Si la clave no
       está cargada, el botón sencillamente no se pinta — mejor que un enlace
       roto que enseña a no fiarse de los enlaces. */
    urlPlataforma(PLAT.sunatSol),
  ]);

  const empresas = (emp.data || []) as any[];
  /* ── LA CARA DE CADA EMPRESA Y DE QUIEN FIRMA ──
     Diez asociaciones con nombres que empiezan igual («Asoc Pumachay», «Asoc
     Pichiuchallay», «Asoc Pumahuasi») se distinguen antes por su logo que por
     su nombre. Y el representante legal importa aquí más que en ningún otro
     listado: es quien tiene la Clave SOL y quien responde si algo se venció.
     Los dos van por lote, nunca uno por empresa. */
  const idsEmp = empresas.map((e: any) => e.id);
  const periodosCrudos = (per.data || []) as any[];

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
  const anioMin = periodosCrudos.length
    ? Math.min(...periodosCrudos.map((p: any) => Number(p.anio) || 9999)) : null;

  const [media, repLegal, cmp, hilos] = await Promise.all([
    idsEmp.length
      ? supabase.from("entidad_media").select("entidad_id,cartel_url")
          .eq("entidad_tipo", "empresa").in("entidad_id", idsEmp)
      : Promise.resolve({ data: [] as any[] }),
    repLegalDeEmpresas(supabase, idsEmp),
    idsEmp.length && anioMin
      ? supabase.from("comprobante").select("empresa_id,fecha,igv,sentido")
          .in("empresa_id", idsEmp).gte("fecha", `${anioMin}-01-01`)
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

  return (
    <div className="shell" style={{ maxWidth: "min(1100px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>lo que vence solo</span>
      </div>

      <h1 className="title-lg">📅 Obligaciones · {obligaciones.length}</h1>
      <p className="fondo-nat-sub">
        Las declaraciones de cada empresa ante SUNAT. Los periodos se generan solos;
        lo que se marca a mano es que ya se presentaron. Las constancias no se guardan
        aquí: se comprueban en SOL, que es donde están de verdad.
      </p>

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

      <Obligaciones
        empresas={empresas}
        logos={logos}
        repLegal={rls}
        obligaciones={obligaciones}
        periodos={periodos}
        perfiles={(perf.data || []) as any[]}
        comprobantes={(cmp.data || []) as any[]}
        urlSol={urlSol || null}
        userId={user.id}
        hiloError={hilos.error}
        error={error}
      />
    </div>
  );
}
