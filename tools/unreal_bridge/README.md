# Pont Unreal

Exécuter du Python **dans un éditeur Unreal ouvert**, depuis un terminal.

```
python3 tools/unreal_bridge/bridge.py ping
python3 tools/unreal_bridge/bridge.py run-script unreal/Content/Python/healthcheck.py
python3 tools/unreal_bridge/bridge.py run-job tools/unreal_bridge/jobs/build_test_arena.json
python3 tools/unreal_bridge/bridge.py run --eval "unreal.SystemLibrary.get_engine_version()"
```

Aucune dépendance : Python 3.8 et la bibliothèque standard.

## Deux façons de lancer un travail

Le pont parle à un éditeur **déjà ouvert**. C'est pratique quand on travaille
dedans — et inutilisable quand il est fermé, ce qui est le cas juste après
`tools/unreal/ultimate_setup_macos.sh`, qui compile puis quitte.

D'où un second lanceur, qui prend **le même fichier de travail** et le donne à
`UnrealEditor-Cmd -ExecutePythonScript`, comme le reste des scripts du projet :

| Situation | Commande |
| --- | --- |
| L'éditeur est ouvert | `python3 tools/unreal_bridge/bridge.py run-job <travail>` |
| L'éditeur est fermé | `python3 tools/unreal_bridge/run_local.py <travail>` |

`run_local.py` trouve le moteur comme les scripts `tools/unreal/*.sh`
(`UE_ENGINE_ROOT`, puis la version la plus récente sous
`/Users/Shared/Epic Games/UE_*`) et le projet sous `unreal/*.uproject`.
`--dry-run` montre la ligne de commande exacte sans rien lancer.

Il ne passe **pas** `-nullrhi` : la capture de sprites a besoin d'un vrai
rendu, et un moteur sans RHI écrirait des images vides sans le dire.

## Ce que ça n'est pas

> **Le pont n'a jamais parlé à un vrai éditeur Unreal.** Unreal n'est pas
> installable dans l'environnement où ce code a été écrit. Tout ce qui suit est
> vérifié contre un faux éditeur (`tests/fake_editor.py`) qui rejoue le
> protocole, pas contre le moteur d'Epic. La première exécution chez vous est le
> vrai test — signalez ce qui coince.

Le pont ne compile rien, ne lance pas l'éditeur, ne remplace pas l'interface. Il
envoie du code à un éditeur **déjà ouvert** et rapporte ce qu'il en sort.

## Avant de s'en servir, côté éditeur

1. **Extensions** → activer *Python Editor Script Plugin*.
   Pour piloter les assets et les niveaux, activer aussi *Editor Scripting
   Utilities*. Redémarrer l'éditeur.
2. **Paramètres du projet → Plugins → Python** → cocher
   **Enable Remote Execution**.
3. Laisser l'éditeur ouvert, sur la même machine que le terminal : le multicast
   d'Unreal a un TTL de 0 par défaut et ne sort pas de la machine.

## Sur macOS

Un quatrième point, invisible et de loin le plus fréquent : **l'autorisation
« Réseau local »**. Depuis Ventura, macOS jette les paquets multicast d'une
application qui ne l'a pas — sans erreur, sans journal, sans rien. Le pont a
l'air de fonctionner et ne trouve jamais l'éditeur.

*Réglages Système → Confidentialité et sécurité → Réseau local* → activer le
terminal utilisé (Terminal, iTerm, ou l'éditeur de code d'où la commande est
lancée). L'autorisation est demandée à la première tentative ; si vous avez
répondu « Refuser », il faut la rétablir à la main.

`ping --verbose` tranche la question en une ligne :

```
$ python3 tools/unreal_bridge/bridge.py --verbose ping

--- diagnostic ---
système           : darwin (python 3.11.9)
groupe multicast  : 239.0.0.1:6766 (TTL 0, écoute sur 0.0.0.0)
retour attendu    : 127.0.0.1:6776
adresses locales  : 127.0.0.1, 192.168.1.24
moteur trouvé     : /Users/Shared/Epic Games/UE_5.4/Engine/Plugins/…/remote_execution.py

  envoyé  239.0.0.1:6766         ping             7d648c4a-… (nous)
  reçu    192.168.1.24:6766      ping             7d648c4a-… (nous)

La boucle multicast fonctionne : notre propre ping nous revient.
Le multicast n'est donc pas en cause — c'est l'éditeur qui ne répond pas.
```

