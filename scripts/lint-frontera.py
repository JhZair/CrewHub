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
    """Para no leer un import que solo está mencionado en una explicación."""
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"^\s*//.*$", "", t, flags=re.M)


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
                # ¿Se LLAMA, o solo se renderiza como <Componente />?
                if re.search(r"\b" + re.escape(nombre) + r"\s*\(", crudo):
                    fallos.append((
                        crudo[:m.start()].count("\n") + 1,
                        os.path.relpath(p, RAIZ),
                        f"`{nombre}` se importa de {m.group(2)} —que es "
                        f'"use client"— y se LLAMA aquí, en el servidor',
                        "muévela a lib/, o al archivo que la use de verdad",
                    ))
    return fallos


# ══════════════════════════════════════════════════════════════════════════
#  2 · UNA FUNCIÓN O UN MAP CRUZANDO COMO PROP HACIA UN COMPONENTE CLIENTE
#      Heurística deliberada: solo lo que se ve en el JSX del propio archivo.
# ══════════════════════════════════════════════════════════════════════════

SOSPECHOSO = re.compile(
    r"=\{\s*(?:"
    r"(?:async\s+)?\(?[\w\s,]*\)?\s*=>"        # ctx => …   (a, b) => …
    r"|function\b"                              # function () {}
    r"|new\s+(?:Map|Set|Date|RegExp)\b"        # new Map(…)
    r")"
)


def revisar_props(archivos):
    clientes = {os.path.basename(p).rsplit(".", 1)[0]
                for p in archivos if es_cliente(lee(p))}
    fallos = []
    for p in archivos:
        if es_cliente(lee(p)):
            continue
        txt = sin_comentarios(lee(p))
        crudo = lee(p)
        # cada apertura de etiqueta <Componente … >
        for m in re.finditer(r"<([A-Z]\w*)\b((?:[^<>]|\{[^{}]*\})*?)/?>", txt, re.S):
            if m.group(1) not in clientes:
                continue
            for s in SOSPECHOSO.finditer(m.group(2)):
                attr = m.group(2)[max(0, s.start() - 40):s.start() + 30]
                fallos.append((
                    crudo[:m.start()].count("\n") + 1,
                    os.path.relpath(p, RAIZ),
                    f"<{m.group(1)}> es cliente y recibe algo que no se puede "
                    f"serializar",
                    attr.strip().replace("\n", " ")[:90],
                ))
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
