"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { cambiarCuentaActiva, invitarCorreo, quitarInvitacion, enlazarCuentaPersona } from "@/app/actions";
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

/** Una persona del sistema, para el selector de cada fila. */
export type FichaPersona = { id: string; nombre: string; libre: boolean };

/** Un correo invitado que todavía no ha entrado nunca. */
export type Invitacion = {
  email: string; nota?: string | null; creado_en?: string | null;
  /** De dónde sale la invitación. «entorno» es ALLOWED_EMAILS, que esta
   *  pantalla no puede tocar: solo ofrecer pasarla a la lista de la base. */
  origen?: "lista" | "entorno";
};

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
  persona?: { id: string; nombre: string; tipo?: string | null; rol?: string | null } | null;
  /** Cuánto ha escrito. Lo cuenta Postgres, no esta lista. */
  casos: number;
  comentarios: number;
};

export default function CuentasPanel({
  cuentas, yo, personas = [], invitaciones = [], sinInvitaciones = false,
  puedoCruzar = true, tambienEnEntorno = [], sinConteo = false, correoViejo = false,
}: {
  cuentas: Cuenta[]; yo: string;
  /** Las fichas de persona, para atar una cuenta a la suya. */
  personas?: FichaPersona[];
  /** Invitados que aún no han entrado. Son la mitad que falta de la lista: sin
   *  ellos, invitar a alguien no deja rastro visible hasta que esa persona
   *  entra, y no hay forma de saber si se escribió bien el correo. */
  invitaciones?: Invitacion[];
  /** Sin db/invitaciones.sql no hay lista que enseñar ni a quién invitar. */
  sinInvitaciones?: boolean;
  /** Si se puede saber quién de los invitados ya entró. Cuando no, la lista de
   *  pendientes no se enseña —saldría todo el equipo dentro— y se dice. */
  puedoCruzar?: boolean;
  /** Correos que están en la lista Y en ALLOWED_EMAILS. Quitarlos de aquí no
   *  les quita la entrada, y eso hay que decirlo antes, no mañana. */
  tambienEnEntorno?: string[];
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
  const [nuevo, setNuevo] = useState("");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState("");

  const correr = async (clave: string, fn: () => Promise<any>) => {
    setErr(""); setOcupado(clave);
    const res: any = await fn();
    setOcupado(null);
    if (res?.error) setErr(res.error); else router.refresh();
  };

  const invitar = async () => {
    if (!nuevo.trim()) return;
    setErr(""); setOcupado("invitar");
    const res: any = await invitarCorreo(nuevo, nota);
    setOcupado(null);
    if (res?.error) { setErr(res.error); return; }
    setNuevo(""); setNota(""); router.refresh();
  };

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
          El correo de cada cuenta no llega: lo que responde es la primera
          versión de <b>resumen_cuentas</b>, de cuando esa función aún no lo
          devolvía. Vuelve a correr <b>db/cuentas-activas.sql</b> — y si ya lo
          hiciste, lo que queda es la caché de PostgREST, que guarda la forma
          de cada función y no la revisa sola: en el SQL Editor,
          <code>notify pgrst, &apos;reload schema&apos;;</code>
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

      {err && <div className="empty" style={{ color: "var(--red)", marginBottom: 10 }}>⚠ {err}</div>}

      {sinInvitaciones && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          Para dar de alta a alguien desde aquí falta correr
          <b> db/invitaciones.sql</b>. Mientras tanto, quién puede entrar lo
          sigue decidiendo la variable <b>ALLOWED_EMAILS</b> de Vercel, y
          añadir un correo ahí exige volver a desplegar.
        </div>
      )}

      {/* ── DAR DE ALTA ──
          Esto era editar una variable de entorno en Vercel y volver a
          desplegar. La decisión no es de programador y el trámite sí, y encima
          toca hacerlo el día que la persona llega. */}
      {!sinInvitaciones && (
        <div className="cta-invitar">
          <b style={{ fontSize: 12.5 }}>Invitar a alguien</b>
          <input value={nuevo} onChange={e => setNuevo(e.target.value)}
            placeholder="su correo de Google" type="email" autoComplete="off"
            onKeyDown={e => { if (e.key === "Enter") invitar(); }} />
          {/* La nota no es adorno: dentro de un año, un correo suelto en la
              lista no dice si sigue teniendo sentido que esté. */}
          <input value={nota} onChange={e => setNota(e.target.value)}
            placeholder="para qué (opcional)"
            onKeyDown={e => { if (e.key === "Enter") invitar(); }} />
          <button className="btn" disabled={!nuevo.trim() || ocupado === "invitar"}
            onClick={invitar}>{ocupado === "invitar" ? "…" : "Invitar"}</button>
          <span className="cta-ayuda">
            Con eso ya puede entrar con Google. Su cuenta aparecerá sola en esta
            lista la primera vez que lo haga — no hay que crear nada más.
          </span>
        </div>
      )}

      {/* Invitados que todavía no han entrado. Sin esta lista, invitar no deja
          rastro hasta que la persona entra, y un correo mal escrito no se
          descubre hasta que no puede entrar. */}
      {!puedoCruzar && !sinInvitaciones && (
        <div className="empty" style={{ color: "var(--dim)", marginBottom: 10, fontSize: 12 }}>
          La lista de invitados pendientes no se puede enseñar hasta que el correo
          de cada cuenta llegue (aviso de arriba): sin él no hay forma de saber
          quién ya entró, y saldría el equipo entero como si no hubiera entrado
          nunca. Invitar sí funciona.
        </div>
      )}

      {invitaciones.length > 0 && (
        <div className="cta-pend">
          <b style={{ fontSize: 12 }}>Invitados sin entrar todavía</b>
          {invitaciones.map(i => (
            <span key={i.email}
              className={`cta-pend-chip${i.origen === "entorno" ? " cta-entorno" : ""}`}>
              {i.email}
              {i.nota && <i style={{ color: "var(--dim)" }}> · {i.nota}</i>}
              {i.origen === "entorno" ? (
                /* No está en la tabla, así que no hay nada que quitar: está en
                   ALLOWED_EMAILS, que solo se toca en Vercel. Lo útil aquí es
                   lo contrario — pasarlo a la lista, que es el paso previo a
                   poder borrar la variable y acabar con las dos verdades. */
                <button className="cta-mas" title="Está en ALLOWED_EMAILS y no en la lista. Pásalo a la lista para poder dejar de depender de la variable de Vercel."
                  disabled={ocupado === i.email}
                  onClick={() => correr(i.email, () => invitarCorreo(i.email, "venía de ALLOWED_EMAILS"))}>
                  {ocupado === i.email ? "…" : "＋ a la lista"}
                </button>
              ) : (
                <button className="cta-x" title="Quitar de la lista"
                  disabled={ocupado === i.email}
                  onClick={() => correr(i.email, () => quitarInvitacion(i.email))}>
                  {ocupado === i.email ? "…" : "✕"}
                </button>
              )}
            </span>
          ))}
          <span className="cta-ayuda">
            Quitar a alguien de esta lista NO lo expulsa si ya entró: la invitación
            se mira al iniciar sesión. Para que deje de trabajar, apaga su cuenta
            en la tabla de abajo.
          </span>
        </div>
      )}

      {tambienEnEntorno.length > 0 && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10, fontSize: 12 }}>
          ⚠ Hay {tambienEnEntorno.length} correo{tambienEnEntorno.length === 1 ? "" : "s"} que
          está{tambienEnEntorno.length === 1 ? "" : "n"} a la vez en esta lista y en la
          variable <b>ALLOWED_EMAILS</b> de Vercel: quitarlo{tambienEnEntorno.length === 1 ? "" : "s"} de
          aquí no le{tambienEnEntorno.length === 1 ? "" : "s"} quita la entrada, porque la puerta
          suma las dos listas. Cuando todos los invitados estén en esta lista, borra la
          variable y esto se acaba.
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
            {/* Tres líneas: cómo se llama, con qué entró y qué sabe hacer. En
                ese orden, que es el de la pregunta: quién es, cómo lo compruebo,
                para qué sirve. El correo va en pequeño porque no se lee, se
                comprueba — pero cuando dos cuentas se llaman igual es lo único
                que decide. */}
            <span className="cta-id">
              <span className="cta-linea">
                <b>{c.nombre}</b>
                {c.id === yo && <span className="cta-chip">tú</span>}
                {c.es_admin && <span className="cta-chip" title="Puede entrar a /admin">admin</span>}
                {!c.es_admin && c.es_finanzas && (
                  <span className="cta-chip" title="Solo el panel de RHE">finanzas</span>
                )}
              </span>
              {/* Con qué entró y a quién corresponde. El correo desempata dos
                  cuentas del mismo nombre; la ficha dice si esa cuenta es de
                  alguien del colectivo. Cuando el correo no llega —solo lo
                  devuelve la función de la migración, y solo a administración—
                  la ficha sigue contestando la pregunta. */}
              <span className="cta-mail">
                {c.email && <span title={c.email}>{c.email}</span>}
                {c.persona && (
                  <a className="lnk" href={`/entidad/persona/${c.persona.id}`}
                    title="Abrir su ficha">
                    {c.email ? " · " : ""}👤 {c.persona.nombre}
                  </a>
                )}
                {/* Atar la cuenta a su ficha. Es lo que hace que salga su alias
                    corto en la caja, que se le puedan pagar jornadas y que esta
                    lista sepa quién es cada quien — y hasta hoy solo se podía
                    escribiendo SQL a mano. */}
                {personas.length > 0 && (
                  <select className="cta-sel" disabled={ocupado === `p:${c.id}`}
                    value={c.persona?.id || ""}
                    onChange={e => correr(`p:${c.id}`,
                      () => enlazarCuentaPersona(c.id, e.target.value || null))}>
                    <option value="">{c.persona ? "— desatar —" : "· sin ficha ·"}</option>
                    {personas
                      /* Las que ya tienen otra cuenta no se ofrecen: una cuenta
                         es una persona, y la base lo exige con un índice único.
                         Ofrecerlas sería enseñar una opción que da error. */
                      .filter(p => p.libre || p.id === c.persona?.id)
                      .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                )}
              </span>

              {/* ── LAS ESPECIALIDADES, EN SU PROPIA LÍNEA ──
                  Salen de la FICHA (`personas.rol`), no de la cuenta:
                  `perfiles.rol` existe en el esquema desde el primer día y no
                  lo escribe nadie en todo el repositorio. El rol de trabajo de
                  una persona es un dato de la persona, no de la llave con la
                  que entra.
                  Y van aquí abajo y no junto al nombre porque son DIEZ en
                  algunos casos: en la misma línea empujaban el nombre hasta
                  dejarlo en «Jo…», que es justo lo único que no puede faltar.
                  Se enseñan las tres primeras y se cuentan las demás — la lista
                  entera está en el título, para quien la busque. */}
              {c.persona?.rol && (() => {
                const todas = String(c.persona!.rol).split(",")
                  .map(x => x.trim()).filter(Boolean);
                const pocas = todas.slice(0, 3);
                return (
                  <span className="cta-rol" title={todas.join(" · ")}>
                    {pocas.join(" · ")}
                    {todas.length > pocas.length && (
                      <b style={{ color: "var(--dim)", fontWeight: 600 }}>
                        {" "}+{todas.length - pocas.length}
                      </b>
                    )}
                  </span>
                );
              })()}
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
