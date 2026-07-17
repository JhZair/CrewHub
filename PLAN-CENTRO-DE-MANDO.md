# Centro de mando — plan

**Estado:** borrador para discutir, no para ejecutar todavía.
**Fecha:** 16 de julio de 2026
**Para:** John y Katy

---

## 1. El dato que decide el diseño

**Tres o cuatro proyectos al año.**

Esa cifra descarta la comparación con ShotGrid y Ftrack, y conviene decirlo temprano
porque de ahí cuelga todo lo demás. Esas plataformas existen para pelear contra el
**volumen**: cien artistas, mil tareas por semana, quinientos planos por película.
Casi toda su complejidad —permisos por rol, flujos configurables, notificaciones
masivas, campos a medida— es infraestructura para que mucha gente no se pise.

Ustedes son dos en el centro de mando y seis en total. Nunca van a tener volumen.

Lo que sí tienen es **estructura y tiempo**:

- Un presupuesto no es una cifra: es un árbol de partidas, con modificaciones
  aprobadas, y un gemelo ejecutado que hay que comparar contra él.
- Un cronograma de producción no son treinta tareas: son dos años, y su valor está
  en las dependencias, no en la lista.
- Un fondo no es un ingreso: es un compromiso con desembolsos por tramos,
  obligaciones y una rendición que, si falla, te saca del siguiente concurso.

Son problemas de **forma**, no de cantidad. Una herramienta contra el volumen
resuelve mal los problemas de forma — por eso ShotGrid no lleva presupuestos.

**Consecuencia práctica:** este centro de mando va a tener pocas filas y mucha
relación entre ellas. Se parece más a una hoja de cálculo con memoria que a un
tablero de tickets.

---

## 2. La regla que no se puede romper

> **El centro de mando no captura. Lee.**

Es la lección más cara del 16 de julio, y vale la pena dejarla escrita con nombres:

| Lo que la pantalla decía | Lo que pasaba de verdad |
|---|---|
| «SUNAT sano» de 3 responsables | a 2 nunca se les consultó |
| «1 empresa libre para postular» | había 9 |
| «ejecutando · 6» = «ganadoras · 6» | ninguna rendición registrada como entregada |
| «días por proyecto: 23» | las 23 jornadas sin proyecto asignado |
| 57 plataformas | sin un solo link cargado |

Ninguna de esas pantallas estaba mal programada. Todas afirmaban con seguridad
cosas que nadie había capturado. **Un dashboard no es una lente: es una
afirmación.** Sobre tablas vacías, afirma.

Y el riesgo crece con este proyecto, no baja: si el centro de mando lo usan solo
dos personas pero los datos los genera el trabajo de seis, cualquier cosa que
Katy y John tengan que teclear a mano va a envejecer mal. En dos meses el
cronograma maestro dice una cosa y el rodaje otra, y a partir de ahí nadie mira
el cronograma.

**Entonces:**

- Cada dato del centro de mando debe entrar como **efecto secundario del trabajo
  de alguien**, no como tarea aparte.
- El modelo a seguir es la verificación SUNAT del bot: nadie la llena, siempre
  está fresca.
- El contraejemplo es `fecha_rendicion_real`, que hicimos hoy: alguien va a tener
  que acordarse. Está bien porque pasa dos veces al año. Si algo así pasara cada
  semana, sería deuda.
- Cuando un dato **no exista**, la pantalla lo dice. Nunca lo asume. El gris de
  «no sabemos» es un color de primera clase, igual que el verde y el rojo.

**Puentes concretos con la capa de casos (que ya funciona):**

- Una **jornada** registrada por el equipo *es* ejecución de presupuesto. No se
  teclea dos veces.
- Un **caso cerrado** vinculado a un proyecto *es* una actividad del cronograma
  cumplida.
- Una **postulación ganadora** *es* el origen del presupuesto de ejecución.
- La **verificación SUNAT del bot** *es* el semáforo de elegibilidad.

Si el centro de mando pide capturar algo que ya vive en la capa de casos, está
mal diseñado.

---

## 3. Las dos capas, y por qué no son la misma app

| | **Casos** (existe) | **Centro de mando** (por hacer) |
|---|---|---|
| Quién | los seis | Katy y John |
| Pregunta | ¿qué hago hoy? | ¿hacia dónde va la productora? |
| Horizonte | días | meses y años |
| Unidad | el caso | el proyecto y la plata |
| Forma | feed, 860 px, se lee | tablas anchas, se compara |
| Ritmo | todo el día | una vez por semana, y en fechas clave |

El ancho de 860 px se queda donde está — es la medida de lectura y ahí funciona.
El centro de mando es otra sección y otro ancho, porque comparar no es leer.
Ese nunca fue el problema de fondo; era una línea de CSS.

**Lo que NO se toca:** el feed, el kanban, el banco de trabajo, el buscador, el
bot. Funcionan y el equipo ya los usa. El centro de mando se suma; no reemplaza.

---

## 4. Las piezas, en orden

El orden no es por vistosidad: cada pieza es útil sola y le da de comer a la
siguiente. Y la más vistosa va al final a propósito.

### Pieza 1 · El presupuesto — *primero, y por lejos*

**Por qué primero.** Es el agujero más grande y el más caro. Hoy el sistema sabe
cuánto ganaste (`monto_adjudicado`) y **nada** de en qué se gastó. Sin partidas y
sin comprobantes no hay con qué rendir — y la Pieza 2 dice por qué eso se vuelve
urgente en seis meses.

**Corrección (tus respuestas del 16/07).** Yo había escrito «postulado + modificaciones
= vigente». Está mal. Tu palabra fue exacta: *«si ganas, nace un nuevo presupuesto»*.
No es una versión del anterior — es otro documento, con otra historia:

1. **Presupuesto de postulación** — el que leyó el jurado. Se congela el día que
   envías y no se toca nunca más. Es prueba de lo que ofreciste.
2. **Presupuesto reformulado** — nace al ganar. Incorpora las recomendaciones del
   jurado y, si lo hubo, el recorte de hasta 10%. **Es contra el que se rinde.**
3. **Ejecutado** — los comprobantes reales.

La diferencia importa: si fuera «el mismo presupuesto modificado», el recorte del
10% y las recomendaciones del jurado se perderían dentro de un historial de
cambios, y son justo lo que explica por qué el número bajó.

**Las partidas son un catálogo, no un árbol libre** (respuesta del 16/07): DAFO
tiene rubros preestablecidos y la postulación se llena en un formato de su
plataforma — no se manda un Excel.

Eso simplifica mucho y aprieta un poco:
- El presupuesto es una **lista de montos contra un catálogo**, no una estructura
  a inventar. Menos que construir.
- Pero el catálogo **puede variar por convocatoria o categoría**, así que vive en
  una tabla y se administra —como las plataformas—, no quemado en el código.
- Y como DAFO ya tiene el formato, el sistema no debe reinventarlo: debe **poder
  escupirlo**. Si al final hay que volver a teclear todo en la plataforma del
  Ministerio, ganamos poco.

**Las modificaciones existen, y viven dentro de la rendición** (respuesta del
16/07): se puede mover plata entre partidas, y **se justifica cada 6 meses**.

Eso significa que modificación y rendición **no son dos objetos**: la rendición
semestral es a la vez «esto gasté» y «esto moví, y por esto». Modelarlos aparte
haría que un cambio de partida pudiera existir sin su justificación — que es
exactamente lo que DAFO no permite.

