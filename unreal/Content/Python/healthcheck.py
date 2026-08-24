import json
import unreal

payload = {
    "engine_version": unreal.SystemLibrary.get_engine_version(),
    "project_dir": unreal.Paths.project_dir(),
    "project_content_dir": unreal.Paths.project_content_dir(),
    "python_ok": True,
}

unreal.log("PIXEL_DEFENSE_BRIDGE " + json.dumps(payload, ensure_ascii=False))
print(json.dumps(payload, ensure_ascii=False))
