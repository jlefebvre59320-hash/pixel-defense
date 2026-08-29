using UnrealBuildTool;

public class PixelDefense3D : ModuleRules
{
    public PixelDefense3D(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] {
            "Core", "CoreUObject", "Engine", "InputCore", "UMG", "Slate", "SlateCore", "Niagara"
        });
    }
}