**Lo que exige capturar:** las partidas (dos veces por fondo: al postular y al
reformular) y los gastos. Las jornadas ya son gasto de personal y no se teclean
de nuevo.

### Pieza 2 · El acta de compromiso — *el objeto que faltaba*

**Corrección de fondo (16/07).** Todo este documento venía llamando «rendición» al
informe económico. Tu respuesta lo pone en su sitio:

> *«El acta de compromiso […] es prácticamente el documento que marca las reglas del
> juego. […] El objetivo principal es entregar el documental para que ellos puedan
> preservarlo y difundirlo. En el acta también se especifica técnicamente cómo debe
> entregarse (formatos, materiales, documentos), y **esa es la parte más importante**.
> Además de esa entrega, también está el informe económico.»*

O sea: el informe económico es **lo secundario**. Lo que el Ministerio quiere es la
película, entregada en el formato que la deje preservable y difundible. Yo tenía el
plan invertido — construyendo primero la contabilidad de un compromiso cuyo corazón
es la entrega.

**El acta es el objeto que falta en el sistema.** Hoy hay `codigo_acta`,
`fecha_firma_acta` y `acta_url`: el número, la fecha y el PDF. Nada de lo que el
acta *dice*. Y el acta es la que define, por fondo:

- **Los entregables técnicos** — formatos, materiales, documentos. Lo más
  importante, y hoy invisible: vive dentro de un PDF que nadie lee hasta el final.
- **El régimen de rendición** — única al final, o semestral. Por eso los dos
  regímenes conviven (§8): no los decide el año, los decide el acta.
- **Las obligaciones y plazos.**

Y **cambia un poco cada año**, así que es un dato del fondo copiado de su acta, no
una constante — igual que los rubros y el tope de DJ.

**Lo que esto habilita:** una lista de entregables por fondo, marcable, con su
formato exigido al lado. Es lo mismo que hace la hoja para postular —decir qué
falta antes de que sea tarde— pero para la obligación que de verdad importa.

**Y lo que evita:** que el sistema sepa perfectamente cuánto se gastó y no sepa si
la película se entregó como se prometió.

#### El catálogo real, leído del acta 139-2025-DAFO

No hay que suponerlo. La cláusula 5.3 lo lista, y es concreto hasta el códec:

| # | Entregable | El detalle que importa |
|---|---|---|
| 5.3.1 | Informe de ejecución | formato del MINISTERIO |
| 5.3.2 | Ficha técnica de la obra | con créditos; coherente con la obra |
| 5.3.3 | Ficha resumen del proyecto | formato del MINISTERIO |
| 5.3.4.1 | Copia en 35 mm o **DCP** | si es 35 mm: estuche de lata con núcleo. Si es DCP: **disco duro de primer uso**. Sonido óptico, 5.1 o mono+estéreo I+C+D |
| 5.3.4.2 | Copia de preservación | `.mkv` · video `.ffv1`/`.ProRes`/`.mov`/`.avi` · audio `.FLAC` · **subtítulos `.srt` para discapacidad auditiva, no incrustados** · dispositivo de primer uso. Si no es en castellano, subtítulos en castellano |
| 5.3.5 | Tráiler / teaser | mismos códecs, dispositivo de primer uso |
| 5.3.6 | Afiche | impreso **B1 (100 × 70.7 cm), Couché 150 gr** + digital ≥300 ppp en `.tiff` o `.jpeg2000` |
| 5.3.7 | Material promocional | si aplica; ≥300 ppp |
| 5.3.8 | Licencia de comunicación pública | gratuita, no exclusiva, **10 años** desde la notificación |
| 5.4 | Contratos del personal | **y seguros contra accidentes, obligatorios** |
| 5.5 | Licencias musicales | sincronización y derechos conexos |

Dos cosas que saltan de esa lista:

- **«Seguros contra accidentes para los trabajadores del audiovisual» es
  obligatorio** (5.4), y no lo mencionó nadie en toda la conversación. Está enterrado
  en la página 5 de un PDF escaneado. Rodar en la puna sin eso es un incumplimiento
  del acta *y* un riesgo real para gente que está aprendiendo.
- **El nivel de detalle es inmanejable de memoria.** «Couché 150 gr», «no
  incrustados», «primer uso». Nadie recuerda eso dos años después, y se descubre
  cuando el Ministerio observa la entrega.

#### El informe de ejecución no es financiero: es narrativo — *y los casos son su materia prima*

Leí los cuatro formatos (Documental, Largo Regional, Pre Animación, Video y Cine
Indígena). El 5.3.1 del acta no pide números. Pide **contar cómo fue**:

| | Documental | Largo Regional | Pre Animación | Video y Cine Indígena |
|---|---|---|---|---|
| Formación | — | — | — | **✔** |
| Proceso creativo y colectivo | — | — | — | **✔** |
| Preproducción + *problemas y dificultades* | ✔ | ✔ | ✔ | ✔ |
| Rodaje + *problemas y dificultades* | ✔ | ✔ | — | ✔ |
| Postproducción + *problemas y dificultades* | ✔ | ✔ | — | ✔ |
| Participación gratuita a la ciudadanía | ✔ | ✔ | ✔ | ✔ |
| Recomendaciones para la DAFO | ✔ | ✔ | ✔ | ✔ |

Documental y Largo Regional son **idénticos**. Pre Animación es un subconjunto
(solo hay preproducción, así que no pregunta por rodaje). Y **Cine Indígena agrega
dos secciones que ninguna otra tiene: «Formación» y «Proceso creativo y
colectivo»** — DAFO reconociendo que ese cine se hace de otra manera.

**Y aquí está lo mejor que salió de todo el intercambio:**

La estructura del informe es, literalmente: *por etapa → qué pasó → **qué problemas
hubo y cómo se resolvieron**.*

Eso es **exactamente lo que la capa de casos ya captura, todos los días**. Un caso
es un problema, con su conversación, su responsable, su resolución y su fecha,
atado a un proyecto.

Hoy alguien se sienta **dos años después** a escribir «Problemas y dificultades del
rodaje» de memoria. Y el sistema tiene cada uno de esos problemas, fechado y
resuelto, desde el primer día.

**Y hay una continuidad que ninguno de los dos vio hasta hoy** (respuesta del 16/07):

> *«El sistema de casos es reciente. El flujo antiguo era anotar las **ayudas
> memoria** de todo el equipo, desde el productor y el director hasta el último
> involucrado.»*

Una ayuda memoria es una nota de lo que pasó, escrita por quien estuvo. Un caso con
sus comentarios **es exactamente eso**, pero fechado, atado a un proyecto,
buscable y sin perderse en un correo.

O sea: **el sistema de casos ya reemplazó a las ayudas memoria sin que nadie lo
decidiera.** El informe de ejecución que antes se armaba juntando ayudas memoria de
todo el equipo, ahora se puede armar juntando casos — con la diferencia de que los
casos ya están ordenados y nadie tuvo que acordarse de escribirlos aparte.

**Ojo con el alcance:** para los 6 fondos vivos esto no sirve — sus dos años de
historia están en ayudas memoria, no en el sistema. Sirve de los proyectos nuevos
en adelante. Es una razón más para que la migración termine y el equipo siga usando
el feed: cada caso de hoy es un párrafo del informe de 2028.

