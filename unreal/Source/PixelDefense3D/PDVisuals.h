#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PDVisuals.generated.h"

class APDEnemy;
class ADirectionalLight;
class UHierarchicalInstancedStaticMeshComponent;
class UPointLightComponent;
class USceneComponent;
class UStaticMeshComponent;
enum class EPDTowerKind : uint8;

UCLASS()
class PIXELDEFENSE3D_API APDProjectile : public AActor
{
    GENERATED_BODY()
public:
    APDProjectile();
    virtual void Tick(float DeltaSeconds) override;
    void Init(APDEnemy* InTarget, EPDTowerKind InKind, float InDamage,
              bool bInIgnoreArmor, float InSplashRadius,
              float InSlowFactor, float InSlowDuration);

private:
    UPROPERTY() UStaticMeshComponent* Visual;
    UPROPERTY() UPointLightComponent* Glow;
    TWeakObjectPtr<APDEnemy> Target;
    EPDTowerKind Kind;
    FVector Start;
    FVector LastTarget;
    float Damage=0.f;
    float SplashRadius=0.f;
    float SlowFactor=1.f;
    float SlowDuration=0.f;
    float Speed=1200.f;
    float ArcHeight=0.f;
    float Elapsed=0.f;
    float TravelTime=.25f;
    bool bIgnoreArmor=false;
    void Impact();
};

UCLASS()
class PIXELDEFENSE3D_API APDImpactFX : public AActor
{
    GENERATED_BODY()
public:
    APDImpactFX();
    virtual void Tick(float DeltaSeconds) override;
    void Init(EPDTowerKind InKind);

private:
    UPROPERTY() UStaticMeshComponent* Visual;
    UPROPERTY() UPointLightComponent* Glow;
    float Age=0.f;
    float Duration=.45f;
    float FinalScale=2.f;
};

UCLASS()
class PIXELDEFENSE3D_API APDEnvironment : public AActor
{
    GENERATED_BODY()
public:
    APDEnvironment();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

private:
    UPROPERTY() USceneComponent* Root;
    UPROPERTY() UStaticMeshComponent* Terrain;
    UPROPERTY() UStaticMeshComponent* Water;
    UPROPERTY() UStaticMeshComponent* Castle;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Path;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* TreesA;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* TreesB;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* TreesC;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Shrubs;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Meadow;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Rocks;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Houses;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Walls;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Gateways;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Props;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Torches;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Fireflies;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Dust;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Birds;
    UPROPERTY() UHierarchicalInstancedStaticMeshComponent* Clouds;
    TArray<FVector> FireflyOrigins;
    TArray<float> FireflyPhases;
    TArray<FVector> DustOrigins;
    TArray<float> DustPhases;
    TArray<FVector> BirdOrigins;
    TArray<float> BirdPhases;
    TArray<FVector> CloudOrigins;
    TArray<float> CloudSpeeds;
    TArray<TWeakObjectPtr<UPointLightComponent>> TorchLights;
    TWeakObjectPtr<ADirectionalLight> Sun;

    void BuildTerrain();
    void BuildForest();
    void BuildVillage();
    void BuildAmbientFX();
};
