"use client";
import { EntPicker, MultiPicker } from "@/components/Composer";
import { agregarVinculo, quitarVinculo, vincularEnLote, catalogosParaVincular } from "@/app/actions";
import Link from "@/components/Enlace";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";

/* Editor de vínculos de entidad de un caso: chips actuales con ✕ para quitar,
   y un picker por tipo para agregar. Reusa el EntPicker del Composer y las
   acciones genéricas agregarVinculo/quitarVinculo. Las etiquetas tienen su
   propio editor aparte.

   ══════════════════════════════════════════════════════════════════════════
   ⏱ LOS CATÁLOGOS SE PIDEN AL ABRIR LA BANDEJA, NO AL CARGAR LA PÁGINA

   Este componente recibía `catalogos` como prop: los ocho catálogos completos
   —proyectos, empresas, personas, convocatorias, postulaciones, equipamiento,
   lugares, compras— más trescientos objetos del repositorio. Y como es un
   componente de cliente, todo eso se serializa en el payload y BAJA AL
   NAVEGADOR en cada render del caso: al abrirlo, al comentar, y cada vez que
   se toca la fecha límite, porque `router.refresh()` vuelve a montar la página
   entera. Miles de filas por viaje para llenar nueve desplegables que la
   mayoría de las visitas ni abre.

   Ahora la bandeja los pide la primera vez que alguien la toca, y se quedan
   para el resto de la visita. Es lo mismo que ya hacía el «+» flotante con
   `datosNuevoCaso`.

   ⚠ Y la página deja de pagarlos también en el servidor: eran nueve consultas
   —ocho de tabla completa más la de objetos, que arrastra las de sus dueños—
   dentro de la única espera que toda visita paga.
   ══════════════════════════════════════════════════════════════════════════ */

const ENT_META: Record<string, string> = {
  proyecto: "📁 Proyecto", empresa: "🏢 Empresa", persona: "👤 Persona",
  convocatoria: "📜 Convocatoria", postulacion: "🎯 Postulación",
  equipamiento: "🎥 Equipo", lugar: "📍 Lugar",
  // Solo ícono, como en el compositor: la franja no da para otra palabra.
  objeto: "📚",
};
const ENT_TITULO: Record<string, string> = { objeto: "📚 Repositorio" };
/* (Otra copia: a ésta le faltaban `etiqueta` y `publicacion`.) */
const ENT_ICO = ICO_ENT;