**Lo que el sistema puede hacer:** entregar la materia prima ordenada por etapa. No
hace falta ni un campo nuevo — `actividad` ya guarda cuándo el proyecto cambió de
etapa, así que se sabe qué casos caen dentro del rodaje y cuáles de la post.

> *Rodaje (mar–jun 2026) · 14 casos, 5 de ellos problemas. Aquí están, con cómo se
> resolvieron.*

**Lo que el sistema NO va a hacer:** escribirlo. Es un relato, con voz y con
criterio, y lo firma quien produjo la película. La máquina junta los ladrillos; la
casa la hacen ustedes.

**Y esto le da un argumento nuevo al feed que ya aman:** los casos no sirven solo
para hoy. Son **la memoria que el informe va a necesitar en dos años** — y es la
única obligación del acta cuya materia prima ya se está capturando sola, sin que
nadie haga trabajo extra. Es el modelo de §2 funcionando sin que lo hayamos
diseñado para eso.

*(Nota sobre la cantera: en Cine Indígena, «Formación» **es una sección obligatoria
del informe**. O sea que ahí la cantera deja de ser una vista opcional y pasa a ser
un entregable. Este año no hay proyectos de esa categoría; el año pasado hubo
cuatro.)*

#### La cláusula séptima confirma el ancla, por escrito

> *«7.2 El plazo máximo para la ejecución del PROYECTO es de hasta **dos (02) años
> calendario desde la entrega del estímulo económico** a la PERSONA JURÍDICA.»*

Exactamente lo que dijiste —*«cuando llega el dinero al banco, recién todo
empieza»*— pero firmado. El sistema guarda `fecha_firma_acta` y no guarda esa. Está
midiendo desde el punto equivocado.

Y dos detalles más que cambian el modelo del cronograma:

- **8.1: prórroga de hasta dos años más.** Un fondo puede vivir **cuatro años**. La
  lógica de «ejecutando» tiene que aguantar eso.
- **7.1: no todas las fechas se mueven igual.** Cambiar las fechas de las
  obligaciones de la cláusula quinta **requiere aprobación** del Ministerio; el resto
  del cronograma solo se comunica. Son dos clases de fecha, y meterlas en la misma
  tabla sin distinguirlas haría creer que todo se puede correr.
- **La devolución a la ciudadanía no tiene prórroga** (5.x): *«No se otorgarán
  prórrogas para el cumplimiento de dicha obligación.»* Es una fecha dura dentro de
  un cronograma flexible.

### Pieza 3 · El informe económico

#### Los formatos reales, leídos (16/07)

Con los cinco archivos del kit —informe económico, DJ, ficha resumen, ficha técnica
y modificación de presupuesto— el modelo se cierra. Y sale una cosa que explica por
qué rendir duele.

**El presupuesto es jerárquico, de tres niveles:**

```
1        GASTOS GENERALES (todas las etapas)      ← categoría
1.1      ASPECTOS JURÍDICOS Y FINANCIEROS         ← rubro
1.1.1    [ítem]  · Unidad: Paquete · Cant: 1 · S/ 1,500   ← el ítem
```

Con columnas: `COD · Ítem · Unidad · Cantidad · Costo unitario · Costo total
(postulación) · Total ítem · Subtotales · Totales en dólares · Financiado con
estímulo MINCUL · Fuente externa`.

**«Paquete» es la unidad del formato oficial**, no jerga interna. Cuando dijiste
*«un paquete de 10 mil soles para la música original»* estabas citando al
Ministerio: `Unidad: Paquete | Cantidad: 1 | Costo Unitario: 10000`. El sistema debe
hablar así.

**Y trae dos cosas que no estaban en el radar:**
- **Doble fuente por ítem**: financiado con estímulo vs. fuente externa. *«Gastos
  financiados con fuente externa NO tienen que sustentarse»*. Solo lo del estímulo
  necesita comprobantes. En el modelo: `ESTÍMULO 100,000 / COSTO TOTAL 150,000`.
- **Columna en dólares.** Hay conversión.

#### El desencuentro que hace que rendir duela

**El presupuesto se organiza por RUBRO. El informe económico se organiza por
ACTIVIDAD.** Y no son lo mismo.

El informe económico son 7 hojas: un Resumen y **seis «Consolidado de gastos:
Actividad N»**. Cada una es una tabla de comprobantes:

| N° | Fecha | TC* | Nº comprobante | Proveedor | RUC | Detalle | T. de cambio | Importe |

*(\*TC = tipo de comprobante, «usar Tabla de la SUNAT como guía». 25 filas por
actividad → 150 comprobantes máximo.)*

Y la DJ pide lo mismo: `Descripción · **Actividad relacionada al desarrollo del
proyecto** · Lugar (Origen/Destino) · Fecha (día o rango) · Importe`.

Entonces **cada gasto tiene dos ejes**:
- su **rubro** (de qué tipo es → presupuesto: 1.1.1)
- su **actividad** (para qué se hizo → informe: 1-6)

Hoy el presupuesto vive en un Excel por rubros, y dos años después alguien reparte
esos gastos en seis actividades a mano. **Ese reparto es el dolor**, y es evitable:
si al registrar un gasto se anotan **los dos ejes** —una vez, en el momento—, el
control de presupuesto y el informe económico salen los dos, gratis. Si se anota
uno solo, el otro se reconstruye de memoria.

Es la lección del día otra vez: **capturar dos hechos cuesta un segundo; deducir uno
de ellos dos años después cuesta una semana y sale mal.**

#### Pero el segundo eje se mueve — y el sistema no debe pelear con eso

> *«Sale en gran parte del cronograma presentado en la postulación, pero que en la
> vida real cambia. Sobre todo en documental, que trata de la vida real: es
> diferente a ficción, con guion y todo planificado para rodar. En cambio **un
> documental está vivo**; tenemos un tratamiento narrativo de intenciones, pero es
> la vida real, y **nadie sabe realmente qué pasará en la puna**.»*

Eso no es una anécdota: es una restricción de diseño, y la más importante de este
documento después de la 6.9.

Las 6 actividades **nacen del cronograma de postulación** —son un compromiso— pero
la realidad se va de ahí. Un sistema que **obligara** a que cada gasto encaje en la
actividad presupuestada estaría peleando contra la naturaleza del documental. Y
perdería: la gente lo saltaría, o peor, metería el gasto en la casilla que entra en
vez de en la que es.

**Entonces:**

- La actividad de un gasto **se anota al momento y se puede cambiar después.** No es
  una jaula: es una hipótesis que se corrige.
- **La desviación es información, no un error.** «Gastaste en la actividad 3 lo que
  estaba presupuestado para la 5» no es una alarma — es lo que pasó, y es
  exactamente lo que hay que justificar en la modificación de presupuesto.
- El sistema **muestra la deriva**, no la impide. Lo mismo que hace hoy con la
  vigencia vencida: dice el hecho, no manda.
- Y como la modificación se justifica cada 6 meses, esa deriva **ya tiene su
  momento de rendir cuentas**. El sistema solo tiene que tenerla escrita cuando
  llegue.

Un documental que sale como estaba planificado probablemente sea un mal documental.
La herramienta tiene que estar de acuerdo con eso.

#### El resto del kit

