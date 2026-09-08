"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VisorFotos from "@/components/VisorFotos";
import { agregarFotos, ponerPieFoto, quitarFoto, moverFoto, guardarImagenEntidad, guardarFotoPersona } from "@/app/actions";
import { subirImagen } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS, type MedidaImagen } from "@/lib/prepararImagen";
import { ATRIBUTO, meToca } from "@/lib/destinoPaste";

/* ══════════════════════════════════════════════════════════════════════════
   📷 LA GALERÍA DE UNA COSA

   El cartel de 84×84 sirve para reconocer un equipo en una lista de
   trescientos, y para nada más. Lo que hace falta saber de un «Soporte De
   Pecho Para Cámara» no cabe ahí: cómo se monta, qué trae en la caja, dónde
   está el número de serie, cuál de los dos cables es el bueno.

   ── UNA TIRA, NO UNA PESTAÑA ──
   Va debajo de la cabecera y se ve sin buscarla. Una pestaña más que hay que
   saber que existe es una pestaña que nadie abre — y estas fotos las mira
   quien está delante del equipo con una duda, no quien viene a explorar.

   ── EL PIE DE FOTO ES LA MITAD DEL ASUNTO ──
   Doce fotos parecidas de un arnés negro no informan de nada. «Así va montado»
   sí. Por eso el pie se edita EN el visor, mirando la foto: escribirlo desde
   una miniatura de 56 px es escribir a ciegas.

   ── LAS TRES PUERTAS PARA SUBIR ──
   Botón, arrastrar y Ctrl+V, como la portada de una entidad. El Ctrl+V solo
   cuando el ratón está encima de la tira: pegar es un gesto global y sin ese
   guardia una foto copiada para otra cosa acaba en el equipo que había abierto
   en otra pestaña.

   ⚠ Se COMPRIME antes de subir. `subirImagen` rebota a los 3 MB y una foto de
   móvil pesa ocho: sin esto, el aviso es «Máximo 3MB por imagen» delante de
   alguien que no puede hacer nada al respecto. `prepararImagen` la deja en
   1600 px WebP, que para mirar un número de serie sobra.

   ── NO ES DE EQUIPOS ──
   Nació para 🎥 equipamiento y hablaba solo de equipos: «qué trae la caja»,
   «hacer cartel». Una persona también tiene fotos —un retrato para producción,
   la de rodaje, la de prensa— y su cara NO vive donde vive un cartel: está en
   `personas.foto_url`, no en `entidad_media`. Un botón «Hacer cartel» en una
   ficha de persona escribiría una fila que nadie lee: se pulsa, no falla, y no
   cambia nada. Por eso cada tipo trae su vocabulario Y su destino, abajo.
   ══════════════════════════════════════════════════════════════════════════ */

export type FotoFila = { id: string; url: string; pie?: string | null };

/* ── LO QUE ESTA GALERÍA ES, SEGÚN DE QUIÉN SEA ──
   Tres frases por tipo: qué invitar a subir cuando está vacía, cómo se llama
   ponerla de cara, y a qué medida hay que dejarla para serlo. Añadir un tipo
   —un lugar, una empresa— es añadir una entrada aquí, no tocar el componente. */
type Voz = {
  pista: string;
  /** Qué preguntar en el pie. «Así va montado el arnés» en la ficha de una
   *  persona es de otra pantalla. */
  piePista: string;
  caraTit: string;
  /** Lo que se dice cuando ya está hecho. */
  hecho: string;
  /** A qué tamaño se re-prepara la foto para servir de cara. */
  caraMedida: MedidaImagen;
  /** Cómo se llama aquí «ponerla de cara», y DÓNDE se guarda. Los dos juntos y
   *  no un rótulo aquí y un `if` suelto allá: son la misma decisión, y
   *  separados se puede añadir un tipo con su rótulo y que el botón siga
   *  escribiendo en la tabla del anterior — compila, no falla, y guarda en el
   *  sitio equivocado.
   *  `null` en los dos = ese tipo no ha dicho dónde vive su cara, así que no se
   *  ofrece ponerla. Ver `VOZ_GENERICA`. */
  cara: string | null;
  caraDonde: "cartel" | "persona" | null;
};

