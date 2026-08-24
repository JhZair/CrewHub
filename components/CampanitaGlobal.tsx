"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { misNotificaciones, marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { pedirZocalo } from "@/lib/zocalo";

/* Campanita flotante global: aparece en las páginas internas (no en el feed,
   que ya tiene la suya, ni dentro de los paneles del Monitor). Trae las
   notificaciones bajo demanda y se actualiza en tiempo real. */

import { rutaNotif, esAutomatica, agruparNotifs, SQL_DE_COLUMNA } from "@/lib/notificaciones";
import NotifFila from "./NotifFila";
/* La fila salió a NotifFila: la pintaban idéntica esta campanita, la del feed
   y la página /notificaciones. */

export default function CampanitaGlobal() {
  const pathname = usePathname() || "";
  // Oculta en login, en el feed (que ya tiene su campanita) y en la propia
  // página de notificaciones (que ES el centro de notificaciones, con su realtime).
  const oculto = pathname.startsWith("/login") || pathname === "/" || pathname.startsWith("/notificaciones");
  const [esTop, setEsTop] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [sinLeer, setSinLeer] = useState(0);        // personales
  const [sinLeerBot, setSinLeerBot] = useState(0);
  const [pestana, setPestana] = useState<"mias" | "bot">("mias");
  const [abierta, setAbierta] = useState(false);

  useEffect(() => { setEsTop(window.self === window.top); }, []);

  /* Columnas que la base todavía no tiene. Mientras falten, los avisos que
     dependen de ellas llegan sin destino: se ven, se leen, y al pulsarlos no
     pasa nada. Eso hay que decirlo aquí y no dejarlo en un comentario. */
  const [faltan, setFaltan] = useState<string[]>([]);

  useEffect(() => {
    if (oculto || !esTop) return;
    const pintar = (r: any) => {
      setItems(r.items || []); setSinLeer(r.sinLeer || 0); setSinLeerBot(r.sinLeerBot || 0);
      setFaltan(r.faltan || []);
    };
    /* En vivo se sigue pidiendo solo lo de aquí: que llegue una notificación no
       tiene por qué recargar el banco de trabajo ni el menú. */
    const cargar = async () => pintar(await misNotificaciones());
    /* Al navegar, en cambio, los tres del zócalo preguntan a la vez — y esto
       hace que compartan UNA llamada en vez de encolar cuatro POST (4772 ms
       medidos). Ver lib/zocalo.ts. */
    pedirZocalo(pathname).then(z => pintar(z.notifs)).catch(() => {});
    const supabase = createClient();
    let vivo = true;
    // Canal síncrono + nombre único por montaje: `createClient` es singleton, un
    // nombre fijo reutilizaría un canal ya suscrito y `.on()` reventaría.
    const canal = supabase.channel(`campanita-global-${Math.random().toString(36).slice(2)}`);
    canal.on("postgres_changes",
      { event: "*", schema: "public", table: "notificaciones" }, () => cargar());
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => { vivo = false; supabase.removeChannel(canal); };
  }, [oculto, esTop, pathname]);

  if (oculto || !esTop) return null;

  // Abrir NO marca nada: solo muestra. El número persiste hasta atender.
  const abrir = () => setAbierta(a => !a);

  // Atender una sola: se marca leída y baja el contador de su grupo.
  /* Atender un GRUPO: marca de una vez todas las del mismo caso. Si no, leías
     los cuatro comentarios y el timbre seguía marcando tres. Se mandan en
     paralelo y el contador baja por las que de verdad estaban sin leer. */
  const marcarGrupo = async (g: any) => {
    if (!g.idsSinLeer.length) return;
    const pendientes = new Set<string>(g.idsSinLeer);
    setItems(prev => prev.map(x => pendientes.has(x.id) ? { ...x, leida: true } : x));
    if (esAutomatica(g.n)) setSinLeerBot(c => Math.max(0, c - pendientes.size));
    else setSinLeer(c => Math.max(0, c - pendientes.size));
    await Promise.all(g.idsSinLeer.map((id: string) => marcarNotifLeida(id)));
  };

  // Marca todas las de la pestaña actual (no las de la otra).
  const marcarTodas = async () => {
    const esBot = pestana === "bot";
    setItems(prev => prev.map(n => esAutomatica(n) === esBot ? { ...n, leida: true } : n));
    if (esBot) setSinLeerBot(0); else setSinLeer(0);
    await marcarNotifsLeidas(esBot ? "bot" : "personal");
  };

  const badge = sinLeer;   // el timbre = solo lo personal
  const lista = items.filter(n => esAutomatica(n) === (pestana === "bot"));
  /* Sin useMemo A PROPÓSITO. Va después del `return null` de arriba, así que
     como hook cambiaba el número de hooks entre renders y React reventaba
     («Rendered more hooks than during the previous render»). Y de todos modos
     no memoizaba nada: `lista` es un filter nuevo en cada render, así que la
     dependencia cambiaba siempre. Son 12 elementos como mucho. */
  const grupos = agruparNotifs(lista);
  const nPestana = pestana === "bot" ? sinLeerBot : sinLeer;

  return (
    <div className="camp-flot">
      <button className="camp-flot-btn" onClick={abrir} title="Notificaciones">
        🔔{badge > 0 && <span className="camp-badge">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {abierta && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierta(false)} />
          <div className="camp-menu camp-menu-flot">
            <div className="camp-tabs">
              <button className={`camp-tab ${pestana === "mias" ? "on" : ""}`} onClick={() => setPestana("mias")}>
                👤 Para ti{sinLeer > 0 && <span className="camp-tabn">{sinLeer}</span>}
              </button>
              <button className={`camp-tab ${pestana === "bot" ? "on" : ""}`} onClick={() => setPestana("bot")}>
                🤖 Del Bot{sinLeerBot > 0 && <span className="camp-tabn">{sinLeerBot}</span>}
              </button>
              {nPestana > 0 && <button className="camp-marcar" onClick={marcarTodas}>✓ marcar</button>}
            </div>
            {/* ── EL MODO DEGRADADO, DICHO ──
                La bandeja sigue funcionando aunque falte un SQL —eso es lo
                correcto: una pantalla que ya servía no puede caerse porque
                otro módulo tenga una migración pendiente—. Lo que no puede
                es CALLARLO: sin esas columnas los avisos pierden su destino,
                y el síntoma que le llega a la persona es «no funciona el
                clic», sin un error en ninguna parte que lo explique. */}
            {faltan.length > 0 && (
              <div className="camp-degradado">
                ⚠ Estos avisos no pueden llevar a su destino: falta{faltan.length === 1 ? "" : "n"}{" "}
                {faltan.map(c => (
                  <b key={c}>{SQL_DE_COLUMNA[c] || c}</b>
                )).reduce((a: any, b: any) => a === null ? b : <>{a}, {b}</>, null)}
                {" "}en la base de datos.
              </div>
            )}
            {lista.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>
                {pestana === "bot" ? "Sin avisos del Bot por ahora. 🤖" : "Nada que requiera tu acción. ✨"}
              </div>
            )}
            {grupos.map((g: any) => (
              rutaNotif(g.n) ? (
                <Link key={g.n.id} href={rutaNotif(g.n)!}
                  className={`camp-item ${g.idsSinLeer.length ? "nueva" : "leida"}`}
                  onClick={() => { marcarGrupo(g); setAbierta(false); }}>
                  {/* El ✓ solo donde queda algo por leer: en una fila ya leída
                      sería un botón que no hace nada. */}
                  <NotifFila n={g.n} cuenta={g.cuenta} actores={g.actores}
                    onMarcar={g.idsSinLeer.length ? () => marcarGrupo(g) : undefined} />
                </Link>
              ) : (
                /* Sin ruta no hay enlace, y eso se NOTA: el cursor no cambia y
                   el título explica por qué. Una fila que parece pulsable y no
                   lo es enseña a desconfiar de todas las demás. */
                <div key={g.n.id} className={`camp-item ${g.idsSinLeer.length ? "nueva" : "leida"}`}
                  title="Este aviso no guarda a dónde llevar. Suele ser una migración pendiente en la base de datos."
                  onClick={() => marcarGrupo(g)} style={{ cursor: g.idsSinLeer.length ? "pointer" : "default" }}>
                  <NotifFila n={g.n} cuenta={g.cuenta} actores={g.actores}
                    onMarcar={g.idsSinLeer.length ? () => marcarGrupo(g) : undefined} />
                </div>
              )
            ))}
            <Link href={pestana === "bot" ? "/notificaciones?t=bot" : "/notificaciones"} className="camp-vertodas" onClick={() => setAbierta(false)}>
              ver todas →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
