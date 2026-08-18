"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarDato } from "@/app/actions";
import { ETIQ_TEL_REC, ETIQ_MAIL_REC, pareceCelular, clavePhone } from "@/lib/llaves";

/* ── TAPAR EL HUECO DONDE SE VE ──
 *
 * /llaves lleva desde el primer día diciendo la verdad más incómoda del
 * sistema: sesenta cuentas de las que no sabemos con qué se recuperan. Y hasta
 * ahora solo la decía. Para arreglar UNA había que salir a la ficha de la
 * empresa, encontrar su credencial entre las que tenga, pulsar «＋ dato de
 * esta cuenta», acordarse de que la etiqueta es «teléfono de recuperación» y
 * volver. Cuatro pasos, sesenta veces: doscientos cuarenta pasos para un
 * trabajo que son sesenta números.
 *
 * Nadie hace eso, y por eso el aviso llevaba meses en sesenta. Una pantalla
 * que solo sabe señalar el problema acaba enseñando a no mirarla.
 *
 * No hay modelo nuevo: escribe en `credencial_datos`, la misma tabla y la
 * misma acción que el formulario de la ficha. Lo único que cambia es desde
 * dónde se llama — que resulta ser todo lo que faltaba.
 */
export default function RegistrarLlave({ credencialId, dueno, duenoId, cuenta }: {
  credencialId: string;
  /** «empresa» o «persona»: a qué ficha pertenece la credencial (para el
   *  registro en su bitácora y para refrescar su página). */
  dueno: string;
  duenoId: string;
  /** El identificador de la cuenta, para nombrarla en el aviso de error. */
  cuenta: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  /* La etiqueta NO se elige: se DEDUCE de lo que se escribe. Un desplegable
     «teléfono / correo» delante de un campo que ya dice cuál es sería pedir
     que se declare dos veces lo mismo — y es la clase de paso que hace que
     sesenta cuentas sigan sin llave. Con «@» es correo; si no, teléfono. */
  const esCorreo = valor.includes("@");
  const etiqueta = esCorreo ? ETIQ_MAIL_REC : ETIQ_TEL_REC;

  /* Un número que no parece peruano no se rechaza —puede ser extranjero— pero
     se avisa: nueve dígitos empezando en 9 es lo normal aquí, y un dedazo se
     guarda igual de bien que un número bueno. */
  const raro = !esCorreo && valor.trim().length > 0 && !pareceCelular(valor);

  const guardar = async () => {
    const v = valor.trim();
    if (!v || ocupado) return;
    setOcupado(true); setError("");
    const r: any = await agregarDato(credencialId, dueno, duenoId, etiqueta, v);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setValor(""); setAbierto(false);
    router.refresh();
  };

  if (!abierto) {
    return (
      <button className="dato-btn" style={{ color: "var(--yellow)", fontWeight: 700 }}
        title={`Registrar con qué se recupera ${cuenta}`}
        onClick={() => setAbierto(true)}>＋ llave</button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input value={valor} onChange={e => setValor(e.target.value)} autoFocus
        onKeyDown={e => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") { setAbierto(false); setValor(""); setError(""); }
        }}
        placeholder="Celular o correo de recuperación"
        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "5px 9px", fontSize: 12, outline: "none", width: 210, color: "var(--text)" }} />
      {/* Se enseña qué se va a guardar ANTES de guardarlo: la etiqueta la
          decide el sistema, y una decisión automática que no se ve es una que
          nadie puede corregir. */}
      <span style={{ color: "var(--dim)", fontSize: 10.5, whiteSpace: "nowrap" }}>
        → {etiqueta}
      </span>
      {raro && (
        <span style={{ color: "var(--yellow)", fontSize: 10.5 }}
          title="En Perú son 9 dígitos y empiezan en 9. Se guarda igual — puede ser extranjero.">
          ⚠ {clavePhone(valor) ? "no parece peruano" : "faltan dígitos"}
        </span>
      )}
      <button className="dato-btn" disabled={ocupado || !valor.trim()}
        style={{ color: "var(--green)", fontWeight: 700 }} onClick={guardar}>
        {ocupado ? "…" : "guardar"}
      </button>
      <button className="dato-btn" style={{ color: "var(--dim)" }}
        onClick={() => { setAbierto(false); setValor(""); setError(""); }}>✕</button>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
    </span>
  );
}