- **Resumen del informe:** identidad, monto del premio, **«Interéses generados»**
  (la plata en el banco rinde y hay que declararlo — nadie lo mencionó), las 6
  actividades con su monto, total. **Y lo firma un CONTADOR con matrícula**, además
  del representante legal.
- **La DJ es el cuaderno de la puna, transcrito.** Numerada, 9 filas, con «fecha:
  día o **rango de días**» — que es exactamente una semana de rodaje— y «lugar:
  origen/destino». Está diseñada para lo que ustedes hacen. Y admite que la firme
  otra persona si no fue el representante legal quien gastó.
- El **RUC del proveedor** es columna obligatoria del informe. Para un RHE, ese RUC
  **el sistema ya lo calcula del DNI** (`lib/ruc.ts`). Una columna menos que teclear,
  y una donde no se pierde un dígito.

**Por qué subió de puesto.** Tu respuesta trae la fecha más importante de todo el
documento: **desde 2027 la rendición económica es semestral.** Antes era una sola,
al final del proyecto.

Haz la cuenta: 6 fondos en ejecución × 2 rendiciones al año = **12 rendiciones
anuales** donde antes había ~1. Y una rendición vencida no es una multa: te saca
del siguiente concurso (Bases 2026, 5.2.2). Es un salto de 12× en la tarea más
cara de fallar, y faltan seis meses.

**Corrección a lo que hice hoy.** El 16/07 agregué `postulaciones.fecha_rendicion_real`
— *una* fecha, porque *una* rendición. Con el cambio a semestral esa columna se
queda corta: las rendiciones pasan a ser **filas**, no un campo. Cada una con su
periodo, su fecha límite, su fecha de entrega y su estado. `fecha_rendicion_real`
sirve para cerrar lo viejo; no para lo que viene.

**Cómo se rinde (tu respuesta):**
- Con comprobantes: **facturas, RHE, y hasta 10% con declaraciones juradas.**
- En los formatos de DAFO.

De ahí salen dos cosas que el sistema puede hacer solo:

- **El tope de DJ es una regla, no un criterio — y se gasta.** Es **10% del total
  del fondo, y 25% si es cine indígena** (respuesta del 16/07). Dos cosas que eso
  implica:

  1. Como es **del total y no del semestre**, es un saldo que se consume. Quemarlo
     en el primer semestre te deja sin nada en el cuarto, y eso no se ve hasta que
     ya pasó. El sistema debe decir **cuánto queda**, no cuánto se usó.
  2. Como **depende de la categoría**, el porcentaje vive en la convocatoria, no en
     el código. Es la misma forma de la reserva regional: una regla del concurso,
     no del sistema.

  Es exactamente `lib/cuarta.ts` otra vez —un tope anual que se acumula y avisa
  antes de pasarse—, y ese archivo ya existe y funciona. Copiar la forma, no el
  contenido.

- **Los RHE ya viven en el sistema.** Un RHE girado es a la vez gasto de personal,
  comprobante de rendición y consumo del tope de 4ta de esa persona. Un dato, tres
  usos, cero tecleo extra. Ese es el modelo.

### El tope de DJ decide dónde puedes rodar · *y eso se elige 18 meses antes*

La respuesta del 16/07 que más cambia el plan, y vino como un detalle operativo:

> *«En zona rural o en la puna, no hay forma de pedir RHE, se paga sin ningún
> comprobante; ya luego regresando al Cusco se suman esos gastos y se generan
> declaraciones juradas. […] **Generalmente el 10% no es suficiente.**»*

Encadenado, dice esto:

```
categoría de la postulación
      ↓  (define el tope de DJ: 10% general, 25% cine indígena)
cuánta plata puedes pagar sin comprobante
      ↓
cuántos días puedes rodar en la puna
```

**La decisión está a 18 meses de su consecuencia.** La categoría se elige al
postular; el problema aparece en la puna, a mitad de rodaje, cuando ya no hay
vuelta atrás y hay gente esperando que le paguen. Es exactamente la forma del error
de la vigencia y el RENCA —una regla cuya consecuencia asoma lejos de donde se
decide— pero esta cuesta rodaje, no trámites.

Y «el 10% no es suficiente» no es una queja: es un **dato estructural** de hacer
cine documental en el Ande. Un fondo de S/ 200,000 da S/ 20,000 en DJ al 10%, y
S/ 50,000 al 25%. Esos S/ 30,000 de diferencia son días de rodaje en comunidad.

### Lo que dice el acta real (139-2025-DAFO, Pacha Apus Plus, S/ 400,000)

Leí el acta que pasaste. El tope no está solo en las bases: **está en el contrato
firmado**, cláusula 5.2.4:

> *«…máximo del **diez por ciento (10%)** del estímulo económico otorgado, según
> formato del MINISTERIO, el mismo que deberá ser suscrito por el representante
> legal […] cuando: (i) por la propia naturaleza de su trabajo, el prestador del
> servicio sea ocasional; (ii) **las actividades sean realizadas en zonas alejadas
> de centros poblados o en situación de informalidad**, y sea imprescindible la
> contratación de servicios o la adquisición de bienes.»*

La puna **está contemplada**: el inciso (ii) la describe con esas palabras. El
problema no es que DAFO no la acepte — es que S/ 40,000 no alcanzan.

**Y aquí está lo que hace que esto sea grave y no un trámite.** Cláusula 6.9:

> *«En caso no se ejecute el total del monto otorgado **o no se acrediten los gastos
> de manera fehaciente**, la PERSONA JURÍDICA deberá **devolver el monto no
> ejecutado** en los términos y condiciones que el MINISTERIO indique.»*

Pasarse del 10% no es que te rechacen un papel: **es devolver esa plata de tu
bolsillo.** Dinero que ya se pagó, en efectivo, a gente en comunidad, y que no se
puede recuperar. Para una productora cuyos encargos *«apenas alcanzan para cubrir
los gastos operativos»*, S/ 10,000 de exceso salen de donde no hay.

Eso convierte el saldo de DJ en la pieza número uno de todo el documento. No es
contabilidad: es evitar pagar dos veces.

**Lo que el sistema puede hacer, y hoy nadie hace:**

1. **Saldo vivo de DJ por fondo.** No «cuánto usaste»: **cuánto queda**. Misma forma
   que `lib/cuarta.ts`, que ya funciona.
2. **Saberlo ANTES de subir a la puna.** Rodaje de una semana, anotes en cuaderno
   (respuesta del 16/07). Nadie va a capturar en tiempo real allá arriba, ni hace
   falta: lo que hace falta es **salir sabiendo el número**. El saldo antes de
   partir, no la captura durante.
3. **Y al volver, sumar el cuaderno y ver el saldo nuevo** antes del próximo viaje.

**Lo que NO se hace** (idea muerta, 16/07): avisar el tope al elegir categoría. La
categoría no se elige — *«el director nace con su proyecto y eso marca todo el
camino»*. El año pasado, 4 proyectos a cine indígena; este año, ninguno. No hay
decisión que informar; hay una restricción con la que operar.

Y tampoco proponer salidas: *«no se puede pedir excepción a DAFO; tenemos que
operar con estrategia en la puna»*. El sistema no negocia. Solo tiene que decir el
número a tiempo, que es justo lo que hoy nadie sabe.

### El cruce que nadie está viendo, y que pasa este mes

