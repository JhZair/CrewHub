"use client";
import { useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   UN <input type="date"> NO SE GUARDA AL CAMBIAR

   ── EL FALLO, TAL COMO APARECIÓ ──
   Un caso tenía la fecha límite en el 3 de agosto. Alguien la movió al 12 de
   septiembre, un solo gesto, y en la bitácora salieron DOS renglones al mismo
   minuto:

       JohnO · puso la fecha límite en 3 set.
       JohnO · puso la fecha límite en 12 set.

   El 3 de septiembre no lo eligió nadie. Es lo que valía el campo un instante
   después de cambiar el MES y antes de cambiar el DÍA: 03/08 → 03/09 → 12/09.

   Un campo de fecha tiene tres casillas —día, mes, año— y el navegador emite
   `change` cada vez que las tres juntas forman una fecha válida. Editar una
   fecha que ya existe produce, por tanto, un cambio válido por cada casilla
   que se toca. Guardar en `change` es guardar los pasos intermedios.

   ── Y NO ERA SOLO RUIDO EN LA BITÁCORA ──
   ⚠ Esto es lo grave. Mientras se edita, una casilla a medias deja el campo
   VACÍO — y vacío, para `cambiarFechaLimite`, significa «quitar el plazo», que
   además se lleva por delante la fecha de inicio y la hora. En la misma
   bitácora está la prueba, dos renglones del mismo minuto:

       WilfredoP · quitó la fecha límite
       WilfredoP · puso la fecha límite en 3 ago.

   Nadie quitó nada: estaba escribiendo.

   ── LA REGLA: SE GUARDA AL SALIR DEL CAMPO ──
   Mientras el campo tiene el foco, lo que hay dentro es un borrador. Al
   soltarlo —tabular, clicar fuera, cerrar el panel— es cuando se guarda, una
   sola vez, con el valor entero. Lo que hubo en medio no ocurrió.
   `HoraSelect` ya había llegado a esta misma conclusión con la hora, y lo dejó
   escrito en su comentario; ahora es la regla de los tres campos.

   ── ⚠ AQUÍ HUBO UN TEMPORIZADOR, Y ERA PEOR QUE EL FALLO ──
   La primera versión guardaba 900 ms después de la última tecla. Compilaba,
   pasaba los linters y una simulación del tiempo decía que estaba bien. Una
   revisión escéptica encontró que rompía cuatro cosas:

     · En `FechaMini` el campo está oculto y se abre con `showPicker()`, que no
       da el foco: sin foco no hay `blur`, así que el temporizador era el ÚNICO
       camino de guardado — y el desmontaje lo cancelaba. Elegir un día y clicar
       el título del sub-caso perdía la fecha en silencio.
     · El `window.confirm` de borrar saltaba desde el temporizador, o sea ~900
       ms DESPUÉS de haber cerrado el pop-up, sobre un caso que ya no estaba en
       pantalla.
     · Comparaba contra la prop del servidor, que tarda en refrescarse: volver
       atrás sobre un cambio recién hecho se descartaba por «no ha cambiado».
     · Y esos 900 ms de silencio contradicen lo que `SubCasos` tiene escrito
       sobre por qué la fila pinta el valor nuevo antes de que llegue: «la
       sensación de que el clic no entró; la mitad de la gente lo pulsa otra
       vez».

   Sin temporizador no existe ninguno de los cuatro. Lo que queda son eventos
   del usuario —salir del campo— y una salida explícita para cuando no hay
   ninguno (`soltarYa`, que usa el pop-up al cerrarse).

   ── POR QUÉ VIVE EN `lib/` Y NO EN CADA CAMPO ──
   El mismo campo está en la ficha del caso, en el pop-up de la agenda, en la
   fila de un sub-caso, en el cronograma y en las obligaciones, y los cinco lo
   hacían igual de mal. Arreglar uno es que dentro de un mes vuelva a aparecer
   un «3 de septiembre» en otra pantalla.
   ══════════════════════════════════════════════════════════════════════════ */

export function useFechaDiferida(
  /** Lo que dice el servidor. Manda mientras no se esté editando. */
  valor: string | null,
  /** ⚠ Tiene que DEVOLVER lo que devuelva la acción (`{ error }` o nada). Sin
   *  eso el campo no puede saber si se guardó — y la primera versión de esto
   *  no lo pedía: daba el valor por bueno nada más mandarlo, así que un
   *  rechazo del servidor («el inicio no puede ir después del vencimiento»)
   *  dejaba el campo enseñando una fecha que la base no tenía, para siempre y
   *  sin manera de reintentar, porque volver a mandarla se descartaba por «no
   *  ha cambiado». Cuatro de estos cinco campos estaban atados a la prop y se
   *  corregían solos; el arreglo les quitó esa red y hubo que devolvérsela. */
  guardar: (v: string) => any,
  opciones?: {
    /** Qué se pierde si el campo se deja vacío. Con texto, se pregunta antes.
     *  ⚠ Se pasa SIEMPRE que vaciar tenga consecuencias, y vaciar sin querer
     *  es justo lo que produce una casilla a medias. */
    avisoAlBorrar?: string;
  },
) {
  /* ⚠ Texto propio, y es imprescindible: los campos eran `value={…}` atados al
     servidor, y sin copia local cada tecla se repintaría con el valor viejo
     —porque todavía no se ha guardado— y el campo sería imposible de escribir. */
  const [txt, setTxt] = useState(valor || "");
  /** Lo último que se MANDÓ, que no es lo mismo que lo que el servidor ya
   *  confirmó: entre las dos cosas hay un viaje. Comparar contra la prop hacía
   *  que deshacer un cambio recién hecho se descartara por «no ha cambiado». */
  const enviado = useRef(valor || "");
  /** Con el foco dentro, lo de fuera no pisa lo que se está escribiendo: un
   *  refresco ajeno —otro que edita, una recarga del pop-up— repintaba el
   *  campo encima de la fecha a medio teclear. */
  const editando = useRef(false);

  /* Con el foco dentro no se toca NADA de fuera: ni el texto ni `enviado`. La
     primera versión protegía solo el texto, y `enviado` se movía igual — un
     refresco a media escritura podía dejar el campo creyendo que ya había
     mandado lo que la persona estaba escribiendo. */
  useEffect(() => {
    if (editando.current) return;
    enviado.current = valor || "";
    setTxt(valor || "");
  }, [valor]);

  const soltar = async (v: string, preguntar = true) => {
    /* Guardar lo mismo que ya hay no es un hecho: no toca la base, no escribe
       bitácora y no suena. La acción también lo comprueba; aquí se ahorra
       además el viaje. */
    if (v === enviado.current) return;
    if (!v && enviado.current) {
      /* Vaciar sin querer es el fallo original. Se pregunta… salvo cuando el
         campo se suelta porque se está CERRANDO el panel: eso no es el gesto
         de borrar, y un `confirm` encima de algo que se va no se lee, se
         acepta. Ahí el borrador simplemente se descarta. */
      if (!preguntar) { setTxt(enviado.current); return; }
      if (opciones?.avisoAlBorrar && !window.confirm(opciones.avisoAlBorrar)) {
        setTxt(enviado.current);   // se deshace: el campo vuelve a la verdad
        return;
      }
    }
    const previo = enviado.current;
    enviado.current = v;
    let res: any;
    try { res = await guardar(v); } catch { res = { error: "no se pudo guardar" }; }
    /* ⚠ Y si no se guardó, el campo vuelve a la verdad. Un campo que enseña
       algo que la base no tiene es peor que uno que se corrige solo: se da por
       hecho el cambio, y el reintento —volver a escribir lo mismo— tampoco
       haría nada. */
    if (res?.error) { enviado.current = previo; setTxt(previo); }
  };

  return {
    /** Va en `value`. Y en lo que se PINTE del campo: si un botón enseña la
     *  fecha, tiene que enseñar esta y no la del servidor, o el gesto no se ve
     *  hasta que vuelve el viaje. */
    valor: txt,
    /** Va en `onFocus`. */
    alEntrar: () => { editando.current = true; },
    /** Va en `onChange`. Solo apunta: no guarda nada. */
    alTeclear: (v: string) => setTxt(v),
    /** Va en `onBlur`. Salir del campo es haber terminado. */
    alSalir: (v: string) => { editando.current = false; return soltar(v); },
    /** Va en `onKeyDown`. Enter guarda, como en el resto de la aplicación
     *  —el comentario se envía con Enter, el sub-caso se crea con Enter—.
     *  Se hace soltando el foco, que es lo que ya guarda: una segunda puerta
     *  al mismo sitio, no una regla nueva. */
    alTecla: (e: { key: string; currentTarget: HTMLInputElement }) => {
      if (e.key === "Enter") e.currentTarget.blur();
    },
    /** Para cuando NO va a haber `blur`: un pop-up que se cierra desde el
     *  `mousedown` del fondo se lleva el foco por delante. Quien cierra a mano
     *  llama a esto antes. */
    soltarYa: () => { editando.current = false; return soltar(txt, false); },
  };
}

/** El aviso de las dos fechas del caso, escrito una vez. Quitar el
 *  vencimiento se lleva el inicio y la hora — lo hace `cambiarFechaLimite`, y
 *  quien lo va a sufrir tiene que enterarse antes, no en la bitácora. */
export const AVISO_BORRAR_PLAZO =
  "¿Quitar la fecha límite? Con ella se van también la fecha de inicio y la "
  + "hora del caso.";
