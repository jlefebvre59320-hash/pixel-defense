extends RefCounted
## La simulation : vagues, déplacements, tirs, dégâts, économie.
##
## Aucune référence à un nœud, à une texture ou à un pixel : la partie avance
## à partir d'un temps écoulé, et prévient le reste du jeu par des signaux.
## C'est ce qui rend le mode ×2/×3 gratuit — on appelle simplement update()
## avec un dt multiplié — et ce qui permet de faire jouer un robot sans
## fenêtre (tools/simulate.gd).

const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")

signal enemy_spawned(enemy)
signal enemy_died(enemy)
signal enemy_leaked(enemy)
signal tower_built(tower)
signal tower_sold(tower)
signal tower_upgraded(tower)
signal shot_fired(kind: String)
signal beam_fired(from: Vector2, to: Vector2)
signal explosion(at: Vector2, radius: float)
signal floater(at: Vector2, text: String, color: Color)
signal wave_started(wave: int, boss: bool)
signal wave_cleared(wave: int, bonus: int)
signal finished(won: bool)
signal refused(reason: String)

enum Phase { TITLE, PLAYING, PAUSED, OVER, WON }

const GOLD_COLOR := Color("ffd84d")
const DAMAGE_COLOR := Color("e5484d")

## --- État d'une entité ------------------------------------------------------

class EnemyS extends RefCounted:
	var id: int
	var key: String
	var def: Dictionary
	var path: PackedVector2Array
	var wp := 1                  ## point de passage visé
	var pos: Vector2             ## position affichée (décalage latéral compris)
	var raw: Vector2             ## position sur le chemin
	var hp: float
	var max_hp: float
	var traveled := 0.0
	var total := 0.0
	var progress := 0.0
	var off := 0.0               ## décalage latéral : la file ne se superpose pas
	var slow_until := -1.0
	var slow_factor := 1.0
	var flash := 0.0
	var dead := false


class TowerS extends RefCounted:
	var id: int
	var cell: Vector2i
	var pos: Vector2
	var type: String
	var level := 1
	var invested := 0
	var cool := 0.0
	var angle := -PI / 2.0
	var flash := 0.0


class ShotS extends RefCounted:
	var pos: Vector2
	var target: EnemyS
	var to: Vector2
	var speed: float
	var dmg: float
	var kind: String
	var splash := 0.0
	var slow := 0.0
	var slow_for := 0.0
	var ignore_armor := false


## --- État de la partie ------------------------------------------------------

var phase := Phase.TITLE
var gold := Cfg.START_GOLD
var lives := Cfg.START_LIVES
var score := 0
var wave := 0
var waves := Cfg.WAVES.size()
var wave_active := false
var break_left := -1.0        ## négatif = pas de décompte (avant la 1re vague)
var clock := 0.0              ## temps depuis le début de la vague
var time := 0.0               ## temps de jeu total
var enemies: Array = []
var towers: Array = []
var shots: Array = []
var spawn_queue: Array = []
var kills := 0
var leaks := 0
var built := 0
var new_record := false

var _next_id := 1


## --- Tours ------------------------------------------------------------------

func tower_at(c: int, r: int) -> TowerS:
	for t in towers:
		if t.cell.x == c and t.cell.y == r:
			return t
	return null


func can_build(c: int, r: int, type: String) -> bool:
	if not MapD.is_buildable(c, r):
		return false
	if tower_at(c, r) != null:
		return false
	return gold >= int(Cfg.TOWERS[type]["cost"])


func build(c: int, r: int, type: String) -> bool:
	if not MapD.is_buildable(c, r) or tower_at(c, r) != null:
		refused.emit("place")
		return false
	var cost := int(Cfg.TOWERS[type]["cost"])
	if gold < cost:
		refused.emit("gold")
		return false

	gold -= cost
	var t := TowerS.new()
	t.id = _next_id
	_next_id += 1
	t.cell = Vector2i(c, r)
	t.pos = Vector2(c + 0.5, r + 0.5)
	t.type = type
	t.invested = cost
	towers.append(t)
	built += 1
	tower_built.emit(t)
	return true


func upgrade(t: TowerS) -> bool:
	var lv := Cfg.next_level(t.type, t.level)
	if lv.is_empty() or gold < int(lv["cost"]):
		refused.emit("gold")
		return false
	gold -= int(lv["cost"])
	t.invested += int(lv["cost"])
	t.level += 1
	tower_upgraded.emit(t)
	return true


func sell_value(t: TowerS) -> int:
	return int(floor(t.invested * Cfg.SELL_RATIO))


func sell(t: TowerS) -> bool:
	var i := towers.find(t)
	if i < 0:
		return false
	gold += sell_value(t)
	towers.remove_at(i)
	tower_sold.emit(t)
	return true


