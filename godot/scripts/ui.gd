extends CanvasLayer
## L'interface : compteurs, panneau de construction, barre de commandes,
## écrans de fin.
##
## Elle est faite de vrais nœuds Control, pas de dessins dans le plateau :
## le texte reste net à toutes les densités d'écran, les boutons font au moins
## 44 px de haut, et le clavier fonctionne sans rien coder de plus.
## Elle ne décide de rien : elle émet des signaux, main.gd tranche.

const Cfg := preload("res://scripts/config.gd")
const SimClass := preload("res://scripts/sim.gd")

signal wave_pressed
signal speed_pressed
signal sound_pressed
signal pause_pressed
signal build_requested(type: String)
signal preview_requested(type: String)
signal upgrade_requested
signal sell_requested
signal sheet_closed

const INK := Color("eef1f7")
const MUTED := Color("98a0bb")
const PANEL := Color("191c2e")
const PANEL_HI := Color("212540")
const LINE := Color("2b2f45")
const GOLD := Color("ffd84d")
const RED := Color("e5484d")
const CYAN := Color("5be3e0")

@onready var lives_label: Label = $Root/Col/Hud/Lives/Box/Value
@onready var gold_label: Label = $Root/Col/Hud/Gold/Box/Value
@onready var wave_label: Label = $Root/Col/Hud/Wave/Box/Value
@onready var score_label: Label = $Root/Col/Hud/Score/Box/Value
@onready var spacer: Control = $Root/Col/Spacer

@onready var sheet: PanelContainer = $Root/Col/Sheet
@onready var sheet_title: Label = $Root/Col/Sheet/Col/Head/Title
@onready var cards: HBoxContainer = $Root/Col/Sheet/Col/Cards
@onready var info: HBoxContainer = $Root/Col/Sheet/Col/Info
@onready var info_icon: TextureRect = $Root/Col/Sheet/Col/Info/Icon
@onready var info_stats: Label = $Root/Col/Sheet/Col/Info/Stats
@onready var hint: Label = $Root/Col/Sheet/Col/Hint
@onready var actions: HBoxContainer = $Root/Col/Sheet/Col/Actions
@onready var upgrade_button: Button = $Root/Col/Sheet/Col/Actions/Upgrade
@onready var sell_button: Button = $Root/Col/Sheet/Col/Actions/Sell

@onready var wave_button: Button = $Root/Col/Bar/Wave
@onready var speed_button: Button = $Root/Col/Bar/Speed
@onready var sound_button: Button = $Root/Col/Bar/Sound
@onready var pause_button: Button = $Root/Col/Bar/Pause

@onready var overlay: Control = $Overlay
@onready var overlay_kicker: Label = $Overlay/Center/Panel/Col/Kicker
@onready var overlay_title: Label = $Overlay/Center/Panel/Col/Title
@onready var overlay_lines: VBoxContainer = $Overlay/Center/Panel/Col/Lines
@onready var overlay_buttons: VBoxContainer = $Overlay/Center/Panel/Col/Buttons
@onready var toast_box: PanelContainer = $Toast
@onready var toast_label: Label = $Toast/Label

var _sim: RefCounted = null
var _tower = null             ## tour affichée dans le panneau, s'il y en a une
var _toast_timer := 0.0


const HUD_COLORS := {"Lives": RED, "Gold": GOLD, "Wave": CYAN, "Score": MUTED}


func _ready() -> void:
	# Le thème ne descend que le long de l'arbre des Control : les panneaux
	# posés directement sur la couche (écrans pleins, message éphémère) ne sont
	# pas sous $Root, il faut donc le leur donner aussi.
	var ui_theme := _build_theme()
	$Root.theme = ui_theme
	overlay.theme = ui_theme
	toast_box.theme = ui_theme

	overlay_kicker.add_theme_color_override("font_color", CYAN)
	overlay_kicker.add_theme_font_size_override("font_size", 11)
	overlay_title.add_theme_color_override("font_color", GOLD)
	overlay_title.add_theme_font_size_override("font_size", 26)

	for key in HUD_COLORS:
		var name_label: Label = get_node("Root/Col/Hud/%s/Box/Name" % key)
		name_label.add_theme_color_override("font_color", HUD_COLORS[key])
		name_label.add_theme_font_size_override("font_size", 11)
	_style_primary(wave_button)
	_style_primary(upgrade_button)
	sheet.visible = false
	overlay.visible = false
	toast_box.visible = false

	wave_button.pressed.connect(func(): wave_pressed.emit())
	speed_button.pressed.connect(func(): speed_pressed.emit())
	sound_button.pressed.connect(func(): sound_pressed.emit())
	pause_button.pressed.connect(func(): pause_pressed.emit())
	$Root/Col/Sheet/Col/Head/Close.pressed.connect(func(): sheet_closed.emit())
	upgrade_button.pressed.connect(func(): upgrade_requested.emit())
	sell_button.pressed.connect(func(): sell_requested.emit())


