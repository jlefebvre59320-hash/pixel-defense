extends Node
## Les dessins. Chaque sprite est un tableau de chaînes : une lettre = un pixel
## d'art, « . » = transparent. Rien n'est chargé depuis un fichier image — le
## projet n'a aucun binaire à versionner, et modifier un ennemi se fait dans un
## éditeur de texte.
##
## Les textures sont fabriquées à la demande puis gardées en mémoire ; en mode
## sans rendu (le robot d'équilibrage), aucune n'est jamais créée.

const Cfg := preload("res://scripts/config.gd")
const MapD := preload("res://scripts/map_data.gd")

const PAL := {
	"k": Color("12131c"),  # contour
	"w": Color("eef1f7"),  # blanc
	"s": Color("8a93a8"),  # acier
	"S": Color("5b6479"),  # acier sombre
	"r": Color("e5484d"),  # rouge
	"d": Color("9b2f33"),  # rouge sombre
	"o": Color("f2a33c"),  # orange
	"O": Color("b96a1c"),  # orange sombre
	"y": Color("ffd84d"),  # jaune
	"g": Color("57c96a"),  # vert
	"G": Color("2f8f47"),  # vert sombre
	"b": Color("4aa3f0"),  # bleu
	"B": Color("2264c4"),  # bleu sombre
	"c": Color("5be3e0"),  # cyan
	"C": Color("2aa8b5"),  # cyan sombre
	"p": Color("a35bd6"),  # violet
	"P": Color("6b32a0"),  # violet sombre
	"n": Color("6b4a2f"),  # brun
	"N": Color("43301f"),  # brun sombre
}

## Couleurs du terrain
const GRASS := Color("2f7d51")
const GRASS_ALT := Color("2a7049")
const GRASS_DOT := Color("37925d")
const GRASS_EDGE := Color("20573a")
const PATH := Color("b08a5e")
const PATH_ALT := Color("a8825a")
const PATH_EDGE := Color("7c6142")
const PATH_DOT := Color("c29a6c")
const WHITE := Color("eef1f7")

