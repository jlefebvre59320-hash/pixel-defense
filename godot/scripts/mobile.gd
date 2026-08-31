extends Node
## Comportements spécifiques aux téléphones, isolés du gameplay.
##
## - met automatiquement le jeu en pause quand l'application passe en arrière-plan ;
## - fournit un retour haptique léger, sans effet sur desktop/web.

var _paused_by_os := false


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED:
			# Ne laisse jamais une vague continuer pendant que le joueur répond
			# à un appel, verrouille son téléphone ou change d'application.
			if not get_tree().paused:
				_paused_by_os = true
				get_tree().paused = true
		NOTIFICATION_APPLICATION_RESUMED:
			# On ne reprend que si c'est nous qui avions suspendu l'arbre : une
			# pause demandée volontairement par le joueur reste une vraie pause.
			if _paused_by_os:
				_paused_by_os = false
				get_tree().paused = false


func tap() -> void:
	_vibrate(18)


func success() -> void:
	_vibrate(32)


func warning() -> void:
	_vibrate(55)


func _vibrate(duration_ms: int) -> void:
	if OS.has_feature("mobile"):
		Input.vibrate_handheld(duration_ms)
