"use client";
import { guardarEntidad, buscarParecidos } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { FORM_CONF, VALIDADORES, GRUPO_TONO, campoAplica, nombreCorto } from "@/lib/entidades";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const PALETA = ["#a78bfa", "#3b82f6", "#f59e0b", "#2ecc71", "#ec4899", "#2dd4bf", "#f4b400", "#60a5fa"];

/* ¿el valor parece un link abrible? (para el botón ↗ de campos de link) */
const esLink = (v?: string) => /^https?:\/\/\S+/.test((v || "").trim());

/* Campo de opciones múltiples: chips + autocompletado; guarda "a, b, c" */
function MultiTag({ valor, onChange, sugerencias, listId, error }: {
  valor: string; onChange: (v: string) => void;
  sugerencias: string[]; listId: string; error?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const partes = (valor || "").split(",").map(s => s.trim()).filter(Boolean);
  const agregar = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (!partes.includes(v)) onChange([...partes, v].join(", "));
    setDraft("");
  };
  const quitar = (p: string) => onChange(partes.filter(x => x !== p).join(", "));
  return (
    <div>
      {partes.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {partes.map(p => (
            <span key={p} className="badge"
              style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", display: "inline-flex", gap: 6, alignItems: "center", textTransform: "none", letterSpacing: 0 }}>
              {p}
              <button type="button" onClick={() => quitar(p)} style={{ color: "var(--dim)", fontWeight: 700 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input list={listId} value={draft}
        placeholder={partes.length ? "＋ agregar otra..." : "Escribe o elige; Enter para agregar"}
        onChange={e => {
          const v = e.target.value;
          if (sugerencias.includes(v)) agregar(v); else setDraft(v);
        }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregar(draft); }
        }}
        onBlur={() => draft && agregar(draft)}
        style={error ? { borderColor: "var(--red)" } : undefined} />
      <datalist id={listId}>
        {sugerencias.filter(s => !partes.includes(s)).map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

export function EntidadForm({ tipo, id, valores, onDone }:
  { tipo: string; id?: string; valores?: Record<string, any>; onDone?: () => void }) {
  const conf = FORM_CONF[tipo];
  // Al CREAR se ocultan los campos marcados soloEditar (ej. presupuesto
  // vigente de un proyecto: solo existe cuando ya está en ejecución)
  const campos = conf.campos.filter(c => !(c as any).soloEditar || id);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    campos.forEach(c => {
      // Los booleanos viajan como "si"/"no" por el formulario
      if (c.tipo === "bool") {
        f[c.key] = valores?.[c.key] === true ? "si" : valores?.[c.key] === false ? "no" : "";
        return;
      }
      /* String(): las columnas `numeric` (monto, puntaje, valor) vuelven de
         la base como NÚMERO, no como texto. Si se guardan así en el estado,
         cualquier .trim() del formulario revienta y el botón Guardar deja de
         responder sin decir nada. El servidor ya se protegía de esto; el
         formulario no. Aquí todo es texto: se convierte al entrar. */
      const v = valores?.[c.key];
      f[c.key] = v == null || v === ""
        ? (c.tipo === "color" ? PALETA[Math.floor(Math.random() * PALETA.length)] : "")
        : String(v);
    });
    return f;
  });
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");   // por qué no se guardó
  const [parecidos, setParecidos] = useState<{ id: string; nombre: string }[]>([]);
  const router = useRouter();

  // Al CREAR: aviso de posibles duplicados mientras se escribe el nombre
  useEffect(() => {
    if (id) return;
    const n = (form["nombre"] || "").trim();
    const timer = setTimeout(async () => {
      if (n.length < 4) { setParecidos([]); return; }
      const r: any = await buscarParecidos(tipo, n);
      setParecidos(r?.parecidos || []);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form["nombre"], id, tipo]);

  const guardar = async () => {
    if (guardando) return;
    // Validación en el propio formulario: marca los campos faltantes
    /* Un link pegado de la barra del navegador viene sin esquema
       ("drive.google.com/…"). Rechazarlo es cierto pero inútil: el operador
       no se equivocó de link, se equivocó de protocolo. Lo completamos y
       seguimos, en vez de trabarle el guardado por cinco caracteres. */
    const arreglado = { ...form };
    // Nunca asumir que el estado es texto: un solo .trim() sobre un número
    // tumba el guardado entero y en silencio.
    const txt = (k: string) => String(arreglado[k] ?? "").trim();
    vivos.forEach(c => {
      if (c.valida !== "url") return;
      const v = txt(c.key);
      if (v && !/^https?:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+\//.test(v))
        arreglado[c.key] = "https://" + v;
    });
    if (JSON.stringify(arreglado) !== JSON.stringify(form)) setForm(arreglado);

    const errs: Record<string, string> = {};
    // Solo lo que aplica: exigirle formato a un campo que ni se ve sería
    // negarse a guardar por algo que el usuario no puede ni ver ni arreglar.
    vivos.forEach(c => {
      const v = txt(c.key);
      if (c.requerido && !v) { errs[c.key] = "Este campo es obligatorio"; return; }
      // validación anti-humanos: si hay valor, debe tener el formato correcto
      if (v && c.valida && VALIDADORES[c.valida] && !VALIDADORES[c.valida][0].test(v)) {
        errs[c.key] = VALIDADORES[c.valida][1];
      }
    });
    setErrores(errs);
    const malos = Object.keys(errs);
    if (malos.length) {
      /* Antes esto era un `return` a secas: marcaba el campo en rojo y se
         iba callado. En un formulario largo dentro de un modal con scroll,
         el campo rojo queda fuera de pantalla y el efecto es que el botón
         Guardar «no hace nada». Un formulario que se niega a guardar tiene
         que decir por qué y llevarte al problema. */
      setAviso(malos.map(k => nombreCorto(campos.find(c => c.key === k)!)).join(", "));
      const el = document.getElementById(`campo-${malos[0]}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setAviso("");

    /* Solo se manda lo que aplica. `guardarEntidad` ignora las claves que no
       vengan, así que lo oculto NO se toca: si un documental con RENCA pasa a
       cobertura, su RENCA se queda guardado y vuelve a aparecer si lo cambias
       de nuevo. Ocultar no es borrar — un formulario no debe tirar un dato
       por un cambio de tipo, y menos en silencio. */
    const aGuardar: Record<string, string> = {};
    /* Los campos `verif` (RENIEC/SUNAT) NO se mandan: los llena la verificación
       y son de solo lectura. Enviarlos arriesga pisar un valor que la
       verificación actualizó mientras el formulario estaba abierto. */
    vivos.forEach(c => { if (!(c as any).verif && c.key in arreglado) aGuardar[c.key] = arreglado[c.key]; });

    setGuardando(true);
    const res = await guardarEntidad(tipo, id || null, aGuardar);
    setGuardando(false);
    if (res?.error) { alert(res.error); return; }
    if (!id && res?.id) { router.push(`/entidad/${tipo}/${res.id}`); return; }
    router.refresh();
    onDone?.();
  };

  const cancelar = () => { if (onDone) onDone(); else router.back(); };

  const setCampo = (key: string, valor: string) => {
    /* Updater FUNCIONAL, no `{ ...form }`: con `{ ...form }` la copia sale del
       render que creó este handler, y si dos cambios ocurren antes de
       re-renderizar (encadenar campos, un clic tras otro), el segundo pisa al
       primero con un estado viejo — «por ratos edita, por ratos no». Con `prev`
       siempre se parte del estado más reciente. */
    setForm(prev => {
      const next = { ...prev, [key]: valor };
      /* Cascada de opciones dependientes (ubigeo, subcategoría…): al cambiar un
         campo padre, los hijos que dependían de él (`sugerenciasPor.campo`)
         dejan de encajar, así que se limpian —y así en cadena, nieto incluido—. */
      let recienCambiados = [key];
      for (let nivel = 0; nivel < 4 && recienCambiados.length; nivel++) {
        const hijos = campos.filter((c: any) =>
          c.sugerenciasPor && recienCambiados.includes(c.sugerenciasPor.campo) && next[c.key]);
        hijos.forEach((c: any) => { next[c.key] = ""; });
        recienCambiados = hijos.map((c: any) => c.key);
      }
      return next;
    });
    setErrores(prev => {
      if (!prev[key]) return prev;
      const e = { ...prev }; delete e[key]; return e;
    });
  };

  // Sugerencias fijas o dependientes de otro campo (subcategoría ← categoría)
  const sugerenciasDe = (c: any): string[] | undefined => {
    if (c.sugerencias) return c.sugerencias;
    if (c.sugerenciasPor) {
      const valor = form[c.sugerenciasPor.campo];
      const propias = c.sugerenciasPor.mapa[valor];
      if (propias?.length) return propias;
      /* Sin el padre elegido pero CON valor propio ya guardado (empresa migrada
         antes de que existiera el combo): se deduce el padre desde ese valor
         —la lista que lo contiene—, para que el campo nunca quede sin opciones
         y se pueda cambiar por otro hermano. */
      const actual = form[c.key];
      if (actual) {
        const contiene = (Object.values(c.sugerenciasPor.mapa) as string[][])
          .find(lista => lista.includes(actual));
        if (contiene) return contiene;
      }
      /* Sin padre ni valor: solo se vuelca TODA la lista si es corta (p. ej.
         subcategorías). Para catálogos grandes —el ubigeo tiene ~1800 distritos—
         se deja vacío hasta elegir el padre: nada de volcar miles. */
      const todas = [...new Set(Object.values(c.sugerenciasPor.mapa).flat())] as string[];
      return todas.length <= 60 ? todas : [];
    }
    return undefined;
  };

  /* Lo que NO aplica según lo que ya eligió: a una cobertura por encargo no
     le falta el RENCA — no existe. Se recalcula en cada render porque depende
     de `form`: cambias «tipo» a cobertura y el bloque de fondos desaparece
     sin recargar. */
  const vivos = campos.filter(c => campoAplica(c as any, form));
  // Los campos con `grupo` salen al final, cada grupo en su propio recuadro
  const sueltos = vivos.filter(c => !(c as any).grupo);
  const grupos = [...new Set(vivos.map(c => (c as any).grupo).filter(Boolean))] as string[];

  const pintar = (c: any) => (
          <div key={c.key} id={`campo-${c.key}`} className="f-campo" style={c.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <span style={errores[c.key] ? { color: "var(--red)" } : undefined}>
              {c.label}{c.requerido && <b style={{ color: "var(--red)" }}> *</b>}
            </span>
            {c.auto || c.verif ? (
              /* Solo lectura: `auto` lo genera el sistema (folios); `verif` lo
                 llena la verificación automática (RENIEC/SUNAT). No se teclea. */
              <input disabled placeholder={c.auto ? "Se genera automáticamente" : "Lo llena la verificación automática"}
                value={id ? ((form[c.key] || "").replace(/_/g, " ") || "—") : ""}
                style={{ opacity: .55, cursor: "not-allowed" }} />
            ) : c.tipo === "select" ? (() => {
              /* Opciones fijas (`opciones`) o DEPENDIENTES de otro campo
                 (`sugerenciasPor`, p. ej. provincia←departamento, distrito←
                 provincia). Vacío hasta que se elija el padre: primero el de
                 arriba. */
              const selOpts = (c.opciones ?? sugerenciasDe(c) ?? []) as string[];
              return (
              <MiniSelect block value={form[c.key]} error={!!errores[c.key]}
                onSelect={v => setCampo(c.key, v)}
                options={[
                  ["", c.sugerenciasPor && !selOpts.length ? "— elige primero el de arriba —" : "—"],
                  // valor actual que no está entre las opciones (dato migrado): visible
                  ...(form[c.key] && !selOpts.includes(form[c.key])
                    ? [[form[c.key], `${form[c.key].replace(/_/g, " ")} (valor actual)`]] : []),
                  ...selOpts.map(o => [o, o.replace(/_/g, " ")]),
                ]} />
              );
            })() : c.tipo === "bool" ? (
              <MiniSelect block value={form[c.key]} error={!!errores[c.key]}
                onSelect={v => setCampo(c.key, v)}
                options={[["", "—"], ["si", "Sí"], ["no", "No"]]} />
            ) : c.tipo === "textarea" ? (
              <textarea rows={3} value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            ) : c.tipo === "color" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={form[c.key] || "#a78bfa"}
                  onChange={e => setCampo(c.key, e.target.value)}
                  style={{ width: 44, height: 32, padding: 2, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer" }} />
                <span style={{ color: "var(--dim)", fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
                  identifica al proyecto en listas y gráficos
                </span>
              </div>
            ) : c.tipo === "date" ? (
              <input type="date" value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            ) : sugerenciasDe(c) && c.multiple ? (
              <MultiTag valor={form[c.key]} onChange={v => setCampo(c.key, v)}
                sugerencias={sugerenciasDe(c)!} listId={`sug-${c.key}`} error={!!errores[c.key]} />
            ) : sugerenciasDe(c) ? (
              <>
                <input list={`sug-${c.key}`} value={form[c.key]}
                  onChange={e => setCampo(c.key, e.target.value)}
                  placeholder="Escribe o elige de la lista..."
                  style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
                <datalist id={`sug-${c.key}`}>
                  {sugerenciasDe(c)!.map(s => <option key={s} value={s} />)}
                </datalist>
              </>
            ) : c.valida === "url" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <input value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                  placeholder="https://..." inputMode="url"
                  style={{ flex: 1, minWidth: 0, ...(errores[c.key] ? { borderColor: "var(--red)" } : {}) }} />
                <a href={esLink(form[c.key]) ? form[c.key].trim() : undefined}
                  target="_blank" rel="noopener noreferrer"
                  title={esLink(form[c.key]) ? "Abrir el link en otra pestaña para revisarlo" : "Pega un link válido (https://…) para poder abrirlo"}
                  onClick={e => { if (!esLink(form[c.key])) e.preventDefault(); }}
                  className="btn btn-ghost"
                  style={{ padding: "0 12px", display: "inline-flex", alignItems: "center", fontSize: 15, textDecoration: "none", flex: "none",
                    opacity: esLink(form[c.key]) ? 1 : .4, cursor: esLink(form[c.key]) ? "pointer" : "not-allowed" }}>
                  ↗
                </a>
              </div>
            ) : (
              <input value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            )}
            {errores[c.key] && <span style={{ color: "var(--red)", fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>{errores[c.key]}</span>}
          </div>
  );

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <b style={{ fontSize: 15 }}>{id ? `✏️ Editar ${conf.titulo.toLowerCase()}` : `＋ Nuevo ${conf.titulo.toLowerCase()}`}</b>
      <div className="f-grid">{sueltos.map(pintar)}</div>

      {grupos.map(g => {
        const azul = GRUPO_TONO[g] === "azul";
        const c1 = azul ? "59,130,246" : "244,180,0";
        return (
          <div key={g} style={{ marginTop: 16, padding: "10px 13px 13px", borderRadius: 12, border: `1px solid rgba(${c1},.3)`, background: `rgba(${c1},.04)` }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: azul ? "var(--blue)" : "var(--yellow)", fontWeight: 700 }}>{g}</div>
            <div className="f-grid" style={{ marginTop: 4 }}>
              {vivos.filter(c => (c as any).grupo === g).map(pintar)}
            </div>
          </div>
        );
      })}

      {!id && parecidos.length > 0 && (
        <div style={{ marginTop: 12, padding: "9px 12px", background: "rgba(244,180,0,.08)", border: "1px solid rgba(244,180,0,.35)", borderRadius: 10, fontSize: 12.5, color: "var(--yellow)" }}>
          ⚠ Ya existen parecidos — verifica antes de crear un duplicado:{" "}
          {parecidos.map(p => (
            <a key={p.id} href={`/entidad/${tipo}/${p.id}`} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--yellow)", fontWeight: 700, marginLeft: 8, textDecoration: "underline" }}>
              {p.nombre} ↗
            </a>
          ))}
        </div>
      )}
      {aviso && (
        <div style={{ marginTop: 12, padding: "9px 12px", background: "rgba(255,77,94,.08)", border: "1px solid rgba(255,77,94,.4)", borderRadius: 10, fontSize: 12.5, color: "var(--red)" }}>
          ⚠ No se guardó — revisa: <b>{aviso}</b>. Te llevé al primero.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={cancelar}>Cancelar</button>
        <button className="btn" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/* Botón "Editar" que abre el formulario en ventana modal amplia */
export function Mantenimiento({ tipo, id, valores }:
  { tipo: string; id: string; valores: Record<string, any> }) {
  const [abierto, setAbierto] = useState(false);
  if (!FORM_CONF[tipo]) return null;
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setAbierto(true)}>✏️ Editar</button>
      {abierto && (
        <div className="modal-fondo"
          onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="modal-ed">
            <EntidadForm tipo={tipo} id={id} valores={valores} onDone={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </>
  );
}