const ART := {
	"crawler": [
		"....kkkk....",
		"..kkGGGGkk..",
		".kGggggggGk.",
		".kGgwkkwgGk.",
		"kGgggggggGGk",
		"kGggGGGGggGk",
		"kGgggggggGGk",
		".kGggggggGk.",
		"..kkGGGGkk..",
		"...k.kk.k...",
		"..k..kk..k..",
		"............",
	],
	"swarm": [
		"..kkkk..",
		".krrrrk.",
		"krwrrwrk",
		"krrrrrrk",
		"krddddrk",
		".krrrrk.",
		"..kkkk..",
		"..k..k..",
	],
	"armored": [
		"...kkkkkk...",
		"..kSSSSSSk..",
		".kSssssssSk.",
		"kSssSSSSssSk",
		"kSsSwkkwSsSk",
		"kSssSSSSssSk",
		"kSssssssssSk",
		".kSssssssSk.",
		".kSSSSSSSSk.",
		"..kSSSSSSk..",
		"...kkkkkk...",
		"...k....k...",
	],
	"flyer": [
		"kk........kk",
		".kk......kk.",
		"..k..bb..k..",
		".....bb.....",
		"...kkbbkk...",
		"..kbBBBBbk..",
		"..kbBccBbk..",
		"..kbBBBBbk..",
		"...kkbbkk...",
		".....bb.....",
		"..k..bb..k..",
		".kk......kk.",
	],
	"boss": [
		"....kkkkkkkk....",
		"..kkPPPPPPPPkk..",
		".kPPpppppppPPPk.",
		"kPPppppppppppPPk",
		"kPpppyykkyyppppk",
		"kPppppppppppppPk",
		"kPppkPPPPPPkppPk",
		"kPpppPPPPPPpppPk",
		"kPppppppppppppPk",
		".kPPppppppppPPk.",
		".kkPPPPPPPPPPkk.",
		"..kkPPPPPPPPkk..",
		"...k.kkkkkk.k...",
		"..kk..kkkk..kk..",
		"..kk........kk..",
		"................",
	],
	"head_gun": [
		".....kk.....",
		".....ss.....",
		".....ss.....",
		"....kssk....",
		"...kssssk...",
		"..kSssssSk..",
		".kSssssssSk.",
		".kSssssssSk.",
		".kSSssssSSk.",
		"..kSSSSSSk..",
		"...kkkkkk...",
		"............",
	],
	"head_cannon": [
		"....kkkk....",
		"....kook....",
		"....kook....",
		"....kook....",
		"...kooook...",
		"..kOooooOk..",
		".kOooooooOk.",
		".kOooooooOk.",
		".kOOooooOOk.",
		"..kOOOOOOk..",
		"...kkkkkk...",
		"............",
	],
	"head_frost": [
		".....kk.....",
		"....kcck....",
		"....kcck....",
		"...kcccck...",
		"..kCccccCk..",
		".kCccccccCk.",
		".kCccccccCk.",
		".kCCccccCCk.",
		"..kCCCCCCk..",
		"...kkkkkk...",
		"............",
		"............",
	],
	"head_tesla": [
		"..k......k..",
		"..kp....pk..",
		"...kp..pk...",
		"....kppk....",
		"....kppk....",
		"..kPppppPk..",
		".kPppppppPk.",
		".kPppppppPk.",
		".kPPppppPPk.",
		"..kPPPPPPk..",
		"...kkkkkk...",
		"............",
	],
	"core": [
		"................",
		"......kkkk......",
		".....kcccck.....",
		"....kcccccck....",
		"...kcccccccck...",
		"...kcCccccCck...",
		"...kcCccccCck...",
		"...kcCCccCCck...",
		"...kcCCCCCCck...",
		"....kCCCCCCk....",
		".....kCCCCk.....",
		"....kkkkkkkk....",
		"...kSSSSSSSSk...",
		"..kSssssssssSk..",
		"..kSSSSSSSSSSk..",
		"..kkkkkkkkkkkk..",
	],
	"rock": [
		"............",
		"....kkkk....",
		"..kkSSSSkk..",
		".kSSsssSSSk.",
		".kSsssssSSk.",
		"kSssssssSSSk",
		"kSsssssssSSk",
		"kSSssssssSSk",
		".kSSSSSSSSk.",
		"..kkkkkkkk..",
		"............",
		"............",
	],
	"tree": [
		"....kkkk....",
		"..kkGGGGkk..",
		".kGggggggGk.",
		"kGgggggggGGk",
		"kGgggggggGGk",
		"kGggGgggGGGk",
		".kGgggggGGk.",
		"..kkGGGGkk..",
		"....knnk....",
		"....knnk....",
		"....kNNk....",
		"...kkkkkk...",
	],
}

var _images := {}
var _textures := {}
var _tints := {}
var _terrain: ImageTexture = null


## Image d'un sprite, fabriquée une fois pour toutes.
func image(name: String) -> Image:
	if _images.has(name):
		return _images[name]

	var rows: Array = ART[name]
	var w := 0
	for row in rows:
		w = maxi(w, (row as String).length())
	var img := Image.create(w, rows.size(), false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))

	for y in range(rows.size()):
		var row: String = rows[y]
		for x in range(row.length()):
			var ch := row[x]
			if PAL.has(ch):
				img.set_pixel(x, y, PAL[ch])

	_images[name] = img
	return img


func texture(name: String) -> ImageTexture:
	if not _textures.has(name):
		_textures[name] = ImageTexture.create_from_image(image(name))
	return _textures[name]


