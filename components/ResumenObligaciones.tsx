import Link from "@/components/Enlace";
import Avatar from "@/components/Avatar";
import Firma, { type Quien } from "@/components/Firma";
import { haceDias, fechaLarga, fechaHoraLima } from "@/lib/fechas";
import { motivoNoDeclara, META_SIT, alDia } from "@/lib/obligaciones";
import type { EmpresaPropia } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   TODAS LAS EMPRESAS, EN UNA COLUMNA DE ROJOS

   La pantalla apilaba las quince empresas con sus bloques plegables, así que
   para saber si alguien tenía algo vencido había que desplegar, mirar y
   plegar, empresa por empresa. El semáforo estaba —cada cabecera lo tenía—
   pero repartido en quince sitios que no se leen juntos.

   Aquí la pregunta se contesta de una vez: quién debe algo, cuánto, y quién
   ya está al día.

   ── EL ORDEN ES LA DEUDA ──
   Primero quien tiene vencidos, luego quien tiene algo por vencer, luego el
   resto. Ordenar por nombre sería alfabetizar un problema.

   ── LAS QUE HOY NO DECLARAN NO ENSUCIAN ──
   Una empresa sin RUC o cerrada aparece al final y apagada, con el motivo. No
   se esconde: es donde se ve que le falta el RUC. Pero no compite con los
   rojos de verdad, que es lo que pasaba cuando todas pesaban igual.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaObl = {
  empresaId: string;
  vencidos: number;
  porVencer: number;
  declarados: number;
  /** De cuántos hay que responder. NO es cuántas filas hay: los meses de una
   *  obligación apagada no entran, porque no había que declararlos. */
  total: number;
  /** Meses de un bloque apagado. Fuera de la cuenta, pero dichos. */
  inactivos?: number;
  /** Cuándo se apuntó el último periodo en CrewHub, y quién. */
  ultima?: string | null;
  ultimaPor?: Quien | null;
  /** A quién se le avisa. Es un CONJUNTO porque cada obligación tiene el suyo
   *  y en una empresa pueden ser dos; aplanarlo a uno obligaría a elegir cuál
   *  mentir. Solo cuenta lo activo: lo apagado no avisa a nadie. */
  responsables?: Quien[];
  /** Obligaciones activas SIN encargado. No es un cero cualquiera: el aviso de
   *  vencimiento abre un caso y ese caso no tiene a quién asignárselo. */
  sinResponsable?: number;
};

/* «jul 2021». El mes y el año bastan para recorrer quince filas con la vista;
   el día exacto vive en el `title`, que es donde se comprueba y no donde
   estorba. Se construye a mano y no con `toLocaleDateString` porque la fecha
   viene como 'YYYY-MM-DD' y pasarla por `new Date()` la corre un día en zonas
   al oeste de Greenwich — el mismo bicho que ya costó una ronda en lib/fechas. */
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"];
const mesAnio = (f: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(f || ""));
  return m ? `${MES_CORTO[Number(m[2]) - 1]} ${m[1]}` : "";
};

