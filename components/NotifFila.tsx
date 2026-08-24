import { ICONO, ETIQ, hace, tituloDe, destinoDe, actoresTexto } from "@/lib/notificaciones";
import { ICO_ENT } from "@/lib/secciones";

/* El interior de una fila de notificación: ícono + título + quién/cuándo +
   chips de vínculo. Lo pintaban IGUAL las dos campanitas (feed y flotante), y
   al nacer la página /notificaciones iba a ser la tercera copia del mismo
   bloque — justo el patrón que cría los bichos de este sistema. Vive aquí.
   Es solo el CONTENIDO; el envoltorio (Link o div, clases) lo pone cada sitio,
   porque ahí sí difieren. */
/* Nombre corto del actor: solo el primer nombre. La campanita es una lista para
   barrer con el ojo —"Michel Sandro Oros comentó" ocupa toda la fila y empuja la
   hora fuera—, y con el equipo de 6 el primer nombre basta para saber quién. */
const corto = (s?: string) => (s || "").trim().split(/\s+/)[0] || "";

/* `cuenta` y `actores` llegan cuando la fila representa un grupo (ver
   agruparNotifs). Sin ellos se pinta exactamente como antes: la página
   /notificaciones sigue siendo el historial completo, una fila por evento.

   `onMarcar` es opcional y trae el ✓. El botón vive AQUÍ y no en cada
   envoltorio por lo mismo que el resto de la fila: los tres sitios que pintan
   notificaciones lo querrían igual, y tres copias de un botón son tres sitios
   donde se olvida el `preventDefault`. Cada pantalla decide a QUÉ marca —la
   campanita al grupo entero del caso, la página a esta fila— pasando su propia
   función; lo que no decide es cómo se ve ni cómo se comporta. */
export default function NotifFila({ n, cuenta = 1, actores, onMarcar }: {
  n: any; cuenta?: number; actores?: string[]; onMarcar?: () => void;
}) {
  const nombres = cuenta > 1 && actores?.length ? actoresTexto(actores) : corto(n.actor_nombre);
  /* A QUÉ CAMBIÓ. «Michel cambió el estado» obliga a abrir el caso para saber
     lo único que el aviso venía a contar, y el dato ya venía en el mensaje.
     Solo los tres tipos de cambio lo tienen; ver `destinoDe`. */
  const destino = destinoDe(n);
  /* ── UNA AUSENCIA NO ES UN DESTINO ──
     Quitarle el responsable a un caso daba «Michel cambió el responsable: sin
     responsable»: el sustantivo dos veces, y la segunda diciendo lo contrario
     de la primera. El verbo de `ETIQ` supone que detrás viene un valor nuevo, y
     aquí lo que viene es que no hay ninguno. Así que la ausencia SUSTITUYE al
     verbo en vez de seguirlo —«Michel lo dejó sin responsable»— y sin los dos
     puntos, que anuncian un valor. */
  const esAusencia = /^sin\s/i.test(destino);
  const quien = [nombres, esAusencia ? "lo dejó" : ETIQ[n.tipo]].filter(Boolean).join(" ");
  /* El ✓ de una fila agrupada despacha TODO el grupo, y eso hay que decirlo
     antes de pulsar: en un caso con doce comentarios, «marcar como leída» en
     singular sería mentira sobre once de ellos. */
  const rotuloVisto = cuenta > 1
    ? `Marcar como leídas las ${cuenta} de este caso, sin abrirlas`
    : "Marcar como leída, sin abrirla";
  return (
    <>
      {onMarcar && (
        /* ⚠ `preventDefault` ANTES que nada: esta fila suele ser un <Link>, y
           sin él marcar como leída te llevaría al caso — que es justo lo que
           este botón existe para evitar. `stopPropagation` es para el otro
           envoltorio, el <div> con onClick. Hacen falta los dos.
           `type="button"` porque un <button> sin tipo es `submit`: hoy no hay
           formulario alrededor, pero el día que lo haya, este ✓ lo enviaría.
           `aria-label` porque el nombre accesible sale del contenido, y «✓» no
           le dice nada a quien navega escuchando. */
        <button type="button" className="nf-visto"
          title={rotuloVisto} aria-label={rotuloVisto}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onMarcar(); }}>✓</button>
      )}
      <div className="camp-tt">{ICONO[n.tipo] || "•"} {tituloDe(n.mensaje)}</div>
      <div className="cuando">
        <span>
          {quien}
          {destino && <>{esAusencia ? " " : ": "}<b className="nf-dest">{destino}</b></>}
          {quien ? " · " : ""}{hace(n.creado_en)}
        </span>
        {cuenta > 1 && (
          <span title={`${cuenta} en este caso`} style={{
            fontSize: 10, fontWeight: 800, borderRadius: 7, padding: "1px 6px",
            background: "rgba(124,92,255,.18)", color: "var(--violet)",
          }}>{cuenta}</span>
        )}
        {(n.vinculos || []).slice(0, 3).map((v: any, i: number) => (
          <span key={i} className="camp-vinc">{ICO_ENT[v.tipo] || "🔗"} {v.nombre}</span>
        ))}
      </div>
    </>
  );
}
