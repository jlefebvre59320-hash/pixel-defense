extends SceneTree
## Robot d'équilibrage — joue des parties entières sans fenêtre ni rendu.
##
##     godot --headless --script tools/simulate.gd [nombre de parties]
##
## Trois profils sont joués. Un réglage sain se lit ainsi : le profil
## « novice » (des tourelles au hasard, jamais d'amélioration) tombe avant la
## fin, le profil « correct » termine les 20 vagues en gardant des vies.

## Chargé explicitement plutôt que par son nom global : le script doit tourner
## sur un dépôt fraîchement cloné, avant que l'éditeur n'ait indexé le projet.
const SimClass := preload("res://scripts/sim.gd")
const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")

const STEP := 1.0 / 60.0
const MAX_STEPS := 60 * 60 * 40   ## garde-fou : 40 minutes de jeu simulé

var _spots: Array = []


func _initialize() -> void:
	var runs := 3
	var args := OS.get_cmdline_user_args()
	if args.size() > 0 and args[0].is_valid_int():
		runs = int(args[0])

	_spots = _ranked_spots(2.8)

	for profile in ["novice", "correct", "bourrin"]:
		for i in range(runs):
			var r := _play(profile)
			print("%-8s %s" % [profile, JSON.stringify(r)])

	quit()


## Emplacements classés par nombre de cases de chemin couvertes : le choix
## qu'un joueur correct fait d'instinct.
func _ranked_spots(radius: float) -> Array:
	var out: Array = []
	for r in range(Cfg.ROWS):
		for c in range(Cfg.COLS):
			if not MapD.is_buildable(c, r):
				continue
			var cover := 0
			for rr in range(Cfg.ROWS):
				for cc in range(Cfg.COLS):
					if MapD.is_path(cc, rr) and Vector2(cc - c, rr - r).length() <= radius:
						cover += 1
			out.append({"c": c, "r": r, "cover": cover})
	out.sort_custom(func(a, b): return a["cover"] > b["cover"])
	return out


func _free_spots(sim) -> Array:
	var out: Array = []
	for s in _spots:
		if sim.tower_at(s["c"], s["r"]) == null:
			out.append(s)
	return out


func _count(sim, type: String) -> int:
	var n := 0
	for t in sim.towers:
		if t.type == type:
			n += 1
	return n


func _act(sim, profile: String) -> void:
	var free := _free_spots(sim)
	if free.is_empty():
		return
	var best: Dictionary = free[0]

	match profile:
		"novice":
			# Des tourelles, posées n'importe où, jamais améliorées.
			if sim.gold >= int(Cfg.TOWERS["gun"]["cost"]):
				var pick: Dictionary = free[randi() % mini(free.size(), 25)]
				sim.build(pick["c"], pick["r"], "gun")

		"bourrin":
			# Remplit la carte de tours de base : la quantité ne remplace pas
			# la qualité, et la simulation doit le montrer.
			if sim.gold >= 40:
				sim.build(best["c"], best["r"], "gun")

		"correct":
			if sim.gold >= 130 and _count(sim, "tesla") < 3:
				sim.build(best["c"], best["r"], "tesla")
			elif sim.gold >= 80 and _count(sim, "cannon") < 4:
				sim.build(best["c"], best["r"], "cannon")
			elif sim.gold >= 60 and _count(sim, "frost") < 3:
				sim.build(best["c"], best["r"], "frost")
			elif sim.gold >= 40 and sim.towers.size() < 14:
				sim.build(best["c"], best["r"], "gun")
			else:
				var candidates: Array = []
				for t in sim.towers:
					if not Cfg.next_level(t.type, t.level).is_empty():
						candidates.append(t)
				candidates.sort_custom(func(a, b): return a.level < b.level)
				if candidates.size() > 0:
					var up = candidates[0]
					var cost := int(Cfg.next_level(up.type, up.level)["cost"])
					if sim.gold >= cost + 60:
						sim.upgrade(up)


func _play(profile: String) -> Dictionary:
	var sim := SimClass.new()
	sim.phase = SimClass.Phase.PLAYING
	var steps := 0

	while sim.phase == SimClass.Phase.PLAYING and steps < MAX_STEPS:
		steps += 1
		_act(sim, profile)
		if not sim.wave_active:
			sim.call_wave()   # le robot enchaîne les vagues sans attendre
		sim.update(STEP)

	return {
		"issue": "gagné" if sim.phase == SimClass.Phase.WON else "perdu",
		"vague": sim.wave,
		"vies": sim.lives,
		"score": sim.score,
		"tours": sim.towers.size(),
		"or": sim.gold,
		"minutes": snappedf(sim.time / 60.0, 0.1),
	}
