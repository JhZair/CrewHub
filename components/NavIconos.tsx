"use client";
import { usePathname } from "next/navigation";
import { SECCIONES } from "@/lib/secciones";
import Link from "@/components/Enlace";
import { useEffect, useState } from "react";
import type { EstadoNav } from "@/app/nav-acciones";
import { pedirZocalo } from "@/lib/zocalo";

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
function Burbuja({ n, col, txt }: { n: number; col: string; txt: string }) {
  return (
    <span title={txt} className="nav-burbuja" style={{ background: col }}>
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
    casilla: 0, caja: false, vencidos: 0, porVencer: 0, fondosEc: 0, mesesEc: 0,
  });
  useEffect(() => {
    let vivo = true;
    pedirZocalo(pathname).then(z => { if (vivo) setNav(z.nav); }).catch(() => {});
    return () => { vivo = false; };
  }, [pathname]);
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
    nav.vencidos > 0 && { k: "v", n: nav.vencidos, col: "var(--red)",
      txt: `${nav.vencidos} declaración(es) vencida(s)` },
    nav.porVencer > 0 && { k: "p", n: nav.porVencer, col: "var(--yellow)",
      txt: `${nav.porVencer} declaración(es) por vencer en los próximos días` },
  ].filter(Boolean) as { k: string; n: number; col: string; txt: string }[];

  /* ── LOS ESTADOS DE CUENTA QUE FALTAN ──
     El aviso existía solo DENTRO de la ficha del fondo, y encima dentro de una
     sub-sección plegada: para verlo había que entrar al fondo correcto y abrir
     la sección correcta, o sea sospechar antes de mirar. Lo que falta no ocupa
     sitio en la pantalla; si además hay que ir a buscarlo, no avisa de nada.
     La burbuja cuenta FONDOS —que es lo que la lista de /fondos deja contar—,
     y el título dice cuántos meses son en total. En rojo: cualquier mes que
     falte es un mes ya cerrado, o sea un papel vencido, no una tarea futura.
     Estando en /fondos no se pinta: allí cada tarjeta lo dice por su cuenta. */
  const fondosAviso = nav.fondosEc > 0
    ? { n: nav.fondosEc, col: "var(--red)",
        txt: `${nav.fondosEc} fondo(s) con estados de cuenta sin cargar · ${nav.mesesEc} mes(es) en total` }
    : null;

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
          <Burbuja n={casilla} col="var(--red)"
            txt={`${casilla} correo(s) de DAFO sin leer`} />
        )}
        {pathname !== "/obligaciones" && oblAvisos.map(a => (
          <Burbuja key={a.k} n={a.n} col={a.col} txt={a.txt} />
        ))}
        {/* En el BOTÓN no se pinta estando ya en /fondos —el pendiente está a
            la vista en cada tarjeta—, pero en la entrada del menú sí, igual que
            la casilla y las obligaciones: dentro del menú la burbuja dice a
            dónde ir, no que haya algo nuevo. */}
        {fondosAviso && pathname !== "/fondos" && (
          <Burbuja n={fondosAviso.n} col={fondosAviso.col} txt={fondosAviso.txt} />
        )}
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
                  <Link key={d.ruta} href={d.ruta}
                    className={`nav-item${estaEn(d, pathname) ? " on" : ""}`}
                    onClick={() => setAbierto(false)}>
                    <span className="nav-item-ico">{d.ico}</span>
                    <span>{d.txt}</span>
                    {/* Cada pendiente, en la entrada donde se va a atender. */}
                    {d.ruta === "/casilla" && casilla > 0 && (
                      <Burbuja n={casilla} col="var(--red)"
                        txt={`${casilla} correo(s) de DAFO sin leer`} />
                    )}
                    {d.ruta === "/fondos" && fondosAviso && (
                      <Burbuja n={fondosAviso.n} col={fondosAviso.col} txt={fondosAviso.txt} />
                    )}
                    {d.ruta === "/obligaciones" && oblAvisos.length > 0 && (
                      /* Las dos juntas y pegadas al borde derecho: `nav-item`
                         solo empuja a la PRIMERA con `margin-left:auto`, así
                         que van envueltas para viajar como un bloque. */
                      <span className="nav-burbujas">
                        {oblAvisos.map(a => (
                          <Burbuja key={a.k} n={a.n} col={a.col} txt={a.txt} />
                        ))}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
