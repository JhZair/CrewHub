import Plegable from "@/components/Plegable";
import {
  NIVELES, META_ESTADO_TRAT, META_FALTA, ORDEN_FALTA, ESTADOS_TRAT,
  TIPOS_CON_GUION, nivelDestino, metaNivel,
} from "@/lib/tratamiento";

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ ES CADA NIVEL — la ayuda de ✍ guion

   ── POR QUÉ HACÍA FALTA ──
   Al crear un documento hay que elegir un nivel entre tres antes de saber qué
   significan, igual que pasaba con los once tipos de permiso en ⚖ clearance.
   Y hay una regla del oficio que el sistema aplica en silencio: el destino de
   un documental NO es el mismo que el de una ficción. Quien no la sepa lee
   «no llegó al guion» en una ficción y no entiende por qué el documental de al
   lado, con el mismo nivel, sale al día.

   ── AQUÍ NO SE ESCRIBE NINGÚN TEXTO QUE YA EXISTA COMO DATO ──
   Los tres niveles salen de `NIVELES`, los tres estados de `META_ESTADO_TRAT`
   y los cinco diagnósticos de `META_FALTA`, con su color. Copiarlos aquí sería
   tener la explicación en dos sitios: se corrige uno, el otro se queda, y una
   ayuda desactualizada es peor que ninguna porque se cree.
   Es la lección de `components/QueEsUnPermiso.tsx`, cuya primera versión
   prometía cosas que el código no hacía.

   Lo único escrito a mano es lo que NO está en ningún dato: por qué el destino
   depende del tipo de película.

   ── CERRADO POR DEFECTO, Y SIN EL ID DE LA PELÍCULA ──
   Se lee dos veces y luego estorba. Y que esté abierto o cerrado es una
   preferencia de quien lee, no de cada documental.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ El orden de gravedad NO se escribe aquí: es `ORDEN_FALTA`, el mismo que
   ordena el índice. La primera versión lo copiaba —una lista idéntica, en otro
   archivo— y eso es exactamente lo que este comentario de arriba prohíbe: el
   día que se reordene una, la ayuda enseñaría una prioridad que ya no manda. */

export default function QueEsUnTratamiento() {
  return (
    <Plegable
      id="guion:ayuda"
      abiertoPorDefecto={false}
      titulo={<span style={{ fontWeight: 600 }}>❓ Qué es cada nivel</span>}
      resumen={<span style={{ fontSize: 11.5, color: "var(--dim)" }}>
        los {NIVELES.length} niveles, y hasta dónde tiene que llegar cada película
      </span>}>

      <div className="ayu">
        <p className="ayu-p">
          Una película no tiene «un guion»: tiene una <b>pila de documentos</b>{" "}
          que se van escribiendo encima. El que se presentó al concurso, el
          reescrito con las notas del jurado, el que se usa para rodar. Por eso
          aquí cada uno es una fila con su versión, y solo uno está marcado
          como el que <b>manda hoy</b>.
        </p>

        <div className="ayu-t">Los {NIVELES.length} niveles</div>
        <p className="ayu-p">
          Van en escala: cada uno se escribe <b>sobre</b> el anterior, no en vez
          de él.
        </p>
        <div className="ayu-lista">
          {NIVELES.map(n => (
            <div key={n.k} className="ayu-fila">
              <span className="ayu-ico">{n.ico}</span>
              <span><b>{n.txt}</b>{" — "}{n.que}</span>
            </div>
          ))}
        </div>

        <div className="ayu-t">Hasta dónde tiene que llegar</div>
        <p className="ayu-p">
          Lo decide el <b>tipo de película</b>, y es la regla que más
          desconcierta: donde el destino es el <b>tratamiento secuenciado</b>,
          no se escribe el guion de lo que la gente va a decir delante de la
          cámara — el secuenciado es el final del camino, no un paso
          intermedio. Por eso dos películas con el mismo nivel pueden salir una
          al día y la otra corta: no es que a una se le exija menos, es que ya
          terminó.
        </p>
        {/* ⚠ La lista sale de `TIPOS_CON_GUION` + `nivelDestino`, y esto era un
            fallo. El texto decía «en documental el secuenciado, en ficción y
            animación el guion» — y son CINCO los tipos: a `experimental`
            también se le exige el guion, y `cobertura` para en el secuenciado
            igual que un documental. Dos de los cinco no estaban nombrados, y a
            uno se le enseñaba la regla de otro. */}
        <div className="ayu-lista">
          {TIPOS_CON_GUION.map(t => (
            <div key={t} className="ayu-fila">
              <span className="ayu-ico">{metaNivel(nivelDestino(t)).ico}</span>
              <span>
                <b>{t}</b>{" — "}{metaNivel(nivelDestino(t)).txt.toLowerCase()}
              </span>
            </div>
          ))}
        </div>

        <div className="ayu-t">En qué estado está cada documento</div>
        <div className="ayu-lista">
          {ESTADOS_TRAT.map(e => (
            <div key={e} className="ayu-fila">
              <span className="ayu-ico" style={{ color: META_ESTADO_TRAT[e].col }}>
                {META_ESTADO_TRAT[e].ico}
              </span>
              <span><b>{META_ESTADO_TRAT[e].txt}</b></span>
            </div>
          ))}
        </div>
        <p className="ayu-p">
          Un <b>descartado</b> no se borra y no cuenta para nada: no suma al
          recuento de documentos ni evita que la película salga «sin
          tratamiento». Se guarda porque un documento abandonado sigue
          explicando por dónde pasó la película.
        </p>

        <div className="ayu-t">Y qué dice cada diagnóstico</div>
        <p className="ayu-p">
          De más grave a menos. Cada película dice <b>una sola cosa</b> —la
          peor— porque una fila con tres avisos no se lee, se ignora.
        </p>
        <div className="ayu-lista">
          {ORDEN_FALTA.map(k => (
            <div key={k} className="ayu-fila">
              <span className="ayu-ico" style={{ color: META_FALTA[k].col }}>●</span>
              <span>
                <b style={{ color: META_FALTA[k].col }}>{META_FALTA[k].txt}</b>
                {" — "}{META_FALTA[k].ayuda}
              </span>
            </div>
          ))}
        </div>

        <p className="ayu-p ayu-pie">
          El gris no quiere decir «no es un fallo»: quiere decir que es el
          estado normal de algo que se está escribiendo, y que encenderlo en
          rojo pondría a medio catálogo en alerta permanente. Que un documento
          esté solo enlazado es lo normal mientras vive en Drive; que una
          película no haya llegado todavía a su destino, también. Los dos
          siguen contándose arriba, con su número.
        </p>
      </div>
    </Plegable>
  );
}
