#!/usr/bin/env python3
"""
COMPROBADOR DE db/*.sql

⚠ POR QUÉ EXISTE, Y POR QUÉ ESTÁ ESCRITO ASÍ.

Estas migraciones se corren a mano, en producción, una por una. Un error de
sintaxis no se descubre hasta que se ejecuta — y para entonces las anteriores de
la serie ya escribieron media base. Pasó tres veces seguidas con `clearance-*`:

    1. `and not exists (…)` colocado entre el `from` y el `where`
       → syntax error at or near "and"
    2. `alter table gestion_contacto` dentro de un `execute format`, ANTES del
       `create table` de esa tabla
       → relation "gestion_contacto" does not exist
    3. un `/*` sin su `*/`
       → unterminated /* comment

`tsc` no mira SQL y en el sandbox no hay Postgres ni parser. Así que hay que
comprobarlo aquí.

── LA LECCIÓN QUE CAMBIÓ EL DISEÑO ──
Las dos primeras versiones de este archivo eran UNA REGLA POR INCIDENTE: se
añadía la comprobación del error que acababa de picar. Y al día siguiente picaba
otro que no estaba en la lista — el tercero se coló por un comprobador escrito
justamente para que no se colara nada.

Una regla por incidente solo protege del pasado. Así que ahora lo primero que se
hace es una comprobación ESTRUCTURAL: recorrer el archivo como un lexer y
verificar que todo lo que abre, cierra —comentarios, cadenas, dólares,
paréntesis—. Eso cubre de golpe una familia entera de errores, incluidos los que
todavía no hemos cometido. Las dos reglas concretas se quedan debajo porque no
son problemas de delimitadores y no las cubre lo anterior.

    python3 scripts/lint-sql.py     → 0 si todo bien, 1 si hay algo mal formado
"""

import re, glob, sys


# ══════════════════════════════════════════════════════════════════════════
#  1 · ESTRUCTURA — que todo lo que abre, cierre
#      Un solo recorrido que es a la vez el lexer que usan las demás reglas.
# ══════════════════════════════════════════════════════════════════════════

def lexer(t):
    """Devuelve (texto sin comentarios ni cadenas, lista de fallos de cierre).

    Recorre carácter a carácter respetando el anidamiento real de SQL. Devolver
    el texto limpio ADEMÁS de los fallos es lo que evita tener dos recorridos
    que puedan discrepar sobre dónde empieza una cadena.
    """
    out, fallos = [], []
    i, n = 0, len(t)
    linea = lambda k: t[:k].count("\n") + 1

    while i < n:
        # ── comentario de bloque ──
        if t.startswith("/*", i):
            ini = i
            # ⚠ Los /* */ de Postgres ANIDAN, a diferencia de los de C. Un
            # comentario que contenga otro y cierre una sola vez sigue abierto.
            prof, j = 1, i + 2
            while j < n and prof:
                if t.startswith("/*", j): prof += 1; j += 2
                elif t.startswith("*/", j): prof -= 1; j += 2
                else: j += 1
            if prof:
                fallos.append((linea(ini), "un `/*` sin su `*/`",
                               t[ini:ini+70].replace("\n", " ")))
                break
            i = j; out.append(" ")

        # ── comentario de línea ──
        elif t.startswith("--", i):
            j = t.find("\n", i)
            i = j if j >= 0 else n

        # ── cadena ──
        elif t[i] == "'":
            ini, j = i, i + 1
            cerrada = False
            while j < n:
                if t[j] == "'":
                    if j + 1 < n and t[j+1] == "'": j += 2; continue
                    cerrada = True; j += 1; break
                j += 1
            if not cerrada:
                fallos.append((linea(ini), "una comilla `'` sin cerrar",
                               t[ini:ini+70].replace("\n", " ")))
                break
            out.append("''"); i = j

        # ── identificador entrecomillado ──
        elif t[i] == '"':
            ini = i
            j = t.find('"', i + 1)
            if j < 0:
                fallos.append((linea(ini), 'una comilla doble `"` sin cerrar',
                               t[ini:ini+70].replace("\n", " ")))
                break
            out.append('"x"'); i = j + 1

        # ── dólar: $$ … $$ y $tag$ … $tag$ ──
        elif t[i] == "$":
            m = re.match(r'\$(\w*)\$', t[i:])
            if m:
                tag, ini = m.group(0), i
                j = t.find(tag, i + len(tag))
                if j < 0:
                    fallos.append((linea(ini), f"un bloque `{tag}` sin cerrar",
                                   t[ini:ini+70].replace("\n", " ")))
                    break
                out.append(" "); i = j + len(tag)
            else:
                out.append(t[i]); i += 1

        else:
            out.append(t[i]); i += 1

    limpio = "".join(out)

    # ── paréntesis, ya sin cadenas ni comentarios que despisten ──
    prof, abierto_en = 0, []
    for k, ch in enumerate(limpio):
        if ch == "(": prof += 1; abierto_en.append(k)
        elif ch == ")":
            prof -= 1
            if abierto_en: abierto_en.pop()
            if prof < 0:
                fallos.append((limpio[:k].count("\n") + 1, "un `)` de más", ""))
                prof = 0
    if prof:
        fallos.append((limpio[:abierto_en[0]].count("\n") + 1,
                       f"{prof} paréntesis sin cerrar", ""))

    return limpio, fallos


