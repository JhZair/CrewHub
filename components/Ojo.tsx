"use client";
import VistaPersona from "@/components/VistaPersona";
import VistaEmpresa from "@/components/VistaEmpresa";

/* EL ⚡ SUELTO — el disparador de la vista rápida cuando no hay chip.
 *
 * En las listas (personas, empresas) la fila entera ya es un enlace por una
 * capa invisible (`fila-cubre`). Un botón dentro de esa fila TIENE que llevar
 * `fila-encima`, o la capa se lo come y el clic navega en vez de abrir —el
 * mismo detalle que ya resolvió VistaRapida en su día—.
 */
export function OjoPersona({ id }: { id: string }) {
  return (
    <VistaPersona personaId={id}>
      {(abrir) => (
        <button className="fila-encima chip-ojo" onClick={abrir}
          title="Vista rápida (sin salir de la lista)">⚡</button>
      )}
    </VistaPersona>
  );
}

export function OjoEmpresa({ id }: { id: string }) {
  return (
    <VistaEmpresa empresaId={id}>
      {(abrir) => (
        <button className="fila-encima chip-ojo" onClick={abrir}
          title="Vista rápida (sin salir de la lista)">⚡</button>
      )}
    </VistaEmpresa>
  );
}
