using UnrealBuildTool;
using System.Collections.Generic;

public class PixelDefense3DEditorTarget : TargetRules
{
    public PixelDefense3DEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("PixelDefense3D");
    }
}
