import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import RolesPresupuesto from "@/components/RolesPresupuesto";
import { itemsDeReferencia, comparaConVivo } from "@/lib/rolesPresupuesto";
import {
  traerFondo, traerPerfilActual, traerVersiones, traerRheFlaco,
} from "@/lib/fondoDatos";

/* ── 💼 POR ROL ──
 *
 * Cuánto le toca a cada uno y cuánto le falta cobrar. Estaba plegada dentro de
 * Financiera, debajo del presupuesto, con el argumento de que es una lectura de
 * sus cifras. Pero la pregunta que contesta es de personas —«¿cuánto le giro a
 * Katy?»— y ahí, tres plegables abajo, había que saber que existía para
 * encontrarla. Al lado de Equipo se lee sola: una pestaña dice quién trabaja y
 * la otra cuánto le toca.
 *
 * Era una de las seis pestañas de una página que las cargaba todas a la vez.
 * Ahora es su propia ruta, y de sus cuatro fuentes TRES ya viajaron con la
 * cabecera: el fondo (el presupuesto vivo), las versiones (la vigente) y los
 * recibos flacos. Lo único suyo es el catálogo de personas.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "💼 Por rol" };

export default async function PorRolPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* Token y quién soy, para el canal de tiempo real. Sin `token`, este canal se
     suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre— y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo».
     Las dos son de sesión, no de base: no cuestan un viaje a Supabase. */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* Las cuatro cacheadas ya las llamó el layout en este mismo render, así que
     en carga dura NO son viajes extra: comparten el suyo. (En navegación suave
     entre pestañas Next no rerenderiza el layout y sí cuestan — ver el aviso 2
     de lib/fondoDatos.ts. Aun así son cuatro consultas flacas contra las
     veintitantas de las seis pestañas juntas.) */
  const [ent, perfilActual, versiones, rheFondo, pc] = await Promise.all([
    traerFondo(params.id),
    traerPerfilActual(user.id),
    traerVersiones(params.id),
    /* ── EL FLACO ALCANZA AQUÍ ──
       `RolesPresupuesto` solo lee `persona_id` y `monto` de cada recibo: un
       recibo no dice a qué rol pertenece. La consulta gorda de la ficha vieja
       traía además el expediente, el cierre de liquidación y el nombre de la
       persona —y con ellos su respaldo por si falta db/pagos-expediente.sql—,
       todo para pintar la rendición, que ya no está en esta pestaña. */
    traerRheFlaco(params.id),
    /* ── Y AQUÍ NO VA EL `*` DE LA FICHA VIEJA ──
       La página de antes pedía `personas.*` porque la pestaña Equipo abre el
       directorio ENTERO con sus filtros de región, especialidad y estado
       SUNAT. Aquí las personas solo llenan un desplegable de «quién cobra este
       rol»: tres columnas. Ciento cuarenta filas con todas sus columnas para
       leer dos era el precio que se pagaba por compartir página. */
    supabase.from("personas").select("id,nombre,alias").order("nombre"),
  ]);
  /* «Admin» aquí significa «puede tocar los datos de plata de esta ficha», que
     no es lo mismo que tener /admin entero. El asistente de administración
     etiqueta partidas y no debería necesitar la llave maestra para eso — ver
     db/rhe-permisos.sql. */
  const esAdmin = !!((perfilActual as any)?.es_admin || (perfilActual as any)?.es_finanzas);

  const personasCat = ((pc.data || []) as any[]).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre }));

  const versPresu = (versiones as any[]).filter((v: any) => v.tipo === "presupuesto");
  const vigPresu = versPresu.find((v: any) => v.vigente) || null;
  const preItems = (((ent as any)?.presupuesto as any)?.items || []) as any[];

  /* ── SE MIRA EL PRESUPUESTO VIGENTE, NO EL VIVO ──
     Contra la versión vigente se rinde y se gira: es la que se envía a DAFO. El
     vivo es el borrador de la siguiente modificación. Las etiquetas (rol y
     quién cobra) sí salen del vivo, que es donde se escriben — ver
     `itemsDeReferencia`. Sin versión vigente todavía, es el vivo. */
  const vigItemsPre = (((vigPresu?.datos as any)?.items) || []) as any[];
  const itemsRol = itemsDeReferencia(vigItemsPre, preItems as any);
  /* Una versión vigente SIN ítems no es una referencia: `itemsDeReferencia` se
     cae al vivo, y decir «vigente» sobre las cifras del vivo sería lo único
     peor que no decir nada. Las dos pantallas tienen que responder lo mismo a
     «¿hay foto contra la que girar?». */
  const hayVigPresu = !!vigPresu && vigItemsPre.length > 0;
  const cambiosPre = comparaConVivo(vigItemsPre, preItems as any);

  return (
    <>
      {/* Solo lo de esta pestaña. Antes la página escuchaba nueve tablas sin
          filtro, así que un recibo girado en OTRO fondo la refrescaba.
          `postulaciones` —donde vive el presupuesto vivo, y por tanto las
          etiquetas de rol— ya la escucha el layout, filtrada por este id. */}
      <Realtime tablas={[
        { tabla: "rhe", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "version_fondo", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={user.id} />
      <p className="fondo-nat-sub">
        Cuánto suma cada rol en el presupuesto, cuánto se le giró y lo que falta — para saber
        qué RHE toca girar.
      </p>
      {/* Dentro de una `card`, igual que Equipo: son las dos caras de la
          misma pregunta —quién trabaja y cuánto le toca— y sin el marco
          esta quedaba flotando sobre el fondo de la página mientras la de
          al lado tenía su panel. */}
      <div className="card">
        <RolesPresupuesto postulacionId={params.id} items={itemsRol as any}
          personas={personasCat} rhe={(rheFondo.data || []) as any} esAdmin={esAdmin}
          /* Contra qué presupuesto habla, dicho en pantalla: si la
             vigente y el vivo ya no suman lo mismo, hay una modificación
             a medio hacer y las cifras de aquí son las de antes. */
          referencia={{
            vigente: hayVigPresu,
            etiqueta: vigPresu?.etiqueta || null,
            fecha: vigPresu?.creado_en || null,
            cambios: cambiosPre,
          }} />
      </div>
    </>
  );
}