Tu ejemplo: **un paquete de S/ 10,000 de música original, pagado en 2-3 RHE a la
misma persona.**

El tope de 4ta 2026 es **S/ 48,125** (`lib/cuarta.ts`). Ese paquete es el **21%**
del tope anual de esa persona. Cuatro paquetes así entre encargos y fondos —con 12
encargos al año, 3-4 fondos y un equipo chico de gente de confianza que se repite—
y la revientas sin que nadie lo haya decidido.

El sistema **ya sabe el tope**. Lo que hace hoy es mirarlo *después de girar*: la
ficha de la persona muestra cuánto lleva. Con el presupuesto por paquetes, podría
avisar **antes de comprometer**:

> *«Si le asignas este paquete de S/ 10,000 a Michel, llega al 92% de su tope 2026.»*

Eso no es un dashboard: es una decisión distinta. Y no requiere que nadie capture
nada nuevo — el tope ya está, los RHE ya están, y el paquete se va a escribir de
todos modos al armar el presupuesto.

Es el mejor argumento a favor de empezar por aquí: **el valor no está en el gráfico,
está en el cruce.** Y es un cruce que ninguna herramienta comprada va a hacer,
porque ninguna sabe qué es la cuarta categoría.

**El modelo, entonces: por comprobante.** Cada uno con su partida. La vista por
partida se calcula; al revés no se puede — de una suma por partida no se sacan
los comprobantes que DAFO exige adjuntar.

### Pieza 4 · El cronograma — *anclado al dinero*

**Corrección importante, y sale de tu respuesta.** Yo había separado «cronograma de
postulación» (fechas de DAFO) de «cronograma de producción» (interno). Son dos,
pero no como los describí. Tu secuencia real es:

1. El cronograma **nace en la postulación**.
2. Al ganar, se modifica según las recomendaciones del jurado.
3. **«Corre su inicio hasta la fecha que llega el dinero»** y se reenvía a DAFO.
4. Recién ahí nace el cronograma real de producción — hoy, Excel más apuntes.

El paso 3 es la clave de diseño de toda la pieza: **si el cronograma entero se
corre según cuándo llega el desembolso, las actividades no deben guardar fechas
absolutas.** Guardan *desplazamientos* («día 40 desde el inicio») y el cronograma
tiene *una* fecha ancla. Correr el proyecto tres meses es cambiar un campo, no
retocar cuatrocientas filas a mano — que es exactamente el dolor de cabeza que
describes.

Con fechas absolutas, esto se convierte en un Excel con base de datos. Con ancla
y desplazamientos, en algo que el Excel no puede hacer.

**Sigue siendo la tercera** porque es la que más captura exige a diario y la que
más rápido miente. Solo funciona si el equipo la mueve desde los casos —donde ya
vive— y ustedes solo la dibujan.

### Pieza 5 · El portafolio

**Por qué al final.** Es el resumen, y un resumen de nada es decoración. Cuando
1, 2 y 3 existen, esta pieza casi se cae de madura: cada película con su etapa,
su fondo, su plazo, su caja y su semáforo, y de ahí se baja al detalle.

Si la hacemos primero, la mitad de los semáforos van a decir «falta el dato» —
y prefiero que lo digan a que inventen verde, pero entonces no sirve para dirigir.

### El flujo de caja · *pieza eliminada*

La había puesto segunda, montada sobre «un fondo paga por tramos contra hitos».
Tu respuesta la desarma: **se firma el acta y el desembolso es de una sola partida.**

Entonces no hay que modelar tramos, ni proyectar cobros, ni cruzar
desembolsos-comprometidos contra gastos-comprometidos. El dinero llega una vez y
se gasta durante uno o dos años. La pregunta «¿cuándo me quedo sin plata?» no se
contesta con un módulo nuevo: se cae sola del presupuesto reformulado menos lo
ejecutado.

Una pieza menos. Vale la pena decirlo fuerte porque el plan anterior la tenía como
la segunda más importante, y era una respuesta a un problema que ustedes no tienen.

Queda una pregunta de caja que sí es real, pero es otra y más chica: con varios
fondos vivos en la misma cuenta, **¿cuánta de la plata que hay en el banco ya está
comprometida?** Eso se contesta sumando, no proyectando.

### Producciones por encargo · *no son un negocio, son la cantera*

**Esto reordena el módulo entero** (respuesta del 16/07):

> *«Hoy no estamos mirando el margen, porque estos encargos apenas alcanzan para
> cubrir los gastos operativos. Para nosotros un encargo tiene otro propósito, y no
> es el económico. […] Somos como una cantera de cineastas del Ande peruano.»*

**El margen era la pregunta equivocada, y era mía.** Pregunté por él dando por
sentado que un trabajo pagado se mide en plata. Un encargo que apenas cubre costos
no está fallando: está haciendo exactamente lo que tiene que hacer. Una pantalla
que dijera «margen: 3%» estaría midiendo lo que no importa e insinuando que debería
ser más alto — una herramienta empujando a la productora en dirección contraria a
su propósito. **No se construye.**

**Lo que un encargo produce de verdad**, en tus palabras: salir a rodar con el
núcleo interno, e integrar directores de ópera prima y asistentes que aprenden en
la cancha. Y con esos mismos equipos se postula a DAFO después — *«su camino empieza
aproximadamente un año antes»*.

Eso convierte al encargo en la **etapa 0 del embudo de fondos**. Y hace del sistema
el único sitio donde ese año de camino queda registrado.

Otro animal que un fondo: cliente, precio cerrado, factura. **No comparte tabla con
los fondos.** Un encargo no rinde, factura. Mezclarlos sería el error del día —una
palabra cargando dos significados— pero a escala de arquitectura.

### La cantera · *la métrica que sí importa, y ya está en la base*

Si el rendimiento de un encargo es gente formada, eso se mide. Y no hace falta
capturar **nada nuevo**: `jornadas` ya sabe quién fue, cuántos días y a qué
proyecto; `postulacion_equipo` sabe con quién se postuló; `personas` tiene sus
roles y sus CVs.

**Pero mi marco estaba mal, y tu respuesta lo corrige** (16/07):

> *«Los directores nuevos nacen junto a sus proyectos. Para ganar un fondo DAFO el
> director tiene que presentarse al pitch y dar la cara por su proyecto; esto no es
> una pantalla ni una actuación, tiene que demostrar al jurado que es su proyecto.
> **Nosotros no ponemos directores**, los directores nacen con sus proyectos, y como
> productor me encargo de abrirles el camino.»*

Yo había propuesto la cantera como un banco de talento del cual **elegir** —«a quién
meto en la próxima postulación»—. Eso no es lo que pasa. Un director llega con su
proyecto; el proyecto y el director son la misma cosa, y el jurado lo huele. La
productora no reparte papeles: abre camino.

**Entonces la cantera no es para directores. Es para el equipo que los rodea.**
Y ahí sí se selecciona: *«también están los que seleccionamos de la cantera»*.

Reformulada, y más chica:

- **Quién viene subiendo.** Días rodados por persona en el último año y en qué
  roles. Un asistente con 40 días en cuatro encargos no es el mismo que uno con 3.
- **Quién se enfrió.** Alguien que no sale desde hace ocho meses probablemente ya no
  está. Eso lo sabe `jornadas` y nadie lo mira.
- **Quién ya rodó con este director.** Cuando llega un proyecto nuevo, la pregunta
  no es «a quién elijo» sino «quién ya funciona con esta persona».

