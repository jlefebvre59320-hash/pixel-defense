"""Hotfix runner for medieval_max_pass.py.
Corrige l'ordre des arguments de house() avant exécution sans dupliquer toute la passe.
"""
from pathlib import Path

SOURCE = Path(__file__).with_name("medieval_max_pass.py")
src = SOURCE.read_text(encoding="utf-8")
old = 'for i,p in enumerate(houses): house(i,*p,m)'
new = 'for i,p in enumerate(houses): house(i,p[0],p[1],p[2],m,p[3])'
if old not in src:
    raise RuntimeError("Hotfix attendu introuvable dans medieval_max_pass.py")
src = src.replace(old, new, 1)
namespace = {
    "__name__": "__main__",
    "__file__": str(SOURCE),
}
exec(compile(src, str(SOURCE), "exec"), namespace, namespace)