Si notre propre ping **ne revient pas**, c'est l'autorisation « Réseau local »
(ou un pare-feu). S'il revient et que l'éditeur reste muet, le problème est
dans les trois points ci-dessus.

Le moteur est cherché tout seul dans `/Users/Shared/Epic Games/UE_*`,
`/Applications/Epic Games/UE_*` et `~/Epic Games/UE_*`, la version la plus
récente d'abord. `--engine-dir` désigne une racine précise — et fait alors
autorité : si elle ne contient pas `remote_execution.py`, le pont utilise son
implémentation embarquée plutôt que de partir en douce vers un autre moteur.

Deux réglages sont là si le défaut ne convient pas : `--group-host` /
`--group-port` (si vous avez changé le groupe multicast dans les paramètres du
projet) et `--bind` (pour forcer l'interface d'écoute).

`bridge.py ping` doit alors afficher une ligne par éditeur :

```
5f1c…  PixelDefense  5.4.4-0+++UE5+Release-5.4  (jl@poste-de-jl)
```

Si rien ne répond, le message d'erreur rappelle ces trois points dans l'ordre.

## Comment ça marche

Le protocole d'exécution distante d'Unreal (version 1, inchangé depuis la 4.23) :

1. le client crie `ping` sur `239.0.0.1:6766` ;
2. chaque éditeur répond `pong` avec sa version et son projet ;
3. le client ouvre une écoute TCP sur `127.0.0.1:6776` et envoie
   `open_connection` avec cette adresse ;
4. **c'est l'éditeur qui se connecte au client** — pas l'inverse ;
5. le client envoie `command`, l'éditeur renvoie `command_result` avec la
   sortie ligne par ligne.

Quand le moteur est trouvable (`--engine-dir`, ou `UE_ENGINE_DIR` /
`UNREAL_ENGINE_DIR` / `UE_ROOT`), `run-script` utilise le `remote_execution.py`
livré par Epic plutôt que notre implémentation : c'est la définition du
protocole, elle ne peut pas diverger. Sinon, l'implémentation embarquée prend
le relais.

## Les travaux (`run-job`)

Un travail est un fichier JSON : une suite d'étapes envoyées dans **une seule
connexion**, dans l'ordre.

```json
{
  "name": "build_test_arena",
  "description": "…",
  "steps": [
    { "name": "Contrôle", "script": "unreal/Content/Python/healthcheck.py",
      "continue_on_error": true },
    { "name": "Arène", "script": "unreal/Content/Python/build_test_arena.py",
      "params": { "tiles_x": 16, "tiles_y": 16 }, "timeout": 300 }
  ]
}
```

| Clé | Rôle |
| --- | --- |
| `script` | chemin d'un fichier Python, relatif à la racine du dépôt |
| `code` | une instruction en ligne, à la place de `script` |
| `eval` | avec `code` : évalue une expression et renvoie sa valeur |
| `params` | dictionnaire déposé dans `JOB_PARAMS` avant l'exécution du script |
| `timeout` | délai de cette étape, en secondes (défaut : `--timeout`, 180 s) |
| `continue_on_error` | poursuivre malgré l'échec de cette étape |

Les chemins et la syntaxe JSON sont vérifiés **avant** d'ouvrir la connexion :
une faute de frappe se voit tout de suite, pas au milieu d'un travail commencé.

`params` est injecté sur **une seule ligne** en tête du fichier : les numéros de
ligne des traces d'erreur sont décalés de 1, et pas davantage.

Codes de sortie : `0` tout va bien, `1` au moins une étape a échoué, `2` le pont
n'a pas pu travailler (aucun éditeur, fichier introuvable, JSON invalide).

## Scripts livrés

