"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";
import Link from "@/components/Enlace";
import { useEffect, useState } from "react";
import type { EstadoNav } from "@/app/nav-acciones";
import { pedirZocalo } from "@/lib/zocalo";
import { etiquetasDelMenu } from "@/app/actions";

/* ── LOS SITIOS QUE NO SON UNA ENTIDAD ──
 *
 * `SECCIONES` describe los catálogos (proyectos, personas, empresas…): tienen
 * ficha, historial y casos. Estos otros son lugares a los que se va a mirar o
 * a trabajar, y hasta ahora estaban repartidos entre este menú y el de la
 * cuenta, sin más criterio que el orden en que se fueron construyendo. Agenda,
 * Pulso, Llaves y Caja vivían allí; un menú de cuenta es para la cuenta —tu
 * perfil, tus notificaciones, salir— y no para navegar el sistema.
 *
 * ── ESTÁN AQUÍ COMO DATOS, NO COMO JSX ──
 * La lista y el rótulo del botón («dónde estoy») se leían de dos sitios
 * distintos: cada destino nuevo obligaba a tocar los dos, y olvidarse del
 * segundo no da error — el enlace funciona y el botón sigue diciendo
 * «Secciones» estando dentro. Con la lista como dato, quien añada un destino
 * lo añade una vez.
 */
type Destino = {
  ruta: string; ico: string; txt: string; grupo: "plata" | "dia";
  /** Solo para quien lleva las finanzas. */
  soloFinanzas?: boolean;
  /** Cuándo se considera que «estás ahí». Por defecto, la ruta exacta. */
  activo?: (p: string) => boolean;
};

const DESTINOS: Destino[] = [
  { ruta: "/fondos", ico: "🎬", txt: "fondos en ejecución", grupo: "plata",
    activo: p => p === "/fondos" || p.startsWith("/fondo/") },
  { ruta: "/obligaciones", ico: "📅", txt: "obligaciones", grupo: "plata" },
  { ruta: "/comprobantes", ico: "🧾", txt: "comprobantes", grupo: "plata" },
  { ruta: "/caja", ico: "💰", txt: "caja", grupo: "plata", soloFinanzas: true },
  /* ── EL TABLERO, EN EL MENÚ ──
     Es la pantalla más usada del sistema y la única a la que había que llegar
     de memoria: solo se entraba por el menú del avatar y por un botón de
     /pulso. Una pantalla que no está en el menú no existe para el equipo —
     existe para quien la construyó y para quien se acuerda.
     Va primero de «el día a día» y antes que la agenda: la agenda contesta
     «¿cuándo?» y el tablero «¿qué hay que hacer?», que es la pregunta con la
     que se abre el día. */
  { ruta: "/tablero", ico: "🗂", txt: "tablero de casos", grupo: "dia" },
  { ruta: "/agenda", ico: "📆", txt: "agenda", grupo: "dia" },
  { ruta: "/pulso", ico: "📊", txt: "pulso del equipo", grupo: "dia" },
  { ruta: "/llaves", ico: "🔑", txt: "llaves", grupo: "dia" },
  { ruta: "/etiquetas", ico: "🏷️", txt: "etiquetas", grupo: "dia" },
  { ruta: "/casilla", ico: "📬", txt: "casilla DAFO", grupo: "dia" },
];

const estaEn = (d: Destino, p: string) => d.activo ? d.activo(p) : p === d.ruta;

/* La burbuja se pinta en dos sitios —el botón y su entrada de la lista— y con
   dos colores. Escrita una vez: dos copias con los mismos estilos en línea son
   dos que se separan al primer retoque, y entonces el mismo pendiente se ve de
   dos formas distintas en la misma pantalla. */
