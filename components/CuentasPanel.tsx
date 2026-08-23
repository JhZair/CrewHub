"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { cambiarCuentaActiva } from "@/app/actions";
import { fechaCorta } from "@/lib/fechas";

/* ══════════════════════════════════════════════════════════════════════════
   QUIÉN PUEDE RECIBIR TRABAJO

   `perfiles` lo crea un trigger en CADA registro de Google. Nadie da de alta
   a nadie: quien entra una vez —a probar, con otra cuenta, por error— queda
   dentro, y con `activo = true`. Y la columna `activo` nació sin interruptor:
   ni acción ni política de escritura, así que en año y medio nadie pudo
   apagar una sola cuenta.

   El resultado se veía en el combo de asignar un caso: nombres que nadie
   reconoce y la misma persona tres veces, una por cada cuenta con la que se
   ha logueado. Un combo con nombres de más no da error — te deja asignarle un
   caso a alguien que no va a verlo nunca.

   ── LO QUE SE ENSEÑA PARA DECIDIR ──
   Cuántos casos y comentarios escribió cada cuenta. Es lo único que distingue
   de un vistazo a un miembro del colectivo de un login de paso, y es la
   pregunta que uno se hace justo antes de apagar: «¿esta quién es?».
   Y el CORREO, que es lo que desempata: «John Zair Oros P» y «John Zair Oros
   Pérez» son dos cuentas con el mismo nombre puesto por Google, y sin el
   correo no hay forma de saber cuál apagar. Apagar la equivocada deja fuera a
   quien sí trabaja.

   No se enseña el último acceso porque no se puede: vive en `auth.users` y de
   ahí solo se saca lo que la función de la migración devuelve. Inventar una
   fecha aproximada aquí sería peor que no ponerla.
   ══════════════════════════════════════════════════════════════════════════ */

export type Cuenta = {
  id: string;
  nombre: string;
  avatar_url?: string | null;
  color?: string | null;
  rol?: string | null;
  activo?: boolean | null;
  es_admin?: boolean | null;
  es_finanzas?: boolean | null;
  creado_en?: string | null;
  /** El correo con el que entró. No está en `perfiles` —vive en `auth.users`—
   *  y solo llega si quien mira es administración: ver db/cuentas-activas.sql. */
  email?: string | null;
  /** La ficha de persona a la que está atada esta cuenta (`personas.usuario_id`).
   *  Es lo que contesta «¿esta quién es?» sin depender de `auth.users`, y una
   *  cuenta SIN ficha, con un «nada» al lado, es el retrato del login de paso. */
  persona?: { id: string; nombre: string; tipo?: string | null } | null;
  /** Cuánto ha escrito. Lo cuenta Postgres, no esta lista. */
  casos: number;
  comentarios: number;
};

