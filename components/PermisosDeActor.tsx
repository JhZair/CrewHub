import Link from "@/components/Enlace";
import {
  META_TIPO_AUT, ROTULO_ESTADO_AUT, ROTULO_CALIDAD, COLOR_RIESGO, permisoResuelto,
  type FilaAutorizacion, type TipoAutorizacion,
  type EstadoAutorizacion, type CalidadFirmante, type NivelRiesgo,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ TIENE FIRMADO ESTA PERSONA — solo lectura

   ⚠ POR QUÉ ESTE COMPONENTE NO TIENE FORMULARIO, Y ES LO IMPORTANTE.

   Aquí había un panel que registraba cesiones. Escribía en `proyecto_cesion`,
   que la migración del clearance dejó OBSOLETA y copió entera a `autorizacion`.
   Durante un día el sistema tuvo DOS sitios donde registrar el mismo papel, en
   dos tablas distintas:

     · lo que se apuntaba en la ficha del proyecto no salía en el semáforo
     · lo que se apuntaba en ⚖ clearance no salía en la ficha

   Y ninguno de los dos avisaba del otro. Es exactamente la clase de fallo que
   todo el módulo de clearance existe para impedir —dos sitios diciendo cosas
   distintas sobre la misma firma— cometido por dejar viva la pantalla vieja.

   Así que la ficha del proyecto ENSEÑA y ENLAZA, y no escribe. Un solo sitio
   donde se registra; muchos donde se consulta. Es la única forma de que no
   vuelvan a divergir.

   ── SIN `use client`, PERO ES CLIENTE ──
   Y conviene saberlo. Su único consumidor, `components/ActoresProyecto.tsx`,
   empieza con `"use client"`, y un módulo importado desde uno cliente ES
   cliente: esto viaja al navegador aunque aquí no ponga nada. La versión
   anterior de este comentario juraba lo contrario, que es peor que no tener
   comentario — un mapa falso.
   Lo que sí se cumple, y es lo que importa: no cruza NINGUNA función ni ningún
   `Map`. `riesgos` llega como `Record<string, string>` a propósito, porque un
   closure serializado revienta en runtime sin que tsc diga nada. Eso ya nos
   costó una tarde.
   ══════════════════════════════════════════════════════════════════════════ */

export default function PermisosDeActor({
  proyectoId, autorizaciones, riesgos,
}: {
  /** Para llevar al clearance DE ESTA PELÍCULA y no a la lista de todas: el
   *  enlace existe para acortar el camino, y aterrizar en el índice obliga a
   *  buscar de nuevo la película que ya se estaba mirando. */
  proyectoId: string;
  /** SOLO las de esta persona, ya repartidas en el servidor. */
  autorizaciones: FilaAutorizacion[];
  /** El riesgo de cada una, ya calculado por quien llama.
   *  ⚠ Un `Record` de cadenas y no una función: esto se compila al bundle del
   *  navegador, y un closure cruzando esa frontera revienta en runtime sin que
   *  tsc lo vea. */
  riesgos?: Record<string, NivelRiesgo>;
}) {
  /* La de imagen es la que toda persona del reparto necesita: se la va a
     grabar. Su ausencia es un dato, no un hueco, así que se pinta igual. */
  const imagen = autorizaciones.find(a => a.tipo === "imagen_voz_testimonio");
  const otras = autorizaciones.filter(a => a.tipo !== "imagen_voz_testimonio");

  const fila = (a: FilaAutorizacion) => {
    const t = a.tipo as TipoAutorizacion;
    const e = a.estado as EstadoAutorizacion;
    const cal = a.calidad_firmante as CalidadFirmante;
    const r = riesgos?.[a.id];
    /* ⚠ `permisoResuelto` de lib/clearance, no la regla escrita aquí. Era una
       de TRES copias a mano en tres pantallas, y ninguna contaba `no_aplica`:
       un permiso bien marcado «no aplica» —una decisión analizada, con su nota
       obligatoria— salía en ámbar para siempre y ningún clic lo apagaba. */
    const bien = permisoResuelto(a, r);
    return (
      <div key={a.id} className="cesl-fila" style={{ cursor: "default" }}>
        <span className="cesl-ico">{META_TIPO_AUT[t]?.ico || "📄"}</span>
        <span className="cesl-que">{META_TIPO_AUT[t]?.corto || a.tipo}</span>
        <span className="cesl-est" style={{
          color: bien ? "var(--green)" : r ? COLOR_RIESGO[r] : "var(--yellow)",
        }}>
          {e === "firmada" && !a.documento_id
            ? "firmada, falta el documento"
            : ROTULO_ESTADO_AUT[e] || String(a.estado)}
        </span>
        {/* La calidad, siempre que no sea `titular`: es lo que distingue
            «firmó por sí misma» de «firmó por otros», y es la diferencia
            entera de este modelo. */}
        {cal && cal !== "titular" && (
          <span className="clr-cal" title={ROTULO_CALIDAD[cal]?.cubre}>
            {ROTULO_CALIDAD[cal]?.txt}
          </span>
        )}
        {a.firmado_el && <span className="cesl-fecha">{a.firmado_el}</span>}
        {a.documento_id && <span className="cesl-doc">📎</span>}
      </div>
    );
  };

  return (
    <div className="cesl">
      {imagen ? fila(imagen) : (
        <div className="cesl-fila cesl-falta" style={{ cursor: "default" }}>
          <span className="cesl-ico">{META_TIPO_AUT.imagen_voz_testimonio.ico}</span>
          <span className="cesl-que">{META_TIPO_AUT.imagen_voz_testimonio.corto}</span>
          <span className="cesl-est">sin registrar</span>
        </div>
      )}
      {otras.map(fila)}

      {/* ── EL ÚNICO SITIO DONDE SE REGISTRA ──
          Un enlace y no un botón: llevar a la pantalla que escribe es lo que
          garantiza que solo haya una que escriba. */}
      <Link href={`/clearance/${proyectoId}`} className="cesl-mas"
        title="Los permisos se registran en un solo sitio, para que la ficha y el semáforo no puedan decir cosas distintas.">
        registrar o cambiar en ⚖ clearance →
      </Link>
    </div>
  );
}
