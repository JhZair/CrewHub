import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { redirect } from "next/navigation";

/* 📖 LA WIKI DE CREWHUB+ — el manual vive junto a la herramienta.
   Si un flujo cambia, esta página cambia en el mismo commit. */

const S = ({ titulo, abierto = false, children }: any) => (
  <details open={abierto} className="card" style={{ marginBottom: 10 }}>
    <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 14.5, padding: "2px 0" }}>{titulo}</summary>
    <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.65, color: "#c6c6da" }}>{children}</div>
  </details>
);
const K = ({ children }: any) => <b style={{ color: "var(--violet)" }}>{children}</b>;
const P = ({ children }: any) => <p style={{ margin: "8px 0" }}>{children}</p>;

export default async function Wiki() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
      </div>
      <h1 className="title-lg">📖 Wiki de CrewHub+</h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 18 }}>
        Cómo trabaja Kawsay dentro del sistema. Regla madre: <b>el chat coordina, CrewHub+ recuerda</b> —
        lo que mañana importa, hoy se publica.
      </p>

      <S titulo="⬡ El principio: la Publicación es el nodo central" abierto>
        <P>Todo lo que pasa en Kawsay se registra como una <K>publicación</K> (un "caso") y se
        <K> vincula</K> a las entidades que toca: proyecto, empresa, persona, convocatoria,
        postulación, equipo, lugar. El vínculo es la magia: años después, el perfil de cada
        entidad muestra todo lo que le ocurrió.</P>
        <P><K>Tipos</K>: 📢 Aviso (anunciar) · ✅ Tarea (hacer, con responsable y vencimiento) ·
        ❗ Problema (algo se rompió) · ❓ Consulta (preguntar al equipo; la respuesta queda
        buscable para siempre) · 💰 Pago · 💡 Idea · 📎 Archivo (entregar un documento suelto
        vía link de Drive).</P>
        <P><K>Estados</K>: Sin Resolver → En Progreso → Resuelta. Además: ⏸ En Pausa (Bot Qhaway no
        molesta), 🔭 Seguimiento (casos largos de meses: viven sin regaños de "dormido") y
        Archivada (ya no aplica; sale del feed pero queda buscable).</P>
        <P><K>Sub-casos</K> 🧩: un caso largo se descompone en hijos desde su página; heredan los
        vínculos del padre y el feed muestra el progreso (2/5). <K>Menciones</K>: escribe
        @nombre en un comentario para invocar a alguien (le llega a su campanita).
        <K> Imágenes</K>: pega pantallazos con Ctrl+V en publicaciones y comentarios.
        <K> Reacciones</K>: 👍 ❤️ 🔥 👏 😂 😢 — toca para poner, toca de nuevo para quitar.
        El <K>título</K> se corrige con el ✎ (la bitácora recuerda el anterior).</P>
      </S>

      <S titulo="🙋 Mi día: feed, Mis asuntos y tablero">
        <P>El <K>feed</K> es el muro común (lo archivado no aparece). ✨ NUEVO marca lo publicado
        desde tu última visita — es personal. La vista <K>🙋 Mis asuntos</K> junta lo que creaste,
        lo que te asignaron y lo vinculado a tu persona.</P>
        <P>El <K>🗂 Tablero</K> es el kanban: arrastra tarjetas entre columnas para cambiar estado.
        Tiene los mismos filtros del feed, incluido Mis asuntos.</P>
        <P>La <K>🔔 campanita</K> avisa: asignaciones, vencimientos, menciones y despertares de
        Bot Qhaway. El <K>buscador global</K> (Ctrl+K) busca por palabras en TODO — y entiende
        quechua: «mujunacuy» encuentra a Mujunakuy, «guamani» a Huamani.</P>
      </S>

      <S titulo="📜 Convocatorias: la cancha y el calendario">
        <P>Cada concurso DAFO de cada año es una <K>convocatoria</K> (código C-###, automático).
        Guarda las bases 📖, el monto del estímulo y el <K>cronograma del concurso</K>: los
        🏛 hitos (cierre, revisión, evaluación, finalistas, beneficiarios, RENCA...) que Bot Qhaway
        anuncia con anticipación — solo de concursos donde jugamos.</P>
        <P>Cuando salen bases nuevas: crear la convocatoria (o importarla), cargar los hitos del
        numeral XVI en su pestaña 📅 (＋ Actividad → 🏛 Hito del concurso). El panel 📜 muestra
        la temporada: frentes donde jugamos, línea de tiempo DAFO y la historia por años.</P>
      </S>

      <S titulo="🎯 Postulaciones: el partido (la entidad más importante)">
        <P>Postular = <K>proyecto + empresa + convocatoria</K>. Se crea desde la convocatoria
        (＋ Postular). Código interno PO-### automático; el de la plataforma DAFO
        (CDO-P-#####-##) va en su campo.</P>
        <P><K>Ciclo de vida</K>: 🛠 En preparación (aún sin bases o armando el expediente) →
        📨 Enviada → ⭐ Finalista → y termina en 🏆 Ganadora, 🥈 Finalista (no ganó),
        ✖ No seleccionada o ↩ Retirada.</P>
        <P>Su perfil es el <K>cuartel de la ruta</K> (4-5 meses de trabajo): 🧭 contexto con monto
        en juego y bases · 👥 equipo técnico/artístico de ESA postulación · 📎 materiales — el
        expediente con medidor N/10 (links de Drive de lo que se envía: tratamiento, presupuesto,
        teaser...). Gane o pierda, registrar <K>puntaje, matriz PDF y comentario del jurado</K>:
        es el insumo de la revancha.</P>
        <P>Si gana, llega el <K>bautizo</K> (✎ Registrar ejecución): código de acta
        (###-año-DAFO), firma, monto adjudicado, límite de rendición, prórroga y el acta en
        Drive. La rendición entra sola a la vigilancia del panel.</P>
      </S>

      <S titulo="📁 Proyectos y sus cronogramas de ejecución">
        <P>El proyecto es la obra (folio P-###, tipo con color; el <K>RENCA de la obra</K> es
        opcional pero suma en el semáforo). Su perfil muestra su
        <K> palmarés</K> (todas sus postulaciones, con la ejecución de las ganadas) y su
        <K> 📅 Cronograma</K> — el corazón operativo.</P>
        <P><K>Regla del reajuste</K>: el cronograma/presupuesto con que se postuló queda congelado
        en los materiales de la postulación. Al ganar (jurado puede recortar; todo inicia cuando
        llega el dinero 💰) se carga el cronograma REPROGRAMADO en el proyecto, y el presupuesto
        vigente en su campo (botón 💰).</P>
        <P>Las actividades tienen etapa (colores del Gantt), responsable y anticipación.
        <K> Bot Qhaway las materializa</K>: N días antes crea la tarea (o el aviso si es 🏛 hito) y
        se la asigna al responsable. La línea naranja de HOY cruza el Gantt.</P>
      </S>

      <S titulo="🎥 Equipos: préstamos y las dos rondas">
        <P>Todo recurso físico de producción — cámaras, luces, drones y también
        <K> camping</K> para la puna — con folio A-### y valor. El estado "en uso" es
        <K> automático</K>: lo gobiernan los préstamos, no se elige a mano.</P>
        <P><K>Préstamo</K> (perfil del equipo → 🤝 ＋ Prestar): a quién, para qué proyecto, nota.
        <K> Ronda de devoluciones</K>: al volver de rodaje, panel 🎥 → "En uso ahora" →
        ↩ Devolver fila por fila. <K>Ronda de comprobación</K> (trimestral, ideal antes de cada
        rendición): tarjeta 🔍 → modo ronda → recorrer el almacén marcando ✔ lo que se ve.
        Lo que nadie encuentra: préstamo sin registrar, o estado perdido.</P>
        <P>Cada equipo acumula así su biografía: en qué manos y en qué rodajes estuvo.</P>
      </S>

      <S titulo="🏢 Empresas · 👤 Personas">
        <P><K>Empresas</K> (E-###): cada una con RUC, <K>RENCA (obligatorio para postular —
        sin él el semáforo sale rojo)</K>, salud SUNAT (las alertas salen en su panel
        y en la ronda de Bot Qhaway), miembros y cargos con historial (representante legal, socios;
        la fecha del cargo se corrige con un clic — usar la real de SUNAT),
        y sus documentos invocados de Drive (ficha RUC, reconocimiento RENCA, vigencia de poder).
        El panel muestra el <K> 🏅 palmarés</K>: qué empresa gana, roza y persiste ante DAFO.</P>
        <P><K>Personas</K>: directorio universal — equipo interno (⬡, enlazado a su usuario),
        colaboradores, contactos. Especialidades como chips (con sugerencias del oficio).
        Al crear, el <K>detector de parecidos</K> avisa si ya existe alguien similar
        (también en quechua) — mirar antes de duplicar.</P>
        <P>El perfil de una persona es su <K>hoja de vida completa</K>: 🏆 palmarés (estímulos
        ganados con cargo y año), postulaciones, cargos en empresas, equipos en su poder,
        proyectos donde es cliente — y su actividad real (casos que creó, le asignaron o comentó).
        Para que esa actividad aparezca, su <K>🔗 Cuenta de acceso</K> debe estar enlazada
        (bloque al final del carné; Bot Qhaway lo vigila en su higiene).</P>
        <P><K>🔑 Credenciales — REGLA DE ORO</K>: en CrewHub+ solo el inventario (plataforma,
        usuario, dónde vive la clave). <b>La contraseña real JAMÁS se escribe aquí</b> — vive en
        el KeePass del Drive.</P>
      </S>

      <S titulo="🤖 Bot Qhaway: qué hace cada mañana (7:30)">
        <P>1) <K>Materializa</K> del cronograma: tareas de trabajo y avisos de 🏛 hitos (solo de
        concursos donde tenemos postulaciones en juego). 2) <K>Vencimientos</K>: avisa a 7, 2 y
        0 días, y persigue lo vencido. 3) <K>Despierta dormidos</K>: caso activo con 3 días sin
        movimiento recibe su toque (Seguimiento y En Pausa están exentos). 4) <K>SUNAT</K>:
        alerta empresas con problemas o sin verificar hace 60+ días. 5) Deja el resumen en el
        Chat del equipo y sus huellas en cada caso.</P>
        <P>Su perfil es el <K>centro de acciones</K>: hallazgos en vivo, semáforo pre-postulación
        (RENCA, SUNAT, vigencias, DNI, materiales), higiene de datos y el <K>🫀 Pulso del
        equipo</K> — carga por persona para redistribuir, nunca ranking. Los lunes 7:35
        publica el pulso en el feed.</P>
        <P>Bot Qhaway firma sus creaciones. No se le asignan tareas: él crea, los humanos ejecutan.</P>
      </S>

      <S titulo="📐 Convenciones de la casa">
        <P><K>Folios y códigos</K> son automáticos e inmutables: P-### proyectos, E-### empresas,
        A-### activos, C-### convocatorias, PO-### postulaciones. Los códigos externos (DAFO,
        actas) van en sus campos propios. Los folios no se reciclan.</P>
        <P><K>Archivos</K>: CrewHub+ no almacena documentos — los invoca desde Drive por link.
        La excepción son los pantallazos pegados (comunicación, no archivo).
        <K> Fechas</K>: todo lo que tiene fechas se dibuja — líneas de tiempo con HOY marcado.
        <K> Comentarios</K>: cada quien puede editar los suyos (✎), y queda la marca
        "(editado)" — se corrige el tipeo, no se reescribe la historia.
        <K> Pendientes grandes</K>: casos en 🔭 Seguimiento con etiqueta de mejoras.</P>
        <P><K>No renombrar</K> registros migrados de forma radical (el importador los reconoce
        por nombre): si un concurso de otro año necesita existir, se crea nuevo.
        <K> Duplicados</K>: se fusionan moviendo referencias, nunca borrando historia.
        <K> Importador</K> (⬆): reconoce folios existentes y no duplica; en concursos, cualquier
        columna extra con fecha se vuelve hito automáticamente.</P>
      </S>

      <p style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", margin: "20px 0 8px" }}>
        Esta wiki vive en el código: si un flujo cambia, se actualiza aquí en el mismo cambio. ⬡
      </p>
    </div>
  );
}
