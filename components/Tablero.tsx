"use client";
import { cambiarEstado, archivar } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import VistaRapida from "@/components/VistaRapida";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { plazoDe } from "@/lib/plazo";
import { icoTipo } from "@/lib/tipos";
import { TXT } from "@/lib/texto";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import { CERRADOS } from "@/lib/familia";
import BarrasProgreso from "@/components/BarrasProgreso";
import { useState, useEffect } from "react";

/* (Los íconos salieron a lib/tipos y lib/secciones; la cuenta regresiva, a
   lib/plazo. Este archivo tenía tres mapas copiados de otros sitios.) */

function reacStr(reac?: Record<string, number>) {
  if (!reac) return "";
  return Object.entries(reac).slice(0, 3).map(([em, n]) => `${em}${n}`).join(" ");
}

// Nombre corto que distingue homónimos: "John Oros" → "John O.", "John Zair…" → "John Z."
function corto(n?: string | null) {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
}

export default function Tablero({ columnas, archivado = false }: {
  columnas: { estado: string; titulo: string; color: string; items: any[] }[];
  /** ¿Estamos mirando el archivo? Cambia lo que hace la zona de arrastre:
   *  en lo vivo archiva, en el archivo despierta. */
  archivado?: boolean;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [sobreZona, setSobreZona] = useState(false);
  const router = useRouter();

  /* LA ZONA DE ARRASTRE — el eje archivado, hecho físico.
     Las columnas son el eje ESTADO (arrastras entre ellas para cambiar cómo
     va); esta zona es el eje ARCHIVADO (arrastras a ella para guardar o
     traer de vuelta). Los dos ejes que se partieron en la base, aquí se ven
     como dos gestos distintos. `archivar(id, !archivado)`: en lo vivo
     archiva, en el archivo despierta. Bulk = arrastrar varias, una tras otra. */
  const alaZona = async () => {
    setSobreZona(false);
    if (!arrastrando || moviendo) return;
    const id = arrastrando;
    setArrastrando(null);
    setMoviendo(true);
    const res: any = await archivar(id, !archivado);
    setMoviendo(false);
    if (res?.error) alert(res.error);
    else router.refresh();
  };

  /* COLUMNAS COLAPSABLES — como Trello.
     Con seis columnas (entró «Descartadas»), en una pantalla normal la última
     se caía de fila. Poder plegar las que uno no mira —«En Pausa»,
     «Descartadas»— devuelve el ancho a las que sí.
     El estado vive en localStorage, no en la URL: es una preferencia de vista
     PERSONAL —cada quien pliega lo suyo— y no algo que quieras compartir por
     enlace ni que recargue la página al plegar.
     Se lee en useEffect y no en el render inicial a propósito: leer
     localStorage durante la hidratación da un desajuste servidor/cliente.
     El precio es un parpadeo mínimo al cargar; la alternativa —no pintar el
     tablero hasta leer— es peor. */
  const CLAVE = "kb-colapsadas";
  /* Plegadas de fábrica: «Descartadas» casi siempre está vacía, así que
     arranca plegada y quien la necesita la abre. */
  const PLEGADAS_DEFECTO = ["descartada"];
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE);
      /* El default vale SOLO la primera vez. En cuanto alguien pliega o
         despliega algo, se guarda su elección —aunque sea un Set vacío— y a
         partir de ahí manda ella: si abrió Descartadas y recarga, sigue
         abierta. «Nunca lo toqué» (no hay clave) ≠ «lo dejé todo abierto»
         (clave = []); sin esa distinción el default volvería a plegarla y
         pisaría su decisión. */
      setColapsadas(new Set(raw !== null ? JSON.parse(raw) : PLEGADAS_DEFECTO));
    } catch { /* localStorage puede fallar en modo privado: sin plegado, no rompe */ }
  }, []);
  const plegar = (estado: string) => {
    setColapsadas(prev => {
      const next = new Set(prev);
      next.has(estado) ? next.delete(estado) : next.add(estado);
      try { localStorage.setItem(CLAVE, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const soltar = async (estado: string) => {
    setSobre(null);
    if (!arrastrando || moviendo) return;
    const id = arrastrando;
    setArrastrando(null);
    setMoviendo(true);
    const res = await cambiarEstado(id, estado);
    setMoviendo(false);
    if (res?.error) alert(res.error);
    else { if (estado === "resuelta") celebrarResuelto(); router.refresh(); }
  };

  return (
    <>
    {/* Archivo filtrado a cero: en vez de un tablero en blanco, decirlo. */}
    {!columnas.length && (
      <div className="kb-vacia-todo">
        {archivado ? "Nada archivado con estos filtros." : "Nada por aquí."}
      </div>
    )}
    <div className="kb">
      {columnas.map(col => {
        const plegada = colapsadas.has(col.estado);
        // «🚫 Descartadas» → ["🚫", "Descartadas"] para pintar el título de lado
        const espacio = col.titulo.indexOf(" ");
        const ico = col.titulo.slice(0, espacio);
        const nombre = col.titulo.slice(espacio + 1);

        /* Columna PLEGADA: una barra fina. Acepta drop igual que abierta —en
           Trello también se puede soltar en una columna plegada— y un clic en
           la barra la despliega. El título va de lado; el contador, arriba. */
        if (plegada) return (
          <div key={col.estado}
            className={`kb-col kb-plegada est-${col.estado} ${sobre === col.estado ? "kb-sobre" : ""}`}
            style={{ ["--kb-c" as any]: col.color }}
            title={`${nombre} · clic para desplegar`}
            onClick={() => plegar(col.estado)}
            onDragOver={e => { e.preventDefault(); setSobre(col.estado); }}
            onDragLeave={() => setSobre(s => (s === col.estado ? null : s))}
            onDrop={() => soltar(col.estado)}>
            <span className="kb-n">{col.items.length}</span>
            <span className="kb-plegada-tit" style={{ color: col.color }}>{ico} {nombre}</span>
          </div>
        );

        return (
        <div key={col.estado}
          className={`kb-col est-${col.estado} ${sobre === col.estado ? "kb-sobre" : ""}`}
          onDragOver={e => { e.preventDefault(); setSobre(col.estado); }}
          onDragLeave={() => setSobre(s => (s === col.estado ? null : s))}
          onDrop={() => soltar(col.estado)}>
          {/* La cabecera explica el arrastre. Vivía como una frase suelta en
              el topbar del tablero, ocupando media fila para siempre por algo
              que se aprende una vez — y al quitarla de allí había que ponerla
              DONDE se pregunta: encima de la columna a la que uno suelta. */}
          <div className="kb-head" style={{ color: col.color }}
            title={`Arrastra una tarjeta aquí para pasarla a ${nombre}`}>
            {col.titulo} <span className="kb-n">{col.items.length}</span>
            <span style={{ flex: 1 }} />
            {/* Plegar: el ⟨⟩ de Trello. stopPropagation para no disparar el
                drop de la columna al pulsarlo. */}
            <button className="kb-plegar" title={`Plegar ${nombre}`}
              onClick={e => { e.stopPropagation(); plegar(col.estado); }}>⟨⟩</button>
          </div>
          {col.items.map(p => {
            /* Sin `estado`: en el kanban la columna YA dice el estado, y una
               tarjeta de la columna Resuelta no necesita cuenta regresiva —
               pero tampoco estorba, y el filtro lo hace la columna. */
            const pl = plazoDe(p.fecha_limite);
            const d = pl?.d ?? null;
            const vencColor = pl?.color ?? null;
            return (
              <div key={p.id} className={`kb-card${p.marca ? " kb-ajena" : ""}`}
                /* Sin marca, la tarjeta no tenía `title` y no había forma de
                   descubrir que se arrastra: la única pista era una frase en
                   el topbar. Ahora lo dice la propia pieza que se arrastra. */
                title={p.marca === "delegado" ? "Lo pediste tú — lo trabaja otra persona"
                  : p.marca === "mencion" ? "Te menciona, pero no es tu responsabilidad"
                  : "Arrástrala a otra columna para cambiar su estado"}
                draggable
                onDragStart={() => setArrastrando(p.id)}
                onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                /* La tarjeta no es un <a> (es arrastrable y lleva enlaces dentro),
                   así que el navegador no sabe abrirla en otra pestaña. Se imita a
                   mano: Ctrl/⌘+clic o clic central → pestaña nueva; clic normal →
                   navega en la misma. */
                onClick={e => {
                  const url = `/caso/${p.id}`;
                  if (e.metaKey || e.ctrlKey) { window.open(url, "_blank", "noopener"); return; }
                  router.push(url);
                }}
                onAuxClick={e => {
                  if (e.button === 1) { e.preventDefault(); window.open(`/caso/${p.id}`, "_blank", "noopener"); }
                }}>
                <div style={{ fontSize: TXT.base, fontWeight: 600, lineHeight: 1.3 }}>
                  {icoTipo(p.tipo)} {p.titulo}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                  {/* Por qué este caso está en "Mis asuntos" si no es mío:
                      📤 lo pedí yo y lo hace otro · 👁 solo me menciona.
                      Sin esto, el tablero y el banco parecen contradecirse. */}
                  {p.marca === "delegado" && (
                    <span className="mini-ind" title="Lo pediste tú — lo trabaja otra persona"
                      style={{ color: "var(--blue)" }}>📤</span>
                  )}
                  {p.marca === "mencion" && (
                    <span className="mini-ind" title="Te menciona, pero no es tu responsabilidad"
                      style={{ color: "var(--dim)" }}>👁</span>
                  )}
                  {(p.resp as any)?.nombre
                    ? <span className="tv-resp" style={{ fontSize: TXT.chip, padding: "1px 8px" }}>{corto((p.resp as any).nombre)}</span>
                    : ["tarea", "problema", "pago"].includes(p.tipo) &&
                      <span style={{ color: "var(--yellow)", fontSize: TXT.chip }}>⚠ sin resp.</span>}
                  {d !== null && !CERRADOS.includes(p.estado) && (
                    <span style={{ color: vencColor!, fontSize: TXT.chip, fontWeight: 700 }}>
                      {d < 0 ? `vencido ${Math.abs(d)}d` : d === 0 ? "HOY" : `${d}d`}
                    </span>
                  )}
                  {p.nc > 0 && <span className="mini-ind">💬 {p.nc}</span>}
                  {p.sub > 0 && <span className="mini-ind">🧩 {p.sub}</span>}
                  {reacStr(p.reac) && <span className="mini-ind">{reacStr(p.reac)}</span>}
                  <span style={{ marginLeft: "auto" }}><VistaRapida pubId={p.id} /></span>
                </div>
                {(p.vinc || []).length > 0 && (
                  <div className="kb-chips">
                    {p.vinc.slice(0, 4).map((c: any, i: number) => (
                      <Link key={i} href={rutaEntidad(c.tipo, c.id) || `/entidad/${c.tipo}/${c.id}`}
                        onClick={e => e.stopPropagation()} className="kb-chip">
                        {ICO_ENT[c.tipo] || "🔗"} {c.nombre}
                      </Link>
                    ))}
                    {p.vinc.length > 4 && <span className="kb-chip">+{p.vinc.length - 4}</span>}
                  </div>
                )}
                {/* ⏳ Tiempo / ⚡ Trabajo: dos hilos para escanear la columna
                    sin abrir cada tarjeta. El detalle va en el tooltip. */}
                <BarrasProgreso p={p.prog} mini />
              </div>
            );
          })}
          {!col.items.length && <div className="kb-vacia">— vacío —</div>}
        </div>
        );
      })}
    </div>

    {/* La zona del eje archivado. Aparece solo al arrastrar y el COLOR dice el
        sentido desde ya, no solo el texto: violeta = archivar, verde =
        despertar. Aprendido a la mala —alguien (John, 18/07) arrastró aquí
        creyendo que archivaba y estaba despertando; el texto lo decía pero en
        caliente no se lee—. El color se ve sin leer. */}
    <div className={`kb-zona ${archivado ? "despertar" : "archivar"} ${sobreZona ? "kb-sobre" : ""} ${arrastrando ? "activa" : ""}`}
      onDragOver={e => { e.preventDefault(); setSobreZona(true); }}
      onDragLeave={() => setSobreZona(false)}
      onDrop={alaZona}>
      {archivado
        ? "↩ DESPERTAR — vuelve al tablero vivo"
        : "🗄 ARCHIVAR — sale de la vista, queda en la memoria"}
    </div>
    </>
  );
}
