/* LA MINIATURA DE UN EQUIPO, EN UN SOLO SITIO.
 *
 * Ocho píxeles de JSX que estaban escritos a mano en cuatro componentes
 * —PanelKits, PanelEnsamblados, PanelSitios y el escogedor de entregas—, y
 * cada copia con su propio despiste: unas ponen `referrerPolicy`, otras no;
 * el hueco sin foto es 🎥 en tres y en otra un cuadro vacío. Nada de eso
 * falla: sale una fila con la foto rota y otra sin ella, y pasa por diseño.
 *
 * ── POR QUÉ `referrerPolicy="no-referrer"` ──
 * No es un detalle de privacidad: los carteles se sirven desde almacenamiento
 * externo y varios proveedores RECHAZAN la petición si el `Referer` no es su
 * propio dominio. Sin esto, la miniatura sale rota en producción y entera en
 * local —que es la peor forma de fallar, porque no se ve al programar—.
 *
 * ── EL TAMAÑO NO VIVE AQUÍ ──
 * Sale de `--mini`, que cada pantalla fija a lo suyo: 60 px donde se escoge
 * mirando (armar un kit), 38 en las listas de un combo, 34 en el árbol de
 * sitios. Pasarlo como prop obligaría a repetir el número en cada uso, que es
 * exactamente de donde venía la divergencia.
 *
 * ⚠ Las cuatro copias de antes SIGUEN en sus componentes. No se tocan en esta
 * ronda a propósito: son pantallas que ahora mismo funcionan y el cambio no
 * las mejora en nada visible. Lo que sí evita esto es que las listas nuevas
 * del combo nazcan siendo la quinta y la sexta copia. Cuando toque volver a
 * cualquiera de esas cuatro, se cambian ahí y se borran de sus archivos.
 */
export default function MiniEquipo({ url, hueco = "🎥" }: {
  /** El cartel del equipo, o null si no tiene foto. */
  url?: string | null;
  /** Qué se pinta cuando no hay foto. Un sitio no es una cámara: quien
   *  quiera 📦 lo dice, y no se queda con un icono que miente. */
  hueco?: string;
}) {
  return (
    <span className="mini-eq">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : <span>{hueco}</span>}
    </span>
  );
}
