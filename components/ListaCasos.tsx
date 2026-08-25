"use client";
import Link from "@/components/Enlace";
import VistaRapida from "@/components/VistaRapida";
import Avatar from "@/components/Avatar";
import { icoTipo } from "@/lib/tipos";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import { plazoDe } from "@/lib/plazo";
import { CERRADOS } from "@/lib/familia";
import { ICO_ENT } from "@/lib/secciones";

/* ══════════════════════════════════════════════════════════════════════════
   LA LISTA — la tercera forma de mirar los mismos casos.

   El kanban contesta «¿cómo va cada cosa?» y la línea de tiempo «¿cuándo?».
   Ninguna de las dos contesta «enséñame TODO lo que cumple esto, en el orden
   que yo diga»: en columnas, treinta casos son treinta tarjetas repartidas en
   seis montones que hay que recorrer con la vista, y no hay forma de decir
   «por plazo» ni «por responsable».

   No es una pantalla nueva y es a propósito: los filtros —tipo, persona,
   etiqueta, proyecto, empresa, convocatoria, postulación— ya viven en el
   tablero y son lo caro de construir y de mantener. Una pantalla aparte
   tendría que copiarlos, y dos copias de siete filtros divergen en un mes.
   Aquí solo cambia CÓMO se dibuja lo que esos filtros ya eligieron.

   El orden se elige y se ve. Sin decir por qué está ordenada, una tabla
   parece arbitraria y nadie confía en la primera fila — que es justo la que
   uno viene a leer.
   ══════════════════════════════════════════════════════════════════════════ */

type Caso = {
  id: string; titulo: string; tipo?: string; estado: string;
  fecha_limite?: string | null; hora?: string | null; creado_en?: string;
  responsable?: string | null;
  resp?: { nombre?: string | null; color?: string | null; avatar_url?: string | null } | null;
  nc?: number; sub?: number;
  vinc?: { tipo: string; nombre: string }[];
  /** 📤 lo pedí yo y lo hace otro · 👁 solo me menciona. Lo calcula el
   *  tablero; la lista lo pinta igual que el kanban o las dos vistas se
   *  contradicen sobre lo mismo. */
  marca?: "delegado" | "mencion" | null;
};

type Orden = "plazo" | "estado" | "responsable" | "reciente";

const ORDENES: [Orden, string][] = [
  ["plazo", "⏳ Plazo"],
  ["estado", "🚦 Estado"],
  ["responsable", "🙋 Responsable"],
  ["reciente", "🆕 Reciente"],
];

