"use client";

/* 🪄 INVOCAR CON @ — el autocompletado, en un solo sitio.

   Vivía dentro de la caja de comentarios del caso. Cuando el repositorio
   estrenó su propia caja, el `@` seguía funcionando al ENVIAR —el servidor
   reconoce la mención y avisa— pero no salía la lista de nombres al escribir:
   tecleabas «@j» y no pasaba nada, así que parecía roto. Y sin la lista hay
   que acertar el nombre exacto y pegado («@JuanPérez»), que es justo lo que
   el desplegable evita.

   Como el reconocimiento del servidor es uno solo, la ayuda para escribirlo
   también debe serlo: si un día cambia la forma de escribir una mención, no
   puede cambiar en una caja y no en la otra. */

export type Perfil = { id: string; nombre: string };

const nrmA = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Estado del autocompletado a partir de lo que hay escrito. */
export function menciones(txt: string, perfiles: Perfil[]) {
  // El @token pegado al final: solo se sugiere mientras se está escribiendo.
  const enMencion = txt.match(/@([^\s@]*)$/);
  const candidatos = enMencion
    ? perfiles.filter(p =>
        nrmA(p.nombre).replace(/\s+/g, "").startsWith(nrmA(enMencion[1]))
        // También por cualquier palabra del nombre: «@perez» encuentra a Ana Pérez
        || nrmA(p.nombre).split(/\s+/).some(w => w.startsWith(nrmA(enMencion[1])))
      ).slice(0, 5)
    : [];
  /* El nombre se pega SIN espacios: así el servidor lo reconoce como un solo
     token al leer el comentario. */
  const aplicar = (nombre: string) =>
    txt.replace(/@[^\s@]*$/, "@" + nombre.replace(/\s+/g, "") + " ");
  return { enMencion, candidatos, aplicar };
}

export function MencionesMenu({ candidatos, onElegir }: {
  candidatos: Perfil[];
  onElegir: (nombre: string) => void;
}) {
  if (!candidatos.length) return null;
  return (
    <div className="menciones-menu">
      {candidatos.map(p => (
        /* `onMouseDown` con `preventDefault`, no `onClick`: el clic quitaría
           el foco del textarea antes de disparar y el cursor se perdería. */
        <button key={p.id} type="button"
          onMouseDown={e => { e.preventDefault(); onElegir(p.nombre); }}>
          🪄 {p.nombre}
        </button>
      ))}
    </div>
  );
}
