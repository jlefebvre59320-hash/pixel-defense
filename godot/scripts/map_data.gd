extends RefCounted
## Le terrain, en données pures et statiques.
##
## Le chemin est décrit par une poignée de points de passage ; les cases qu'il
## occupe sont déduites, jamais recopiées à la main — impossible de rendre
## constructible une case du chemin par une faute de saisie.
##
## Pas d'autoload à dessein : ce script doit être utilisable par le robot
## d'équilibrage (godot --headless --script), qui tourne sans arbre de scène.

const Cfg := preload("res://scripts/config.gd")

## Points de passage, en coordonnées de case. Le premier est au-dessus du
## plateau : les ennemis entrent par le haut, hors champ.
const WP := [
	Vector2i(4, -1), Vector2i(4, 2), Vector2i(7, 2), Vector2i(7, 5),
	Vector2i(1, 5), Vector2i(1, 9), Vector2i(6, 9), Vector2i(6, 12),
	Vector2i(2, 12), Vector2i(2, 15),
]

## La base à défendre : dernière case du chemin.
const CORE := Vector2i(2, 15)

## Décor infranchissable — rochers et arbres. Sans effet sur les règles, mais
## il resserre les emplacements et donne son relief au plateau.
const BLOCKED := [
	Vector2i(0, 3), Vector2i(5, 3), Vector2i(3, 7), Vector2i(8, 7),
	Vector2i(0, 13), Vector2i(8, 11), Vector2i(7, 14), Vector2i(4, 15),
]

const CORE_POINT := Vector2(CORE.x + 0.5, CORE.y + 0.5)
const SPAWN_POINT := Vector2(WP[0].x + 0.5, WP[0].y + 0.5)

static var _path_cells := {}
static var _blocked_cells := {}
static var _waypoints := PackedVector2Array()
static var _length := 0.0
static var _ready_done := false


static func _ensure() -> void:
	if _ready_done:
		return
	_ready_done = true

	for i in range(WP.size() - 1):
		var a: Vector2i = WP[i]
		var b: Vector2i = WP[i + 1]
		var step := Vector2i(signi(b.x - a.x), signi(b.y - a.y))
		var cell := a
		_path_cells[cell] = true
		while cell != b:
			cell += step
			_path_cells[cell] = true

	for cell in BLOCKED:
		_blocked_cells[cell] = true

	for p in WP:
		_waypoints.append(Vector2(p.x + 0.5, p.y + 0.5))

	for i in range(_waypoints.size() - 1):
		_length += _waypoints[i].distance_to(_waypoints[i + 1])


static func waypoints() -> PackedVector2Array:
	_ensure()
	return _waypoints


static func path_length() -> float:
	_ensure()
	return _length


static func inside(c: int, r: int) -> bool:
	return c >= 0 and r >= 0 and c < Cfg.COLS and r < Cfg.ROWS


static func is_path(c: int, r: int) -> bool:
	_ensure()
	return _path_cells.has(Vector2i(c, r))


static func is_blocked(c: int, r: int) -> bool:
	_ensure()
	return _blocked_cells.has(Vector2i(c, r))


## Constructible : sur le plateau, hors chemin, hors décor. Rien d'autre — il
## n'y a pas de limite au nombre de tours.
static func is_buildable(c: int, r: int) -> bool:
	return inside(c, r) and not is_path(c, r) and not is_blocked(c, r)


## Bruit stable : le décor doit être identique à chaque partie, sinon le
## plateau n'est jamais reconnaissable.
static func noise(c: int, r: int) -> float:
	var n := sin(c * 127.1 + r * 311.7) * 43758.5453
	return n - floor(n)
