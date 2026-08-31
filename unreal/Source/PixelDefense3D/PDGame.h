#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "PDGame.generated.h"

class UStaticMeshComponent;
class USkeletalMeshComponent;
class UTexture2D;
class UAnimSequence;

UENUM(BlueprintType)
enum class EPDTowerKind : uint8
{
    Archer,
    Frost,
    Bombard,
    Mage
};

UCLASS()
class PIXELDEFENSE3D_API APDVillager : public AActor
{
    GENERATED_BODY()
public:
    APDVillager();
    virtual void Tick(float DeltaSeconds) override;
    void InitVillager(const FVector& InA,const FVector& InB,FName MeshName,float InPhase);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) USkeletalMeshComponent* CharacterVisual;

private:
    FVector PointA=FVector::ZeroVector;
    FVector PointB=FVector::ZeroVector;
    bool bGoingToB=true;
    float Speed=92.f;
    float PauseRemaining=0.f;
    UPROPERTY() UAnimSequence* WalkAnimation=nullptr;
    UPROPERTY() UAnimSequence* IdleAnimation=nullptr;
    void PlayLoop(UAnimSequence* Animation);
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
    void UseProductionCharacter(FName MeshName);
    float GetProgress() const { return Progress; }
    bool IsTargetable() const { return !bDying && HP>0.f; }
    int32 GetReward() const { return Reward; }
    int32 GetLeak() const { return Leak; }

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* Visual;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) USkeletalMeshComponent* CharacterVisual;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* HealthBarBack;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* HealthBarFill;
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
    bool bDying=false;
};

UCLASS()
class PIXELDEFENSE3D_API APDTower : public AActor
{
    GENERATED_BODY()
public:
    APDTower();
    virtual void Tick(float DeltaSeconds) override;
    void Configure(EPDTowerKind InKind);
    void UseProductionMesh(FName MeshName);
    void UseProductionDefender(FName MeshName);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) UStaticMeshComponent* Visual;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) USkeletalMeshComponent* Defender;
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
    float AttackAnimationRemaining=0.f;
    UPROPERTY() UAnimSequence* IdleAnimation=nullptr;
    UPROPERTY() UAnimSequence* AttackAnimation=nullptr;
    void PlayAttackAnimation();
    void RestoreIdleAnimation();
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
    void StartGame();
    void TogglePauseMenu();

    bool IsGameStarted() const { return bGameStarted; }
    bool IsPauseMenuOpen() const { return bPauseMenuOpen; }
    bool IsWaveActive() const { return bWaveActive; }
    bool IsPreparing() const { return bGameStarted && !bWaveActive && Wave==0; }
    float GetWaveCountdown() const { return FMath::Max(0.f,BreakCooldown); }
    int32 GetBuiltTowerCount() const { return BuiltTowerCount; }

    UPROPERTY(BlueprintReadOnly) int32 Gold=130;
    UPROPERTY(BlueprintReadOnly) int32 Lives=15;
    UPROPERTY(BlueprintReadOnly) int32 Wave=0;
    UPROPERTY(BlueprintReadOnly) int32 TotalWaves=20;
    UPROPERTY(BlueprintReadOnly) bool bWon=false;
    UPROPERTY(BlueprintReadOnly) bool bGameOver=false;
    UPROPERTY(BlueprintReadOnly) int32 BuiltTowerCount=0;

private:
    TArray<FVector> EnemyPath;
    int32 SpawnRemaining=0;
    int32 AliveEnemies=0;
    float SpawnCooldown=0.f;
    float BreakCooldown=1.f;
    bool bWaveActive=false;
    bool bGameStarted=false;
    bool bPauseMenuOpen=false;
    void SpawnEnemy();
    void CreateBuildPads();
    void CreateVillagers();
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
    void StartGame();
    void TogglePause();
    void ZoomIn();
    void ZoomOut();
    void TryBuildAtScreen(float X,float Y);
    bool HandleScreenAction(float X,float Y);
    void PanCamera(const FVector2D& ScreenDelta);
    void OnTouchPressed(ETouchIndex::Type FingerIndex,FVector Location);
    void OnTouchReleased(ETouchIndex::Type FingerIndex,FVector Location);

    bool bTouchActive=false;
    bool bTouchDragged=false;
    bool bMouseDragging=false;
    FVector2D TouchStartPosition=FVector2D::ZeroVector;
    FVector2D LastTouchPosition=FVector2D::ZeroVector;
    FVector2D LastMousePosition=FVector2D::ZeroVector;
};

UCLASS()
class PIXELDEFENSE3D_API APDHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;

private:
    void DrawPanel(float X,float Y,float W,float H,const FLinearColor& Color);
    void DrawButton(float X,float Y,float W,float H,const FLinearColor& Color);
    void DrawLabel(const FString& Text,float X,float Y,const FLinearColor& Color,
                   float Scale=1.f);
};
