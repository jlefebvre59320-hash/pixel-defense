# Pixel Defense — Unreal AI Bridge

Ce dossier relie le dépôt GitHub au projet Unreal local. L'idée est simple :
Claude Code ou un humain peut lancer des jobs versionnés dans GitHub, et Unreal
exécute les scripts Python associés dans l'éditeur.

## Pré-requis

- Unreal Engine 5.8 installé ;
- plugins du projet activés : Python Editor Script, Editor Scripting Utilities,
  Remote Control ;
- macOS : pointer `UE_EDITOR` vers l'exécutable Unreal si l'installation n'est
  pas détectée automatiquement.

Exemple :

```bash
export UE_EDITOR="/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
```

## Vérifier Python Unreal

```bash
python3 tools/unreal_bridge/bridge.py run-script unreal/Content/Python/healthcheck.py
```

## Générer l'arène 3D de test

```bash
python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/build_test_arena.json
```

Le job crée `/Game/Maps/AI_TestArena` avec un sol, un chemin en S, huit pads de
tours et des repères de spawn/base. Le script est idempotent : on peut le
relancer après modification.

## Remote Control

Quand Unreal Editor est déjà ouvert avec le serveur Remote Control démarré :

```bash
python3 tools/unreal_bridge/bridge.py remote-info
```

Par défaut, le serveur HTTP Remote Control d'Unreal utilise `127.0.0.1:30010`.
Le port peut être changé avec `UE_REMOTE_HTTP`.

## Workflow Claude Code + ChatGPT

1. Claude Code travaille localement sur le projet et peut exécuter `bridge.py`.
2. Les tâches automatisables sont décrites par des fichiers JSON dans `jobs/`.
3. Les scripts Unreal restent dans `unreal/Content/Python/`, donc ils sont relus
   et versionnés comme du code normal.
4. ChatGPT intervient via GitHub : architecture, scripts, review, PR et jobs.
5. Les `.uasset` générés par Unreal peuvent ensuite être ajoutés au dépôt si on
   décide de les versionner ; les caches/builds restent ignorés.

Le bridge n'expose pas Unreal sur Internet. Les appels Remote Control restent
locaux par défaut, ce qui est volontaire.