## Silhouette du sprite repeinte d'une seule couleur : l'éclair blanc de
## l'impact et le voile de givre épousent ainsi la forme de l'ennemi, au lieu
## d'un vilain carré posé par-dessus.
func tinted(name: String, color: Color) -> ImageTexture:
	var key := "%s|%s" % [name, color.to_html(false)]
	if _tints.has(key):
		return _tints[key]

	var src := image(name)
	var img := Image.create(src.get_width(), src.get_height(), false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in range(src.get_height()):
		for x in range(src.get_width()):
			if src.get_pixel(x, y).a > 0.0:
				img.set_pixel(x, y, color)

	_tints[key] = ImageTexture.create_from_image(img)
	return _tints[key]


## Le terrain complet en une seule texture (144 × 256 pixels d'art) : il ne
## bouge jamais, autant le peindre une fois plutôt que 144 tuiles par trame.
func terrain() -> ImageTexture:
	if _terrain != null:
		return _terrain

	var A := Cfg.ART
	var img := Image.create(Cfg.COLS * A, Cfg.ROWS * A, false, Image.FORMAT_RGBA8)

	for r in range(Cfg.ROWS):
		for c in range(Cfg.COLS):
			var x := c * A
			var y := r * A
			var n := MapD.noise(c, r)
			var on_path := MapD.is_path(c, r)

			var base: Color = (PATH if n > 0.5 else PATH_ALT) if on_path else (GRASS if n > 0.5 else GRASS_ALT)
			img.fill_rect(Rect2i(x, y, A, A), base)

			if on_path:
				# Liseré sombre du côté où l'herbe reprend : c'est lui qui rend
				# le tracé lisible d'un coup d'œil.
				if not MapD.is_path(c, r - 1):
					img.fill_rect(Rect2i(x, y, A, 1), PATH_EDGE)
				if not MapD.is_path(c, r + 1):
					img.fill_rect(Rect2i(x, y + A - 1, A, 1), PATH_EDGE)
				if not MapD.is_path(c - 1, r):
					img.fill_rect(Rect2i(x, y, 1, A), PATH_EDGE)
				if not MapD.is_path(c + 1, r):
					img.fill_rect(Rect2i(x + A - 1, y, 1, A), PATH_EDGE)

				for i in range(3):
					var gx := x + 2 + int(MapD.noise(c * 7 + i, r * 13 + i * 3) * 12)
					var gy := y + 2 + int(MapD.noise(r * 5 + i, c * 11) * 12)
					img.set_pixel(gx, gy, PATH_DOT)
			else:
				for j in range(4):
					var hn := MapD.noise(c * 3 + j, r * 9 + j * 2)
					if hn < 0.45:
						continue
					var hx := x + int(hn * 15)
					var hy := y + int(MapD.noise(r * 3 + j, c * 5) * 15)
					img.set_pixel(hx, hy, GRASS_EDGE if hn > 0.8 else GRASS_DOT)

	# Décor infranchissable
	for cell in MapD.BLOCKED:
		var sprite := image("rock" if MapD.noise(cell.x, cell.y) > 0.5 else "tree")
		var dst := Vector2i(cell.x * A + (A - sprite.get_width()) / 2, cell.y * A + (A - sprite.get_height()) / 2)
		img.blend_rect(sprite, Rect2i(Vector2i.ZERO, sprite.get_size()), dst)

	# Entrée des ennemis : deux chevrons pâles dans la première case du chemin.
	var ex := int(MapD.SPAWN_POINT.x * A)
	for k in range(2):
		var top := 2 + k * 5
		var col := Color(WHITE.r, WHITE.g, WHITE.b, 0.3 - k * 0.12)
		for i in range(3):
			img.blend_rect(_dot(col), Rect2i(0, 0, 2, 1), Vector2i(ex - 3 + i, top + i))
			img.blend_rect(_dot(col), Rect2i(0, 0, 2, 1), Vector2i(ex + 1 - i, top + i))

	_terrain = ImageTexture.create_from_image(img)
	return _terrain


func _dot(color: Color) -> Image:
	var img := Image.create(2, 1, false, Image.FORMAT_RGBA8)
	img.fill(color)
	return img


## Contrôle de cohérence : un sprite dont les lignes n'ont pas toutes la même
## longueur est une faute de frappe, pas un effet de style.
func validate() -> PackedStringArray:
	var problems := PackedStringArray()
	for name in ART:
		var rows: Array = ART[name]
		var w: int = (rows[0] as String).length()
		for i in range(rows.size()):
			var row: String = rows[i]
			if row.length() != w:
				problems.append("%s ligne %d : %d ≠ %d" % [name, i, row.length(), w])
			for x in range(row.length()):
				if row[x] != "." and not PAL.has(row[x]):
					problems.append("%s ligne %d : couleur inconnue « %s »" % [name, i, row[x]])
	return problems


## Socle de tour : une plateforme de pierre en aplats. Un sprite dessiné à la
## main pour un carré serait de la place perdue.
func base_texture() -> ImageTexture:
	if _textures.has("_base"):
		return _textures["_base"]

	var A: int = Cfg.ART
	var img := Image.create(A, A, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	img.fill_rect(Rect2i(1, 2, A - 2, A - 3), Color("191c2b"))
	img.fill_rect(Rect2i(2, 3, A - 4, A - 5), Color("3a4055"))
	img.fill_rect(Rect2i(2, 3, A - 4, 2), Color("4d5470"))

	_textures["_base"] = ImageTexture.create_from_image(img)
	return _textures["_base"]
