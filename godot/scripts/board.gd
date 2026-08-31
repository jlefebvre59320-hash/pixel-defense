extends Node2D
## Le plateau : la vue du jeu.
##
## Passe 2.5D mobile : le gameplay reste strictement 2D, mais les entités ont
## maintenant une séparation claire entre « sol » et « volume » grâce aux
## ombres aplaties, au léger flottement vertical et à des couches de profondeur.

const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")

@onready var terrain: Sprite2D = $Terrain
@onready var entities: Node2D = $Entities
@onready var fx: Node2D = $Fx

var sim: RefCounted = null
var view_scale := 3.0

const BOARD := Vector2(Cfg.COLS * Cfg.ART, Cfg.ROWS * Cfg.ART)
const SHADOW := Color(0.04, 0.05, 0.08, 0.42)

var _enemy_nodes := {}
var _tower_nodes := {}


func _ready() -> void:
	terrain.texture = Art.terrain()
	terrain.centered = false

	# La base reçoit elle aussi une ombre aplatie : même en pixel art, ce petit
	# décalage suffit à la détacher du sol et donne immédiatement plus de volume.
	var core_root := Node2D.new()
	core_root.position = MapD.CORE_POINT * Cfg.ART
	core_root.z_index = 2

	var core_shadow := Sprite2D.new()
	core_shadow.texture = Art.tinted("core", SHADOW)
	core_shadow.position = Vector2(2.0, 4.0)
	core_shadow.scale = Vector2(1.0, 0.48)
	core_shadow.z_index = -2
	core_root.add_child(core_shadow)

	var core := Sprite2D.new()
	core.texture = Art.texture("core")
	core.position = Vector2(0, -1.0)
	core_root.add_child(core)
	entities.add_child(core_root)


func attach(s: RefCounted) -> void:
	sim = s
	fx.attach(s, self)
	s.enemy_spawned.connect(_on_enemy_spawned)
	s.tower_built.connect(_on_tower_built)
	s.tower_sold.connect(_on_tower_sold)
	s.tower_upgraded.connect(_on_tower_upgraded)


func clear() -> void:
	for id in _enemy_nodes:
		_enemy_nodes[id].queue_free()
	for id in _tower_nodes:
		_tower_nodes[id].queue_free()
	_enemy_nodes.clear()
	_tower_nodes.clear()
	fx.clear()


func fit(rect: Rect2) -> void:
	var raw: float = minf(rect.size.x / BOARD.x, rect.size.y / BOARD.y)
	var stretch: float = maxf(0.01, get_viewport().get_screen_transform().get_scale().x)
	var steps: float = floorf(raw * stretch * 2.0) / 2.0
	view_scale = maxf(0.5, steps / stretch)
	scale = Vector2(view_scale, view_scale)
	position = (rect.position + (rect.size - BOARD * view_scale) / 2.0).round()


func tile_at(screen_pos: Vector2) -> Vector2i:
	var local := (screen_pos - position) / view_scale / float(Cfg.ART)
	return Vector2i(floori(local.x), floori(local.y))


func _process(_delta: float) -> void:
	if sim == null:
		return

	var now := Time.get_ticks_msec() / 1000.0

	for e in sim.enemies:
		var node: Node2D = _enemy_nodes.get(e.id)
		if node == null:
			continue

		node.position = e.pos * Cfg.ART
		# Le z suit grossièrement la hauteur écran : deux unités proches ne se
		# superposent plus de manière « plate ».
		node.z_index = 4 + int(e.pos.y * 2.0)

		var body: Sprite2D = node.get_node("Body")
		var tint: Sprite2D = node.get_node("Tint")
		var shadow: Sprite2D = node.get_node("Shadow")
		var flying: bool = e.def["fly"]
		var frozen: bool = e.slow_until > sim.time

		var bob := sin(now * (3.5 if flying else 5.0) + float(e.id) * 0.7)
		body.position.y = (-4.0 - bob * 1.4) if flying else (-0.7 - absf(bob) * 0.35)
		tint.position = body.position
		# L'ombre reste au sol : le décalage entre ombre et sprite crée la
		# sensation de hauteur, particulièrement lisible pour les drones.
		shadow.position = Vector2(2.0, 4.0 if flying else 2.8)
		shadow.modulate.a = 0.34 if flying else 0.42

		if e.flash > 0.0:
			tint.texture = Art.tinted(e.key, Color.WHITE)
			tint.modulate.a = minf(0.8, e.flash * 8.0)
			tint.visible = true
		elif frozen:
			tint.texture = Art.tinted(e.key, Color("8ff2ee"))
			tint.modulate.a = 0.45
			tint.visible = true
		else:
			tint.visible = false
		body.visible = true

	var alive := {}
	for e in sim.enemies:
		alive[e.id] = true
	for id in _enemy_nodes.keys():
		if not alive.has(id):
			_enemy_nodes[id].queue_free()
			_enemy_nodes.erase(id)

	for t in sim.towers:
		var node: Node2D = _tower_nodes.get(t.id)
		if node == null:
			continue
		node.z_index = 3 + int(t.pos.y * 2.0)
		var head: Sprite2D = node.get_node("Head")
		var glow: Sprite2D = node.get_node("Glow")
		head.rotation = t.angle + PI / 2.0
		glow.rotation = head.rotation

		var recoil: float = 2.0 * minf(1.0, t.flash / 0.09) if t.flash > 0.0 else 0.0
		var idle := sin(now * 2.3 + float(t.id) * 0.37) * 0.25
		head.position = Vector2(-cos(t.angle), -sin(t.angle)) * recoil + Vector2(0, -2.5 + idle)
		glow.position = head.position
		glow.modulate.a = 0.30 + minf(0.45, t.flash * 5.0)


