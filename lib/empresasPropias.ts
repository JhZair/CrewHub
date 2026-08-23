/* ══════════════════════════════════════════════════════════════════════════
   LAS EMPRESAS DEL COLECTIVO, CON SU CARA — en un solo sitio

   Dos pantallas necesitan lo mismo: la lista de empresas propias y el logo de
   cada una. Estaba escrito dos veces —en /obligaciones y en /comprobantes— con
   dos consultas parecidas pero no iguales: una acotaba los logos por ids y la
   otra no, una pedía `fecha_constitucion` y la otra también pero por otro
   motivo. Dos copias de la misma pregunta es como acaban discrepando en qué
   cuenta como «propia».

   ── POR QUÉ AQUÍ Y NO EN UN COMPONENTE ──
   Porque es una LECTURA, y quien la hace es el servidor. El componente que la
   pinta (components/BarraEmpresas) es de cliente y no debe saber de Supabase:
   así la misma barra sirve para una pantalla que carga las empresas en un
   layout y para otra que ya las tiene por otro camino.
   ══════════════════════════════════════════════════════════════════════════ */

export type EmpresaPropia = {
  id: string;
  nombre: string;
  ruc?: string | null;
  estado?: string | null;
  relacion?: string | null;
  fecha_constitucion?: string | null;
};

export type EmpresasConLogo = {
  empresas: EmpresaPropia[];
  /** `entidad_media.cartel_url` por id de empresa. */
  logos: Record<string, string>;
};

export async function empresasPropiasConLogo(supabase: any): Promise<EmpresasConLogo> {
  /* Las dos a la vez: los logos no dependen de qué empresas salgan —se piden
     todos los de tipo empresa y se cruzan en memoria—, así que esperar a la
     primera para acotar la segunda sería un viaje de ida y vuelta regalado por
     ahorrar unas filas que caben en un suspiro. */
  const [emp, media] = await Promise.all([
    supabase.from("empresas")
      .select("id,nombre,ruc,estado,relacion,fecha_constitucion")
      .eq("relacion", "propia").order("nombre"),
    supabase.from("entidad_media").select("entidad_id,cartel_url")
      .eq("entidad_tipo", "empresa"),
  ]);

  const logos: Record<string, string> = {};
  ((media?.data || []) as any[]).forEach((m: any) => {
    if (m.cartel_url) logos[m.entidad_id] = m.cartel_url;
  });

  return { empresas: (emp?.data || []) as EmpresaPropia[], logos };
}

/* ── LAS QUE PUEDEN TENER COMPROBANTES ──
   Sin RUC no hay quien emita ni reciba a su nombre: esa empresa sería una
   pestaña que se abre, sale vacía, y no hay forma de que deje de estarlo.
   Se mira que HAYA once dígitos, no que el dígito verificador cuadre. Con la
   validación estricta, una empresa con el RUC mal tecleado desaparecería sin
   decir por qué —y sus facturas con ella—; el error se corrige en /empresas,
   no escondiendo a quien lo tiene. */
export const conRuc = (e: EmpresaPropia) =>
  String(e.ruc || "").replace(/\D/g, "").length === 11;

/* ── EL ORDEN, Y POR TANTO CUÁL ES «LA PRIMERA» ──
 * Las que operan arriba; las demás al final, apagadas pero alcanzables — una
 * empresa cerrada conserva las facturas de cuando operaba.
 *
 * Vive aquí y no en la barra porque hay DOS sitios que necesitan la misma
 * respuesta: la barra, para encender la pestaña correcta cuando la URL todavía
 * no dice ninguna, y la página, para saber qué empresa abrir en ese mismo
 * caso. Si cada una ordenara por su cuenta, entrar a /comprobantes sin
 * parámetros encendería una pestaña y cargaría los datos de otra. No daría
 * error: se vería una lista de facturas bajo el nombre equivocado.
 *
 * Quién está operando lo decide `motivoNoDeclara`, en lib/obligaciones, que es
 * la misma regla de la pantalla de declaraciones. No se redefine aquí.
 */
export function ordenarEmpresas<T extends EmpresaPropia>(
  empresas: T[], operando: (e: T) => boolean,
): T[] {
  return [...empresas.filter(operando), ...empresas.filter(e => !operando(e))];
}
