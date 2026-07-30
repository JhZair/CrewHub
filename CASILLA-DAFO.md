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

> **Sobre "aplicar también a las conversaciones que coinciden":** puedes marcarlo
> sin miedo. El correo viejo se guarda y aparece en el panel, pero **no suena**:
> solo se avisa al celular de lo recibido en las últimas 72 horas. Una tanda de
> cien pushes el día de la instalación gastaría justo la confianza que hace que
> el aviso siguiente se lea.

### 5. El Apps Script (una vez)

1. [script.google.com](https://script.google.com) → **Nuevo proyecto**, entrando
   con la cuenta del **buzón maestro**
2. Pegar el contenido de **`scripts/casilla-dafo.gs`**
3. Cambiar `CH_LLAVE` por la misma cadena de `INGESTA_DAFO_LLAVE`
4. Ejecutar la función **`verDestinatarios`** una vez → Google pedirá permiso de
   Gmail y te dirá, sin mandar nada, **si está viendo la cuenta de la
   postulación** en cada correo. Es lo único de todo el montaje que depende de
   cabeceras que Google no documenta del todo (`X-Forwarded-For`): si ahí no
   aparece la cuenta, la vinculación por cuenta no va a funcionar y todo
   dependerá del código en el asunto.
5. Ejecutar la función **`probar`** una vez → manda de verdad la primera tanda
6. Ejecutar la función **`instalarDisparador`** una vez → queda corriendo cada
   10 minutos

Para ver si trabaja: en Apps Script → *Ejecuciones*. Cada corrida imprime cuántos
hilos y mensajes mandó, qué respondió CrewHub+ y cuántos hilos quedaron para la
corrida siguiente.

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
curl -X POST "https://crew-hub-sigma.vercel.app/api/ingesta/dafo" \
  -H "Authorization: Bearer TU_LLAVE" \
  -H "Content-Type: application/json" \
  -d '{"mensajes":[{"id":"prueba-1","fecha":"2026-07-29T10:00:00Z","buzon":"maestro@gmail.com","de":"DAFO <notificaciones@cultura.gob.pe>","para":["cuenta-postulacion@gmail.com","maestro@gmail.com"],"asunto":"Subsanación CDO-P-00094-26","extracto":"Se otorga plazo de cinco dias habiles."}]}'
```

Para probar que la llave quedó bien SIN escribir nada en la base, manda la
tanda vacía: `-d '{"mensajes":[]}'` responde `{recibidos:0, nuevos:0, avisos:0}`.

> Si en vez de JSON te devuelve **HTML** (en PowerShell se ve como un objeto
> `html`), el endpoint está cayendo en el redirect a `/login` del middleware:
> `/api/ingesta` tiene que estar en la lista `publica` de `middleware.ts`. Es un
> fallo traicionero porque el redirect responde **200**, así que el Apps Script
> lo lee como entregado y marca los hilos como enviados sin haber entrado nada.

Responde `{ recibidos, nuevos, avisos, correosAvisados, rafaga }`. Correrlo dos
veces debe dar `nuevos: 0` la segunda: eso confirma que la deduplicación
funciona. (La llave también se acepta como `?llave=` para probar a mano, pero el
script la manda en la cabecera: las query strings quedan escritas en los logs de
Vercel y esta llave escribe en la base.)

## Los correos que DAFO manda de verdad

Levantado de 17 correos reales de `plataformacultura@cultura.gob.pe` en una sola
cuenta (30/07/2026). El remitente es siempre ese, así que el filtro por
`cultura.gob.pe` los agarra todos.

| Asunto | Qué es | 🚨 |
|---|---|---|
| `… - NOTIFICACIÓN DE OBSERVACIÓN` | te observaron algo, corre plazo | **sí** |
| `CONSTANCIA DE ENVÍO` / `DE POSTULACIÓN` / `DE SUBSANACIÓN` / `DE RECEPCIÓN` | acuse de algo que TÚ mandaste | no (🧾) |
| `CASILLA ELECTRÓNICA - MINISTERIO DE CULTURA` | «tienes un mensaje», sin decir de qué | no |
| `MATRIZ DEL JURADO` | resultados publicados | no |
| `Código de verificacion - Plataforma Virtual…` | clave de un solo uso | se guarda, no suena |

**La regla que costó descubrir: las constancias GANAN sobre las agujas.**
`CONSTANCIA DE ENVÍO DE SUBSANACIÓN - DAFO` contiene «subsan», y
`CONSTANCIA DE ENVÍO DE POSTULACIÓN` dice en el cuerpo «vinculada a las
observaciones». Con solo las agujas, la alarma sonaba en 3 de 17 correos que no
la merecían — y un semáforo que se pone rojo cuando tú entregaste algo enseña a
ignorarlo. `esAcuse()` mira que el asunto EMPIECE por «constancia» (no que la
contenga: «Requerimiento sobre su constancia» sí tiene que sonar) y se salta los
prefijos `Fwd:`/`Re:`, porque el correo viejo se rescata reenviándolo a mano.

**Lo que estos correos NO traen: el código de la postulación.** Ni en el asunto
ni, casi nunca, en el cuerpo — ahí va el NOMBRE del proyecto («MAMÁ PIURAY»,
«Pallay»). Así que el vínculo se resolverá casi siempre por la vía «cuenta», y
la vía «código» quedará para los correos directos de un evaluador. Si el vínculo
por cuenta falla seguido, el siguiente paso es emparejar por nombre de proyecto.

## Reglas de aviso

- **Solo suena lo de las últimas 72 h.** Lo más viejo se guarda y aparece en el
  panel; el celular no.
- **A quién avisar se le pregunta a la base, no al insert.** Cada corrida busca
  «qué hay reciente sin aviso», así que si un aviso falla —red, columna que
  falta— la corrida siguiente lo arregla sola. Sin eso, un correo guardado cuyo
  aviso falló quedaría callado para siempre: la corrida siguiente lo vería como
  «ya estaba».
- **Más de 6 correos de golpe = un solo push.** Los demás quedan en la campanita
  🔔 (que es el registro) con el push ya marcado como despachado.
- **Solo lo que exige respuesta suena en el timbre.** Los correos con 🚨
  (subsanación, requerimiento, apercibimiento, observaciones…) se guardan con
  `actor_nombre = 'DAFO'`, así que caen en la pestaña **«Para ti»** y encienden
  el badge rojo: «📬 Requerimiento de subsanación… / DAFO · 1h». Lo rutinario
  —acuses de recibo, resoluciones que solo se archivan— va sin actor a **«Del
  Bot»**, junto a los recordatorios de Qhaway.

  No es una etiqueta puesta para colarlos ahí: el eje de las dos pestañas es
  «¿te habla alguien o te recuerda el sistema?», y DAFO escribió ese correo. Si
  todo sonara, nada sonaría — y un requerimiento con plazo de cinco días
  hábiles no puede llegar con el mismo peso que un aviso de cronograma.

## Dónde se ven, y por qué ahí

| Sitio | Qué dice | Cuándo se apaga |
|---|---|---|
| 🔔 **campanita**, «Para ti» | lo que exige respuesta (🚨), con el timbre rojo | al marcar la notificación como leída |
| 🔔 **campanita**, «Del Bot» | lo rutinario y el resumen de las ráfagas | igual |
| **chip 📬 DAFO** en `/notificaciones` | aísla los de la casilla **dentro de cada pestaña** | — (es un filtro) |
| **badge en el ☰ de la nav** | correos de la casilla **sin leer**, en las 19 pantallas | al marcarlos leídos en `/casilla` |
| **📬 casilla DAFO** (el panel) | todo, agrupado por postulación, con el silencio medido | — |

Dos cosas que conviene tener claras:

- **No hay una tercera pestaña «DAFO», y es a propósito.** Las dos que hay parten
  por *¿te habla alguien o te recuerda el sistema?*; una pestaña DAFO partiría por
  el *origen del contenido*, que es otro eje — y con dos criterios mezclados,
  mañana SUNAT pide la suya. El chip hace el mismo trabajo sin romper la barra, y
  para ver la casilla entera junta ya existe `/casilla`.
- **El badge de la nav cuenta para todo el equipo, no por persona.** `leido_en`
  vive en el correo, no en el lector: si Katy marca uno como leído, baja para
  todos. Es una bandeja compartida, como la casilla real — pero si algún día se
  quiere «leído por mí», hay que mover ese estado a una tabla por usuario.

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
| `scripts/prueba-casilla.mts` | 25 pruebas de la lógica de vinculado y del 🚨 |

## Probar la lógica sin desplegar

La parte que puede equivocarse **en silencio** es la que decide de qué
postulación es un correo: un vínculo errado no da error, solo aparece en el
sitio equivocado. Esa lógica es pura y se prueba sin instalar nada:

```
node --experimental-strip-types scripts/prueba-casilla.mts
```

Si cambias las agujas de `pide_accion` o el emparejado de códigos, corre esto
antes de desplegar. Ahí se descubrió que el espacio entre separadores rompía el
caso más normal: «Subsanacion CDO-P-00094-26 del expediente» no casaba con
nada.
