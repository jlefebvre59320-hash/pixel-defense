extends Node
## Record et préférences, dans user:// — le dossier propre à l'application
## (Android compris). Toute panne d'écriture est absorbée : un score qu'on
## n'arrive pas à enregistrer ne doit jamais interrompre une partie.

const PATH := "user://pixel_defense.cfg"
const SECTION := "jeu"

var best := 0
var best_wave := 0
var won_once := false
var sound := true
var speed := 1


func _ready() -> void:
	load_data()


func load_data() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	best = int(cfg.get_value(SECTION, "best", 0))
	best_wave = int(cfg.get_value(SECTION, "best_wave", 0))
	won_once = bool(cfg.get_value(SECTION, "won_once", false))
	sound = bool(cfg.get_value(SECTION, "sound", true))
	speed = int(cfg.get_value(SECTION, "speed", 1))


func save_data() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value(SECTION, "best", best)
	cfg.set_value(SECTION, "best_wave", best_wave)
	cfg.set_value(SECTION, "won_once", won_once)
	cfg.set_value(SECTION, "sound", sound)
	cfg.set_value(SECTION, "speed", speed)
	cfg.save(PATH)


## Enregistre une fin de partie ; renvoie true si c'est un nouveau record,
## pour que l'écran de fin puisse le fêter.
func finish(score: int, wave: int, won: bool) -> bool:
	var record := score > best
	if record:
		best = score
	if wave > best_wave:
		best_wave = wave
	if won:
		won_once = true
	save_data()
	return record
