#include "PDGame.h"
#include "PDVisuals.h"

#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Animation/AnimSequence.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Canvas.h"
#include "CanvasItem.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/Texture2D.h"
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

static UTexture2D* FindKenneyUITexture(const TCHAR* Token)
{
    FAssetRegistryModule& Module=
        FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
    TArray<FString> PathsToScan;
    PathsToScan.Add(TEXT("/Game/ThirdParty/Kenney"));
    Module.Get().ScanPathsSynchronous(PathsToScan,false);
    TArray<FAssetData> Assets;
    Module.Get().GetAssetsByPath(
        FName(TEXT("/Game/ThirdParty/Kenney")),Assets,true,false);
    const FString Wanted(Token);
    for(const FAssetData& Asset:Assets)
    {
        if(Asset.AssetClassPath!=UTexture2D::StaticClass()->GetClassPathName())
            continue;
        if(Asset.AssetName.ToString().ToLower().Contains(Wanted))
            return Cast<UTexture2D>(Asset.GetAsset());
    }
    return nullptr;
}

APDVillager::APDVillager()
{
    PrimaryActorTick.bCanEverTick=true;
    CharacterVisual=CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("CharacterVisual"));
    RootComponent=CharacterVisual;
    CharacterVisual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    CharacterVisual->SetRelativeRotation(FRotator(0,-90,0));
    CharacterVisual->SetRelativeScale3D(FVector(.58f));
}

void APDVillager::PlayLoop(UAnimSequence* Animation)
{
    if(!Animation) return;
    CharacterVisual->SetAnimationMode(EAnimationMode::AnimationSingleNode);
    CharacterVisual->SetAnimation(Animation);
    CharacterVisual->Play(true);
}

void APDVillager::InitVillager(const FVector& InA,const FVector& InB,
                               FName MeshName,float InPhase)
{
    PointA=InA;
    PointB=InB;
    const float Alpha=FMath::Frac(FMath::Abs(InPhase));
    SetActorLocation(FMath::Lerp(PointA,PointB,Alpha));
    Speed=82.f+Alpha*38.f;
    if(USkeletalMesh* Mesh=FindKayKitAsset<USkeletalMesh>(MeshName))
    {
        CharacterVisual->SetSkeletalMeshAsset(Mesh);
        WalkAnimation=FindCharacterAnimation(Mesh,TEXT("walk"),TEXT("run"));
        IdleAnimation=FindCharacterAnimation(Mesh,TEXT("idle"));
        PlayLoop(WalkAnimation);
    }
}

void APDVillager::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(PauseRemaining>0.f)
    {
        PauseRemaining-=DeltaSeconds;
        if(PauseRemaining<=0.f) PlayLoop(WalkAnimation);
        return;
    }
    const FVector Target=bGoingToB?PointB:PointA;
    FVector Direction=Target-GetActorLocation();
    Direction.Z=0.f;
    if(Direction.SizeSquared()<FMath::Square(24.f))
    {
        bGoingToB=!bGoingToB;
        PauseRemaining=1.3f+FMath::FRandRange(0.f,2.4f);
        PlayLoop(IdleAnimation);
        return;
    }
    SetActorRotation(FRotator(0,Direction.Rotation().Yaw,0));
    SetActorLocation(FMath::VInterpConstantTo(
        GetActorLocation(),Target,DeltaSeconds,Speed));
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
        FVector(-3300,-1250,90),FVector(-2920,-980,90),FVector(-2460,-650,90),
        FVector(-1950,-500,90),FVector(-1450,-660,90),FVector(-930,-720,90),
        FVector(-470,-430,90),FVector(20,-90,90),FVector(560,-270,90),
        FVector(1080,-520,90),FVector(1570,-280,90),FVector(2040,80,90),
        FVector(2550,420,90),FVector(3150,800,90)
    };
    GetWorld()->SpawnActor<APDEnvironment>();
    CreateBuildPads(); CreateVillagers(); CreateCamera();
}

