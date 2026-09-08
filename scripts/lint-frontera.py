#!/usr/bin/env python3
"""
LA FRONTERA SERVIDOR ↔ CLIENTE, COMPROBADA

⚠ POR QUÉ EXISTE.

`"use client"` no marca componentes: marca EL MÓDULO. Cuando un componente de
servidor importa un export nombrado de un módulo cliente, Next no le entrega la
función — le entrega una referencia de cliente, que solo sabe hacer una cosa:

    «Attempted to call normalizar() from the server but normalizar is on the
     client. It's not possible to invoke a client function from the server.»

Y eso tumba la pantalla entera. `tsc` no lo ve: los tipos son impecables.

Pasó con `normalizar`, que nació dentro de `components/ListaClearance.tsx` y la
llamaba también `app/clearance/page.tsx`. La pantalla compilaba limpia y no
cargaba nunca. Se pilló en la revisión previa al commit, no antes.

── LA OTRA MITAD, QUE YA CONOCÍAMOS ──
El sentido contrario también revienta: pasar una FUNCIÓN o un `Map` como prop a
un componente `"use client"`. De eso nos cuidamos desde que nos costó una tarde
—hay tres comentarios en el repo advirtiéndolo—, pero tampoco lo comprobaba
nadie. Va aquí también.

── QUÉ SE PERMITE ──
Un módulo `"use client"` puede exportar hacia el servidor:
  · componentes, que se renderizan como JSX (no se llaman)
  · tipos (`import { type X }` o `import type`), que desaparecen al compilar
Todo lo demás —una función, una constante, un objeto— tiene que vivir en `lib/`.

    python3 scripts/lint-frontera.py    → 0 si todo bien, 1 si hay algo mal
"""

