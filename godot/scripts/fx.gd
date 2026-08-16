extends Node2D
## Tout ce qui se dessine mais n'est pas un sprite : barres de vie, portées,
## projectiles, explosions, éclairs, or qui s'envole.
##
## Un seul nœud, un seul _draw() : cent barres de vie ne coûtent pas cent
## nœuds. Les positions sont en pixels d'art, comme le reste du plateau.

const Cfg := preload("res://scripts/config.gd")

const GOLD := Color("ffd84d")
const INK := Color("12131c")
const HP_BACK := Color("20222f")
const HP_GOOD := Color("57c96a")
const HP_BAD := Color("e5484d")

var sim: RefCounted = null
var board: Node2D = null

## Renseignés par main.gd : case choisie et portée à prévisualiser.
var selected := Vector2i(-1, -1)
var selected_is_tower := false
var preview_range := 0.0
var preview_color := Color.WHITE

var _booms: Array = []     ## {pos, radius, life, max}
var _beams: Array = []     ## {from, mid, to, life, max}
var _puffs: Array = []     ## {pos, vel, life, max, color}
var _floats: Array = []    ## {pos, text, color, life, max}


func attach(s: RefCounted, b: Node2D) -> void:
	sim = s
	board = b
	s.explosion.connect(_on_explosion)
	s.beam_fired.connect(_on_beam)
	s.floater.connect(_on_floater)
	s.enemy_died.connect(_on_enemy_died)
	s.enemy_leaked.connect(_on_enemy_died)


func clear() -> void:
	_booms.clear()
	_beams.clear()
	_puffs.clear()
	_floats.clear()


func _process(delta: float) -> void:
	_age(_booms, delta)
	_age(_beams, delta)
	_age(_floats, delta)
	for p in _puffs:
		p["pos"] += p["vel"] * delta
	_age(_puffs, delta)
	queue_redraw()


func _age(list: Array, delta: float) -> void:
	var i := list.size() - 1
	while i >= 0:
		list[i]["life"] -= delta
		if list[i]["life"] <= 0.0:
			list.remove_at(i)
		i -= 1


