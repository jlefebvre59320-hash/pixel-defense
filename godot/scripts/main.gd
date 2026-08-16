extends Node2D
## Assemblage : la boucle, les entrées, les écrans.
##
## C'est le seul script qui connaît à la fois la simulation, le plateau et
## l'interface. Les autres s'ignorent.

const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")
const SimClass := preload("res://scripts/sim.gd")

@onready var board: Node2D = $Board
@onready var ui: CanvasLayer = $UI

var sim: RefCounted = null
var speed := 1
var selected := Vector2i(-1, -1)
var selected_tower = null

var _demo := false
var _demo_time := 0.0
var _demo_step := 0


func _ready() -> void:
	var problems := Art.validate()
	if not problems.is_empty():
		push_warning("Sprites incohérents :\n" + "\n".join(problems))

	speed = SaveData.speed
	Sfx.enabled = SaveData.sound

	ui.wave_pressed.connect(_on_wave_pressed)
	ui.speed_pressed.connect(_on_speed_pressed)
	ui.sound_pressed.connect(_on_sound_pressed)
	ui.pause_pressed.connect(_on_pause_pressed)
	ui.build_requested.connect(_on_build_requested)
	ui.preview_requested.connect(_on_preview_requested)
	ui.upgrade_requested.connect(_on_upgrade_requested)
	ui.sell_requested.connect(_on_sell_requested)
	ui.sheet_closed.connect(_deselect)

	_new_sim()
	if "--demo" in OS.get_cmdline_user_args():
		_demo = true
		_demo_start()
	else:
		_show_title()


func _process(delta: float) -> void:
	board.fit(ui.board_rect())

	if sim.phase == SimClass.Phase.PLAYING:
		# En vitesse ×3, un seul grand pas ferait sauter des collisions : on
		# découpe en tranches d'au plus 20 ms de temps de jeu.
		var total: float = minf(delta, 0.05) * speed
		var steps: int = maxi(1, ceili(total / 0.02))
		for i in range(steps):
			sim.update(total / steps)

	if _demo:
		_demo_advance(delta)

	board.fx.selected = selected
	board.fx.selected_is_tower = selected_tower != null
	ui.sync(speed)


## --- Cycle de vie d'une partie -------------------------------------------------

func _new_sim() -> void:
	sim = SimClass.new()
	board.clear()
	board.attach(sim)
	ui.attach(sim)
	_deselect()

	sim.finished.connect(_on_finished)
	sim.wave_started.connect(_on_wave_started)
	sim.refused.connect(func(_reason): Sfx.play("deny"))
	sim.tower_built.connect(func(_t): Sfx.play("build"))
	sim.tower_upgraded.connect(func(_t): Sfx.play("upgrade"))
	sim.tower_sold.connect(func(_t): Sfx.play("sell"))
	sim.enemy_died.connect(func(_e): Sfx.play("kill", 0.06))
	sim.enemy_leaked.connect(func(_e): Sfx.play("leak", 0.12))
	sim.shot_fired.connect(_on_shot_fired)
	sim.wave_cleared.connect(func(_w, _b): Sfx.play("wave"))


func _start_game() -> void:
	_new_sim()
	sim.phase = SimClass.Phase.PLAYING
	ui.hide_overlay()


func _best_line() -> String:
	if SaveData.best <= 0:
		return "Aucune partie jouée pour l'instant."
	return "Record : %d points · vague %d" % [SaveData.best, SaveData.best_wave]


func _show_title() -> void:
	sim.phase = SimClass.Phase.TITLE
	ui.close_sheet()
	_deselect()
	ui.show_overlay(
		"Tower defense de poche",
		"PIXEL DEFENSE",
		["20 vagues, 4 tours, une base à défendre.", _best_line()],
		[
			{"label": "Jouer", "primary": true, "on_press": _start_game},
			{"label": "Comment jouer", "on_press": _show_help},
		]
	)