const VOZ: Record<string, Voz> = {
  equipamiento: {
    pista: "Cómo se monta, qué trae la caja, dónde está el número de serie.",
    piePista: "¿Qué enseña esta foto? «así va montado el arnés»",
    cara: "🖼 Hacer cartel",
    caraTit: "Ponerla como cartel: la miniatura con la que este equipo se reconoce en las listas",
    hecho: "Ya es el cartel de este equipo",
    caraMedida: MEDIDAS.cartel,
    caraDonde: "cartel",
  },
  /* Un proyecto tiene fotos ANTES de tener nada: la referencia visual que
     explica el tono mejor que un párrafo, dónde ocurre, cómo se ve, el afiche.
     ⚠ Y NO se habla de rodaje ni de película: `lib/entidades` admite siete
     tipos de proyecto y tres de ellos —videojuego, gestión cultural,
     cobertura— no ruedan nada. Meter el vocabulario de un subtipo en la
     entrada de todo el tipo es el mismo fallo que `VOZ` vino a arreglar, un
     piso más abajo.
     Su cara sí es un cartel —`entidad_media`—, al revés que la de una persona. */
  proyecto: {
    pista: "Referencias visuales, cómo se ve, dónde ocurre, el afiche.",
    piePista: "¿Qué enseña esta foto? «la casa de Ollantaytambo, tarde»",
    /* ⚠ «en la búsqueda y en las fichas», no «en las listas»: /proyectos, que
       es LA lista de proyectos, no lee `entidad_media` — sus filas son texto y
       etiquetas. Prometer que se verá ahí sería mandar a alguien a mirar un
       sitio donde no está. */
    caraTit: "Ponerla como cartel: la imagen con la que este proyecto sale en la búsqueda y en las fichas que lo mencionan",
    hecho: "Ya es el cartel de este proyecto",
    caraMedida: MEDIDAS.cartel,
    cara: "🖼 Hacer cartel",
    caraDonde: "cartel",
  },
  persona: {
    pista: "Un retrato para producción, la de rodaje, la de prensa.",
    piePista: "¿Qué enseña esta foto? «rodaje de Mujeres Ande, 2025»",
    cara: "👤 Hacer foto de perfil",
    caraTit: "Ponerla como foto de perfil: la cara con la que aparece en todas las listas",
    hecho: "Ya es su foto de perfil",
    caraMedida: MEDIDAS.foto,
    caraDonde: "persona",
  },
};

/* ⚠ SIN botón de cara, a propósito. Un tipo que no está en `VOZ` puede tener
   galería —basta añadirlo a `CON_GALERIA` en la ficha— pero nadie ha dicho
   dónde vive su cara. Poner aquí «🖼 Hacer cartel» por defecto reintroduce
   justo lo que `caraDonde` existe para evitar: escribiría en
   `entidad_media.cartel_url`, que en una ficha que no pinta cartel es un botón
   que se pulsa, no falla y no cambia nada. Se sube y se mira; para ponerla de
   cara, el tipo tiene que decir dónde. */
const VOZ_GENERICA: Voz = {
  pista: "Lo que una foto explica y el nombre no.",
  piePista: "¿Qué enseña esta foto?",
  cara: null,
  caraTit: "",
  hecho: "",
  caraMedida: MEDIDAS.cartel,
  caraDonde: null,
};

