# Revisión escéptica de velocidad — CrewHub+ (24 ago 2026)

Tres auditorías independientes sobre el repo entero: cascadas de espera, bytes
que viajan de más, y lado cliente. Lo que sigue está **ordenado por impacto
real**, no por lo llamativo que suene, y separa lo que está **comprobado en el
código** de lo que **hay que medir antes de tocar**.

Regla que ya nos funcionó una vez y se mantiene: **medir antes de arreglar.**
En la ronda de `/buscar` la medición cambió la decisión — se descartó filtrar en
Postgres porque los números decían que el problema era otro.

---

## PASO 0 — Treinta segundos que deciden todo lo demás

Antes de tocar una línea, abre la pestaña **Red** del navegador en `/` y apunta
tres números:

1. **TTFB del documento** («Waiting for server response»). Es el tiempo que el
   servidor tarda en empezar a contestar.
2. **Tamaño transferido** total de la carga.
3. Navega de `/tablero` a `/personas` con el filtro en **POST**: cuenta cuántos
   POST con cabecera `Next-Action` salen.

Según cuál sea el número gordo, el orden de ataque cambia:

| Si el número gordo es… | El problema es… | Ataca |
|---|---|---|
| TTFB alto (>1,5 s) | la cascada de esperas en el servidor | §1 y §4 |
| Transferido alto (>1,5 MB) | los bytes | §3 |
| 4 POST por navegación | el layout | §1 |
| Todo mediano pero «se siente lento» | no hay nada que mirar mientras carga | §7 |

Lo más probable, por lo que se ve en el código, es que sean **§1 y §3 a la vez**.

---

## 1. Cada navegación dispara cuatro acciones de servidor extra — GRAVE

**Comprobado.** Tres componentes del layout llevan `pathname` en las
dependencias de su efecto:

| Archivo:línea | Acción | Consultas |
|---|---|---|
| `components/NavIconos.tsx:94` | `estadoNav()` | 3 |
| `components/BancoTrabajo.tsx:93` | `misEnProgreso()` | 10 |
| `components/BancoTrabajo.tsx:93` | `muroMensajes()` | 7 |
| `components/CampanitaGlobal.tsx:58` | `misNotificaciones()` | 4 |

`NavIconos` va dentro de `Volver`, y `Volver` se usa en **34 pantallas**.

Lo que duele no es el número de consultas: es que **Next encola las acciones de
servidor de un mismo cliente y las manda de una en una**. Eso ya está escrito en
este repo (`app/nav-acciones.ts:14-20`) y fue la razón de fusionar tres
consultas dentro de `estadoNav`. Se arregló **dentro** de una acción y quedó sin
arreglar **entre** componentes: siguen siendo cuatro viajes en fila.

Encima, cada acción abre su propio cliente y llama a `auth.getUser()`, que es una
llamada de red al servidor de Auth de Supabase **antes** de tocar un solo dato.
Sumando el `middleware.ts:26`, el de la página y el de `QuienEstaGlobal`, son
**siete validaciones de sesión por navegación**.

**Qué hacer:** una sola acción `estadoGlobal()` que devuelva
`{nav, notificaciones, banco, muro}` con **un** `getUser()` y un `Promise.all`
de las consultas. Cuatro viajes encolados → uno.

**Por qué va primera:** es el único hallazgo que afecta a las 34 pantallas y a
cada navegación. Todo lo demás mejora una pantalla.

---

## 2. El banco de trabajo escucha dos tablas enteras, desde el layout — GRAVE

**Comprobado.** `components/BancoTrabajo.tsx:100-106`:

```js
["publicaciones", "comentarios"].forEach(t =>
  canal.on("postgres_changes", { event: "*", schema: "public", table: t },
           () => { if (vivo) cargar(); }));
```

Sin filtro, sin comprobar autoría, sin retardo, y montado desde
`app/layout.tsx:44` — o sea, **en toda pantalla de toda pestaña abierta**.
`cargar()` es `misEnProgreso()`: diez consultas.

Un comentario cualquiera, de cualquier persona, en cualquier caso, hace que
**todas las pestañas abiertas del equipo** llamen a `misEnProgreso()`. Con siete
personas y dos pestañas cada una son **140 consultas por comentario**, y ninguna
tiene que ver con quien comentó.

Esto no lo nota quien navega: lo nota **la base**, y se le devuelve a todos como
lentitud de fondo. Es el multiplicador del sistema.

`Realtime.tsx:45-51` ya sabe hacer esto bien —conoce la columna de autor de cinco
tablas y descarta lo que hiciste tú—, pero el banco no pasa por ahí.

**Qué hacer:** filtrar por lo que de verdad afecta al banco (`responsable` =
yo, o el caso está en mi banco) y meter el mismo retardo de 600 ms que ya usa
`Realtime.tsx:94`.

---

## 3. El catálogo entero viaja al navegador, dos veces, en cada carga — GRAVE

**Comprobado.** `app/page.tsx:105` y `:112` → `<Composer catalogos={catalogos}>`
en `:437`. Lo mismo en `app/caso/[id]/page.tsx:121` → `<VinculosEditor>` en
`:501`, y en `app/objeto/[id]/page.tsx:159`.

