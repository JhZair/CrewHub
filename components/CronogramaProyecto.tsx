"use client";
import {
  agregarActividadCrono, editarActividadCrono, moverActividadCrono,
  cancelarActividadCrono, materializarActividad,
  guardarComoPlantilla, aplicarPlantilla,
  asignarResponsableActividad, cambiarFechaActividad, fijarEquipoActividad,
  reordenarEtapa, ordenarEtapaPorFecha,
  atarCasoAActividad, soltarCasoDeActividad, casosLibresDelFondo,
  replanificarActividad,
} from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { Fragment, useEffect, useState } from "react";
import MiniSelect from "@/components/MiniSelect";
import CorrerCronograma from "@/components/CorrerCronograma";
import NavFechas from "@/components/NavFechas";
import Avatar from "@/components/Avatar";
import VistaRapida from "@/components/VistaRapida";
import FechaMini from "@/components/FechaMini";
import { sinBot } from "@/lib/personas";
import { type Etapa, ETAPAS_CINE, nombreEtapa } from "@/lib/etapas";
import { DIAS_AVISO_DEF } from "@/lib/plazo";
import { opcionesResp } from "@/lib/personas";
import { repartirCasos, resumenCasos, casoCerrado, type CasoMin } from "@/lib/casosActividad";
import { rotuloEstado, claseEstado } from "@/lib/estados";
/* `nombreEtapa` queda solo de respaldo: ver `nomEtapa` abajo. */

/* Las etapas ya no son fijas: llegan por prop (la categoría de la convocatoria
   las decide; ver lib/etapas). Por defecto, las de cine. El ORDEN y el mapa de
   COLOR se derivan de esa lista dentro del componente. */

const CHIP: Record<string, [string, string]> = {
  planificada: ["PLANIFICADA", "var(--dim)"],
  materializada: ["CASO ABIERTO", "var(--violet)"],
  en_progreso: ["EN PROGRESO", "var(--yellow)"],
  finalizada: ["FINALIZADA", "var(--green)"],
};
const BARRA: Record<string, string> = {
  planificada: "transparent",
  materializada: "var(--violet)",
  en_progreso: "var(--yellow)",
  finalizada: "var(--green)",
};

/* Ventanas del Gantt. «Todo» primero y por defecto: es lo que había antes y lo
   correcto para un cronograma corto. Las largas existen para los de ejecución
   de un fondo, que llegan a dos años y donde meter todo en el ancho de la
   pantalla es no distinguir nada. */
const ZOOM_G = [
  { lbl: "Todo", d: 0 },
  { lbl: "3 meses", d: 93 },
  { lbl: "6 meses", d: 186 },
  { lbl: "1 año", d: 365 },
  { lbl: "2 años", d: 730 },
];

const dia = 86400000;
const pd = (s: string) => new Date(s + "T12:00:00").getTime();
const fmt = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

type Campos = { nombre: string; etapa: string; ini: string; fin: string;
  responsable: string; antic: string; clase: string; descripcion: string; equipo: string[] };

const capi = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Como `fmt` pero con el año: para rangos que cruzan diciembre. */
const fmtAnio = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "7px 10px", fontSize: 12.5, outline: "none", color: "var(--text)" } as const;

/* Un solo formulario para crear y para editar.
   Antes solo existía el de crear —el cronograma no se podía corregir— y la
   tentación era escribir otro igual para editar. Dos formularios del mismo
   objeto es el error del día: el día que se agregue un campo, se agrega en
   uno solo. */
