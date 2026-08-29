#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "PDGame.generated.h"

class UStaticMeshComponent;

UENUM(BlueprintType)
enum class EPDTowerKind : uint8
{
    Archer,
    Frost,
    Bombard,
    Mage
};

UCLASS()
class PIXELDEFENSE3D_API APDEnemy : public AActor
{
    GENERATED_BODY()
public:
    APDEnemy();
    virtual void Tick(float DeltaSeconds) override;
    void InitEnemy(const TArray<FVector>& InPath, float InHP, float InSpeed,
                   int32 InArmor, int32 InReward, int32 InLeak);
    void ApplyHit(float Amount, bool bIgnoreArmor, float SlowFactor=1.f, float SlowDuration=0.f);
    float GetProgress() const { return Progress; }
    int32 GetReward() const { return Reward; }
    int32 GetLeak() const { return Leak; }

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* Visual;
    UPROPERTY(BlueprintReadOnly) float HP=20.f;
    UPROPERTY(BlueprintReadOnly) float MaxHP=20.f;

private:
    TArray<FVector> Path;
    int32 PathIndex=1;
    float Speed=260.f;
    int32 Armor=0;
    int32 Reward=5;
    int32 Leak=1;
    float Progress=0.f;
    float Travelled=0.f;
    float TotalDistance=1.f;
    float SlowMultiplier=1.f;
    float SlowUntil=0.f;
};

UCLASS()
class PIXELDEFENSE3D_API APDTower : public AActor
{
    GENERATED_BODY()
public:
    APDTower();
    virtual void Tick(float DeltaSeconds) override;
    void Configure(EPDTowerKind InKind);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* Visual;
    UPROPERTY(BlueprintReadOnly) EPDTowerKind Kind=EPDTowerKind::Archer;

private:
    float Range=900.f;
    float Damage=8.f;
    float ShotsPerSecond=1.2f;
    float SplashRadius=0.f;
    float SlowFactor=1.f;
    float SlowDuration=0.f;
    bool bIgnoreArmor=false;
    float Cooldown=0.f;
};

UCLASS()
class PIXELDEFENSE3D_API APDBuildPad : public AActor
{
    GENERATED_BODY()
public:
    APDBuildPad();
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* Visual;
    UPROPERTY(BlueprintReadOnly) bool bOccupied=false;
};

UCLASS()
class PIXELDEFENSE3D_API APDGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    APDGameMode();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    bool BuildTower(APDBuildPad* Pad, EPDTowerKind Kind);
    void EnemyKilled(APDEnemy* Enemy);
    void EnemyLeaked(APDEnemy* Enemy);
    void StartNextWave();

    UPROPERTY(BlueprintReadOnly) int32 Gold=130;
    UPROPERTY(BlueprintReadOnly) int32 Lives=15;
    UPROPERTY(BlueprintReadOnly) int32 Wave=0;
    UPROPERTY(BlueprintReadOnly) int32 TotalWaves=20;
    UPROPERTY(BlueprintReadOnly) bool bWon=false;
    UPROPERTY(BlueprintReadOnly) bool bGameOver=false;

private:
    TArray<FVector> EnemyPath;
    int32 SpawnRemaining=0;
    int32 AliveEnemies=0;
    float SpawnCooldown=0.f;
    float BreakCooldown=1.f;
    bool bWaveActive=false;
    void SpawnEnemy();
    void CreateBuildPads();
    void CreateCamera();
};

UCLASS()
class PIXELDEFENSE3D_API APDPlayerController : public APlayerController
{
    GENERATED_BODY()
public:
    APDPlayerController();
    virtual void SetupInputComponent() override;
    virtual void PlayerTick(float DeltaSeconds) override;

    UPROPERTY(BlueprintReadOnly) EPDTowerKind SelectedKind=EPDTowerKind::Archer;
    UPROPERTY(BlueprintReadOnly) int32 SpeedIndex=0;

private:
    void SelectArcher();
    void SelectFrost();
    void SelectBombard();
    void SelectMage();
    void CycleSpeed();
    void CallWave();
    void TryBuildAtScreen(float X,float Y);
    void OnTouch(ETouchIndex::Type FingerIndex,FVector Location);
};

UCLASS()
class PIXELDEFENSE3D_API APDHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