# ══════════════════════════════════════════════════════════════════════════
#  2 · ORDEN DE CLÁUSULAS — un `and`/`or` antes del `where`
# ══════════════════════════════════════════════════════════════════════════

def sentencias(t):
    """Parte por `;` de nivel superior (fuera de paréntesis)."""
    prof, ini, res = 0, 0, []
    for k, ch in enumerate(t):
        if ch == "(": prof += 1
        elif ch == ")": prof -= 1
        elif ch == ";" and prof == 0:
            res.append(t[ini:k]); ini = k + 1
    if t[ini:].strip(): res.append(t[ini:])
    return res


def nivel_sup(s):
    """Los tokens de cláusula que están a profundidad 0."""
    prof, toks = 0, []
    pat = (r'[()]|\b(select|from|where|and|or|set|values|group|order|having|'
           r'returning|when|then|else|case|end|insert|update|delete|join|on|'
           r'using|as|not|exists|into|do|if|loop|declare|begin)\b')
    for m in re.finditer(pat, s, re.I):
        tk = m.group(0).lower()
        if tk == "(": prof += 1
        elif tk == ")": prof -= 1
        elif prof == 0: toks.append(tk)
    return toks


def clausulas_fuera_de_orden(limpio):
    fallos = []
    for s in sentencias(limpio):
        st = s.strip().lower()
        if not st.startswith(("select", "insert", "update", "delete", "with")):
            continue
        toks = nivel_sup(s)
        try:
            iw = min(toks.index(x) for x in ("where", "set", "on", "having") if x in toks)
        except ValueError:
            iw = 10**9
        for j, tk in enumerate(toks):
            if tk in ("and", "or") and j < iw:
                # el `and` de `between` y el de `case … when` son legítimos
                if {"case", "when", "then"} & set(toks[max(0, j-4):j]):
                    continue
                fallos.append((0, f"un `{tk}` de nivel superior ANTES del `where`",
                               " ".join(toks[:j+2])))
                break
    return fallos


# ══════════════════════════════════════════════════════════════════════════
#  3 · ORDEN DE TABLAS — un `alter` antes de su `create`
#      Sobre el texto CRUDO, sin quitar cadenas: el caso que picó vivía dentro
#      de un `execute format('alter table %I …')`.
# ══════════════════════════════════════════════════════════════════════════

def tablas_fuera_de_orden(crudo):
    creadas = {}
    for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?', crudo, re.I):
        creadas.setdefault(m.group(1).lower(), m.start())
    fallos = []
    for m in re.finditer(r'alter\s+table\s+(?:if\s+exists\s+)?"?(\w+)"?', crudo, re.I):
        t = m.group(1).lower()
        if t == "only": continue
        if t in creadas and m.start() < creadas[t]:
            fallos.append((crudo[:m.start()].count("\n") + 1,
                           f"`alter table {t}` antes de su `create table`",
                           f"el create está en la línea {crudo[:creadas[t]].count(chr(10)) + 1}"))
    return fallos


# ══════════════════════════════════════════════════════════════════════════

def main():
    malos = 0
    for f in sorted(glob.glob("db/*.sql")):
        crudo = open(f, encoding="utf-8").read()
        limpio, fallos = lexer(crudo)
        # ⚠ Si la estructura está rota, las otras dos reglas leerían basura: el
        # texto «limpio» se cortó donde falló el cierre. Se avisa y se pasa.
        if not fallos:
            fallos = clausulas_fuera_de_orden(limpio)
        fallos += tablas_fuera_de_orden(crudo)
        for ln, que, detalle in fallos:
            donde = f"{f}:{ln}" if ln else f
            print(f"  ❌ {donde}: {que}")
            if detalle: print(f"     {detalle}")
            malos += 1

    print(f"\n  {'✅ los ' + str(len(glob.glob('db/*.sql'))) + ' archivos de db/ están bien formados' if not malos else f'❌ {malos} problemas'}")
    return 1 if malos else 0


if __name__ == "__main__":
    sys.exit(main())