void APDGameMode::StartGame()
{
    if(bGameStarted) return;
    bGameStarted=true;
    bPauseMenuOpen=false;
    BreakCooldown=.35f;
}

void APDGameMode::TogglePauseMenu()
{
    if(!bGameStarted || bWon || bGameOver) return;
    bPauseMenuOpen=!bPauseMenuOpen;
}

void APDGameMode::CreateBuildPads()
{
    const FVector Pads[]={
        {-2780,-520,70},{-2260,-1080,70},{-1760,40,70},{-1250,-1160,70},
        {-650,120,70},{-180,-780,70},{420,260,70},{920,-980,70},
        {1430,210,70},{1900,-610,70},{2390,-40,70},{2780,760,70}
    };
    for(const FVector& P:Pads) GetWorld()->SpawnActor<APDBuildPad>(P,FRotator::ZeroRotator);
}

void APDGameMode::CreateVillagers()
{
    struct FRoute
    {
        FVector A;
        FVector B;
        const TCHAR* Mesh;
        float Phase;
    };
    const FRoute Routes[]={
        {{-2850,1040,45},{-2250,1280,45},TEXT("Rogue"),.18f},
        {{-2180,1450,45},{-1500,1120,45},TEXT("Mage"),.62f},
        {{1050,1120,45},{1650,1450,45},TEXT("Knight"),.34f},
        {{1740,1560,45},{2420,1260,45},TEXT("Barbarian"),.76f},
        {{420,700,45},{820,1080,45},TEXT("RogueHooded"),.48f},
        {{2920,1180,45},{3370,1450,45},TEXT("Knight"),.08f}
    };
    for(const FRoute& Route:Routes)
    {
        APDVillager* Villager=GetWorld()->SpawnActor<APDVillager>();
        if(Villager)
            Villager->InitVillager(Route.A,Route.B,FName(Route.Mesh),Route.Phase);
    }
}

void APDGameMode::CreateCamera()
{
    ACameraActor* Camera=GetWorld()->SpawnActor<ACameraActor>(
        FVector(0,-7000,4100),FRotator(-31,90,0));
    if(Camera && Camera->GetCameraComponent())
    {
        Camera->GetCameraComponent()->SetFieldOfView(56.f);
        Camera->GetCameraComponent()->PostProcessBlendWeight=.10f;
    }
    if(APlayerController* PC=UGameplayStatics::GetPlayerController(this,0))
        PC->SetViewTarget(Camera);
}

void APDGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(!bGameStarted||bPauseMenuOpen||bGameOver||bWon) return;
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
    if(!bGameStarted||bPauseMenuOpen||bWaveActive||Wave>=TotalWaves||bGameOver) return;
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
    if(!bGameStarted||bPauseMenuOpen||!Pad||Pad->bOccupied||bGameOver) return false;
    const int32 Costs[]={40,60,80,130};
    const int32 Cost=Costs[static_cast<int32>(Kind)];
    if(Gold<Cost) return false;
    APDTower* Tower=GetWorld()->SpawnActor<APDTower>(
        Pad->GetActorLocation()+FVector(0,0,95),FRotator::ZeroRotator);
    if(!Tower) return false;
    Tower->Configure(Kind); Gold-=Cost; Pad->bOccupied=true; ++BuiltTowerCount;
    Pad->SetActorHiddenInGame(true);
    Pad->SetActorEnableCollision(false); return true;
}

