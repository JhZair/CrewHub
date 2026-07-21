import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { montoDeItems, normalizarPre } from "@/lib/precontratos";
import { nombreRubro } from "@/lib/rubros";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from "docx";

/* Node (no edge): docx arma un buffer binario. */
export const runtime = "nodejs";

const soles = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// «12345.6» -> «doce mil trescientos…» sería ideal, pero basta el número claro.
const hoy = () =>
  new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

/* GET /api/precontrato?post=<postulacionId>&pre=<precontratoId>
   Devuelve el .docx del precontrato de una persona. El monto se toma del ítem
   del presupuesto vivo (no de una copia): documento y presupuesto van juntos. */
export async function GET(req: NextRequest) {
  const post = req.nextUrl.searchParams.get("post") || "";
  const pre = req.nextUrl.searchParams.get("pre") || "";
  if (!post || !pre) return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no encontrada." }, { status: 401 });

  const { data: p } = await supabase.from("postulaciones")
    .select("id, precontratos, presupuesto, proy:proyectos(nombre), conv:convocatorias(nombre,anio), emp:empresas(nombre,razon_social,ruc,domicilio_fiscal)")
    .eq("id", post).single();
  if (!p) return NextResponse.json({ error: "Postulación no encontrada." }, { status: 404 });

  const filas: any[] = ((p.precontratos as any) || []).map(normalizarPre);
  const c = filas.find(f => f.id === pre);
  if (!c) return NextResponse.json({ error: "Precontrato no encontrado." }, { status: 404 });

  const { data: persona } = await supabase.from("personas")
    .select("nombre, ruc_dni, region, provincia, distrito")
    .eq("id", c.persona_id).single();
  if (!persona) return NextResponse.json({ error: "Persona no encontrada." }, { status: 404 });

  const items: any[] = (p.presupuesto as any)?.items || [];
  // El honorario es la SUMA de los ítems elegidos (los que aún existen).
  const elegidos = items.filter(i => c.item_ids.includes(i.id));
  const monto = montoDeItems(items, c.item_ids);

  const emp: any = p.emp || {};
  const proy: any = p.proy || {};
  const conv: any = p.conv || {};

  const contratante = emp.razon_social || emp.nombre || "LA PRODUCTORA";
  const domicilio = [persona.distrito, persona.provincia, persona.region].filter(Boolean).join(", ");
  const conceptoItem = elegidos.length
    ? elegidos.map(i => `${nombreRubro(i.rubro)} — ${(i.concepto || "").trim() || "servicios"}`).join("; ")
    : "los servicios acordados";

  const H = (t: string) => new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: t, bold: true, size: 24 })],
  });
  const P = (children: (TextRun | string)[], opts: any = {}) => new Paragraph({
    spacing: { after: 120 }, alignment: opts.align, ...opts,
    children: children.map(x => typeof x === "string" ? new TextRun({ text: x, size: 22 }) : x),
  });
  const B = (t: string) => new TextRun({ text: t, bold: true, size: 22 });
  const R = (t: string) => new TextRun({ text: t, size: 22 });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 240 },
          children: [new TextRun({ text: "PRECONTRATO — CARTA DE COMPROMISO", bold: true, size: 28 })],
        }),
        P([
          R("Conste por el presente documento el compromiso de contratación que celebran, de una parte, "),
          B(contratante),
          R(emp.ruc ? `, con RUC ${emp.ruc}` : ""),
          R(emp.domicilio_fiscal ? `, con domicilio fiscal en ${emp.domicilio_fiscal}` : ""),
          R(" (en adelante, LA PRODUCTORA); y de la otra parte, "),
          B(persona.nombre || "EL/LA COLABORADOR/A"),
          R(persona.ruc_dni ? `, identificado/a con DNI/RUC N° ${persona.ruc_dni}` : ""),
          R(domicilio ? `, domiciliado/a en ${domicilio}` : ""),
          R(" (en adelante, EL/LA COLABORADOR/A), en los términos siguientes:"),
        ]),

        H("PRIMERA — Antecedentes"),
        P([
          R("LA PRODUCTORA presenta el proyecto "),
          B(proy.nombre || "(proyecto)"),
          R(" a la convocatoria "),
          B(`${conv.nombre || "(convocatoria)"}${conv.anio ? ` ${conv.anio}` : ""}`),
          R(". El presente compromiso queda sujeto a la condición suspensiva de que dicho proyecto resulte beneficiario del estímulo económico."),
        ]),

        H("SEGUNDA — Objeto y rol"),
        P([
          R("EL/LA COLABORADOR/A se compromete a desempeñar el rol de "),
          B(c.cargo || "(rol)"),
          R(" en el proyecto, prestando "),
          R(conceptoItem),
          R("."),
        ]),

        H("TERCERA — Contraprestación"),
        P([
          R("Por los servicios descritos, LA PRODUCTORA pagará a EL/LA COLABORADOR/A la suma de "),
          B(soles(monto)),
          R(monto ? "" : " (monto por definir en el presupuesto)"),
          R(". Este monto es coherente con el presupuesto presentado a la convocatoria."),
        ]),
        ...(c.forma_pago ? [P([B("Forma de pago: "), R(c.forma_pago)])] : []),

        H("CUARTA — Vigencia"),
        P([R("El contrato definitivo se suscribirá una vez confirmada la adjudicación del estímulo y la disponibilidad de los recursos, conforme al cronograma del proyecto.")]),

        ...(c.notas ? [H("QUINTA — Otras condiciones"), P([R(c.notas)])] : []),

        P([R(`Firmado en señal de conformidad, a los ${hoy()}.`)], { spacing: { before: 360, after: 480 } }),

        new Paragraph({
          spacing: { before: 720 },
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } },
          children: [new TextRun({ text: "", size: 22 })],
        }),
        P([B(contratante)], { align: AlignmentType.LEFT }),
        P([R("LA PRODUCTORA")]),

        new Paragraph({
          spacing: { before: 480 },
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } },
          children: [new TextRun({ text: "", size: 22 })],
        }),
        P([B(persona.nombre || "")]),
        P([R(persona.ruc_dni ? `DNI/RUC N° ${persona.ruc_dni}` : "EL/LA COLABORADOR/A")]),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const safe = (persona.nombre || "colaborador").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="precontrato_${safe}.docx"`,
    },
  });
}
