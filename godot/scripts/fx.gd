extends Node2D
## FX 2.5D mobile : barres de vie, portées, projectiles, explosions, éclairs,
## particules et textes volants. Tout reste dans un seul _draw() pour garder le
## coût faible sur téléphone, même quand l'écran devient chargé.

const Cfg := preload("res://scripts/config.gd")

const GOLD := Color("ffd84d")
const INK := Color("12131c")
const HP_BACK := Color("20222f")
const HP_GOOD := Color("57c96a")
const HP_BAD := Color("e5484d")
const WHITE := Color("eef1f7")

var sim: RefCounted = null
var board: Node2D = null

var selected := Vector2i(-1, -1)
var selected_is_tower := false
var preview_range := 0.0
var preview_color := Color.WHITE

var _booms: Array = []
var _beams: Array = []
var _puffs: Array = []
var _floats: Array = []


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

	# Sélection / portée : trois couches donnent une impression de projection au
	# sol. Les coins de la case restent plus lisibles qu'un simple rectangle.
	if selected.x >= 0:
		var center := Vector2(selected.x + 0.5, selected.y + 0.5) * A
		if preview_range > 0.0:
			var rr := preview_range * A
			draw_circle(center, rr, Color(preview_color, 0.08))
			draw_arc(center, rr, 0, TAU, 64, Color(INK, 0.45), 2.2)
			draw_arc(center, rr, 0, TAU, 64, Color(preview_color, 0.85), 1.0)
			draw_arc(center, rr * 0.985, 0, TAU, 64, Color(WHITE, 0.18), 0.65)

		var blink: float = 0.68 + 0.22 * sin(Time.get_ticks_msec() / 180.0)
		var col := Color(GOLD if selected_is_tower else WHITE, blink)
		var origin := Vector2(selected) * A
		var m := 2.5
		var l := 4.0
		# quatre équerres plutôt qu'un cadre plein : moins de bruit visuel.
		draw_line(origin + Vector2(m, m), origin + Vector2(m + l, m), col, 1.4)
		draw_line(origin + Vector2(m, m), origin + Vector2(m, m + l), col, 1.4)
		draw_line(origin + Vector2(A - m, m), origin + Vector2(A - m - l, m), col, 1.4)
		draw_line(origin + Vector2(A - m, m), origin + Vector2(A - m, m + l), col, 1.4)
		draw_line(origin + Vector2(m, A - m), origin + Vector2(m + l, A - m), col, 1.4)
		draw_line(origin + Vector2(m, A - m), origin + Vector2(m, A - m - l), col, 1.4)
		draw_line(origin + Vector2(A - m, A - m), origin + Vector2(A - m - l, A - m), col, 1.4)
		draw_line(origin + Vector2(A - m, A - m), origin + Vector2(A - m, A - m - l), col, 1.4)

	# Niveaux des tours : ombre + lumière, minuscules mais beaucoup plus nets.
	for t in sim.towers:
		var pips: int = t.level
		var w := 2.0
		var gap := 1.0
		var start: float = t.pos.x * A - (pips * w + (pips - 1) * gap) / 2.0
		for i in range(pips):
			var at := Vector2(start + i * (w + gap), t.pos.y * A + A / 2.0 - 3.5)
			draw_rect(Rect2(at + Vector2(0.5, 0.7), Vector2(w, 1.5)), Color(INK, 0.55))
			draw_rect(Rect2(at, Vector2(w, 1.5)), GOLD)

	# Ennemis : la vraie ombre de silhouette est maintenant dans board.gd ; ici
	# on garde seulement l'aura d'état et les barres de vie.
	for e in sim.enemies:
		var pos: Vector2 = e.pos * A
		var size: float = float(e.def["size"]) * A
		var flying: bool = e.def["fly"]
		var status_y: float = pos.y + (A * 0.42 if flying else size * 0.68)

		if e.slow_until > sim.time:
			draw_circle(Vector2(pos.x, status_y), size * 1.02, Color("5be3e0", 0.18))
			draw_arc(Vector2(pos.x, status_y), size * 1.02, 0, TAU, 24, Color("8ff2ee", 0.45), 0.8)

		if e.hp < e.max_hp:
			var bw: float = maxf(6.0, size * 1.8)
			var bx: float = pos.x - bw / 2.0
			var by: float = pos.y - size - (6.0 if flying else 3.0)
			draw_rect(Rect2(bx - 1.0, by - 1.0, bw + 2.0, 3.5), Color(INK, 0.85))
			draw_rect(Rect2(bx, by, bw, 1.5), HP_BACK)
			var ratio: float = maxf(0.0, e.hp / e.max_hp)
			var hp_col := HP_GOOD if ratio > 0.35 else HP_BAD
			draw_rect(Rect2(bx, by, bw * ratio, 1.5), hp_col)
			if ratio > 0.05:
				draw_line(Vector2(bx, by), Vector2(bx + bw * ratio, by), Color(WHITE, 0.3), 0.6)

	# Projectiles : chaque tir possède maintenant un noyau lumineux + une aura.
	for s in sim.shots:
		var p: Vector2 = s.pos * A
		match s.kind:
			"splash":
				draw_circle(p, 3.4, Color("f2a33c", 0.16))
				draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), INK)
				draw_rect(Rect2(p - Vector2(1.5, 1.5), Vector2(3, 3)), Color("f2a33c"))
				draw_rect(Rect2(p - Vector2(0.5, 0.5), Vector2(1, 1)), Color("fff0a8"))
			"slow":
				draw_circle(p, 3.0, Color("5be3e0", 0.18))
				draw_rect(Rect2(p - Vector2(1.5, 1.5), Vector2(3, 3)), INK)
				draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), Color("5be3e0"))
			_:
				draw_circle(p, 2.3, Color(GOLD, 0.14))
				draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), INK)
				draw_rect(Rect2(p - Vector2(0.5, 0.5), Vector2(1, 1)), GOLD)

	# Explosions : noyau + anneaux. La surface n'est plus une boule plate.
	for b in _booms:
		var k: float = 1.0 - b["life"] / b["max"]
		var center: Vector2 = b["pos"] * A
		var radius: float = b["radius"] * A * (0.35 + k * 0.85)
		var alpha := 1.0 - k
		draw_circle(center, radius * 0.52, Color("fff2a8", alpha * 0.45))
		draw_circle(center, radius * 0.28, Color("ffffff", alpha * 0.55))
		draw_arc(center, radius, 0, TAU, 40, Color("f2a33c", alpha), 1.8)
		draw_arc(center, radius * 0.72, 0, TAU, 32, Color("ffd84d", alpha * 0.9), 1.0)

	# Tesla : une ligne sombre large sous la ligne claire agit comme une ombre,
	# puis un cœur presque blanc donne le punch électrique.
	for b in _beams:
		var k: float = 1.0 - b["life"] / b["max"]
		var points := PackedVector2Array([b["from"] * A, b["mid"] * A, b["to"] * A])
		var alpha := 1.0 - k
		draw_polyline(points, Color(INK, alpha * 0.7), 3.4)
		draw_polyline(points, Color("a35bd6", alpha), 2.0)
		draw_polyline(points, Color("f1dcff", alpha), 0.8)

	# Poussière / débris
	for p in _puffs:
		var k: float = 1.0 - p["life"] / p["max"]
		var sz := 0.8 + k * 2.2
		draw_rect(Rect2(p["pos"] * A - Vector2.ONE * sz * 0.5, Vector2.ONE * sz), Color(p["color"], (1.0 - k) * 0.9))

	# Textes volants à l'échelle écran.
	var font := ThemeDB.fallback_font
	var s: float = board.view_scale if board != null else 1.0
	for f in _floats:
		var k: float = f["life"] / f["max"]
		var at: Vector2 = f["pos"] * A * s + Vector2(0, -(1.0 - k) * A * 0.8 * s)
		draw_set_transform(at, 0.0, Vector2.ONE / s)
		var text: String = f["text"]
		var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		var a := minf(1.0, k * 1.6)
		# mini ombre de texte pour rester lisible sur le terrain.
		draw_string(font, Vector2(-width / 2.0 + 1.0, 1.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(INK, a * 0.8))
		draw_string(font, Vector2(-width / 2.0, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(f["color"], a))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _on_explosion(at: Vector2, radius: float) -> void:
	_booms.append({"pos": at, "radius": radius, "life": 0.38, "max": 0.38})


func _on_beam(from: Vector2, to: Vector2) -> void:
	var mid := (from + to) / 2.0 + Vector2(randf() - 0.5, randf() - 0.5) * 0.6
	_beams.append({"from": from, "mid": mid, "to": to, "life": 0.14, "max": 0.14})


func _on_floater(at: Vector2, text: String, color: Color) -> void:
	_floats.append({"pos": at, "text": text, "color": color, "life": 1.0, "max": 1.0})


func _on_enemy_died(e) -> void:
	var n: int = 18 if e.def["boss"] else 8
	for i in range(n):
		var warm := randf() > 0.72
		_puffs.append({
			"pos": e.pos + Vector2(randf() - 0.5, randf() - 0.5) * 0.55,
			"vel": Vector2(randf() - 0.5, -0.6 - randf()) * (1.15 + randf() * 0.45),
			"color": Color("ffd84d") if warm else (Color("eef1f7") if randf() > 0.5 else Color("8a93a8")),
			"life": 0.48 + randf() * 0.12, "max": 0.60,
		})