func _show_help() -> void:
	ui.show_overlay(
		"Règles",
		"COMMENT JOUER",
		[
			"Appuyez sur une case d'herbe pour bâtir, sur une tour pour l'améliorer ou la revendre (60 % du prix payé).",
			"Les ennemis suivent le chemin — sauf les drones, qui volent tout droit : ne massez pas tout le long du chemin.",
			"Les Blindés encaissent 4 dégâts sur chaque coup : les tirs rapides ne leur font presque rien, la Tesla les traverse.",
			"Appelez la vague en avance : chaque seconde gagnée rapporte 3 ◈.",
			"Clavier : Espace pause · N vague suivante · 1-4 construire · S vitesse.",
		],
		[{"label": "Retour", "primary": true, "on_press": _show_title}]
	)


func _on_finished(won: bool) -> void:
	sim.new_record = SaveData.finish(sim.score, sim.wave, won)
	Sfx.play("win" if won else "lose", 0.0)
	ui.close_sheet()
	_deselect()

	var lines := [
		"Score : %d%s" % [sim.score, "  — nouveau record !" if sim.new_record else ""],
		"Vague %d/%d · %d ennemis abattus · %d tours bâties" % [sim.wave, sim.waves, sim.kills, sim.built],
	]
	if won:
		lines.append("Base intacte : %d vies sauvées, %d ◈ non dépensés." % [sim.lives, sim.gold])
	else:
		lines.append("La base est tombée. Les drones passent par-dessus le chemin — pensez-y au prochain essai.")

	ui.show_overlay(
		"Victoire" if won else "Défaite",
		"BASE TENUE !" if won else "BASE DÉTRUITE",
		lines,
		[
			{"label": "Rejouer", "primary": true, "on_press": _start_game},
			{"label": "Menu", "on_press": _show_title},
		]
	)


func _toggle_pause() -> void:
	if sim.phase == SimClass.Phase.PLAYING:
		sim.phase = SimClass.Phase.PAUSED
		ui.show_overlay(
			"Partie en cours",
			"EN PAUSE",
			["Vague %d/%d · %d vies · %d ◈" % [sim.wave, sim.waves, sim.lives, sim.gold]],
			[
				{"label": "Reprendre", "primary": true, "on_press": _toggle_pause},
				{"label": "Abandonner", "on_press": _show_title},
			]
		)
	elif sim.phase == SimClass.Phase.PAUSED:
		sim.phase = SimClass.Phase.PLAYING
		ui.hide_overlay()


## --- Entrées --------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_tap(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_tap(event.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		_key(event)


func _key(event: InputEventKey) -> void:
	match event.keycode:
		KEY_SPACE:
			if sim.phase in [SimClass.Phase.PLAYING, SimClass.Phase.PAUSED]:
				_toggle_pause()
		KEY_ESCAPE:
			_deselect()
			ui.close_sheet()
		KEY_N:
			_on_wave_pressed()
		KEY_S:
			_on_speed_pressed()
		KEY_1, KEY_2, KEY_3, KEY_4:
			var index: int = event.keycode - KEY_1
			if selected.x >= 0 and selected_tower == null:
				_on_build_requested(Cfg.TOWER_ORDER[index])


func _tap(screen_pos: Vector2) -> void:
	if sim.phase != SimClass.Phase.PLAYING:
		return

	var cell: Vector2i = board.tile_at(screen_pos)
	if not MapD.inside(cell.x, cell.y):
		_deselect()
		ui.close_sheet()
		return

	var tower = sim.tower_at(cell.x, cell.y)
	if tower != null:
		selected = cell
		selected_tower = tower
		var lv: Dictionary = Cfg.tower_level(tower.type, tower.level)
		board.fx.preview_range = float(lv["range"])
		board.fx.preview_color = Cfg.TOWERS[tower.type]["color"]
		ui.show_tower(tower)
		return

	if MapD.is_buildable(cell.x, cell.y):
		selected = cell
		selected_tower = null
		board.fx.preview_range = 0.0
		ui.show_build()
	else:
		_deselect()
		ui.close_sheet()


func _deselect() -> void:
	selected = Vector2i(-1, -1)
	selected_tower = null
	board.fx.preview_range = 0.0
	ui.close_sheet()


## --- Réactions ------------------------------------------------------------------

