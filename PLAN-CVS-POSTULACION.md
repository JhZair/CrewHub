# PLAN — CVs propios de cada postulación

**Estado:** diseño aprobado (opción A + ficha en el sistema), sin implementar.
**Decisiones:**
1. Los CVs presentados dejan de inferirse desde la persona; cada postulación
   tiene los suyos, en `postulacion_equipo`. Los CVs generales de la persona
   quedan como información de identidad.
2. **No hay nada que migrar**: los CVs existentes son generales de identidad o
   están desactualizados. El expediente histórico queda como está.
3. La **ficha de actualización se llena DENTRO del sistema** (formulario web
   por fila del equipo), nunca en Google Docs/Word: sus campos escriben a la
   base y algunos pueden generar casos de trabajo.
4. El **PDF final** de cada CV vive en **Drive** (doctrina de la casa); el
   sistema archiva la referencia (`cv_url`).

---

## 0. Auditoría del sistema (2026-07-29) — leer antes de ejecutar

Se revisó el snapshot completo: los ~90 `.sql` de `db/`, `lib/`, `actions.ts`
y la página de entidad. Conclusiones que condicionan la ejecución:

**0.1 — `schema.sql` está desactualizado, y `db/` está incompleto.**
La sospecha era correcta, por partida doble:

- `schema.sql` contradice al código: `monto_adjudicado`, `codigo_acta`,
  `fecha_firma_acta`, `fecha_limite_rendicion`, `fecha_prorroga` figuran en
  `convocatorias` (schema) pero el código las lee de `postulaciones`; los
  tipos de publicación comentados en schema (`postulacion|avance|aprobacion`)
  no coinciden con los reales de `lib/tipos.ts`.
- Hay columnas **usadas por el código sin DDL en ningún archivo de `db/`**
  (se agregaron directo en Supabase sin guardar el .sql): `personas.autoident,
  lengua_materna, otras_lenguas, discapacidad, nacionalidad`;
  `convocatorias.plantilla_formulario` (¡crítica: alimenta el Expediente!);
  `postulaciones.materiales, acta_url, matriz_jurado_url`.

→ **Bloqueante nº1: regenerar el baseline desde producción** antes de la
migración (pg_dump del esquema o query a `information_schema.columns`), y
guardarlo como `db/schema-actual.sql`. No planear contra `schema.sql`.

**0.2 — `postulacion_equipo` está intacta** (jamás alterada desde el schema
base): `id, postulacion_id, persona_id, cargo, remuneracion, precontrato_url`,
unique (postulacion, persona, cargo). Y de sus columnas, **`precontrato_url` Y
`remuneracion` están muertas** — cero referencias en todo el código. Los
precontratos vivos son 100% jsonb (`postulaciones.precontratos`, forma
`{persona_id, cargo, item_ids[], estado, firmado_en, forma_pago}` según
`lib/precontratos.ts` — ojo: el comentario SQL dice `item_id` singular y está
desactualizado). Al agregar `cv_url` conviene decidir qué hacer con las dos
columnas muertas (drop o comentario de legado).

**0.3 — Dónde vive hoy la lógica de CV** (para la implementación):
`enriquecer()` en `app/entidad/[tipo]/[id]/page.tsx` ~665–704 (matching por
prefijo + vigencia `DIAS_CV=365` de `lib/objetos.ts:45`, aplicado a
`equipoPost` **y `equipoProy`**); alertas en ~1670–1712; `guardarCv`/`borrarCv`
en `actions.ts` ~1559/~1913. La lista de tipos de objeto es CERRADA
(`lib/objetos.ts:23-40`, 12 tipos + `cv` aparte; `actions.ts` la valida
server-side).

**0.4 — Hallazgos que ajustan el diseño:**

1. **`equipoProy` no tiene fila de postulación** donde colgar un CV presentado.
   Correcto y deseado: a nivel de *proyecto* el chip sigue mostrando el CV
   general inferido (identidad); el CV propio existe solo a nivel de
   *postulación*. La inferencia por prefijo no se borra: se degrada a
   sugerencia (postulación) y a información (proyecto).
2. **El título `'General'` ya está ocupado** en los CVs de `objetos` (la
   migración de `persona_cv` insertó los legados con ese enfoque, y la
   unicidad es por (persona, título)). Cualquier regeneración de CV general
   debe actualizar, no insertar.
