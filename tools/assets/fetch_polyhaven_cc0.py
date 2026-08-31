#!/usr/bin/env python3
"""Download a tiny, mobile-sized CC0 Poly Haven set through the public API."""
from __future__ import annotations
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / "unreal" / "ExternalAssets" / "PolyHaven"
API = "https://api.polyhaven.com/files/{}"
HEADERS = {
    "User-Agent": "PixelDefense3D-AssetFetcher/1.0",
    "Referer": "https://github.com/jlefebvre59320-hash/pixel-defense",
}
ASSETS = {
    "kloofendal_48d_partly_cloudy_puresky": [
        ("environment", ("1k", ".hdr")),
    ],
    "leafy_grass": [
        ("diffuse", ("1k", "diff")),
        ("normal", ("1k", "nor_gl")),
        ("roughness", ("1k", "rough")),
    ],
    "grass_path_3": [
        ("diffuse", ("1k", "diff")),
        ("normal", ("1k", "nor_gl")),
        ("roughness", ("1k", "rough")),
    ],
    "noon_grass": [("environment", ("1k", ".hdr"))],
    "forrest_ground_01": [
        ("diffuse", ("1k", "diff")),
        ("normal", ("1k", "nor_gl")),
        ("roughness", ("1k", "rough")),
    ],
    "grass_path_2": [
        ("diffuse", ("1k", "diff")),
        ("normal", ("1k", "nor_gl")),
        ("roughness", ("1k", "rough")),
    ],
}


def curl_args(url: str) -> list[str]:
    if not shutil.which("curl"):
        raise RuntimeError("curl est requis sur macOS pour télécharger les assets")
    args = [
        "curl",
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "3",
        "--connect-timeout",
        "30",
        "--max-time",
        "180",
    ]
    for name, value in HEADERS.items():
        args.extend(["--header", f"{name}: {value}"])
    args.append(url)
    return args


def request_json(url: str):
    result = subprocess.run(
        curl_args(url),
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return json.loads(result.stdout.decode("utf-8"))


def url_candidates(node, path=""):
    found = []
    if isinstance(node, dict):
        url = node.get("url")
        if isinstance(url, str) and url.startswith("http"):
            found.append((path.lower(), url))
        for key, value in node.items():
            found.extend(url_candidates(value, f"{path}/{key}"))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.extend(url_candidates(value, f"{path}/{index}"))
    return found


def choose(candidates, required):
    scored = []
    for path, url in candidates:
        combined = (path + "/" + url).lower()
        if not all(token.lower() in combined for token in required):
            continue
        extension = pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower()
        if extension not in {".hdr", ".exr", ".jpg", ".jpeg", ".png"}:
            continue
        score = 0
        score += 20 if "/1k/" in combined or "_1k" in combined else 0
        score += 4 if extension in {".hdr", ".jpg", ".png"} else 0
        score -= len(combined) / 10000
        scored.append((score, url))
    if not scored:
        raise RuntimeError("Aucun fichier compatible trouvé pour " + ", ".join(required))
    return max(scored)[1]


def download(url: str, destination: pathlib.Path):
    if destination.exists() and destination.stat().st_size > 1024:
        print(f"Déjà présent: {destination.name}")
        return
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.unlink(missing_ok=True)
    try:
        subprocess.run(
            [*curl_args(url)[:-1], "--output", str(temporary), url],
            check=True,
        )
        if temporary.stat().st_size <= 1024:
            raise RuntimeError(f"fichier téléchargé trop petit: {destination.name}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Téléchargé: {destination.name} ({destination.stat().st_size // 1024} KiB)")


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = {
        "license": "CC0 1.0 Universal",
        "source": "https://polyhaven.com",
        "api_credit": "Powered by Poly Haven",
        "assets": {},
    }
    for asset_id, selections in ASSETS.items():
        print(f"Poly Haven: {asset_id}")
        payload = request_json(API.format(asset_id))
        candidates = url_candidates(payload)
        asset_dir = DEST / asset_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        manifest["assets"][asset_id] = {}
        for role, tokens in selections:
            url = choose(candidates, tokens)
            extension = pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower()
            destination = asset_dir / f"{asset_id}_{role}_1k{extension}"
            download(url, destination)
            digest = hashlib.sha256(destination.read_bytes()).hexdigest()
            manifest["assets"][asset_id][role] = {
                "file": str(destination.relative_to(DEST)),
                "url": url,
                "sha256": digest,
            }
    (DEST / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"POLYHAVEN_FETCH_JSON {json.dumps({'destination': str(DEST), 'assets': len(ASSETS)})}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.decode("utf-8", errors="replace").strip() if exc.stderr else str(exc)
        print(f"Erreur Poly Haven (curl): {details}", file=sys.stderr)
        raise
    except Exception as exc:
        print(f"Erreur Poly Haven: {exc}", file=sys.stderr)
        raise