func stats_of(t: TowerS) -> Dictionary:
	return Cfg.tower_level(t.type, t.level)


## --- Vagues -----------------------------------------------------------------

func early_bonus() -> int:
	if break_left < 0.0:
		return 0
	return int(floor(break_left)) * Cfg.EARLY_GOLD_PER_SEC


## Appel anticipé : le répit non consommé est converti en or. Sans cela, jouer
## vite n'aurait aucun intérêt stratégique.
func call_wave() -> int:
	if wave_active or phase != Phase.PLAYING or wave >= waves:
		return 0
	var bonus := early_bonus()
	if bonus > 0:
		gold += bonus
		floater.emit(MapD.CORE_POINT + Vector2(0, -1), "+%d" % bonus, GOLD_COLOR)
	start_wave()
	return bonus


func start_wave() -> void:
	wave += 1
	wave_active = true
	clock = 0.0
	break_left = -1.0

	var hp_mul := 1.0 + (wave - 1) * Cfg.HP_RAMP
	var boss := false
	var queue: Array = []

	for g in Cfg.WAVES[wave - 1]:
		var def: Dictionary = Cfg.ENEMIES[g["t"]]
		if def["boss"]:
			boss = true
		for i in range(int(g["n"])):
			queue.append({
				"type": g["t"],
				"at": float(g.get("at", 0.0)) + i * float(g["gap"]),
				"hp": round(float(def["hp"]) * hp_mul),
			})

	queue.sort_custom(func(a, b): return a["at"] < b["at"])
	spawn_queue = queue
	wave_started.emit(wave, boss)


## --- Ennemis ----------------------------------------------------------------

func spawn(type: String, hp: float) -> void:
	var def: Dictionary = Cfg.ENEMIES[type]
	var path := PackedVector2Array()

	if def["fly"]:
		# Les drones ignorent le chemin : ils entrent par un point au hasard en
		# haut de l'écran et filent droit sur la base. Une défense massée le
		# long du chemin ne les arrête pas — c'est tout leur intérêt.
		path.append(Vector2(1.0 + randf() * (Cfg.COLS - 2), -1.0))
		path.append(MapD.CORE_POINT)
	else:
		path = MapD.waypoints().duplicate()

	var e := EnemyS.new()
	e.id = _next_id
	_next_id += 1
	e.key = type
	e.def = def
	e.path = path
	e.pos = path[0]
	e.raw = path[0]
	e.hp = hp
	e.max_hp = hp
	e.off = (randf() - 0.5) * 0.34
	for i in range(path.size() - 1):
		e.total += path[i].distance_to(path[i + 1])

	enemies.append(e)
	enemy_spawned.emit(e)


## Renvoie true si l'ennemi a atteint la base.
func _move_enemy(e: EnemyS, dt: float) -> bool:
	var slowed := e.slow_until > time
	var left := float(e.def["speed"]) * (e.slow_factor if slowed else 1.0) * dt

	# Un pas de temps peut traverser plusieurs segments en vitesse ×3 : on boucle.
	while left > 0.0 and e.wp < e.path.size():
		var target := e.path[e.wp]
		var d := e.raw.distance_to(target)
		if d <= left:
			left -= d
			e.raw = target
			e.traveled += d
			e.wp += 1
		else:
			e.raw = e.raw.lerp(target, left / d)
			e.traveled += left
			left = 0.0

	e.progress = e.traveled / e.total if e.total > 0.0 else 1.0

	# Décalage latéral, appliqué à la position visible et visée : deux ennemis
	# d'une même file ne se marchent pas dessus.
	var seg: int = mini(e.wp, e.path.size() - 1)
	var a := e.path[maxi(0, seg - 1)]
	var b := e.path[seg]
	var dir := (b - a).normalized()
	e.pos = e.raw + Vector2(-dir.y, dir.x) * e.off

	return e.wp >= e.path.size()


func damage(e: EnemyS, amount: float, ignore_armor: bool) -> void:
	if e.dead:
		return
	var d: float = amount if ignore_armor else maxf(1.0, amount - float(e.def["armor"]))
	e.hp -= d
	e.flash = 0.1
	if e.hp > 0.0:
		return

	e.dead = true
	var reward := int(e.def["reward"])
	gold += reward
	score += reward * Cfg.KILL_SCORE
	kills += 1
	floater.emit(e.pos, "+%d" % reward, GOLD_COLOR)
	enemy_died.emit(e)


## --- Tirs -------------------------------------------------------------------