export default function ResumenObligaciones({ empresas, logos, filas, href }: {
  empresas: EmpresaPropia[];
  logos?: Record<string, string>;
  filas: Map<string, FilaObl>;
  href: (empresaId: string) => string;
}) {
  const vacio: FilaObl = { empresaId: "", vencidos: 0, porVencer: 0, declarados: 0, total: 0, inactivos: 0 };

  const total = empresas.reduce((s, e) => {
    const f = filas.get(e.id) || vacio;
    return {
      vencidos: s.vencidos + f.vencidos,
      porVencer: s.porVencer + f.porVencer,
      declarados: s.declarados + f.declarados,
      total: s.total + f.total,
    };
  }, { vencidos: 0, porVencer: 0, declarados: 0, total: 0 });

  const orden = [...empresas].sort((a, b) => {
    const fa = filas.get(a.id) || vacio, fb = filas.get(b.id) || vacio;
    const na = !!motivoNoDeclara(a), nb = !!motivoNoDeclara(b);
    if (na !== nb) return na ? 1 : -1;              // las que hoy no declaran, al final
    return (fb.vencidos - fa.vencidos)
      || (fb.porVencer - fa.porVencer)
      || a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="res-emp-tit">
        <b>Todas las empresas</b>
        <span style={{ color: "var(--dim)" }}>
          {total.vencidos > 0 && (
            <span style={{ color: "var(--red)" }}>🔴 {total.vencidos} vencido(s) · </span>
          )}
          {total.porVencer > 0 && (
            <span style={{ color: "var(--yellow)" }}>🟡 {total.porVencer} por vencer · </span>
          )}
          ✅ {total.declarados} de {total.total}
        </span>
      </div>

      <div className="res-obl-cab">
        <span>Empresa</span>
        <span style={{ textAlign: "right" }}>Vencidos</span>
        <span style={{ textAlign: "right" }}>Por vencer</span>
        <span style={{ textAlign: "right" }}>Declarados</span>
        <span title="A quién avisa CrewHub cuando algo está por vencer">Responde</span>
        <span>Último apunte</span>
      </div>

      {orden.map(e => {
        const f = filas.get(e.id) || vacio;
        const m = motivoNoDeclara(e);
        /* ── EL ✅ DE «AL DÍA» ──
           La columna de declarados ya dice «29 de 29», pero para saber si eso
           está completo hay que comparar dos números en cada fila, quince
           veces. El ✅ contesta de un vistazo lo que la columna obliga a
           calcular.
           NO se pinta en las que hoy no declaran (sin RUC, en cierre): esa fila
           ya dice por qué está en cero, y un «al día» encima sería una segunda
           afirmación que contradice a la primera. */
        const ok = !m && alDia(f);
        return (
          <Link key={e.id} href={href(e.id)} className={`res-emp-fila${m ? " fila-tenue" : ""}`}>
            <span className="res-emp-nom">
              <Avatar nombre={e.nombre} src={logos?.[e.id]} size={22} />
              <b>{e.nombre}</b>
              {/* El motivo va pegado al nombre y no en su propia columna: es
                  por qué esa fila está en cero, no un dato que se compare
                  con el de al lado. */}
              {m && <span className="res-obl-motivo" title={m.ayuda}>{m.txt}</span>}
              {/* ── DESDE CUÁNDO EXISTE ──
                  Es el denominador de toda la fila: explica por qué una empresa
                  tiene 63 periodos y otra 5 sin que eso signifique que alguien
                  se descuidó. Va pegada al nombre y apagada porque es identidad,
                  no una cifra que se compare con la de al lado.
                  Y su ausencia se dice: sin fecha de constitución, la generación
                  de periodos arranca «hace un año» —un suelo inventado— así que
                  el «N de N» de esa fila puede estar contando de menos sin que
                  nada más lo delate. */}
              {e.fecha_constitucion ? (
                <span className="res-obl-desde"
                  title={`Constituida el ${fechaLarga(e.fecha_constitucion)}`}>
                  desde {mesAnio(e.fecha_constitucion)}
                </span>
              ) : (
                <span className="res-obl-desde res-obl-desde-falta"
                  title="Sin fecha de constitución cargada. Los periodos se generan desde hace un año, así que puede faltar historia sin que nada lo avise.">
                  ⚠ sin constitución
                </span>
              )}
              {/* Lo apagado no suma al semáforo, pero se ve: si aquí dice «⏸ 2»
                  y alguien esperaba dos declaraciones, el bloque está apagado
                  por error y esta es la única pista que lo delata. */}
              {!!f.inactivos && (
                <span className="res-obl-motivo" title={META_SIT.inactiva.ayuda}>
                  ⏸ {f.inactivos} sin vigilar
                </span>
              )}
            </span>
            <span style={{ textAlign: "right", color: f.vencidos ? "var(--red)" : "var(--dim)", fontWeight: f.vencidos ? 700 : 400 }}>
              {f.vencidos || "—"}
            </span>
            <span style={{ textAlign: "right", color: f.porVencer ? "var(--yellow)" : "var(--dim)", fontWeight: f.porVencer ? 700 : 400 }}>
              {f.porVencer || "—"}
            </span>
            <span style={{ textAlign: "right", color: ok ? "var(--green)" : "var(--muted)" }}
              title={ok ? "Al día: todo lo que había que declarar está declarado" : undefined}>
              {ok && <span aria-label="al día">✅ </span>}
              {f.total ? `${f.declarados} de ${f.total}` : <i style={{ color: "var(--dim)" }}>sin periodos</i>}
            </span>
            {/* ── A QUIÉN SE LE AVISA ──
                «Último apunte» dice quién tocó esto la última vez, que NO es lo
                mismo que quién responde: Wilfredo puede haber importado las
                declaraciones de una empresa que lleva Katy. Son dos preguntas
                distintas y hasta ahora la tabla solo contestaba una.
                Y lo importante no son las caras: es el «⚠ N sin responsable».
                Cuando algo vence, `rondaObligaciones` abre un caso y se lo
                asigna al encargado — sin encargado, el caso nace huérfano y no
                le suena a nadie. Esa es la fila que hay que arreglar. */}
            <span className="res-obl-resp">
              {(f.responsables || []).map((q, i) => (
                <Firma key={i} quien={q} size={16} />
              ))}
              {!!f.sinResponsable && (
                <span className="obl-sin-resp" title="Cuando una de estas obligaciones venza, el aviso se abrirá sin nadie a quien pedírselo">
                  ⚠ {f.sinResponsable} sin responsable
                </span>
              )}
              {!f.responsables?.length && !f.sinResponsable && (
                <i style={{ color: "var(--dim)" }}>—</i>
              )}
            </span>
            {/* Cuándo se tocó por última vez. Una empresa al día y una que
                nadie mira desde marzo se ven igual en las tres columnas de la
                izquierda; esta las distingue. */}
            <span className="res-emp-ult">
              {f.ultima ? (
                <>
                  {/* «ayer» se lee rápido pero no se puede comprobar. La fecha
                      exacta va en el título: si alguien cree que ese apunte es
                      de otro día, aquí lo verifica sin abrir la empresa. */}
                  <span title={`Apuntado el ${fechaLarga(f.ultima)} a las ${fechaHoraLima(f.ultima).split(", ").pop()}`}>
                    {haceDias(f.ultima)}
                  </span>
                  {f.ultimaPor && (
                    <>
                      <span style={{ color: "var(--dim)" }}>·</span>
                      <Firma quien={f.ultimaPor} />
                    </>
                  )}
                </>
              ) : (
                <i style={{ color: "var(--dim)" }}>nunca</i>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
