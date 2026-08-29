#include "PDGame.h"
#include "PDVisuals.h"

#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Animation/AnimSequence.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Modules/ModuleManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
template <typename AssetType>
AssetType* FindKayKitAsset(const FName RequestedName)
{
    static TMap<FName,TWeakObjectPtr<AssetType>> Cache;
    if(const TWeakObjectPtr<AssetType>* Cached=Cache.Find(RequestedName))
        if(Cached->IsValid()) return Cached->Get();
    FAssetRegistryModule& Module =
        FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
    TArray<FAssetData> Assets;
    Module.Get().GetAssetsByPath(
        FName(TEXT("/Game/ThirdParty/KayKit")), Assets, true, false);
    const FTopLevelAssetPath WantedClass = AssetType::StaticClass()->GetClassPathName();
    for(const FAssetData& Asset : Assets)
    {
        if(Asset.AssetName == RequestedName && Asset.AssetClassPath == WantedClass)
        {
            AssetType* Loaded=Cast<AssetType>(Asset.GetAsset());
            if(Loaded) Cache.Add(RequestedName,Loaded);
            return Loaded;
        }
    }
    return nullptr;
}

UAnimSequence* FindCharacterAnimation(USkeletalMesh* Mesh,const TCHAR* Token,
                                       const TCHAR* Alternate=nullptr)
{
    if(!Mesh || !Mesh->GetSkeleton()) return nullptr;
    const FString CacheKey=Mesh->GetPathName()+TEXT("|")+Token+
        (Alternate?FString(Alternate):FString());
    static TMap<FString,TWeakObjectPtr<UAnimSequence>> Cache;
    if(const TWeakObjectPtr<UAnimSequence>* Cached=Cache.Find(CacheKey))
        if(Cached->IsValid()) return Cached->Get();
    FAssetRegistryModule& Module =
        FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
    TArray<FAssetData> Assets;
    Module.Get().GetAssetsByPath(
        FName(TEXT("/Game/ThirdParty/KayKit")), Assets, true, false);
    const FString Wanted(Token);
    const FString Other=Alternate?FString(Alternate):FString();
    for(const FAssetData& Asset : Assets)
    {
        if(Asset.AssetClassPath != UAnimSequence::StaticClass()->GetClassPathName())
            continue;
        const FString Name=Asset.AssetName.ToString().ToLower();
        if(!Name.Contains(Wanted) && (Other.IsEmpty()||!Name.Contains(Other)))
            continue;
        UAnimSequence* Animation=Cast<UAnimSequence>(Asset.GetAsset());
        if(Animation && Animation->GetSkeleton()==Mesh->GetSkeleton())
        {
            Cache.Add(CacheKey,Animation);
            return Animation;
        }
    }
    return nullptr;
}
}