APDPlayerController::APDPlayerController()
{
    bShowMouseCursor=true;
    bEnableClickEvents=true;
    bEnableTouchEvents=true;
    bEnableMouseOverEvents=true;
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
    InputComponent->BindKey(EKeys::Enter,IE_Pressed,this,&APDPlayerController::StartGame);
    InputComponent->BindKey(EKeys::SpaceBar,IE_Pressed,this,&APDPlayerController::StartGame);
    InputComponent->BindKey(EKeys::P,IE_Pressed,this,&APDPlayerController::TogglePause);
    InputComponent->BindKey(EKeys::Escape,IE_Pressed,this,&APDPlayerController::TogglePause);
    InputComponent->BindKey(EKeys::MouseScrollUp,IE_Pressed,this,&APDPlayerController::ZoomIn);
    InputComponent->BindKey(EKeys::MouseScrollDown,IE_Pressed,this,&APDPlayerController::ZoomOut);
    InputComponent->BindTouch(IE_Pressed,this,&APDPlayerController::OnTouchPressed);
    InputComponent->BindTouch(IE_Released,this,&APDPlayerController::OnTouchReleased);
}

void APDPlayerController::PlayerTick(float DeltaSeconds)
{
    Super::PlayerTick(DeltaSeconds);

    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    if(!GM) return;

    float MouseX=0.f,MouseY=0.f;
    if(GetMousePosition(MouseX,MouseY))
    {
        const FVector2D Mouse(MouseX,MouseY);
        if(WasInputKeyJustPressed(EKeys::RightMouseButton))
        {
            bMouseDragging=true;
            LastMousePosition=Mouse;
        }
        if(bMouseDragging && IsInputKeyDown(EKeys::RightMouseButton))
        {
            PanCamera(Mouse-LastMousePosition);
            LastMousePosition=Mouse;
        }
        if(WasInputKeyJustReleased(EKeys::RightMouseButton))
            bMouseDragging=false;

        if(WasInputKeyJustPressed(EKeys::LeftMouseButton))
            if(!HandleScreenAction(MouseX,MouseY))
                TryBuildAtScreen(MouseX,MouseY);
    }

    if(bTouchActive)
    {
        float TouchX=0.f,TouchY=0.f;
        bool bPressed=false;
        GetInputTouchState(ETouchIndex::Touch1,TouchX,TouchY,bPressed);
        if(bPressed)
        {
            const FVector2D Current(TouchX,TouchY);
            if(FVector2D::Distance(Current,TouchStartPosition)>12.f)
                bTouchDragged=true;
            if(bTouchDragged) PanCamera(Current-LastTouchPosition);
            LastTouchPosition=Current;
        }
    }
}

void APDPlayerController::SelectArcher(){SelectedKind=EPDTowerKind::Archer;}
void APDPlayerController::SelectFrost(){SelectedKind=EPDTowerKind::Frost;}
void APDPlayerController::SelectBombard(){SelectedKind=EPDTowerKind::Bombard;}
void APDPlayerController::SelectMage(){SelectedKind=EPDTowerKind::Mage;}

void APDPlayerController::StartGame()
{
    if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>())
        GM->StartGame();
}

void APDPlayerController::TogglePause()
{
    if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>())
    {
        GM->TogglePauseMenu();
        const float Speeds[]={1.f,2.f,3.f};
        UGameplayStatics::SetGlobalTimeDilation(
            this,GM->IsPauseMenuOpen() ? .0001f : Speeds[SpeedIndex]);
    }
}

void APDPlayerController::CycleSpeed()
{
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    if(!GM||!GM->IsGameStarted()||GM->IsPauseMenuOpen()) return;
    SpeedIndex=(SpeedIndex+1)%3;
    const float Speeds[]={1.f,2.f,3.f};
    UGameplayStatics::SetGlobalTimeDilation(this,Speeds[SpeedIndex]);
}

void APDPlayerController::CallWave()
{
    if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>())
        GM->StartNextWave();
}

void APDPlayerController::ZoomIn()
{
    if(AActor* Camera=GetViewTarget())
    {
        FVector P=Camera->GetActorLocation();
        P.Z=FMath::Clamp(P.Z-260.f,3300.f,5000.f);
        P.Y=FMath::Clamp(P.Y+150.f,-7600.f,-5900.f);
        Camera->SetActorLocation(P);
    }
}