| Fichier | Ce qu'il fait |
| --- | --- |
| [`unreal/Content/Python/healthcheck.py`](../../unreal/Content/Python/healthcheck.py) | Ne modifie rien. Version du moteur, projet ouvert, sous-systèmes d'édition disponibles. Sort en erreur s'il manque une capacité. |
| [`unreal/Content/Python/build_test_arena.py`](../../unreal/Content/Python/build_test_arena.py) | Une dalle, quatre murs, des obstacles, un point de départ, deux lumières, dans `/Game/Maps/TestArena`. |
| [`unreal/Content/Python/export_sprites.py`](../../unreal/Content/Python/export_sprites.py) | Photographie chaque maillage demandé en vue 3/4 orthographique, sur fond plat, et écrit un PNG par figure. |

## Faire des sprites à partir d'un pack

```
# éditeur fermé — le cas le plus courant
python3 tools/unreal_bridge/run_local.py tools/unreal_bridge/jobs/export_sprites.json
node tools/import-textures.mjs <dossier annoncé en fin de travail> --name mon-pack
```

Pas de chemins à relever à la main : chaque figure de
[`jobs/export_sprites.json`](jobs/export_sprites.json) est décrite par des
mots-clés (`match: ["building", "tower"]`) que le moteur résout contre les
packs réellement importés, sous `/Game/ThirdParty` et `/Game/Art`. Le compte
rendu annonce, figure par figure, le maillage retenu et son score :

```
  tower_gun   tower_gun@2.png   trouvé (4 pts) : …/Models/building_tower
```

Corrigez d'après ce qu'il dit — affinez `match`, ajoutez `avoid: ["mage"]`,
ou forcez un chemin avec `asset`. À égalité, le nom le plus court gagne, et un
maillage déjà pris par une autre figure est légèrement pénalisé : deux tours
différentes ne se retrouvent pas avec le même modèle. L'inventaire complet des
assets importés s'obtient avec le travail `production_asset_inventory_09`.

Le moteur photographie sur **fond magenta** ; le détourage, le rognage,
l'atlas et le manifeste se font hors du moteur, où c'est testable. Si votre
matériau de fond n'accepte pas la couleur demandée, le travail le dit : passez
alors la couleur obtenue à `--key r,g,b` à l'import, ou `--no-key` si vos
captures ont déjà leur transparence.

> **La partie capture est la plus incertaine de tout ce dépôt.** Le montage
> `SceneCapture2D` est écrit d'après l'API, jamais exécuté dans un vrai
> éditeur. Chaque opération est isolée et nommée : si quelque chose manque, le
> travail le dit à l'étape près plutôt que de mourir. Envoyez-moi la sortie.
> L'import, lui, marche quelle que soit la façon dont vous produisez les PNG —
> vous pouvez très bien les sortir à la main.

Les deux savent tourner sur UE4 comme sur UE5 : les sous-systèmes (`LevelEditorSubsystem`,
`EditorActorSubsystem`) sont essayés d'abord, `EditorLevelLibrary` sert de
repli. Chaque opération d'édition est isolée : une API absente produit un
avertissement nommé, pas un script mort à mi-chemin.

## Vérifier le pont

```
python3 tools/unreal_bridge/tests/test_bridge.py
```

58 vérifications, sans Unreal : découpage du flux TCP, refus des travaux mal
formés, repérage du moteur sur une arborescence Mac factice, message d'aide
propre à macOS, découverte par multicast, exécution d'un fichier, enchaînement
d'un travail, arrêt sur échec, le contenu exact de l'arène produite (16 acteurs,
le sol à la bonne échelle, le départ sur la bonne tuile), et la chaîne complète
des sprites : 26 captures écrites par le doublon, importées par le vrai outil,
jusqu'à la planche que le jeu charge.

En face, deux doublons :

* `tests/fake_editor.py` — rejoue le protocole côté éditeur. Utilisable seul :
  lancez-le dans un terminal, le pont le découvre depuis un autre.
* `tests/fake_unreal.py` — reproduit la *forme* de l'API d'Unreal (les noms, les
  signatures) pour que les scripts s'exécutent vraiment. Il ne reproduit pas le
  moteur.

C'est ce banc qui a attrapé les deux vrais défauts du code : les paramètres
d'un travail étaient injectés avec `json.dumps`, qui écrit `true` — un nom que
Python ne connaît pas, le script tombait à la première ligne ; et un
`--engine-dir` erroné retombait en silence sur une autre installation d'Unreal.
