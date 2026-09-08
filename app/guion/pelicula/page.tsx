import { redirect } from "next/navigation";

/* ⚠ `/guion/pelicula` a secas, SIN id.
 *
 * Sin este archivo esa URL no cae en ningún sitio razonable: encaja en
 * `app/guion/[id]/page.tsx` con `id = "pelicula"`, que busca un TRATAMIENTO
 * con ese id, no encuentra nada y responde «no existe». O sea, exactamente el
 * fallo que motivó crear el índice —«quien borrara el id de la URL caía en una
 * página de error»— reintroducido un nivel más abajo por el segmento nuevo.
 *
 * Y le quita la razón a un comentario que llegué a escribir en la ficha: que
 * un segmento estático «no se equivoca nunca». Se equivoca en su propia raíz,
 * y cuesta cuatro líneas arreglarlo.
 *
 * `redirect` y no `notFound`: quien llega aquí quería la lista de películas. */
export default function PeliculaSinId() {
  redirect("/guion");
}