**Prioridad: baja, y bajó con esta respuesta.** Los datos están, cuesta poco, y
puede esperar — la decisión que yo creía que ayudaba a tomar no existe. Antes de
construirla hay que saber qué decisión sí cambia; si ninguna, es una pantalla
bonita y no se hace.

Lo que sí sigue en pie del argumento de §6: ninguna herramienta comprada sabe que
un encargo de S/ 8,000 sin margen fue el año de formación de un equipo. Este
sistema ya tiene las jornadas para saberlo. Pero saberlo no es lo mismo que
necesitarlo en una pantalla.

**El dato que cambia su lugar: uno al mes.** Son ~12 al año contra 3-4 fondos. Es
lo de mayor frecuencia que tienen, y —tus palabras en la visión— es *lo que
sostiene económicamente a la empresa*. En el plan anterior lo puse como apéndice.
Estaba mal ponderado.

Su modelo es el más simple posible: **precio cerrado, 50% de adelanto y 50% contra
entrega.** Dos hitos, dos facturas. Sin partidas, sin jurado, sin rendición.

**Precio cerrado es lo que cobras. Adentro hay paquetes** (respuesta del 16/07):

> *«En el presupuesto dice un paquete de 10 mil soles para la música original, y eso
> en la vida real la pagamos en dos o tres partidas, cada una con su RHE a la misma
> persona.»*

Ese párrafo **es el motor entero**, dicho en una frase:

```
paquete presupuestado  →  N comprobantes reales
S/ 10,000 música       →  RHE 4,000 + RHE 3,000 + RHE 3,000
```

Y es **idéntico** para un fondo. Un rubro de DAFO se comporta igual que un paquete
de encargo: un monto comprometido, varios comprobantes contra él. Cambia el nombre,
no la forma.

Así que el encargo **sí es el primer corte**, y me equivoqué dos veces antes de
llegar aquí:
1. Primero lo puse de apéndice: mal ponderado (son 12 al año, contra 3-4 fondos).
2. Después lo saqué del primer puesto al leer «precio cerrado»: creí que sin
   partidas no había motor. También mal — el precio es cerrado *hacia afuera*;
   adentro hay paquetes y comprobantes.

Ahora la razón es sólida: **es el mismo motor, pasa 12 veces al año, y ya está
pasando.** Si funciona con la música de un encargo, funciona con un rubro de DAFO.

Ya hay base (`ClienteProyecto`).

---

## 5. Lo que NO vamos a hacer

- **No replicar ShotGrid.** Su complejidad es contra el volumen que ustedes no
  tienen. Copiarla es pagar el precio sin recibir el beneficio.
- **No gráficos de tendencia.** Con 3-4 proyectos al año, una línea de siete días
  es ruido con forma de información.
- **No un flujo configurable.** «Cada proyecto sigue un camino distinto» es cierto,
  pero un motor de flujos configurable para ocho proyectos es más trabajo que los
  ocho proyectos. Se modela lo que pasa; cuando aparezca el noveno camino, se
  agrega.
- **No formularios largos.** Si una pieza necesita un formulario de cuarenta
  campos, la pieza está mal pensada.
- **No empezar antes de que termine la migración.** El centro de mando lee de
  empresas, personas y proyectos. Sobre tablas a medio cargar, va a mentir — y la
  primera impresión de una herramienta que miente no se recupera.

---

## 6. La ventaja que ya tienen (y que no está en el texto de la visión)

Este sistema sabe cosas que ShotGrid jamás va a saber:

- El RUC que se calcula del DNI.
- El tope de 4ta categoría y cuánto lleva cada persona este año.
- Que el RENCA es lo que exige el fondo, y que la vigencia de poder sirve para
  **pedir** el RENCA y no para postular.
- Que la reserva regional aparta media convocatoria, y que Huacho no es Lima
  Metropolitana.
- El estado SUNAT de cada empresa, revisado solo, todas las mañanas.

Eso decide si postulas o no. **Los gráficos los tiene cualquiera; esto no lo tiene
nadie.** Cuando haya que elegir entre pulir una vista y profundizar esta capa, la
respuesta casi siempre es la segunda.

---

## 7. Primer corte propuesto

**Ahora (esta semana):** nada nuevo. Terminar la migración y tapar la deuda de
datos que la portada ya está señalando: las 6 rendiciones sin fecha, las 57
plataformas sin link, las 23 jornadas sin proyecto. Es poco vistoso y es lo que
hace que lo demás no mienta.

**El primer corte: un encargo, de punta a punta.**

Cambié de opinión tres veces, y las tres por datos tuyos. Vale la pena dejar el
rastro, porque muestra qué información movió qué decisión:

| | Propuesta | Qué la tumbó |
|---|---|---|
| 1 | Presupuesto de fondo | 12 encargos/año vs 3-4 fondos: mal ponderado |
| 2 | Un encargo | «precio cerrado» → creí que no había partidas |
| 3 | `fecha_desembolso` | «los anteriores tienen otros términos» → no hay reloj |
| **4** | **Un encargo** | *(el paquete pagado en varios RHE **es** el motor)* |

**Por qué ahora sí:**

- **Es el mismo motor que un fondo.** Paquete → N comprobantes. Un rubro de DAFO se
  comporta igual; cambia el nombre, no la forma.
- **Pasa 12 veces al año, y ya está pasando.** En cuatro semanas sabemos si sirve.
  Un fondo tarda un año en decírtelo.
- **Trae el cruce del tope de 4ta**, que es valor desde el primer paquete y no
  necesita capturar nada nuevo.
- **Si falla, nos enteramos con S/ 8,000 en juego, no con S/ 200,000.**

**Lo que NO trae** (corrección del 16/07): el margen. Un encargo no se mide en
plata, se mide en gente formada. Ver «La cantera».

El corte más chico que sirve solo:

- Un encargo con su **precio cerrado** y sus **paquetes** (catálogo propio — aquí
  no hay jurado, lo deciden ustedes).
- Los **RHE girados contra cada paquete**, que ya existen en el sistema.
- El aviso del **tope de 4ta antes de comprometer**, no después.

Sin cronograma, sin acta, sin Excel todavía. Si eso te avisa antes de reventar un
tope y te deja ver en qué se fue un encargo, seguimos.

**Después, en este orden:**

1. **El saldo de DJ por fondo.** Subió al primer puesto con la respuesta de la puna:
   no es contabilidad, es si se le puede pagar a alguien en comunidad. Es
   `lib/cuarta.ts` otra vez —un tope que se consume y avisa antes—, con el % colgado
   de la convocatoria (10% / 25% cine indígena).
2. **El mismo motor sobre un fondo** — catálogo de rubros por convocatoria +
   presupuesto reformulado.
3. **El acta y sus entregables** — catálogo base más los extras de cada acta. Lo que
   el Ministerio de verdad espera.
4. **`fecha_desembolso`** y el calendario que cuelga de ella.
5. **El informe económico** y su Excel.
6. **El cronograma anclado.**
7. **El portafolio.**
8. **La cantera** — al final, y solo si aparece la decisión que cambia.

**Y una fuera de orden, que quizá va antes que todo:** al elegir categoría en una
postulación, mostrar el tope de DJ que implica. Es un número en una pantalla que ya
existe, y decide meses de rodaje 18 meses después.

