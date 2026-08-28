import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Realtime from "@/components/Realtime";
import BotonAlarma from "@/components/BotonAlarma";
import CeldaFondo from "@/components/CeldaFondo";
import PestanasFondo from "@/components/PestanasFondo";
import { alarmasVivas } from "@/app/actions";
import {
  traerFondo, traerPerfilActual, traerPerfiles, datosCabecera, cifrasCabecera,
} from "@/lib/fondoDatos";

/* ══════════════════════════════════════════════════════════════════════════
   LA CABECERA DEL FONDO, UNA SOLA VEZ

   Esta pantalla era una página con seis pestañas de cliente: los seis paneles
   se renderizaban enteros y se ocultaban con `display:none`. O sea que entrar
   a mirar «Vida del fondo» ejecutaba también las consultas de Financiera, de
   Equipo y de las otras tres — veintitantas de ellas para nada.

   Ahora cada pestaña es una ruta hermana y esto es lo único que comparten: el
   título, las siete celdas, la alarma y la barra. Next no vuelve a renderizar
   un layout al cambiar de segmento, así que todo esto se pide una vez y se
   queda mientras se navega entre pestañas.

   Es la misma razón por la que /comprobantes y /obligaciones tienen layout, y
   allí está escrita con más detalle. La diferencia: aquí el layout SÍ recibe
   `params`, así que puede pedir los datos del fondo; allí no podía ver el
   `?emp=` y por eso la barra tuvo que ser de cliente.

   ⚠ LO QUE SE PERDIÓ AL PARTIR: el estado de cada pestaña. Antes, volver a
   Financiera te devolvía con el filtro puesto y el scroll donde estaba. Ahora
   cada pestaña se monta de nuevo. Los filtros que de verdad se echen de menos
   se llevan a la URL —así además se pueden compartir—, que era el plan.
   ══════════════════════════════════════════════════════════════════════════ */

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  /* `traerFondo` está cacheada, así que esto NO es un viaje extra: comparte el
     de abajo. Antes eran dos consultas idénticas por render. */
  const f: any = await traerFondo(params.id);
  if (!f) return { title: "🎬 Fondo" };
  const t = [f.codigo, f.proy?.nombre, f.conv?.anio].filter(Boolean).join(" · ");
  /* ── CON `template`, NO CON `title` A SECAS ──
     Cada pestaña declara su propio `metadata`, y en App Router el título de la
     página PISA el del layout: con `title` plano, los seis fondos abiertos se
     llamaban todos «📍 Vida del fondo» y había que hacer clic para saber cuál
     era cuál. Es exactamente el fallo que app/layout.tsx documenta haber
     arreglado para el resto del sistema, reintroducido aquí al partir.
     Con `template`, la pestaña dice «💰 Financiera · 🎬 PO-001 · Linderaje». */
  return {
    title: {
      default: `🎬 ${t || "Fondo"}`,
      template: `%s · 🎬 ${f.codigo || "Fondo"}`,
    },
  };
}

