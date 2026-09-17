"""Un moteur qui dit non à tout.

`fake_unreal` joue un éditeur coopératif : les API existent et répondent. Ce
module-ci joue l'inverse — une version d'Unreal où rien de ce qu'on demande
n'est disponible. C'est le cas qui arrive pour de vrai : une propriété
renommée entre deux versions, un greffon désactivé, une classe déplacée.

Ce qu'on vérifie avec lui : un script d'éditeur doit *se plaindre à l'étape
près*, pas mourir à la première ligne. Un script qui plante ne dit rien de ce
qui manque, et laisse le projet à moitié modifié.

Toute lecture d'attribut réussit — sinon `getattr(unreal, "X", None)` ne
testerait rien — mais tout appel échoue.
"""


class Hostile:
    def __init__(self, path="unreal"):
        self._path = path

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return Hostile(self._path + "." + name)

    def __call__(self, *args, **kwargs):
        raise RuntimeError("%s : indisponible dans cette version du moteur" % self._path)

    def __repr__(self):
        return "<hostile %s>" % self._path

    # Les scripts testent parfois la vérité d'un objet avant de s'en servir.
    def __bool__(self):
        return True


def install():
    """Renvoie un module `unreal` hostile, prêt pour sys.modules."""
    return Hostile()