APDEnemy::APDEnemy()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>("Visual");
    RootComponent=Visual;
    CharacterVisual=CreateDefaultSubobject<USkeletalMeshComponent>("CharacterVisual");
    CharacterVisual->SetupAttachment(Visual);
    CharacterVisual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    CharacterVisual->SetVisibility(false);
    Visual->SetCollisionProfileName("BlockAllDynamic");
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if(Shape.Succeeded()) Visual->SetStaticMesh(Shape.Object);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(
        TEXT("/Engine/BasicShapes/Cube.Cube"));
    HealthBarBack=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("HealthBarBack"));
    HealthBarBack->SetupAttachment(Visual);
    HealthBarBack->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    HealthBarFill=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("HealthBarFill"));
    HealthBarFill->SetupAttachment(Visual);
    HealthBarFill->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if(Cube.Succeeded())
    {
        HealthBarBack->SetStaticMesh(Cube.Object);
        HealthBarFill->SetStaticMesh(Cube.Object);
    }
    HealthBarBack->SetRelativeLocation(FVector(0,0,215));
    HealthBarBack->SetRelativeScale3D(FVector(1.25f,.13f,.075f));
    HealthBarFill->SetRelativeLocation(FVector(0,-2,218));
    HealthBarFill->SetRelativeScale3D(FVector(1.18f,.15f,.085f));
    if(UMaterialInterface* Back=LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/Art/Production/Materials/M_Health_Back.M_Health_Back")))
        HealthBarBack->SetMaterial(0,Back);
    if(UMaterialInterface* Fill=LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/Art/Production/Materials/M_Health_Fill.M_Health_Fill")))
        HealthBarFill->SetMaterial(0,Fill);
    SetActorScale3D(FVector(.55f,.55f,.8f));
}

void APDEnemy::InitEnemy(const TArray<FVector>& InPath,float InHP,float InSpeed,
                         int32 InArmor,int32 InReward,int32 InLeak)
{
    Path=InPath; HP=MaxHP=InHP; Speed=InSpeed; Armor=InArmor; Reward=InReward; Leak=InLeak;
    PathIndex=1; Travelled=0.f; TotalDistance=0.f;
    for(int32 i=1;i<Path.Num();++i) TotalDistance+=FVector::Distance(Path[i-1],Path[i]);
    if(Path.Num()) SetActorLocation(Path[0]);
}

void APDEnemy::UseProductionCharacter(FName MeshName)
{
    if(USkeletalMesh* Mesh=FindKayKitAsset<USkeletalMesh>(MeshName))
    {
        CharacterVisual->SetSkeletalMeshAsset(Mesh);
        CharacterVisual->SetRelativeRotation(FRotator(0.f,-90.f,0.f));
        CharacterVisual->SetVisibility(true);
        Visual->SetVisibility(false,false);
        if(UAnimSequence* Walking=FindCharacterAnimation(
            Mesh,TEXT("walk"),TEXT("run")))
        {
            CharacterVisual->SetAnimationMode(EAnimationMode::AnimationSingleNode);
            CharacterVisual->SetAnimation(Walking);
            CharacterVisual->Play(true);
        }
    }
}

void APDEnemy::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(bDying || Path.Num()<2 || PathIndex>=Path.Num()) return;
    if(GetWorld()->GetTimeSeconds()>=SlowUntil) SlowMultiplier=1.f;
    float Left=Speed*SlowMultiplier*DeltaSeconds;
    while(Left>0.f && PathIndex<Path.Num())
    {
        const FVector Here=GetActorLocation();
        const FVector Target=Path[PathIndex];
        FVector Facing=Target-Here; Facing.Z=0.f;
        if(!Facing.IsNearlyZero())
            SetActorRotation(FRotator(0,Facing.Rotation().Yaw,0));
        const float Distance=FVector::Distance(Here,Target);
        if(Distance<=Left)
        {
            SetActorLocation(Target); Left-=Distance; Travelled+=Distance; ++PathIndex;
        }
        else
        {
            SetActorLocation(FMath::VInterpConstantTo(Here,Target,DeltaSeconds,Speed*SlowMultiplier));
            Travelled+=Left; Left=0.f;
        }
    }
    Progress=FMath::Clamp(Travelled/FMath::Max(1.f,TotalDistance),0.f,1.f);
    const float Health=FMath::Clamp(HP/FMath::Max(1.f,MaxHP),0.f,1.f);
    HealthBarFill->SetRelativeScale3D(FVector(1.18f*Health,.15f,.085f));
    HealthBarFill->SetRelativeLocation(FVector(-59.f*(1.f-Health),-2.f,218.f));
    if(PathIndex>=Path.Num())
    {
        if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>()) GM->EnemyLeaked(this);
        Destroy();
    }
}

void APDEnemy::ApplyHit(float Amount,bool bIgnoreArmor,float InSlowFactor,float SlowDuration)
{
    if(bDying) return;
    HP-=bIgnoreArmor?Amount:FMath::Max(1.f,Amount-Armor);
    if(InSlowFactor<1.f)
    {
        SlowMultiplier=InSlowFactor;
        SlowUntil=GetWorld()->GetTimeSeconds()+SlowDuration;
    }
    if(HP<=0.f)
    {
        bDying=true; HP=0.f;
        if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>())
            GM->EnemyKilled(this);
        SetActorEnableCollision(false);
        HealthBarBack->SetVisibility(false);
        HealthBarFill->SetVisibility(false);
        if(USkeletalMesh* Mesh=CharacterVisual->GetSkeletalMeshAsset())
            if(UAnimSequence* Death=FindCharacterAnimation(Mesh,TEXT("death"),TEXT("die")))
            {
                CharacterVisual->SetAnimation(Death);
                CharacterVisual->Play(false);
            }
        SetLifeSpan(.9f);
    }
}

APDTower::APDTower()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>("Visual");
    RootComponent=Visual;
    Defender=CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Defender"));
    Defender->SetupAttachment(Visual);
    Defender->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Defender->SetVisibility(false);
    Defender->SetRelativeLocation(FVector(0,0,235));
    Defender->SetRelativeRotation(FRotator(0,-90,0));
    Defender->SetRelativeScale3D(FVector(.58f));
    Visual->SetCollisionProfileName("BlockAllDynamic");
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if(Shape.Succeeded()) Visual->SetStaticMesh(Shape.Object);
    SetActorScale3D(FVector(.75f,.75f,1.5f));
}