func _on_wave_pressed() -> void:
	if sim.phase != SimClass.Phase.PLAYING or sim.wave_active:
		return
	var bonus: int = sim.call_wave()
	ui.toast("Vague %d%s" % [sim.wave, " · +%d ◈" % bonus if bonus > 0 else ""])


func _on_speed_pressed() -> void:
	var i: int = Cfg.SPEEDS.find(speed)
	speed = Cfg.SPEEDS[(i + 1) % Cfg.SPEEDS.size()]
	SaveData.speed = speed
	SaveData.save_data()


func _on_sound_pressed() -> void:
	Sfx.set_enabled(not Sfx.enabled)
	if Sfx.enabled:
		Sfx.play("build")


func _on_pause_pressed() -> void:
	_toggle_pause()


func _on_preview_requested(type: String) -> void:
	board.fx.preview_range = float(Cfg.tower_level(type, 1)["range"])
	board.fx.preview_color = Cfg.TOWERS[type]["color"]


func _on_build_requested(type: String) -> void:
	if selected.x < 0 or selected_tower != null:
		return
	if sim.build(selected.x, selected.y, type):
		_deselect()
	else:
		ui.toast("Pas assez d'or" if sim.gold < int(Cfg.TOWERS[type]["cost"]) else "Impossible ici")


func _on_upgrade_requested() -> void:
	if selected_tower == null:
		return
	if sim.upgrade(selected_tower):
		var lv: Dictionary = Cfg.tower_level(selected_tower.type, selected_tower.level)
		board.fx.preview_range = float(lv["range"])
		ui.show_tower(selected_tower)
	else:
		ui.toast("Pas assez d'or")


func _on_sell_requested() -> void:
	if selected_tower == null:
		return
	sim.sell(selected_tower)
	_deselect()


func _on_wave_started(_wave: int, boss: bool) -> void:
	Sfx.play("boss" if boss else "wave", 0.0)


func _on_shot_fired(kind: String) -> void:
	match kind:
		"splash": Sfx.play("cannon", 0.08)
		"slow": Sfx.play("frost", 0.06)
		"beam": Sfx.play("beam", 0.07)
		_: Sfx.play("shoot", 0.055)


## --- Mode démo (outil de développement) -----------------------------------------
## Lancé avec « godot -- --demo », le jeu se joue tout seul : partie démarrée,
## défense posée, vagues appelées. Sert à régénérer les captures d'écran et à
## vérifier le rendu sans manette humaine.
##     godot --write-movie captures/f.png --fixed-fps 30 --quit-after 120 -- --demo

const DEMO_PLAN := [
	[3, 3, "gun"], [5, 4, "cannon"], [2, 4, "gun"], [5, 6, "frost"],
	[3, 10, "gun"], [5, 10, "tesla"], [7, 10, "cannon"], [1, 11, "frost"],
	[3, 13, "gun"], [1, 14, "tesla"],
]


func _demo_start() -> void:
	_start_game()
	sim.gold = 3000
	for spot in DEMO_PLAN:
		sim.build(spot[0], spot[1], spot[2])
	for i in range(sim.towers.size()):
		if i % 2 == 0:
			sim.upgrade(sim.towers[i])
	sim.wave = 8            # on saute directement à une vague garnie
	sim.gold = 260
	speed = 2
	sim.call_wave()


## Déroulé de la démo : on laisse jouer, puis on ouvre le panneau de
## construction, puis la fiche d'une tour — de quoi vérifier tout l'écran.
func _demo_advance(delta: float) -> void:
	_demo_time += delta
	if _demo_step == 0 and _demo_time > 2.5:
		_demo_step = 1
		selected = Vector2i(4, 7)
		selected_tower = null
		ui.show_build()
	elif _demo_step == 2 and _demo_time > 6.5:
		_demo_step = 3
		sim.lives = 0          # on force la fin pour vérifier l'écran de défaite
	elif _demo_step == 1 and _demo_time > 4.5:
		_demo_step = 2
		var t = sim.tower_at(3, 3)
		if t != null:
			selected = Vector2i(3, 3)
			selected_tower = t
			board.fx.preview_range = float(Cfg.tower_level(t.type, t.level)["range"])
			board.fx.preview_color = Cfg.TOWERS[t.type]["color"]
			ui.show_tower(t)
