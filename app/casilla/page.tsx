import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import CasillaDafo from "@/components/CasillaDafo";
import Realtime from "@/components/Realtime";
import { enJuego, ejecutando } from "@/lib/fondos";
import { hoyLima } from "@/lib/fechas";
import { claseCorreo } from "@/lib/casilla";

/* Viva = recibe correo de DAFO. No es lo mismo que «en juego»: una GANADORA sin
   rendir es la que más recibe —todo el hilo de la rendición— y quedaba fuera. */
const viva = (p: any) => enJuego(p) || ejecutando(p);

/* El nombre de la empresa embebida. Supabase devuelve un objeto o un array de
   uno según cómo resuelva la relación, y elegir mal deja el nombre en blanco
   sin ningún error — el hueco parecería «esta empresa no tiene nombre». */
const nombreEmp = (e: any): string | null =>
  (Array.isArray(e) ? e[0]?.nombre : e?.nombre) || null;

export const metadata: Metadata = { title: "📬 Casilla DAFO" };

/* ── 📬 CASILLA DAFO — el fin del ritual de abrir diez bandejas ──
   Cada postulación registra un correo distinto y DAFO avisa cuando quiere. La
   única forma de no perderse nada era revisar diez cuentas a diario. Aquí
   llegan todas: sin leer arriba, agrupadas por postulación, con el enlace al
   mensaje real en Gmail.

   Lo que hace que esto sirva no es la lista, es el resumen de arriba: dice
   CUÁNTO HACE que no llega nada por cada postulación en juego. Una bandeja
   vacía y una postulación de la que nunca supimos nada se ven igual en el
   correo; aquí no.

   Los correos entran por /api/ingesta/dafo (los empuja el Apps Script del
   buzón maestro). Ver CASILLA-DAFO.md. */

const TOPE = 300;

