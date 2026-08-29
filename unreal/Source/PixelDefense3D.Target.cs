using UnrealBuildTool;
using System.Collections.Generic;

public class PixelDefense3DTarget : TargetRules
{
    public PixelDefense3DTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        ExtraModuleNames.Add("PixelDefense3D");
    }
}