3. **`cargo` es texto libre sin catálogo** en las tres tablas de equipo, y el
   UPDATE de normalización (`db/roles-normalizar.sql`, PASO 2) está comentado
   — probablemente nunca corrió. El modelo nuevo reduce la dependencia del
   matching (la validación pasa a ser binaria), pero la *sugerencia* y la
   elección de ficha por rol sí lo usan. → **Bloqueante nº2 (suave): decidir
   si se corre el PASO 2** o se normaliza el cargo al crear la fila.
4. **`formacion`, `habilidad` y `perfil` no existen** como tipos de objeto
   (sí `premio`, `certificado`, `foto`). Agregarlos es tocar `lib/objetos.ts`
   (la columna SQL es text libre); decidir si `formacion` reemplaza o convive
   con `certificado`.
5. **Los casos de la ficha pueden reusar `expediente_casos` tal cual**: el
   caso «diseñar CV de X» pertenece a la postulación, así que la RPC
   `set_expediente_caso` (reserva anti-carrera) sirve sin cambios usando
   claves como `cv_<persona_id>`. Chequear caso VIVO con
   `.is("archivado_en",null).neq("estado","descartada")` — el estado
   `'archivada'` ya no existe.
6. La escritura de deltas de la ficha debe ser **por campo** (patrón
   `set_expediente_campo`, nacido justo porque reescribir el jsonb entero
   perdía ediciones concurrentes), y los datos censales de persona son
   **columnas**, no jsonb — el formulario tendrá dos rutas de escritura.
7. El auto-llenado del Expediente funciona por **contrato de claves** contra
   `convocatorias.plantilla_formulario` (page.tsx ~706–718): la ficha debe
   integrarse a ese contrato, no inventar otro canal.
8. Bug menor preexistente: la alerta de CV usa
   `["personal","colaborador","colaborador eventual"]` hardcodeado
   (page.tsx ~1673) mientras `lib/personas.ts` define `TIPOS_EQUIPO` sin el
   tercero — unificar de paso.

## 1. Diagnóstico (verificado en el código)

Hoy el CV presentado **no existe como dato**: se deduce en el momento.

- Los CVs viven colgados de la persona en `objetos` (`tipo='cv'`,
  `titulo`=enfoque, únicos por persona+enfoque — herencia de `persona_cv`,
  ver `db/repositorio.sql`).
- La ficha de postulación arma el chip de cada miembro cruzando cargo contra
  enfoque **por raíz** («Productor/a» cubre «Productor/a Ejecutivo/a») y
  calcula vigencia por días desde `actualizado` con `DIAS_CV`
  (`app/entidad/[tipo]/[id]/page.tsx`, ~líneas 670–705).
- La ficha de persona alerta «cargos vigentes sin CV» con la misma regla de
  raíz + año de la convocatoria (~líneas 1666–1700).

Los problemas de ese modelo son los que motivaron el cambio:

1. **El expediente no es dueño de sus documentos.** Lo que se presentó a un
   concurso debería quedar archivado con la postulación, como el precontrato o
   el presupuesto postulado. Hoy, si el CV general se actualiza o se borra, el
   expediente histórico «cambia» retroactivamente.
2. **La inferencia rol+vigencia es una aproximación.** Un CV general de
   Productor/a no es el CV enfocado que DAFO espera para *esta* postulación;
   la vigencia por días es un proxy de algo que en realidad es binario: ¿se
   preparó el CV para esta carpeta, o no?
3. **La regla de raíz tiene casos grises** en ambas direcciones y ya necesitó
   parches (el comentario en el código lo documenta).

## 2. La doctrina, matizada

El comentario del schema dice: *«personas REFERENCIADAS, nunca copiadas — el
DNI y la hoja de vida viven en la persona, no en la postulación»*. La matización
que introduce este cambio:

> **La hoja de vida general es identidad de la persona** (su repositorio, sus
> enfoques, su trayectoria). **El CV presentado es expediente de la
> postulación**: nace para un concurso, con un rol, y se archiva con él —
> exactamente como el precontrato.

La persona sigue referenciada, nunca copiada. Lo que se adjunta a la
postulación es un **documento** (referencia a Drive, doctrina de la casa), no
los datos de la persona.

## 3. Modelo de datos propuesto

Grano: `postulacion_equipo` ya es postulación × persona × cargo — el lugar
exacto. Espejo del patrón `precontrato_url`.

