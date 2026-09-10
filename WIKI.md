# 📖 Módulo /wiki — Wiki técnica de realización audiovisual

La wiki del equipo: técnicas, problemas de producción, casos de estudio y
fuentes, por área (Común, Documental, Videojuegos, …). Guarda conocimiento;
los demás módulos guardan la operación. Manual de uso de CrewHUB+: `/manual`.

## Puesta en marcha

1. **Base de datos**: en Supabase → SQL Editor, ejecuta `db/wiki.sql`
   (idempotente). Crea las tablas `wiki_*` con RLS y siembra las áreas y
   secciones de la guía (Anexos A, B y C).
2. **Dependencia nueva**: `npm install` (se agregó `mermaid`, para los
   diagramas; se carga solo en las páginas que los tienen).
3. Despliega. Rutas:
   - `/wiki` — inicio: buscador «¿Qué necesitas resolver?» y áreas.
   - `/wiki/[area]` — portada del área (`?s=8` una sección, `?etapa=Rodaje` filtro).
   - `/wiki/[area]/[slug]` — página.
   - `/wiki/nueva` y `/wiki/[area]/[slug]/editar` — cargar / editar.

## Cómo se carga una página

Los hilos del proyecto de Claude entregan cada página como **encabezado de
metadatos (3.1) + Markdown**. Se pega entero en `/wiki/nueva`; el módulo separa
el encabezado (Título, Área, Sección, Slug, Tipo, Etiquetas, Etapa, Nivel,
Estado, Última actualización, Preguntas) del contenido.

En el Markdown funcionan: `[[Título]]` y `[[Área/Título]]` (enlaces entre
páginas; si no existe, se ve «por crear»), `[n]` (salta a la fuente n del
apartado **Fuentes**), `(Pendiente de verificación)` (resalta la afirmación),
URL de YouTube sola en su línea (video incrustado), bloques ```` ```mermaid ````,
checklists `- [ ]`, tablas, imágenes `![alt](url "Autor / fuente")`.

Los apartados **Anotaciones personales** e **Historial de cambios** NO van en
el Markdown: los pinta el módulo desde sus tablas (si vienen, se ignoran).

## Datos

| Tabla | Qué guarda |
|---|---|
| `wiki_areas` | Áreas (id = slug), color claro/oscuro, ícono, estado (definida / propuesta / por-definir), orden |
| `wiki_secciones` | Secciones numeradas de cada área |
| `wiki_paginas` | Metadatos 3.1 + Markdown + `busqueda` (tsvector en español) |
| `wiki_historial` | `fecha — qué cambió — por qué — fuente nueva`, por página |
| `wiki_pagina_proyecto` | Relación página ↔ `proyectos.id` (uso, estado de aplicación, nota, fecha). **No** copia datos del proyecto |
| `wiki_anotaciones` | Anotaciones personales por página y autor |
| `wiki_enlaces` | Enlaces `[[...]]` salientes, para «Mencionada en» |

Sumar un área o una sección es insertar una fila; no hay que tocar código.
Íconos disponibles para `wiki_areas.icono`: ver `components/wiki/Iconos.tsx`.

Para mostrar «Conocimientos de la wiki» en la ficha de un proyecto, usar
`paginasDeProyecto(proyectoId)` de `lib/wiki/datos.ts` (pendiente de enganchar
en `/entidad/proyecto/[id]`).

## Código

- `app/wiki/*` — rutas y `acciones.ts` (escrituras) y `wiki.css` (prefijo `.wk`).
- `lib/wiki/` — `datos.ts` (lecturas), `markdown.tsx` (renderizador propio),
  `encabezado.ts` (parser del 3.1), `tipos.ts` (vocabularios), `util.ts`.
- `components/wiki/` — cascarón, buscador, barra lateral, índice, barra de
  verificación, checklist, Mermaid, formulario.