func _on_enemy_spawned(e) -> void:
	var node := Node2D.new()
	node.position = e.pos * Cfg.ART

	var shadow := Sprite2D.new()
	shadow.name = "Shadow"
	shadow.texture = Art.tinted(e.key, SHADOW)
	shadow.scale = Vector2(float(e.def["scale"]) * 0.95, float(e.def["scale"]) * 0.42)
	shadow.position = Vector2(2.0, 3.0)
	shadow.z_index = -2
	node.add_child(shadow)

	var body := Sprite2D.new()
	body.name = "Body"
	body.texture = Art.texture(e.key)
	body.scale = Vector2.ONE * float(e.def["scale"])
	node.add_child(body)

	var tint := Sprite2D.new()
	tint.name = "Tint"
	tint.scale = body.scale
	tint.visible = false
	node.add_child(tint)

	entities.add_child(node)
	_enemy_nodes[e.id] = node


func _on_tower_built(t) -> void:
	var node := Node2D.new()
	node.position = t.pos * Cfg.ART

	var shadow := Sprite2D.new()
	shadow.name = "Shadow"
	shadow.texture = Art.tinted("head_" + t.type, SHADOW)
	shadow.scale = Vector2(1.05, 0.38)
	shadow.position = Vector2(2.2, 4.2)
	shadow.z_index = -3
	node.add_child(shadow)

	var base := Sprite2D.new()
	base.name = "Base"
	base.texture = Art.base_texture()
	base.position = Vector2(0, 1.0)
	node.add_child(base)

	# Un halo très discret derrière la tête donne une lecture « énergie » sans
	# shader coûteux. Il réutilise le sprite déjà en cache et reste pixel-perfect.
	var glow := Sprite2D.new()
	glow.name = "Glow"
	glow.texture = Art.tinted("head_" + t.type, Cfg.TOWERS[t.type]["color"])
	glow.position = Vector2(0, -2.5)
	glow.scale = Vector2.ONE * 1.08
	glow.modulate.a = 0.30
	glow.z_index = 0
	node.add_child(glow)

	var head := Sprite2D.new()
	head.name = "Head"
	head.texture = Art.texture("head_" + t.type)
	head.position = Vector2(0, -2.5)
	head.z_index = 1
	node.add_child(head)

	entities.add_child(node)
	_tower_nodes[t.id] = node


func _on_tower_sold(t) -> void:
	var node: Node2D = _tower_nodes.get(t.id)
	if node != null:
		node.queue_free()
		_tower_nodes.erase(t.id)


func _on_tower_upgraded(t) -> void:
	var node: Node2D = _tower_nodes.get(t.id)
	if node == null:
		return
	# La montée de niveau gagne légèrement en présence visuelle, sans changer
	# la hitbox ni la portée réelle.
	var head: Sprite2D = node.get_node("Head")
	var glow: Sprite2D = node.get_node("Glow")
	var bonus := 1.0 + float(t.level - 1) * 0.035
	head.scale = Vector2.ONE * bonus
	glow.scale = Vector2.ONE * (1.08 + float(t.level - 1) * 0.045)
