#include "PDGame.h"

#include "Camera/CameraActor.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"

APDEnemy::APDEnemy()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>("Visual");
    RootComponent=Visual;
    Visual->SetCollisionProfileName("BlockAllDynamic");
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if(Shape.Succeeded()) Visual->SetStaticMesh(Shape.Object);
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

void APDEnemy::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(Path.Num()<2 || PathIndex>=Path.Num()) return;
    if(GetWorld()->GetTimeSeconds()>=SlowUntil) SlowMultiplier=1.f;
    float Left=Speed*SlowMultiplier*DeltaSeconds;
    while(Left>0.f && PathIndex<Path.Num())
    {
        const FVector Here=GetActorLocation();
        const FVector Target=Path[PathIndex];
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
    if(PathIndex>=Path.Num())
    {
        if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>()) GM->EnemyLeaked(this);
        Destroy();
    }
}

void APDEnemy::ApplyHit(float Amount,bool bIgnoreArmor,float InSlowFactor,float SlowDuration)
{
    HP-=bIgnoreArmor?Amount:FMath::Max(1.f,Amount-Armor);
    if(InSlowFactor<1.f)
    {
        SlowMultiplier=InSlowFactor;
        SlowUntil=GetWorld()->GetTimeSeconds()+SlowDuration;
    }
    if(HP<=0.f)
    {
        if(APDGameMode* GM=GetWorld()->GetAuthGameMode<APDGameMode>()) GM->EnemyKilled(this);
        Destroy();
    }
}

APDTower::APDTower()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>("Visual");
    RootComponent=Visual;
    Visual->SetCollisionProfileName("BlockAllDynamic");
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if(Shape.Succeeded()) Visual->SetStaticMesh(Shape.Object);
    SetActorScale3D(FVector(.75f,.75f,1.5f));
}

void APDTower::Configure(EPDTowerKind InKind)
{
    Kind=InKind; SplashRadius=0.f; SlowFactor=1.f; SlowDuration=0.f; bIgnoreArmor=false;
    switch(Kind)
    {
        case EPDTowerKind::Archer: Range=1050.f; Damage=8.f; ShotsPerSecond=1.45f; break;
        case EPDTowerKind::Frost: Range=900.f; Damage=4.f; ShotsPerSecond=.75f; SlowFactor=.55f; SlowDuration=1.8f; break;
        case EPDTowerKind::Bombard: Range=1150.f; Damage=22.f; ShotsPerSecond=.42f; SplashRadius=320.f; break;
        case EPDTowerKind::Mage: Range=1000.f; Damage=17.f; ShotsPerSecond=.65f; bIgnoreArmor=true; break;
    }
}

void APDTower::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Cooldown-=DeltaSeconds;
    if(Cooldown>0.f) return;
    APDEnemy* Target=nullptr; float Best=-1.f;
    for(TActorIterator<APDEnemy> It(GetWorld());It;++It)
    {
        const float D=FVector::Dist2D(GetActorLocation(),It->GetActorLocation());
        if(D<=Range && It->GetProgress()>Best){Target=*It;Best=It->GetProgress();}
    }
    if(!Target) return;
    const FVector HitPoint=Target->GetActorLocation();
    if(SplashRadius>0.f)
    {
        for(TActorIterator<APDEnemy> It(GetWorld());It;++It)
            if(FVector::Dist2D(HitPoint,It->GetActorLocation())<=SplashRadius)
                It->ApplyHit(Damage,bIgnoreArmor);
    }
    else Target->ApplyHit(Damage,bIgnoreArmor,SlowFactor,SlowDuration);
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
        FVector(0,-6500,6200),FRotator(-48,90,0));
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