/* ── LOS TONOS DICEN QUÉ CLASE DE PENDIENTE ES, NO CUÁNTO CORRE PRISA ──
   Rojo y ámbar son para lo que TIENE QUE LLEGAR A CERO: una declaración
   vencida, un estado de cuenta que falta, un correo sin leer. Se atienden y
   desaparecen, y por eso el color puede gritar.
   El trabajo del día a día —los casos propios— nunca llega a cero: siempre hay
   casos abiertos, es el trabajo, no una deuda. Pintarlo del mismo rojo enseña
   al ojo que el rojo no significa nada, y entonces el rojo que sí importaba
   tampoco se ve. Ese es el modo en que mueren todos los indicadores.
   Así que llevan el violeta de la casa: se leen igual de bien, se distinguen
   entre sí, y no se confunden con lo que hay que terminar. */
type Tono = "rojo" | "ambar" | "activo" | "activo-flojo";
function Burbuja({ n, tono, txt }: { n: number; tono: Tono; txt: string }) {
  return (
    <span title={txt} className={`nav-burbuja${tono === "rojo" ? "" : ` tono-${tono}`}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/* LA NAVEGACIÓN ENTRE SECCIONES, en un solo control.

   Vivía suelta dentro del feed, así que al entrar a una empresa desaparecía y
   para ir a personas había que volver al inicio. Se hizo componente y viajó
   con el <Volver>, que sí está en todas las pantallas.

   Ahora se pliega en un combo. Eran siete íconos sin texto en la cabecera —el
   séptimo llegó con el repositorio— y siete emojis seguidos no son un menú:
   son siete adivinanzas que además le comían el sitio al buscador. El combo
   muestra DÓNDE ESTÁS con su nombre («📁 Proyectos ▾») y al abrirse da la
   lista con ícono y nombre, que es lo que un menú tiene que hacer: decir a
   dónde llevan las cosas antes de tocarlas. */

export default function NavIconos() {
  const pathname = usePathname() || "";
  const [abierto, setAbierto] = useState(false);
  /* Los correos de DAFO sin leer. Se pide desde el cliente y no por props
     porque esta nav vive dentro de <Volver>, que está en las 19 pantallas:
     enhebrar el dato por diecinueve páginas era la otra opción.
     Se relee al navegar —marcar uno como leído en /casilla tiene que bajar el
     número— y es un `count` sin filas, así que cuesta casi nada. */
  /* ── UNA LLAMADA, NO TRES ──
     Aquí había tres: los correos sin leer, el permiso de la caja y lo que
     vence. Lanzadas con tres promesas «en paralelo» que no lo eran — Next
     encola las acciones de servidor y las manda de una en una, cada una con su
     propia validación de sesión contra Supabase. Eran seis viajes de red en
     CADA navegación, en las diecinueve pantallas, y se fueron sumando de a una
     sin que ninguna pareciera cara.
     `false` y ceros de arranque para no parpadear: enseñar la caja y quitarla
     medio segundo después se lee como un fallo. */
  /* Y ahora tampoco es UNA: es un TERCIO de una. `pedirZocalo` comparte la
     misma llamada con el banco de trabajo y la campanita, que preguntaban lo
     suyo en el mismo instante. Cuatro POST encolados —4772 ms medidos— pasan a
     ser uno. Ver lib/zocalo.ts. */
  const [nav, setNav] = useState<EstadoNav>({
    casilla: 0, caja: false, vencidos: 0, porVencer: 0, fondosEc: 0, mesesEc: 0, docsEc: 0,
    casosMios: 0, casosCurso: 0,
  });
  useEffect(() => {
    let vivo = true;
    /* Las alarmas viajan en el mismo zócalo. Se cuelgan del estado del menú en
       vez de en un `useState` aparte para que lleguen en el mismo render: dos
       estados que se llenan por separado hacen que el menú parpadee con la
       marca puesta a medias. */
    pedirZocalo(pathname).then(z => {
      if (vivo) setNav({ ...z.nav, __alarmas: (z as any).alarmas || [] } as any);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [pathname]);
  /* ── LAS ALARMAS, EN LA ENTRADA QUE LES TOCA ──
     Una alarma es de una entidad, así que su marca va en la sección donde vive
     esa entidad: un fondo la pone en «fondos en ejecución», una empresa en
     «empresas». La franja de arriba dice CUÁL es el problema; esto dice DÓNDE
     está, que es lo que se necesita cuando uno navega y ya leyó la franja.
     ⚠ `postulacion` apunta a /fondos y no a /postulaciones: la alarma se
     enciende sobre un fondo en ejecución, que es donde está el dinero. */
  const alarmas = ((nav as any).__alarmas || []) as { entidad_tipo: string }[];
  /* Una entidad puede tener alarma y no ser una SECCIÓN del menú: la
     postulación se mira en «fondos en ejecución», y la etiqueta —que tiene
     ficha, y por tanto botón de alarma— en «etiquetas». Sin este mapa la marca
     no aparecía en ninguna entrada: la alarma existía y el menú callaba. */
  const RUTA_ALARMA: Record<string, string> = {
    postulacion: "/fondos", etiqueta: "/etiquetas",
  };
  const alarmasPor = new Map<string, number>();
  for (const a of alarmas) {
    const ruta = RUTA_ALARMA[a.entidad_tipo]
      || SECCIONES.find(x => x.tipo === a.entidad_tipo)?.ruta;
    if (ruta) alarmasPor.set(ruta, (alarmasPor.get(ruta) || 0) + 1);
  }

  /* ── LAS ETIQUETAS, DETRÁS DE SU ENTRADA ──
     A una etiqueta se entra para ver sus casos —«¿qué hay de Rodaje?»—, y eso
     eran tres pasos: abrir el menú, entrar al índice, buscar el chip. El índice
     sigue existiendo (ahí se buscan, se ven las que no usa nadie y se borran),
     pero para lo de todos los días sobra.
     Se piden al ABRIR el submenú y se recuerdan mientras la página viva: el
     zócalo es para lo que se ve sin abrir nada, y esto vive tras dos clics. */
  const [etqAbierto, setEtqAbierto] = useState(false);
  const [etqs, setEtqs] = useState<{ id: string; nombre: string; n: number }[] | null>(null);
  const [etqErr, setEtqErr] = useState("");
  useEffect(() => {
    if (!etqAbierto || etqs || etqErr) return;
    let vivo = true;
    etiquetasDelMenu().then((r: any) => {
      if (!vivo) return;
      if (r?.error) setEtqErr(r.error); else setEtqs(r.etiquetas || []);
    }).catch(() => { if (vivo) setEtqErr("No se pudieron cargar."); });
    return () => { vivo = false; };
  }, [etqAbierto, etqs, etqErr]);
  // Al cerrarse el menú entero, el submenú se cierra con él.
  useEffect(() => { if (!abierto) setEtqAbierto(false); }, [abierto]);
  /* Y al navegar se olvida lo traído. En casi todas las pantallas este menú se
     remonta al cambiar de página —vive dentro de <Volver>— y esto no hace
     nada; pero en /obligaciones y /comprobantes el <Volver> está en el LAYOUT,
     así que el componente sobrevive y la lista se quedaría congelada: una
     etiqueta creada mientras tanto no aparecería nunca. */
  useEffect(() => { setEtqs(null); setEtqErr(""); }, [pathname]);

  const casilla = nav.casilla;
  const conCaja = nav.caja;

  /* ── LAS DOS BURBUJAS DE OBLIGACIONES ──
     Rojo lo vencido, ámbar lo que vence dentro de la ventana de aviso. No se
     suman —uno es una multa corriendo y lo otro una tarea de esta semana— y
     tampoco se turnan.
     La primera versión enseñaba el ámbar SOLO si no había ningún rojo, y con
     trece vencidos el «1 por vencer» desaparecía: justo el que todavía se
     puede evitar, tapado por los que ya no. La urgencia de uno no cancela al
     otro, y quien tiene atraso crónico es quien más necesita ver el que aún
     está a tiempo.
     Estando DENTRO de /obligaciones no se pintan, igual que la casilla: el
     pendiente ya está a la vista y repetirlo en el menú es ruido. */
  const oblAvisos = [
    nav.vencidos > 0 && { k: "v", n: nav.vencidos, tono: "rojo" as const,
      txt: `${nav.vencidos} declaración(es) vencida(s)` },
    nav.porVencer > 0 && { k: "p", n: nav.porVencer, tono: "ambar" as const,
      txt: `${nav.porVencer} declaración(es) por vencer en los próximos días` },
  ].filter(Boolean) as { k: string; n: number; tono: Tono; txt: string }[];

  /* ── LOS ESTADOS DE CUENTA QUE FALTAN ──
     El aviso existía solo DENTRO de la ficha del fondo, y encima dentro de una
     sub-sección plegada: para verlo había que entrar al fondo correcto y abrir
     la sección correcta, o sea sospechar antes de mirar. Lo que falta no ocupa
     sitio en la pantalla; si además hay que ir a buscarlo, no avisa de nada.
     ── CUENTA MESES, NO FONDOS ──
     Empezó contando FONDOS, con el argumento de que así se podía cuadrar con
     la lista de /fondos: tres tarjetas, un tres. Pero el trabajo no son las
     tarjetas, son los PDF: un fondo al que le faltan diez meses y otro al que
     le falta uno valían lo mismo, y «3» sonaba a tarde de trabajo cuando eran
     dieciséis estados de cuenta que pedirle al banco. Un indicador que aplana
     la diferencia entre uno y diez no ayuda a decidir por dónde empezar.
     Y así todo el rastro cuenta lo mismo —meses—: la burbuja del menú, la de
     la pestaña Financiera y la de Rendición. Cuadrar sigue siendo posible, y
     mejor: los números de las tarjetas de /fondos SUMAN el del menú.
     El título dice en cuántos fondos están repartidos, que es lo que se perdió
     al cambiar de unidad.
     En rojo: cualquier mes que falte es un mes ya cerrado, o sea un papel
     vencido, no una tarea futura.
     Estando en /fondos no se pinta: allí cada tarjeta lo dice por su cuenta. */
  /* ── EL TABLERO TAMBIÉN AVISA ──
     Rojo lo que está SIN RESOLVER y ámbar lo que está EN PROGRESO, y solo lo
     MÍO: «324 sin resolver en el sistema» es un dato de informe —no baja
     aunque uno trabaje toda la semana— y una burbuja que no se mueve se
     vuelve parte del decorado. Lo que se puede atender hoy es lo propio.
     Los dos números no se suman: uno es trabajo sin empezar y el otro trabajo
     en marcha, y mezclarlos no dice qué hacer con ninguno.
     Estando DENTRO del tablero no se pintan, igual que la casilla y las
     obligaciones: el pendiente ya está a la vista. */
  const casosAvisos = [
    nav.casosMios > 0 && { k: "cx", n: nav.casosMios, tono: "activo" as const,
      txt: `${nav.casosMios} caso(s) tuyo(s) sin resolver` },
    nav.casosCurso > 0 && { k: "cp", n: nav.casosCurso, tono: "activo-flojo" as const,
      txt: `${nav.casosCurso} caso(s) tuyo(s) en progreso` },
  ].filter(Boolean) as { k: string; n: number; tono: Tono; txt: string }[];

  /* Dos burbujas, como en obligaciones y por la misma razón: no se suman ni se
     turnan. El rojo es «no existe el registro» —hay que pedirle el extracto al
     banco— y el ámbar es «el registro está, falta subir su archivo». Se
     resuelven en sitios distintos y por gente distinta; un número que las
     mezcla no dice qué hacer. */
  const fondosAvisos = [
    nav.mesesEc > 0 && { k: "ec", n: nav.mesesEc, tono: "rojo" as const,
      txt: `${nav.mesesEc} estado(s) de cuenta del banco sin cargar · en ${nav.fondosEc} fondo(s)` },
    nav.docsEc > 0 && { k: "doc", n: nav.docsEc, tono: "ambar" as const,
      txt: `${nav.docsEc} documento(s) registrados sin su archivo adjunto: recibos, extractos, facturas y DJ` },
  ].filter(Boolean) as { k: string; n: number; tono: Tono; txt: string }[];

  /* Dónde estás. Cuenta la sección entera: la ficha, su historial y sus casos
     también son «estar ahí». */
  const enSeccion = (s: (typeof SECCIONES)[number]) =>
    pathname === s.ruta
    || pathname.startsWith(`/entidad/${s.tipo}/`)
    // El repositorio es la única sección cuya ficha no vive en /entidad
    || (s.tipo === "objeto" && pathname.startsWith("/objeto/"))
    || pathname === `/historial/${s.tipo}`
    || pathname === `/casos/${s.tipo}`;

  const aqui = SECCIONES.find(enSeccion);
  /* El destino en el que estás, si es uno de los que no son entidad. Sale de la
     MISMA lista que se pinta abajo: antes cada uno tenía su `const enX` y su
     rama en el rótulo, y el que se olvidara dejaba el botón diciendo
     «Secciones» estando dentro. */
  const destinos = DESTINOS.filter(d => !d.soloFinanzas || conCaja);
  const aquiDestino = destinos.find(d => estaEn(d, pathname));
  const enCasilla = pathname === "/casilla";

  // Cerrar con Escape: un menú que solo se cierra con el ratón estorba.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  // Al navegar, el menú sobra.
  useEffect(() => { setAbierto(false); }, [pathname]);

  return (
    <nav className="nav-menu">
      <button type="button" className={`btn btn-ghost nav-btn${aqui || aquiDestino ? " nav-aqui" : ""}`}
        onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        title={aqui ? aqui.titulo : aquiDestino ? aquiDestino.txt : "Secciones"}>
        <span className="nav-ico">{aqui ? aqui.ico : aquiDestino ? aquiDestino.ico : "☰"}</span>
        <span className="nav-txt">{aqui ? aqui.plural : aquiDestino ? aquiDestino.txt : "Secciones"}</span>
        <span className="nav-cheb">▾</span>
        {/* ── LO PENDIENTE, TAMBIÉN CON EL MENÚ CERRADO ──
            Es el indicador PERMANENTE: la campanita habla de lo que acaba de
            pasar y se calla al leerse; esto sigue ahí mientras quede algo. Una
            burbuja que solo se ve al abrir el menú no avisa de nada — hay que
            haberse acordado para verla, y acordarse es justo lo que falla.
            Van SEPARADAS y no sumadas: un correo sin leer y una declaración
            vencida no se atienden igual, y un número que las mezcla no dice qué
            hacer. Ninguna se pinta estando ya en su pantalla. */}
        {casilla > 0 && !enCasilla && (
          <Burbuja n={casilla} tono="rojo"
            txt={`${casilla} correo(s) de DAFO sin leer`} />
        )}
        {pathname !== "/obligaciones" && oblAvisos.map(a => (
          <Burbuja key={a.k} n={a.n} tono={a.tono} txt={a.txt} />
        ))}
        {/* En el BOTÓN no se pinta estando ya en /fondos —el pendiente está a
            la vista en cada tarjeta—, pero en la entrada del menú sí, igual que
            la casilla y las obligaciones: dentro del menú la burbuja dice a
            dónde ir, no que haya algo nuevo. */}
        {pathname !== "/fondos" && fondosAvisos.map(a => (
          <Burbuja key={a.k} n={a.n} tono={a.tono} txt={a.txt} />
        ))}
        {/* ── LOS CASOS NO SALEN AQUÍ ──
            Estuvieron, y con las dos burbujas: la regla era «si un número se
            enseña, se enseña entero en los dos sitios». La regla sigue valiendo
            —dentro del menú van los dos— pero el botón cerrado no es «los dos
            sitios»: es el aviso permanente, el que se ve sin abrir nada, y ese
            es para lo que hay que TERMINAR.
            Los casos propios no terminan: siempre hay doce. Un número que nunca
            baja, pegado al botón todo el día, deja de leerse a los tres días —y
            se lleva por delante a los que estaban al lado, que sí bajaban.
            Quien quiera saber cómo va su trabajo abre el menú o entra al
            tablero; nadie necesita que se lo recuerden en cada pantalla. */}
      </button>
      {abierto && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierto(false)} />
          <div className="nav-lista">
            {/* (Estas treinta y una entradas fueron el primer sitio donde se
                quitó la precarga: viven dentro de `{abierto && …}`, así que no
                existen con el menú cerrado, pero en el instante en que se abre
                entran las treinta y una en pantalla y Next las precargaba
                todas de golpe. Un menú se abre para ir a UN sitio.
                Ya no hace falta pedirlo aquí: `@/components/Enlace` no precarga
                nunca, y ahí está el porqué.) */}
            {SECCIONES.map(s => (
              <Link key={s.tipo} href={s.ruta}
                className={`nav-item${enSeccion(s) ? " on" : ""}`}
                onClick={() => setAbierto(false)}>
                <span className="nav-item-ico">{s.ico}</span>
                <span>{s.plural}</span>
                {!!alarmasPor.get(s.ruta) && (
                  <span className="nav-alarma" title="Hay una alarma encendida aquí">alarma</span>
                )}
              </Link>
            ))}
            {/* ── LOS OTROS SITIOS, EN DOS GRUPOS CON NOMBRE ──
                Con dieciocho entradas seguidas, una lista plana obliga a
                leerlas todas para encontrar una. Los rótulos no son adorno:
                dividen la búsqueda en dos y dicen de qué va cada mitad.
                · «la plata» — fondos, obligaciones, comprobantes, caja: todo
                  lo que se mira para saber si algo está al día o cuadra.
                · «el día a día» — agenda, pulso, llaves, etiquetas, casilla. */}
            {(["plata", "dia"] as const).map(g => (
              <div key={g} className="nav-grupo">
                <span className="nav-grupo-txt">{g === "plata" ? "la plata" : "el día a día"}</span>
                {destinos.filter(d => d.grupo === g).map(d => (
                  d.ruta === "/etiquetas" ? (
                    <div key={d.ruta} className="nav-etq">
                      {/* La fila es DOS cosas: el nombre lleva al índice y el ▸
                          abre la lista. Un solo control para las dos obligaría
                          a elegir cuál de los dos usos estorba. */}
                      <div className={`nav-item${estaEn(d, pathname) ? " on" : ""}`}>
                        {/* El ícono va DENTRO del enlace, como en las demás
                            entradas: si no, es la única fila del menú donde
                            apuntar al emoji no hace nada. */}
                        <Link href={d.ruta} onClick={() => setAbierto(false)}
                          className="nav-etq-txt">
                          <span className="nav-item-ico">{d.ico}</span>
                          <span>{d.txt}</span>
                        </Link>
                        {!!alarmasPor.get(d.ruta) && (
                          <span className="nav-alarma" title="Hay una alarma encendida aquí">alarma</span>
                        )}
                        <button type="button" className={`nav-etq-mas${etqAbierto ? " on" : ""}`}
                          aria-expanded={etqAbierto} aria-controls="nav-sub-etq"
                          aria-label={etqAbierto ? "Ocultar las etiquetas" : "Ver las etiquetas más usadas"}
                          title={etqAbierto ? "Ocultar las etiquetas" : "Ver las etiquetas más usadas"}
                          /* Al reabrir se OLVIDA el error: si no, un corte de
                             red de un segundo dejaba el ⚠ clavado para toda la
                             vida de la página, sin forma de reintentar. */
                          onClick={() => setEtqAbierto(v => { if (!v) setEtqErr(""); return !v; })}>▸</button>
                      </div>
                      {etqAbierto && (
                        <div className="nav-sub" id="nav-sub-etq">
                          {/* Tres estados, y los tres se dicen. Un submenú en
                              blanco mientras carga se lee como vacío — y aquí
                              «vacío» significaría «no hay etiquetas». */}
                          {etqErr && <div className="nav-sub-nota">⚠ {etqErr}</div>}
                          {!etqErr && !etqs && <div className="nav-sub-nota">cargando…</div>}
                          {!etqErr && etqs?.length === 0 && (
                            <div className="nav-sub-nota">ninguna etiqueta con casos vivos</div>
                          )}
                          {(etqs || []).map(e => (
                            <Link key={e.id} href={`/entidad/etiqueta/${e.id}`}
                              className="nav-sub-item" onClick={() => setAbierto(false)}>
                              <span className="nav-sub-txt">{e.nombre}</span>
                              {/* El número no es decoración: es lo que hace que
                                  el orden se entienda sin explicarlo. */}
                              {/* El title dice qué cuenta: el índice enseña el
                                  total con archivados y este número no, así que
                                  sin decirlo parecerían el mismo dato mal. */}
                              <span className="nav-sub-n"
                                title={`${e.n} caso(s) abierto(s) — el índice cuenta también los archivados`}>{e.n}</span>
                            </Link>
                          ))}
                          <Link href="/etiquetas" className="nav-sub-todas"
                            onClick={() => setAbierto(false)}>
                            todas, y las que nadie usa →
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                  <Link key={d.ruta} href={d.ruta}
                    className={`nav-item${estaEn(d, pathname) ? " on" : ""}`}
                    onClick={() => setAbierto(false)}>
                    <span className="nav-item-ico">{d.ico}</span>
                    <span>{d.txt}</span>
                    {/* Cada pendiente, en la entrada donde se va a atender. */}
                    {d.ruta === "/casilla" && casilla > 0 && (
                      <Burbuja n={casilla} tono="rojo"
                        txt={`${casilla} correo(s) de DAFO sin leer`} />
                    )}
                    {d.ruta === "/tablero" && casosAvisos.length > 0 && (
                      <span className="nav-burbujas">
                        {casosAvisos.map(a => (
                          <Burbuja key={a.k} n={a.n} tono={a.tono} txt={a.txt} />
                        ))}
                      </span>
                    )}
                    {d.ruta === "/fondos" && fondosAvisos.length > 0 && (
                      <span className="nav-burbujas">
                        {fondosAvisos.map(a => (
                          <Burbuja key={a.k} n={a.n} tono={a.tono} txt={a.txt} />
                        ))}
                      </span>
                    )}
                    {d.ruta === "/obligaciones" && oblAvisos.length > 0 && (
                      /* Las dos juntas y pegadas al borde derecho: `nav-item`
                         solo empuja a la PRIMERA con `margin-left:auto`, así
                         que van envueltas para viajar como un bloque. */
                      <span className="nav-burbujas">
                        {oblAvisos.map(a => (
                          <Burbuja key={a.k} n={a.n} tono={a.tono} txt={a.txt} />
                        ))}
                      </span>
                    )}
                    {/* ── LA MARCA, AL FINAL Y AL BORDE DERECHO ──
                        Estaba delante de las burbujas, razonando que una alarma
                        no es un conteo. Pero en una lista el ojo baja por UNA
                        columna, y ponerla antes la dejaba a media fila, distinta
                        en cada entrada según cuántas burbujas hubiera al lado.
                        Al final, todas las marcas caen en la misma vertical y se
                        ven de un vistazo — que es justo lo que tiene que pasar
                        con la única señal que no calculó nadie. */}
                    {!!alarmasPor.get(d.ruta) && (
                      <span className="nav-alarma" title="Hay una alarma encendida aquí">alarma</span>
                    )}
                  </Link>
                  )
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