void APDPlayerController::ZoomOut()
{
    if(AActor* Camera=GetViewTarget())
    {
        FVector P=Camera->GetActorLocation();
        P.Z=FMath::Clamp(P.Z+260.f,3300.f,5000.f);
        P.Y=FMath::Clamp(P.Y-150.f,-7600.f,-5900.f);
        Camera->SetActorLocation(P);
    }
}

void APDPlayerController::PanCamera(const FVector2D& ScreenDelta)
{
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    if(!GM||!GM->IsGameStarted()||GM->IsPauseMenuOpen()) return;
    if(AActor* Camera=GetViewTarget())
    {
        FVector P=Camera->GetActorLocation();
        P.X=FMath::Clamp(P.X-ScreenDelta.X*2.15f,-1450.f,1450.f);
        P.Y=FMath::Clamp(P.Y+ScreenDelta.Y*1.75f,-7600.f,-5900.f);
        Camera->SetActorLocation(P);
    }
}

void APDPlayerController::OnTouchPressed(ETouchIndex::Type FingerIndex,FVector Location)
{
    if(FingerIndex!=ETouchIndex::Touch1) return;
    bTouchActive=true;
    bTouchDragged=false;
    TouchStartPosition=FVector2D(Location.X,Location.Y);
    LastTouchPosition=TouchStartPosition;
}

void APDPlayerController::OnTouchReleased(ETouchIndex::Type FingerIndex,FVector Location)
{
    if(FingerIndex!=ETouchIndex::Touch1) return;
    if(bTouchActive&&!bTouchDragged)
        if(!HandleScreenAction(Location.X,Location.Y))
            TryBuildAtScreen(Location.X,Location.Y);
    bTouchActive=false;
    bTouchDragged=false;
}

bool APDPlayerController::HandleScreenAction(float X,float Y)
{
    int32 Width=0,Height=0;
    GetViewportSize(Width,Height);
    if(Width<=0||Height<=0) return false;
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    if(!GM) return false;

    if(!GM->IsGameStarted())
    {
        if(X>Width*.34f&&X<Width*.66f&&Y>Height*.55f&&Y<Height*.70f)
        {
            StartGame();
            return true;
        }
        return true;
    }

    if(GM->IsPauseMenuOpen())
    {
        if(X>Width*.37f&&X<Width*.63f&&Y>Height*.54f&&Y<Height*.68f)
            TogglePause();
        return true;
    }

    if(Y>Height-165.f)
    {
        const float StartX=24.f;
        const float CardWidth=132.f;
        const int32 Card=FMath::FloorToInt((X-StartX)/CardWidth);
        if(Card>=0&&Card<4)
        {
            SelectedKind=static_cast<EPDTowerKind>(Card);
            return true;
        }
        return true;
    }

    if(Y<108.f)
    {
        if(X>Width-92.f){TogglePause();return true;}
        if(X>Width-190.f){CycleSpeed();return true;}
        if(X>Width-302.f){CallWave();return true;}
    }
    return false;
}

void APDPlayerController::TryBuildAtScreen(float X,float Y)
{
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    if(!GM||!GM->IsGameStarted()||GM->IsPauseMenuOpen()) return;
    FHitResult Hit;
    if(GetHitResultAtScreenPosition(FVector2D(X,Y),ECC_Visibility,true,Hit))
        if(APDBuildPad* Pad=Cast<APDBuildPad>(Hit.GetActor()))
            GM->BuildTower(Pad,SelectedKind);
}

void APDHUD::DrawPanel(float X,float Y,float W,float H,const FLinearColor& Color)
{
    FCanvasTileItem Base(FVector2D(X,Y),FVector2D(W,H),Color);
    Base.BlendMode=SE_BLEND_Translucent;
    Canvas->DrawItem(Base);
    if(PanelTexture&&W>105.f&&H>48.f)
    {
        FCanvasTileItem Art(FVector2D(X,Y),PanelTexture->GetResource(),
            FVector2D(W,H),FLinearColor(1.f,1.f,1.f,.38f));
        Art.BlendMode=SE_BLEND_Translucent;
        Canvas->DrawItem(Art);
    }
}