func _process(delta: float) -> void:
	if _toast_timer > 0.0:
		_toast_timer -= delta
		if _toast_timer <= 0.0:
			toast_box.visible = false


## --- Habillage ---------------------------------------------------------------

func _box(bg: Color, border: Color, radius := 10) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb


## Un seul thème pour toute l'interface : changer la charte se fait ici, pas
## nœud par nœud.
func _build_theme() -> Theme:
	var th := Theme.new()
	th.default_font_size = 15

	th.set_stylebox("panel", "PanelContainer", _box(PANEL, LINE))

	var normal := _box(PANEL, LINE)
	var hover := _box(PANEL_HI, LINE)
	var pressed := _box(LINE, LINE)
	var disabled := _box(PANEL, LINE)
	disabled.bg_color = Color(PANEL, 0.6)
	for state in [["normal", normal], ["hover", hover], ["pressed", pressed], ["disabled", disabled], ["focus", _box(PANEL, GOLD)]]:
		th.set_stylebox(state[0], "Button", state[1])
	th.set_color("font_color", "Button", INK)
	th.set_color("font_hover_color", "Button", INK)
	th.set_color("font_pressed_color", "Button", GOLD)
	th.set_color("font_disabled_color", "Button", Color(MUTED, 0.6))
	th.set_font_size("font_size", "Button", 14)

	th.set_color("font_color", "Label", INK)
	th.set_font_size("font_size", "Label", 15)
	return th


## Le bouton principal se voit : c'est celui qu'on cherche du pouce.
func _style_primary(b: Button) -> void:
	var gold_box := _box(GOLD, Color("b9950f"))
	b.add_theme_stylebox_override("normal", gold_box)
	b.add_theme_stylebox_override("hover", gold_box)
	b.add_theme_stylebox_override("pressed", _box(Color("e0bd35"), Color("b9950f")))
	var off := _box(Color("6b5c1c"), Color("55480f"))
	b.add_theme_stylebox_override("disabled", off)
	b.add_theme_color_override("font_color", Color("12131c"))
	b.add_theme_color_override("font_hover_color", Color("12131c"))
	b.add_theme_color_override("font_pressed_color", Color("12131c"))
	b.add_theme_color_override("font_disabled_color", Color("2a2410"))


## --- Compteurs ---------------------------------------------------------------

func attach(sim: RefCounted) -> void:
	_sim = sim


func sync(speed: int) -> void:
	if _sim == null:
		return

	lives_label.text = "%d" % _sim.lives
	gold_label.text = "%d" % _sim.gold
	wave_label.text = "%d/%d" % [_sim.wave, _sim.waves]
	score_label.text = "%d" % _sim.score
	lives_label.add_theme_color_override("font_color", RED if _sim.lives <= 4 else INK)

	# Hors partie (menu, fin, aide), les commandes du bas n'ont rien à
	# commander : on les désactive plutôt que de les laisser sans effet.
	var playing: bool = _sim.phase == SimClass.Phase.PLAYING
	var live: bool = playing or _sim.phase == SimClass.Phase.PAUSED

	speed_button.disabled = not live
	pause_button.disabled = not live
	speed_button.text = "×%d" % speed

	if not playing:
		wave_button.disabled = true
		wave_button.text = "Vague %d/%d" % [maxi(1, _sim.wave), _sim.waves]
	elif _sim.wave_active:
		wave_button.disabled = true
		wave_button.text = "Vague %d en cours" % _sim.wave
	elif _sim.wave >= _sim.waves:
		wave_button.disabled = true
		wave_button.text = "Dernière vague"
	elif _sim.break_left < 0.0:
		wave_button.disabled = false
		wave_button.text = "▶ Lancer la première vague" if _sim.wave == 0 else "▶ Vague %d" % (_sim.wave + 1)
	else:
		wave_button.disabled = false
		var bonus: int = _sim.early_bonus()
		var suffix := "  +%d◈" % bonus if bonus > 0 else ""
		wave_button.text = "▶ Vague %d · %ds%s" % [_sim.wave + 1, ceili(_sim.break_left), suffix]

	sound_button.text = "♪" if Sfx.enabled else "♪̸"
	pause_button.text = "▶" if _sim.phase == SimClass.Phase.PAUSED else "❚❚"

	# Ce qui est trop cher se grise en direct : rien n'est plus agaçant qu'un
	# bouton qui accepte le clic pour répondre « pas assez d'or ».
	_refresh_affordance()


func _refresh_affordance() -> void:
	if not sheet.visible or _sim == null:
		return
	for card in cards.get_children():
		var cost: int = card.get_meta("cost", 0)
		card.disabled = cost > _sim.gold
	if _tower != null and upgrade_button.has_meta("cost"):
		upgrade_button.disabled = int(upgrade_button.get_meta("cost")) > _sim.gold


