extends RefCounted
## Équilibrage et contenu du jeu — l'unique fichier à toucher pour régler
## la difficulté. Les distances sont en cases, les durées en secondes : jamais
## en pixels ni en images par seconde, pour que le jeu se comporte pareil sur
## un téléphone à 60 Hz et sur un écran à 120 Hz.
##
## Pas d'autoload à dessein : données constantes et fonctions statiques, donc
## utilisables aussi bien par le jeu que par le robot d'équilibrage, qui tourne
## sans arbre de scène.
##
## Vérifier un réglage sans jouer :
##     godot --headless --script tools/simulate.gd

## Plateau au format téléphone.
const COLS := 9
const ROWS := 16
## Résolution d'une case en « pixels d'art » : toute la tuile, sprites compris,
## est dessinée dans cette grille. C'est ce qui garde des pixels carrés et nets.
const ART := 16

const START_GOLD := 130
const START_LIVES := 15

## Répit entre deux vagues. Appeler la vague en avance rembourse le temps
## gagné en or : le joueur pressé est récompensé, le prudent ne perd rien.
const WAVE_BREAK := 15.0
const EARLY_GOLD_PER_SEC := 3

const SPEEDS := [1, 2, 3]

## Points de vie multipliés de 20 % par vague : la vague 20 est cinq fois plus
## dure que la première, sans qu'aucune vague ne double la précédente.
const HP_RAMP := 0.20

const KILL_SCORE := 10
const WAVE_SCORE := 250
const LIFE_SCORE := 300

const SELL_RATIO := 0.6

## --- Tours ------------------------------------------------------------------
## kind : "single" un projectile une cible · "splash" explosion de rayon
## `splash` · "slow" dégâts et ralentissement · "beam" tir instantané qui
## traverse le blindage.
const TOWERS := {
	"gun": {
		"name": "Tourelle",
		"tag": "Polyvalente",
		"desc": "Tir rapide, une cible. Le premier rempart, bon marché.",
		"kind": "single",
		"cost": 40,
		"color": Color("8a93a8"),
		"shot_speed": 11.0,
		"levels": [
			{"dmg": 7, "range": 2.6, "rate": 1.9, "cost": 40},
			{"dmg": 12, "range": 2.8, "rate": 2.2, "cost": 35},
			{"dmg": 19, "range": 3.1, "rate": 2.5, "cost": 70},
		],
	},
	"frost": {
		"name": "Cryo",
		"tag": "Contrôle",
		"desc": "Peu de dégâts, mais fige l'avancée : double le temps sous le feu.",
		"kind": "slow",
		"cost": 60,
		"color": Color("5be3e0"),
		"shot_speed": 9.0,
		"slow": 0.45,
		"slow_for": 1.6,
		"levels": [
			{"dmg": 3, "range": 2.4, "rate": 1.2, "cost": 60},
			{"dmg": 5, "range": 2.7, "rate": 1.4, "cost": 50},
			{"dmg": 8, "range": 3.0, "rate": 1.6, "cost": 95},
		],
	},
	"cannon": {
		"name": "Canon",
		"tag": "Explosif",
		"desc": "Lent, mais l'obus arrose tout un groupe. Idéal contre les nuées.",
		"kind": "splash",
		"cost": 80,
		"color": Color("f2a33c"),
		"shot_speed": 7.0,
		"splash": 1.05,
		"levels": [
			{"dmg": 26, "range": 3.0, "rate": 0.6, "cost": 80},
			{"dmg": 40, "range": 3.2, "rate": 0.68, "cost": 70},
			{"dmg": 62, "range": 3.5, "rate": 0.75, "cost": 130},
		],
	},
	"tesla": {
		"name": "Tesla",
		"tag": "Perce-blindage",
		"desc": "Éclair instantané qui ignore le blindage. La réponse aux Blindés.",
		"kind": "beam",
		"cost": 130,
		"color": Color("a35bd6"),
		"shot_speed": 0.0,
		"ignore_armor": true,
		"levels": [
			{"dmg": 9, "range": 2.7, "rate": 3.2, "cost": 130},
			{"dmg": 14, "range": 2.9, "rate": 3.6, "cost": 110},
			{"dmg": 21, "range": 3.2, "rate": 4.0, "cost": 190},
		],
	},
}

const TOWER_ORDER := ["gun", "frost", "cannon", "tesla"]

