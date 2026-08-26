"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/Enlace";
import { pedirZocalo, EVENTO_ZOCALO } from "@/lib/zocalo";
import { estadoAlarma, pieAlarma, type Alarma } from "@/lib/alarmas";

/* ══════════════════════════════════════════════════════════════════════════
   LA FRANJA — una alarma encendida se ve en todas las pantallas

   No es un aviso más: es el único rojo del sistema que declaró una persona.
   Por eso va arriba del todo y en cualquier pantalla — si hay que enterarse sí
   o sí, tiene que estar donde la gente ya mira, no donde habría que ir.

   ── VIAJA EN EL ZÓCALO, NO EN UNA LLAMADA PROPIA ──
   `pedirZocalo` es la petición que ya se hace en cada navegación, compartida
   con el menú, el banco y la campanita. Una acción de servidor más por
   navegación, en las diecinueve pantallas, es exactamente lo que aquel trabajo
   vino a quitar (ver lib/zocalo.ts).

   ── NO SE PUEDE CERRAR ──
   Una franja con ✕ es una franja que se cierra el primer día y ya no vuelve a
   verse. Lo que sí se puede es APAGAR la alarma, que es distinto: apagarla
   exige contar cómo se resolvió y lo hace administración. La molestia es el
   mecanismo, no un efecto secundario.
   ══════════════════════════════════════════════════════════════════════════ */
export default function FranjaAlarmas() {
  const pathname = usePathname() || "";
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);
  const [tic, setTic] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    pedirZocalo(pathname)
      .then(z => { if (vivo) setAlarmas(((z as any).alarmas || []) as Alarma[]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pathname, tic]);

  /* Encender o apagar una alarma no cambia de página, así que sin esto la
     franja seguía como estaba hasta navegar: se apagaba en la ficha y arriba
     seguía roja. Quien la toca olvida el zócalo y avisa; aquí se vuelve a
     pedir. */
  useEffect(() => {
    const alCambiar = () => setTic(t => t + 1);
    window.addEventListener(EVENTO_ZOCALO, alCambiar);
    return () => window.removeEventListener(EVENTO_ZOCALO, alCambiar);
  }, []);

  /* ── EL HUECO LO MIDE LA FRANJA, NO UNA CONSTANTE ──
     La franja está FIJA arriba, así que el resto de la página necesita saber
     cuánto ocupa. Estaba escrito a mano —34px— y eso solo vale para UNA
     alarma de una línea: con dos, o con un título que envuelve en el móvil,
     la franja se comía la barra de navegación. Se mide lo que mide y se
     publica en una variable que usan el `body` y las cabeceras pegajosas. */
  useEffect(() => {
    const raiz = document.documentElement;
    if (!alarmas.length) { raiz.style.removeProperty("--alto-franja"); return; }
    const medir = () => {
      const h = caja.current?.offsetHeight || 0;
      raiz.style.setProperty("--alto-franja", `${h}px`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (caja.current) ro.observe(caja.current);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
      raiz.style.removeProperty("--alto-franja");
    };
  }, [alarmas]);

  if (!alarmas.length) return null;

  return (
    <div className="alarma-franja" ref={caja}>
      {alarmas.map(a => {
        const e = estadoAlarma(a);
        return (
          /* Lleva a SU CASO y no a la ficha de la entidad: el caso es donde se
             trabaja y donde está la conversación. Mandar a la ficha sería
             enseñar el problema otra vez en vez de llevar a hacer algo. */
          <Link key={a.id} href={a.caso_id ? `/caso/${a.caso_id}` : "/"}
            className="alarma-item" title={`${a.motivo}\n\n${pieAlarma(a)}`}>
            <b>🚨 {a.titulo}</b>
            {/* Quién la lleva, en la propia franja: sin eso, cada uno de los
                diez que la ven tiene que abrir el caso para saber si le toca a
                él — y como abrirlo cuesta, no lo abre nadie. */}
            {!!a.gente?.length && (
              <span className="alarma-franja-quien">
                le toca a {a.gente.map(p => p.nombre).filter(Boolean).join(", ")}
              </span>
            )}
            {/* La alarma se delata sola cuando pasa su fecha de revisión: deja
                de hablar del problema y empieza a hablar de sí misma. Es lo
                que impide que se quede encendida para siempre. */}
            {e.aviso && <span className="alarma-vieja">· {e.aviso}</span>}
            <span className="alarma-ir">ver el caso →</span>
          </Link>
        );
      })}
    </div>
  );
}