`catalogosEntidades()` (`lib/catalogos.ts:70`) son **ocho tablas sin filtro ni
límite**: proyectos, empresas, personas, convocatorias, postulaciones,
equipamiento, lugares, compras. Más `catalogoObjetos()` (300).

Todo eso entra en las props de un componente `"use client"`, así que viaja
**dos veces**: en el HTML del render y otra vez en el payload RSC. Estimado:
~1500 ítems × ~90 B ≈ 130 KB, duplicado ≈ **250 KB por carga de portada y de
cada caso** — para un desplegable que la mayoría de las visitas no abre.

**Qué hacer:** el mecanismo ya existe y funciona.
`components/BotonNuevoCaso.tsx:26` carga sus catálogos **bajo demanda** con
`datosNuevoCaso()` al abrir el «+». Aplicar lo mismo al Composer y al
VinculosEditor.

---

## 4. La portada espera quince veces en fila — GRAVE

**Comprobado.** `app/page.tsx`, cadena real: `:64` → `:66` → `:68` → `:76` →
`:80` → `:89` → `:96` → `:101` → `:173` → `:181` → `:187` → `:215` → `:258` →
`:360` → `:367`.

**De esas quince, solo cuatro dependen de verdad de la anterior.** El resto es
serial falso:

- `:68`, `:76`, `:89`, `:96` solo necesitan `user.id` → una sola tanda.
- `:215` (cinco consultas de notificaciones) idem → a esa misma tanda.
- `:258` (seis consultas de Qhaway: vencidos, sin responsable, SUNAT, DNI,
  cumpleaños, postulaciones) **no depende de nada**, solo de fechas → a la
  primera tanda.
- `:173`, `:181`, `:187`, `:360` dependen todas del mismo `postsQ` → una tanda
  de cuatro.

**15 → 5 viajes.** Y de paso: `personas` se pide **cinco veces** en el mismo
render y `publicaciones` **siete**. `page.tsx:107` es un subconjunto exacto de lo
que `lib/catalogos.ts:74` ya trajo: la misma tabla, dos veces.

El mismo patrón, más leve, en `/tablero` (13 → 5; hay un `for` con `await`
dentro en `:160-168` que no necesita ser serial) y en las ramas
`equipamiento` y `postulacion` de `/entidad/[tipo]/[id]` (~20 viajes, siete
bloques independientes esperándose unos a otros).

---

## 5. El tope de 1000 filas — URGENTE, y no por velocidad

**Hay que comprobarlo en Supabase antes de creerlo.**

PostgREST corta en **1000 filas por defecto** y no avisa. Seis sitios de este
repo ya lo dan por sabido. Si el ajuste **Settings → API → Max rows** está en
1000, entonces:

- `app/buscar/page.tsx:290` fija `TOPE_TEXTO_COM = 4000` y pide `.limit(4001)`.
  **Ese techo no existe**: volverían 1000. El comentario de esa misma línea dice
  «986 hoy, ~450 al mes» — escrito hace tres días. **La tabla está cruzando 1000
  esta semana.**
- Y el aviso de «no se buscó en todo» compara `filas.length > 4000`, así que
  **nunca se encendería**. El buscador dejaría de ver los comentarios viejos en
  silencio, por el mismo mecanismo que ese commit quiso vigilar.

Además, seis listados piden la tabla `comentarios` entera **sin `.limit()` y sin
`.order()`** solo para contar 💬 — `personas:61`, `empresas:83`,
`equipamiento:112`, `proyectos:42`, `postulaciones:81`, `convocatorias:47`. Al
cruzar 1000, seis contadores se quedan cortos a la vez y ninguno da error.

**Qué comprobar, hoy:** Supabase → Settings → API → **Max rows**. Ese número
decide si esto es una bomba con la mecha encendida o una nota al pie.

**Qué hacer si es 1000:** los seis contadores salen gratis con
`comentarios(count)` embebido en la consulta de `publicaciones` que esas mismas
páginas ya hacen — es lo que `/tablero:171` ya hace bien.

---

## 6. `/fondo/[id]`: nueve tablas escuchadas sin filtro → doble render — MEDIO

`app/fondo/[id]/page.tsx:484` escucha nueve tablas. `Realtime.tsx:45-51` solo
conoce la columna de autor de cinco tablas, y **ninguna de esas nueve está en la
lista**, así que `esMio()` devuelve `false` siempre: cualquier cambio **tuyo**
dispara un `router.refresh()` 600 ms después, encima del `revalidatePath` que la
acción ya hizo. La página tiene 22 consultas → registrar un RHE cuesta 44.

Y ninguna lleva `filtro`, así que un comprobante cargado en **otro** fondo
también te refresca la pantalla.

---

## 7. No hay ni un `loading.tsx` en toda la aplicación — MEDIO (y honesto)

Cero `loading.tsx`, cero `<Suspense>`. Sin frontera de streaming, el navegador
se queda con la pantalla anterior **congelada** hasta que termina el último
`await` del servidor.

