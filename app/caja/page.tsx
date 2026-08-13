import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import CajaPanel from "@/components/CajaPanel";
import { saldoDeCaja, totales, porCuenta, money } from "@/lib/caja";

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
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth() + off, 1);
  const anio = base.getFullYear(), mes = base.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const inicio = `${anio}-${pad(mes + 1)}-01`;
  const fin = `${mes === 11 ? anio + 1 : anio}-${pad(mes === 11 ? 1 : mes + 2)}-01`;

  const [{ data: cajas, error: eCajas }, { data: cuentas, error: eCuentas },
         { data: movsMes, error: eMovs }, { data: proyectos }] = await Promise.all([
    /* TODAS, activas y archivadas. Las archivadas no llevan tarjeta de saldo
       —ya no se usan— pero sus movimientos siguen en el libro, y sin ellas en
       la lista esas filas salían con la caja en blanco: un gasto sin decir de
       dónde salió. Quién se pinta y quién no lo decide la pantalla, no la
       consulta. */
    supabase.from("caja").select("id,nombre,tipo,saldo_inicial,fecha_inicio,activa")
      .order("activa", { ascending: false }).order("orden").order("nombre"),
    supabase.from("cuenta_caja").select("id,nombre,flujo,activa").order("orden").order("nombre"),
    supabase.from("movimiento_caja")
      .select("id,caja_id,fecha,monto,cuenta_id,caja_destino,descripcion,url,proyecto_id," +
              "proy:proyectos(nombre),quien:perfiles!creado_por(nombre)")
      .gte("fecha", inicio).lt("fecha", fin)
      .order("fecha", { ascending: false }).order("creado_en", { ascending: false })
      .limit(2000),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
  ]);

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
  const saldos = (cajas || []).map((c: any) => ({
    id: c.id, saldo: saldoDeCaja(c, todos, cs),
  }));
  const t = totales(delMes, cs);
  const desglose = porCuenta(delMes, cs);

  /* Si algo de esto falla, el saldo que se pinte NO es el saldo. Se dice antes
     que nada: con `todos` vacío cada tarjeta enseñaría el saldo inicial como si
     fuera el dinero de hoy, que es la lectura más engañosa posible. */
  const problema = eCajas?.message || eCuentas?.message || eMovs?.message || eSaldo || null;
  const faltaSql = /movimiento_caja|cuenta_caja|relation .* does not exist|42P01/.test(problema || "");

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          control interno
        </span>
      </div>

      <h1 className="title-lg">💰 Caja · <span style={{ textTransform: "capitalize" }}>{MESES[mes]} {anio}</span></h1>

      {problema && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          {faltaSql
            ? <>Falta correr <code>db/caja.sql</code> en Supabase.</>
            : <>No se pudo leer la caja, así que los saldos de abajo no son fiables: {problema}</>}
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

      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
        Ingresos y egresos del día a día. <b>Esto no se rinde a DAFO</b>: lo que va a la
        rendición de un fondo —RHE, declaraciones juradas y comprobantes— vive en la ficha
        de ese fondo.
      </p>

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

      <CajaPanel cajas={(cajas || []) as any} cuentas={cs as any} movs={movsConHilo as any}
        proyectos={(proyectos || []) as any} saldos={saldos} esAdmin={esAdmin}
        userId={user.id} />

      {/* ── EN QUÉ SE FUE ──
          La pregunta del mes no es «cuánto gasté» sino «en qué». Va al final
          porque se consulta al cerrar el mes, no al apuntar. */}
      {desglose.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "22px 0 8px", letterSpacing: .5 }}>
            📊 Por cuenta · {MESES[mes]}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {desglose.map(c => {
              const tot = c.flujo === "ingreso" ? t.ingresos : t.egresos;
              const pct = tot > 0 ? Math.round((c.total / tot) * 100) : 0;
              return (
                <div key={c.id} className="info-row" style={{ gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: c.flujo === "ingreso" ? "var(--green)" : "var(--red)" }}>
                    {c.flujo === "ingreso" ? "↑" : "↓"}
                  </span>
                  <span style={{ fontWeight: 600, minWidth: 170 }}>{c.nombre}</span>
                  <span style={{ flex: 1, height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${pct}%`, height: "100%",
                      background: c.flujo === "ingreso" ? "var(--green)" : "var(--red)" }} />
                  </span>
                  <span style={{ color: "var(--dim)", fontSize: 11 }}>{pct}%</span>
                  <span style={{ fontWeight: 700, color: "var(--muted)", minWidth: 90, textAlign: "right" }}>
                    {money(c.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