/* ── LA CARA SE VUELVE A PREPARAR, NO SE ENCHUFA LA URL ──
   Una foto de galería son 1600 px sin recortar, y eso es lo correcto para
   mirarla a pantalla completa. De cara no sirve por dos razones distintas:
   · PESA. El avatar de una persona sale en decenas de listas a 24 px; el
     cartel de un equipo, en quinientas filas a 84. Enchufar la URL de 1600
     mete cientos de kilobytes en cada fila para pintar un pulgar.
   · SE RECORTA MAL. El avatar es cuadrado y lo recorta el CSS por el CENTRO.
     `MEDIDAS.foto` recorta al 25 % desde arriba a propósito —«ahí viven las
     caras en los retratos»—, así que la misma foto puesta por esta puerta
     salía decapitada y por la otra no.
   Así que se baja, se prepara a la medida que toca y se sube como archivo
   propio. Cuesta un objeto más en el bucket; la alternativa es una promesa a
   medias.

   ⚠ `prepararImagen` PUEDE DEVOLVER EL ORIGINAL, y no siempre significa lo
   mismo. Tiene salidas tempranas que sueltan el archivo intacto: ya era chico
   y de la forma correcta, es un GIF —el canvas lo congelaría—, o el WebP no
   salió más liviano. Tratarlas todas como «preparada» mentía en un caso y
   desperdiciaba en otro, así que primero se MIDE la imagen y luego se juzga:
   · no hacía falta tocarla → no se sube nada, se usa la URL que ya estaba.
     Un duplicado byte a byte en el bucket no mejora nada.
   · hacía falta y volvió intacta → se pone igual, pero SE DICE. El recorte lo
     hará el CSS por el centro, que es peor que el 25 % de arriba que hace
     `prepararImagen` en los retratos, pero es lo mismo que ya hacía cualquier
     avatar de la aplicación.
   · un GIF no puede ser una cara: si está animado acabaría animado y de hasta
     3 MB en cada lista, y saber si lo está exige decodificar sus fotogramas —
     así que se rechazan todos, incluidos los fijos, y se dice qué hacer en vez
     de dejarlo pasar y descubrirlo en una lista.
   · si la bajada falla —sin red, un CORS raro— se usa la original y SE DICE:
     quedarse sin poder poner la cara por no poder recortarla sería cambiar un
     defecto por una puerta cerrada.

   ⚠ `cache: "reload"`. La misma URL ya se cargó como `<img>` SIN `crossOrigin`,
   así que en la caché hay una entrada opaca; un `fetch` en modo cors podría
   reutilizarla y fallar aunque el servidor sí mande las cabeceras. */
type Cara = {
  url?: string;
  aviso?: string;
  /** No es que no se pudiera preparar: es que esa imagen NO debe ponerse de
   *  cara. Se avisa y no se guarda nada — poner la original «igualmente»
   *  sería hacer justo lo que se acaba de decir que no. */
  rechazo?: boolean;
};

/* El aviso se pinta en DOS sitios —la cabecera de la tira y la barra dentro del
   visor— y los dos tienen que teñirlo igual. `.gal-msg` es roja, que nació para
   los fallos de subida; un «✅ Ya es su foto de perfil» en rojo se lee como que
   algo se rompió. Una función y no dos plantillas: teñir uno y no el otro es
   justo el fallo que esto evita. */
const claseAviso = (m: string, extra = "") =>
  `gal-msg${extra}${m.startsWith("✅") ? " ok" : ""}`;

async function prepararComoCara(url: string, medida: MedidaImagen): Promise<Cara> {
  try {
    const r = await fetch(url, { mode: "cors", cache: "reload" });
    if (!r.ok) return { aviso: `no se pudo leer la imagen (${r.status})` };
    const b = await r.blob();
    /* Lo ÚNICO que se rechaza de plano. El canvas congela un GIF, así que
       `prepararImagen` lo devuelve entero y acabaría de cara —animado y de
       hasta 3 MB— en cada lista. Un tipo raro (`octet-stream` mal servido por
       el bucket) NO se rechaza: la foto se está viendo a pantalla completa, y
       contestar «eso no es una imagen» sobre algo que se está mirando es una
       puerta cerrada sin salida. Se intenta, y si no se puede se dice. */
    if (b.type === "image/gif") {
      return {
        rechazo: true,
        aviso: "un GIF no puede servir de cara — sube una foto (jpg, png o webp) y usa esa",
      };
    }

    /* ¿Hacía falta tocarla? Cuadrada si toca serlo, dentro de la medida y por
       debajo de los 400 KB. El umbral es el COMPLEMENTO exacto del de
       `prepararImagen` —allí se salta el trabajo con `size < 400 KB`, aquí hace
       falta con `>=`—, para que no haya un byte en el que las dos funciones
       opinen distinto. Sin el peso, una foto de 700×900 y 2 MB no disparaba
       nada y se enchufaba tal cual de cartel, que es justo lo que este bloque
       existe para evitar.
       ⚠ `medido` importa: si no se puede medir —`createImageBitmap` no está o
       falla— se intenta prepararla igual, pero entonces que vuelva intacta es
       AMBIGUO: puede ser que no hiciera falta o que el canvas fallara. Se pone,
       porque es lo que había antes de todo esto, y se dice que no se pudo
       comprobar en vez de firmar un ✅ que no se sabe si es verdad. */
    let medido = false;
    let hayQuePrepararla = true;
    try {
      const bm = await createImageBitmap(b);
      try {
        hayQuePrepararla = (medida.cuadrado === true && bm.width !== bm.height)
          || bm.width > medida.maxAncho || bm.height > medida.maxAlto
          || b.size >= 400 * 1024;
        medido = true;
      } finally { bm.close?.(); }
    } catch { /* se queda sin medir, y en «hay que intentarlo» */ }

    if (!hayQuePrepararla) return { url };

    /* El `File` se arma AQUÍ y no antes: en el camino de arriba se copiaba un
       blob de hasta 3 MB para tirarlo en la línea siguiente. */
    const ext = (b.type.split("/")[1] || "webp").replace(/[^a-z0-9]/gi, "") || "webp";
    const original = new File([b], `cara.${ext}`, { type: b.type });

    const lista = await prepararImagen(original, medida);
    if (lista === original) {
      return medido
        ? { aviso: "no se pudo recortar ni aligerar" }
        : { url, aviso: "no se pudo comprobar si hacía falta recortarla" };
    }
    const s = await subirImagen(lista);
    return s.url ? { url: s.url } : { aviso: s.error || "no se pudo subir la imagen preparada" };
  } catch {
    return { aviso: "no se pudo descargar la imagen para prepararla" };
  }
}

