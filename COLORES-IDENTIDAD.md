# Mapa oficial de colores de identidad — CrewHub+ (KAWSAY)

Tres ejes de color, cada uno con su fuente única en el código. Regla de oro:
**cada color, una cosa** — para que el ojo aprenda con el uso qué significa.
No inventar tonos nuevos a ojo: pedirlos siempre desde su mapa.

---

## Eje 1 · Tipos de caso  → `lib/tipos.ts` (`colorTipo`)

El color del tipo de una publicación (feed, tablero, badges de caso).

| Tipo | Color | Hex |
|------|-------|-----|
| Tarea | verde | `#22c55e` |
| Problema | rojo (alerta) | `#ff4d5e` |
| Consulta | cian | `#06b6d4` |
| Pago | oro / mostaza | `#ca8a04` |
| Idea | lima | `#84cc16` |
| Archivo | índigo | `#6366f1` |
| Aviso | fucsia | `#d946ef` |
| Bitácora | lila | `#c084fc` |
| Conversación | gris (cajón neutro) | `#8b8ba3` |

---

## Eje 2 · Entidades  → `lib/entidades.ts` (`COLOR_ENTIDAD` / `colorEntidad`)

El color de cada tipo de ficha. Son los anclas de identidad más vistos.

| Entidad | Color | Hex |
|---------|-------|-----|
| Proyecto | violeta | `#a78bfa` (`--violet`) |
| Empresa | teal | `#2dd4bf` (`--teal`) |
| Persona | azul | `#3b82f6` (`--blue`) |
| Convocatoria | ámbar | `#f4b400` (`--yellow`) |
| Postulación | verde | `#2ecc71` (`--green`) |
| Equipamiento | naranja | `#ff8c42` |
| Lugar | rosa | `#ec4899` |
| Etiqueta | gris tenue | `--dim` |

---

## Eje 3 · Tipo de proyecto  → `lib/entidades.ts` (`TIPO_COLOR` / `colorTipoProyecto`)

El género de un proyecto. Sus badges siempre van rotulados y en contexto de
proyecto.

| Tipo de proyecto | Color | Hex |
|------------------|-------|-----|
| Documental | teal | `#2dd4bf` |
| Animación | rosa | `#ec4899` |
| Videojuego | azul eléctrico / cian | `#38bdf8` |
| Ficción | violeta | `#a78bfa` |
| Experimental | ámbar | `#f4b400` |
| Gestión cultural | verde | `#2ecc71` |
| Cobertura | naranja | `#f59e0b` |

---

## Estados de postulación  → `lib/resultados.ts` (`colorEstadoPost`)

Para el refuerzo tenue por RESULTADO (borde + degradado de la tarjeta) y el chip
de estado. Usan los mismos anclas que las entidades:

| Estado | Color |
|--------|-------|
| En preparación | violeta `--violet` |
| Enviada | azul `--blue` |
| Apta | teal `--teal` |
| No apta | rojo `--red` |
| Finalista / finalista no ganadora | ámbar `--yellow` |
| Ganadora | verde `--green` |
| No seleccionada / retirada | gris `--dim` |

---

## Neutrales / estructura (no son identidad)

- **Línea de tiempo del cronograma** (`RielHitos`): blancos y grises — HOY gris,
  hitos cumplidos gris, próximo hito casi blanco. La cronología es estructura,
  no compite en color.
- **Rojo de urgencia** de fechas (≤2 días): rojo TENUE `#e88a91` (no el rojo
  pleno de «problema»).
- Fondos/bordes: `--bg`, `--card`, `--border`, `#1c1c2c`, `--muted`, `--dim`.
- Acento estructural (botones/focus): `--accent` `#7c5cff`.

---

## Residuales aceptados (colisiones «suaves»)

La paleta no da para 22 tonos únicos y bien distinguibles sin inventar tonos casi
iguales, así que se dejan a propósito estas reutilizaciones que NO confunden en
la práctica:

- **Verde**: tarea (caso) ≈ postulación (entidad) — ambos significan «positivo».
- **Varios tipos de proyecto reusan el ancla de una entidad** (documental=teal,
  ficción=violeta, experimental=ámbar, gestión cultural=verde): los badges de
  tipo de proyecto siempre van rotulados y solo aparecen en contexto de
  proyecto, así que no se confunden con la entidad.
- **Fucsia** (aviso) roza el **rosa** (lugar/animación), pero «lugar» es raro.
- **Tipos de jornada** (`lib/jornadas.ts`, `TIPOS_JORNADA.tono` → `.jr-tipo.t-*`)
  reusan tres anclas, cada uno con un vínculo real: rodaje = violeta
  (*proyecto*: un rodaje siempre es de uno), oficina = teal (*empresa*: la
  oficina es de la empresa), scouting = rosa (*lugar*: se sale a buscar
  lugares). **No son un cuarto eje**: van al 8 % de opacidad de fondo y 22 % de
  borde, con el texto en gris. Un velo no compite con un badge pleno, y por eso
  no rompen la regla de «cada color, una cosa» — subirles la saturación sí lo
  haría.

Videojuego (tipo de proyecto) ya NO comparte el azul de persona: pasó a
`#38bdf8`.