const fmt = (n: number) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default async function FondoLayout(
  { children, params }: { children: React.ReactNode; params: { id: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const ent: any = await traerFondo(params.id);
  if (!ent) notFound();

  /* Esta pantalla es SOLO para fondos ganados. Una postulación que aún está en
     juego no tiene ejecución que mostrar: se la manda a su expediente, que es
     donde vive su trabajo.
     Va en el layout y no en cada página: entrar directo a
     /fondo/<perdedora>/financiera pasa igualmente por aquí. */
  if (ent.estado !== "ganadora") redirect(`/entidad/postulacion/${params.id}`);

  const [perfilActual, pf, vivas, d] = await Promise.all([
    traerPerfilActual(user.id), traerPerfiles(), alarmasVivas(supabase),
    datosCabecera(params.id),
  ]);
  /* «Admin» aquí significa «puede tocar los datos de plata de esta ficha», que
     no es lo mismo que tener /admin entero. */
  const esAdmin = !!(perfilActual?.es_admin || perfilActual?.es_finanzas);
  const miAlarma = vivas.find(
    (a: any) => a.entidad_tipo === "postulacion" && a.entidad_id === params.id) || null;

  const c = cifrasCabecera(ent, d);
  const titulo = [ent.codigo, ent.proy?.nombre, ent.conv?.anio].filter(Boolean).join(" · ");
  const base = `/fondo/${params.id}`;

  return (
    <div className="shell" style={{ maxWidth: "min(1200px, 96vw)" }}>
      {/* Solo lo que afecta a la CABECERA; cada pestaña escucha lo suyo, con
          filtro por fondo.
          ⚠ Antes esta página escuchaba nueve tablas SIN filtro, y parecía que un
          comprobante de otro fondo refrescaba tu pantalla. No era cierto:
          ninguna de esas tablas estaba en la publicación de Supabase, así que
          la suscripción se abría y no llegaba nada. El filtro empieza a hacer
          falta el día que se corra db/realtime-fondo.sql — que es lo que las
          publica—, no antes. */}
      <Realtime tablas={[{ tabla: "postulaciones", filtro: `id=eq.${params.id}` }, "alarmas"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>🎬 EJECUCIÓN DEL FONDO</span>
      </div>

      {/* ── LA ALARMA, ANTES QUE NADA ──
          Encima del título y de las cifras: si alguien declaró que esto es
          grave, es lo primero que hay que leer al entrar. Y aquí va con su
          motivo entero —no el resumen de la franja—, porque esta es la
          pantalla donde uno viene a entender qué pasa. */}
      <BotonAlarma entidadTipo="postulacion" entidadId={params.id}
        tituloSugerido={`${ent.codigo || "Este fondo"}: `}
        esAdmin={esAdmin} alarma={miAlarma} vivas={vivas.length} equipo={pf as any[]} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 2px" }}>
        <h1 className="title-lg" style={{ margin: 0 }}>🎬 {titulo}</h1>
        <Link href={`/entidad/postulacion/${params.id}`} className="btn btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px" }}>📄 Ver expediente de postulación →</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="badge" style={{ color: c.estadoEjec.col, background: "rgba(255,255,255,.05)", fontWeight: 700 }}>
            {c.estadoEjec.ico} {c.estadoEjec.txt}
            {(c.estadoEjec as any).rindeEl ? ` — rinde ${dmy((c.estadoEjec as any).rindeEl)}` : ""}
            {(c.estadoEjec as any).venceEl ? ` — venció ${dmy((c.estadoEjec as any).venceEl)}` : ""}
          </span>
          {ent.emp?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {ent.emp.nombre}</span>}
          {ent.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>📜 {ent.conv.nombre}</span>}
        </div>
        <div className="fondo-cab">
          <CeldaFondo k="Estímulo" v={ent.monto_adjudicado ? fmt(parseFloat(ent.monto_adjudicado)) : "—"} destacado />
          {/* ── LO GIRADO EN RHE ──
              La cifra que contesta «¿por dónde vamos?». Vivía dentro de la
              pestaña Equipo, a dos clics de la pantalla que se abre para
              saberlo. Va junto al estímulo porque es contra él que se lee. */}
          <CeldaFondo k="Girado en RHE"
            v={c.errRhe ? "—" : c.girado ? fmt(c.girado) : "—"}
            alerta={!!c.errRhe}
            sub={c.girado
              ? `a ${c.girados} persona${c.girados === 1 ? "" : "s"}`
                + (ent.monto_adjudicado && parseFloat(ent.monto_adjudicado) > 0
                  ? ` · ${Math.round(c.girado / parseFloat(ent.monto_adjudicado) * 100)}% del estímulo` : "")
                + (c.rheSinPersona >= 1 ? ` · ⚠ ${fmt(c.rheSinPersona)} en recibos sin persona` : "")
              : c.errRhe ? "no se pudo leer" : "todavía no se gira ningún recibo"} />
          {/* ── LAS OTRAS DOS FORMAS DE SUSTENTAR ──
              El estímulo se rinde de tres maneras y solo una estaba arriba. La
              DJ lleva su tope al lado porque es la única de las tres que PUEDE
              PASARSE: por encima del porcentaje del acta, lo de más hay que
              devolverlo. */}
          <CeldaFondo k="Declaraciones juradas"
            v={c.usadoDj ? fmt(c.usadoDj) : "—"}
            sub={c.djError
              ? "falta correr db/declaraciones-juradas.sql"
              : c.usadoDj
                ? `${c.nDj} DJ${c.saldoDj.tope ? ` · tope ${fmt(c.saldoDj.tope)}` : ""}`
                : "todavía ninguna"}
            /* `supero` y no una comparación escrita aquí: con un tope del 0%
               no hay `tope` que comparar y CUALQUIER declaración jurada ya es
               un exceso. La cabecera no lo marcaba y la pestaña sí decía «a
               devolver»: dos respuestas a la misma pregunta. */
            alerta={c.saldoDj.supero} />
          <CeldaFondo k="Facturas y boletas"
            v={c.totCmp ? fmt(c.totCmp) : "—"}
            sub={c.errCmp ? "no se pudo leer" : c.totCmp ? `${c.nCmp} comprobante(s)` : "todavía ninguna"} />
          <CeldaFondo k="Acta firmada" v={dmy(ent.fecha_firma_acta)} />
          <CeldaFondo k="Desembolso" v={ent.fecha_desembolso ? dmy(ent.fecha_desembolso) : "⚠ falta"}
            alerta={!ent.fecha_desembolso} />
          {/* ── AQUÍ NO VA UN «PLAZO» DERIVADO ──
              Había un recuadro «Plazo (1 año)» que salía de sumarle 12 meses al
              desembolso. Se quitó porque la premisa era falsa: el plazo NO es
              el mismo en todas las actas —la 042-2024 dice un año; la 139-2025
              y la 178-2024 dicen DOS, verificado en el texto de los PDF—. Con
              el número fijo en el código, cada acta que no fuera de un año
              producía una alarma permanente sobre una fecha correcta.
              Quedan los dos HECHOS que vienen del acta: Desembolso y Rinde.

              ⚠ ESTO YA SE QUITÓ UNA VEZ Y VOLVIÓ, por editar una copia vieja
              del archivo. Si reaparece, es eso — no una decisión. */}
          <CeldaFondo k="Rinde" v={dmy(c.plazo)} />
        </div>
        {!ent.fecha_desembolso && (
          <p style={{ color: "var(--yellow)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            ⚠ Falta la fecha de desembolso — el plazo de ejecución se cuenta desde que el dinero llega a
            la cuenta, no desde la firma del acta. Se edita en el expediente de postulación.
          </p>
        )}
      </div>

      {/* ── LAS SEIS NATURALEZAS DEL FONDO ──
          Arranca en «Vida del fondo», que es la ruta raíz: al abrir un fondo la
          primera pregunta no es cuánto hay, es QUÉ PASÓ —qué nos dijeron, qué
          contestamos, cuánto llevamos callados—, y eso es lo que decide si hay
          que mirar el dinero hoy o el mes que viene. */}
      <PestanasFondo items={[
        { href: base, label: "📍 Vida del fondo", n: c.nVida || null, avisos: c.avisoVida },
        { href: `${base}/financiera`, label: "💰 Financiera", avisos: c.avisosFin },
        { href: `${base}/audiovisual`, label: "🎥 Audiovisual" },
        /* `|| null` para que un cero no se pinte: «📦 Entregables · 0» se lee como
           un dato, y lo que dice es que no hay ninguna cláusula cargada. */
        { href: `${base}/entregables`, label: "📦 Entregables", n: c.nCompromisos || null },
        { href: `${base}/equipo`, label: "👥 Equipo", n: c.nEquipo },
        { href: `${base}/porrol`, label: "💼 Por rol", n: c.nRoles || null, avisos: c.avisoRoles },
      ]} />

      {children}
    </div>
  );
}