export default function VinculosEditor({ pubId, actuales }: {
  pubId: string;
  actuales: { tipo: string; id: string; nombre: string; cartel?: string | null }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [catalogos, setCatalogos] = useState<Record<string, { id: string; nombre: string }[]> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errCat, setErrCat] = useState("");
  /* Con una orden de trabajo de 30 personas, los chips tapaban la página
     entera. Se muestran los primeros y el resto se despliega. */
  const [verTodos, setVerTodos] = useState(false);
  const LIMITE = 3;
  const hayMas = actuales.length > LIMITE;
  const visibles = verTodos || !hayMas ? actuales : actuales.slice(0, LIMITE);

  /* Una sola vez por visita.
     ⚠ Se engancha a `onPointerDown` Y a `onFocus`, y hacen falta los dos:
       · `pointerdown` se dispara al APOYAR el dedo o el ratón, así que la ida
         al servidor arranca mientras el desplegable se abre, no después.
       · `focus` es el que salva a quien navega con TECLADO. Con solo
         pointerdown, llegar al picker con Tab y abrirlo con Enter no pedía
         nada —`click` no es `pointerdown`— y el desplegable se quedaba vacío
         PARA SIEMPRE, diciendo «Sin resultados» al teclear. Es exactamente la
         mentira que la carga diferida tenía que evitar.
         (React usa `focusin`, que sí burbujea hasta este contenedor.)
     ⚠ Y los catálogos se quedan congelados el resto de la visita: si alguien
     da de alta un proyecto en otra pestaña, este picker no lo verá hasta
     recargar. Antes cada `router.refresh()` los traía de nuevo. Es el precio
     de no bajarlos en cada render, y se paga a sabiendas. */
  const pedirCatalogos = async () => {
    if (catalogos || cargando) return;
    setCargando(true); setErrCat("");
    const r: any = await catalogosParaVincular();
    setCargando(false);
    /* ⚠ El error se DICE. Un desplegable que se abre vacío se lee como «no hay
       ningún proyecto», que es lo contrario de lo que pasa. */
    if (r?.error) { setErrCat(r.error); return; }
    setCatalogos(r?.catalogos || {});
  };

  const refrescar = (r: any) => { setOcupado(false); if (r?.error) alert(r.error); else router.refresh(); };
  const quitar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await quitarVinculo(pubId, tipo, id));
  };
  const agregar = async (tipo: string, id: string) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await agregarVinculo(pubId, tipo, id));
  };
  const agregarVarias = async (tipo: string, ids: string[]) => {
    if (ocupado) return; setOcupado(true);
    refrescar(await vincularEnLote(pubId, tipo, ids));
  };

  const items = (t: string) => (catalogos?.[t] || []);

  return (
    <div className="vinc-editor">
      {/* Lo que ESTÁ vinculado: hechos. Van primero y pesan más. */}
      {actuales.length > 0 && (
        <div className="sel-chips vinc-puestos">
          {visibles.map(v => (
            <span key={v.tipo + v.id} className="echip">
              {/* Ruta central: un objeto del repositorio no vive en /entidad/… */}
              <Link href={rutaEntidad(v.tipo, v.id) || `/entidad/${v.tipo}/${v.id}`} style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                {v.cartel
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={v.cartel} alt="" className="echip-cartel" referrerPolicy="no-referrer" />
                  : <span>{ENT_ICO[v.tipo] || "🔗"}</span>}
                {v.nombre}
              </Link>
              <button className="x" title="Quitar vínculo" onClick={() => quitar(v.tipo, v.id)}>×</button>
            </span>
          ))}
          {hayMas && (
            <button type="button" className="echip echip-mas" onClick={() => setVerTodos(v => !v)}>
              {verTodos ? "ver menos" : `＋${actuales.length - LIMITE} más`}
            </button>
          )}
        </div>
      )}
      {/* Lo que se PUEDE vincular: controles. Un caso con ocho vínculos hacía
          quince píldoras seguidas y no se veía dónde acababan los hechos y
          empezaban los botones. La diferencia YA estaba —sólido vs punteado,
          radio 20 vs 9— y a ese tamaño, sobre negro, no llega. Una palabra
          sí llega. */}
      {/* ⚠ El aviso de «cargando» NO va aquí. `globals.css` avisa en mayúsculas
          de que esta fila entra JUSTA —«con el noveno se partía»—, y meter una
          palabra en la etiqueta empujaba el último picker a una segunda línea
          mientras dura la carga: el botón se mueve entre el `pointerdown` y el
          `pointerup`, y el clic no llega. Se dice dentro del menú. */}
      <div className="bandeja-vinc" onPointerDown={pedirCatalogos} onFocus={pedirCatalogos}>
        {/* Sin el «+», igual que en el compositor: la fila entra justa con los
            nueve tipos y el signo no aporta nada que los botones no digan. */}
        <span className="vinc-add-lbl">vincular</span>
        {/* ⚠ El 📚 se pinta SIEMPRE. Antes se escondía cuando su catálogo venía
            vacío —«no hay objetos en el sistema, no ofrezcas vincular uno»—, y
            eso ya no se puede saber sin haber pedido el catálogo: esconderlo
            hasta entonces sería un botón que aparece solo al tocar al de al
            lado. Si de verdad no hay ninguno, el desplegable lo dirá. */}
        {Object.keys(ENT_META).map(t => (
          <EntPicker key={t} etiqueta={ENT_META[t]} titulo={ENT_TITULO[t]}
            items={items(t)} cargando={cargando} onPick={id => agregar(t, id)} />
        ))}
      </div>
      {/* Vincular en lote: para una orden de trabajo que toca a muchas personas
          o empresas (ej. «revisión de firmas del equipo»). */}
      <div className="bandeja-vinc" onPointerDown={pedirCatalogos} onFocus={pedirCatalogos}>
        <span className="vinc-add-lbl">+ varias</span>
        {["persona", "empresa"].map(t => (
          <MultiPicker key={t} etiqueta={ENT_META[t]} items={items(t)} cargando={cargando}
            ocupado={ocupado} onConfirm={ids => agregarVarias(t, ids)} />
        ))}
      </div>
      {!!errCat && (
        <div className="err-inline" style={{ marginTop: 6 }}>
          ⚠ No se pudieron cargar las listas para vincular. Los desplegables
          saldrán vacíos, y eso <b>no</b> quiere decir que no haya nada.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{errCat}</code>
        </div>
      )}
    </div>
  );
}