function FormAct({ f, setF, perfiles, etapas, onSave, onCancel, ocupado, editar }: {
  f: Campos; setF: (x: Campos) => void;
  perfiles: { id: string; nombre: string }[];
  etapas: Etapa[];
  onSave: () => void; onCancel: () => void; ocupado: boolean; editar?: boolean;
}) {
  /* Antes se podía pulsar Guardar con la fecha vacía: el servidor lo rechazaba
     y el navegador escupía un alert(). Dejar pulsar algo que ya sabemos que va
     a fallar es hacerle perder el tiempo a alguien para después regañarlo.
     El botón dice qué falta y no deja. */
  const falta = !f.nombre.trim() ? "Ponle nombre a la actividad"
    : !f.ini ? "Falta la fecha de inicio"
    : f.fin && f.fin < f.ini ? "El fin no puede ser antes del inicio"
    : "";
  /* Nómina para el equipo de apoyo (sin el bot). El corto = primer nombre. */
  const plantelF = sinBot(perfiles);
  const cortoF = (id: string) => (plantelF.find(p => p.id === id)?.nombre || "").split(" ")[0];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
      {/* Tres clases, y la diferencia entre ellas es QUIÉN abre el caso:
          · trabajo       → el Bot lo abre solo cuando se acerca la fecha
          · hito_externo  → lo abre igual, pero como aviso con cuenta regresiva
          · continua      → NADIE lo abre solo; se materializa a mano si algún
            día hace falta. Es para lo que ocurre durante todo un tramo en vez
            de resolverse un día: dirección en tiempo real, cierre de jornada,
            respaldo de datos. Un caso para eso nace muerto — nadie lo cierra —
            y el tablero aprende a tener casos que nadie cierra. */}
      <select style={{ ...inp, borderColor: f.clase === "hito_externo" ? "var(--blue)" : f.clase === "continua" ? "var(--teal)" : "var(--border)" }}
        value={f.clase} onChange={e => setF({ ...f, clase: e.target.value })}>
        <option value="trabajo">✅ Trabajo nuestro</option>
        <option value="hito_externo">🏛 Hito del concurso</option>
        <option value="continua">🔁 Práctica continua</option>
      </select>
      <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Actividad *"
        value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
      <select style={inp} value={f.etapa} onChange={e => setF({ ...f, etapa: e.target.value })}>
        {etapas.map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
      </select>
      {/* El inicio en rojo cuando falta: la fecha vacía es lo que más frena
          este formulario y hasta ahora no se distinguía de la de fin. */}
      <input type="date" title="Inicio *" value={f.ini}
        style={{ ...inp, borderColor: f.ini ? "var(--border)" : "var(--red)" }}
        onChange={e => setF({ ...f, ini: e.target.value })} />
      <input type="date" style={inp} title="Fin (si dura más de un día)" value={f.fin}
        onChange={e => setF({ ...f, fin: e.target.value })} />
      {/* Al elegir responsable, se le saca del equipo de apoyo: es líder, no
          apoyo — nadie en los dos a la vez. */}
      {/* Este formulario también EDITA, así que puede llegar con un
          responsable que ya está de baja — y entonces ninguna opción casa y el
          navegador pinta «Responsable...», indistinguible de sin asignar. El
          combo al vuelo de la fila ya lo decía; este se quedaba callado. */}
      <select style={inp} value={f.responsable}
        onChange={e => setF({ ...f, responsable: e.target.value, equipo: f.equipo.filter(x => x !== e.target.value) })}>
        {opcionesResp(plantelF, f.responsable, "Responsable...").map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <label style={{ color: "var(--dim)", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
        avisar <input type="number" min={0} max={60} style={{ ...inp, width: 54 }}
          value={f.antic} onChange={e => setF({ ...f, antic: e.target.value })} /> días antes
      </label>
      <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
        title={falta || undefined} disabled={!!falta || ocupado} onClick={onSave}>
        {ocupado ? "…" : editar ? "Guardar cambios" : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={onCancel}>Cancelar</button>
      {/* Equipo de apoyo (opcional), en su propia fila: el responsable rinde
          cuentas; estos son los demás que trabajan la actividad. Chips con ✕ y
          un ＋ para sumar (sin el responsable ni los que ya están). */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
        <span style={{ color: "var(--dim)", fontSize: 11.5 }}>👥 Equipo de apoyo:</span>
        {f.equipo.length === 0 && <span style={{ color: "var(--dim)", fontSize: 11 }}>— opcional —</span>}
        {f.equipo.map(pid => (
          <span key={pid} className="sc-btn puesto resp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            👤 {cortoF(pid) || "⚠"}
            <button type="button" title="Quitar del equipo" style={{ color: "var(--dim)", padding: 0, lineHeight: 1 }}
              onClick={() => setF({ ...f, equipo: f.equipo.filter(x => x !== pid) })}>✕</button>
          </span>
        ))}
        <select style={{ ...inp, padding: "5px 8px" }} value=""
          onChange={e => { const v = e.target.value; if (v) setF({ ...f, equipo: [...f.equipo, v] }); }}>
          <option value="">＋ apoyo…</option>
          {plantelF.filter(p => p.id !== f.responsable && !f.equipo.includes(p.id))
            .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      {/* La descripción va en su propia fila completa: es texto, no un dato de
          una línea, y un input estrecho junto a las fechas invitaría a
          resumirla. Opcional — el nombre basta para planificar; esto es el
          «cómo» para quien la ejecuta. */}
      <textarea style={{ ...inp, width: "100%", minHeight: 56, resize: "vertical", lineHeight: 1.5 }}
        placeholder="Descripción (opcional): qué se espera, cómo hacerla, qué entregar…"
        value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} />
      {/* Y se dice en voz alta, no solo en el tooltip: un botón apagado sin
          explicación es un botón roto. */}
      {falta && <span style={{ color: "var(--yellow)", fontSize: 11.5, width: "100%" }}>⚠ {falta}</span>}
    </div>
  );
}

export default function CronogramaProyecto({ dueno = "proyecto", duenoId, actividades, perfiles, plantillas = [], tipoProyecto = "", etapas = ETAPAS_CINE, limite, limiteNombre, puedeCorrer = false }: {
  dueno?: "proyecto" | "convocatoria" | "postulacion";
  duenoId: string;
  actividades: any[];
  /* ── EL PLAZO, PARA «CORRER FECHAS» ──
     Opcionales y solo con sentido en una postulación: los usa la
     previsualización para avisar si el cronograma corrido termina después del
     plazo. Quien no los mande no ve ese aviso —y no ve uno falso, que es lo
     importante—: el resto del cuadro funciona igual.
     Salen de `plazoFondo()`, que ya decide cuál de las tres fechas manda
     (prórroga > acta > desembolso + 1 año). Calcularlo aquí habría hecho que
     esta pantalla y la ficha del fondo dijeran plazos distintos. */
  limite?: string | null;
  /** Sin artículo: «plazo del acta». Las frases lo contraen («del plazo…»). */
  limiteNombre?: string;
  /* ── QUIÉN VE «CORRER FECHAS» ──
     Estrictamente `es_admin`, el MISMO listón que la acción — que es el de
     `guardarVersionFondo`, porque correr sella versiones. Sin esto, cualquiera
     veía el botón, armaba el plan entero, elegía fecha, escribía el motivo y
     recibía «Solo administración corre el cronograma» al pulsar.
     ⚠ NO es el `esAdmin` de la ficha del fondo, que incluye `es_finanzas`: dos
     listones para la misma tabla es cómo se llega a un botón que miente. */
  puedeCorrer?: boolean;
  /* `foto`/`color` son opcionales: solo se usan para el avatar del Gantt, y
     quien no los mande verá las iniciales sobre su color por defecto. */
  perfiles: { id: string; nombre: string; foto?: string | null; avatar_url?: string | null; foto_url?: string | null; color?: string | null }[];
  plantillas?: { id: string; nombre: string; tipo_proyecto: string | null; n: number }[];
  tipoProyecto?: string;
  /** Etapas de esta categoría; por defecto las de cine. */
  etapas?: Etapa[];
}) {
  /* ORDEN y COLOR se derivan de la lista de etapas (que puede venir de la
     categoría de la convocatoria). El resto del componente los usa igual que
     antes, cuando eran constantes fijas. */
  const ETAPA_ORDEN = etapas.map(e => e.clave);
  const ETAPA_COLOR: Record<string, string> = Object.fromEntries(etapas.map(e => [e.clave, e.color]));
  /* El nombre sale del preset de ESTA categoría, no del mapa global de
     lib/etapas. El mapa es por clave y el último gana, así que dos categorías
     que comparten clave con distinto nombre —pasa: `desarrollo` es «Desarrollo»
     en cine y «Desarrollo (arte, layout)» en Desarrollo de proyecto— hacían que
     el rótulo de una saliera con el texto de la otra. Aquí siempre hay preset a
     la mano; `nombreEtapa` queda para quien no lo tiene (la agenda). */
  const ETAPA_NOMBRE: Record<string, string> = Object.fromEntries(etapas.map(e => [e.clave, e.nombre]));
  const nomEtapa = (clave: string) => ETAPA_NOMBRE[clave] || nombreEtapa(clave);
  // Etapa por defecto de una actividad nueva: rodaje/producción si existe, si
  // no la primera de la categoría.
  const etapaDef = etapas.some(e => e.clave === "produccion") ? "produccion" : (etapas[0]?.clave || "produccion");

  const [vista, setVista] = useState<"lista" | "gantt">("lista");
  /* Ventana visible del Gantt. Arranca en «Todo» —el comportamiento de
     siempre: que quepa el cronograma entero— porque para uno de doce
     actividades es lo que uno quiere ver. Los de dos años son los que piden
     ventana, y ahí se elige. */
  const [zoomG, setZoomG] = useState(0);
  const [desdeG, setDesdeG] = useState("");   // ISO; vacío = el inicio del cronograma
  const [ancho, setAncho] = useState(false);
  const [confirmando, setConfirmando] = useState<{ id: string; accion: "mat" | "del" } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const VACIO: Campos = { nombre: "", etapa: etapaDef, ini: "", fin: "", responsable: "", antic: String(DIAS_AVISO_DEF), clase: "trabajo", descripcion: "", equipo: [] };
  const [f, setF] = useState<Campos>(VACIO);
  // Editar: faltaba entero. Una fecha mal puesta solo se podía arreglar
  // cancelando la actividad y creándola de nuevo, perdiendo su historia.
  const [editando, setEditando] = useState<string | null>(null);
  const [ef, setEf] = useState<Campos>(VACIO);
  // Plantillas: el panel se declara aquí y no junto a sus funciones porque el
  // Escape de más abajo lo lee, y un `const` no existe antes de su línea.
  const [panel, setPanel] = useState<"" | "guardar" | "aplicar" | "correr">("");
  const [nomPl, setNomPl] = useState("");
  const [plSel, setPlSel] = useState("");
  const [desde, setDesde] = useState("");
  const [ocupado, setOcupado] = useState(false);
  /* Los avisos, dentro de la tarjeta — como en Miembros, Credenciales y el
     formulario de entidades. Este componente usaba `alert()` del navegador:
     una caja gris que dice «localhost:3000 dice», que tapa la pantalla, que
     hay que aceptar, y que no se parece en nada al resto del sistema. Un
     error no es una interrupción del navegador: es algo que la pantalla tiene
     que decir sin dejar de ser ella. */
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const router = useRouter();
  const fallo = (r: any) => { if (r?.error) { setError(r.error); return true; } setError(""); return false; };

  /* CAMBIOS AL VUELO (responsable / fecha), como en sub-casos: repartir sin
     abrir el editor entero. Candado POR FILA —lista, no un booleano global—:
     tocar la fila B mientras la A guarda no se come el clic en silencio. */
  /* ── ARRASTRAR PARA REORDENAR ──
   * Las flechas ▲▼ suben un escalón por clic, y cada clic es un viaje más un
   * repintado: la fila se mueve, la lista se redibuja y hay que volver a
   * buscarla con el ratón antes del siguiente. Subir tres puestos son tres
   * rondas de eso. Se quedan —sirven para el ajuste de uno y funcionan con
   * teclado y en el móvil, donde arrastrar es un suplicio— pero ya no son la
   * única forma.
   * `orden` local: la lista se recoloca AL SOLTAR, sin esperar al servidor. Sin
   * eso, la fila vuelve a su sitio y salta al de destino medio segundo después,
   * y el ojo no sabe si funcionó.
   * `arrastrando` guarda id + etapa: se compara la etapa al soltar para no
   * dejar caer una actividad de rodaje dentro de postproducción, que aquí no
   * significaría reordenar sino cambiarle la etapa sin decirlo. */
  const [arrastrando, setArrastrando] = useState<{ id: string; etapa: string } | null>(null);
  const [sobreFila, setSobreFila] = useState<string | null>(null);
  const [ordenLocal, setOrdenLocal] = useState<Record<string, string[]>>({});
  /* Los casos del fondo aún sin actividad, pedidos al abrir el selector y no en
     cada carga: son dos consultas para un desplegable que casi nunca se abre. */
  const [atando, setAtando] = useState<string | null>(null);
  const [casosLibres, setCasosLibres] = useState<any[] | null>(null);
  const [guardandoFila, setGuardandoFila] = useState<string[]>([]);
  const alVuelo = async (id: string, fn: () => Promise<any>) => {
    if (guardandoFila.includes(id)) return;
    setGuardandoFila(g => [...g, id]); setError("");
    const res: any = await fn();
    setGuardandoFila(g => g.filter(x => x !== id));
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };
  /* El menú lleva el nombre largo —ahí se elige, hay que reconocer a quién—; el
     botón, el corto (primer nombre). `perfiles` viene filtrado por activo: uno
     asignado a alguien dado de baja no se encuentra, y eso se dice (⚠ de baja),
     no se pinta como un dato normal. */
  /* `plantel` es la nómina del equipo (los perfiles), para elegir responsable
     y apoyo. Se llama así y no `equipo` para no chocar con `a.equipo`, que es
     el equipo de apoyo YA puesto en cada actividad. */
  const plantel = sinBot(perfiles);
  const OPC_RESP: [string, string][] = [
    ["", "Sin asignar"],
    ...plantel.map(p => [p.id, p.nombre] as [string, string]),
  ];
  const cortoResp = (id: string) => (plantel.find(p => p.id === id)?.nombre || "").split(" ")[0];
  const respInactivo = (id: string) => !!id && !plantel.some(p => p.id === id);
  const respDe = (id?: string | null) => (id ? plantel.find(p => p.id === id) : null) || null;
  /* La foto viene con tres nombres según de dónde salga la nómina: `foto` (lo
     que arma la página para el equipo de postulación), `avatar_url` (perfiles)
     o `foto_url` (personas). Se resuelve aquí y no en cada página para que
     agregar una nómina nueva no obligue a recordar el nombre correcto. */
  const fotoDe = (p: any) => p?.foto || p?.avatar_url || p?.foto_url || null;

  /* Escape cierra. Pero no si hay algo abierto encima —editando, agregando o
     una plantilla a medias—: ahí Escape cancela ESO, y cerrar la ventana
     entera tiraría lo que estaba escribiendo. Un atajo que borra trabajo se
     usa una vez. */
  useEffect(() => {
    if (!ancho) return;
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editando) { setEditando(null); return; }
      if (agregando) { setAgregando(false); return; }
      if (panel) { setPanel(""); return; }
      setAncho(false);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ancho, editando, agregando, panel]);

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const res = await agregarActividadCrono(dueno, duenoId, f);
    setOcupado(false);
    if (fallo(res)) return;
    setF({ ...f, nombre: "", ini: "", fin: "", responsable: "", descripcion: "", equipo: [] });
    setAgregando(false);
    router.refresh();
  };

  const abrirEdicion = (a: any) => {
    setEditando(a.id);
    setEf({
      nombre: a.nombre || "", etapa: a.etapa || etapaDef,
      ini: a.fecha_inicio || "", fin: a.fecha_fin || "",
      responsable: a.responsable || "", antic: String(a.dias_anticipacion ?? DIAS_AVISO_DEF),
      clase: a.clase || "trabajo", descripcion: a.descripcion || "",
      equipo: a.equipo || [],
    });
  };
  const guardarEdicion = async () => {
    if (ocupado || !editando) return;
    setOcupado(true);
    const res: any = await editarActividadCrono(editando, dueno, duenoId, ef);
    setOcupado(false);
    if (fallo(res)) return;
    setEditando(null);
    router.refresh();
  };

  /* Mover DENTRO DE LA ETAPA (a cualquier fecha). La secuencia de una etapa
     —Sincronización → Color → Logging→…— la decide una persona, no la fecha;
     dentro de la etapa manda el orden manual y la fecha es solo el desempate
     por defecto. (La acción renumera la etapa; ver moverActividadCrono.) */
  /* Suelta: recoloca en local y manda la lista entera. Una sola escritura para
     cualquier distancia, en vez de una por escalón. */
  const soltarEn = async (etapaClave: string, destinoId: string, actual: string[]) => {
    const arr = arrastrando;
    setArrastrando(null); setSobreFila(null);
    if (!arr || arr.id === destinoId) return;
    /* Como todo lo demás del componente: no se encadena sobre otra escritura en
       vuelo. Sin esto se podía arrastrar mientras la anterior aún no había
       vuelto, y la segunda se calculaba sobre una lista que ya iba a cambiar. */
    if (ocupado) return;
    /* Entre etapas NO: soltar «Rodaje Nelly» en postproducción no es
       reordenar, es cambiarle la etapa, y eso se hace con ✎ para que quede
       claro lo que se está tocando. */
    if (arr.etapa !== etapaClave) {
      setError("Para pasarla a otra etapa, edítala con ✎ — arrastrar solo reordena dentro de la suya.");
      return;
    }
    const desde = actual.indexOf(arr.id);
    const hasta = actual.indexOf(destinoId);
    if (desde < 0 || hasta < 0) return;
    const nuevo = [...actual];
    nuevo.splice(hasta, 0, ...nuevo.splice(desde, 1));
    setOrdenLocal(o => ({ ...o, [etapaClave]: nuevo }));
    setError(""); setOcupado(true);
    /* `try/finally` y no un `await` pelado: si la acción LANZA —corte de red, o
       un despliegue que invalida el identificador de la acción—, sin esto no
       corren ni `setOcupado(false)` ni la limpieza de abajo. El componente
       entero se queda bloqueado (todo lo suyo es `disabled={ocupado}`) y encima
       enseñando un orden optimista que la base no tiene. */
    let res: any = null;
    try {
      res = await reordenarEtapa(dueno, duenoId, etapaClave || null, nuevo);
    } catch (e: any) {
      res = { error: `No hubo respuesta al reordenar: ${e?.message || "se cortó"}. Recarga para ver cómo quedó.` };
    } finally {
      setOcupado(false);
    }
    if (res?.error) setError(res.error);
    /* ── EL ORDEN LOCAL SE TIRA SIEMPRE, HAYA IDO BIEN O MAL ──
       Si falló, porque el de la base es el que manda y dejarlo pintado enseña
       un orden que no existe.
       Y si fue bien TAMBIÉN, que es lo que se me pasaba: la clave se quedaba
       para siempre, así que cualquier cambio posterior por otra vía —▲▼, otro
       usuario, ⏩ Correr fechas— seguía ordenándose por la lista vieja. La
       pantalla enseñaba una cosa y el siguiente arrastre mandaba otra.
       `router.refresh()` trae el orden real; el optimista ya cumplió su papel,
       que era tapar el medio segundo de espera. */
    setOrdenLocal(o => { const { [etapaClave]: _, ...resto } = o; return resto; });
    router.refresh();
  };

  const porFecha = async (etapaClave: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await ordenarEtapaPorFecha(dueno, duenoId, etapaClave || null);
    setOcupado(false);
    /* El orden local se tira y se refresca PASE LO QUE PASE. «El orden quedó a
       medias: 3 de 7» es un error, pero la base sí cambió: quedarse sin
       refrescar deja la lista enseñando el orden viejo junto al aviso. */
    setOrdenLocal({});
    router.refresh();
    if (fallo(res)) return;
    if (!res?.n) { setOk("Esta etapa ya estaba en orden de fecha."); setTimeout(() => setOk(""), 4000); }
  };

  const abrirAtar = async (actId: string) => {
    setAtando(actId); setCasosLibres(null); setError("");
    const r: any = await casosLibresDelFondo(dueno, duenoId);
    if (r?.error) { setError(r.error); setAtando(null); return; }
    setCasosLibres(r.casos || []);
  };
  const atar = async (actId: string, casoId: string) => {
    if (!casoId) return;
    setOcupado(true); setError("");
    const res: any = await atarCasoAActividad(actId, casoId, dueno, duenoId);
    setOcupado(false);
    setAtando(null); setCasosLibres(null);
    if (fallo(res)) return;
    router.refresh();
  };
  const replanificar = async (actId: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await replanificarActividad(actId, dueno, duenoId);
    setOcupado(false);
    if (fallo(res)) return;
    router.refresh();
  };

  /* Los casos de una fila, normalizados. El embed de PostgREST puede llegar
     como objeto si la relación se resolviera a uno solo, así que se blinda: un
     `.map` sobre un objeto revienta la pantalla entera. */
  const casosDe = (a: any): CasoMin[] =>
    Array.isArray(a?.casos) ? a.casos : a?.casos ? [a.casos] : [];

  /* Recibe el ID DEL CASO, no el de la actividad: ahora hay varios y cada chip
     suelta el suyo. */
  const soltarCaso = async (casoId: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await soltarCasoDeActividad(casoId, dueno, duenoId);
    setOcupado(false);
    if (fallo(res)) return;
    router.refresh();
  };

  const mover = async (id: string, dir: "sube" | "baja") => {
    if (ocupado) return;
    setOcupado(true);
    const res: any = await moverActividadCrono(id, dueno, duenoId, dir);
    setOcupado(false);
    if (!fallo(res)) router.refresh();
  };

  /* Plantillas. Aplicar suma, no reemplaza — por eso el panel solo se ofrece
     cuando el cronograma está vacío: aplicar sobre uno lleno duplicaría todo,
     y ése no es el momento en que a nadie se le ocurre usar una plantilla.
     (Su estado se declara arriba, junto al resto: el Escape lo necesita.) */
  const guardarPl = async () => {
    if (ocupado) return;
    setOcupado(true);
    const res: any = await guardarComoPlantilla(dueno, duenoId, nomPl, tipoProyecto);
    setOcupado(false);
    if (fallo(res)) return;
    setPanel(""); setNomPl("");
    // Se confirma en la tarjeta y se va solo: guardar bien no merece un clic
    setOk(`Plantilla «${nomPl}» guardada con ${res.n} actividades — ya se puede usar en otro proyecto.`);
    setTimeout(() => setOk(""), 6000);
    router.refresh();
  };
  const aplicarPl = async () => {
    if (ocupado || !plSel || !desde) return;
    setOcupado(true);
    const res: any = await aplicarPlantilla(plSel, dueno, duenoId, desde);
    setOcupado(false);
    if (fallo(res)) return;
    setPanel(""); setPlSel(""); setDesde("");
    router.refresh();
  };

  const materializar = async (id: string) => {
    setConfirmando(null);
    setOcupado(true);
    const res = await materializarActividad(id, dueno, duenoId);
    setOcupado(false);
    if (!fallo(res)) router.refresh();
  };

  const cancelar = async (id: string) => {
    setConfirmando(null);
    const res = await cancelarActividadCrono(id, dueno, duenoId);
    if (!fallo(res)) router.refresh();
  };

  const visibles = actividades.filter(a => a.estado !== "cancelada" && a.fecha_inicio);

  /* --- cálculo del Gantt --- */
  const minT = visibles.length ? Math.min(...visibles.map(a => pd(a.fecha_inicio))) : 0;
  const maxT = visibles.length ? Math.max(...visibles.map(a => pd(a.fecha_fin || a.fecha_inicio))) + dia : dia;
  /* La ventana. Con «Todo» son los extremos del cronograma (lo de siempre);
     con un zoom, un rango que empieza donde diga `desdeG` y dura lo elegido.
     Se ancla al INICIO DEL CRONOGRAMA y no a hoy: un cronograma de postulación
     empieza dentro de un año, y abrirlo en «hoy» habría mostrado una ventana
     vacía y la sensación de que no se cargó nada. Para ir a hoy está el botón. */
  const desdeT = ZOOM_G[zoomG].d === 0 ? minT
    : (desdeG ? pd(desdeG) : minT);
  const hastaT = ZOOM_G[zoomG].d === 0 ? maxT : desdeT + ZOOM_G[zoomG].d * dia;
  const span = Math.max(hastaT - desdeT, 7 * dia);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - desdeT) / span) * 100));
  const hoyT = Date.now();
  const hoyPct = pct(hoyT);
  const hoyDentro = hoyT >= desdeT && hoyT < hastaT;
  const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10);
  const moverG = (dias: number) => setDesdeG(isoDe((desdeG ? pd(desdeG) : minT) + dias * dia));
  /* Las marcas del eje. El paso se elige por el largo de la ventana: en una
     corta, semanas; a partir de ahí, el primero de cada mes —que es como se
     lee un cronograma—, y cada dos meses cuando son dos años, para que las
     etiquetas no se toquen. Sin la última marca: su etiqueta, centrada, se
     saldría por la derecha. */
  const diasVentana = Math.round((hastaT - desdeT) / dia);
  const marcas: { pct: number; lbl: string; fuerte: boolean }[] = [];
  if (diasVentana <= 80) {
    for (let t = desdeT; t < hastaT - dia; t += 7 * dia)
      marcas.push({ pct: pct(t), lbl: fmt(isoDe(t)), fuerte: false });
  } else {
    const salto = diasVentana > 400 ? 2 : 1;
    const d0 = new Date(desdeT);
    const c = new Date(d0.getFullYear(), d0.getMonth(), 1, 12);
    if (c.getTime() < desdeT) c.setMonth(c.getMonth() + 1);
    while (c.getTime() < hastaT - dia) {
      const enero = c.getMonth() === 0;
      /* Mayúscula a mano. El español tiene dos formas del mes abreviado: la
         SUELTA («Dic.», que es la que da pedir solo el mes) y la de FRASE
         («dic. 26», la que da pedir mes+año). Mezcladas en el mismo eje se ven
         como un error de tipeo: «Dic.» junto a «ene. 27». Se igualan aquí. */
      marcas.push({
        pct: pct(c.getTime()),
        lbl: capi(enero || marcas.length === 0
          ? c.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
          : c.toLocaleDateString("es-PE", { month: "short" })),
        fuerte: enero,
      });
      c.setMonth(c.getMonth() + salto);
    }
  }
  /* El orden, en este orden: primero la ETAPA (no se rueda antes de alistar);
     dentro de la etapa manda el `orden` MANUAL —la secuencia que decide una
     persona: Sincronización → Color → Logging→…—; la fecha es el desempate por
     defecto (una etapa recién hecha, con todo en orden 0, sale cronológica); y
     `creado_en` desempata el desempate, para que dos no bailen entre recargas.
     ⚠ Este comparador dentro de la etapa TIENE que ser idéntico a `cmpEtapa`
     de actions.ts (moverActividadCrono), o «subir» movería otra cosa. */
  const enVentana = (a: any) =>
    pd(a.fecha_fin || a.fecha_inicio) + dia >= desdeT && pd(a.fecha_inicio) < hastaT;
  /* Una etapa que no está en el preset (una convocatoria a la que le cambiaron
     la categoría, una actividad sin etapa) va al FINAL, no al principio:
     `indexOf` devuelve -1 y sin esto lo desconocido encabezaba el cronograma. */
  const posEt = (et?: string | null) => { const i = ETAPA_ORDEN.indexOf(et || ""); return i < 0 ? 999 : i; };
  const ordenadas = [...visibles].sort((a, b) =>
    posEt(a.etapa) !== posEt(b.etapa) ? posEt(a.etapa) - posEt(b.etapa)
    : (a.orden ?? 0) !== (b.orden ?? 0) ? (a.orden ?? 0) - (b.orden ?? 0)
    : a.fecha_inicio !== b.fecha_inicio ? (a.fecha_inicio < b.fecha_inicio ? -1 : 1)
    : (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));

  /* El ancho de la columna de nombres del Gantt. Tiene que ser el MISMO que
     `.gt-nombre` en globals.css: la línea de HOY y la leyenda se posicionan con
     él a mano. Estaban en 170 mientras el CSS decía 240, así que la línea de
     HOY caía 70px a la izquierda de donde debía — con un cronograma de un año,
     casi un mes de error, y en silencio. */
  const GT_NOMBRE = 240;

  const cuerpo = (
    /* `cr-caja` además de `card`: la tarjeta es correcta cuando el cronograma
       va suelto (ficha de proyecto, /proyectos), y sobra cuando ya vive dentro
       de un plegable que le pone marco y título. La regla que quita el marco
       está en globals.css y solo aplica dentro de `.plg-cuerpo`; aquí no se
       decide nada, solo se deja el gancho. `.plg-cuerpo>.card` no bastaba: esa
       solo alcanza a los hijos DIRECTOS, y este va dentro de
       CronogramaPostulacion. */
    <div className="card cr-caja" style={{ marginBottom: ancho ? 0 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>📅 Cronograma · {visibles.length}</b>
        <div className="vtabs" style={{ margin: 0 }}>
          <button className={`vtab ${vista === "lista" ? "on" : ""}`} onClick={() => setVista("lista")}>☰ Lista</button>
          <button className={`vtab ${vista === "gantt" ? "on" : ""}`} onClick={() => setVista("gantt")}>📊 Gantt</button>
        </div>
        {/* Un cronograma de dos años en la mitad de una columna de 860 px no
            se lee: se adivina. El modal es `position:fixed`, así que escapa
            del ancho de la página sin tener que cambiarlo — el feed sigue en
            su medida de lectura y esto se abre a pantalla completa. */}
        <button className="btn btn-ghost" style={{ padding: "4px 9px", fontSize: 12 }}
          title={ancho ? "Volver a la ficha" : "Abrir a pantalla completa"}
          onClick={() => setAncho(!ancho)}>{ancho ? "✕ Cerrar" : "⛶ Ampliar"}</button>
        <span style={{ flex: 1 }} />
        {/* Aplicar solo con el cronograma vacío: suma, no reemplaza, y nadie
            va a querer duplicar siete actividades sobre siete que ya están.
            Guardar solo con algo que guardar. */}
        {!visibles.length && plantillas.length > 0 && !panel && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12, color: "var(--accent)" }}
            title="Cargar un cronograma que ya se usó antes"
            onClick={() => setPanel("aplicar")}>📋 Usar plantilla</button>
        )}
        {visibles.length > 0 && !panel && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            title="Guardar este cronograma para reusarlo en el próximo proyecto"
            onClick={() => setPanel("guardar")}>📋 Guardar como plantilla</button>
        )}
        {/* ── CORRER, SOLO EN UN FONDO ──
            Correr las fechas sella una versión del cronograma, y las versiones
            (`version_fondo`) cuelgan de una POSTULACIÓN. En un proyecto o una
            convocatoria el botón movería las fechas sin dejar rastro de las
            viejas, que es exactamente lo que este trabajo vino a evitar. */}
        {dueno === "postulacion" && puedeCorrer && visibles.length > 0 && !panel && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12, color: "var(--accent)" }}
            title="Desplazar una etapa —y lo que viene detrás— a una fecha nueva"
            onClick={() => setPanel("correr")}>⏩ Correr fechas</button>
        )}
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Actividad</button>}
      </div>

      {/* Aquí, en la tarjeta, donde pasó — no en una caja gris del navegador
          que dice «localhost:3000 dice» y hay que aceptar para seguir. */}
      {error && (
        <div className="err-inline" style={{ marginTop: 10 }}>
          ⚠ {error}
          <button style={{ color: "var(--dim)", marginLeft: 8, fontSize: 11 }}
            onClick={() => setError("")}>✕</button>
        </div>
      )}
      {ok && (
        <div style={{ color: "var(--green)", fontSize: 12, marginTop: 10 }}>✅ {ok}</div>
      )}

      {panel === "guardar" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <span style={{ color: "var(--dim)", fontSize: 11.5, width: "100%" }}>
            Se guardan las {visibles.length} actividades con sus etapas y responsables, pero
            <b> sin fechas</b>: la primera es el día 0 y el resto se cuenta desde ahí. Al usarla
            eliges cuándo empieza y todo se acomoda solo.
          </span>
          <input style={{ ...inp, flex: 1, minWidth: 220 }} placeholder="Nombre de la plantilla *"
            value={nomPl} onChange={e => setNomPl(e.target.value)} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            disabled={!nomPl.trim() || ocupado} onClick={guardarPl}>{ocupado ? "…" : "Guardar"}</button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => setPanel("")}>Cancelar</button>
        </div>
      )}

      {panel === "aplicar" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <select style={{ ...inp, flex: 1, minWidth: 200 }} value={plSel} onChange={e => setPlSel(e.target.value)}>
            <option value="">— elegir plantilla —</option>
            {plantillas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.n} actividades{p.tipo_proyecto ? ` · ${p.tipo_proyecto}` : ""}
              </option>
            ))}
          </select>
          <label style={{ color: "var(--dim)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
            empieza el
            <input type="date" style={inp} value={desde} onChange={e => setDesde(e.target.value)} />
          </label>
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            disabled={!plSel || !desde || ocupado} onClick={aplicarPl}>{ocupado ? "…" : "Cargar"}</button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => setPanel("")}>Cancelar</button>
        </div>
      )}

      {panel === "correr" && (
        /* Se le pasan TODAS las actividades, no `visibles`: la previsualización
           tiene que poder decir «3 canceladas y 2 sin fecha se quedan». Con la
           lista filtrada, esas filas no saldrían ni en la cuenta de lo que no
           se mueve — que es justo donde alguien las echaría en falta. */
        <CorrerCronograma
          postulacionId={duenoId} actividades={actividades as any} etapas={etapas}
          limite={limite} limiteNombre={limiteNombre}
          onCerrar={() => setPanel("")} />
      )}

      {agregando && (
        <FormAct f={f} setF={setF} perfiles={perfiles} etapas={etapas} ocupado={ocupado}
          onSave={guardar} onCancel={() => setAgregando(false)} />
      )}

      {/* ===== VISTA LISTA, agrupada por etapa ===== */}
      {/* La lista recorre el preset MÁS lo que sobre: una actividad cuya etapa
          no esté en el preset —o que no tenga etapa— antes no se pintaba en
          ninguna parte. No salía vacía ni en gris: no estaba, y el cronograma
          se veía completo. Pasa si a una convocatoria se le cambia la categoría
          después de crear actividades. Ahora caen en su propio bloque al final,
          que es feo pero visible. */}
      {vista === "lista" && [...ETAPA_ORDEN,
        ...Array.from(new Set(ordenadas.map((a: any) => a.etapa || "")))
          .filter(et => !ETAPA_ORDEN.includes(et))].map(et => {
        const grupo = ordenadas.filter((a: any) => (a.etapa || "") === et);
        if (!grupo.length) return null;
        /* ── EL ORDEN OPTIMISTA ──
           Tras soltar una fila, la lista se recoloca aquí mismo sin esperar al
           servidor: si no, la fila vuelve a su sitio y salta al de destino medio
           segundo después, y el ojo no sabe si funcionó.
           Las que no estén en la lista guardada —una creada mientras tanto— van
           al final en vez de desaparecer, y las borradas no resucitan porque se
           ordena `grupo`, que es lo que existe de verdad. */
        const guardado = ordenLocal[et];
        const grupoOrden = guardado
          ? [...grupo].sort((x: any, y: any) => {
              const i = guardado.indexOf(x.id), j = guardado.indexOf(y.id);
              return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j);
            })
          : grupo;
        const idsOrden = grupoOrden.map((x: any) => x.id);
        return (
          /* ── CADA ETAPA, UNA SECCIÓN ──
             El color no se inventa aquí: es el MISMO que ya lleva el filo
             izquierdo de cada actividad de esta etapa (`ETAPA_COLOR`). Poner
             uno genérico —violeta, como las secciones del resto del sistema—
             habría añadido un color que no significa nada al lado de otro que
             sí; usar el de la etapa hace que la cabecera y sus filas se lean
             como un bloque sin tener que emparejarlos con la vista. */
          <div key={et || "_sin"} className="cr-grupo"
            style={{ ["--cr-et" as any]: ETAPA_COLOR[et] || "var(--border2)" }}>
            <div className="cr-etapa-h">
              {et ? nomEtapa(et) : "Sin etapa"}
              {/* Cuántas hay aquí. El total («18 actividades») ya está arriba y
                  no dice si la postproducción son dos o nueve, que es lo que se
                  mira al repartir el trabajo. */}
              <span className="cr-etapa-n">{grupo.length}</span>
              <span style={{ flex: 1 }} />
              {/* ── ORDENAR POR FECHA ──
                  El caso que resuelve casi todos los arrastres —un cronograma
                  se lee por fechas— de un solo clic. Desde dos: con una sola
                  actividad no hay nada que ordenar.
                  ⚠ Dice «ordenar», no «mover»: NO toca ninguna fecha, cambia el
                  orden en que se listan. Es justo al revés que ⏩ Correr fechas,
                  y confundir los dos saldría caro. */}
              {grupo.length > 1 && (
                <button className="cr-etapa-btn" disabled={ocupado}
                  title="Dejar esta etapa en orden cronológico. No cambia ninguna fecha: solo el orden de la lista."
                  onClick={() => porFecha(et)}>↧ por fecha</button>
              )}
            </div>
            {grupoOrden.map(a => {
              const [txt, col] = CHIP[a.estado] || CHIP.planificada;
              /* Se reordena dentro de toda la ETAPA (a cualquier fecha), no ya
                 solo entre las del mismo día. `grupo` ya viene en el orden de
                 pantalla; la posición aquí es la misma que usa la acción. */
              const pos = grupoOrden.findIndex((x: any) => x.id === a.id);
              const puedeSubir = pos > 0;
              const puedeBajar = pos >= 0 && pos < grupoOrden.length - 1;
              if (editando === a.id) {
                return (
                  <FormAct key={a.id} f={ef} setF={setEf} perfiles={perfiles} etapas={etapas} ocupado={ocupado} editar
                    onSave={guardarEdicion} onCancel={() => setEditando(null)} />
                );
              }
              return (
                <div key={a.id}
                  /* El resaltado de destino SOLO si el arrastre viene de esta
                     misma etapa. Pintándolo en cualquier fila, la pantalla decía
                     «aquí cae» sobre una etapa ajena y al soltar salía un error:
                     invitar a hacer algo y luego negarlo es peor que no
                     invitar. */
                  className={`cr-item${arrastrando?.id === a.id ? " cr-arr" : ""}${sobreFila === a.id && arrastrando && arrastrando.id !== a.id && arrastrando.etapa === et ? " cr-sobre" : ""}`}
                  /* ⚠ La opacidad va AQUÍ y no en `.cr-arr`: un `style` en
                     línea gana a cualquier clase, así que `.cr-arr{opacity:.35}`
                     nunca llegaba a verse y la fila arrastrada no se atenuaba.
                     Dos sitios decidiendo el mismo píxel: gana el que no se ve
                     en la hoja de estilos. */
                  style={{
                    opacity: arrastrando?.id === a.id ? .35 : a.estado === "finalizada" ? .6 : 1,
                    borderLeft: `3px solid ${ETAPA_COLOR[a.etapa] || "var(--border)"}`,
                  }}
                  /* ── ARRASTRAR PARA REORDENAR ──
                     `draggable` en la fila entera y no en un tirador: la fila
                     ya se agarra con el ratón donde caiga, y un tirador de doce
                     píxeles obliga a apuntar. Los <input> y <select> de dentro
                     siguen funcionando porque el navegador no inicia arrastre
                     desde un campo de formulario.
                     Solo desde dos: con una sola actividad no hay a dónde. */
                  draggable={grupoOrden.length > 1}
                  onDragStart={e => {
                    /* Firefox no arranca el arrastre sin datos en el evento. */
                    try { e.dataTransfer.setData("text/plain", a.id); } catch {}
                    e.dataTransfer.effectAllowed = "move";
                    setArrastrando({ id: a.id, etapa: et });
                  }}
                  onDragEnd={() => { setArrastrando(null); setSobreFila(null); }}
                  onDragOver={e => {
                    /* Sin `preventDefault` la zona no acepta el soltar, que es
                       justo lo que se quiere en una etapa ajena: el cursor dice
                       «no» y no hay que explicar nada después. */
                    if (!arrastrando || arrastrando.etapa !== et) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setSobreFila(a.id);
                  }}
                  onDragLeave={() => setSobreFila(f => (f === a.id ? null : f))}
                  onDrop={e => { e.preventDefault(); soltarEn(et, a.id, idsOrden); }}>
                  <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>
                    {a.clase === "hito_externo" ? "🏛" : a.clase === "continua" ? "🔁"
                      : a.estado === "finalizada" ? "✅" : a.estado === "planificada" ? "⚪" : "🟣"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.nombre}
                    </div>
                    {/* Fecha y responsable AL VUELO —como en sub-casos—: se
                        cambian sin abrir el editor entero. Van pegados al
                        nombre, que son atributos de la actividad; a la derecha
                        quedan las acciones (mover, editar, materializar).
                        La FechaMini toca el INICIO; el fin fino, con ✎. */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 3, fontSize: 11, color: "var(--dim)" }}>
                      <FechaMini valor={a.fecha_inicio || null} ocupado={guardandoFila.includes(a.id)}
                        tituloVacio="Poner fecha de inicio"
                        onCambia={v => alVuelo(a.id, () => cambiarFechaActividad(a.id, dueno, duenoId, v))} />
                      {a.fecha_fin && a.fecha_fin !== a.fecha_inicio && <span>→ {fmt(a.fecha_fin)}</span>}
                      <MiniSelect value={a.responsable || ""} options={OPC_RESP}
                        etiqueta={!a.responsable ? "🙋" : respInactivo(a.responsable) ? "⚠ de baja" : cortoResp(a.responsable)}
                        onSelect={v => alVuelo(a.id, () => asignarResponsableActividad(a.id, dueno, duenoId, v || null))}
                        buttonClass={`sc-btn${a.responsable ? (respInactivo(a.responsable) ? " puesto baja" : " puesto resp") : ""}`} />
                      {/* EQUIPO DE APOYO: el responsable rinde cuentas; estos son
                          los demás que trabajan la actividad («entrevistas» =
                          entrevistador + camarógrafo). Chips con ✕ para quitar,
                          y un 👥+ para sumar (sin el responsable ni los que ya
                          están). El componente arma el arreglo; la acción lo fija. */}
                      {(a.equipo || []).map((pid: string) => (
                        <span key={pid} className="sc-btn puesto resp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          👤 {cortoResp(pid) || "⚠"}
                          <button title="Quitar del equipo" disabled={guardandoFila.includes(a.id)}
                            style={{ color: "var(--dim)", padding: 0, lineHeight: 1 }}
                            onClick={() => alVuelo(a.id, () => fijarEquipoActividad(a.id, dueno, duenoId, (a.equipo || []).filter((x: string) => x !== pid)))}>✕</button>
                        </span>
                      ))}
                      <MiniSelect value=""
                        options={[["", "＋ apoyo"], ...plantel
                          .filter(p => p.id !== a.responsable && !(a.equipo || []).includes(p.id))
                          .map(p => [p.id, p.nombre] as [string, string])]}
                        etiqueta="👥﹢"
                        onSelect={v => { if (v) alVuelo(a.id, () => fijarEquipoActividad(a.id, dueno, duenoId, [...(a.equipo || []), v])); }}
                        buttonClass="sc-btn" />
                      {a.estado === "planificada" && <span>🔕 −{a.dias_anticipacion ?? DIAS_AVISO_DEF}d</span>}
                    </div>
                    {/* La descripción, si la hay: el «cómo» de la actividad,
                        debajo del «cuándo/quién». whiteSpace pre-wrap respeta
                        los saltos de línea que puso quien la escribió. */}
                    {a.descripcion && (
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {a.descripcion}
                      </div>
                    )}
                    {/* Quién puso este hito en el cronograma (no confundir con el
                        responsable, que es a quién le toca hacerlo). El creador es
                        una CUENTA del sistema; cuando la nómina de aquí son
                        personas (postulación), el nombre viene ya resuelto del
                        servidor en `_creadoPor`. */}
                    {(() => {
                      const nom = a._creadoPor || perfiles.find(p => p.id === a.creado_por)?.nombre;
                      return a.creado_por && nom ? (
                        <div style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 3 }}>
                          ✎ puesto por {String(nom).split(" ")[0]}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <span className="badge" style={{ color: col, background: "#1c1c2c", whiteSpace: "nowrap", flexShrink: 0 }}>{txt}</span>
                  <span style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                    {/* ── UN CHIP POR CASO, CON LA CARA DE QUIEN LO LLEVA ──
                        Una actividad tiene los casos que haga falta: el permiso,
                        el transporte y el rodaje. Antes cabía uno solo y la fila
                        decía «caso →» sin más, así que «¿quién está en esto?»
                        obligaba a abrirlo.
                        Mismo chip que en Entregables, a propósito: son la misma
                        relación —trabajo colgando de una fila— y con dos diseños
                        distintos habría que aprenderlos dos veces.
                        Los CERRADOS se pintan también, atenuados: en un
                        cronograma, lo hecho es justo lo que hay que enseñar. */}
                    {casosDe(a).length > 0 && (
                      <span className="cr-casos" title={resumenCasos(casosDe(a)).texto}>
                        {repartirCasos(casosDe(a)).todos.map((c: CasoMin) => (
                          <span key={c.id}
                            className={`cr-caso fila-cap${casoCerrado(c) ? " cr-caso-off" : ""}`}
                            title={`${c.titulo || "Caso"} — ${c.resp?.nombre || "sin responsable"}`}>
                            {/* El enlace cubre el chip por debajo en vez de
                                envolverlo: la ✕ es un <button>, y un botón
                                dentro de un <a> es HTML inválido — rompe la
                                hidratación y los dos clics se pelean. */}
                            <Link href={`/caso/${c.id}`} className="fila-cubre" aria-label="Abrir el caso" />
                            {c.resp?.nombre
                              ? <Avatar size={15} nombre={c.resp.nombre} src={c.resp.avatar_url} color={c.resp.color} />
                              : <span className="cr-nadie" title="Sin responsable">·</span>}
                            {c.estado && (
                              <span className={`pill st-${claseEstado(c.estado, c.tipo || "tarea")}`}
                                style={{ fontSize: 9 }}>
                                {rotuloEstado(c.estado, c.tipo || "tarea")}
                              </span>
                            )}
                            {/* Soltar, no borrar: el caso sigue vivo en el
                                tablero, solo deja de colgar de aquí. */}
                            <button title="Soltar este caso de la actividad (no se borra)"
                              className="cr-caso-x" disabled={ocupado}
                              onClick={() => soltarCaso(c.id)}>✕</button>
                          </span>
                        ))}
                      </span>
                    )}
                    {/* ── ATAR UNO QUE YA EXISTE ──
                        `materializar` (▶) abre uno nuevo; esto ata el que ya
                        está en el tablero. Sin esto quedaban dos objetos
                        hablando del mismo trabajo —«Rodaje Nelly» apuntado a
                        mano y la actividad del cronograma— sin forma de
                        juntarlos.
                        Solo si no tiene caso ya, y no en las canceladas. */}
                    {/* ⚠ En CUALQUIER estado menos cancelada, y no solo en
                        `planificada`. Con el filtro estricto había un callejón
                        sin salida real y corto: atar un caso → se resuelve → la
                        actividad pasa a `finalizada` → soltar el caso la deja
                        `finalizada` y SIN caso, y a partir de ahí ni ⛓ ni ▶ se
                        pintan y el formulario no edita el estado. La fila se
                        quedaba inmovilizada para siempre.
                        Atar no fuerza nada: el estado lo deduce el caso. */}
                    {/* Sin la condición de «no tiene caso»: ahora caben varios,
                        y el segundo es justo el que antes obligaba a soltar el
                        primero. */}
                    {a.estado !== "cancelada" && atando !== a.id && (
                      <button title="Atar un caso que ya existe en el tablero"
                        style={{ color: "var(--dim)", fontSize: 12 }} disabled={ocupado}
                        onClick={() => abrirAtar(a.id)}>⛓</button>
                    )}
                    {atando === a.id && (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {casosLibres === null
                          ? <span style={{ color: "var(--dim)", fontSize: 11.5 }}>buscando…</span>
                          : !casosLibres.length
                            /* Se distingue «no hay» de «no cargó»: un
                               desplegable vacío se lee como que el fondo no
                               tiene casos, y casi siempre lo que pasa es que
                               todos están ya atados. */
                            ? <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                                No hay casos libres de este fondo — los que hay ya están atados a otra actividad.
                              </span>
                            : (
                              <select className="cr-inp-mini" defaultValue="" disabled={ocupado}
                                onChange={e => atar(a.id, e.target.value)}>
                                <option value="">— elegir caso —</option>
                                {casosLibres.map((c: any) => (
                                  /* El ESTADO del caso, dicho en la opción. Un
                                     selector que ofrece los resueltos sin
                                     distinguirlos hace que se ate uno cerrado
                                     creyendo que está en marcha — pasó ya con
                                     el picker de las cláusulas del acta. */
                                  <option key={c.id} value={c.id}>
                                    {c.titulo}
                                    {["resuelta", "descartada"].includes(c.estado) ? " · ✅ cerrado" : ""}
                                    {c.fecha_limite ? ` · ${fmt(c.fecha_limite)}` : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                        <button style={{ color: "var(--dim)", fontSize: 11 }}
                          onClick={() => { setAtando(null); setCasosLibres(null); }}>✕</button>
                      </span>
                    )}
                    {a.estado === "planificada" && confirmando?.id === a.id && (
                      <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
                        <span style={{ color: confirmando.accion === "mat" ? "var(--yellow)" : "var(--red)" }}>
                          {confirmando.accion === "mat" ? "¿Crear el caso ya?" : "¿Cancelar actividad?"}
                        </span>
                        <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={ocupado}
                          onClick={() => confirmando.accion === "mat" ? materializar(a.id) : cancelar(a.id)}>Sí</button>
                        <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
                          onClick={() => setConfirmando(null)}>No</button>
                      </span>
                    )}
                    {confirmando?.id !== a.id && (
                      <>
                        {/* Mover dentro de la etapa. Solo asoman cuando hay a
                            dónde: una etapa de una sola actividad no las
                            muestra —un botón que no puede hacer nada es peor
                            que no tenerlo—. */}
                        {(puedeSubir || puedeBajar) && (
                          <span style={{ display: "flex", flexDirection: "column", lineHeight: .8 }}>
                            <button title="Subir en la etapa" disabled={!puedeSubir || ocupado}
                              style={{ color: puedeSubir ? "var(--dim)" : "transparent", fontSize: 9, padding: 0 }}
                              onClick={() => mover(a.id, "sube")}>▲</button>
                            <button title="Bajar en la etapa" disabled={!puedeBajar || ocupado}
                              style={{ color: puedeBajar ? "var(--dim)" : "transparent", fontSize: 9, padding: 0 }}
                              onClick={() => mover(a.id, "baja")}>▼</button>
                          </span>
                        )}
                        {/* ── VOLVER A PLANIFICAR ──
                            El estado solo se movía hacia adelante, y ninguna
                            pantalla escribía `planificada` sobre una fila que ya
                            existía: una actividad marcada por error —se cerró el
                            caso equivocado, o el trabajo hay que repetirlo— se
                            quedaba así para siempre, y ⏩ Correr fechas la dejaba
                            quieta partiendo el bloque en dos.
                            Solo sin caso atado: con caso, el estado lo manda el
                            caso, y la acción lo dice si alguien lo intenta. */}
                        {a.estado === "finalizada" && !casosDe(a).length && (
                          <button title={dueno === "postulacion"
                            ? "Volver a planificarla: aún no está hecha"
                            /* En proyecto y convocatoria el bot de la mañana
                               materializa las planificadas cuya fecha ya entró
                               en la ventana de aviso. Replanificar una pasada
                               significa que mañana tendrá un caso nuevo, y eso
                               se dice ANTES de pulsar. */
                            : "Volver a planificarla: aún no está hecha. Ojo: si su fecha ya pasó, el bot le abrirá un caso mañana por la mañana."}
                            style={{ color: "var(--dim)" }} disabled={ocupado}
                            onClick={() => replanificar(a.id)}>↩</button>
                        )}
                        {/* Editar vale SIEMPRE, no solo mientras está
                            planificada: una fecha mal puesta en algo ya
                            materializado es justo la que más urge corregir. */}
                        <button title="Editar" style={{ color: "var(--dim)" }}
                          onClick={() => abrirEdicion(a)}>✎</button>
                      </>
                    )}
                    {a.estado === "planificada" && confirmando?.id !== a.id && (
                      <>
                        <button title="Materializar ahora" style={{ color: "var(--yellow)" }}
                          onClick={() => setConfirmando({ id: a.id, accion: "mat" })}>▶</button>
                        <button title="Cancelar" style={{ color: "var(--dim)" }}
                          onClick={() => setConfirmando({ id: a.id, accion: "del" })}>✕</button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ===== VISTA GANTT ===== */}
      {vista === "gantt" && visibles.length > 0 && (
        <div className="gt" style={{ position: "relative", marginTop: 12 }}>
          <NavFechas
            onHoy={() => { if (ZOOM_G[zoomG].d === 0) setZoomG(2); setDesdeG(isoDe(Date.now() - 15 * dia)); }}
            onPrev={() => moverG(-30)} onNext={() => moverG(30)}
            fecha={isoDe(desdeT)} onFecha={iso => { if (iso) { if (ZOOM_G[zoomG].d === 0) setZoomG(2); setDesdeG(iso); } }}
            zooms={ZOOM_G} zoom={zoomG}
            onZoom={i => { setZoomG(i); if (i === 0) setDesdeG(""); }}
            /* Con año: una ventana de doce meses empieza y termina el mismo
                día de meses distintos, y «1 nov. — 1 nov.» no dice nada. */
            rango={`${fmtAnio(isoDe(desdeT))} — ${fmtAnio(isoDe(hastaT - dia))}`} />
          {/* Rejilla de meses sobre las barras + sus etiquetas arriba. Un Gantt
              sin marcas obliga a calcular a ojo dónde cae marzo. */}
          <div className="gt-axis" style={{ position: "relative", height: 14 }}>
            {marcas.map((m, i) => (
              <span key={i} style={{
                position: "absolute",
                left: `calc(${GT_NOMBRE}px + (100% - ${GT_NOMBRE}px) * ${m.pct / 100})`,
                transform: "translateX(-50%)", whiteSpace: "nowrap",
                color: m.fuerte ? "var(--text)" : undefined,
                fontWeight: m.fuerte ? 700 : undefined,
              }}>{m.lbl}</span>
            ))}
          </div>
          <div className="gt-lineas" style={{ left: GT_NOMBRE }}>
            {marcas.map((m, i) => (
              <i key={i} className={m.fuerte ? "fuerte" : ""} style={{ left: `${m.pct}%` }} />
            ))}
          </div>
          {hoyDentro && hoyPct > 0 && hoyPct < 100 && (
            <div className="gt-hoy" style={{ left: `calc(${GT_NOMBRE}px + (100% - ${GT_NOMBRE}px) * ${hoyPct / 100})` }}>
              <i>HOY</i>
            </div>
          )}
          {ordenadas.filter(enVentana).length === 0 && (
            <div className="empty" style={{ padding: "18px 0" }}>
              Nada en esta ventana. Prueba «Todo» o mueve las fechas.
            </div>
          )}
          {ordenadas.filter(enVentana).map((a, i, arr) => {
            /* Rótulo de fase: se pinta al entrar a cada etapa. El Gantt ya venía
               ordenado por etapa —igual que la vista de lista, que sí las
               titulaba—, así que solo faltaba decir en voz alta dónde empieza
               cada una. Sale del propio orden, sin agrupar aparte: así no hay
               dos fuentes de verdad sobre en qué fase va una actividad. */
            const abreEtapa = i === 0 || arr[i - 1].etapa !== a.etapa;
            /* Lo que ya terminó se apaga: en un cronograma de un año, la mitad
               de las barras son historia y compiten por la atención con lo que
               viene. Se apaga la FILA entera —nombre, avatar y barra—, no solo
               el texto, y se recupera al pasar el cursor por si hay que
               consultarla. Es por FECHA, no por estado: una actividad sin
               marcar que ya venció también es pasado. */
            /* Se apaga SOLO lo resuelto, nunca por fecha. Probamos apagar lo
               vencido y estaba mal: una actividad que pasó su fecha y NADIE
               resolvió es exactamente la que hay que ver — atenuarla escondía
               el problema en vez de mostrarlo. El plan no dice si algo está
               hecho; solo el estado lo dice. */
            const apagada = a.estado === "finalizada";
            const ini = pct(pd(a.fecha_inicio));
            const fin = pct(pd(a.fecha_fin || a.fecha_inicio) + dia);
            const w = Math.max(fin - ini, 1.5);
            const etCol = ETAPA_COLOR[a.etapa] || "#8b8ba3";
            const barra = (
              <div className="gt-track">
                <div className="gt-bar" title={`${a.nombre} · ${nomEtapa(a.etapa)}: ${fmt(a.fecha_inicio)} → ${a.fecha_fin ? fmt(a.fecha_fin) : "—"}`}
                  style={{
                    left: `${ini}%`, width: `${w}%`,
                    /* La práctica continua va rayada: no es un bloque de
                       trabajo que empieza y termina, es algo que ocurre a lo
                       largo del tramo. Se distingue de un vistazo sin leer. */
                    background: a.clase === "continua"
                      ? `repeating-linear-gradient(90deg, ${etCol}99 0 5px, transparent 5px 11px)`
                      : a.estado === "planificada" ? `${etCol}26` : etCol,
                    border: a.clase === "continua" ? "none"
                      : a.estado === "planificada" ? `1px dashed ${etCol}` : "none",
                    /* Sin doble atenuación: el apagado es de la FILA entera y
                       la barra ya va dentro; si además se descontara aquí,
                       quedaría invisible. */
                    opacity: 1,
                  }} />
              </div>
            );
            return (
              <Fragment key={a.id}>
              {abreEtapa && (
                <div className="gt-fase">
                  <i style={{ background: etCol }} />
                  <b>{nomEtapa(a.etapa)}</b>
                  <hr />
                </div>
              )}
              <div className={`gt-row${apagada ? " resuelta" : ""}`}>
                <div className="gt-nombre" title={a.nombre}>
                  {/* Trabajar el caso al vuelo, sin salir del Gantt. Va DENTRO
                      del rótulo, que tiene ancho fijo: fuera descuadraría el
                      eje temporal. Mismo criterio que en la Agenda. */}
                  {/* El primer caso vivo, o el primero que haya: en el Gantt no
                      cabe una fila de chips, y la vista rápida es un vistazo,
                      no el índice. La lista de arriba los enseña todos. */}
                  {casosDe(a)[0] && <VistaRapida pubId={repartirCasos(casosDe(a)).todos[0].id} />}
                  <span className="gt-nombre-txt">
                    {a.clase === "continua" ? "🔁 "
                      : a.estado === "finalizada" ? "✅ " : a.estado === "planificada" ? "" : "🟣 "}
                    {casosDe(a).length
                      ? <Link href={`/caso/${repartirCasos(casosDe(a)).todos[0].id}`} style={{ color: "var(--text)" }}>{a.nombre}</Link>
                      : a.nombre}
                  </span>
                  {/* Solo el avatar: en veinte filas, veinte nombres repetidos
                      se comen la columna y no se lee ninguno. El nombre está en
                      el `title` y en la vista de lista, que es donde se asigna. */}
                  {a.responsable && (
                    <span title={respDe(a.responsable)?.nombre || "responsable"} style={{ flexShrink: 0, display: "inline-flex" }}>
                      <Avatar size={22} nombre={respDe(a.responsable)?.nombre}
                        src={fotoDe(respDe(a.responsable))} color={respDe(a.responsable)?.color} />
                    </span>
                  )}
                </div>
                {barra}
              </div>
              </Fragment>
            );
          })}
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10.5, color: "var(--dim)", paddingLeft: GT_NOMBRE, flexWrap: "wrap" }}>
            {ETAPA_ORDEN.filter(et => visibles.some(a => a.etapa === et)).map(et => (
              <span key={et}>
                <i style={{ display: "inline-block", width: 16, height: 7, background: ETAPA_COLOR[et], borderRadius: 4, verticalAlign: "middle", marginRight: 4 }} />
                {nomEtapa(et)}
              </span>
            ))}
            <span style={{ marginLeft: 10 }}>· punteada = planificada · sólida = en curso · tenue = finalizada</span>
          </div>
        </div>
      )}

      {!visibles.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>Sin actividades — planifica la primera.</div>
      )}
    </div>
  );

  /* El MISMO cuerpo, en la ficha o a pantalla completa. No es un cronograma
     de escritorio y otro de modal: es uno solo con más sitio. Dos versiones
     de esto serían dos sitios donde arreglar el próximo bug. */
  if (!ancho) return cuerpo;
  return (
    <div className="modal-fondo" onClick={() => setAncho(false)}>
      {/* stopPropagation: sin esto, editar una fecha cierra la ventana —
          el clic en cualquier input llegaría al fondo. */}
      {/* `modal-gantt` en vez del ancho estándar: un cronograma de dos años son
          veinticuatro meses en una fila, y cada 100px de más son días que se
          distinguen. El resto de la aplicación conserva su tope de 1280. */}
      <div className="modal-ancho modal-gantt" onClick={e => e.stopPropagation()}>{cuerpo}</div>
    </div>
  );
}