export default function GaleriaFotos({ tipo, entidadId, fotos, abrirEn }: {
  tipo: string;
  entidadId: string;
  fotos: FotoFila[];
  /** Índice por el que abrir el visor NADA MÁS MONTAR. Sale de `?foto=N`, y su
   *  razón de ser es que un enlace se pueda mandar por chat: «mira la foto 3
   *  del A-540». Solo funciona en carga fresca, que es como llega un enlace
   *  compartido — dentro de la aplicación, una navegación suave a la misma
   *  ruta con otro query no remonta esto y el valor no se vuelve a leer. Por
   *  eso el cartel de la cabecera usa un ancla `#fotos` y no el query. */
  abrirEn?: number | null;
}) {
  const router = useRouter();
  /* Solo el valor INICIAL: `router.refresh()` repinta este componente sin
     desmontarlo, así que un `abrirEn` que siguiera mandando reabriría el visor
     cada vez que se guarda un pie de foto. */
  const [viendo, setViendo] = useState<number | null>(abrirEn ?? null);
  /** Por qué foto iba el visor la última vez que avisó. Sirve para borrar el
   *  aviso al PASAR de foto y no antes: ver abajo, en `alCambiar`. */
  const vistaRef = useRef<number | null>(null);

  /* Al cerrar, fuera el `?foto=` de la barra de direcciones. Si se queda, el
     visor vuelve a abrirse solo al recargar o al volver con Atrás, y eso se
     lee como que la pantalla no obedece. `history.replaceState` y no
     `router.replace`: no hace falta que el servidor repinte nada — la URL es
     lo único que sobra, y una navegación suave por esto costaría un viaje. */
  const cerrar = () => {
    /* ⚠ El pie se guarda al SALIR del campo, y cerrar desmonta el input sin
       que React dispare `blur`: lo escrito se perdía sin avisar. Quitarle el
       foco a mano antes de cerrar hace que el `onBlur` corra y se guarde. */
    if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
    setViendo(null);
    /* Y fuera lo último que se contestó. Sin esto, un «✅ Ya es su foto de
       perfil» sobrevivía al cierre y reaparecía en la barra de OTRA foto al
       reabrir el visor, afirmando algo que no es de esa foto. */
    setMsg(null);
    vistaRef.current = null;
    if (typeof window !== "undefined" && window.location.search.includes("foto=")) {
      const u = new URL(window.location.href);
      u.searchParams.delete("foto");
      window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    }
  };
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Qué foto está preguntando si de verdad se quita. `null` = ninguna. */
  const [borrando, setBorrando] = useState<string | null>(null);
  const zona = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  async function sumar(files: FileList | File[] | null) {
    const todos = [...(files || [])];
    const lista = todos.filter(f => f.type.startsWith("image/"));
    /* Lo que ni siquiera era una imagen se DICE. Arrastrar un PDF a la tira no
       hacía nada y no avisaba de nada: se salía en silencio y quien lo soltó
       se queda mirando una lista que no cambió. */
    const noImagen = todos.filter(f => !f.type.startsWith("image/")).map(f => f.name);
    if (!lista.length) {
      setMsg(noImagen.length ? `⚠ Aquí solo entran imágenes — ${noImagen.join(", ")}` : null);
      return;
    }
    setOcupado(true); setMsg(null);
    /* ⚠ `try/finally`, igual que `conRefresco` y `hacerCara`. `agregarFotos` es
       una acción de servidor y RECHAZA si se cae la red: sin esto la excepción
       salía de aquí, `ocupado` se quedaba en true y «Subiendo…» era eterno —el
       botón ＋, la ✕, las flechas y el pegado, todos muertos hasta recargar—.
       Esta es la puerta de «añadir» y de «pegar»: las dos que los comentarios
       de las otras dos funciones nombran.
       ⚠ Y las dos listas se declaran FUERA del try: si se declararan dentro, el
       `catch` no podría verlas y los nombres de las que no subieron se
       perderían justo en el camino que este try existe para cubrir — que es lo
       contrario de lo que promete el comentario de abajo. */
    const urls: string[] = [];
    const fallos: string[] = [];
    try {
      for (const f of lista) {
        /* Una a una y no en paralelo: `prepararImagen` dibuja en un canvas, y
           diez canvas a la vez con fotos de doce megapíxeles ahogan un teléfono.
           Además así el que falla se puede nombrar. */
        const lista1 = await prepararImagen(f, MEDIDAS.galeria);
        const r = await subirImagen(lista1);
        if (r.url) urls.push(r.url); else fallos.push(`${f.name}: ${r.error || "no subió"}`);
      }
      if (urls.length) {
        const g: any = await agregarFotos(tipo, entidadId, urls);
        if (g?.error) {
          /* Los nombres de las que no subieron se van CON el error, no se
             pierden: es el único sitio donde estaban. */
          setMsg(`⚠ ${g.error}${fallos.length ? ` · además no subieron: ${fallos.join(" · ")}` : ""}`);
          return;
        }
      }
      /* Lo que NO entró se dice con nombre. Subir ocho y que aparezcan siete es
         el fallo que se descubre semanas después, buscando la que falta. */
      const sobras = [...fallos, ...noImagen.map(n => `${n}: no es una imagen`)];
      setMsg(sobras.length
        ? `⚠ ${urls.length} de ${todos.length} · no entraron: ${sobras.join(" · ")}`
        : null);
      if (urls.length) router.refresh();
    } catch (e: any) {
      /* Con los nombres, que es lo único que hay de ellas. */
      setMsg(`⚠ No se pudieron guardar: ${e?.message || "se cortó la conexión"}`
        + (fallos.length ? ` · además no subieron: ${fallos.join(" · ")}` : ""));
    } finally {
      setOcupado(false);
    }
  }

  /* ⚠ EL PEGADO SE REPARTE, y hay que decir que este es un destino. Sin la
     marca `data-paste-destino`, la cabecera de la ficha se llevaba el Ctrl+V
     ADEMÁS de la galería: la misma foto entraba aquí y encima se ponía de
     banner o de cartel. Dos escrituras que nadie pidió, y una cambiaba la cara
     de la ficha. Quién se lo lleva se decide MIRANDO quién está bajo el ratón
     en ese instante (lib/destinoPaste), no con una bandera que alguien tenga
     que acordarse de bajar.
     Y no se mira `sobre`: ese estado puede quedarse pegado si el `mouseleave`
     nunca llega —el diálogo de archivos del sistema, el visor abriéndose
     encima— y entonces la galería se quedaría con pegados de otros sitios. */
  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      if (ocupado || !meToca("galeria")) return;
      /* Si el foco está en una caja de texto, ese pegado es del texto. Lo
         hacen los otros tres destinos y faltaba aquí. */
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
      if (!fs.length) return;
      e.preventDefault();
      sumar(fs);
    };
    window.addEventListener("paste", pegar);
    return () => window.removeEventListener("paste", pegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, tipo, entidadId]);

  /* ⚠ `finally`. Una acción de servidor no solo devuelve `{error}`: RECHAZA si
     se cae la red o Next contesta con un error de transporte. Sin esto la
     excepción salía de aquí, `ocupado` se quedaba en true para siempre y la
     galería entera —añadir, quitar, mover, pegar— se moría hasta recargar, sin
     decir por qué. */
  async function conRefresco(fn: () => Promise<any>) {
    setOcupado(true); setMsg(null);
    try {
      const r: any = await fn();
      if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
      router.refresh();
    } catch (e: any) {
      setMsg(`⚠ No se pudo guardar: ${e?.message || "se cortó la conexión"}`);
    } finally {
      setOcupado(false);
    }
  }

  const hay = fotos.length > 0;
  const voz = VOZ[tipo] || VOZ_GENERICA;

  /* ⚠ `useCallback` con dependencias vacías, y NO una flecha en línea. El visor
     llama a esto desde un efecto que lleva `alCambiar` en sus dependencias: una
     función nueva en cada render haría correr el efecto en cada render, y como
     aquí se borra el aviso, el «✅ Ya es su foto de perfil» se borraría solo en
     el render siguiente a escribirlo.
     Y se borra solo al PASAR de foto, comparando contra la anterior: si se
     borrara siempre que el visor anuncia su índice, pasaría lo mismo. */
  const alCambiarFoto = useCallback((i: number) => {
    setViendo(i);
    if (vistaRef.current !== null && vistaRef.current !== i) setMsg(null);
    vistaRef.current = i;
  }, []);

  /* Abrir el visor también limpia. Lo que hubiera es la respuesta a lo último
     que se hizo EN LA TIRA —«⚠ 1 de 2 · no entraron: contrato.pdf»— y dentro
     del visor se pinta en la barra de acciones, donde se lee como la respuesta
     a algo que acabas de pulsar ahí. `cerrar` limpiaba solo la otra mitad. */
  const abrirFoto = (i: number) => { setMsg(null); vistaRef.current = i; setViendo(i); };

  /* Poner esta foto de cara: el cartel de un equipo, el avatar de una persona.
     El destino lo decide el TIPO en `VOZ`, no quien pinta la galería. Si no lo
     ha dicho no hay botón, así que aquí `caraDonde` nunca es null. */
  async function hacerCara(url: string) {
    if (!voz.caraDonde) return;
    setOcupado(true); setMsg(null);
    try {
      const cara = await prepararComoCara(url, voz.caraMedida);
      if (cara.rechazo) { setMsg(`⚠ ${cara.aviso}`); return; }
      const r: any = voz.caraDonde === "persona"
        ? await guardarFotoPersona(entidadId, cara.url || url)
        : await guardarImagenEntidad(tipo, entidadId, "cartel", cara.url || url);
      if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
      /* El éxito se DICE. Este botón vive dentro del visor y lo que cambia
         —el avatar, el cartel— está detrás del velo: sin una frase, poner la
         cara y no poner nada se ven exactamente igual.
         Y el ✅ solo si NO hay reparo: se guardó igual, pero con un pero, y un
         ✅ a secas lo taparía. */
      setMsg(cara.aviso
        ? `⚠ ${voz.hecho}, pero tal cual: ${cara.aviso}.`
        : `✅ ${voz.hecho}`);
      router.refresh();
    } catch (e: any) {
      /* ⚠ Una acción de servidor RECHAZA si se cae la red. Sin este catch la
         excepción salía de aquí, `ocupado` se quedaba en true para siempre y
         la galería entera —añadir, quitar, mover, pegar— quedaba muerta hasta
         recargar, sin decir por qué. */
      setMsg(`⚠ No se pudo guardar: ${e?.message || "se cortó la conexión"}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="gal" id="fotos" ref={zona}
      {...{ [ATRIBUTO]: "galeria" }}
      /* Al salir se cierra la pregunta de borrar: era la única de las dos que
         no se reiniciaba nunca —se quedaba tapando la miniatura hasta que
         alguien la pulsara, sobreviviendo a un refresco—. */
      onMouseLeave={() => setBorrando(null)}
      onDragOver={e => { e.preventDefault(); }}
      /* `ocupado` también aquí. El botón ya estaba protegido, pero arrastrar y
         pegar no: soltar un segundo lote mientras sube el primero lanzaba dos
         `sumar` en paralelo, y los dos leían el mismo `orden` de partida. */
      onDrop={e => { e.preventDefault(); if (!ocupado) sumar(e.dataTransfer?.files || null); }}>

      <div className="gal-h">
        <span className="gal-t">📷 Fotos{hay ? ` · ${fotos.length}` : ""}</span>
        <button type="button" className="dato-btn" disabled={ocupado}
          onClick={() => input.current?.click()}>
          {ocupado ? "Subiendo…" : "＋ Añadir"}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden
          onChange={e => { sumar(e.target.files); e.currentTarget.value = ""; }} />
        {/* El vacío DICE para qué sirve. «Sin fotos» a secas es un hueco;
            esto es una invitación con un ejemplo concreto. */}
        {!hay && !ocupado && (
          <span className="gal-vacio">
            {voz.pista} Arrastra aquí o pega con Ctrl+V.
          </span>
        )}
        {msg && <span className={claseAviso(msg)}>{msg}</span>}
      </div>

      {hay && (
        <div className="gal-tira">
          {fotos.map((f, i) => (
            /* Un `div` y no un `button`: la ✕ es un botón y un botón dentro de
               otro es HTML inválido que el navegador reordena al parsear. */
            <div key={f.id} className="gal-mini">
              <button type="button" className="gal-abrir"
                title={f.pie || "Ver"} onClick={() => abrirFoto(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.pie || ""} loading="lazy" decoding="async" />
                {/* El pie, encima y recortado. Con doce fotos parecidas es lo
                    único que las distingue sin abrirlas una por una. */}
                {f.pie && <span className="gal-pie">{f.pie}</span>}
              </button>
              {/* ── QUITAR, DESDE LA MINIATURA ──
                  Estaba solo dentro del visor, y ahí hay que saber que existe:
                  abrir la foto, mirar abajo, encontrar la barra. Quien quiere
                  borrar una foto la busca en la tira y espera una ✕ ahí.
                  Con confirmación, porque no hay deshacer: la foto se va y
                  volver a ponerla es volver a subirla. */}
              {borrando === f.id ? (
                /* El MISMO vocabulario que la barra del visor: «¿quitar?» y
                   sí/no. La misma acción se llamaba «quitar» aquí y «sí» a
                   cuatro centímetros, en la otra puerta de lo mismo. */
                <span className="gal-conf" role="alertdialog" aria-label="¿Quitar esta foto?">
                  <b>¿quitar?</b>
                  <span>
                    <button type="button" disabled={ocupado}
                      onClick={() => conRefresco(async () => {
                        const r = await quitarFoto(f.id);
                        if (!(r as any)?.error) setBorrando(null);
                        return r;
                      })}>sí</button>
                    {" / "}
                    <button type="button" onClick={() => setBorrando(null)}>no</button>
                  </span>
                </span>
              ) : (
                <button type="button" className="gal-x" title="Quitar esta foto"
                  aria-label="Quitar esta foto" onClick={() => setBorrando(f.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {viendo !== null && fotos[Math.min(viendo, fotos.length - 1)] && (() => {
        const act = fotos[Math.min(viendo, fotos.length - 1)];
        return (
          <VisorFotos fotos={fotos.map(f => ({ url: f.url, pie: f.pie }))}
            desde={viendo} alCerrar={cerrar} alCambiar={alCambiarFoto}
            /* ── LO QUE SE HACE CON LA FOTO QUE SE ESTÁ MIRANDO ──
               DENTRO del visor. Estuvo fuera un rato, con el argumento de que
               «el visor es de ver»: quedaba debajo del velo del 86 %, sin
               clics, y pulsarla cerraba el visor. Un razonamiento bonito no
               vale si el resultado no se puede tocar. */
            barra={
              <BarraFoto f={act} i={Math.min(viendo, fotos.length - 1)} total={fotos.length}
                ocupado={ocupado} piePista={voz.piePista}
                /* El aviso viaja DENTRO del visor. `.gal-msg` vive en la
                   cabecera de la tira, que con el visor abierto está debajo
                   de un velo del 86 %: lo que se contestaba a este botón no lo
                   leía nadie hasta cerrar, ya descolgado de lo que se pulsó. */
                msg={msg}
                onPie={pie => conRefresco(() => ponerPieFoto(act.id, pie))}
                onMover={h => conRefresco(async () => {
                  const r = await moverFoto(act.id, h);
                  if (!(r as any)?.error) {
                    setViendo(v => (v === null ? v : h === "antes" ? Math.max(0, v - 1) : Math.min(fotos.length - 1, v + 1)));
                  }
                  return r;
                })}
                cara={voz.cara} caraTit={voz.caraTit}
                /* No pasa por `conRefresco`: son tres pasos —bajar, preparar,
                   subir— y uno de ellos puede salir a medias sin ser un error.
                   `hacerCara` lleva su propio ocupado y su propio aviso. */
                onCartel={() => hacerCara(act.url)}
                onQuitar={() => conRefresco(async () => {
                  const r = await quitarFoto(act.id);
                  /* Se cierra: la foto que se miraba ya no existe, y dejarlo
                     abierto enseñaría la siguiente como si nada. */
                  if (!(r as any)?.error) cerrar();
                  return r;
                })} />
            } />
        );
      })()}

    </div>
  );
}

function BarraFoto({ f, i, total, ocupado, cara, caraTit, piePista, msg, onPie, onMover, onCartel, onQuitar }: {
  f: FotoFila; i: number; total: number; ocupado: boolean;
  /** Cómo se llama aquí «ponerla de cara»: cartel en un equipo, foto de
   *  perfil en una persona. Lo decide `VOZ`, no esta barra. `null` = ese tipo
   *  no ha dicho dónde vive su cara, así que el botón no existe. */
  cara: string | null; caraTit: string;
  piePista: string;
  /** Lo último que contestó la galería. Se pinta AQUÍ porque aquí es donde se
   *  pulsa: el visor tapa la cabecera donde vive el otro aviso. */
  msg: string | null;
  onPie: (pie: string) => void;
  onMover: (hacia: "antes" | "despues") => void;
  onCartel: () => void;
  onQuitar: () => void;
}) {
  const [pie, setPie] = useState(f.pie || "");
  const [confirmando, setConfirmando] = useState(false);
  /* El texto se resincroniza al CAMBIAR DE FOTO, no en cada render: si se
     copiara del servidor siempre, escribir un pie se borraría solo en cuanto
     `router.refresh()` trajera la fila vieja. */
  useEffect(() => { setPie(f.pie || ""); setConfirmando(false); }, [f.id, f.pie]);

  return (
    <div className="gal-barra">
      <input className="ent-lote-inp" value={pie} disabled={ocupado}
        placeholder={piePista}
        onChange={e => setPie(e.target.value)}
        onBlur={() => { if ((pie || "") !== (f.pie || "")) onPie(pie); }}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <button type="button" className="dato-btn" disabled={ocupado || i === 0}
        title="Moverla un puesto hacia el principio" onClick={() => onMover("antes")}>◀</button>
      <button type="button" className="dato-btn" disabled={ocupado || i === total - 1}
        title="Moverla un puesto hacia el final" onClick={() => onMover("despues")}>▶</button>
      {/* ⚠ El botón se ofrece en TODA persona, también en un contacto — cuya
          ficha a propósito no pinta avatar. Estuvo escondido ahí un rato con
          el argumento de que «no cambiaría nada», y era falso: `foto_url` se
          lee en /personas, en /buscar y en todos los chips, así que ponerla sí
          sirve — solo que se ve en las listas, no en su propia ficha.
          Esconderlo dejaba a un contacto SIN NINGUNA puerta para tener cara.
          Lo que faltaba no era quitar el botón: era decir que se hizo. */}
      {cara && (
        <button type="button" className="dato-btn" disabled={ocupado}
          title={caraTit} onClick={onCartel}>{cara}</button>
      )}
      {/* Con confirmación, porque no hay deshacer. La foto se va de la galería
          y volver a ponerla es volver a subirla. */}
      {confirmando ? (
        <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          ¿quitar? <button type="button" style={{ color: "var(--red)", fontWeight: 700 }}
            disabled={ocupado} onClick={onQuitar}>sí</button>
          {" / "}<button type="button" style={{ color: "var(--dim)" }}
            onClick={() => setConfirmando(false)}>no</button>
        </span>
      ) : (
        <button type="button" className="dato-btn" style={{ color: "var(--red)" }}
          disabled={ocupado} title="Quitarla de la galería" onClick={() => setConfirmando(true)}>✕</button>
      )}
      {/* La respuesta, donde se pulsó. Ocupa toda una línea para que quepa un
          motivo entero y no se coma los botones. */}
      {msg && <span className={claseAviso(msg, " gal-msg-visor")}>{msg}</span>}
    </div>
  );
}