void APDHUD::DrawButton(float X,float Y,float W,float H,const FLinearColor& Color)
{
    FCanvasTileItem Base(FVector2D(X,Y),FVector2D(W,H),Color);
    Base.BlendMode=SE_BLEND_Translucent;
    Canvas->DrawItem(Base);
    if(ButtonTexture)
    {
        FCanvasTileItem Art(FVector2D(X,Y),ButtonTexture->GetResource(),
            FVector2D(W,H),FLinearColor(1.f,1.f,1.f,.82f));
        Art.BlendMode=SE_BLEND_Translucent;
        Canvas->DrawItem(Art);
    }
}

void APDHUD::DrawLabel(const FString& Text,float X,float Y,
                       const FLinearColor& Color,float Scale)
{
    DrawText(Text,Color,X,Y,nullptr,Scale,false);
}

void APDHUD::DrawHUD()
{
    Super::DrawHUD();
    APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>();
    APDPlayerController* PC=Cast<APDPlayerController>(GetOwningPlayerController());
    if(!GM||!PC||!Canvas) return;

    const float W=Canvas->SizeX;
    const float H=Canvas->SizeY;
    const FLinearColor Ink(.035f,.055f,.075f,.93f);
    const FLinearColor InkSoft(.055f,.085f,.115f,.84f);
    const FLinearColor Gold(1.f,.72f,.20f,1.f);
    const FLinearColor Cream(1.f,.95f,.80f,1.f);
    const FLinearColor Green(.25f,.90f,.48f,1.f);
    if(!PanelTexture) PanelTexture=FindKenneyUITexture(TEXT("panel"));
    if(!ButtonTexture) ButtonTexture=FindKenneyUITexture(TEXT("button"));

    if(!GM->IsGameStarted())
    {
        DrawPanel(0,0,W,H,FLinearColor(.015f,.025f,.045f,.66f));
        DrawPanel(W*.18f,H*.16f,W*.64f,H*.62f,Ink);
        DrawPanel(W*.18f,H*.16f,W*.64f,9.f,Gold);
        DrawLabel(TEXT("PIXEL DEFENSE"),W*.32f,H*.235f,Cream,2.2f);
        DrawLabel(TEXT("LES GARDIENS DE LA VALLEE"),W*.355f,H*.345f,Gold,1.0f);
        DrawLabel(TEXT("Protegez le royaume pendant 20 vagues"),W*.35f,H*.415f,
                  FLinearColor(.78f,.84f,.88f,1.f),.9f);
        DrawButton(W*.34f,H*.55f,W*.32f,H*.15f,FLinearColor(.10f,.38f,.20f,.98f));
        DrawPanel(W*.34f,H*.55f,W*.32f,5.f,Green);
        DrawLabel(TEXT("JOUER"),W*.455f,H*.592f,FLinearColor::White,1.5f);
        DrawLabel(TEXT("ENTREE / ESPACE"),W*.43f,H*.715f,
                  FLinearColor(.58f,.66f,.72f,1.f),.75f);
        return;
    }

    DrawPanel(22,20,500,76,Ink);
    DrawPanel(22,20,500,4,Gold);
    DrawLabel(FString::Printf(TEXT("COEURS  %d"),GM->Lives),42,40,
              GM->Lives<=5?FLinearColor(.98f,.24f,.22f):Cream,1.05f);
    DrawLabel(FString::Printf(TEXT("OR  %d"),GM->Gold),174,40,Gold,1.05f);
    DrawLabel(FString::Printf(TEXT("VAGUE  %d/%d"),GM->Wave,GM->TotalWaves),
              286,40,Cream,1.05f);
    DrawLabel(FString::Printf(TEXT("TOURS  %d"),GM->GetBuiltTowerCount()),
              420,40,FLinearColor(.55f,.88f,1.f),.9f);

    const float ButtonY=20.f;
    DrawButton(W-300,ButtonY,102,76,GM->IsWaveActive()?InkSoft:
              FLinearColor(.12f,.46f,.25f,.94f));
    DrawLabel(GM->IsWaveActive()?TEXT("EN COURS"):TEXT("VAGUE"),
              W-282,48,Green,.82f);
    DrawButton(W-190,ButtonY,90,76,Ink);
    DrawLabel(FString::Printf(TEXT("x%d"),PC->SpeedIndex+1),W-161,43,Gold,1.25f);
    DrawButton(W-92,ButtonY,70,76,Ink);
    DrawLabel(TEXT("II"),W-70,43,Cream,1.2f);

    const FString Names[]={TEXT("ARCHERS"),TEXT("GIVRE"),TEXT("BOMBARDE"),TEXT("ARCANES")};
    const FString Costs[]={TEXT("40 OR"),TEXT("60 OR"),TEXT("80 OR"),TEXT("130 OR")};
    const FLinearColor Colors[]={
        FLinearColor(.18f,.72f,.42f,1.f),FLinearColor(.25f,.76f,1.f,1.f),
        FLinearColor(1.f,.43f,.18f,1.f),FLinearColor(.72f,.38f,1.f,1.f)};
    const int32 Selected=static_cast<int32>(PC->SelectedKind);
    DrawPanel(14,H-172,548,158,Ink);
    for(int32 Index=0;Index<4;++Index)
    {
        const float X=24.f+Index*132.f;
        const bool bSelected=Index==Selected;
        DrawPanel(X,H-158,120,132,bSelected?
                  FLinearColor(Colors[Index].R,Colors[Index].G,Colors[Index].B,.42f):
                  InkSoft);
        if(bSelected) DrawPanel(X,H-158,120,5,Colors[Index]);
        DrawLabel(FString::FromInt(Index+1),X+9,H-146,
                  FLinearColor(.70f,.76f,.80f,1.f),.68f);
        DrawLabel(Names[Index],X+14,H-108,Cream,.78f);
        DrawLabel(Costs[Index],X+19,H-70,
                  GM->Gold>=FCString::Atoi(*Costs[Index])?Gold:
                  FLinearColor(.95f,.28f,.22f,1.f),.78f);
    }
    DrawLabel(TEXT("Touchez un socle pour construire  |  Glissez pour explorer"),
              590,H-55,FLinearColor(.82f,.88f,.91f,1.f),.78f);

    if(GM->IsPauseMenuOpen())
    {
        DrawPanel(0,0,W,H,FLinearColor(.01f,.02f,.035f,.70f));
        DrawPanel(W*.30f,H*.28f,W*.40f,H*.42f,Ink);
        DrawPanel(W*.30f,H*.28f,W*.40f,6.f,Gold);
        DrawLabel(TEXT("PAUSE"),W*.445f,H*.355f,Cream,1.8f);
        DrawLabel(TEXT("La vallee vous attend"),W*.405f,H*.455f,
                  FLinearColor(.74f,.80f,.84f,1.f),.85f);
        DrawButton(W*.37f,H*.54f,W*.26f,H*.14f,FLinearColor(.10f,.38f,.20f,.98f));
        DrawLabel(TEXT("REPRENDRE"),W*.435f,H*.585f,FLinearColor::White,1.1f);
    }

    if(GM->bWon||GM->bGameOver)
    {
        DrawPanel(0,0,W,H,FLinearColor(.01f,.02f,.035f,.72f));
        DrawPanel(W*.28f,H*.32f,W*.44f,H*.30f,Ink);
        DrawLabel(GM->bWon?TEXT("VICTOIRE !"):TEXT("LE ROYAUME EST TOMBE"),
                  GM->bWon?W*.405f:W*.345f,H*.42f,
                  GM->bWon?Green:FLinearColor(.98f,.25f,.20f),1.65f);
    }
}