```sql
-- ============================================================
-- CV PRESENTADO — el CV es del expediente, no de la persona.
-- La hoja de vida general sigue en `objetos` (identidad); aquí
-- vive el CV que se preparó PARA esta postulación y este cargo.
-- ⚠ SIN transacción (lección pgBouncer). Idempotente.
-- ============================================================
alter table postulacion_equipo add column if not exists cv_url text;
alter table postulacion_equipo add column if not exists cv_actualizado date;

comment on column postulacion_equipo.cv_url is
  'CV presentado en ESTA postulación para ESTE cargo (referencia a Drive). '
  'No confundir con los CVs generales de la persona (objetos tipo=cv): '
  'esos son identidad; este es expediente.';
```

Notas:

- **Sin vigencia.** Un CV hecho para esta postulación no caduca: la columna
  `cv_actualizado` es informativa (cuándo se subió/rehízo), no un criterio de
  validez. `DIAS_CV` deja de aplicar en contexto de postulación.
- **Sin unicidad nueva.** La fila ya es única por (postulación, persona,
  cargo); el CV es un atributo de esa fila.
- **Nada se borra.** Los CVs generales quedan intactos; ninguna migración de
  datos es necesaria (ver §6).

## 4. Reglas después del cambio

| Pregunta | Antes | Después |
|---|---|---|
| ¿Este miembro tiene CV para la postulación? | inferir: enfoque raíz del cargo + vigencia | `fila.cv_url` existe |
| ¿Qué CV se presentó en 2025? | irrecuperable (el general pudo cambiar) | el de la fila de esa postulación |
| Alerta en ficha de persona | «cargos vigentes sin CV general que los cubra» | «filas de postulacion_equipo del año vigente sin `cv_url`» |
| CV general de la persona | requisito implícito | **materia prima**: la UI lo sugiere como base para preparar el CV de la postulación |

## 5. Cambios de código (cuando se implemente)

**`app/entidad/[tipo]/[id]/page.tsx`**

- ~660–705 (`enriquecer`): el query de equipo agrega `cv_url, cv_actualizado`;
  `_cv` pasa a leerse de la fila. El matching por raíz y el cálculo de
  `vigente` se retiran de este contexto. El chip queda en tres estados:
  `📄 CV` (fila con cv_url) / `📄 usar general como base` (sin cv_url pero la
  persona tiene un CV general cuyo enfoque cubre el cargo — se conserva la
  regla de raíz SOLO como sugerencia) / `⚠ sin CV` (ninguno).
- ~1666–1720 (alerta en ficha de persona): «cargos vigentes sin CV» pasa a
  consultar `postulacion_equipo` del año vigente sin `cv_url`. La alerta de
  «CV general lleva más de un año» (DIAS_CV) puede quedarse, pero como aviso
  de identidad, no de postulación.

**`app/actions.ts`**

- Nueva action `guardarCvEquipo(filaId, url)` — validación de URL idéntica a
  `guardarCv` (~1560), acotada a la fila, con hito en `actividad` de la
  postulación (patrón de `fijarPresupuestoPostulado`).
- `guardarCv` (CVs generales) no cambia.

**Observación (confirmada por la auditoría §0.2):** los precontratos hoy se
guardan como jsonb en `postulaciones.precontratos`; las columnas
`postulacion_equipo.precontrato_url` y `remuneracion` están muertas (cero
referencias en el código). El CV podría seguir cualquiera de los dos caminos;
se eligió columnas en `postulacion_equipo` porque el CV es estrictamente
por-fila y no necesita la forma de tabla repetible (los precontratos la
necesitan por su vínculo `item_ids` con el presupuesto).

## 6. Migración y compatibilidad

- **No hay backfill.** Un CV general no ES un CV presentado; poblar `cv_url`
  desde los generales falsearía el expediente. Las postulaciones históricas
  quedan sin CV de fila — es la verdad: no se archivó cuál se presentó.
- Para no llenar de alertas las postulaciones cerradas, la alerta «sin CV»
  aplica solo a estados activos (`en_preparacion`, `subsanacion`).
- Los CVs generales y su sección en la ficha de persona no se tocan.

## 7. La ficha como formulario del sistema

**Principio: la ficha no es un documento, es una vista editable de la base.**
No existe como archivo que se envía y se archiva; existe como pantalla. Lo que
la base ya sabe aparece pre-llenado; lo que falta se captura ahí mismo y
escribe directo a su lugar de origen. La ficha «llena» no se guarda en
ninguna parte: al terminar, su contenido ES la base actualizada.

