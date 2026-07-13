import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Tablero from "@/components/Tablero";
import Realtime from "@/components/Realtime";
import FiltroPersona from "@/components/FiltroPersona";
import Link from "next/link";
import { redirect } from "next/navigation";

const TIPOS_F: [string, string][] = [
  ["mios", "🙋 Mis asuntos"], ["todo", "🌐 Todo"], ["tarea", "✅ Tareas"],
  ["problema", "❗ Problemas"], ["consulta", "❓ Consultas"], ["pago", "💰 Pagos"],
];

// Estados que viven en el tablero (archivadas quedan fuera).
const ESTADOS = ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta"];

export default async function TableroPage({ searchParams }: {
  searchParams: { v?: string; p?: string };
}) {
  const pFiltro = searchParams?.p || "";
  // Al ingresar sin filtros, la pestaña marcada es "Mis asuntos".
  const v = searchParams?.v || (pFiltro ? "" : "mios");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  // El equipo, para poder mirar los asuntos de cada quien
  const { data: equipoPerf } = await supabase.from("perfiles")
    .select("id,nombre").eq("activo", true).neq("nombre", "Qhaway").order("nombre");

  // Vínculos de persona del USUARIO logueado (para "Mis asuntos" y su contador)
  let misVinc: string[] = [];
  {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", user.id).maybeSingle();
    if (yo) {
      const { data: vs } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .eq("entidad_tipo", "persona").eq("entidad_id", yo.id).limit(300);
      misVinc = (vs || []).map((x: any) => x.publicacion_id);
    }
  }

  // Persona en foco: yo ("Mis asuntos") o alguien del equipo (dropdown)
  const uidFoco = v === "mios" ? user.id : pFiltro || null;
  let vinculadas: string[] = [];
  if (uidFoco === user.id) {
    vinculadas = misVinc;
  } else if (uidFoco) {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", uidFoco).maybeSingle();
    if (yo) {
      const { data: vs } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .eq("entidad_tipo", "persona").eq("entidad_id", yo.id).limit(300);
      vinculadas = (vs || []).map((x: any) => x.publicacion_id);
    }
  }

  let q = supabase.from("publicaciones")
    .select("id,titulo,tipo,estado,fecha_limite,creado_en,resp:perfiles!publicaciones_responsable_fkey(nombre)")
    .in("estado", ESTADOS)
    .order("creado_en", { ascending: false })
    .limit(200);
  if (uidFoco) {
    const cond = [`autor_id.eq.${uidFoco}`, `responsable.eq.${uidFoco}`];
    if (vinculadas.length) cond.push(`id.in.(${vinculadas.join(",")})`);
    q = q.or(cond.join(","));
  } else if (v && v !== "todo") q = q.eq("tipo", v);

  const { data: pubs } = await q;

  // Universo para los contadores de cada pestaña (independiente del filtro activo)
  const { data: universo } = await supabase.from("publicaciones")
    .select("id,tipo,autor_id,responsable")
    .in("estado", ESTADOS).limit(500);
  const U = universo || [];
  const misSet = new Set(misVinc);
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    tarea: U.filter((p: any) => p.tipo === "tarea").length,
    problema: U.filter((p: any) => p.tipo === "problema").length,
    consulta: U.filter((p: any) => p.tipo === "consulta").length,
    pago: U.filter((p: any) => p.tipo === "pago").length,
  };

  const de = (estado: string, limite?: number) => {
    const lista = (pubs || []).filter((p: any) => p.estado === estado);
    return limite ? lista.slice(0, limite) : lista;
  };

  const columnas = [
    { estado: "abierta", titulo: "🔴 Sin Resolver", color: "var(--red)", items: de("abierta") },
    { estado: "en_progreso", titulo: "🟡 En Progreso", color: "var(--yellow)", items: de("en_progreso") },
    { estado: "seguimiento", titulo: "🔭 Seguimiento", color: "var(--teal)", items: de("seguimiento") },
    { estado: "en_pausa", titulo: "⏸ En Pausa", color: "var(--blue)", items: de("en_pausa") },
    { estado: "resuelta", titulo: "✅ Resueltas", color: "var(--green)", items: de("resuelta", 12) },
  ];

  return (
    <div className="shell" style={{ maxWidth: "96vw" }}>
      <Realtime tablas={["publicaciones"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          arrastra una tarjeta a otra columna para cambiar su estado
        </span>
      </div>
      <h1 className="title-lg">🗂 Tablero</h1>

      {/* Una sola fila: tipos a la izquierda; persona + Pulso en la otra esquina.
          Mirar los asuntos de cada quien es para coordinar y repartir, no para auditar. */}
      <div className="vtabs" style={{ alignItems: "center" }}>
        {TIPOS_F.map(([val, label]) => (
          <Link key={val} href={val === "mios" ? "/tablero" : `/tablero?v=${val}`}
            className={`vtab ${v === val && !pFiltro ? "on" : ""}`}>
            {label} <span className="vtab-n">{conteo[val] ?? 0}</span>
          </Link>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <FiltroPersona equipo={equipoPerf || []} actual={pFiltro || (v === "mios" ? user.id : "")} />
          <Link href="/pulso" className="vtab"
            title="Pulso semanal del equipo — quién cerró qué, semana a semana">
            📊 Pulso
          </Link>
        </span>
      </div>

      <Tablero columnas={columnas} />
    </div>
  );
}
