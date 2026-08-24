"""Contrôle de santé — s'exécute *dans* l'éditeur Unreal, via le pont.

    python3 tools/unreal_bridge/bridge.py run-script unreal/Content/Python/healthcheck.py

Ne modifie rien. Répond à une seule question : « est-ce que ce moteur est en
état d'exécuter les scripts du dépôt ? » — version, projet ouvert, extensions
nécessaires, sous-systèmes d'édition disponibles.

Tout est lu défensivement (`getattr`, `try`) : l'API Python d'Unreal bouge
d'une version à l'autre, et un contrôle de santé qui plante n'apprend rien.
"""

import json
import os
import sys

try:
    import unreal
except ImportError:  # exécuté hors de l'éditeur
    unreal = None


def _call(owner, name, *args):
    """Appelle `owner.name(*args)` si elle existe, sinon renvoie None."""
    fn = getattr(owner, name, None)
    if fn is None:
        return None
    try:
        return fn(*args)
    except Exception as err:  # une API absente ne doit pas couler le rapport
        return "<erreur : %s>" % err


def engine_report():
    if unreal is None:
        return {"error": "module `unreal` absent : ce script doit tourner dans l'éditeur."}

    paths = getattr(unreal, "Paths", None)
    system = getattr(unreal, "SystemLibrary", None)

    project_file = _call(paths, "get_project_file_path") or ""
    project_name = os.path.splitext(os.path.basename(project_file))[0] if project_file else None

    return {
        "engine_version": _call(system, "get_engine_version"),
        "project_name": project_name or _call(system, "get_game_name"),
        "project_dir": _call(paths, "project_dir"),
        "engine_dir": _call(paths, "engine_dir"),
        "content_dir": _call(paths, "project_content_dir"),
        "python_version": sys.version.split()[0],
        "python_executable": sys.executable or "<intégré>",
    }


def capabilities():
    """Ce que le pont peut réellement piloter, classe par classe.

    On teste la présence des symboles plutôt que la liste des extensions :
    c'est ce dont les scripts dépendent vraiment.
    """
    if unreal is None:
        return {}

    checks = {
        "EditorLevelLibrary": "Editor Scripting Utilities (héritée, UE4/UE5)",
        "EditorAssetLibrary": "lecture/écriture d'assets",
        "LevelEditorSubsystem": "gestion des niveaux (UE5)",
        "EditorActorSubsystem": "placement d'acteurs (UE5)",
        "StaticMeshActor": "acteurs de maillage statique",
        "AutomationLibrary": "captures et tests automatisés",
    }
    found = {}
    for name, label in checks.items():
        found[name] = {"present": hasattr(unreal, name), "role": label}

    # Les sous-systèmes existent en tant que classes même quand l'éditeur ne les
    # instancie pas : on demande vraiment l'instance.
    getter = getattr(unreal, "get_editor_subsystem", None)
    for name in ("LevelEditorSubsystem", "EditorActorSubsystem"):
        cls = getattr(unreal, name, None)
        if getter and cls is not None:
            try:
                found[name]["instancie"] = getter(cls) is not None
            except Exception:
                found[name]["instancie"] = False
    return found


def main():
    report = {"engine": engine_report(), "capacites": capabilities()}

    engine = report["engine"]
    if "error" in engine:
        print(engine["error"])
        return 1

    print("--- Unreal : contrôle de santé ---")
    print("Moteur          : %s" % engine.get("engine_version"))
    print("Projet          : %s" % engine.get("project_name"))
    print("Dossier projet  : %s" % engine.get("project_dir"))
    print("Python embarqué : %s" % engine.get("python_version"))
    print("")

    manquant = []
    for name, info in sorted(report["capacites"].items()):
        etat = "oui" if info.get("present") else "NON"
        if "instancie" in info:
            etat += " / instanciable : %s" % ("oui" if info["instancie"] else "NON")
        print("  %-22s %-28s %s" % (name, info.get("role", ""), etat))
        if not info.get("present"):
            manquant.append(name)

    print("")
    if manquant:
        print("Manque : %s" % ", ".join(manquant))
        print("Activez « Editor Scripting Utilities » dans Extensions, puis")
        print("redémarrez l'éditeur.")
    else:
        print("Tout est en place : le pont peut piloter cet éditeur.")

    # Ligne machine, pour les scripts qui lisent la sortie du pont.
    print("HEALTHCHECK_JSON " + json.dumps(report, ensure_ascii=False))
    return 0 if not manquant else 1


main()
