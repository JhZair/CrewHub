#!/usr/bin/env python3
"""
COMPROBADOR DE ORDEN DE CLÁUSULAS EN db/*.sql

⚠ POR QUÉ EXISTE. Un `and` de nivel superior colocado ANTES del `where`:

      from proyecto_obra po
       and not exists (...)      ← aquí
     where po.obra_id is null;

Postgres lo rechaza con «syntax error at or near "and"», pero eso solo se
descubre AL CORRERLO — y estas migraciones se corren a mano, en producción, una
por una. El error paró db/clearance-obra.sql a mitad de la serie después de que
la primera ya hubiera pasado.

Nada más lo veía: `tsc` no mira SQL, y en el sandbox no hay Postgres ni parser
para comprobarlo de verdad. Así que esto comprueba la ÚNICA clase de error que
de hecho cometimos, y no pretende ser un analizador de SQL.

Quita comentarios, cadenas y bloques $$…$$ para no despistarse, parte por `;`
de nivel superior y mira si aparece un `and`/`or` a profundidad 0 antes del
primer `where`/`set`/`on`/`having`. Tolera el `and` de `between` y el de `case`.

    python3 scripts/lint-sql.py     → 0 si todo bien, 1 si hay algo mal formado
"""
import re, glob, sys

def sin_comentarios(t):
    """Quita comentarios y cadenas para que no despisten al analizador."""
    out, i, n = [], 0, len(t)
    while i < n:
        if t.startswith("/*", i):
            j = t.find("*/", i+2); i = (j+2) if j>=0 else n; out.append(" ")
        elif t.startswith("--", i):
            j = t.find("\n", i); i = (j) if j>=0 else n
        elif t[i] == "'":
            j = i+1
            while j < n:
                if t[j] == "'" and (j+1>=n or t[j+1] != "'"): break
                j += 2 if (t[j]=="'" and j+1<n and t[j+1]=="'") else 1
            out.append("''"); i = j+1
        elif t.startswith("$$", i) or t.startswith("$q$", i) or t.startswith("$c$", i):
            tag = t[i:i+3] if t.startswith(("$q$","$c$"), i) else "$$"
            j = t.find(tag, i+len(tag)); i = (j+len(tag)) if j>=0 else n; out.append(" ")
        else:
            out.append(t[i]); i += 1
    return "".join(out)

def sentencias(t):
    """Parte por `;` de nivel superior (fuera de paréntesis)."""
    prof, ini, res = 0, 0, []
    for k, ch in enumerate(t):
        if ch == "(": prof += 1
        elif ch == ")": prof -= 1
        elif ch == ";" and prof == 0:
            res.append(t[ini:k]); ini = k+1
    if t[ini:].strip(): res.append(t[ini:])
    return res

def nivel_sup(s):
    """Los tokens de cláusula que están a profundidad 0."""
    prof, toks = 0, []
    for m in re.finditer(r'[()]|\b(select|from|where|and|or|set|values|group|order|having|returning|when|then|else|case|end|insert|update|delete|join|on|using|as|not|exists|into|do|if|loop|declare|begin)\b', s, re.I):
        tk = m.group(0).lower()
        if tk == "(": prof += 1
        elif tk == ")": prof -= 1
        elif prof == 0: toks.append((tk, m.start()))
    return toks

malos = 0
for f in sorted(glob.glob("db/*.sql")):
    limpio = sin_comentarios(open(f, encoding="utf-8").read())
    for s in sentencias(limpio):
        st = s.strip().lower()
        if not st.startswith(("select","insert","update","delete","with")): continue
        if " do " in st[:6] or st.startswith("do"): continue
        toks = [t for t,_ in nivel_sup(s)]
        # EL ERROR: un `and`/`or` de nivel superior ANTES del primer `where`/`set`/`on`
        try: iw = min([toks.index(x) for x in ("where","set","on","having") if x in toks])
        except ValueError: iw = 10**9
        for j, t in enumerate(toks):
            if t in ("and","or") and j < iw:
                # `and` dentro de un `between`/`case` de nivel 0 es legítimo
                antes = toks[max(0,j-4):j]
                if "case" in antes or "when" in antes or "then" in antes: continue
                linea = limpio[:s and limpio.index(s)].count("\n") + s[:[m.start() for m in re.finditer(r'\b(and|or)\b', s, re.I)][0]].count("\n") + 1
                print(f"  ❌ {f}: un `{t}` de nivel superior ANTES del `where`")
                print(f"     {' '.join(toks[:j+2])}")
                malos += 1
                break
print(f"\n  {'✅ ninguna cláusula fuera de orden' if not malos else f'❌ {malos} sentencias mal formadas'}")
sys.exit(1 if malos else 0)