## Place du plateau : tout ce que l'interface ne prend pas.
func board_rect() -> Rect2:
	return spacer.get_global_rect()


## --- Panneau du bas -----------------------------------------------------------

func close_sheet() -> void:
	sheet.visible = false
	_tower = null


func show_build() -> void:
	_tower = null
	sheet.visible = true
	sheet_title.text = "Construire"
	cards.visible = true
	info.visible = false
	actions.visible = false
	hint.text = Cfg.TOWERS[Cfg.TOWER_ORDER[0]]["desc"]

	for child in cards.get_children():
		child.queue_free()

	for type in Cfg.TOWER_ORDER:
		var def: Dictionary = Cfg.TOWERS[type]
		var card := Button.new()
		card.custom_minimum_size = Vector2(0, 104)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.set_meta("cost", int(def["cost"]))
		card.tooltip_text = def["desc"]
		card.add_theme_stylebox_override("normal", _box(PANEL_HI, LINE))

		var col := VBoxContainer.new()
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.set_anchors_preset(Control.PRESET_FULL_RECT)
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		col.add_theme_constant_override("separation", 1)

		var icon := TextureRect.new()
		icon.texture = Art.texture("head_" + type)
		icon.custom_minimum_size = Vector2(36, 36)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		col.add_child(icon)

		col.add_child(_small_label(def["name"], INK, 13))
		col.add_child(_small_label("%d ◈" % int(def["cost"]), GOLD, 14))
		col.add_child(_small_label(def["tag"], MUTED, 10))

		card.add_child(col)
		# Appui = aperçu de la portée, relâchement = construction : le joueur
		# voit ce qu'il achète avant de payer, sans clic supplémentaire.
		card.button_down.connect(func():
			hint.text = def["desc"]
			preview_requested.emit(type))
		card.pressed.connect(func(): build_requested.emit(type))
		cards.add_child(card)

	_refresh_affordance()


func _small_label(text: String, color: Color, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_color_override("font_color", color)
	l.add_theme_font_size_override("font_size", size)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func show_tower(tower) -> void:
	_tower = tower
	sheet.visible = true
	cards.visible = false
	info.visible = true
	actions.visible = true

	var def: Dictionary = Cfg.TOWERS[tower.type]
	var lv: Dictionary = Cfg.tower_level(tower.type, tower.level)
	var next: Dictionary = Cfg.next_level(tower.type, tower.level)

	sheet_title.text = "%s — niveau %d" % [def["name"], tower.level]
	info_icon.texture = Art.texture("head_" + tower.type)

	var rows := [
		["Dégâts", "%d" % int(lv["dmg"]), "" if next.is_empty() else " → %d" % int(next["dmg"])],
		["Portée", "%.1f" % float(lv["range"]), "" if next.is_empty() else " → %.1f" % float(next["range"])],
		["Cadence", "%.1f/s" % float(lv["rate"]), "" if next.is_empty() else " → %.1f/s" % float(next["rate"])],
	]
	var text := ""
	for r in rows:
		text += "%s  %s%s\n" % [r[0], r[1], r[2]]
	info_stats.text = text.strip_edges()

	if next.is_empty():
		upgrade_button.text = "Niveau maximum"
		upgrade_button.disabled = true
		upgrade_button.remove_meta("cost")
	else:
		upgrade_button.text = "Améliorer · %d ◈" % int(next["cost"])
		upgrade_button.set_meta("cost", int(next["cost"]))

	sell_button.text = "Vendre · +%d ◈" % _sim.sell_value(tower)
	hint.text = def["desc"]
	_refresh_affordance()


## --- Écrans pleins -------------------------------------------------------------

func hide_overlay() -> void:
	overlay.visible = false


func show_overlay(kicker: String, title: String, lines: Array, buttons: Array) -> void:
	overlay.visible = true
	overlay_kicker.text = kicker
	overlay_title.text = title

	for child in overlay_lines.get_children():
		child.queue_free()
	for child in overlay_buttons.get_children():
		child.queue_free()

	for line in lines:
		var l := Label.new()
		l.text = line
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.add_theme_color_override("font_color", MUTED)
		l.add_theme_font_size_override("font_size", 13)
		overlay_lines.add_child(l)

	for b in buttons:
		var btn := Button.new()
		btn.text = b["label"]
		btn.custom_minimum_size = Vector2(0, 46)
		if b.get("primary", false):
			_style_primary(btn)
		btn.pressed.connect(b["on_press"])
		overlay_buttons.add_child(btn)


func toast(message: String) -> void:
	toast_label.text = message
	toast_box.visible = true
	_toast_timer = 1.4