export default function CuentasPanel({ cuentas, yo, sinConteo = false, correoViejo = false }: {
  cuentas: Cuenta[]; yo: string;
  /** Sin db/cuentas-activas.sql no hay función de conteo. Se DICE, y la
   *  columna queda en blanco: un cero inventado aquí es lo que haría apagar a
   *  quien no toca. */
  sinConteo?: boolean;
  /** La migración está, pero en su primera versión: cuenta y no trae correo.
   *  Se distingue de «no está» porque el arreglo es distinto —volver a correr
   *  el mismo archivo— y porque callarlo hacía parecer que los correos no
   *  existen. */
  correoViejo?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cambiar = async (c: Cuenta) => {
    const enciende = !c.activo;
    if (!enciende && !confirm(
      `¿Apagar la cuenta de ${c.nombre}?\n\n`
      + "Deja de salir en los combos de asignar y de recibir los avisos del "
      + "equipo. No se borra nada: lo que escribió sigue firmado con su nombre, "
      + "y su sesión no se cierra.")) return;
    setOcupado(c.id);
    const res: any = await cambiarCuentaActiva(c.id, enciende);
    setOcupado(null);
    if (res?.error) alert(res.error); else router.refresh();
  };

  /* Las encendidas primero y, dentro, las que más han escrito: la lista se lee
     de arriba abajo y lo de arriba es lo que se reconoce. Las apagadas se
     quedan al final, apagadas — no se esconden, que es de donde se vuelven a
     encender. */
  const orden = [...cuentas].sort((a, b) =>
    (b.activo ? 1 : 0) - (a.activo ? 1 : 0)
    || (sinConteo ? 0 : (b.casos + b.comentarios) - (a.casos + a.comentarios))
    || a.nombre.localeCompare(b.nombre));

  const nApagadas = cuentas.filter(c => !c.activo).length;

  return (
    <>
      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
        Toda cuenta que entra con Google aparece aquí sola, y con ella en el combo
        de asignar casos. Apagar una la saca de ese combo y de los avisos del
        equipo. De ningún sitio más: lo que escribió sigue siendo suyo, y su
        sesión no se cierra.
        {nApagadas > 0 && <> · {nApagadas} apagada{nApagadas === 1 ? "" : "s"}.</>}
      </p>
      {correoViejo && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          El correo de cada cuenta no llega porque la base se quedó con la
          primera versión de <b>resumen_cuentas</b>, de cuando esa función aún
          no lo devolvía. Vuelve a correr <b>db/cuentas-activas.sql</b>: lleva
          un <code>drop function</code> delante justo para este cambio.
        </div>
      )}
      {sinConteo && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          Hasta correr <b>db/cuentas-activas.sql</b> no se puede saber ni el
          correo de cada cuenta ni cuánto ha escrito —las dos cosas salen de la
          misma función—, así que esas columnas van vacías. Y el botón tampoco
          hará nada: la tabla de cuentas todavía no acepta cambios.
        </div>
      )}

      <div className="cta-cab">
        <span>Cuenta</span>
        <span style={{ textAlign: "right" }}>Escribió</span>
        <span>Primera entrada</span>
        <span />
      </div>

      {orden.map(c => (
        <div key={c.id} className={`cta-fila${c.activo ? "" : " fila-tenue"}`}>
          <span className="cta-nom">
            <Avatar nombre={c.nombre} src={c.avatar_url} color={c.color} size={30} />
            {/* Dos líneas: arriba cómo se llama, abajo con qué entró. El correo
                va debajo y en pequeño porque no se lee, se comprueba — pero
                cuando dos cuentas se llaman igual es lo único que decide. */}
            <span className="cta-id">
              <span className="cta-linea">
                <b>{c.nombre}</b>
                {c.id === yo && <span className="cta-chip">tú</span>}
                {c.es_admin && <span className="cta-chip" title="Puede entrar a /admin">admin</span>}
                {!c.es_admin && c.es_finanzas && (
                  <span className="cta-chip" title="Solo el panel de RHE">finanzas</span>
                )}
                {c.rol && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{c.rol}</span>}
              </span>
              {/* Con qué entró y a quién corresponde. El correo desempata dos
                  cuentas del mismo nombre; la ficha dice si esa cuenta es de
                  alguien del colectivo. Cuando el correo no llega —solo lo
                  devuelve la función de la migración, y solo a administración—
                  la ficha sigue contestando la pregunta. */}
              <span className="cta-mail">
                {c.email && <span title={c.email}>{c.email}</span>}
                {c.persona
                  ? <a className="lnk" href={`/entidad/persona/${c.persona.id}`}
                      title="Ficha de esta persona en el sistema">
                      {c.email ? " · " : ""}👤 {c.persona.nombre}
                    </a>
                  : <i>{c.email ? " · " : ""}sin ficha de persona</i>}
              </span>
            </span>
          </span>

          {/* Lo que ha escrito. Un cero aquí, con una primera entrada de hace
              meses, es la firma de un login de paso. */}
          <span style={{ textAlign: "right", color: "var(--muted)", fontSize: 11.5 }}>
            {sinConteo
              ? <i style={{ color: "var(--dim)" }}>—</i>
              : c.casos + c.comentarios === 0
              ? <i style={{ color: "var(--dim)" }}>nada</i>
              : <span title={`${c.casos} casos · ${c.comentarios} comentarios`}>
                  {c.casos ? `${c.casos} caso${c.casos === 1 ? "" : "s"}` : ""}
                  {c.casos && c.comentarios ? " · " : ""}
                  {c.comentarios ? `${c.comentarios} coment.` : ""}
                </span>}
          </span>

          <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
            {c.creado_en ? fechaCorta(c.creado_en) : "—"}
          </span>

          <span style={{ textAlign: "right" }}>
            {c.id === yo ? (
              /* El botón no se pinta apagado: uno que hay que descubrir que no
                 funciona es peor que ninguno. Se dice por qué no está. */
              <span style={{ color: "var(--dim)", fontSize: 11 }} title="Nadie se apaga a sí mismo">
                —
              </span>
            ) : (
              <button className="btn btn-ghost" disabled={ocupado === c.id}
                style={{ padding: "4px 10px", fontSize: 11.5,
                  color: c.activo ? "var(--muted)" : "var(--green)" }}
                onClick={() => cambiar(c)}>
                {ocupado === c.id ? "…" : c.activo ? "Apagar" : "Encender"}
              </button>
            )}
          </span>
        </div>
      ))}
    </>
  );
}
