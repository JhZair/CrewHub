import { mapaAlias } from "@/lib/personas";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import CajaPanel from "@/components/CajaPanel";
import { saldoDeCaja, totales, money } from "@/lib/caja";
import { hoyLima } from "@/lib/fechas";

export const metadata: Metadata = { title: "💰 Caja" };

/* ── LA CAJA — control interno, no rendición ──
 *
 * Lo que entra y sale del día a día: las coberturas que se cobran, los gastos
 * de oficina, el transporte. NADA de esto va a DAFO — para eso están los RHE,
 * las declaraciones juradas y los comprobantes, que viven en la ficha del
 * fondo.
 *
 * Se mantiene deliberadamente aparte de aquello. Un solo libro para las dos
 * cosas obligaría a que cada apunte declarara a cuál de los dos mundos
 * pertenece, y ese es exactamente el momento en que se deja de apuntar.
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function CajaPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  /* Leer, todo el equipo; escribir, administración o finanzas. Se deja leer
     porque saber cómo va la caja es parte de trabajar aquí, y esconderlo
     obliga a preguntar por WhatsApp lo que el sistema ya sabe. */
  const esAdmin = !!(perfil?.es_admin || perfil?.es_finanzas);

  const off = parseInt(searchParams?.m || "0", 10) || 0;
  /* `ahora`, no `hoy`: en este archivo hay dos nociones de día y confundirlas
     ya sería fácil. Esta es la del reloj del servidor y decide qué MES se
     enseña; la de más abajo (`hoyDeLima`) es el día en Lima y decide cuántos
     días lleva dormida una caja. */
  const ahora = new Date();
  const base = new Date(ahora.getFullYear(), ahora.getMonth() + off, 1);
  const anio = base.getFullYear(), mes = base.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const inicio = `${anio}-${pad(mes + 1)}-01`;
  const fin = `${mes === 11 ? anio + 1 : anio}-${pad(mes === 11 ? 1 : mes + 2)}-01`;

  const [{ data: cajas, error: eCajas }, { data: cuentas, error: eCuentas },
         { data: movsMes, error: eMovs }, { data: proyectos },
         { data: aliasPers }, { data: pulso, error: ePulso }] = await Promise.all([
    /* TODAS, activas y archivadas. Las archivadas no llevan tarjeta de saldo
       —ya no se usan— pero sus movimientos siguen en el libro, y sin ellas en
       la lista esas filas salían con la caja en blanco: un gasto sin decir de
       dónde salió. Quién se pinta y quién no lo decide la pantalla, no la
       consulta. */
    supabase.from("caja").select("id,nombre,tipo,saldo_inicial,fecha_inicio,activa,medio")
      .order("activa", { ascending: false }).order("orden").order("nombre"),
    supabase.from("cuenta_caja").select("id,nombre,flujo,activa").order("orden").order("nombre"),
    supabase.from("movimiento_caja")
      /* `avatar_url` y `color` para pintar la cara de quien apuntó, y
         `creado_en` para decir CUÁNDO lo apuntó. La fecha de la izquierda es
         la del movimiento —cuándo se movió la plata— y no la misma cosa: un
         gasto del 14 apuntado el 20 se ve idéntico a uno apuntado el mismo
         día, y esa diferencia es la que explica por qué un saldo no cuadraba
         el martes. */
      .select("id,caja_id,fecha,monto,cuenta_id,caja_destino,descripcion,url,proyecto_id," +
              "creado_en,creado_por,proy:proyectos(nombre)," +
              "quien:perfiles!creado_por(nombre,avatar_url,color)")
      .gte("fecha", inicio).lt("fecha", fin)
      .order("fecha", { ascending: false }).order("creado_en", { ascending: false })
      .limit(2000),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    /* ── EL ALIAS CORTO DE CADA CUENTA ──
       `perfiles.nombre` guarda el nombre largo («John Oros Condori»); el corto
       que usa el equipo —«JohnO»— vive en `personas.alias`, cruzado por
       `usuario_id`. En una fila de caja el largo no cabe y además no es como se
       llaman entre ellos.
       Es el mismo cruce que ya hacen /admin y las fichas de entidad, con la
       misma función: `mapaAlias`. Copiarlo aquí a mano habría sido la cuarta
       versión de «cómo se llama corto esta persona». */
    supabase.from("personas").select("usuario_id,alias")
      .not("alias", "is", null).not("usuario_id", "is", null),
    /* ── CUÁNDO FUE LA ÚLTIMA VEZ QUE ALGUIEN APUNTÓ EN CADA CAJA ──
       Sirve para el aviso de caja dormida. Se pide a la vista `caja_ultimo_apunte`
       —tres filas— y NO se saca de `todos`: ese listado está paginado con techo,
       y si algún día lo topa, las filas que se pierden son justo las últimas.
       El aviso saldría rojo por un recorte, que es exactamente la clase de
       alarma falsa que enseña a ignorar las alarmas. */
    supabase.from("caja_ultimo_apunte").select("caja_id,ultimo_apunte"),
  ]);

  /* ── SI FALTA LA COLUMNA `medio`, LA PANTALLA NO SE CAE ──
     Pedir una columna que no existe hace fallar la consulta ENTERA, y sin la
     lista de cajas esta pantalla no sirve para nada: ni saldos, ni apuntar, ni
     ver el mes. Una migración opcional —el número de tarjeta lo es— no puede
     tumbar el cuaderno del día a día.
     Se reintenta sin ella, y solo en ese caso: un viaje de más el día que
     alguien despliegue el código antes de correr el SQL, cero el resto de los
     días. */
  let lasCajas = cajas;
  let eLasCajas = eCajas;
  const faltaMedio = !!eCajas && /medio/i.test(eCajas.message || "")
    && (/does not exist|42703/i.test(eCajas.message || "") || (eCajas as any).code === "42703");
  if (faltaMedio) {
    const r = await supabase.from("caja")
      .select("id,nombre,tipo,saldo_inicial,fecha_inicio,activa")
      .order("activa", { ascending: false }).order("orden").order("nombre");
    lasCajas = r.data as any;
    eLasCajas = r.error as any;
  }

  /* ── EL SALDO SE PIDE POR PÁGINAS, NO CON UN LIMIT GRANDE ──
     El saldo no es el del mes: es todo lo acumulado. Y un `.limit(20000)` no
     lo resuelve —PostgREST tiene su propio tope de filas por respuesta, así
     que a partir de cierto punto habría devuelto una parte y el saldo habría
     salido mal SIN avisar—. Es el mismo fallo que ya costó una semana entera
     de jornadas (ver app/admin/page.tsx): un recorte callado no se nota, se
     cree.
     Se pagina hasta agotar, con orden estable, y si aun así se llega al techo
     se dice en pantalla en vez de dar un número a medias. */
  const PAG = 1000, TECHO = 60000;
  let todos: any[] = [];
  let eSaldo: string | null = null;
  let truncado = false;
  for (let desde = 0; desde < TECHO; desde += PAG) {
    const { data, error } = await supabase.from("movimiento_caja")
      .select("id,caja_id,fecha,monto,cuenta_id,caja_destino")
      .order("fecha").order("id").range(desde, desde + PAG - 1);
    if (error) { eSaldo = error.message; break; }
    todos = todos.concat(data || []);
    if (!data || data.length < PAG) break;
    if (desde + PAG >= TECHO) truncado = true;
  }

  const cs = (cuentas || []) as any[];
  const delMes = (movsMes || []) as any[];

  /* Cuántos comentarios tiene cada movimiento. Una consulta aparte y ligera:
     el hilo entero se carga solo al abrir el pop-up, pero el NÚMERO tiene que
     estar en la lista — sin él, una conversación de cuatro mensajes sobre un
     gasto es invisible y nadie la va a buscar abriendo movimientos al azar.
     Si falta la migración, esto falla solo y la lista sigue funcionando. */
  const idsMes = delMes.map((m: any) => m.id);
  const conteo = new Map<string, number>();
  if (idsMes.length) {
    const { data: coms } = await supabase.from("comentarios")
      .select("movimiento_caja_id").in("movimiento_caja_id", idsMes);
    (coms || []).forEach((c: any) => {
      if (c.movimiento_caja_id) {
        conteo.set(c.movimiento_caja_id, (conteo.get(c.movimiento_caja_id) || 0) + 1);
      }
    });
  }
  /* Las reacciones AL MOVIMIENTO (sin comentario). Van en la fila, no dentro
     del pop-up: dejar un 👀 «lo vi, está bien» es la acción más frecuente de
     quien revisa la caja, y obligarla a abrir el hilo la convierte en tres
     clics — a ese precio no se hace, y el acuse de revisión se pierde. */
  const rxPorMov = new Map<string, any[]>();
  if (idsMes.length) {
    const { data: rx } = await supabase.from("reacciones")
      .select("emoji,usuario_id,movimiento_caja_id,perfil:perfiles!usuario_id(nombre)")
      .in("movimiento_caja_id", idsMes).is("comentario_id", null);
    (rx || []).forEach((r: any) => {
      const arr = rxPorMov.get(r.movimiento_caja_id) || [];
      arr.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null });
      rxPorMov.set(r.movimiento_caja_id, arr);
    });
  }

  const movsConHilo = delMes.map((m: any) => ({
    ...m,
    nComentarios: conteo.get(m.id) || 0,
    reacciones: rxPorMov.get(m.id) || [],
  }));

  /* El saldo se calcula para todas, incluidas las archivadas: si una se archivó
     con plata dentro, ese dinero existe y hay que poder verlo al reabrirla. */
  const saldos = (lasCajas || []).map((c: any) => ({
    id: c.id, saldo: saldoDeCaja(c, todos, cs),
  }));

  /* ── EL PULSO DE CADA CAJA ──
     `undefined` y `null` NO son lo mismo aquí, y de esa diferencia depende que
     el aviso sea creíble: `undefined` es «no lo pude averiguar» —falta la
     migración, se cayó la consulta— y no pinta nada; `null` es «lo averigüé y
     esta caja no tiene ni un movimiento», que es «sin estrenar». Si se
     confundieran, un error de red pondría todas las cajas en rojo a la vez. */
  /* El hoy con el que se cuentan los días, decidido en el SERVIDOR. Si lo
     calculara el componente, dependería del reloj del navegador —y de que la
     pestaña no lleve abierta desde ayer—, y entonces el chip y la burbuja del
     menú podrían discrepar justo en los umbrales. */
  const hoyDeLima = hoyLima();
  const mapaPulso = new Map<string, string>(
    (pulso || []).map((p: any) => [p.caja_id, p.ultimo_apunte]));
  const pulsos = (lasCajas || []).map((c: any) => ({
    id: c.id,
    /* `has` y no `?? null`: una caja que la vista no devolvió es «no lo sé»,
       no «no tiene movimientos». Colapsarlas aquí pintaría «sin estrenar»
       sobre una caja con historial, y la guarda que hay en CajaPanel para
       exactamente eso quedaría sin poder disparar nunca. */
    ultimoApunte: ePulso ? undefined
      : (mapaPulso.has(c.id) ? mapaPulso.get(c.id) : undefined),
  }));
  const t = totales(delMes, cs);

  /* Si algo de esto falla, el saldo que se pinte NO es el saldo. Se dice antes
     que nada: con `todos` vacío cada tarjeta enseñaría el saldo inicial como si
     fuera el dinero de hoy, que es la lectura más engañosa posible. */
  const problema = eLasCajas?.message || eCuentas?.message || eMovs?.message || eSaldo || null;
  const faltaSql = /movimiento_caja|cuenta_caja|relation .* does not exist|42P01/.test(problema || "");
  /* ── EL FALLO DEL PULSO SE DICE APARTE ──
     No toca los saldos —el saldo sale de otra consulta—, así que meterlo en el
     aviso de arriba sería asustar de más. Pero tiene que decirse: sin la vista,
     el aviso de caja dormida queda apagado PARA SIEMPRE, y una vigilancia
     apagada es indistinguible de «todas las cajas al día». Callarlo sería
     dejar creer que hay un control que no existe. */
  const faltaPulso = ePulso
    /* «permission denied for view caja_ultimo_apunte» lleva el nombre de la
       vista dentro y se leería como «falta la migración»: el admin la correría,
       funcionaría, y el recado seguiría ahí. Se descarta primero. */
    ? (!/permission denied/i.test(ePulso.message || "")
        && /does not exist|42P01|caja_ultimo_apunte/.test(ePulso.message || "")
        ? "falta" : "error") : null;

  return (
    /* El mismo ancho que /comprobantes y /obligaciones. `shell` a secas se
       queda en 860 px y esta pantalla tiene tres tarjetas de saldo en fila y
       un formulario de siete campos: con el ancho por defecto todo se apretaba
       más que en las pantallas hermanas, sin ninguna razón salvo que nadie lo
       había puesto. */
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          control interno
        </span>
      </div>

      {/* La explicación va en el ⓘ, como en comprobantes y obligaciones: se
          lee el primer día y luego ocuparía dos líneas de todas las visitas.
          Aquí importaba más que en las otras, porque el párrafo estaba DEBAJO
          del selector de mes y de los totales — o sea, en medio de lo que se
          viene a mirar. */}
      <h1 className="title-lg" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        💰 Caja · <span style={{ textTransform: "capitalize" }}>{MESES[mes]} {anio}</span>
        <span className="ayuda-ico" title={
          "Ingresos y egresos del día a día. Esto NO se rinde a DAFO: lo que va a la "
          + "rendición de un fondo —RHE, declaraciones juradas y comprobantes— vive en la "
          + "ficha de ese fondo."
        }>ⓘ</span>
      </h1>

      {problema && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          {faltaSql
            ? <>Falta correr <code>db/caja.sql</code> en Supabase.</>
            : <>No se pudo leer la caja, así que los saldos de abajo no son fiables: {problema}</>}
        </div>
      )}
      {/* Solo a quien puede arreglarlo: al resto del equipo, un recado sobre un
          archivo SQL no le dice nada que pueda hacer. */}
      {faltaMedio && esAdmin && (
        <div className="empty" style={{ color: "var(--dim)", marginBottom: 10, fontSize: 12 }}>
          Para guardar con qué tarjeta se paga en cada caja, falta correr <code>db/caja-medio.sql</code> en Supabase.
        </div>
      )}
      {faltaPulso && esAdmin && (
        <div className="empty" style={{ color: "var(--dim)", marginBottom: 10, fontSize: 12 }}>
          {faltaPulso === "falta"
            ? <>El aviso de <b>caja dormida</b> está apagado: falta correr <code>db/caja-dormida.sql</code> en Supabase.</>
            : <>No se pudo comprobar desde cuándo no se apunta en cada caja: {ePulso?.message}</>}
        </div>
      )}
      {truncado && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          ⚠ Hay más movimientos de los que caben en el cálculo del saldo. Avísame para
          calcularlo en la base en vez de aquí.
        </div>
      )}

      <div className="vtabs" style={{ alignItems: "center", marginBottom: 10 }}>
        <Link href={`/caja?m=${off - 1}`} className="vtab">‹ mes anterior</Link>
        {off !== 0 && <Link href="/caja" className="vtab">actual</Link>}
        {off < 0 && <Link href={`/caja?m=${off + 1}`} className="vtab">siguiente ›</Link>}
        {/* El resultado del mes al lado de las flechas, como el contador de
            Jornadas: navegar a un mes tranquilo no debe borrar de la vista lo
            que de verdad importa mirar. */}
        <span style={{ marginLeft: "auto", fontSize: 12.5,
          color: t.resultado < 0 ? "var(--red)" : "var(--green)" }}>
          {t.resultado < 0 ? "▼" : "▲"} {money(Math.abs(t.resultado))} este mes
        </span>
      </div>


      {/* Entró / salió / quedó. Los traspasos NO están en ninguno de los dos
          primeros: mover plata de efectivo a banco no es ingreso ni egreso, y
          contarlo inflaría los dos lados con dinero que nunca se movió del
          negocio. Se dicen aparte, que es lo que explica por qué el saldo de
          una caja bajó sin que hubiera gastos. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", margin: "12px 0 14px" }}>
        <span style={{ color: "var(--green)", fontWeight: 700 }}>↑ {money(t.ingresos)}</span>
        <span style={{ color: "var(--red)", fontWeight: 700 }}>↓ {money(t.egresos)}</span>
        <span style={{ color: "var(--muted)" }}>
          = <b style={{ color: t.resultado < 0 ? "var(--red)" : "var(--teal)" }}>{money(t.resultado)}</b>
        </span>
        {t.traspasos > 0 && (
          <span style={{ color: "var(--dim)", fontSize: 12 }}>
            ⇄ {money(t.traspasos)} movidos entre cajas (no cuentan)
          </span>
        )}
        {/* Movimientos cuya cuenta no se pudo leer. No se suman a los egresos
            —eso los escondería— pero tampoco desaparecen: si el resultado no
            cuadra, aquí está la diferencia. */}
        {t.sinClasificar > 0 && (
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>
            ⚠ {money(t.sinClasificar)} sin cuenta reconocible
          </span>
        )}
      </div>

      {/* ── EL DESGLOSE SE FUE DENTRO DEL PANEL ──
          Vivía aquí, en el servidor, y por eso no podía enterarse del filtro de
          caja —que es estado del cliente—: con «BCP Oficina» marcado, las
          barras seguían siendo de las tres cajas juntas. Dos cifras del mismo
          mes en la misma pantalla, una filtrada y otra no, es la clase de
          contradicción que hace desconfiar de las dos.
          Ahora lo pinta CajaPanel con los mismos movimientos que enseña. */}
      <CajaPanel cajas={(lasCajas || []) as any} cuentas={cs as any} movs={movsConHilo as any}
        alias={mapaAlias(aliasPers as any)}
        proyectos={(proyectos || []) as any} saldos={saldos} esAdmin={esAdmin}
        userId={user.id} mesNombre={MESES[mes]} pulsos={pulsos} hoy={hoyDeLima} />

    </div>
  );
}