### 7.1 Mapa de campos → dónde viven

| Sección de la ficha | Se pre-llena de | El delta escribe a |
|---|---|---|
| Identidad y contacto | `personas` (nombre, dni, región, foto_url…) | `personas` |
| Rol en esta postulación | `postulacion_equipo.cargo` | — (ya es dato de la fila) |
| Perfil profesional (resumen) | `objetos` tipo `perfil` (o campo de persona) | ídem |
| Filmografía / ludografía / proyectos gestionados | `objetos` tipo `obra` (datos jsonb: rol, año, formato/motor, estado) | `objetos` |
| Pertenencia comunitaria (solo Cine Indígena) | `personas` / `objetos` tipo `pertenencia` | ídem |
| Premios y fondos | `objetos` tipo `premio` | `objetos` |
| Formación | `objetos` tipo `formacion` (tipo nuevo: no requiere schema, `tipo` es text) | `objetos` |
| Habilidades e idiomas | `objetos` tipo `habilidad` / datos de persona | ídem |
| Foto | `personas.foto_url` (+ fotos alternativas como `objetos` tipo `foto`) | ídem |

La **categoría de la convocatoria** decide qué secciones muestra el formulario
(videojuego sin filmografía → ludografía; cine indígena suma pertenencia…),
igual que las 4 fichas Word lo hacían en papel. Las fichas .docx quedan como
**respaldo offline** para personas externas sin acceso al sistema; lo que
traigan se registra a mano en la misma pantalla.

### 7.2 Campos que generan trabajo

Ciertos estados del formulario no son solo datos: son pendientes. El patrón ya
existe en la casa (cronograma generador → casos just-in-time):

- Sin foto utilizable (o de baja calidad) → caso «📷 Conseguir foto de X».
- Ficha completa pero sin CV → caso «🎨 Diseñar CV de X para [postulación]».
- CV diseñado pero sin registrar → alerta en la ficha de postulación (no caso).
- Campo de identidad corregido que afecta a otras postulaciones activas → solo
  se refleja (es la misma persona), no genera caso.

### 7.3 Estado del CV por fila

El ciclo por fila del equipo se puede leer sin columna nueva de estado —se
deriva—, lo que evita otro campo que mantener:

| Estado | Se deriva de |
|---|---|
| 📝 Ficha pendiente | faltan datos mínimos (foto, trayectoria vacía para el cargo) |
| ✅ Ficha completa | datos mínimos presentes, `cv_url` null |
| 🎨 CV en diseño | existe caso de diseño abierto |
| 📄 CV presentado | `cv_url` presente |

## 8. El flujo completo

1. Se arma el equipo de la postulación (`postulacion_equipo`).
2. Por cada fila, la **ficha del sistema** se abre pre-llenada desde la base;
   la persona (o quien la entrevista) completa **solo el delta**, que escribe
   directo a `personas`/`objetos`. Los faltantes críticos generan casos.
3. Con la base al día se **diseña el CV** enfocado al rol y la categoría
   (paleta desde la foto, diseño original por persona — fuera del sistema por
   ahora; como skill `cv-dafo` más adelante).
4. El **PDF** se sube al Drive de la carpeta de la postulación y su URL se
   registra en `cv_url` de la fila → chip verde, expediente completo y
   archivado para siempre.
5. La siguiente postulación hereda todo: la ficha sale casi llena y el delta
   se encoge en cada ciclo. El CV general de identidad puede regenerarse
   gratis cuando se quiera, porque es otra vista de la misma base.

## 9. Extensiones futuras (no bloquean)

- `cv_fuente_id uuid references objetos(id)`: trazabilidad de qué CV general
  sirvió de base al presentado.
- `link_verificaciones` para el campo `cv_url` de `postulacion_equipo`
  (miniatura + veredicto del link, como los demás documentos).
- Skill `cv-dafo`: recibe el JSON de persona + trayectoria (export desde la
  ficha del sistema) y produce el PDF diseñado; a la vuelta, el registro de
  `cv_url` cierra el ciclo. El diseño de CVs deja de depender de esta
  conversación.
- Generación del CV dentro del sistema (HTML → PDF server-side) si algún día
  conviene eliminar el paso externo por completo.