## --- Ennemis ----------------------------------------------------------------
## armor : dégâts retirés à chaque coup (jamais moins de 1 encaissé)
## fly   : ignore le chemin, coupe en ligne droite vers la base
## leak  : vies perdues si l'ennemi atteint la base
## size  : rayon de collision, en cases · scale : taille du sprite
const ENEMIES := {
	"crawler": {"name": "Rôdeur", "hp": 42, "speed": 1.55, "reward": 6, "leak": 1, "armor": 0, "size": 0.32, "scale": 1, "fly": false, "boss": false},
	"swarm": {"name": "Essaim", "hp": 20, "speed": 2.25, "reward": 3, "leak": 1, "armor": 0, "size": 0.24, "scale": 1, "fly": false, "boss": false},
	"armored": {"name": "Blindé", "hp": 130, "speed": 0.95, "reward": 13, "leak": 1, "armor": 4, "size": 0.36, "scale": 1, "fly": false, "boss": false},
	"flyer": {"name": "Drone", "hp": 70, "speed": 1.35, "reward": 10, "leak": 1, "armor": 0, "size": 0.32, "scale": 1, "fly": true, "boss": false},
	"boss": {"name": "Colosse", "hp": 1400, "speed": 0.62, "reward": 120, "leak": 5, "armor": 6, "size": 0.62, "scale": 2, "fly": false, "boss": true},
}

## --- Vagues -----------------------------------------------------------------
## Un groupe : {"t": type, "n": nombre, "gap": secondes entre deux, "at": retard}
## Boss aux vagues 10, 15 et 20.
const WAVES := [
	[{"t": "crawler", "n": 8, "gap": 0.9}],
	[{"t": "crawler", "n": 12, "gap": 0.7}],
	[{"t": "swarm", "n": 14, "gap": 0.35}],
	[{"t": "crawler", "n": 10, "gap": 0.6}, {"t": "armored", "n": 2, "gap": 2.0, "at": 4.0}],
	[{"t": "armored", "n": 6, "gap": 1.6}],
	[{"t": "flyer", "n": 6, "gap": 1.0}],
	[{"t": "crawler", "n": 14, "gap": 0.45}, {"t": "flyer", "n": 4, "gap": 1.4, "at": 5.0}],
	[{"t": "armored", "n": 8, "gap": 1.2}, {"t": "swarm", "n": 12, "gap": 0.3, "at": 3.0}],
	[{"t": "flyer", "n": 10, "gap": 0.8}, {"t": "crawler", "n": 10, "gap": 0.5, "at": 2.0}],
	[{"t": "boss", "n": 1, "gap": 1.0}, {"t": "crawler", "n": 12, "gap": 0.6, "at": 3.0}],
	[{"t": "armored", "n": 10, "gap": 1.0}, {"t": "swarm", "n": 16, "gap": 0.25, "at": 4.0}],
	[{"t": "swarm", "n": 24, "gap": 0.22}, {"t": "flyer", "n": 6, "gap": 1.2, "at": 3.0}],
	[{"t": "flyer", "n": 12, "gap": 0.6}, {"t": "armored", "n": 6, "gap": 1.5, "at": 4.0}],
	[{"t": "crawler", "n": 20, "gap": 0.35}, {"t": "armored", "n": 8, "gap": 1.2, "at": 5.0}],
	[{"t": "boss", "n": 1, "gap": 1.0}, {"t": "flyer", "n": 10, "gap": 0.7, "at": 2.0}],
	[{"t": "armored", "n": 14, "gap": 0.8}, {"t": "swarm", "n": 20, "gap": 0.25, "at": 6.0}],
	[{"t": "swarm", "n": 30, "gap": 0.18}, {"t": "flyer", "n": 8, "gap": 1.0, "at": 6.0}],
	[{"t": "armored", "n": 12, "gap": 0.7}, {"t": "crawler", "n": 20, "gap": 0.3, "at": 3.0}],
	[{"t": "flyer", "n": 18, "gap": 0.45}, {"t": "armored", "n": 10, "gap": 1.0, "at": 4.0}],
	[
		{"t": "boss", "n": 3, "gap": 9.0},
		{"t": "armored", "n": 14, "gap": 0.8, "at": 2.0},
		{"t": "swarm", "n": 30, "gap": 0.25, "at": 5.0},
		{"t": "flyer", "n": 12, "gap": 0.6, "at": 12.0},
	],
]

## Prime de fin de vague : elle grandit avec la vague, sinon l'économie
## s'essouffle exactement quand les ennemis grossissent.
static func wave_bonus(wave: int) -> int:
	return 18 + wave * 3


static func tower_level(type: String, level: int) -> Dictionary:
	return TOWERS[type]["levels"][level - 1]


## Niveau suivant d'une tour, ou un dictionnaire vide si elle est au maximum.
static func next_level(type: String, level: int) -> Dictionary:
	var levels: Array = TOWERS[type]["levels"]
	if level >= levels.size():
		return {}
	return levels[level]