---

## 8. El reloj — *me equivoqué, y conviene decirlo fuerte*

Escribí que la rendición semestral desde 2027 era el eje del plan: «6 fondos × 2 =
12 rendiciones al año, y faltan seis meses». **Es falso**, y tu respuesta del 16/07
lo desarma:

> *«Del 2027 en adelante; los anteriores ya tienen actas de compromisos firmadas
> con otros términos.»*

Los 6 fondos vivos **siguen con su rendición única al final**. La semestral solo
alcanza a los que se ganen desde 2027 — y el primer semestre de esos caerá recién
a mediados de 2028, contando desde su desembolso. No son 12 rendiciones en seis
meses: **son cero**.

Este plan no tiene reloj. Eso es una buena noticia y cambia el criterio: si nada
apura, se construye por **valor semanal**, no por fecha.

### Pero deja una exigencia de modelo, y es mayor que la del calendario

**Dos regímenes van a convivir durante años.** Las reglas no las pone el año: las
pone **el acta de compromiso que se firmó**. Un fondo de 2025 rinde una vez al
final; uno de 2027, cada seis meses. Los dos vivos, en la misma tabla, al mismo
tiempo.

Si el sistema dijera «desde 2027 es semestral», rompería los 6 de hoy el 1 de
enero. Es exactamente el error del día —una regla escrita en el sitio equivocado—
pero con actas firmadas de por medio.

**Entonces:** el régimen de rendición es un dato **del fondo**, copiado de su acta,
no una constante del código ni una fecha de corte. Y el sistema tiene que poder
mostrar los dos sin confundirlos, igual que hoy distingue «vigencia vencida que
estorba» de «vigencia vencida que ya cumplió».

---

## 9. `fecha_desembolso` — la fecha que manda y que no existe

> *«Todo manda el desembolso: cuando llega el dinero a la cuenta del banco, recién
> todo empieza.»*

El sistema guarda hoy `fecha_firma_acta`, `fecha_limite_rendicion` y
`fecha_prorroga`. **No guarda cuándo llegó la plata.** Guarda la fecha en que
firmaste — que es la que aparece en el papel— y no la que gobierna el proyecto.

De esa fecha ausente cuelga literalmente todo:

- El **inicio del cronograma** («corre su inicio hasta la fecha que llega el dinero»).
- El **plazo de ejecución** — las bases lo cuentan «posterior a la entrega del
  estímulo económico»: 1 año en Cortometrajes y Desarrollo, 18 meses en series,
  2 años en Preproducción y Producción.
- Los **semestres de rendición**, desde 2027.
- Y por lo tanto, si una empresa **puede tomar otro fondo**.

Es una columna. Es probablemente el cambio más barato y de mayor alcance de todo
este documento, y es el que convierte al cronograma en algo que un Excel no puede
hacer: mover el ancla y que las cuatrocientas actividades se acomoden solas.

**Ojo con el hueco:** de los 6 fondos en ejecución, ninguno tiene esta fecha
cargada. Hasta que la tengan, el sistema no puede calcular ni un solo plazo — y
va a tener que decir «no sé», no inventar uno desde la firma del acta. Firma y
desembolso no son la misma fecha, y la distancia entre las dos es justamente lo
que a nadie le consta.

---

## Preguntas abiertas

**Contestadas el 16/07** (ver las correcciones en cada pieza):
- ~~Partidas~~ → se postula con un presupuesto propio; al ganar **nace uno nuevo**
  con las recomendaciones del jurado y hasta 10% de recorte.
- ~~Desembolsos~~ → **uno solo**, contra la firma del acta. (Pieza de flujo de caja
  eliminada.)
- ~~Cronograma~~ → nace en la postulación, se reformula, y **corre su inicio hasta
  que llega el dinero**. Hoy Excel + apuntes.
- ~~Rendición~~ → **por comprobante** (facturas, RHE, ≤10% en DJ). **Semestral desde
  2027.**
- ~~Encargos~~ → ~1 al mes, 50% adelanto + 50% contra entrega.

**Contestadas también el 16/07:**
- ~~Formato de partidas~~ → **catálogo de rubros**, en formato preestablecido de la
  plataforma de DAFO. No es Excel ni árbol libre.
- ~~Mover plata entre partidas~~ → **sí, justificándolo cada 6 meses**. La
  modificación vive dentro de la rendición.
- ~~El semestre~~ → **corre desde el desembolso**. Todo cuelga de esa fecha.
- ~~El 10% de DJ~~ → **del total**, y **25% en cine indígena**. Es un saldo que se
  consume, y depende de la categoría.
- ~~Encargos~~ → **precio cerrado**. (Dejan de ser el primer corte.)

**Contestadas también el 16/07 — tercera ronda:**
- ~~Costo interno de un encargo~~ → **sí: paquetes**, pagados en 2-3 RHE a la misma
  persona. *Es el motor.* (Devuelve al encargo al primer puesto.)
- ~~Fecha del desembolso~~ → DAFO pide confirmarla, y los estados de cuenta del
  banco van en cada rendición. El dato existe y es oficial.
- ~~Catálogo de rubros~~ → **cambia por categoría y se ajusta cada año**. Nunca una
  tabla global: vive colgado de la convocatoria.
- ~~Semestral desde 2027~~ → **solo los nuevos**. Los 6 vivos siguen con su acta.
  *(Mató el reloj de este plan — ver §8.)*
- ~~Formatos de rendición~~ → **son Excel**. El sistema puede generarlos llenos.

### Lo que abre que los formatos sean Excel

Si son Excel, el objetivo del módulo de rendición no es «llevar el registro»: es
**escupir el archivo listo**. Eso convierte el retecleo —doce formatos por año,
cientos de filas, cada una con un número que se puede perder— en un botón.

Es el problema de Wilfredo a escala: *«a veces copia manualmente menos un dígito».*
Hoy lo resolvimos con un botón de copiar un dato. Ahí serían cientos de datos, y
el que se pierda invalida una rendición.

**Ojo con el orden, igual:** primero hay que tener los comprobantes bien
capturados. Un Excel generado desde datos incompletos es un error más rápido, no
menos error.

**Contestadas el 16/07 — cuarta ronda:**
- ~~Paquetes libres o catálogo~~ → **catálogo propio.** *«Nosotros decidimos, aquí no
  hay jurados.»* Se administra como las plataformas.
- ~~Pagos que no son RHE~~ → **la gran mayoría es RHE y DJ.** Y la DJ está topeada
  (10% / 25%), así que el saldo de DJ importa más de lo que parecía.
- ~~El régimen en el acta~~ → **el acta es el reglamento del fondo**, y cambia cada
  año. Y lo más importante que contiene **no es el informe económico: es cómo
  entregar el documental.** *(Reordenó el plan — ver Pieza 2.)*
- ~~El margen~~ → **no lo miran, y hacen bien.** Un encargo es cantera, no negocio.
  *(Pregunta equivocada, mía.)*

**Contestadas el 16/07 — quinta ronda:**
- ~~RHE repartido~~ → **no se puede.** Un comprobante cuelga de un solo paquete.
  Modelo confirmado.
- ~~Entregables del acta~~ → **catálogo con extras por acta.**
- ~~Saldo de DJ~~ → **en la puna no hay forma de pedir RHE**; se paga sin
  comprobante y se declara al volver. **«El 10% no es suficiente».**
  *(Subió al primer puesto — ver arriba.)*