**Esto no hace nada más rápido.** Cambia lo que la persona ve mientras espera, y
por eso está aquí abajo y no arriba: si se ataca §1 y §4 primero, puede que ni
haga falta. Pero es barato y es literalmente el «va lento» que se percibe.

---

## Lo que NO voy a tocar, y por qué

- **Índices.** Falta alguno (`actividad(actor_id, creado_en)`,
  `comentarios(autor_id, creado_en)`, `notificaciones(usuario_id, creado_en)`),
  pero con tablas de cientos a pocos miles de filas ahorran **microsegundos**.
  No son la causa. Se ponen cuando se toque cada consulta, no en una ronda
  aparte.
- **Componentes cliente de 800 líneas.** `CronogramaProyecto`, `Obligaciones`,
  `CasillaDafo`, `CajaPanel`: todos viven en **una sola ruta**, ninguno está en
  el layout. No se descargan si no vas ahí.
- **Dependencias pesadas.** No hay. Siete dependencias en total; `docx` solo se
  importa en una ruta de servidor. Ni pdf, ni xlsx, ni charting.
- **Fugas de canales realtime.** No las hay: los seis sitios con `.channel(`
  usan nombre único y llaman `removeChannel` al desmontar. El problema es
  **cuántos** se abren y **qué** escuchan.
- **`comentar()` recalculando la portada.** No lo hace: revalida solo
  `/caso/${id}`. El que sí revalida `/` es `toggleReaccion` (`actions.ts:8085`).
- **`generateMetadata` duplicando la consulta.** Next 14 la corre en paralelo
  con el render: no añade espera.
- **Avatares.** Ya se recortan a 512×512 WebP antes de subir
  (`lib/prepararImagen.ts:19`). El peso de imágenes está en los **adjuntos** del
  feed (1920 px, sin `lazy`, hasta cuatro por tarjeta × 50 tarjetas), no en las
  caras.

---

## Orden de ataque propuesto

1. **Comprobar Max rows** en Supabase (§5). Dos minutos, y puede cambiar la
   urgencia de todo.
2. **Los tres números del Paso 0.** Treinta segundos, y dicen si el enemigo es
   el tiempo o los bytes.
3. **§1 — una sola acción global.** El de mayor retorno: 34 pantallas.
4. **§2 — el realtime del banco.** El multiplicador.
5. **§3 — catálogos bajo demanda.** ~250 KB por carga.
6. **§4 — la cascada de la portada.** 15 → 5.

Los §6 y §7 después, si siguen doliendo.

---

## Para medir el peso real en la base

Una sola sentencia (el SQL Editor de Supabase solo enseña el resultado de la
última). Saca los nombres del catálogo, así que no falla por una migración sin
correr y cubre también lo que la auditoría no miró. Solo lee.

```sql
with tab as (
  select c.oid, n.nspname::text as esq, c.relname::text as tabla,
         pg_total_relation_size(c.oid) as disco
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
fil as (
  select tab.*,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from %I.%I', esq, tabla),
                             false, true, '')))[1]::text::bigint as filas
    from tab
),
col as (
  select fil.tabla, fil.filas, a.attname::text as columna,
         (xpath('/row/c/text()',
                query_to_xml(format('select coalesce(sum(pg_column_size(%I)),0)::bigint as c from %I.%I',
                                    a.attname, fil.esq, fil.tabla),
                             false, true, '')))[1]::text::bigint as bytes
    from fil
    join pg_attribute a on a.attrelid = fil.oid and a.attnum > 0 and not a.attisdropped
    join pg_type y on y.oid = a.atttypid
   where fil.filas > 0
     and y.typname in ('text','varchar','bpchar','json','jsonb','_text')
),
uni as (
  select 0 as nivel, tabla, tabla as etiqueta, filas, disco as bytes, disco as ord from fil
  union all
  select 1, col.tabla, col.columna, col.filas, col.bytes, fil.disco
    from col join fil on fil.tabla = col.tabla
)
select case when nivel = 0 then '■ ' || etiqueta else '      └ ' || etiqueta end as que,
       filas,
       case when filas > 1000 then '⚠ pasa de 1000' else '' end as techo_postgrest,
       pg_size_pretty(bytes) as peso,
       case when filas > 0 then pg_size_pretty(bytes / filas) else '' end as por_fila
  from uni
 where bytes > 0
 order by ord desc, tabla, nivel, bytes desc;
```

Dos avisos para leer el resultado:

- La columna **`techo_postgrest`** es la que decide qué arreglar primero: toda
  tabla marcada ⚠ está siendo recortada en silencio por cualquier consulta que
  la pida sin `.limit()` explícito.
- **`pg_column_size` mide el disco, no el cable.** Sobre JSON, un `uuid` pasa de
  16 B a ~38 B con comillas, y la *clave* se repite en cada fila
  (`"movimiento_caja_id":null` son 26 B aunque el valor sea nulo). Para texto el
  número es fiel; para uuid y numéricos, multiplica por 2-3.
