"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarSecuencia } from "@/app/guion/acciones";

/* ══════════════════════════════════════════════════════════════════════════
   GUARDAR UNA SECUENCIA SIN PERDER TEXTO

   El texto de una secuencia es el campo madre del guion entero: horas de
   trabajo que no están en ninguna otra parte. Lo que importa de esta
   maquinaria no es lo que hace, es lo que NO PUEDE hacer.

   ── LAS CINCO FORMAS EN QUE SE PERDÍA TEXTO, TODAS REALES ──
    1. REMONTARSE. El padre definía el envoltorio de la lista dentro de su
       propio render; React veía un componente distinto en cada pasada y
       desmontaba el editor entero —con su estado y su cola— en cuanto alguien
       abría un panel.
    2. REFRESCARSE AL TECLEAR. `guardarSecuencia` no revalida a propósito:
       `revalidatePath` devuelve el árbol RSC nuevo y el textarea se refresca
       en mitad de la frase. Quien refresca es el cliente, al soltar el campo.
    3. REFRESCAR DESPUÉS DE UN FALLO. Si el guardado falla y aun así se
       refresca, el servidor devuelve el texto viejo y el párrafo desaparece
       de la vista. Por eso `volcar()` devuelve si fue bien.
    4. IRSE SIN VOLCAR LA COLA. Mover, borrar o marcar un hilo disparaban
       refresh con la cola llena.
    5. PISARSE ENTRE DOS GUARDADOS. Si uno viejo fallaba mientras otro nuevo
       iba en camino, el viejo volvía a la cola y machacaba el texto nuevo.
       Por eso van de uno en uno.

   ── POR QUÉ ESTO ES UN HOOK Y NO VIVE EN EL COMPONENTE ──
   Porque ahora hay DOS sitios donde se escribe la misma secuencia: la tarjeta
   de la vista Cards y la celda de la rejilla. Copiar estas cincuenta líneas
   habría dejado dos editores con protecciones distintas, y el segundo se
   habría escrito «rápido, que es solo un textarea» — que es exactamente cómo
   se perdieron las cinco veces de arriba.
   ══════════════════════════════════════════════════════════════════════════ */

export type EstadoGuardado = "limpio" | "sucio" | "guardando" | "guardado" | "error";

export const ROTULO_GUARDADO: Record<EstadoGuardado, string> = {
  limpio: "", sucio: "· sin guardar", guardando: "· guardando…",
  guardado: "· guardado", error: "· NO se guardó",
};

export function usarGuardadoSecuencia(secId: string, tratamientoId: string) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoGuardado>("limpio");
  const [err, setErr] = useState("");
  const reloj = useRef<any>(null);
  const cola = useRef<Record<string, any>>({});
  const enVuelo = useRef<Promise<boolean> | null>(null);

  /* Aviso del navegador antes de cerrar con algo sin guardar. Es la última
     red: un cierre accidental no puede llevarse el último párrafo. */
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => {
      if (estado === "sucio" || estado === "guardando") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [estado]);

  /* ── AL DESMONTAR, VOLCAR: NO TIRAR LA COLA ──
   * ⚠ Aquí solo se limpiaba el temporizador, o sea que hasta 800 ms de
   * escritura se iban sin aviso y sin guardar. En la vista de tarjetas casi
   * nunca se llegaba —pulsar un enlace provoca `blur`, y el `blur` vuelca—
   * pero las vistas por URL institucionalizan el caso sin blur: el botón
   * ATRÁS del navegador estando dentro del textarea desmonta la celda, y
   * `beforeunload` no cubre la navegación de cliente.
   * `volcar()` es asíncrona y React no espera a la limpieza, pero la petición
   * ya salió: el navegador la termina aunque el componente se haya ido. */
  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
    if (Object.keys(cola.current).length) void volcar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Manda lo que haya en la cola. De uno en uno. Devuelve si quedó todo
   *  guardado. */
  async function volcar(): Promise<boolean> {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
    if (enVuelo.current) await enVuelo.current;
    if (!Object.keys(cola.current).length) return estado !== "error";

    const campos = cola.current;
    cola.current = {};
    setEstado("guardando");
    const tarea = (async () => {
      const r: any = await guardarSecuencia(secId, tratamientoId, campos);
      if (r?.error) {
        /* Vuelve a la cola lo que no entró, pero SIN pisar lo que se haya
           escrito mientras tanto: lo nuevo manda sobre lo reencolado. */
        cola.current = { ...campos, ...cola.current };
        setEstado("error"); setErr(r.error);
        return false;
      }
      setEstado("guardado");
      return true;
    })();
    enVuelo.current = tarea.then(v => v) as any;
    const ok = await tarea;
    enVuelo.current = null;
    return ok;
  }

  function programar(campos: Record<string, any>) {
    cola.current = { ...cola.current, ...campos };
    setEstado("sucio"); setErr("");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => { volcar(); }, 800);
  }

  /** Volcar y, solo si fue bien, refrescar. Todo lo que provoque un refresh
   *  pasa por aquí: si no, el servidor devuelve el texto viejo. */
  async function volcarYRefrescar() {
    if (await volcar()) router.refresh();
  }

  /** Para cuando la fila deja de existir: ya no hay a dónde guardar. */
  const olvidar = () => { cola.current = {}; };

  return { estado, err, setErr, programar, volcar, volcarYRefrescar, olvidar, router };
}