- ~~La cantera~~ → **los directores no se eligen: llegan con su proyecto.**
  *(Mi marco estaba mal; la pieza bajó al último.)*
- ~~Los músicos~~ → **cargados, como Colaborador.** Igual los de la cantera. Así que
  `esDelEquipo()` ya los cuenta.

**Contestadas el 16/07 — sexta ronda, con documentos:**
- ~~Cuando el 10% no alcanza~~ → **no hay excepción; se opera con estrategia**. Y el
  acta (6.9) dice el precio: lo no acreditado **se devuelve**. El sistema avisa el
  número; no negocia.
- ~~La categoría~~ → **no se elige**. 4 proyectos a cine indígena el año pasado,
  ninguno este. *(Mató la idea de avisar el tope al postular.)*
- ~~Los anotes en la puna~~ → **cuaderno, una semana máximo**. No hace falta captura
  en campo: hace falta **saber el saldo antes de subir**.
- ~~El acta~~ → leída. Catálogo de entregables extraído arriba. **Y apareció una
  obligación que nadie mencionó: seguros contra accidentes (5.4).**

### Lo que el acta cambió del plan

1. **El saldo de DJ pasa a ser la pieza 1 sin discusión.** La 6.9 convierte el
   exceso en plata devuelta del bolsillo propio.
2. **`fecha_desembolso` está respaldada por el contrato** (7.2), no solo por la
   costumbre.
3. **Un fondo puede durar 4 años** (2 + prórroga de 2). La lógica de «ejecutando»
   tiene que aguantarlo.
4. **Hay dos clases de fecha en el cronograma:** las de la cláusula quinta (requieren
   aprobación) y el resto (solo comunicación). Más la devolución a la ciudadanía,
   que no admite prórroga.
5. **Los seguros contra accidentes son obligatorios** y no estaban en el radar.

### Lo que cambiaron los formatos de informe (16/07)

- **El informe de ejecución es narrativo**, no financiero. Yo lo tenía metido dentro
  de «la rendición»; son dos entregables distintos (5.3.1 vs. el informe económico).
- **Los casos ya son su materia prima**, organizables por etapa sin capturar nada
  nuevo. Es la conexión más barata y más valiosa que apareció hoy.
- **Cine Indígena pide «Formación»** como sección obligatoria → ahí la cantera es
  entregable, no vista opcional.
- **Los formatos varían poco** entre categorías: uno base, con variantes. Igual que
  los entregables y los rubros. Tres veces el mismo patrón — conviene modelarlo una
  sola vez.

### «6 ejecutando» son en realidad tres estados distintos

Tu respuesta del 16/07 sobre los 6 fondos vivos:

> *«Dos están en curso, dos entregamos este año, y los otros con prórroga.»*

La portada dice **«🎬 Fondos en ejecución · 6»**. Tú los ves como **2 + 2 + 2**. El
sistema aplana tres situaciones muy distintas en un número, y las tres piden cosas
diferentes: los de prórroga ya pidieron plazo y lo tienen contado; los de este año
están cerrando —entregables, contador, informe—; los en curso solo hay que no
perderlos de vista.

Lo bueno: **casi todo el dato ya está.** `fecha_prorroga` distingue a los dos con
prórroga hoy mismo. Lo que falta para separar «en curso» de «entregando este año»
es —otra vez— `fecha_desembolso`, porque el plazo se cuenta desde ahí (acta 7.2).

Es la misma forma del error de la mañana: «libre para postular · 1» cuando eran 9.
Un contador que junta cosas que no son la misma cosa.

### El modelo, ya cerrado (16/07)

Con el acta, los 4 informes y los 5 formatos, esto ya no es suposición:

```
FONDO (postulación ganadora)
 ├─ acta ─────── régimen de rendición · entregables (catálogo + extras)
 │               plazo: 2 años DESDE EL DESEMBOLSO (+2 de prórroga)
 │               tope DJ: 10% del estímulo (25% cine indígena)
 │               seguros contra accidentes: obligatorios
 │
 ├─ PRESUPUESTO ── categoría > rubro > ítem
 │                 ítem: unidad («Paquete», «Meses») · cantidad · costo unit.
 │                 dos fuentes: estímulo MINCUL | externa (esta no se rinde)
 │                 dos versiones: postulación (congelada) → reformulado
 │
 ├─ GASTO (comprobante) ── fecha · tipo (tabla SUNAT) · nº · proveedor · RUC
 │                         detalle · moneda + t. de cambio · importe
 │      ├── eje 1: RUBRO      (para el presupuesto)
 │      └── eje 2: ACTIVIDAD  (para el informe económico, máx. 6)
 │
 ├─ DJ ─────────── numerada · descripción · actividad · lugar (origen/destino)
 │                 fecha (día o rango) · importe · firma
 │                 ⚠ tope 10% — lo que se pase, se devuelve (acta 6.9)
 │
 └─ INFORME ────── económico (por actividad, firma un contador)
                   ejecución (narrativo, por etapa ← los casos)
                   ficha técnica · ficha resumen · entregables 5.3.1-5.3.8
```

**El único hueco de dato que queda:** `fecha_desembolso`. Todo lo demás ya está
descrito por los documentos.

**Contestadas el 16/07 — última ronda:**
- ~~Las 6 actividades~~ → **del cronograma de postulación, pero la realidad se va de
  ahí.** *«Un documental está vivo.»* → El eje se anota y se corrige; el sistema
  muestra la deriva, no la impide. *(Restricción de diseño, ver arriba.)*
- ~~Seguros~~ → **sí se toman.** No hay nada que construir.
- ~~El contador~~ → **externo.** Es una dependencia del cierre: sin su firma no hay
  informe económico. Va en el cronograma, no solo en la agenda.
- ~~Intereses~~ → **llegan en los estados de cuenta del banco.** No se calculan: se
  copian al rendir.
- ~~Los 6 fondos~~ → **2 en curso, 2 entregando este año, 2 con prórroga.** *(La
  portada los muestra como uno solo — ver arriba.)*
- ~~El informe de ejecución~~ → **se armaba de las ayudas memoria de todo el
  equipo.** Los casos ya ocuparon ese lugar sin que nadie lo decidiera.

---

## 10. Estado del plan

**Cerrado:** el modelo. Los documentos lo describen entero; no queda nada que
suponer.

**El único hueco de dato:** `fecha_desembolso`. Todo cuelga de ahí (acta 7.2) y no
existe en el sistema.

**Lo urgente de verdad:** nada tiene fecha. Los 2 que entregan este año son lo más
próximo, y para esos lo que sirve no es un módulo nuevo — es la lista de entregables
del acta, que ahora está extraída y se puede revisar a mano.

**Lo primero a construir, cuando termine la migración:** el saldo de DJ. No por
elegante: porque la 6.9 convierte el exceso en plata devuelta del propio bolsillo, y
hoy nadie sabe cuánto queda antes de subir a la puna.

**Lo que NO hay que construir**, y costó varias vueltas averiguarlo: el margen de
los encargos, el aviso de tope al elegir categoría, el flujo de caja por tramos, la
cantera como banco de talento, y cualquier cosa que obligue a un documental a
parecerse a su cronograma.

**Preguntas abiertas:** ninguna bloqueante.
