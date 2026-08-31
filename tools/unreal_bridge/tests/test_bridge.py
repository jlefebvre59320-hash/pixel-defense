#!/usr/bin/env python3
"""Vérifie le pont de bout en bout, contre le faux éditeur.

    python3 tools/unreal_bridge/tests/test_bridge.py

Le pont est lancé comme le ferait un humain — un vrai sous-processus, la vraie
ligne de commande, le vrai multicast — face au faux éditeur de `fake_editor.py`.
Ce qui est vérifié : la découverte, l'exécution d'un fichier, l'enchaînement
d'un travail, le passage des paramètres, l'arrêt sur échec, et le contenu de
l'arène produite.

Ce qui ne l'est pas : le comportement du vrai moteur. Voir l'avertissement en
tête de `fake_editor.py`.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BRIDGE = HERE.parents[0] / "bridge.py"

sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import bridge as B          # noqa: E402
import fake_unreal          # noqa: E402
from fake_editor import FakeEditor   # noqa: E402

FAILURES = []


def check(label, condition, detail=""):
    mark = "ok  " if condition else "ÉCHEC"
    print("  %s %s%s" % (mark, label, ("" if condition else "  — " + str(detail))))
    if not condition:
        FAILURES.append(label)


def run_bridge(*args, timeout=60):
    proc = subprocess.run(
        [sys.executable, str(BRIDGE), *args],
        cwd=str(ROOT), capture_output=True, text=True, timeout=timeout,
    )
    return proc


# --- Analyse du flux (pas de réseau) -----------------------------------------


def test_stream_parsing():
    print("Découpage du flux TCP")
    a = B._message(B.TYPE_COMMAND_RESULT, "n1", "n2", {"success": True})
    b = B._message(B.TYPE_COMMAND_RESULT, "n1", "n2", {"success": False})

    msg, rest = B._parse_stream(a[:10])
    check("un message coupé n'est pas consommé", msg is None and rest == a[:10])

    msg, rest = B._parse_stream(a + b)
    check("deux messages collés : le premier sort",
          msg is not None and msg["data"]["success"] is True, msg)
    msg2, rest2 = B._parse_stream(rest)
    check("… et le second suit",
          msg2 is not None and msg2["data"]["success"] is False, msg2)
    check("le flux est vidé", rest2.strip() == b"", rest2)

    bogus = json.dumps({"magic": "autre", "version": 1, "type": "command_result"}).encode()
    msg, _ = B._parse_stream(bogus)
    check("un message d'un autre protocole est rejeté", msg is None, msg)


# --- Lecture des travaux (pas de réseau) -------------------------------------


def test_job_validation(tmp: Path):
    print("Lecture des travaux")

    bad = tmp / "sans_steps.json"
    bad.write_text('{"name": "vide"}', encoding="utf-8")
    try:
        B.load_job(bad)
        check("un travail sans étapes est refusé", False, "aucune erreur levée")
    except B.BridgeError as err:
        check("un travail sans étapes est refusé", "steps" in str(err), err)

    both = tmp / "deux.json"
    both.write_text('{"steps": [{"script": "a.py", "code": "1"}]}', encoding="utf-8")
    try:
        B.load_job(both)
        check("« script » et « code » ensemble sont refusés", False, "aucune erreur levée")
    except B.BridgeError:
        check("« script » et « code » ensemble sont refusés", True)

    job_path = ROOT / "tools/unreal_bridge/jobs/build_test_arena.json"
    job = B.load_job(job_path)
    check("le travail livré est valide", len(job["steps"]) == 2, job["steps"])

    code, mode = B.step_code(job["steps"][1], job_path)
    check("les paramètres sont injectés en tête",
          code.startswith("JOB_PARAMS = {"), code[:40])
    check("… sur une seule ligne, pour ne pas décaler les traces",
          code.count("\n", 0, code.index("\n") + 1) == 1)
    check("le mode est ExecuteFile", mode == B.MODE_EXEC_FILE, mode)


# --- Bout en bout, face au faux éditeur --------------------------------------


def test_ping():
    print("Découverte")
    proc = run_bridge("--json", "ping", timeout=30)
    check("ping réussit", proc.returncode == 0, proc.stderr.strip())
    if proc.returncode != 0:
        return
    nodes = json.loads(proc.stdout)
    check("un éditeur exactement est trouvé", len(nodes) == 1, nodes)
    check("il annonce son projet",
          nodes and nodes[0].get("project_name") == "PixelDefense", nodes)


def test_healthcheck():
    print("run-script : contrôle de santé")
    proc = run_bridge("run-script", "unreal/Content/Python/healthcheck.py", timeout=60)
    check("le script s'exécute sans erreur", proc.returncode == 0,
          proc.stderr.strip() or proc.stdout.strip())
    check("la version du moteur est remontée",
          "5.4.4" in proc.stdout, proc.stdout[:200])

    line = next((l for l in proc.stdout.splitlines()
                 if l.startswith("HEALTHCHECK_JSON ")), None)
    check("le rapport machine est présent", line is not None)
    if line:
        report = json.loads(line[len("HEALTHCHECK_JSON "):])
        missing = [k for k, v in report["capacites"].items() if not v["present"]]
        check("toutes les capacités attendues existent dans l'API", not missing, missing)


def test_run_job():
    print("run-job : arène de test")
    fake_unreal.reset()
    proc = run_bridge("run-job", "tools/unreal_bridge/jobs/build_test_arena.json", timeout=120)
    check("le travail se termine sans échec", proc.returncode == 0,
          proc.stderr.strip() or proc.stdout[-400:])
    check("les deux étapes sont annoncées",
          "[1/2]" in proc.stdout and "[2/2]" in proc.stdout, proc.stdout[:200])
    check("aucun avertissement du script d'arène",
          "avertissement" not in proc.stdout, proc.stdout[-400:])

    # 1 sol + 4 murs + 8 obstacles + départ + soleil + ciel
    labels = [a.label for a in fake_unreal.WORLD]
    check("16 acteurs placés", len(labels) == 16, labels)
    check("le sol est là", "Sol" in labels, labels)
    check("les quatre murs sont là",
          sum(1 for l in labels if l.startswith("Mur_")) == 4, labels)
    check("les huit obstacles sont là",
          sum(1 for l in labels if l.startswith("Obstacle_")) == 8, labels)
    check("le point de départ est là", "Depart" in labels, labels)

    sol = next((a for a in fake_unreal.WORLD if a.label == "Sol"), None)
    check("le sol couvre 16 × 200 cm",
          sol is not None and abs(sol.scale.x * 100 - 3200) < 0.01, sol.scale if sol else None)
    check("le sol porte bien le cube du moteur",
          sol is not None and sol.static_mesh_component.static_mesh is not None)
    check("le sol est repassé en mobilité statique",
          sol is not None and sol.static_mesh_component.mobility == "Static")

    depart = next((a for a in fake_unreal.WORLD if a.label == "Depart"), None)
    check("le départ est sur la tuile (1, 1)",
          depart is not None and (depart.location.x, depart.location.y) == (300.0, 300.0),
          depart.location if depart else None)


def test_job_stops_on_failure(tmp: Path):
    print("run-job : arrêt sur échec")
    job = tmp / "casse.json"
    job.write_text(json.dumps({
        "name": "casse",
        "steps": [
            {"name": "boum", "code": "raise RuntimeError('attendu')"},
            {"name": "jamais atteinte", "code": "print('ne doit pas apparaitre')"},
        ],
    }), encoding="utf-8")

    proc = run_bridge("run-job", str(job), timeout=60)
    check("le travail sort en erreur", proc.returncode == 1, proc.returncode)
    check("l'étape suivante n'est pas exécutée",
          "ne doit pas apparaitre" not in proc.stdout, proc.stdout)
    check("l'interruption est annoncée",
          "interrompu" in proc.stderr, proc.stderr.strip())


def test_no_editor(tmp: Path):
    print("Sans éditeur : le message doit être utile")
    proc = subprocess.run(
        [sys.executable, str(BRIDGE), "--discover-timeout", "0.5", "ping", "--timeout", "0.5"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=30,
    )
    check("code de sortie 2", proc.returncode == 2, proc.returncode)
    check("l'explication cite « Enable Remote Execution »",
          "Enable Remote" in proc.stderr, proc.stderr.strip()[:200])



# --- Trouver le moteur d'Epic (pas de réseau) --------------------------------


def test_engine_discovery(tmp: Path):
    print("Repérage du moteur")
    epic = tmp / "Epic Games"
    layouts = {
        "UE_5.1": "Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python",
        "UE_5.4": "Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python",
        # 5.6 a sorti le greffon d'« Experimental » : le balayage doit le suivre.
        "UE_5.6": "Engine/Plugins/Editor/PythonScriptPlugin/Content/Python",
    }
    for version, rel in layouts.items():
        d = epic / version / rel
        d.mkdir(parents=True, exist_ok=True)
        (d / "remote_execution.py").write_text("# %s\n" % version, encoding="utf-8")

    saved_globs = dict(B.ENGINE_ROOT_GLOBS)
    saved_platform = sys.platform
    try:
        B.ENGINE_ROOT_GLOBS["darwin"] = [str(epic / "UE_*")]
        sys.platform = "darwin"

        roots = [r.name for r in B.engine_roots(None)]
        check("les installations du Mac sont trouvées",
              set(roots) == {"UE_5.1", "UE_5.4", "UE_5.6"}, roots)
        check("la version la plus récente passe devant", roots[0] == "UE_5.6", roots)

        module = B.find_engine_module(None)
        check("le greffon déplacé hors d'« Experimental » est trouvé",
              module is not None and "UE_5.6" in str(module), module)

        forced = B.find_engine_module(str(epic / "UE_5.1"))
        check("--engine-dir prime sur la découverte",
              forced is not None and "UE_5.1" in str(forced), forced)

        check("une racine désignée mais sans moteur ne retombe pas ailleurs",
              B.find_engine_module(str(tmp / "nulle-part")) is None,
              B.find_engine_module(str(tmp / "nulle-part")))
    finally:
        B.ENGINE_ROOT_GLOBS.clear()
        B.ENGINE_ROOT_GLOBS.update(saved_globs)
        sys.platform = saved_platform


def _run_as(platform: str, *args):
    """Lance le pont en se faisant passer pour un autre système."""
    code = (
        "import sys;"
        "sys.path.insert(0, %r);"
        "sys.platform = %r;"
        "import bridge;"
        "sys.exit(bridge.main(%r))"
    ) % (str(HERE.parent), platform, list(args))
    return subprocess.run([sys.executable, "-c", code], cwd=str(ROOT),
                          capture_output=True, text=True, timeout=30)


def test_macos_hint():
    print("Message d'aide propre à macOS")
    mac = _run_as("darwin", "ping", "--timeout", "0.5")
    check("l'autorisation « Réseau local » est citée",
          "Réseau local" in mac.stderr, mac.stderr[-300:])
    check("le chemin des réglages est donné",
          "Confidentialité et sécurité" in mac.stderr, mac.stderr[-300:])

    linux = _run_as("linux", "ping", "--timeout", "0.5")
    check("… et pas ailleurs", "Réseau local" not in linux.stderr, linux.stderr[-200:])


def test_verbose_diagnostic():
    print("Diagnostic détaillé")
    proc = run_bridge("--verbose", "ping", "--timeout", "1", timeout=30)
    check("l'écho de notre propre ping est constaté",
          "La boucle multicast fonctionne" in proc.stderr, proc.stderr[-300:])
    check("le groupe multicast est rappelé",
          "239.0.0.1:6766" in proc.stderr, proc.stderr[-300:])
    check("l'absence de moteur est dite",
          "implémentation embarquée" in proc.stderr, proc.stderr[-300:])



def test_export_sprites(tmp: Path):
    """La chaîne entière : le moteur photographie, Node importe, le jeu a sa
    planche. Sans Unreal — le doublon écrit de vrais PNG, et tout ce qui suit
    est le code réel."""
    print("run-job : capture de sprites, puis import")

    caps = tmp / "caps"
    job = json.loads((ROOT / "tools/unreal_bridge/jobs/export_sprites.json").read_text(encoding="utf-8"))
    job["steps"][1]["params"]["out_dir"] = str(caps)
    job_path = tmp / "export_here.json"
    job_path.write_text(json.dumps(job), encoding="utf-8")

    proc = run_bridge("run-job", str(job_path), timeout=180)
    check("le travail se termine sans échec", proc.returncode == 0,
          proc.stderr.strip() or proc.stdout[-400:])

    # Quel maillage chaque figure a-t-elle attrapé ? C'est la question que le
    # premier jet ne posait pas — et deux tours différentes se retrouvaient
    # avec le même modèle sans que rien ne le signale.
    picked = {}
    for line in proc.stdout.splitlines():
        if "trouvé (" not in line:
            continue
        parts = line.split()
        picked.setdefault(parts[0], []).append(parts[-1])

    check("chaque figure a trouvé un maillage",
          len(picked) == 13, sorted(picked))
    check("les personnages viennent des packs KayKit",
          all("KayKit" in v[0] for v in picked.values()), picked.get("crawler"))
    check("les niveaux d'une même tour ont des maillages distincts",
          len(set(picked.get("tower_gun", []))) == 3
          and len(set(picked.get("tower_tesla", []))) == 3,
          {k: picked.get(k) for k in ("tower_gun", "tower_tesla")})
    check("deux tours différentes ne partagent pas un maillage",
          not (set(picked.get("tower_gun", [])) & set(picked.get("tower_tesla", []))),
          {k: picked.get(k) for k in ("tower_gun", "tower_tesla")})
    check("un maillage squelettique est accepté",
          any("Characters" in v[0] for v in picked.values()), picked.get("crawler"))

    written = sorted(p.name for p in caps.glob("*.png")) if caps.exists() else []
    check("26 captures écrites", len(written) == 26, len(written))
    check("le nommage porte la figure et la trame",
          "crawler@0.png" in written and "tower_gun@3.png" in written, written[:4])

    # Deux figures différentes ne doivent pas donner la même image : sinon un
    # habillage entier pourrait être le même sprite répété sans qu'on le voie.
    if len(written) >= 2:
        a = (caps / "crawler@0.png").read_bytes()
        b = (caps / "boss@0.png").read_bytes()
        check("chaque figure a sa propre image", a != b)

    out = tmp / "skins"
    imported = subprocess.run(
        ["node", str(ROOT / "tools/import-textures.mjs"), str(caps),
         "--name", "banc", "--out", str(out)],
        cwd=str(ROOT), capture_output=True, text=True, timeout=120)
    check("l'import réussit", imported.returncode == 0,
          imported.stderr.strip() or imported.stdout[-300:])

    atlas_js = out / "banc" / "atlas.js"
    atlas_png = out / "banc" / "atlas.png"
    check("la planche est écrite", atlas_js.exists() and atlas_png.exists())
    if atlas_js.exists():
        text = atlas_js.read_text(encoding="utf-8")
        for figure in ("crawler", "boss", "tower_gun", "tower_cannon", "core"):
            check("la planche contient « %s »" % figure, '"%s"' % figure in text)
        check("les ancrages sont là", '"ay"' in text and '"sw"' in text)


def main():
    tmp = Path(__file__).resolve().parent / "_tmp"
    tmp.mkdir(exist_ok=True)

    test_stream_parsing()
    test_job_validation(tmp)
    test_engine_discovery(tmp)
    test_no_editor(tmp)       # avant de lancer l'éditeur, forcément
    test_macos_hint()

    print("Démarrage du faux éditeur…")
    editor = FakeEditor().start()
    time.sleep(0.3)
    try:
        test_ping()
        test_verbose_diagnostic()
        test_healthcheck()
        test_run_job()
        test_export_sprites(tmp)
        test_job_stops_on_failure(tmp)
    finally:
        editor.stop()
        shutil.rmtree(tmp, ignore_errors=True)

    print("")
    if FAILURES:
        print("%d vérification(s) en échec : %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("Tout passe.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
