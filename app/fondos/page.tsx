import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { ejecutando, plazoRendicion, rendicionVencida, rendicionSinPlazo } from "@/lib/fondos";
import { faltanEstados, listaFaltan, seVigila, cierreDe } from "@/lib/estadosCuenta";
import { sinPruebas, textoSinPruebas } from "@/lib/pruebasFondo";
import { avanceEntregables, META_ESTADO_COMP } from "@/lib/compromisos";
import { CERRADOS } from "@/lib/familia";
import BotonAlarma from "@/components/BotonAlarma";
import { alarmasVivas } from "@/app/actions";
import { hoyLima } from "@/lib/fechas";
import { CATEGORIAS_OPC } from "@/lib/etapas";

export const metadata: Metadata = { title: "🎬 Fondos en ejecución" };

/* ── FONDOS EN EJECUCIÓN — el panel de los proyectos ganados ──
   Las postulaciones que ganaron dejan de ser expediente y pasan a ser dinero
   y obra en marcha. Aquí están todas juntas, con su reloj: cuándo rinden, si
   van tarde, si falta cargarles el desembolso. Cada una lleva a su página de
   ejecución. */

const fmt = (n: any) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default async function FondosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("postulaciones")
    .select("id,codigo,estado,monto_adjudicado,fecha_desembolso,fecha_limite_rendicion," +
      "fecha_prorroga,fecha_rendicion_real,fecha_cierre_cuenta,proy:proyectos(id,nombre)," +
      /* `categoria` faltaba, y es lo que agrupa: la línea gris de cada tarjeta
         enseña el NOMBRE de la convocatoria («Cine Indígena», «DOCU-Producción»)
         y eso es el concurso concreto, no la clase de fondo. Nueve tarjetas con
         nueve nombres distintos no se pueden leer por familia. */
      "conv:convocatorias(nombre,anio,categoria),emp:empresas(id,nombre)")
    .eq("estado", "ganadora");

  const fondos = (data || []) as any[];

  /* ── LO QUE FALTA DEL BANCO, EN LA TARJETA ──
     La burbuja del menú cuenta fondos con estados de cuenta sin cargar. Si al
     llegar aquí no se ve CUÁL, el número no se puede cuadrar y deja de
     creerse; y el aviso vivía dentro de la ficha, en una sub-sección plegada.
     Una consulta por lote —no una por tarjeta—, y la cuenta la hace la misma
     `faltanEstados` que usa la ficha, para que las tres pantallas no puedan
     discrepar. */
  const faltanEc = new Map<string, ReturnType<typeof faltanEstados>>();
  const docsEc = new Map<string, ReturnType<typeof sinPruebas>>();
  {
    const vigilados = fondos.filter(f => f.estado === "ganadora" && seVigila(f));
    if (vigilados.length) {
      const ids = vigilados.map(f => f.id);
      /* Las cuatro tablas de la rendición, en paralelo y por lote —nunca una
         por tarjeta—. De `estado_cuenta` viajan el periodo Y su archivo: es la
         misma consulta para las dos cuentas, la del rojo (qué mes no está) y
         la del ámbar (qué mes está sin extracto). Pedirla dos veces sería
         pagar dos viajes por las mismas quince filas.
         Solo de los fondos vigilados: pedirle el PDF a una rendición ya
         entregada no es tarea de nadie. */
      /* ── SOLO LO QUE FALTA ──
         De los recibos, facturas y DJ se piden ÚNICAMENTE las filas sin
         archivo (`url is null`). Traerlas todas era caro y, peor, frágil:
         PostgREST corta en mil filas de primer nivel SIN AVISAR, y nueve
         fondos con cuarenta recibos cada uno rondan ese techo. El corte no
         habría dado error: habría BAJADO el ámbar en silencio, y el número
         habría dejado de cuadrar con el de la ficha —que nunca se corta
         porque filtra por un solo fondo—. Pidiendo solo las que faltan, lo que
         viaja es del tamaño del pendiente, no del historial.
         `estado_cuenta` sí viene entero: sus periodos son los que sostienen la
         cuenta del ROJO, y son quince por fondo. */
      const [est, rhe, cmp, dj] = await Promise.all([
        supabase.from("estado_cuenta").select("postulacion_id,periodo,url,imagenes").in("postulacion_id", ids),
        supabase.from("rhe").select("postulacion_id,url").in("postulacion_id", ids).is("url", null),
        supabase.from("comprobante").select("postulacion_id,url").in("postulacion_id", ids).is("url", null),
        supabase.from("gasto_dj").select("postulacion_id,dj_numero,dj_url").in("postulacion_id", ids).is("dj_url", null),
      ]);
      /* Si una consulta falla, `data` viene en null y esa cuenta NO se pinta.
         Sin esta guarda, un fallo dejaba el mapa vacío y todas las tarjetas
         salían con la serie entera faltando: la alarma más alta posible justo
         cuando el sistema no sabe nada. Mejor quedarse corto que inventar. */
      const agrupar = (r: any) => {
        const m = new Map<string, any[]>();
        if (r?.error) return m;
        (r?.data || []).forEach((x: any) =>
          m.set(x.postulacion_id, [...(m.get(x.postulacion_id) || []), x]));
        return m;
      };
      const mEst = agrupar(est), mRhe = agrupar(rhe), mCmp = agrupar(cmp), mDj = agrupar(dj);

      if (!est.error) {
        const hoy = hoyLima();
        vigilados.forEach(f => faltanEc.set(f.id, faltanEstados(
          (mEst.get(f.id) || []).map(e => e.periodo), f.fecha_desembolso, hoy, cierreDe(f))));
      }
      /* `sinPruebas` vuelve a filtrar por «sin archivo», así que darle solo las
         filas que ya vienen filtradas da el mismo número: la regla sigue
         estando en un solo sitio, la consulta solo evita traer lo que esa
         regla iba a descartar.
         Si una de las cuatro falla, su mapa queda vacío y esa clase suma cero:
         quedarse corto es preferible a inventar pendientes. */
      vigilados.forEach(f => docsEc.set(f.id, sinPruebas({
        estados: mEst.get(f.id) || [], rhe: mRhe.get(f.id) || [],
        facturas: mCmp.get(f.id) || [], dj: mDj.get(f.id) || [],
      })));
    }
  }

  /* ── LO QUE EL ACTA OBLIGA A ENTREGAR, EN LA TARJETA ──
     El avance de entregables vivía solo dentro de la ficha, en su pestaña. Y
     es la pregunta con la que se abre esta pantalla: de los nueve fondos, ¿a
     cuál hay que entrarle? «4/17» contesta eso de un vistazo; «faltan estados
     de cuenta» contesta otra cosa —el papel del banco— y las dos hacen falta.
     Una sola consulta para todos los fondos, y la cuenta la hace la MISMA
     `avanceEntregables` que usa la pestaña: dos cálculos del mismo número
     acaban discrepando, y entonces no se cree ninguno.
     Tolerante: sin db/compromiso-acta.sql corrido, `error` viene con la queja,
     el mapa queda vacío y las tarjetas se pintan igual que ayer. */
  const avEnt = new Map<string, ReturnType<typeof avanceEntregables>>();
  if (fondos.length) {
    const { data: cmps, error } = await supabase.from("compromiso_acta")
      .select("postulacion_id,clase,estado").in("postulacion_id", fondos.map(f => f.id));
    if (!error) {
      const porFondo = new Map<string, any[]>();
      for (const c of (cmps || []) as any[]) {
        porFondo.set(c.postulacion_id, [...(porFondo.get(c.postulacion_id) || []), c]);
      }
      for (const f of fondos) {
        const xs = porFondo.get(f.id);
        if (xs?.length) avEnt.set(f.id, avanceEntregables(xs));
      }
    }
  }

  /* ── LOS CASOS DE CADA FONDO ──
     El trabajo de un fondo no está solo en sus papeles: son los casos que el
     equipo abrió alrededor —entregables, pendientes de la rendición, avisos—.
     Desde la lista no había forma de saber si un fondo tenía tres o treinta, y
     esa cifra dice si alguien lo está trabajando o si está solo.
     Una consulta por lote, no una por tarjeta, y se cuentan los VIVOS: un caso
     archivado no es trabajo, es trabajo retirado.
     Tolerante: si falla, no se pinta el dato y las tarjetas siguen igual. */
  const casosFondo = new Map<string, { total: number; abiertos: number }>();
  if (fondos.length) {
    const { data: vin, error } = await supabase.from("publicacion_vinculos")
      .select("entidad_id,pub:publicaciones(estado,archivado_en)")
      .eq("entidad_tipo", "postulacion")
      .in("entidad_id", fondos.map(f => f.id));
    if (!error) {
      for (const v of (vin || []) as any[]) {
        const pub = Array.isArray(v.pub) ? v.pub[0] : v.pub;
        if (!pub || pub.archivado_en) continue;
        const c = casosFondo.get(v.entidad_id) || { total: 0, abiertos: 0 };
        c.total++;
        /* «Sin resolver» y no «abiertos a secas»: lo que importa al mirar la
           lista es cuánto queda por hacer, no cuánto se hizo. */
        if (!CERRADOS.includes(String(pub.estado))) c.abiertos++;
        casosFondo.set(v.entidad_id, c);
      }
    }
  }

  /* ── LAS ALARMAS ENCENDIDAS ──
     El único rojo que declaró una persona. Se traen todas de una vez —son
     poquísimas por definición— y se reparten por entidad. Quién puede
     encenderlas se decide con el mismo perfil que ya se lee para la caja. */
  /* Las dos EN PARALELO: eran dos `await` seguidos, y esta pantalla ya se
     desencascadó una vez a propósito. Dos esperas en serie por dos datos que
     no dependen entre sí son un viaje regalado en cada visita. */
  const [vivas, { data: perfilYo, error: ePerfilYo }] = await Promise.all([
    alarmasVivas(supabase),
    supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle(),
  ]);
  const alarmaDe = new Map<string, any>();
  for (const a of vivas) {
    if (a.entidad_tipo === "postulacion") alarmaDe.set(a.entidad_id, a);
  }
  /* Si el perfil no se pudo leer, el botón no se pinta —falla cerrado— pero
     queda dicho en el registro: si no, un admin ve desaparecer el botón sin
     ninguna explicación y da por hecho que le quitaron el permiso. */
  if (ePerfilYo) console.error("[alarmas] no se pudo leer el perfil:", ePerfilYo.message);
  const puedeAlarma = !!(perfilYo?.es_admin || perfilYo?.es_finanzas);

  /* ── LOS CARTELES, EN UNA CONSULTA ──
   * El póster del proyecto y el logo de la empresa viven en `entidad_media`,
   * no en sus tablas: se piden aparte y por lote, nunca uno por fila.
   * Ojo con `entidad_id`: es único entre tablas (uuid), pero la clave del mapa
   * lleva el TIPO igual. Sin él, un proyecto y una empresa con el mismo id
   * —imposible hoy, barato de asegurar— se pisarían. */
  const carteles = new Map<string, string>();
  {
    const ids = [...new Set(fondos.flatMap((f: any) =>
      [f.proy?.id, f.emp?.id]).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: mm } = await supabase.from("entidad_media")
        .select("entidad_tipo,entidad_id,cartel_url").in("entidad_id", ids);
      (mm || []).forEach((m: any) => {
        if (m.cartel_url) carteles.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url);
      });
    }
  }
  /* Con imagen, su cartel; sin ella, un icono de relleno del mismo tamaño.
     NUNCA un hueco: una fila con póster y otra sin él dejan de estar alineadas
     y la lista se lee en zig-zag. */
  const mini = (tipo: string, id?: string | null, relleno = "🎞") => {
    const u = id ? carteles.get(`${tipo}:${id}`) : null;
    return u
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={u} alt="" className="fondo-mini" referrerPolicy="no-referrer" />
      : <span className="fondo-mini fondo-mini-rell">{relleno}</span>;
  };
  // En ejecución primero (los que aún deben algo), luego los rendidos.
  const vivos = fondos.filter(f => ejecutando(f));
  const rendidos = fondos.filter(f => !ejecutando(f));
  vivos.sort((a, b) => (plazoRendicion(a) || "9999") < (plazoRendicion(b) || "9999") ? -1 : 1);

  /* ── LOS NUEVE, POR FAMILIA ──
   *
   * Nueve fondos en una columna se leen de arriba abajo y ya: no hay forma de
   * ver que tres son de cine indígena y dos de videojuego sin recorrerlos uno
   * por uno. Y la familia decide cosas —qué etapas tiene, qué pide DAFO, quién
   * lo lleva—, así que es el corte que de verdad separa.
   *
   * El orden NO es alfabético ni por tamaño: es el de `CATEGORIAS`, el mismo
   * catálogo que define las etapas de cada tipo. Un orden distinto aquí y allá
   * obliga a reaprender la lista en cada pantalla.
   *
   * Dentro de cada grupo se conserva el orden por plazo que ya traía `vivos`:
   * lo que vence antes, arriba. Agrupar no puede costar la urgencia.
   */
  const ORDEN_CAT = CATEGORIAS_OPC;
  const gruposVivos = (() => {
    const m = new Map<string, any[]>();
    vivos.forEach(f => {
      const k = (f.conv?.categoria || "").trim();
      m.set(k, [...(m.get(k) || []), f]);
    });
    return [...m.entries()]
      .map(([cat, fs]) => ({
        cat,
        // Sin categoría cargada no se inventa una: se dice, y en ámbar, porque
        // es un dato que falta en la convocatoria y se arregla allí.
        nombre: cat || "Sin categoría en la convocatoria",
        fs,
        total: fs.reduce((s, f) => s + Number(f.monto_adjudicado || 0), 0),
      }))
      .sort((a, b) => {
        if (!a.cat) return 1;
        if (!b.cat) return -1;
        const ia = ORDEN_CAT.indexOf(a.cat), ib = ORDEN_CAT.indexOf(b.cat);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || b.total - a.total;
      });
  })();

  const ficha = (f: any) => {
    const vencida = rendicionVencida(f);
    const sinPlazo = rendicionSinPlazo(f);
    const rendido = !ejecutando(f);
    const chip = rendido
      ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
      : vencida
        /* ⏰ y no 🔴: el círculo rojo, pegado al borde derecho y a la altura de
           las cifras, se lee como una burbuja de conteo —«¿un pendiente?»— y no
           como un estado. Desde que hay burbujas rojas de verdad en el menú y
           en las pestañas, el parecido pasó de incómodo a engañoso. El reloj
           dice lo que pasó: se acabó el tiempo. */
        ? { ico: "⏰", txt: `Venció ${dmy(plazoRendicion(f))}`, col: "var(--red)" }
        : sinPlazo
          ? { ico: "⚠", txt: "Sin plazo cargado", col: "var(--yellow)" }
          : { ico: "🎬", txt: `Rinde ${dmy(plazoRendicion(f))}`, col: "var(--teal)" };
    /* ── SIN DESEMBOLSO = APAGADO ──
       Un fondo ganado al que no le ha entrado la plata no se ejecuta: no hay
       nada que rendir, ni recibos que revisar, ni plazo que corra de verdad.
       Cuatro de los nueve están así, y ocupaban el mismo peso que los que sí
       tienen dinero moviéndose — que son los que traen a esta pantalla.
       Se apaga, no se esconde: sigue en su categoría, cuenta en el total y se
       enciende entero al pasar el cursor. Y el aviso «sin desembolso» se queda
       dentro, porque es lo único que hay que hacer con él. */
    const apagada = !f.fecha_desembolso && !rendido;
    const cs = casosFondo.get(f.id);
    return (
      /* ── LA TARJETA Y SU PIE ──
         La tarjeta entera es un enlace al fondo, así que el enlace a sus casos
         NO puede ir dentro: un `<a>` dentro de otro `<a>` no es HTML válido y
         el navegador lo desarma por su cuenta —a veces sacándolo de sitio—.
         Va en un pie, fuera del enlace grande y dentro del mismo bloque. */
      <div key={f.id} className="fondo-bloque">
      <Link href={`/fondo/${f.id}`}
        className={`card fondo-fila${apagada ? " fila-tenue" : ""}`}>
        {/* ── EL CARTEL DE LA PELÍCULA Y EL LOGO DE LA EMPRESA ──
            Nueve códigos «PO-0xx» son nueve códigos: la obra se reconoce por su
            cartel mucho antes que por su número, y quién la produce por su
            logo. Los dos juntos, el póster grande y el logo pequeño encima de
            su esquina, dicen de un vistazo lo que las dos líneas de texto
            dicen leyendo. */}
        <span className="fondo-minis">
          {mini("proyecto", f.proy?.id, "🎞")}
          <span className="fondo-mini-emp">{mini("empresa", f.emp?.id, "🏢")}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              {f.codigo}{f.proy?.nombre ? ` · ${f.proy.nombre}` : ""}
              {f.conv?.anio ? <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {f.conv.anio}</span> : null}
            </span>
            {/* ── EL PLAZO, JUNTO AL TÍTULO ──
                Estaba en la columna derecha, debajo del monto y a la altura de
                las burbujas: «Venció 20/10/2024» quedaba lejos del nombre del
                fondo al que se refiere, y con el ojo en la derecha se leía como
                otro contador más de los que hay ahí. Es un rasgo del fondo, no
                una cifra: va pegado a su nombre.
                En pastilla tenue —la misma de los estados— y no en rojo pleno:
                a esta pantalla se viene a decidir a cuál entrar, y cuatro rojos
                encendidos en columna no ayudan a elegir; encendido va lo que se
                cuenta —lo que falta— y el plazo es contexto. */}
            <span className="chip-tenue" style={{ color: chip.col }}>
              {chip.ico} {chip.txt}
            </span>
          </div>
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 2 }}>
            {f.emp?.nombre || ""}{f.conv?.nombre ? ` · ${f.conv.nombre}` : ""}
          </div>
          {/* El avance de lo que el acta obliga a entregar. Se dibuja igual que
              en la pestaña del fondo: si aquí tuviera otra forma habría que
              aprender dos veces a leer el mismo dato. */}
          {(() => {
            const a = avEnt.get(f.id);
            if (!a || !a.cuentan) return null;
            const txt = `${a.listos} de ${a.cuentan} entregables del acta ya entregados` +
              (a.noAplica ? ` · ${a.noAplica} no aplican` : "") +
              (a.enProceso ? ` · ${a.enProceso} en proceso` : "");
            return (
              <div className="fondo-ent" title={txt}>
                {/* ── EL AVANCE Y SU BARRA, PEGADOS ──
                    La barra iba al final, después de los matices, y quedaba
                    lejos del número que ilustra: se leía como un cuarto dato
                    suelto. Es la misma cifra dibujada, así que va con ella. */}
                <span className="fondo-ent-av">
                  <b style={{ color: a.pct === 100 ? "var(--green)" : "var(--muted)" }}>
                    {a.listos}/{a.cuentan}
                  </b>
                  <span>entregables</span>
                  <span className="acta-barra"><i style={{ width: `${a.pct}%` }} /></span>
                </span>
                {/* Los matices, con la MISMA pastilla que la lista de la ficha
                    y el editor: tres sitios distintos donde aparece «en
                    proceso» y en los tres se reconoce sin leerlo.
                    Cada uno contesta algo: «3 en proceso» dice que hay trabajo
                    en marcha —un 4/16 con tres preparándose no es el mismo
                    fondo que un 4/16 quieto—, y «1 no aplica» explica por qué
                    el total es 16 y no los 17 de la pestaña. */}
                {!!a.enProceso && (
                  <span className="acta-est" style={{ color: META_ESTADO_COMP.en_proceso.col }}>
                    {META_ESTADO_COMP.en_proceso.ico} {a.enProceso} en proceso
                  </span>
                )}
                {!!a.noAplica && (
                  <span className="acta-est" style={{ color: META_ESTADO_COMP.no_aplica.col }}>
                    {META_ESTADO_COMP.no_aplica.ico} {a.noAplica} no aplica
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "var(--teal)", fontWeight: 700, fontSize: 13 }}>
            {f.monto_adjudicado ? fmt(f.monto_adjudicado) : "—"}
          </div>
          {!f.fecha_desembolso && !rendido && (
            <div style={{ color: "var(--yellow)", fontSize: 10.5, marginTop: 1 }}>sin desembolso</div>
          )}
          {/* La MISMA burbuja roja que en la pestaña y en la cabecera de la
              ficha —y el mismo número que suma la del menú—: el rastro se
              sigue si los cuatro escalones se ven iguales. Antes esto era un
              «⚠ faltan 10: …» y había que leerlo entero para saber que era un
              pendiente; el ⚠ es el mismo glifo que usa media pantalla.
              El conteo va SOLO en la burbuja y los meses al lado: decirlo dos
              veces obliga a comprobar si coinciden cada vez que se mira. */}
          {(() => {
            const t = faltanEc.get(f.id);
            const lista = t && listaFaltan(t);
            if (!t || !lista) return null;
            const txt = `${t.faltan.length} estado(s) de cuenta del banco sin cargar`;
            return (
              <div style={{ color: "var(--red)", fontSize: 10.5, marginTop: 3 }}>
                <span className="b-alerta" title={txt} aria-label={txt}>{t.faltan.length}</span>
                {" "}{lista}
              </div>
            );
          })()}
          {/* Y el ámbar: registrado, sin su archivo. Va debajo del rojo y no
              sumado con él — son dos trabajos distintos, y aquí es donde se
              decide a cuál de los nueve fondos entrar primero. */}
          {(() => {
            const s = docsEc.get(f.id);
            if (!s || !s.total) return null;
            const txt = textoSinPruebas(s);
            return (
              <div style={{ color: "var(--yellow)", fontSize: 10.5, marginTop: 2 }}>
                <span className="b-alerta tono-ambar" title={txt} aria-label={txt}>{s.total}</span>
                {" "}sin su archivo adjunto
              </div>
            );
          })()}
        </div>
      </Link>
      {/* ── CUÁNTOS CASOS, Y LLEVANDO A ELLOS ──
          Al tablero con este fondo ya filtrado y en vista de lista: el número
          y el sitio donde se comprueba, sin pasos intermedios. Un contador que
          obliga a ir a buscar la lista a mano es un contador que no se usa.
          Se dicen los DOS: el total, y cuántos siguen sin resolver — «30
          casos» de los que 28 están cerrados es un fondo tranquilo, y sin la
          segunda cifra parece lo contrario. */}
      {/* ── LA ALARMA, EN EL PIE ──
          Fuera del enlace grande por lo mismo que el contador de casos: un
          <a> dentro de otro no es HTML válido, y aquí además hay un
          formulario. Encendida se ve entera; apagada, el botón solo lo ve
          administración. */}
      {(alarmaDe.get(f.id) || puedeAlarma) && (
        <div className="fondo-alarma">
          <BotonAlarma entidadTipo="postulacion" entidadId={f.id}
            tituloSugerido={`${f.codigo}${f.proy?.nombre ? ` · ${f.proy.nombre}` : ""}: `}
            esAdmin={puedeAlarma} alarma={alarmaDe.get(f.id) || null}
            vivas={vivas.length} compacto />
        </div>
      )}
      {cs && cs.total > 0 && (
        <Link className="fondo-casos" href={`/tablero?p=todos&modo=lista&post=${f.id}`}
          title={`Ver los ${cs.total} caso(s) de este fondo en el tablero`}>
          🗂 {cs.total} caso{cs.total === 1 ? "" : "s"}
          {cs.abiertos > 0 && (
            <b style={{ color: "var(--red)" }}> · {cs.abiertos} sin resolver</b>
          )}
        </Link>
      )}
      </div>
    );
  };

  return (
    <div className="shell" style={{ maxWidth: "min(900px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>proyectos ganados, en marcha</span>
      </div>
      <h1 className="title-lg">🎬 Fondos en ejecución · {vivos.length}</h1>

      {vivos.length === 0 && rendidos.length === 0 && (
        <div className="empty">Aún no hay fondos ganados registrados.</div>
      )}
      {gruposVivos.map(g => (
        <div key={g.cat || "__sin"} style={{ marginBottom: 16 }}>
          <div className={`sec-h${g.cat ? "" : " sec-h-pend"}`}>
            🎬 {g.nombre}
            {/* El total de la familia. Es la cifra que contesta «¿dónde está
                metido el dinero?», y sin ella el grupo solo dice cuántos son —
                que es lo de menos cuando uno vale S/ 510,000 y otro S/ 50,000. */}
            <span className="sec-h-dato">{fmt(g.total)}</span>
            <span className="sec-h-sub">
              {g.fs.length} {g.fs.length === 1 ? "fondo" : "fondos"}
              {!g.cat && " — cárgale la categoría a su convocatoria"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.fs.map(ficha)}
          </div>
        </div>
      ))}

      {rendidos.length > 0 && (
        <>
          {/* Los rendidos NO se agrupan por categoría: ya no hay nada que
              decidir sobre ellos, y partirlos en cinco bloques de uno haría
              parecer trabajo lo que es archivo. */}
          <div className="sec-h sec-h-off" style={{ marginTop: 22 }}>
            ✅ Rendidos · {rendidos.length}
            <span className="sec-h-sub">cerrados — se guardan por si los preguntan</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rendidos.map(ficha)}
          </div>
        </>
      )}
    </div>
  );
}
