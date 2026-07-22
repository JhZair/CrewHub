import EventoHistorial, { icoDe, textoEvento, type Evento } from "@/components/EventoHistorial";

/* Una ráfaga de bitácora plegada: «JohnO vinculó persona: Carlos… · +8 más».
   Se despliega y adentro está cada evento tal cual, con su hora. El resumen
   reusa `textoEvento` del primero para no inventar una segunda redacción de
   lo mismo. */
export default function EventoGrupo({ items, horaDe, conEntidad }: {
  items: Evento[];
  horaDe: (e: Evento) => string;
  conEntidad?: boolean;
}) {
  if (!items.length) return null;
  const e0 = items[0];
  const ultimo = items[items.length - 1];
  const h1 = horaDe(e0), h2 = horaDe(ultimo);

  return (
    <details className="ev-grupo">
      <summary>
        <span className="eg-ico">{icoDe(e0.tipo)}</span>
        <span className="eg-txt">
          {textoEvento(e0)}
          <b className="eg-n">+{items.length - 1} más</b>
        </span>
        <span className="eg-t">{h1 === h2 ? h1 : `${h2} — ${h1}`}</span>
      </summary>
      <div className="tl eg-detalle">
        {items.map((e, i) => (
          <EventoHistorial key={i} e={e} hora={horaDe(e)} conEntidad={conEntidad} />
        ))}
      </div>
    </details>
  );
}
