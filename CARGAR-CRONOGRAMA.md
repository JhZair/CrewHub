# 📅 Cargar un cronograma de postulación a CrewHub+

Instrucciones para pegar al inicio de un hilo nuevo, junto con la captura o el
documento del cronograma. El hilo devuelve SQL listo para el editor de Supabase.

---

## Lo que tienes que saber antes de escribir una sola línea de SQL

Las actividades viven en `cronograma_actividades`. Esa tabla tiene **tres dueños
posibles y solo uno se llena por fila**:

| Columna | Cuándo se usa |
|---|---|
| `proyecto_id` | el plan general de un proyecto |
| `convocatoria_id` | el cronograma de las bases del concurso |
| `postulacion_id` | **el cronograma que la postulación presenta a DAFO** ← este |

**Para un cronograma de postulación: `postulacion_id` lleno, los otros dos NULL.**
Sin excepciones.

### Por qué importa tanto

Un cronograma de postulación es una **propuesta**: lo que le prometes a DAFO que
harás si ganas. No abre casos, no vigila plazos y no notifica a nadie. El robot
matutino (`qhaway_matutino()`) lo excluye a propósito. Cuando el fondo se gana
empieza otro ciclo, y eso se decide aparte.

Llenar `proyecto_id` o `convocatoria_id` "por si acaso" haría que el sistema
empiece a crear tareas de trabajo por algo que todavía no existe.

> Contexto real: del 23 al 30 de julio de 2026 el robot estuvo ocho días mudo
> —sin avisos y sin mensaje al chat del equipo— porque unas filas de cronograma
> quedaron sin ningún dueño válido. Una fila mal puesta rompe la ronda de todo
> el equipo, y no avisa.

---

## El procedimiento

### 1 · Encontrar la postulación

Nunca pegues un UUID a mano. Se busca por código:

```sql
select id, codigo, titulo, anio from postulaciones where codigo = 'PO-040';
```

Si no aparece, **para y pregunta**. No inventes el destino.

### 2 · ¿Ya tiene cronograma cargado?

```sql
select count(*) as ya_hay
from cronograma_actividades ca
join postulaciones p on p.id = ca.postulacion_id
where p.codigo = 'PO-040';
```

Si devuelve algo distinto de 0, **para y pregunta** si se reemplaza o se suma.
Cargar dos veces duplica el cronograma en silencio.

### 3 · Leer el cronograma y MOSTRAR LA LECTURA ANTES DE GENERAR SQL

Este es el paso donde se cuelan los errores, porque una captura de un Gantt se
lee mal con facilidad y nadie revisa un `insert` de treinta filas.

**Obligatorio: presenta primero una tabla con tu interpretación y espera
confirmación.** Una fila por actividad, con las columnas:

`nombre · fase/etapa · mes(es) que ocupa · fecha_inicio · fecha_fin · clase`

Marca con ⚠ cualquier celda que no se lea con seguridad —barras que empiezan a
media casilla, colores ambiguos, filas sin marca— en vez de elegir la opción más
probable. Una fecha inventada no da error: solo queda mal para siempre.

**Convención de fechas.** Si el Gantt solo da meses, la actividad ocupa el mes
completo: `fecha_inicio` = día 1 del primer mes marcado, `fecha_fin` = último día
del último mes marcado. Si el documento trae fechas exactas, se usan tal cual.

### 4 · Los valores válidos (no inventar otros)

**`estado`** → siempre `'planificada'`.

**`fuente`** → `'interno'` (el cronograma lo armaron ustedes).
Otros valores existentes: `bases_concurso`, `seatable`.

**`clase`** → distingue dos cosas que el Gantt suele pintar de colores distintos:
- `'trabajo'` — actividades de desarrollo. Las que el equipo ejecuta.
- `'hito_externo'` — obligaciones impuestas por el estímulo o fechas fijadas por
  el Ministerio: informes semestrales, acción de devolución a la ciudadanía,
  entrega de material final, charlas obligatorias. Si el fondo se gana, estas
  generan avisos con cuenta regresiva en lugar de tareas.