## On vise toujours l'ennemi le plus avancé : c'est celui qui coûte des vies
## dans deux secondes.
func _pick_target(t: TowerS, range_tiles: float) -> EnemyS:
	var best: EnemyS = null
	var best_progress := -1.0
	for e in enemies:
		if e.dead:
			continue
		if t.pos.distance_to(e.pos) > range_tiles + float(e.def["size"]):
			continue
		if e.progress > best_progress:
			best_progress = e.progress
			best = e
	return best


func _fire(t: TowerS, target: EnemyS) -> void:
	var def: Dictionary = Cfg.TOWERS[t.type]
	var lv := stats_of(t)
	t.flash = 0.1

	if def["kind"] == "beam":
		# L'éclair part et touche dans la même trame : pas de projectile.
		beam_fired.emit(t.pos, target.pos)
		damage(target, float(lv["dmg"]), true)
		shot_fired.emit("beam")
		return

	var s := ShotS.new()
	s.pos = t.pos
	s.target = target
	s.to = target.pos
	s.speed = float(def["shot_speed"])
	s.dmg = float(lv["dmg"])
	s.kind = def["kind"]
	s.splash = float(def.get("splash", 0.0))
	s.slow = float(def.get("slow", 0.0))
	s.slow_for = float(def.get("slow_for", 0.0))
	s.ignore_armor = bool(def.get("ignore_armor", false))
	shots.append(s)
	shot_fired.emit(s.kind)


func _impact(s: ShotS) -> void:
	if s.splash > 0.0:
		explosion.emit(s.to, s.splash)
		for e in enemies:
			if e.dead:
				continue
			if s.to.distance_to(e.pos) <= s.splash + float(e.def["size"]):
				damage(e, s.dmg, s.ignore_armor)
		return

	# La cible est morte en vol : le tir se perd, et c'est très bien ainsi —
	# sinon les dégâts seraient reportés sur un ennemi jamais visé.
	if s.target == null or s.target.dead:
		return

	damage(s.target, s.dmg, s.ignore_armor)
	if s.slow > 0.0:
		s.target.slow_until = time + s.slow_for
		s.target.slow_factor = 1.0 - s.slow


## --- Boucle -----------------------------------------------------------------

func update(dt: float) -> void:
	if phase != Phase.PLAYING:
		return

	time += dt

	if not wave_active and break_left >= 0.0:
		break_left -= dt
		if break_left <= 0.0:
			start_wave()

	if wave_active:
		clock += dt
		while spawn_queue.size() > 0 and float(spawn_queue[0]["at"]) <= clock:
			var next: Dictionary = spawn_queue.pop_front()
			spawn(next["type"], float(next["hp"]))

	# Ennemis
	var arrived: Array = []
	for e in enemies:
		if e.flash > 0.0:
			e.flash -= dt
		if e.dead:
			continue
		if _move_enemy(e, dt):
			arrived.append(e)

	for e in arrived:
		e.dead = true
		lives -= int(e.def["leak"])
		leaks += 1
		floater.emit(MapD.CORE_POINT + Vector2(0, -0.8), "-%d" % int(e.def["leak"]), DAMAGE_COLOR)
		enemy_leaked.emit(e)

	var alive: Array = []
	for e in enemies:
		if not e.dead:
			alive.append(e)
	enemies = alive

	# Tours
	for t in towers:
		if t.flash > 0.0:
			t.flash -= dt
		var lv := stats_of(t)
		t.cool -= dt
		var target := _pick_target(t, float(lv["range"]))
		if target == null:
			continue
		t.angle = (target.pos - t.pos).angle()
		if t.cool <= 0.0:
			_fire(t, target)
			t.cool = 1.0 / float(lv["rate"])

	# Projectiles
	var flying: Array = []
	for s in shots:
		if s.target != null and not s.target.dead:
			s.to = s.target.pos
		var d: float = s.pos.distance_to(s.to)
		var step: float = s.speed * dt
		if d <= step or d < 0.05:
			s.pos = s.to
			_impact(s)
			continue
		s.pos += (s.to - s.pos) / d * step
		flying.append(s)
	shots = flying

	# Fin de vague
	if wave_active and spawn_queue.is_empty() and enemies.is_empty():
		wave_active = false
		score += Cfg.WAVE_SCORE
		var bonus := Cfg.wave_bonus(wave)
		gold += bonus
		floater.emit(MapD.CORE_POINT + Vector2(0, -1.2), "+%d" % bonus, GOLD_COLOR)
		wave_cleared.emit(wave, bonus)

		if wave >= waves:
			_finish(true)
			return
		break_left = Cfg.WAVE_BREAK

	if lives <= 0:
		lives = 0
		_finish(false)


func _finish(won: bool) -> void:
	phase = Phase.WON if won else Phase.OVER
	if won:
		score += lives * Cfg.LIFE_SCORE + gold
	finished.emit(won)