export default function ListaCasos({ casos, ordenEstados, orden, hrefOrden }: {
  casos: Caso[];
  /** Los estados en el orden del KANBAN. Ordenar la lista con el mismo
   *  criterio que las columnas no es un detalle: si aquí «En pausa» fuera
   *  antes que «En progreso» y allá al revés, serían dos tableros distintos
   *  con los mismos datos. */
  ordenEstados: string[];
  /** El orden elegido, que viene de la URL. Era estado local y se perdía al
   *  tocar cualquier filtro —un filtro es una navegación, el componente se
   *  remonta y volvía a «Plazo» sin decir nada—. Es el mismo bicho que el
   *  tablero ya había arreglado con `modo`, un nivel más abajo. Y así «la
   *  lista por responsable» se puede compartir en un enlace. */
  orden: Orden;
  /** La URL de cada orden, armada por el tablero con `urlCon`: conserva los
   *  siete filtros y la vista. */
  hrefOrden: (o: Orden) => string;
}) {

  const rangoEstado = (e: string) => {
    const i = ordenEstados.indexOf(e);
    return i < 0 ? ordenEstados.length : i;
  };
  /* UN solo predicado para «¿tiene responsable?». Agrupar por `resp.nombre` y
     pintar por `responsable` se contradicen cuando el perfil no resuelve —una
     cuenta borrada, el bot—: la fila caía en el grupo «sin asignar» y a la vez
     enseñaba una cara. */
  const nombreResp = (c: Caso) => (c.resp?.nombre || "").toLowerCase();
  const sinDueno = (c: Caso) => !c.resp?.nombre;

  /* ── LO QUE NO SE SABE VA AL FINAL, NUNCA AL PRINCIPIO ──
     Un caso sin fecha no es «el más urgente» ni «el menos»: no se sabe. Con
     el `""` de una fecha vacía, el orden ascendente lo pone PRIMERO y la
     lista abre con lo que no tiene plazo — enseñando a ignorar la cabecera.
     El centinela `~` va después de cualquier dígito en orden de texto.
     Ojo con el responsable: ahí el vacío SÍ va primero, y es lo contrario a
     propósito — «sin asignar» es lo que nadie está mirando. */
  /* La clave del orden tiene que ser la que se PINTA. Con la fecha en crudo,
     una tarea resuelta en marzo de 2024 ganaba a todo lo vivo y abría la lista
     —enseñando «sin fecha», porque `plazoDe` calla en los cerrados—: ordenada
     por un dato invisible. Un caso cerrado no vence: va al final. */
  const clavePlazo = (c: Caso) =>
    CERRADOS.includes(c.estado) ? "~" : (c.fecha_limite || "~");

  const cmp = (a: Caso, b: Caso): number => {
    if (orden === "plazo") {
      const x = clavePlazo(a), y = clavePlazo(b);
      if (x !== y) return x < y ? -1 : 1;
      // Mismo día: manda la hora (una reunión de las 9 antes que la de las 5).
      const hx = a.hora || "~", hy = b.hora || "~";
      if (hx !== hy) return hx < hy ? -1 : 1;
    }
    if (orden === "estado") {
      const x = rangoEstado(a.estado), y = rangoEstado(b.estado);
      if (x !== y) return x - y;
    }
    if (orden === "responsable") {
      const x = nombreResp(a), y = nombreResp(b);
      if (x !== y) return x < y ? -1 : 1;
    }
    /* Desempate y orden por defecto de «Reciente»: lo último escrito arriba.
       Devuelve 0 en el empate: un comparador que nunca dice «iguales» deja el
       resultado sin definir —cmp(a,b) y cmp(b,a) valían los dos 1— y pierde la
       estabilidad que el propio `sort` garantiza. */
    const ca = a.creado_en || "", cb = b.creado_en || "";
    return ca === cb ? 0 : (cb < ca ? -1 : 1);
  };

  const filas = [...casos].sort(cmp);

  return (
    <div className="card">
      <div className="lc-cab">
        <span className="lc-cab-txt">Ordenar por</span>
        {ORDENES.map(([val, lbl]) => (
          <Link key={val} href={hrefOrden(val)} className={`vtab ${orden === val ? "on" : ""}`}>{lbl}</Link>
        ))}
      </div>

      {!filas.length && <div className="empty" style={{ padding: "18px 0" }}>Nada con estos filtros.</div>}

      <div className="lc-lista">
        {filas.map(c => {
          const pl = plazoDe(c.fecha_limite, c.estado);
          const cerrado = CERRADOS.includes(c.estado);
          return (
            <div key={c.id} className="lc-fila">
              {/* Trabajar sin salir: el mismo ⚡ del kanban y de la agenda. En
                  una lista de treinta filas es la diferencia entre revisar y
                  abrir treinta pestañas. */}
              <VistaRapida pubId={c.id} />
              <Link href={`/caso/${c.id}`} className="lc-tit" title={c.titulo}>
                {icoTipo(c.tipo || "")} {c.titulo}
              </Link>
              {/* Los vínculos: de qué va. Dos como mucho — el resto está en la
                  ficha, y una lista que se ensancha con los chips deja de
                  poder leerse en columna. */}
              <span className="lc-vinc">
                {(c.vinc || []).slice(0, 2).map((v, i) => (
                  <span key={i} className="lc-chip" title={v.nombre}>
                    {ICO_ENT[v.tipo] || "🔗"} {v.nombre}
                  </span>
                ))}
              </span>
              {/* Las MISMAS marcas del kanban: 📤 lo pedí y lo hace otro, 👁 solo
                  me mencionan. La lista se abre casi siempre en «Mis asuntos»
                  —es el default del tablero—, o sea justo donde distinguir «es
                  mío» de «me incumbe» es la mitad del sentido. Sin ellas, las
                  dos vistas se contradicen sobre lo mismo. */}
              {c.marca === "delegado" && <span className="lc-marca" title="Lo pediste tú; lo hace otra persona">📤</span>}
              {c.marca === "mencion" && <span className="lc-marca" title="Te menciona; no es tuyo">👁</span>}
              {!!c.sub && <span className="lc-nc" title={`${c.sub} sub-caso(s)`}>🧩 {c.sub}</span>}
              {!!c.nc && <span className="lc-nc" title={`${c.nc} comentario(s)`}>💬 {c.nc}</span>}
              {/* Sin responsable se DICE, no se deja en blanco: un hueco se lee
                  como «no cargó» y esto es justo lo que se viene a cazar. */}
              <span className="lc-resp" title={c.resp?.nombre || "Sin asignar"}>
                {sinDueno(c)
                  ? <span className="lc-nadie" title="Sin asignar">sin asignar</span>
                  : <Avatar size={20} nombre={c.resp?.nombre} src={c.resp?.avatar_url} color={c.resp?.color} />}
              </span>
              <span className={`pill st-${claseEstado(c.estado, c.tipo)} lc-est`}>
                {rotuloEstado(c.estado, c.tipo)}
              </span>
              {/* El plazo con su color, el mismo de todo el sistema (lib/plazo),
                  pero en forma CORTA: «⏱ VENCIDO hace 129 días» no cabe en una
                  columna que existe para escanearse de arriba abajo, y al
                  envolver rompe justo eso.
                  Un caso CERRADO no dice nada: no vence. Decirle «sin fecha»
                  sería falso —la tenía— y es lo que hacen bien el kanban y la
                  línea de tiempo: callar. «Sin fecha» se reserva para lo vivo
                  que de verdad no tiene plazo, que sí es un hallazgo. */}
              <span className="lc-plazo" style={pl ? { color: pl.color } : undefined}>
                {pl
                  ? <>{pl.vencido ? `⏱ venc. ${-pl.d}d` : pl.d === 0 ? "⏱ HOY" : `⏱ ${pl.d}d`}
                      {c.hora && <b className="lc-hora"> {String(c.hora).slice(0, 5)}</b>}</>
                  : cerrado ? null
                  : <span className="lc-nadie">sin fecha</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