import re, glob, sys, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lee(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def es_cliente(txt):
    """La directiva tiene que ser lo PRIMERO del archivo."""
    for linea in txt.split("\n"):
        s = linea.strip()
        if not s or s.startswith("//") or s.startswith("/*") or s.startswith("*"):
            continue
        return s in ('"use client";', "'use client';", '"use client"', "'use client'")
    return False


def sin_comentarios(t):
    """Para no leer un import que solo está mencionado en una explicación.

    ⚠ CONSERVA LOS SALTOS DE LÍNEA. La primera versión borraba los `/* */`
    enteros, saltos incluidos, y luego los fallos se situaban contando `\n`
    sobre ESE texto: en un repo tan comentado como este el desfase llegaba a
    cien líneas. Un linter que apunta a la línea equivocada manda a leer código
    sano y se deja de usar. Se sustituye cada carácter por un espacio, salvo el
    salto de línea, así que las posiciones siguen valiendo tal cual."""
    def borra(m):
        return "".join(c if c == "\n" else " " for c in m.group(0))
    t = re.sub(r"/\*.*?\*/", borra, t, flags=re.S)
    return re.sub(r"^\s*//.*$", borra, t, flags=re.M)


# ══════════════════════════════════════════════════════════════════════════
#  1 · UN EXPORT NOMBRADO DE UN MÓDULO CLIENTE, LLAMADO EN EL SERVIDOR
# ══════════════════════════════════════════════════════════════════════════

def revisar_importaciones(archivos):
    clientes = {p for p in archivos if es_cliente(lee(p))}
    # `components/Foo.tsx` → el especificador con que lo importan
    alias = {}
    for p in clientes:
        rel = os.path.relpath(p, RAIZ).replace("\\", "/")
        alias["@/" + rel.rsplit(".", 1)[0]] = p

    fallos = []
    for p in archivos:
        if p in clientes:
            continue  # cliente → cliente es legítimo
        txt = sin_comentarios(lee(p))
        crudo = lee(p)
        for m in re.finditer(r'import\s+([^;]+?)\s+from\s+["\']([^"\']+)["\']', txt):
            destino = alias.get(m.group(2))
            if not destino:
                continue
            clausula = m.group(1)
            if clausula.lstrip().startswith("type"):
                continue  # `import type { … }` desaparece al compilar
            llaves = re.search(r"\{(.*?)\}", clausula, re.S)
            if not llaves:
                continue  # solo el default: es el componente, y se renderiza
            for pieza in llaves.group(1).split(","):
                nombre = pieza.strip()
                if not nombre or nombre.startswith("type "):
                    continue
                nombre = re.split(r"\s+as\s+", nombre)[-1].strip()
                if not nombre:
                    continue
                n = re.escape(nombre)
                # ¿Se LLAMA, o solo se renderiza como <Componente />?
                llamada = re.search(r"\b" + n + r"\s*\(", txt)
                # ⚠ Y sin paréntesis: `xs.map(normalizar)` la invoca igual, y la
                #    primera versión solo miraba `nombre(`. Es el mismo fallo,
                #    con la llamada escrita por otro.
                pasada = re.search(
                    r"\.(?:map|filter|forEach|find|some|every|flatMap|sort|reduce)"
                    r"\(\s*" + n + r"\s*[,)]", txt)
                if llamada or pasada:
                    fallos.append((
                        txt[:m.start()].count("\n") + 1,
                        os.path.relpath(p, RAIZ),
                        f"`{nombre}` se importa de {m.group(2)} —que es "
                        f'"use client"— y se '
                        + ("LLAMA" if llamada else "PASA como función")
                        + " aquí, en el servidor",
                        "muévela a lib/, o al archivo que la use de verdad",
                    ))
    return fallos


# ══════════════════════════════════════════════════════════════════════════
#  2 · UNA FUNCIÓN O UN MAP CRUZANDO COMO PROP HACIA UN COMPONENTE CLIENTE
#      Heurística deliberada: solo lo que se ve en el JSX del propio archivo.
# ══════════════════════════════════════════════════════════════════════════

SOSPECHOSO = re.compile(
    # ⚠ Y va precedido de letra, comilla o corchete: un `:` pegado a un `)` es
    # el tipo de retorno de `.map((p: any): UsoItem => …)`, no una clave.
    r"(?<=[\w\"'\]])[=:]\s*\{?\s*(?:"           # prop={…}  o  clave: …
    # ⚠ El paréntesis va CERRADO a propósito: `\(?…\)?` daba por bueno el
    # trozo «: any) =>» de un `xs.map((c: any) => …)`, que es una función
    # LLAMADA aquí mismo y no una función que viaje. Veinte falsos positivos
    # en un linter son un linter apagado.
    r"(?:async\s+)?(?:\([\w\s,:?.\[\]|]*\)|[A-Za-z_$][\w$]*)\s*=>"
    r"|function\b"                              # function () {}
    r"|new\s+(?:Map|Set|Date|RegExp)\b"        # new Map(…)
    r")"
)

def atributos(txt, i):
    """Devuelve (blob_de_props, fin) de la etiqueta que empieza en `i` («<»).

    ⚠ Se escribe a mano porque la expresión regular que había aquí llevaba
    `\{[^{}]*\}` — un solo nivel de llaves. Con eso, `rotulos={{ base: "…" }}`
    NO ENCAJA, y una etiqueta que no encaja no se revisa: el linter decía
    «limpio» sobre una función viajando dentro de un objeto. Se comprobó
    metiendo el fallo de verdad, y pasó.
    Contar llaves es aburrido y es correcto; una expresión regular con llaves
    anidadas no puede serlo."""
    j, prof, comilla = i + 1, 0, ""
    while j < len(txt):
        c = txt[j]
        if comilla:
            if c == comilla:
                comilla = ""
            elif c == "\\":
                j += 1
        elif c in "\"'`":
            comilla = c
        elif c == "{":
            prof += 1
        elif c == "}":
            prof -= 1
        elif prof == 0 and c == ">":
            return txt[i + 1:j], j
        elif prof == 0 and c == "<":
            return None, j          # etiqueta anidada: la de fuera se abandona
        j += 1
    return None, len(txt)


#  Las funciones declaradas en el propio archivo, por su NOMBRE.
#  ⚠ Sin esto, sacar la flecha a una variable esquivaba el linter entero:
#      const rotular = (n: number) => `${n} pelis`;
#      <Cliente rotulos={{ rotular }} />
#  …que es EXACTAMENTE el fallo que este archivo existe para pillar, escrito
#  como lo escribiría alguien ordenado. Se buscan por nombre dentro de las
#  props, y `\b` evita confundir `rotular` con `rotularTodo`.
#  ⚠ Todo el patrón evita el salto de línea a propósito. Con `[^)]*` y `\s*`
#  sueltos, `const repoEmp = (` seguido de cincuenta líneas de JSX encajaba
#  hasta encontrar un `) =>` cualquiera páginas más abajo: 57 falsos positivos,
#  o sea un linter apagado. Una lista de parámetros que no cabe en una línea es
#  bastante rara; un JSX multilínea, no.
FUNCION_LOCAL = re.compile(
    r"\b(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=;\n]*)?=[ \t]*"
    r"(?:async[ \t]+)?(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)[ \t]*=>"
    r"|\bfunction[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(")


def revisar_props(archivos):
    clientes = {os.path.basename(p).rsplit(".", 1)[0]
                for p in archivos if es_cliente(lee(p))}
    fallos = []
    for p in archivos:
        if es_cliente(lee(p)):
            continue
        txt = sin_comentarios(lee(p))
        crudo = lee(p)
        locales = {m.group(1) or m.group(2) for m in FUNCION_LOCAL.finditer(txt)}
        locales.discard(None)
        # cada apertura de etiqueta <Componente … >
        for m in re.finditer(r"<([A-Z]\w*)\b", txt):
            if m.group(1) not in clientes:
                continue
            props, _ = atributos(txt, m.start())
            if props is None:
                continue
            visto = set()
            for s in SOSPECHOSO.finditer(props):
                visto.add(s.start())
                attr = props[max(0, s.start() - 40):s.start() + 30]
                fallos.append((
                    txt[:m.start()].count("\n") + 1,
                    os.path.relpath(p, RAIZ),
                    f"<{m.group(1)}> es cliente y recibe algo que no se puede "
                    f"serializar",
                    attr.strip().replace("\n", " ")[:90],
                ))
            # …y la misma función escondida detrás del nombre de una variable.
            for nom in locales:
                # ⚠ SOLO en las tres formas en que un nombre es un VALOR que
                #    viaja. Buscarlo a secas daba ocho falsos positivos —el
                #    nombre dentro de una plantilla de texto, `dim("3 filas")`
                #    llamada aquí mismo, `xs.map(cardPub)` que también se
                #    ejecuta aquí, y hasta la prop llamada `cuenta=`— y ocho
                #    falsos positivos son un linter que nadie vuelve a mirar.
                #      prop={nom}     ·  { clave: nom }  ·  { nom }
                n = re.escape(nom)
                formas = re.compile(
                    r"=\{\s*" + n + r"\s*\}"
                    r"|:\s*" + n + r"\s*[,}]"
                    r"|[{,]\s*" + n + r"\s*[,}]")
                for h in formas.finditer(props):
                    if any(abs(h.start() - v) < 4 for v in visto):
                        continue
                    fallos.append((
                        txt[:m.start()].count("\n") + 1,
                        os.path.relpath(p, RAIZ),
                        f"<{m.group(1)}> es cliente y recibe `{nom}`, que es "
                        f"una función declarada en este archivo",
                        props[max(0, h.start() - 40):h.start() + 30]
                            .strip().replace("\n", " ")[:90],
                    ))
                    break
    return fallos


def main():
    archivos = [p for pat in ("app/**/*.tsx", "app/**/*.ts",
                              "components/**/*.tsx", "components/**/*.ts")
                for p in glob.glob(os.path.join(RAIZ, pat), recursive=True)]
    fallos = revisar_importaciones(archivos) + revisar_props(archivos)
    for ln, arch, que, detalle in sorted(fallos):
        print(f"  ❌ {arch}:{ln}: {que}")
        if detalle:
            print(f"     {detalle}")
    if fallos:
        print(f"\n  ❌ {len(fallos)} problemas en la frontera servidor/cliente")
    else:
        print(f"\n  ✅ la frontera servidor/cliente está limpia "
              f"en {len(archivos)} archivos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