Si el cronograma tiene una leyenda con dos categorías, casi siempre es esta
distinción. **Confírmala antes de aplicarla.**

**`etapa`** → una clave del preset de la categoría del concurso (`lib/etapas.ts`):

| Categoría | Claves |
|---|---|
| Videojuego | `desarrollo_conceptual` · `diseno` · `programacion` · `pruebas` · `entrega` |
| Producción audiovisual / Documental | `preproduccion` · `produccion` · `postproduccion` · `entrega` · `administracion` |

Si la categoría no está en esa lista, **pregunta** en vez de inventar una clave:
una etapa desconocida se pinta gris y desordena el Gantt de la aplicación.

Las FASES del documento (FASE 1 · ARRANQUE, FASE 2 · MECÁNICA CENTRAL…) no son
etapas: son agrupaciones del formulario. Se mapean a la etapa que les corresponde
y, si aporta, el nombre de la fase se conserva dentro de `nombre`.

**No llenar:** `responsable`, `publicacion_id`, `plantilla_act`,
`ancla_evento`, `offset_dias_habiles`. `dias_anticipacion` se deja en su valor por
defecto: no aplica, porque esto no materializa.

### 5 · El SQL

Una sola sentencia, con el id resuelto por código. Así no hay UUID pegado a mano
y si el código no existe no inserta nada en vez de insertar mal.

```sql
with po as (
  select id from postulaciones where codigo = 'PO-040'
)
insert into cronograma_actividades
  (postulacion_id, nombre, etapa, fecha_inicio, fecha_fin, estado, clase, fuente)
select po.id, v.nombre, v.etapa, v.ini, v.fin, 'planificada', v.clase, 'interno'
from po, (values
  ('Charla en materia de acoso y hostigamiento', 'entrega',
   '2026-12-01'::date, '2026-12-31'::date, 'hito_externo'),
  ('Contratación y conformación del equipo', 'desarrollo_conceptual',
   '2026-11-01'::date, '2026-11-30'::date, 'trabajo')
  -- … una línea por actividad, en el orden del documento
) as v(nombre, etapa, ini, fin, clase);
```

### 6 · Verificar después de correrlo

```sql
select ca.fecha_inicio, ca.fecha_fin, ca.etapa, ca.clase, ca.nombre
from cronograma_actividades ca
join postulaciones p on p.id = ca.postulacion_id
where p.codigo = 'PO-040'
order by ca.fecha_inicio, ca.nombre;
```

Y la comprobación que de verdad importa — **tiene que devolver 0**:

```sql
select count(*) as mal_puestas
from cronograma_actividades ca
join postulaciones p on p.id = ca.postulacion_id
where p.codigo = 'PO-040'
  and (ca.proyecto_id is not null or ca.convocatoria_id is not null);
```

Si devuelve algo distinto de 0, esas filas van a empezar a generar tareas.
Corregirlas antes de las 7:30 del día siguiente, que es cuando corre el robot.

---

## Reglas para el hilo

1. **Mostrar la lectura del cronograma y esperar el visto bueno antes de emitir
   SQL.** Siempre. Aunque el documento se vea nítido.
2. **Marcar lo dudoso, no resolverlo por cuenta propia.** Preguntar cuesta un
   mensaje; una fecha inventada dura años.
3. **Un solo dueño por fila: `postulacion_id`.**
4. **No inventar claves de `etapa`, `clase`, `estado` ni `fuente`.**
5. **Nada de `delete` ni `update` sin pedirlo explícitamente.** Si ya hay
   cronograma cargado, se avisa y se espera instrucciones.
6. El SQL se entrega en un solo bloque, listo para pegar en Supabase → SQL
   Editor, sin `begin`/`commit` (el editor ya envuelve cada corrida).