export default async function CasillaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* El token es para el canal de realtime: el navegador no tiene la sesión de
     Supabase, la tiene el servidor (ver components/Realtime.tsx). */
  const { data: { session } } = await supabase.auth.getSession();

  const [
    { data: comsRaw, error }, { data: postsRaw },
    { data: credsRaw, error: eCreds }, { data: empresasRaw },
  ] = await Promise.all([
    supabase.from("dafo_comunicaciones")
      .select("id,gmail_thread_id,buzon,cuenta,remitente,asunto,extracto,recibido_en," +
              "vinculo_por,pide_accion,leido_en,caso_id,postulacion_id," +
              "post:postulaciones(id,codigo,estado,proy:proyectos(nombre),conv:convocatorias(nombre,anio))," +
              "emp:empresas(id,nombre)")
      .order("recibido_en", { ascending: false }).limit(TOPE),
    supabase.from("postulaciones")
      .select("id,codigo,estado,empresa_id,fecha_rendicion_real,proy:proyectos(nombre),conv:convocatorias(id,codigo,nombre,anio),emp:empresas(nombre)")
      .order("creado_en", { ascending: false }).limit(300),
    /* Las cuentas de correo. El filtro es EXACTAMENTE el de la ingesta
       (route.ts → empresaDeCorreo): toda credencial con empresa y con un @ en
       el identificador, sin mirar la plataforma. Si aquí se filtrara por
       `plataforma = 'Gmail'` el panel mostraría menos cuentas de las que el
       vinculador usa de verdad, y una pantalla de diagnóstico que miente sobre
       lo que hace el sistema es peor que no tenerla. */
    supabase.from("credenciales").select("id,identificador,empresa_id,emp:empresas(nombre)")
      .not("empresa_id", "is", null).not("identificador", "is", null),
    /* Para el selector del alta. Van TODAS, no solo las que ya postularon: una
       cuenta se suele registrar antes de que su primera postulación exista, y
       un selector que esconde justo la empresa que buscas obliga a salir de la
       pantalla — que es lo que este formulario venía a evitar. */
    supabase.from("empresas").select("id,nombre").order("nombre"),
  ]);

  /* Falta el SQL vs. falló la consulta: son dos problemas distintos y el
     mensaje genérico manda a buscar donde no está (misma lección que
     casoDeExpediente). */
  if (error) {
    const falta = /dafo_comunicaciones/.test(error.message);
    return (
      <div className="shell" style={{ maxWidth: "min(900px, 96vw)" }}>
        <div className="topbar"><Volver /></div>
        <h1 className="title-lg">📬 Casilla DAFO</h1>
        <div className="empty" style={{ color: falta ? "var(--yellow)" : "var(--red)" }}>
          {falta
            ? "Falta correr db/casilla-dafo.sql en Supabase → SQL Editor."
            : `No se pudo leer la casilla: ${error.message}`}
        </div>
      </div>
    );
  }

  const coms = (comsRaw || []) as any[];
  const posts = (postsRaw || []) as any[];

  /* El selector para vincular a mano: primero las que están en juego, que son
     las que reciben correos. Las cerradas siguen ahí —un requerimiento puede
     llegar meses después— pero no compiten por el primer sitio de la lista. */
  const etiqueta = (p: any) =>
    `${p.codigo || "sin código"}${p.proy?.nombre ? ` · ${p.proy.nombre}` : ""}${p.conv?.anio ? ` (${p.conv.anio})` : ""}`;
  const opciones = [...posts]
    .sort((a, b) => Number(viva(b)) - Number(viva(a)))
    .map(p => ({ id: p.id as string, etiqueta: etiqueta(p), enJuego: viva(p) }));

  /* Última señal por postulación. Se calcula de los correos ya traídos: la
     lista viene ordenada por fecha desc, así que el PRIMERO de cada
     postulación es su último contacto. */
  /* Se guarda el CORREO entero y no solo su fecha: la tabla enseña el asunto
     ahí mismo. «Hace 12 d» obligaba a bajar a buscar de qué iba, que era
     justamente el viaje que este panel venía a ahorrar. */
  /* ── SOLO CUENTA COMO «ÚLTIMA SEÑAL» LO QUE ES DE DAFO ──
     El filtro de Gmail reenvía todo lo que cae en las cuentas de postulación
     —y tiene que hacerlo: DAFO escribe desde direcciones que no se pueden
     listar de antemano—. El resultado era que «Estás usando Gemini en la web»
     y «Security alert» aparecían como la última señal de un expediente.
     Esta columna existe para contestar «¿DAFO dijo algo?», y un aviso de
     Google ocupando ese sitio contesta que sí cuando la respuesta es no. Es
     la forma más cara de fallar aquí, porque parece una buena noticia.
     Lo demás no se tira: se cuenta aparte y se enseña (`otrosPorPost`). */
  const ultimo = new Map<string, { id: string; asunto: string; recibido_en: string }>();
  const sinLeerPorPost = new Map<string, number>();
  const otrosPorPost = new Map<string, number>();
  coms.forEach(c => {
    if (!c.postulacion_id) return;
    const cl = claseCorreo(c.remitente, c.asunto, c.extracto, c.vinculo_por);
    if (cl !== "dafo") {
      otrosPorPost.set(c.postulacion_id, (otrosPorPost.get(c.postulacion_id) || 0) + 1);
    } else if (!ultimo.has(c.postulacion_id)) {
      ultimo.set(c.postulacion_id, {
        id: c.id, asunto: c.asunto || "(sin asunto)", recibido_en: c.recibido_en,
      });
    }
    /* Lo SIN LEER sigue contando todo: que un correo no sea de DAFO no
       significa que nadie tenga que abrirlo, y un aviso de seguridad sin leer
       es justamente de los que no conviene esconder. */
    if (!c.leido_en) sinLeerPorPost.set(c.postulacion_id, (sinLeerPorPost.get(c.postulacion_id) || 0) + 1);
  });

  /* ── QUÉ CUENTA ALIMENTA A CADA POSTULACIÓN ──
     La pregunta que el panel no sabía contestar: la tarjeta decía «nunca llegó
     nada» sin decir POR DÓNDE tenía que llegar. Y esas son dos cosas muy
     distintas: una postulación cuya cuenta está registrada y calla es una
     noticia; una que no tiene cuenta registrada no está callada — es que no
     tiene por dónde hablar, y ninguna espera va a arreglarla.

     El correo se cuelga de la EMPRESA (así lo lee la ingesta), así que las
     postulaciones de una misma empresa comparten cuentas. Se dicen todas: cuál
     de ellas recibió cada correo se ve en la fila del correo, no aquí. */
  const cuentasDeEmpresa = new Map<string, string[]>();
  const correoEmpresa = new Map<string, { id: string; empresaId: string; empresa: string | null }>();
  /* Ordenado por correo ANTES de agrupar. La consulta no lleva `order`, así que
     Postgres devuelve las filas en el orden que le conviene: con dos cuentas en
     la misma empresa, cuál salía como «la principal» en la tabla podía cambiar
     entre dos recargas sin que nadie tocara nada. Un dato que baila solo hace
     dudar del resto de la pantalla. */
  [...((credsRaw || []) as any[])]
    .sort((a, b) => String(a.identificador || "").localeCompare(String(b.identificador || "")))
    .forEach(c => {
      const correo = String(c.identificador || "").trim().toLowerCase();
      if (!correo.includes("@") || !c.empresa_id) return;
      if (correoEmpresa.has(correo)) return;   // el duplicado ya se rechaza al dar de alta
      correoEmpresa.set(correo, { id: c.id, empresaId: c.empresa_id, empresa: nombreEmp(c.emp) });
      const lista = cuentasDeEmpresa.get(c.empresa_id) || [];
      lista.push(correo);
      cuentasDeEmpresa.set(c.empresa_id, lista);
    });

  /* ── LOS AÑOS QUE TODAVÍA NO EMPIEZAN ──
     Una convocatoria de 2027 tiene postulaciones «en juego» porque se están
     preparando, pero DAFO no le ha escrito a nadie ni va a hacerlo por meses.
     En una tira que mide SILENCIO, esas filas dicen «nunca llegó nada» con la
     misma cara que una de 2026 que sí debería haber recibido algo — y una
     alarma que suena cuando no pasa nada enseña a no mirar la tira.

     Se ocultan solo las MUDAS. Si a una futura le llega un correo, aparece: el
     criterio no es «este año no interesa» sino «todavía no hay nada que
     contar», y en cuanto lo hay deja de aplicar. Ocultar algo que trae noticias
     sería exactamente el fallo silencioso que este panel existe para evitar. */
  const anioActual = Number(hoyLima().slice(0, 4));
  const futuraMuda = (p: any) =>
    (p.conv?.anio || 0) > anioActual && !ultimo.has(p.id);
  const ocultasFuturas = posts.filter(p => viva(p) && futuraMuda(p));
  const aniosOcultos = [...new Set(ocultasFuturas.map((p: any) => p.conv?.anio))]
    .sort((a, b) => a - b);

  const resumen = posts
    .filter(p => viva(p) && !futuraMuda(p))
    .map(p => ({
      id: p.id as string,
      codigo: (p.codigo || "sin código") as string,
      nombre: (p.proy?.nombre || "") as string,
      ultimo: ultimo.get(p.id)?.recibido_en || null,
      ultimoId: ultimo.get(p.id)?.id || null,
      ultimoAsunto: ultimo.get(p.id)?.asunto || null,
      /* Cuántos llegaron a esa cuenta que NO son de DAFO. Se dice para que
         «nunca llegó nada de DAFO» no se lea como «esta cuenta está muerta»:
         son dos diagnósticos distintos y llevan a arreglos distintos. */
      otros: otrosPorPost.get(p.id) || 0,
      sinLeer: sinLeerPorPost.get(p.id) || 0,
      empresa: (nombreEmp(p.emp) || null) as string | null,
      /* La convocatoria, para agrupar. Con veintiuna tarjetas de nueve
         concursos distintos revueltas, ubicar «las del C-072» era leerlas
         todas — el mismo problema que ya se resolvió en /postulaciones, y se
         resuelve igual para que las dos pantallas se lean con el mismo ojo. */
      convId: (p.conv?.id || "") as string,
      convCodigo: (p.conv?.codigo || "") as string,
      convNombre: (p.conv?.nombre || "") as string,
      anio: (p.conv?.anio ?? null) as number | null,
      cuentas: (p.empresa_id ? cuentasDeEmpresa.get(p.empresa_id) : null) || [],
      /* Una ganadora rindiendo y una que todavía compite esperan correos
         distintos —requerimientos de rendición vs. resultados— y mezclarlas en
         una sola tira de treinta tarjetas hacía que ninguna se leyera. */
      rindiendo: ejecutando(p),
    }))
    /* Lo más silencioso primero: la postulación de la que nunca supimos nada
       es exactamente la que hay que mirar. */
    .sort((a, b) => (a.ultimo ? new Date(a.ultimo).getTime() : 0) - (b.ultimo ? new Date(b.ultimo).getTime() : 0));


  /* ── EL INVENTARIO DE CUENTAS ──
     Al revés que el resumen: no mira postulaciones sino BUZONES. Sirve para el
     fallo que ninguna otra pantalla puede ver — una cuenta a la que se le
     olvidó activar el reenvío. Esa cuenta no produce ningún error en ninguna
     parte: simplemente nunca aparece, y todas las postulaciones que dependen de
     ella se ven como «nunca llegó nada», que es el mismo aspecto que tiene DAFO
     cuando de verdad no ha escrito. Aquí se distinguen. */
  const ultimoDeCuenta = new Map<string, { id: string; recibido_en: string }>();
  const totalDeCuenta = new Map<string, number>();
  coms.forEach(c => {
    const k = String(c.cuenta || "").trim().toLowerCase();
    if (!k) return;
    if (!ultimoDeCuenta.has(k)) ultimoDeCuenta.set(k, { id: c.id, recibido_en: c.recibido_en });
    totalDeCuenta.set(k, (totalDeCuenta.get(k) || 0) + 1);
  });
  /* El buzón maestro, deducido de los correos que ya llegaron en vez de
     guardado en una variable de entorno más: si algún día se cambia de buzón,
     el dato viejo mentiría y este se corrige solo. */
  const buzones = new Set(coms.map(c => String(c.buzon || "").trim().toLowerCase()).filter(Boolean));

  const vivasDeEmpresa = new Map<string, number>();
  posts.filter(viva).forEach(p => {
    if (p.empresa_id) vivasDeEmpresa.set(p.empresa_id, (vivasDeEmpresa.get(p.empresa_id) || 0) + 1);
  });

  const inventario = [...correoEmpresa.entries()]
    .map(([correo, e]) => ({
      correo,
      credId: e.id,
      empresa: e.empresa,
      empresaId: e.empresaId,
      vivas: vivasDeEmpresa.get(e.empresaId) || 0,
      ultimo: ultimoDeCuenta.get(correo)?.recibido_en || null,
      ultimoId: ultimoDeCuenta.get(correo)?.id || null,
      total: totalDeCuenta.get(correo) || 0,
      /* El maestro no deduce nada: la ingesta lo descarta al buscar de quién
         era el correo (el reenvío lo agrega a todos los destinatarios). Decirlo
         evita la conclusión falsa de «está registrado, entonces funciona». */
      esBuzon: buzones.has(correo),
    }))
    /* Las mudas primero, y entre ellas las que más postulaciones vivas
       sostienen: ahí es donde un reenvío sin activar cuesta más caro. */
    .sort((a, b) =>
      Number(!!a.total) - Number(!!b.total) ||
      b.vivas - a.vivas ||
      a.correo.localeCompare(b.correo));

  /* Las empresas del selector, con las que tienen postulaciones vivas primero:
     son las que están recibiendo correo de DAFO ahora mismo, o sea las que casi
     siempre se buscan. Las demás siguen ahí —una cuenta se registra antes de
     postular— pero no compiten por el primer sitio de la lista. Misma regla que
     el selector de postulaciones de más arriba. */
  const empresas = ((empresasRaw || []) as any[])
    .map(e => ({
      id: e.id as string,
      nombre: (e.nombre || "sin nombre") as string,
      vivas: vivasDeEmpresa.get(e.id) || 0,
    }))
    .sort((a, b) => Number(b.vivas > 0) - Number(a.vivas > 0) || a.nombre.localeCompare(b.nombre));

  const sinLeer = coms.filter(c => !c.leido_en).length;

  return (
    <div className="shell" style={{ maxWidth: "min(1100px, 97vw)" }}>
      {/* En vivo: un correo puede entrar mientras la página está abierta, y el
          panel es justo el sitio donde se está esperando que entre. */}
      <Realtime tablas={["dafo_comunicaciones"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          todo lo que DAFO escribió a las cuentas de las postulaciones
        </span>
      </div>
      <h1 className="title-lg">📬 Casilla DAFO{sinLeer ? ` · ${sinLeer} sin leer` : ""}</h1>

      <CasillaDafo items={coms} opciones={opciones} resumen={resumen}
        inventario={inventario} empresas={empresas}
        ocultas={ocultasFuturas.length} aniosOcultos={aniosOcultos as number[]}
        cuentasError={eCreds?.message || null} tope={TOPE} />
    </div>
  );
}