void APDTower::UseProductionMesh(FName MeshName)
{
    if(UStaticMesh* Mesh=FindKayKitAsset<UStaticMesh>(MeshName))
    {
        Visual->SetStaticMesh(Mesh);
        SetActorScale3D(FVector(1.35f));
    }
}

void APDTower::UseProductionDefender(FName MeshName)
{
    if(USkeletalMesh* Mesh=FindKayKitAsset<USkeletalMesh>(MeshName))
    {
        Defender->SetSkeletalMeshAsset(Mesh);
        Defender->SetVisibility(true);
        IdleAnimation=FindCharacterAnimation(Mesh,TEXT("idle"));
        AttackAnimation=FindCharacterAnimation(Mesh,TEXT("attack"),TEXT("shoot"));
        RestoreIdleAnimation();
    }
}

void APDTower::RestoreIdleAnimation()
{
    AttackAnimationRemaining=0.f;
    if(!IdleAnimation) return;
    Defender->SetAnimationMode(EAnimationMode::AnimationSingleNode);
    Defender->SetAnimation(IdleAnimation);
    Defender->Play(true);
}

void APDTower::PlayAttackAnimation()
{
    if(!AttackAnimation) return;
    Defender->SetAnimationMode(EAnimationMode::AnimationSingleNode);
    Defender->SetAnimation(AttackAnimation);
    Defender->Play(false);
    AttackAnimationRemaining=FMath::Clamp(
        AttackAnimation->GetPlayLength(),.25f,1.2f);
}

void APDTower::Configure(EPDTowerKind InKind)
{
    Kind=InKind; SplashRadius=0.f; SlowFactor=1.f; SlowDuration=0.f; bIgnoreArmor=false;
    switch(Kind)
    {
        case EPDTowerKind::Archer:
            Range=1050.f; Damage=8.f; ShotsPerSecond=1.45f;
            UseProductionMesh(FName(TEXT("building_archeryrange_green")));
            UseProductionDefender(FName(TEXT("RogueHooded"))); break;
        case EPDTowerKind::Frost:
            Range=900.f; Damage=4.f; ShotsPerSecond=.75f; SlowFactor=.55f; SlowDuration=1.8f;
            UseProductionMesh(FName(TEXT("building_tower_B_blue")));
            UseProductionDefender(FName(TEXT("Mage"))); break;
        case EPDTowerKind::Bombard:
            Range=1150.f; Damage=22.f; ShotsPerSecond=.42f; SplashRadius=320.f;
            UseProductionMesh(FName(TEXT("building_tower_catapult_red")));
            UseProductionDefender(FName(TEXT("Barbarian"))); break;
        case EPDTowerKind::Mage:
            Range=1000.f; Damage=17.f; ShotsPerSecond=.65f; bIgnoreArmor=true;
            UseProductionMesh(FName(TEXT("building_tower_A_yellow")));
            UseProductionDefender(FName(TEXT("Knight"))); break;
    }
}

void APDTower::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(AttackAnimationRemaining>0.f)
    {
        AttackAnimationRemaining-=DeltaSeconds;
        if(AttackAnimationRemaining<=0.f) RestoreIdleAnimation();
    }
    Cooldown-=DeltaSeconds;
    if(Cooldown>0.f) return;
    APDEnemy* Target=nullptr; float Best=-1.f;
    for(TActorIterator<APDEnemy> It(GetWorld());It;++It)
    {
        if(!It->IsTargetable()) continue;
        const float D=FVector::Dist2D(GetActorLocation(),It->GetActorLocation());
        if(D<=Range && It->GetProgress()>Best){Target=*It;Best=It->GetProgress();}
    }
    if(!Target) return;
    const FVector Muzzle=GetActorLocation()+FVector(0,0,230);
    APDProjectile* Projectile=GetWorld()->SpawnActor<APDProjectile>(
        Muzzle,FRotator::ZeroRotator);
    if(Projectile)
    {
        Projectile->Init(Target,Kind,Damage,bIgnoreArmor,SplashRadius,
                         SlowFactor,SlowDuration);
        PlayAttackAnimation();
    }
    Cooldown=1.f/ShotsPerSecond;
}

APDBuildPad::APDBuildPad()
{
    PrimaryActorTick.bCanEverTick=false;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>("Visual");
    RootComponent=Visual;
    Visual->SetCollisionProfileName("BlockAll");
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if(Shape.Succeeded()) Visual->SetStaticMesh(Shape.Object);
    SetActorScale3D(FVector(1.15f,1.15f,.18f));
}

