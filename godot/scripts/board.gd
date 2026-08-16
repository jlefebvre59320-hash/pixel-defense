extends Node2D
## Le plateau : la vue du jeu.
##
## Tout ce qui est ici lit la simulation et ne la modifie jamais. Le repère
## est le « pixel d'art » (une case = 16 unités) ; c'est le nœud lui-même qui
## est mis à l'échelle pour remplir la place laissée par l'interface — d'où
## des pixels carrés à toutes les tailles d'écran.

const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")

@onready var terrain: Sprite2D = $Terrain
@onready var entities: Node2D = $Entities
@onready var fx: Node2D = $Fx

var sim: RefCounted = null
var view_scale := 3.0

const BOARD := Vector2(Cfg.COLS * Cfg.ART, Cfg.ROWS * Cfg.ART)

var _enemy_nodes := {}     ## id de l'ennemi -> Node2D
var _tower_nodes := {}     ## id de la tour  -> Node2D


func _ready() -> void:
	terrain.texture = Art.terrain()
	terrain.centered = false

	# La base à défendre fait partie du décor vivant : on la pose une fois.
	var core := Sprite2D.new()
	core.texture = Art.texture("core")
	core.position = MapD.CORE_POINT * Cfg.ART
	entities.add_child(core)


func attach(s: RefCounted) -> void:
	sim = s
	fx.attach(s, self)
	s.enemy_spawned.connect(_on_enemy_spawned)
	s.tower_built.connect(_on_tower_built)
	s.tower_sold.connect(_on_tower_sold)
	s.tower_upgraded.connect(_on_tower_upgraded)


## Remet le plateau à zéro entre deux parties.
func clear() -> void:
	for id in _enemy_nodes:
		_enemy_nodes[id].queue_free()
	for id in _tower_nodes:
		_tower_nodes[id].queue_free()
	_enemy_nodes.clear()
	_tower_nodes.clear()
	fx.clear()


## Cadre le plateau dans la place disponible. L'échelle avance par demi-pas :
## en dessous, l'arrondi laisserait de larges bandes mortes ; au-dessus, les
## pixels d'art n'auraient plus tous la même taille.
func fit(rect: Rect2) -> void:
	var raw: float = minf(rect.size.x / BOARD.x, rect.size.y / BOARD.y)

	# L'interface est mise à l'échelle par Godot (mode « canvas_items ») : un
	# grossissement rond ici donnerait un grossissement bancal à l'écran, avec
	# des pixels d'art de 3 puis 4 pixels d'appareil. On raisonne donc en
	# pixels d'écran réels, puis on repasse dans le repère du canevas.
	var stretch: float = maxf(0.01, get_viewport().get_screen_transform().get_scale().x)
	var steps: float = floorf(raw * stretch * 2.0) / 2.0
	view_scale = maxf(0.5, steps / stretch)
	scale = Vector2(view_scale, view_scale)
	position = (rect.position + (rect.size - BOARD * view_scale) / 2.0).round()


## Case visée par un appui, en coordonnées d'écran.
func tile_at(screen_pos: Vector2) -> Vector2i:
	var local := (screen_pos - position) / view_scale / float(Cfg.ART)
	return Vector2i(floori(local.x), floori(local.y))


func _process(_delta: float) -> void:
	if sim == null:
		return

	# Ennemis : la vue suit la simulation, elle ne décide de rien.
	for e in sim.enemies:
		var node: Node2D = _enemy_nodes.get(e.id)
		if node == null:
			continue
		node.position = e.pos * Cfg.ART
		if e.def["fly"]:
			# Léger flottement : ce qui vole ne doit pas sembler posé au sol.
			node.position.y -= 1.5 + sin(Time.get_ticks_msec() / 180.0 + e.id) * 1.5

		var body: Sprite2D = node.get_node("Body")
		var tint: Sprite2D = node.get_node("Tint")
		var frozen: bool = e.slow_until > sim.time

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

	# Ennemis disparus (morts ou arrivés) : on nettoie ce que la simulation
	# a retiré de sa liste.
	var alive := {}
	for e in sim.enemies:
		alive[e.id] = true
	for id in _enemy_nodes.keys():
		if not alive.has(id):
			_enemy_nodes[id].queue_free()
			_enemy_nodes.erase(id)

	# Tours : seule la tête tourne.
	for t in sim.towers:
		var node: Node2D = _tower_nodes.get(t.id)
		if node == null:
			continue
		var head: Sprite2D = node.get_node("Head")
		head.rotation = t.angle + PI / 2.0
		# Recul : la tête recule d'un pixel dans l'axe du tir, le temps d'un
		# battement de cil. C'est ce qui donne du poids au coup.
		var recoil: float = 2.0 * minf(1.0, t.flash / 0.09) if t.flash > 0.0 else 0.0
		head.position = Vector2(-cos(t.angle), -sin(t.angle)) * recoil + Vector2(0, -2)


func _on_enemy_spawned(e) -> void:
	var node := Node2D.new()
	node.position = e.pos * Cfg.ART

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
	node.z_index = 1

	var base := Sprite2D.new()
	base.name = "Base"
	base.texture = Art.base_texture()
	node.add_child(base)

	var head := Sprite2D.new()
	head.name = "Head"
	head.texture = Art.texture("head_" + t.type)
	head.position = Vector2(0, -2)
	node.add_child(head)

	entities.add_child(node)
	_tower_nodes[t.id] = node


func _on_tower_sold(t) -> void:
	var node: Node2D = _tower_nodes.get(t.id)
	if node != null:
		node.queue_free()
		_tower_nodes.erase(t.id)


func _on_tower_upgraded(_t) -> void:
	pass   # le niveau se lit aux pastilles d'or, dessinées par la couche d'effets
