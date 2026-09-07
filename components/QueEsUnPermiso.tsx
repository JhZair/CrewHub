import Plegable from "@/components/Plegable";
import {
  TIPOS_AUT, META_TIPO_AUT, MEDIOS, ROTULO_MEDIO,
  ROTULO_CALIDAD, CALIDADES, ROTULO_PLAZO,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ ES CADA PERMISO — la ayuda de la pantalla

   ── POR QUÉ HACÍA FALTA ──
   El desplegable ofrece once tipos y hay que elegir uno antes de saber qué
   son. La explicación de cada uno EXISTÍA —está en `META_TIPO_AUT` desde el
   primer día— pero solo se leía de dos maneras: en el `title` de una opción,
   que hay que descubrir parándose encima, y debajo del desplegable una vez ya
   elegiste. O sea, después de decidir.

   ── AQUÍ NO SE ESCRIBE NINGÚN TEXTO EXPLICATIVO ──
   ⚠ Y la primera versión de este archivo lo incumplió. Tenía una sección
   entera —«las dos reglas que más sorprenden»— redactada a mano que repetía lo
   que `ROTULO_CALIDAD` ya dice y que este mismo bloque ya pinta cuarenta líneas
   más arriba. La regla de la agrupación aparecía SIETE veces dentro del mismo
   plegable.

   Copiar un texto a la ayuda es tener la explicación en dos sitios: se corrige
   uno, el otro se queda, y entonces la ayuda enseña un modelo que ya no manda.
   Y una ayuda desactualizada es peor que ninguna, porque se cree.

   Así que lo único que se escribe aquí es lo que NO está en ningún dato: el
   marco —qué es un permiso y por qué importa— y el porqué legal, que no cabe
   en un rótulo. Todo lo demás se renderiza.

   ── Y NO PROMETE MÁS DE LO QUE EL CÓDIGO HACE ──
   ⚠ La otra cosa que la primera versión hizo mal. Decía que los medios salen
   «palabra por palabra» de la cláusula y pintaba los rótulos CORTOS, que son
   etiquetas de un selector: «televisión» no es «televisión abierta y por
   cable». La única frase que un usuario puede contrastar contra el papel que
   firmó, y no cuadraba.
   Y decía que el release de una menor firmado por ella «no cubre nada», que es
   cierto en la ficha y falso en el semáforo — donde una `firmada` no entra en
   `bloqueos` aunque su riesgo sea crítico. Una ayuda más severa que el código
   es la dirección peligrosa: se lee «esto me bloquearía» sobre algo que sale en
   verde.

   ── CERRADO POR DEFECTO ──
   Se lee dos veces —al empezar, y el día que aparece un caso raro— y luego
   estorba. Y sin el id de la película: que esté abierto o cerrado es una
   preferencia de quien lee, no de cada documental.
   ══════════════════════════════════════════════════════════════════════════ */

export default function QueEsUnPermiso() {
  return (
    <Plegable
      id="clearance:ayuda"
      abiertoPorDefecto={false}
      titulo={<span style={{ fontWeight: 600 }}>❓ Qué es cada permiso</span>}
      resumen={<span style={{ fontSize: 11.5, color: "var(--dim)" }}>
        los {TIPOS_AUT.length} tipos, y qué cubre cada uno
      </span>}>

      <div className="ayu">
        <p className="ayu-p">
          Un <b>permiso</b> es un papel firmado que dice que alguien te autoriza
          a usar algo suyo en la película: su cara, su voz, su música, su casa,
          su archivo. No es burocracia — es lo que te piden el día que la
          película entra a un festival, a una plataforma o a un fondo, y lo que
          no tienes ese día ya no se consigue: la gente se muda, cambia de
          número, o se muere.
        </p>
        <p className="ayu-p">
          Por eso esta pantalla no cuenta cuántos llevas firmados, sino{" "}
          <b>cuál te impide publicar</b>. Un solo permiso pendiente de riesgo{" "}
          <b>alto o crítico</b> deja la película fuera aunque todo lo demás esté
          hecho. Y ninguno registrado tampoco es un sí: es que no se sabe.
        </p>

        <div className="ayu-t">Los {TIPOS_AUT.length} tipos</div>
        <div className="ayu-lista">
          {TIPOS_AUT.map(t => (
            <div key={t} className="ayu-fila">
              <span className="ayu-ico">{META_TIPO_AUT[t].ico}</span>
              <span>
                <b>{META_TIPO_AUT[t].corto}</b>
                {" — "}{META_TIPO_AUT[t].largo}
              </span>
            </div>
          ))}
        </div>

        <div className="ayu-t">En qué calidad firma</div>
        <p className="ayu-p">
          Lo que más se equivoca, y lo que más caro sale: quien firma no siempre
          firma por sí mismo. La <b>firma de quien representa no cubre a los
          representados</b> — el D. Leg. 822 lo dice de los derechos conexos{" "}
          <i>del artista intérprete o ejecutante</i>, y son personales. Por eso
          la cobertura de una banda se lee «5 de 11» y no «firmado»: una firma
          no son once.
        </p>
        <div className="ayu-lista">
          {CALIDADES.map(c => (
            <div key={c} className="ayu-fila">
              <span className="ayu-ico">·</span>
              <span>
                <b>{ROTULO_CALIDAD[c].txt}</b>{" — "}{ROTULO_CALIDAD[c].cubre}
              </span>
            </div>
          ))}
        </div>

        <div className="ayu-t">Para qué medios vale</div>
        <p className="ayu-p">
          Un permiso firmado que no dice dónde se puede ver la película es un
          permiso que no se sabe si sirve para el festival al que ya te
          inscribiste. Los {MEDIOS.length} salen de la cláusula de medios del
          release que se firma:
        </p>
        <div className="ayu-lista">
          {MEDIOS.map(m => (
            <div key={m} className="ayu-fila">
              <span className="ayu-ico">·</span>
              <span><b>{ROTULO_MEDIO[m].corto}</b>{" — "}{ROTULO_MEDIO[m].largo}</span>
            </div>
          ))}
        </div>

        <div className="ayu-t">Hasta cuándo vale</div>
        <div className="ayu-lista">
          {(Object.keys(ROTULO_PLAZO) as (keyof typeof ROTULO_PLAZO)[]).map(k => (
            <div key={k} className="ayu-fila">
              <span className="ayu-ico">·</span>
              <span>{ROTULO_PLAZO[k]}</span>
            </div>
          ))}
        </div>
        <p className="ayu-p">
          Una licencia a plazo es rara, pero si la hay y se olvida, se descubre
          que caducó el día de estrenar.
        </p>

        <div className="ayu-t">Dos casillas que se descubren tarde</div>
        <div className="ayu-lista">
          <div className="ayu-fila">
            <span className="ayu-ico">·</span>
            <span>
              <b>Tráiler, afiche y miniaturas.</b> Se publican antes que la
              película, a veces años antes. Quien no lo autorizó sale en la
              lista de «no pueden aparecer en promoción», arriba en esta misma
              pantalla.
            </span>
          </div>
          <div className="ayu-fila">
            <span className="ayu-ico">·</span>
            <span>
              <b>Explotación comercial futura.</b> Sin ella hay que volver a
              firmar el día que la película se venda, cuando la gente ya no está
              localizable. ⚠ Se guarda y se enseña, pero el semáforo todavía{" "}
              <b>no</b> la vigila: que esté sin marcar no encenderá ningún
              aviso.
            </span>
          </div>
        </div>

        <p className="ayu-p ayu-pie">
          Nada de esto es asesoría legal: es cómo está organizado el registro.
          Lo que vale es lo que dice el papel que se firmó.
        </p>
      </div>
    </Plegable>
  );
}