APDGameMode::APDGameMode()
{
    PrimaryActorTick.bCanEverTick=true;
    PlayerControllerClass=APDPlayerController::StaticClass();
    HUDClass=APDHUD::StaticClass();
    DefaultPawnClass=nullptr;
}

void APDGameMode::BeginPlay()
{
    Super::BeginPlay();
    EnemyPath={
        FVector(-3200,-1300,90),FVector(-2300,-450,90),FVector(-1200,-850,90),
        FVector(-250,-100,90),FVector(900,-650,90),FVector(1900,100,90),FVector(3100,850,90)
    };
    GetWorld()->SpawnActor<APDEnvironment>();
    CreateBuildPads(); CreateCamera();
}

void APDGameMode::CreateBuildPads()
{
    const FVector Pads[]={
        {-2450,-1100,70},{-1900,-850,70},{-1450,-200,70},{-850,-1200,70},
        {-300,450,70},{350,-700,70},{850,50,70},{1350,-1050,70},
        {1650,500,70},{2300,-300,70},{2650,650,70}
    };
    for(const FVector& P:Pads) GetWorld()->SpawnActor<APDBuildPad>(P,FRotator::ZeroRotator);
}

void APDGameMode::CreateCamera()
{
    ACameraActor* Camera=GetWorld()->SpawnActor<ACameraActor>(
        FVector(0,-6900,4400),FRotator(-34,90,0));
    if(Camera && Camera->GetCameraComponent())
    {
        Camera->GetCameraComponent()->SetFieldOfView(53.f);
        Camera->GetCameraComponent()->PostProcessBlendWeight=.18f;
    }
    if(APlayerController* PC=UGameplayStatics::GetPlayerController(this,0))
        PC->SetViewTarget(Camera);
}

void APDGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(bGameOver||bWon) return;
    if(bWaveActive)
    {
        SpawnCooldown-=DeltaSeconds;
        if(SpawnRemaining>0 && SpawnCooldown<=0.f){SpawnEnemy();SpawnCooldown=.72f;}
        if(SpawnRemaining==0 && AliveEnemies==0)
        {
            bWaveActive=false;
            if(Wave>=TotalWaves) bWon=true;
            else BreakCooldown=6.f;
        }
    }
    else
    {
        BreakCooldown-=DeltaSeconds;
        if(BreakCooldown<=0.f) StartNextWave();
    }
}

void APDGameMode::StartNextWave()
{
    if(bWaveActive||Wave>=TotalWaves||bGameOver) return;
    ++Wave; bWaveActive=true; SpawnRemaining=6+Wave*2; SpawnCooldown=0.f;
}

void APDGameMode::SpawnEnemy()
{
    const bool bBoss=(Wave==10||Wave==15||Wave==20)&&SpawnRemaining==1;
    const bool bArmored=!bBoss && Wave>=5 && SpawnRemaining%5==0;
    const bool bFast=!bBoss && SpawnRemaining%4==0;
    const float Ramp=1.f+(Wave-1)*.20f;
    APDEnemy* E=GetWorld()->SpawnActor<APDEnemy>();
    if(E)
    {
        const float BaseHP=bBoss?220.f:(bArmored?55.f:(bFast?16.f:25.f));
        const float MoveSpeed=bBoss?120.f:(bFast?410.f:245.f);
        E->InitEnemy(EnemyPath,BaseHP*Ramp,MoveSpeed,bArmored?4:0,bBoss?45:(bArmored?10:5),bBoss?5:1);
        const FName Character = bBoss ? FName(TEXT("Skeleton_Warrior"))
            : (bFast ? FName(TEXT("Skeleton_Rogue"))
            : (bArmored ? FName(TEXT("Skeleton_Mage")) : FName(TEXT("Skeleton_Minion"))));
        E->UseProductionCharacter(Character);
        if(bBoss) E->SetActorScale3D(FVector(1.4f));
        ++AliveEnemies;
    }
    --SpawnRemaining;
}

void APDGameMode::EnemyKilled(APDEnemy* Enemy)
{
    if(!Enemy) return;
    Gold+=Enemy->GetReward(); AliveEnemies=FMath::Max(0,AliveEnemies-1);
}

void APDGameMode::EnemyLeaked(APDEnemy* Enemy)
{
    if(!Enemy) return;
    Lives-=Enemy->GetLeak(); AliveEnemies=FMath::Max(0,AliveEnemies-1);
    if(Lives<=0){Lives=0;bGameOver=true;}
}

