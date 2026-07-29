# 📬 Casilla DAFO — que el correo llegue solo

**El problema.** Cada postulación registra un correo distinto. DAFO comunica por
la casilla de su plataforma, pero también manda correo — y no se sabe qué día.
Con diez cuentas, la única forma de no perderse una notificación era abrir diez
bandejas a diario. Eso no es un problema de correo: es información dispersa sin
sitio donde aterrizar.

**La solución, en una línea.** Las diez cuentas reenvían a un buzón maestro; un
script en ese buzón empuja cada correo nuevo a CrewHub+, que lo vincula a su
postulación, lo guarda y avisa al celular con el push que ya existe. El ritual
diario se cambia por: **si no vibró, no hay nada.**

```
10 Gmail ──reenvío──► buzón maestro ──Apps Script (cada 10 min)──►
   /api/ingesta/dafo ──► tabla dafo_comunicaciones + notificaciones ──►
   /api/push/despachar ──► celular          y el panel en /casilla
```

Funciona con la computadora apagada y no gasta créditos de nada: el script corre
en los servidores de Google y el resto en Vercel.

---

## Puesta en marcha

### 1. Base de datos (una vez)

Supabase → SQL Editor → pegar y correr **`db/casilla-dafo.sql`**.
Crea la tabla `dafo_comunicaciones`, sus políticas, el realtime y la columna
`notificaciones.dafo_id` (sin ella el aviso llega pero no lleva a ninguna parte).

### 2. Variable de entorno (una vez)

Vercel → Project → Settings → Environment Variables:

| Variable | Para qué | De dónde sale |
|---|---|---|
| `INGESTA_DAFO_LLAVE` | Que solo el Apps Script pueda escribir en la casilla | Inventa una cadena larga aleatoria |

`SUPABASE_SERVICE_ROLE_KEY` ya está puesta (la usa el cron de SUNAT).

> Sin `INGESTA_DAFO_LLAVE` el endpoint responde 401 a todo. Es a propósito:
> aquí se **escribe** en la base, así que un endpoint abierto «mientras
> configuro» sería una puerta para meter correos falsos.

Después: **Redeploy** (las variables entran al desplegar).

### 3. Reenvío de las diez cuentas (una vez, ~3 min cada una)

En **cada** cuenta de postulación:

1. Gmail → ⚙ Configuración → **Reenvío y correo POP/IMAP**
2. *Añadir una dirección de reenvío* → el correo del **buzón maestro**
3. Confirmar el código que llega al maestro
4. Marcar *Reenviar una copia del correo entrante a…* → **conservar la copia**

> Conservar la copia importa: el original sigue en la cuenta de la postulación,
> que es donde tiene que estar si algún día hay que probar qué llegó y a dónde.

### 4. Filtro y etiqueta en el buzón maestro (una vez)

Gmail del maestro → ⚙ → **Filtros y direcciones bloqueadas** → *Crear un filtro*:

- **De:** `cultura.gob.pe OR dafo OR mincul OR plataformamincu.cultura.gob.pe`
- Acción: **Aplicar la etiqueta** `DAFO`

Ese filtro es el que decide qué entra al sistema. Si un día DAFO escribe desde
otro dominio, se agrega aquí — sin tocar código, sin desplegar.

### 5. El Apps Script (una vez)

1. [script.google.com](https://script.google.com) → **Nuevo proyecto**, entrando
   con la cuenta del **buzón maestro**
2. Pegar el contenido de **`scripts/casilla-dafo.gs`**
3. Cambiar `CH_LLAVE` por la misma cadena de `INGESTA_DAFO_LLAVE`
4. Ejecutar la función **`probar`** una vez → Google pedirá permiso de Gmail
5. Ejecutar la función **`instalarDisparador`** una vez → queda corriendo cada
   10 minutos

Para ver si trabaja: en Apps Script → *Ejecuciones*. Cada corrida imprime
cuántos mensajes mandó y qué respondió CrewHub+.

### 6. El celular

Si ya activaste el push de CrewHub+ (🔔 en el menú de la cuenta), no hay nada
que hacer: los avisos de la casilla salen por el mismo despachador que los
demás. Si no, actívalo una vez desde el celular con la app instalada.

---

## Cómo sabe de qué postulación es cada correo

En orden, y guardando **cómo** lo supo (columna `vinculo_por`):

1. **`codigo`** — el código DAFO viene en el asunto y casa con una sola
   postulación (`codigo` o `codigo_plataforma`). Si casa con dos, no se vincula:
   un vínculo inventado es peor que ninguno.
2. **`cuenta`** — la cuenta que recibió el correo está registrada como
   credencial de una empresa, y esa empresa tiene **una sola** postulación en
   juego. Con dos o más, se anota la empresa y decide una persona.
3. **`manual`** — alguien lo vinculó en el panel.

El emoji al lado del vínculo dice cuál fue (🎯 código, 📧 deducido, ✋ a mano):
un vínculo deducido y uno confirmado no valen lo mismo.

**Para que la vía 2 funcione**, cada cuenta de Gmail de postulación debe estar
cargada como credencial de su empresa (ficha de la empresa → Credenciales →
plataforma *Gmail*, identificador = el correo). Ya es donde viven; el sistema no
guarda ese mapa por segunda vez.

## Lo que NO hace, y por qué

- **No abre casos solo.** Un aviso de DAFO puede ser una resolución que solo se
  archiva o un requerimiento con plazo de cinco días, y la palabra «plazo» en el
  asunto no distingue una de otra. El correo que parece pedir algo sube al tope
  de la lista con 🚨; abrir la tarea es un clic humano.
- **No entra a la casilla de la plataforma.** No tiene API y el acceso es con
  login. En la práctica los correos que DAFO manda *son* el aviso de que hay algo
  en la casilla, así que esto cubre el camino de aviso. Entrar a leerla queda
  como paso aparte.
- **No borra ni mueve nada en Gmail.** Solo lee y pone la etiqueta
  `DAFO-enviado`.

## Probar a mano

```
curl -X POST "https://crew-hub-sigma.vercel.app/api/ingesta/dafo?llave=TU_LLAVE" \
  -H "Content-Type: application/json" \
  -d '{"mensajes":[{"id":"prueba-1","fecha":"2026-07-29T10:00:00Z","buzon":"maestro@gmail.com","de":"DAFO <notificaciones@cultura.gob.pe>","para":["cuenta-postulacion@gmail.com","maestro@gmail.com"],"asunto":"Subsanación CDO-P-00094-26","extracto":"Se otorga plazo de cinco dias habiles."}]}'
```

Responde `{ recibidos, nuevos, avisos }`. Correrlo dos veces debe dar
`nuevos: 0` la segunda: eso confirma que la deduplicación funciona.

## Archivos

| Archivo | Qué es |
|---|---|
| `db/casilla-dafo.sql` | Tabla, políticas, realtime y `notificaciones.dafo_id` |
| `lib/casilla.ts` | De qué es un correo: códigos, palabras de acción, link a Gmail |
| `app/api/ingesta/dafo/route.ts` | La puerta de entrada (llave + service_role) |
| `app/casilla/page.tsx` | El panel |
| `app/casilla/acciones.ts` | Marcar leído, vincular a mano, abrir caso |
| `components/CasillaDafo.tsx` | La lista y el resumen de silencio |
| `scripts/casilla-dafo.gs` | Lo que corre en Gmail cada 10 minutos |
