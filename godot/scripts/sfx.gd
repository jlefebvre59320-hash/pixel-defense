extends Node
## Bruitages de synthèse : aucun fichier son dans le projet.
##
## Chaque effet est un petit tampon PCM fabriqué au premier usage — une onde
## carrée qui glisse d'une hauteur à l'autre, ou du bruit filtré pour les
## explosions. L'enveloppe est volontairement courte : un tower defense tire
## plusieurs fois par seconde, tout ce qui traîne devient une bouillie.

const RATE := 22050
const VOICES := 12          ## sons simultanés au maximum
const DEFAULT_GAP := 0.045  ## deux fois le même bruit dans cet intervalle : on ignore

## from / to : hauteur en hertz · dur : secondes · noise : bruit au lieu d'une
## onde carrée · vol : volume relatif
const RECIPES := {
	"shoot": {"from": 620.0, "to": 260.0, "dur": 0.06, "vol": 0.35},
	"cannon": {"from": 160.0, "to": 50.0, "dur": 0.2, "vol": 0.6, "noise": true},
	"frost": {"from": 1200.0, "to": 700.0, "dur": 0.1, "vol": 0.35},
	"beam": {"from": 1500.0, "to": 400.0, "dur": 0.07, "vol": 0.35},
	"hit": {"from": 220.0, "to": 120.0, "dur": 0.05, "vol": 0.3},
	"kill": {"from": 420.0, "to": 700.0, "dur": 0.09, "vol": 0.45},
	"build": {"from": 300.0, "to": 900.0, "dur": 0.12, "vol": 0.6},
	"sell": {"from": 700.0, "to": 240.0, "dur": 0.14, "vol": 0.5},
	"upgrade": {"from": 500.0, "to": 1100.0, "dur": 0.16, "vol": 0.6},
	"deny": {"from": 180.0, "to": 110.0, "dur": 0.14, "vol": 0.5},
	"leak": {"from": 320.0, "to": 90.0, "dur": 0.35, "vol": 0.7},
	"wave": {"from": 400.0, "to": 800.0, "dur": 0.18, "vol": 0.55},
	"boss": {"from": 120.0, "to": 55.0, "dur": 0.7, "vol": 0.8, "noise": true},
	"win": {"from": 520.0, "to": 1050.0, "dur": 0.5, "vol": 0.7},
	"lose": {"from": 400.0, "to": 90.0, "dur": 0.7, "vol": 0.7},
}

var enabled := true

var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next_voice := 0
var _last_at := {}


func _ready() -> void:
	enabled = SaveData.sound
	for i in range(VOICES):
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_players.append(p)


func set_enabled(on: bool) -> void:
	enabled = on
	SaveData.sound = on
	SaveData.save_data()


func play(name: String, gap: float = DEFAULT_GAP) -> void:
	if not enabled or not RECIPES.has(name):
		return

	var now := Time.get_ticks_msec() / 1000.0
	if _last_at.has(name) and now - _last_at[name] < gap:
		return
	_last_at[name] = now

	var player := _players[_next_voice]
	_next_voice = (_next_voice + 1) % _players.size()
	player.stream = _stream(name)
	player.volume_db = -6.0
	player.play()


func _stream(name: String) -> AudioStreamWAV:
	if _streams.has(name):
		return _streams[name]

	var r: Dictionary = RECIPES[name]
	var dur := float(r["dur"])
	var vol := float(r["vol"])
	var is_noise := bool(r.get("noise", false))
	var count := int(RATE * dur)
	var data := PackedByteArray()
	data.resize(count * 2)

	var phase := 0.0
	var last_noise := 0.0
	for i in range(count):
		var k := float(i) / count
		var freq: float = lerpf(float(r["from"]), float(r["to"]), k)
		var env: float = minf(1.0, i / (RATE * 0.006)) * pow(1.0 - k, 1.6)  # attaque courte, chute douce
		var sample := 0.0

		if is_noise:
			# Bruit passe-bas rudimentaire : une moyenne glissante suffit à
			# transformer un grésillement en « boum ».
			last_noise = lerpf(last_noise, randf() * 2.0 - 1.0, 0.35)
			sample = last_noise
		else:
			phase += freq / RATE
			sample = 1.0 if fmod(phase, 1.0) < 0.5 else -1.0

		var value := int(clampf(sample * env * vol, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, value)

	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = data

	_streams[name] = wav
	return wav