func _draw() -> void:
	if sim == null:
		return
	var A := float(Cfg.ART)

	# Portée de la tour choisie ou envisagée, puis contour de la case.
	if selected.x >= 0:
		var center := Vector2(selected.x + 0.5, selected.y + 0.5) * A
		if preview_range > 0.0:
			draw_circle(center, preview_range * A, Color(preview_color, 0.13))
			draw_arc(center, preview_range * A, 0, TAU, 48, Color(preview_color, 0.7), 1.0)
		var blink: float = 0.55 + 0.35 * sin(Time.get_ticks_msec() / 220.0)
		var col := Color(GOLD if selected_is_tower else Color.WHITE, blink)
		draw_rect(Rect2(Vector2(selected) * A + Vector2(0.5, 0.5), Vector2(A - 1, A - 1)), col, false, 1.0)

	# Pastilles de niveau : on lit le niveau de chaque tour sans la choisir.
	for t in sim.towers:
		var pips: int = t.level
		var w := 2.0
		var gap := 1.0
		var start: float = t.pos.x * A - (pips * w + (pips - 1) * gap) / 2.0
		for i in range(pips):
			draw_rect(Rect2(start + i * (w + gap), t.pos.y * A + A / 2.0 - 3.5, w, 1.5), GOLD)

	# Ennemis : ombre portée et barre de vie
	for e in sim.enemies:
		var pos: Vector2 = e.pos * A
		var size: float = float(e.def["size"]) * A
		var flying: bool = e.def["fly"]
		var shadow_y: float = pos.y + (A * 0.45 if flying else size * 0.75)
		draw_circle(Vector2(pos.x, shadow_y), size * 0.8, Color(0, 0, 0, 0.25))

		if e.slow_until > sim.time:
			draw_circle(Vector2(pos.x, shadow_y), size * 0.95, Color("5be3e0", 0.35))

		# La barre n'apparaît qu'une fois l'ennemi touché : cent barres pleines
		# à l'écran ne diraient rien à personne.
		if e.hp < e.max_hp:
			var bw: float = maxf(6.0, size * 1.8)
			var bx: float = pos.x - bw / 2.0
			var by: float = pos.y - size - 3.0
			draw_rect(Rect2(bx - 0.5, by - 0.5, bw + 1.0, 2.5), INK)
			draw_rect(Rect2(bx, by, bw, 1.5), HP_BACK)
			var ratio: float = maxf(0.0, e.hp / e.max_hp)
			draw_rect(Rect2(bx, by, bw * ratio, 1.5), HP_GOOD if ratio > 0.35 else HP_BAD)

	# Projectiles
	for s in sim.shots:
		var p: Vector2 = s.pos * A
		match s.kind:
			"splash":
				draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), INK)
				draw_rect(Rect2(p - Vector2(1.5, 1.5), Vector2(3, 3)), Color("f2a33c"))
			"slow":
				draw_rect(Rect2(p - Vector2(1.5, 1.5), Vector2(3, 3)), INK)
				draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), Color("5be3e0"))
			_:
				draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), INK)
				draw_rect(Rect2(p - Vector2(0.5, 0.5), Vector2(1, 1)), GOLD)

	# Explosions
	for b in _booms:
		var k: float = 1.0 - b["life"] / b["max"]
		var col := Color("ffd84d" if k < 0.4 else "f2a33c", 1.0 - k)
		draw_circle(b["pos"] * A, b["radius"] * A * (0.4 + k * 0.8), col)

	# Éclairs : deux coudes tirés une fois et figés — un éclair qui tremble à
	# chaque image donne le mal de mer.
	for b in _beams:
		var k: float = 1.0 - b["life"] / b["max"]
		var col := Color("d8a6ff", 1.0 - k)
		draw_polyline([b["from"] * A, b["mid"] * A, b["to"] * A], col, 1.6)

	# Poussière
	for p in _puffs:
		var k: float = 1.0 - p["life"] / p["max"]
		draw_rect(Rect2(p["pos"] * A - Vector2(1, 1) * (0.5 + k), Vector2.ONE * (1.0 + k * 2.0)), Color(p["color"], (1.0 - k) * 0.9))

	# Textes volants (or gagné, vies perdues). Ils sont dessinés à l'échelle de
	# l'écran, sinon la police, agrandie avec le plateau, deviendrait floue.
	var font := ThemeDB.fallback_font
	var s: float = board.view_scale if board != null else 1.0
	for f in _floats:
		var k: float = f["life"] / f["max"]
		var at: Vector2 = f["pos"] * A * s + Vector2(0, -(1.0 - k) * A * 0.8 * s)
		draw_set_transform(at, 0.0, Vector2.ONE / s)
		var text: String = f["text"]
		var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		draw_string(font, Vector2(-width / 2.0, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(f["color"], minf(1.0, k * 1.6)))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _on_explosion(at: Vector2, radius: float) -> void:
	_booms.append({"pos": at, "radius": radius, "life": 0.32, "max": 0.32})


func _on_beam(from: Vector2, to: Vector2) -> void:
	var mid := (from + to) / 2.0 + Vector2(randf() - 0.5, randf() - 0.5) * 0.6
	_beams.append({"from": from, "mid": mid, "to": to, "life": 0.12, "max": 0.12})


func _on_floater(at: Vector2, text: String, color: Color) -> void:
	_floats.append({"pos": at, "text": text, "color": color, "life": 1.0, "max": 1.0})


func _on_enemy_died(e) -> void:
	var n: int = 14 if e.def["boss"] else 6
	for i in range(n):
		_puffs.append({
			"pos": e.pos + Vector2(randf() - 0.5, randf() - 0.5) * 0.5,
			"vel": Vector2(randf() - 0.5, -0.6 - randf()) * 1.2,
			"color": Color("eef1f7") if randf() > 0.5 else Color("8a93a8"),
			"life": 0.4, "max": 0.4,
		})
