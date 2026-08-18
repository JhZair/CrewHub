import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "next/link";
import RegistrarLlave from "@/components/RegistrarLlave";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Avatar from "@/components/Avatar";
import Copiar from "@/components/Copiar";
import BuscadorLlave from "@/components/BuscadorLlave";
import {
  clavePhone, claseDeDato, esLlave, esLlaveProbable, ROTULO_CLASE,
  diasDesde, STALE_LLAVE, pareceCelular,
} from "@/lib/llaves";

export const metadata: Metadata = { title: "🔑 Llaves" };

/* LLAVES — con qué se recupera cada cuenta externa, y de quién es esa llave.
 *
 * Nace de un bloqueo real: no se pueden sumar cuentas a la casilla DAFO porque
 * para entrar a un Gmail hace falta el código que llega a un número que nadie
 * sabe de quién es. La pantalla responde las dos direcciones de esa pregunta:
 * dada una cuenta, qué la abre; dado un número, qué abre.
 *
 * Y responde una tercera que nadie pregunta hasta que es tarde: qué cuentas no
 * tienen llave registrada. Ese es el punto ciego — una cuenta sin llave no
 * falla hasta el día que hay que recuperarla, y ese día ya no hay margen.
 */

export default async function Llaves() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: creds }, { data: pers }, { data: datosPost }] = await Promise.all([
    supabase.from("credenciales")
      .select("id,plataforma,identificador,metodo_acceso,empresa_id,persona_id,"
        + "emp:empresas(id,nombre),per:personas(id,nombre,alias),"
        + "datos:credencial_datos(id,etiqueta,valor,verificado_en)")
      .order("plataforma").limit(500),
    supabase.from("personas")
      .select("id,nombre,alias,telefono,email,estado,tipo,foto_url")
      .limit(2000),
    /* Los contactos declarados en cada POSTULACIÓN. Entran aquí porque la
       pregunta es la misma —«este número, qué abre y de quién es»— y un
       teléfono puesto en un expediente de DAFO es tan reclamable como uno de
       recuperación: si muere, la notificación de subsanación no llega. */
    supabase.from("credencial_datos")
      .select("id,etiqueta,valor,verificado_en,post:postulaciones(id,codigo,proy:proyectos(nombre,nombre_corto))")
      .not("postulacion_id", "is", null).limit(2000),
  ]);

  /* Índice número → persona. Por los últimos 9 dígitos, porque en la base
     conviven «+51 984…» y «984…» y comparar literal fallaría por formato. */
  const porTel = new Map<string, any>();
  (pers || []).forEach(p => {
    const k = clavePhone((p as any).telefono);
    if (k && !porTel.has(k)) porTel.set(k, p);
  });
  const porMail = new Map<string, any>();
  (pers || []).forEach(p => {
    const e = String((p as any).email || "").trim().toLowerCase();
    if (e && !porMail.has(e)) porMail.set(e, p);
  });

  type Fila = {
    cred: any; dato: any; clase: ReturnType<typeof claseDeDato>;
    duenoLlave: any | null; dias: number | null;
  };
  const filas: Fila[] = [];
  const sinLlave: any[] = [];

  /* Cada contacto declarado se presenta como una «cuenta» más: no lo es —una
     postulación no tiene acceso— pero para esta pantalla se comporta igual, y
     tratarla aparte habría duplicado el agrupado y la búsqueda. */
  const credsPost = (datosPost || []).map((d: any) => {
    const p = Array.isArray(d.post) ? d.post[0] : d.post;
    const proy = Array.isArray(p?.proy) ? p.proy[0] : p?.proy;
    return {
      id: `post:${d.id}`,
      plataforma: "Postulación",
      identificador: [p?.codigo, proy?.nombre_corto || proy?.nombre].filter(Boolean).join(" · "),
      emp: null, per: null, _post: p?.id,
      datos: [{ id: d.id, etiqueta: d.etiqueta, valor: d.valor, verificado_en: d.verificado_en }],
    };
  });

  ([...(creds || []), ...credsPost] as any[]).forEach((c: any) => {
    const datos = (c.datos || []).map((d: any) => {
      const clase = claseDeDato(d.etiqueta, d.valor);
      const duenoLlave = clase.startsWith("tel")
        ? porTel.get(clavePhone(d.valor)) || null
        : porMail.get(String(d.valor || "").trim().toLowerCase()) || null;
      return { cred: c, dato: d, clase, duenoLlave, dias: diasDesde(d.verificado_en) };
    });
    const llaves = datos.filter((x: any) => esLlave(x.clase) || esLlaveProbable(x.clase));
    /* Una postulación sin contactos declarados no va a «sin llave»: no tiene
       acceso que recuperar. Se le reclama en su propia ficha, que es donde
       alguien puede hacer algo al respecto. */
    if (llaves.length === 0 && !c._post) sinLlave.push(c);
    filas.push(...datos);
  });

  const llaves = filas.filter(f => esLlave(f.clase) || esLlaveProbable(f.clase));
  /* Agrupadas por el VALOR de la llave: la pregunta es «este número, qué abre»,
     no «esta cuenta, qué tiene». */
  const porLlave = new Map<string, { valor: string; clase: any; dueno: any; usos: Fila[] }>();
  llaves.forEach(f => {
    const k = f.clase.startsWith("tel")
      ? clavePhone(f.dato.valor)
      : String(f.dato.valor || "").trim().toLowerCase();
    if (!k) return;
    const g = porLlave.get(k) || { valor: f.dato.valor, clase: f.clase, dueno: f.duenoLlave, usos: [] };
    g.usos.push(f);
    if (!g.dueno && f.duenoLlave) g.dueno = f.duenoLlave;
    porLlave.set(k, g);
  });
  const grupos = [...porLlave.entries()].sort((a, b) => b[1].usos.length - a[1].usos.length);

  const nom = (p: any) => p?.alias || p?.nombre || "";
  const duenoCuenta = (c: any) => {
    if (c._post) return { tipo: "postulacion", id: c._post, nombre: c.identificador };
    const e = Array.isArray(c.emp) ? c.emp[0] : c.emp;
    const p = Array.isArray(c.per) ? c.per[0] : c.per;
    return e ? { tipo: "empresa", ...e } : p ? { tipo: "persona", ...p } : null;
  };
  const huerfanas = grupos.filter(([, g]) => !g.dueno);
  const ajenas = grupos.filter(([, g]) => g.dueno && ["vetado", "inactivo"].includes(g.dueno.estado));

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>qué abre cada cuenta, y de quién es</span>
      </div>
      <h1 className="title-lg">🔑 Llaves</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 760, marginTop: -6 }}>
        Un número de recuperación no es un dato de contacto: es una llave. Si la cuenta se
        recupera con el celular de alguien que deja el equipo o cambia de chip, la cuenta se
        pierde entera — y no falla hasta el día que hay que recuperarla.
      </p>

      {/* ── El buscador: la pregunta que hoy obliga a escarbar ── */}
      <BuscadorLlave
        personas={(pers || []).map((p: any) => ({
          id: p.id, nombre: p.nombre, alias: p.alias, telefono: p.telefono,
          email: p.email, foto_url: p.foto_url,
        }))}
        llaves={grupos.map(([k, g]) => ({
          k, valor: g.valor, clase: g.clase,
          dueno: g.dueno ? { id: g.dueno.id, nombre: nom(g.dueno) } : null,
          usos: g.usos.map(u => ({
            id: u.cred.id, plataforma: u.cred.plataforma,
            identificador: u.cred.identificador,
            dueno: duenoCuenta(u.cred)?.nombre || "",
          })),
        }))}
      />

      {/* ── El punto ciego, primero: cuentas sin ninguna llave ── */}
      {sinLlave.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(244,180,0,.4)" }}>
          <div className="panel-h" style={{ color: "var(--yellow)" }}>
            ⚠ Sin llave registrada · {sinLlave.length}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 8 }}>
            No sabemos con qué se recuperan. Si alguien pierde el acceso, hay que adivinar —
            y es exactamente lo que está frenando sumar cuentas a la casilla.
          </div>
          {sinLlave.map((c: any) => {
            const d = duenoCuenta(c);
            return (
              <div className="info-row" key={c.id}>
                <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{c.plataforma}</span>
                <b style={{ fontSize: 13 }}>{c.identificador || "—"}</b>
                <span style={{ flex: 1 }} />
                {/* ── SE TAPA AQUÍ MISMO ──
                    Esta lista llevaba meses en sesenta porque solo sabía
                    señalar: para arreglar una había que ir a la ficha,
                    encontrar la credencial y acordarse del nombre del campo.
                    El enlace al dueño se queda —a veces hace falta ver la
                    ficha entera— pero ya no es el único camino. */}
                {d && d.tipo !== "postulacion" && (
                  <RegistrarLlave credencialId={c.id} dueno={d.tipo} duenoId={d.id}
                    cuenta={c.identificador || c.plataforma} />
                )}
                {d && (
                  <Link href={`/entidad/${d.tipo}/${d.id}`} style={{ color: "var(--blue)", fontSize: 12 }}>
                    {d.nombre} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Llaves cuyo dueño no reconocemos ── */}
      {huerfanas.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(239,68,68,.4)" }}>
          <div className="panel-h" style={{ color: "var(--red)" }}>
            ✕ Llaves de nadie · {huerfanas.length}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 8 }}>
            Ese valor no coincide con ninguna persona de la base. O es de alguien que no está
            registrado, o quedó de un número viejo — en los dos casos, quien tenga ese teléfono
            hoy puede recuperar estas cuentas.
          </div>
          {huerfanas.map(([k, g]) => (
            <div className="info-row" key={k}>
              <span style={{ fontSize: 12 }}>{ROTULO_CLASE[g.clase]}</span>
              <b><Copiar valor={g.valor} etiqueta="la llave" /></b>
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--dim)", fontSize: 12 }}>
                abre {g.usos.length}: {g.usos.map(u => u.cred.plataforma).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {ajenas.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(239,68,68,.4)" }}>
          <div className="panel-h" style={{ color: "var(--red)" }}>
            ⚠ Llaves de gente que ya no está · {ajenas.length}
          </div>
          {ajenas.map(([k, g]) => (
            <div className="info-row" key={k}>
              <Avatar nombre={g.dueno?.nombre} src={g.dueno?.foto_url} size={26} />
              <b>{nom(g.dueno)}</b>
              <span className="badge" style={{ color: "var(--red)", background: "rgba(239,68,68,.12)" }}>{g.dueno.estado}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--dim)", fontSize: 12 }}>abre {g.usos.length} cuenta(s)</span>
            </div>
          ))}
        </div>
      )}

      {/* ── El inventario: cada llave y lo que abre ── */}
      <div className="card">
        <div className="panel-h">🔑 Por llave · {grupos.length}</div>
        {grupos.length === 0 && (
          <div className="empty" style={{ padding: "16px 0" }}>
            Todavía no hay ninguna llave registrada. Se anotan como dato de cada cuenta,
            con la etiqueta «teléfono de recuperación».
          </div>
        )}
        {grupos.map(([k, g]) => {
          const dias = Math.min(...g.usos.map(u => u.dias ?? 99999));
          const viejo = dias === 99999 ? null : dias;
          return (
            <div key={k} className="llave-grupo">
              <div className="llave-cab">
                {g.dueno
                  ? <>
                      <Avatar nombre={g.dueno.nombre} src={g.dueno.foto_url} size={26} />
                      <Link href={`/entidad/persona/${g.dueno.id}`} className="llave-quien">{nom(g.dueno)}</Link>
                    </>
                  : <span className="llave-quien" style={{ color: "var(--red)" }}>sin dueño conocido</span>}
                <span className="llave-val"><Copiar valor={g.valor} etiqueta="la llave" /></span>
                <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{ROTULO_CLASE[g.clase]}</span>
                <span style={{ flex: 1 }} />
                {viejo === null
                  ? <span className="badge" style={{ color: "var(--red)", background: "rgba(239,68,68,.12)" }}>sin confirmar</span>
                  : viejo > STALE_LLAVE
                    ? <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>hace {viejo} d</span>
                    : <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>confirmada</span>}
              </div>
              <div className="llave-usos">
                {g.usos.map((u, i) => {
                  const d = duenoCuenta(u.cred);
                  return (
                    <div key={i} className="llave-uso">
                      <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{u.cred.plataforma}</span>
                      <span>{u.cred.identificador || "—"}</span>
                      {d && <span style={{ color: "var(--dim)" }}>· {d.nombre}</span>}
                      {esLlaveProbable(u.clase) && (
                        <span style={{ color: "var(--yellow)", fontSize: 11 }}
                          title="Está etiquetado como dato de contacto, no de recuperación. Puede que la plataforma lo use igual para recuperar — o puede que no. Nadie lo confirmó.">
                          ◌ probable
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