bool APDGameMode::BuildTower(APDBuildPad* Pad,EPDTowerKind Kind)
{
    if(!Pad||Pad->bOccupied||bGameOver) return false;
    const int32 Costs[]={40,60,80,130};
    const int32 Cost=Costs[static_cast<int32>(Kind)];
    if(Gold<Cost) return false;
    APDTower* Tower=GetWorld()->SpawnActor<APDTower>(
        Pad->GetActorLocation()+FVector(0,0,95),FRotator::ZeroRotator);
    if(!Tower) return false;
    Tower->Configure(Kind); Gold-=Cost; Pad->bOccupied=true; Pad->SetActorHiddenInGame(true);
    Pad->SetActorEnableCollision(false); return true;
}

APDPlayerController::APDPlayerController()
{
    bShowMouseCursor=true; bEnableClickEvents=true; bEnableTouchEvents=true;
    PrimaryActorTick.bCanEverTick=true;
}

void APDPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();
    InputComponent->BindKey(EKeys::One,IE_Pressed,this,&APDPlayerController::SelectArcher);
    InputComponent->BindKey(EKeys::Two,IE_Pressed,this,&APDPlayerController::SelectFrost);
    InputComponent->BindKey(EKeys::Three,IE_Pressed,this,&APDPlayerController::SelectBombard);
    InputComponent->BindKey(EKeys::Four,IE_Pressed,this,&APDPlayerController::SelectMage);
    InputComponent->BindKey(EKeys::S,IE_Pressed,this,&APDPlayerController::CycleSpeed);
    InputComponent->BindKey(EKeys::N,IE_Pressed,this,&APDPlayerController::CallWave);
    InputComponent->BindTouch(IE_Pressed,this,&APDPlayerController::OnTouch);
}

void APDPlayerController::PlayerTick(float DeltaSeconds)
{
    Super::PlayerTick(DeltaSeconds);
    if(WasInputKeyJustPressed(EKeys::LeftMouseButton))
    {
        float X,Y;if(GetMousePosition(X,Y)) TryBuildAtScreen(X,Y);
    }
}
void APDPlayerController::SelectArcher(){SelectedKind=EPDTowerKind::Archer;}
void APDPlayerController::SelectFrost(){SelectedKind=EPDTowerKind::Frost;}
void APDPlayerController::SelectBombard(){SelectedKind=EPDTowerKind::Bombard;}
void APDPlayerController::SelectMage(){SelectedKind=EPDTowerKind::Mage;}
void APDPlayerController::CycleSpeed()
{
    SpeedIndex=(SpeedIndex+1)%3; const float Speeds[]={1.f,2.f,3.f};
    UGameplayStatics::SetGlobalTimeDilation(this,Speeds[SpeedIndex]);
}
void APDPlayerController::CallWave()
{
    if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>()) GM->StartNextWave();
}
void APDPlayerController::OnTouch(ETouchIndex::Type FingerIndex,FVector Location)
{
    TryBuildAtScreen(Location.X,Location.Y);
}
void APDPlayerController::TryBuildAtScreen(float X,float Y)
{
    FHitResult Hit;
    if(GetHitResultAtScreenPosition(FVector2D(X,Y),ECC_Visibility,true,Hit))
        if(APDBuildPad* Pad=Cast<APDBuildPad>(Hit.GetActor()))
            if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>())
                GM->BuildTower(Pad,SelectedKind);
}

void APDHUD::DrawHUD()
{
    Super::DrawHUD();
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    APDPlayerController* PC=Cast<APDPlayerController>(GetOwningPlayerController());
    if(!GM||!Canvas) return;
    const FString Names[]={"ARCHERS","GIVRE","BOMBARDE","MAGES"};
    const int32 Selected=PC?static_cast<int32>(PC->SelectedKind):0;
    DrawText(FString::Printf(TEXT("VIES %d     OR %d     VAGUE %d/%d"),
        GM->Lives,GM->Gold,GM->Wave,GM->TotalWaves),FLinearColor::White,40,35,nullptr,1.25f);
    DrawText(FString::Printf(TEXT("TOUR: %s   [1-4] choisir  [clic/toucher] construire  [N] vague  [S] vitesse"),
        *Names[Selected]),FLinearColor(1.f,.8f,.25f),40,75,nullptr,.9f);
    if(GM->bWon) DrawText(TEXT("VICTOIRE !"),FLinearColor::Green,Canvas->SizeX*.4f,Canvas->SizeY*.45f,nullptr,2.2f);
    if(GM->bGameOver) DrawText(TEXT("BASE DETRUITE"),FLinearColor::Red,Canvas->SizeX*.35f,Canvas->SizeY*.45f,nullptr,2.2f);
}
