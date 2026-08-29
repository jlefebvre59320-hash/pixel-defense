#include "PDVisuals.h"

#include "PDGame.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/DirectionalLight.h"
#include "EngineUtils.h"
#include "Materials/MaterialInterface.h"
#include "Modules/ModuleManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
template <typename AssetType>
AssetType* FindProductionAsset(const FName RequestedName)
{
    static TMap<FName,TWeakObjectPtr<AssetType>> Cache;
    if(const TWeakObjectPtr<AssetType>* Cached=Cache.Find(RequestedName))
        if(Cached->IsValid()) return Cached->Get();
    FAssetRegistryModule& Module =
        FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
    TArray<FAssetData> Assets;
    Module.Get().GetAssetsByPath(
        FName(TEXT("/Game/ThirdParty")), Assets, true, false);
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

UMaterialInterface* LoadMaterial(const TCHAR* Name)
{
    const FString Path = FString::Printf(
        TEXT("/Game/Art/Production/Materials/%s.%s"), Name, Name);
    return LoadObject<UMaterialInterface>(nullptr, *Path);
}

FLinearColor KindColor(EPDTowerKind Kind)
{
    switch(Kind)
    {
        case EPDTowerKind::Archer: return FLinearColor(1.f,.58f,.12f);
        case EPDTowerKind::Frost: return FLinearColor(.08f,.72f,1.f);
        case EPDTowerKind::Bombard: return FLinearColor(1.f,.22f,.035f);
        case EPDTowerKind::Mage: return FLinearColor(.72f,.12f,1.f);
    }
    return FLinearColor::White;
}

const TCHAR* KindMaterial(EPDTowerKind Kind)
{
    switch(Kind)
    {
        case EPDTowerKind::Archer: return TEXT("M_FX_Arrow");
        case EPDTowerKind::Frost: return TEXT("M_FX_Frost");
        case EPDTowerKind::Bombard: return TEXT("M_FX_Fire");
        case EPDTowerKind::Mage: return TEXT("M_FX_Arcane");
    }
    return TEXT("M_FX_Arrow");
}

float UniformWidthScale(UStaticMesh* Mesh,float DesiredWidth)
{
    if(!Mesh) return 1.f;
    const FVector Extent=Mesh->GetBounds().BoxExtent;
    const float Width=FMath::Max(1.f,2.f*FMath::Max(Extent.X,Extent.Y));
    return DesiredWidth/Width;
}

float UniformHeightScale(UStaticMesh* Mesh,float DesiredHeight)
{
    if(!Mesh) return 1.f;
    return DesiredHeight/FMath::Max(1.f,2.f*Mesh->GetBounds().BoxExtent.Z);
}

float DistanceToSegment2D(const FVector& P,const FVector& A,const FVector& B)
{
    const FVector2D PA(P.X-A.X,P.Y-A.Y);
    const FVector2D BA(B.X-A.X,B.Y-A.Y);
    const float Denom=FMath::Max(KINDA_SMALL_NUMBER,BA.SizeSquared());
    const float T=FMath::Clamp(FVector2D::DotProduct(PA,BA)/Denom,0.f,1.f);
    return FVector2D::Distance(FVector2D(P.X,P.Y),FVector2D(A.X,A.Y)+BA*T);
}

const FVector Route[]={
    FVector(-3200,-1300,15),FVector(-2300,-450,15),FVector(-1200,-850,15),
    FVector(-250,-100,15),FVector(900,-650,15),FVector(1900,100,15),
    FVector(3100,850,15)
};

bool IsClearOfRoute(const FVector& P,float Clearance)
{
    for(int32 Index=1;Index<UE_ARRAY_COUNT(Route);++Index)
        if(DistanceToSegment2D(P,Route[Index-1],Route[Index])<Clearance)
            return false;
    return true;
}
}

APDProjectile::APDProjectile()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Visual"));
    RootComponent=Visual;
    Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(
        TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if(Sphere.Succeeded()) Visual->SetStaticMesh(Sphere.Object);

    Glow=CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
    Glow->SetupAttachment(Visual);
    Glow->SetCastShadows(false);
    Glow->SetAttenuationRadius(320.f);
}

void APDProjectile::Init(APDEnemy* InTarget,EPDTowerKind InKind,float InDamage,
                         bool bInIgnoreArmor,float InSplashRadius,
                         float InSlowFactor,float InSlowDuration)
{
    Target=InTarget; Kind=InKind; Damage=InDamage; bIgnoreArmor=bInIgnoreArmor;
    SplashRadius=InSplashRadius; SlowFactor=InSlowFactor; SlowDuration=InSlowDuration;
    Start=GetActorLocation();
    LastTarget=InTarget?InTarget->GetActorLocation()+FVector(0,0,80):Start;
    Glow->SetLightColor(KindColor(Kind));
    Glow->SetIntensity(Kind==EPDTowerKind::Mage?2600.f:1500.f);
    if(UMaterialInterface* Material=LoadMaterial(KindMaterial(Kind)))
        Visual->SetMaterial(0,Material);

    switch(Kind)
    {
        case EPDTowerKind::Archer:
            Speed=2200.f; SetActorScale3D(FVector(.13f,.13f,.5f));
            if(UStaticMesh* Arrow=FindProductionAsset<UStaticMesh>(FName(TEXT("arrow"))))
            { Visual->SetStaticMesh(Arrow); SetActorScale3D(FVector(1.f)); }
            break;
        case EPDTowerKind::Frost:
            Speed=1050.f; SetActorScale3D(FVector(.18f)); break;
        case EPDTowerKind::Bombard:
            Speed=850.f; ArcHeight=520.f; SetActorScale3D(FVector(.28f));
            if(UStaticMesh* Stone=FindProductionAsset<UStaticMesh>(
                FName(TEXT("projectile_catapult"))))
            { Visual->SetStaticMesh(Stone); SetActorScale3D(FVector(1.4f)); }
            break;
        case EPDTowerKind::Mage:
            Speed=2600.f; SetActorScale3D(FVector(.22f)); break;
    }
    TravelTime=FMath::Clamp(FVector::Distance(Start,LastTarget)/Speed,.12f,1.2f);
    SetLifeSpan(2.f);
}

void APDProjectile::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Elapsed+=DeltaSeconds;
    if(Target.IsValid() && Target->IsTargetable())
        LastTarget=Target->GetActorLocation()+FVector(0,0,80);
    const float Alpha=FMath::Clamp(Elapsed/FMath::Max(.01f,TravelTime),0.f,1.f);
    FVector Position=FMath::Lerp(Start,LastTarget,Alpha);
    Position.Z+=FMath::Sin(Alpha*PI)*ArcHeight;
    const FVector Direction=(Position-GetActorLocation()).GetSafeNormal();
    SetActorLocation(Position);
    if(!Direction.IsNearlyZero()) SetActorRotation(Direction.Rotation());
    if(Alpha>=1.f) Impact();
}

void APDProjectile::Impact()
{
    if(IsActorBeingDestroyed()) return;
    if(SplashRadius>0.f)
    {
        for(TActorIterator<APDEnemy> It(GetWorld());It;++It)
            if(It->IsTargetable() &&
               FVector::Dist2D(LastTarget,It->GetActorLocation())<=SplashRadius)
                It->ApplyHit(Damage,bIgnoreArmor);
    }
    else if(Target.IsValid() && Target->IsTargetable())
        Target->ApplyHit(Damage,bIgnoreArmor,SlowFactor,SlowDuration);

    APDImpactFX* FX=GetWorld()->SpawnActor<APDImpactFX>(
        LastTarget,FRotator::ZeroRotator);
    if(FX) FX->Init(Kind);
    Destroy();
}

APDImpactFX::APDImpactFX()
{
    PrimaryActorTick.bCanEverTick=true;
    Visual=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Visual"));
    RootComponent=Visual;
    Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(
        TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if(Sphere.Succeeded()) Visual->SetStaticMesh(Sphere.Object);
    Glow=CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
    Glow->SetupAttachment(Visual);
    Glow->SetCastShadows(false);
    Glow->SetAttenuationRadius(520.f);
}

void APDImpactFX::Init(EPDTowerKind InKind)
{
    if(UMaterialInterface* Material=LoadMaterial(KindMaterial(InKind)))
        Visual->SetMaterial(0,Material);
    Glow->SetLightColor(KindColor(InKind));
    Glow->SetIntensity(InKind==EPDTowerKind::Bombard?5200.f:3000.f);
    FinalScale=InKind==EPDTowerKind::Bombard?3.8f:
        (InKind==EPDTowerKind::Mage?2.4f:1.8f);
    SetActorScale3D(FVector(.08f));
    SetLifeSpan(Duration+.05f);
}

void APDImpactFX::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Age+=DeltaSeconds;
    const float Alpha=FMath::Clamp(Age/Duration,0.f,1.f);
    const float Pulse=FMath::Sin(Alpha*PI);
    SetActorScale3D(FVector(FMath::Lerp(.08f,FinalScale,Alpha)));
    Glow->SetIntensity(4200.f*Pulse);
}

APDEnvironment::APDEnvironment()
{
    PrimaryActorTick.bCanEverTick=true;
    Root=CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    RootComponent=Root;

    Terrain=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Terrain"));
    Terrain->SetupAttachment(Root); Terrain->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Water=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Water"));
    Water->SetupAttachment(Root); Water->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Castle=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Castle"));
    Castle->SetupAttachment(Root); Castle->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    auto MakeHISM=[this](const TCHAR* Name)
    {
        UHierarchicalInstancedStaticMeshComponent* Component=
            CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(Name);
        Component->SetupAttachment(Root);
        Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Component->SetMobility(EComponentMobility::Static);
        return Component;
    };
    Path=MakeHISM(TEXT("Path"));
    TreesA=MakeHISM(TEXT("TreesA")); TreesB=MakeHISM(TEXT("TreesB"));
    TreesC=MakeHISM(TEXT("TreesC")); Shrubs=MakeHISM(TEXT("Shrubs"));
    Meadow=MakeHISM(TEXT("Meadow")); Rocks=MakeHISM(TEXT("Rocks"));
    Houses=MakeHISM(TEXT("Houses")); Walls=MakeHISM(TEXT("Walls"));
    Props=MakeHISM(TEXT("Props")); Torches=MakeHISM(TEXT("Torches"));
    Fireflies=MakeHISM(TEXT("Fireflies")); Dust=MakeHISM(TEXT("Dust"));
    Birds=MakeHISM(TEXT("Birds")); Clouds=MakeHISM(TEXT("Clouds"));
    Fireflies->SetMobility(EComponentMobility::Movable);
    Dust->SetMobility(EComponentMobility::Movable);
    Birds->SetMobility(EComponentMobility::Movable);
    Clouds->SetMobility(EComponentMobility::Movable);
}

void APDEnvironment::BeginPlay()
{
    Super::BeginPlay();
    BuildTerrain(); BuildForest(); BuildVillage(); BuildAmbientFX();
    for(TActorIterator<ADirectionalLight> It(GetWorld());It;++It)
    {
        if(It->GetActorLabel().Contains(TEXT("PD_Sun")))
        {
            Sun=*It;
            break;
        }
    }
}

void APDEnvironment::BuildTerrain()
{
    UStaticMesh* Cube=LoadObject<UStaticMesh>(
        nullptr,TEXT("/Engine/BasicShapes/Cube.Cube"));
    Terrain->SetStaticMesh(Cube);
    Terrain->SetRelativeLocation(FVector(0,250,-85));
    Terrain->SetRelativeScale3D(FVector(82,55,1.6f));
    if(UMaterialInterface* Ground=LoadMaterial(TEXT("M_Ground_Forest")))
        Terrain->SetMaterial(0,Ground);

    Water->SetStaticMesh(Cube);
    Water->SetRelativeLocation(FVector(0,3000,-45));
    Water->SetRelativeScale3D(FVector(82,9,.65f));
    if(UMaterialInterface* WaterMaterial=LoadMaterial(TEXT("M_Water_River")))
        Water->SetMaterial(0,WaterMaterial);

    Path->SetStaticMesh(Cube);
    if(UMaterialInterface* Road=LoadMaterial(TEXT("M_Path_Dirt")))
        Path->SetMaterial(0,Road);
    for(int32 Index=1;Index<UE_ARRAY_COUNT(Route);++Index)
    {
        const FVector A=Route[Index-1],B=Route[Index];
        const FVector Mid=(A+B)*.5f;
        const FVector Delta=B-A;
        const float Length=FVector2D(Delta.X,Delta.Y).Size()+90.f;
        const float Yaw=FMath::RadiansToDegrees(FMath::Atan2(Delta.Y,Delta.X));
        Path->AddInstance(FTransform(FRotator(0,Yaw,0),Mid,
            FVector(Length/100.f,3.55f,.10f)));
    }
}

void APDEnvironment::BuildForest()
{
    UStaticMesh* TreeA=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_A")));
    UStaticMesh* TreeB=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_B")));
    UStaticMesh* TreeC=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_C")));
    UStaticMesh* Shrub=FindProductionAsset<UStaticMesh>(FName(TEXT("bush_single_A")));
    UStaticMesh* Grass=FindProductionAsset<UStaticMesh>(FName(TEXT("grass_A")));
    UStaticMesh* Rock=FindProductionAsset<UStaticMesh>(FName(TEXT("rock_single_C")));
    if(!TreeC) TreeC=TreeB?TreeB:TreeA;
    TreesA->SetStaticMesh(TreeA); TreesB->SetStaticMesh(TreeB);
    TreesC->SetStaticMesh(TreeC); Shrubs->SetStaticMesh(Shrub);
    Meadow->SetStaticMesh(Grass); Rocks->SetStaticMesh(Rock);

    const float TreeAScale=UniformHeightScale(TreeA,560.f);
    const float TreeBScale=UniformHeightScale(TreeB,470.f);
    const float TreeCScale=UniformHeightScale(TreeC,390.f);
    const float ShrubScale=UniformWidthScale(Shrub,150.f);
    const float GrassScale=UniformWidthScale(Grass,95.f);
    const float RockScale=UniformWidthScale(Rock,210.f);
    FRandomStream Random(20260829);

    // Dense framing only at the valley edges; the playable center stays readable.
    for(int32 Attempt=0;Attempt<150;++Attempt)
    {
        FVector P(Random.FRandRange(-4050,4050),Random.FRandRange(-2380,2380),14);
        const bool bEdge=FMath::Abs(P.X)>2850.f||FMath::Abs(P.Y)>1700.f;
        const bool bGrove=(P.X<-1750.f&&P.Y>650.f)||(P.X>1550.f&&P.Y>1050.f);
        if((!bEdge&&!bGrove)||!IsClearOfRoute(P,760.f)||Random.FRand()>.58f) continue;
        const float Choice=Random.FRand();
        UHierarchicalInstancedStaticMeshComponent* Layer =
            Choice<.34f?TreesA:(Choice<.70f?TreesB:TreesC);
        const float Base=Choice<.34f?TreeAScale:(Choice<.70f?TreeBScale:TreeCScale);
        const FVector Scale(Base*Random.FRandRange(.78f,1.18f),
                            Base*Random.FRandRange(.78f,1.18f),
                            Base*Random.FRandRange(.88f,1.22f));
        Layer->AddInstance(FTransform(
            FRotator(Random.FRandRange(-2.f,2.f),Random.FRandRange(0,360),0),
            P,Scale));
    }

    // Low vegetation breaks the empty ground without rebuilding a wall of pines.
    if(Shrub)
    {
        for(int32 Attempt=0;Attempt<95;++Attempt)
        {
            FVector P(Random.FRandRange(-3850,3850),Random.FRandRange(-2150,2150),10);
            if(!IsClearOfRoute(P,430.f)||Random.FRand()>.63f) continue;
            Shrubs->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
                P,FVector(ShrubScale*Random.FRandRange(.65f,1.25f))));
        }
    }
    if(Grass)
    {
        for(int32 Attempt=0;Attempt<130;++Attempt)
        {
            FVector P(Random.FRandRange(-3700,3700),Random.FRandRange(-2050,2050),9);
            if(!IsClearOfRoute(P,320.f)||Random.FRand()>.72f) continue;
            Meadow->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
                P,FVector(GrassScale*Random.FRandRange(.55f,1.15f))));
        }
    }
    for(int32 Attempt=0,Placed=0;Attempt<100&&Placed<28;++Attempt)
    {
        FVector P(Random.FRandRange(-3850,3850),Random.FRandRange(-2200,2200),11);
        if(!IsClearOfRoute(P,540.f)) continue;
        Rocks->AddInstance(FTransform(
            FRotator(Random.FRandRange(-7,7),Random.FRandRange(0,360),0),
            P,FVector(RockScale*Random.FRandRange(.48f,1.18f))));
        ++Placed;
    }
}


void APDEnvironment::BuildVillage()
{
    UStaticMesh* House=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_A_blue")));
    UStaticMesh* Wall=FindProductionAsset<UStaticMesh>(FName(TEXT("wall_straight")));
    UStaticMesh* Crate=FindProductionAsset<UStaticMesh>(FName(TEXT("crate_A_big")));
    UStaticMesh* Torch=FindProductionAsset<UStaticMesh>(FName(TEXT("torch_lit")));
    UStaticMesh* CastleMesh=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_castle_blue")));
    Houses->SetStaticMesh(House); Walls->SetStaticMesh(Wall);
    Props->SetStaticMesh(Crate); Torches->SetStaticMesh(Torch);
    Castle->SetStaticMesh(CastleMesh);

    const float HouseScale=UniformWidthScale(House,620.f);
    const float WallScale=UniformWidthScale(Wall,520.f);
    const float PropScale=UniformWidthScale(Crate,120.f);
    const float TorchScale=UniformHeightScale(Torch,190.f);
    const float CastleScale=UniformWidthScale(CastleMesh,1050.f);
    Castle->SetRelativeLocation(FVector(3550,1080,10));
    Castle->SetRelativeRotation(FRotator(0,-35,0));
    Castle->SetRelativeScale3D(FVector(CastleScale));

    const FVector HouseSpots[]={
        {2450,1580,10},{1770,1750,10},{1120,1510,10},
        {-2700,1320,10},{-1940,1510,10}
    };
    for(int32 Index=0;Index<UE_ARRAY_COUNT(HouseSpots);++Index)
        Houses->AddInstance(FTransform(FRotator(0,Index%2?145:-25,0),
            HouseSpots[Index],FVector(HouseScale)));

    for(int32 Index=0;Index<7;++Index)
    {
        Walls->AddInstance(FTransform(FRotator(0,90,0),
            FVector(3300,230-Index*300,10),FVector(WallScale)));
    }
    FRandomStream Random(77);
    for(int32 Index=0;Index<12;++Index)
    {
        const FVector P(Random.FRandRange(1100,2950),
            Random.FRandRange(1150,2050),18);
        Props->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
            P,FVector(PropScale*Random.FRandRange(.75f,1.2f))));
    }

    const FVector TorchSpots[]={
        {-3050,-1180,35},{-250,-100,35},{1850,140,35},{3130,820,35}
    };
    for(const FVector& P:TorchSpots)
    {
        Torches->AddInstance(FTransform(FRotator::ZeroRotator,P,FVector(TorchScale)));
        UPointLightComponent* Light=NewObject<UPointLightComponent>(this);
        AddInstanceComponent(Light); Light->RegisterComponent();
        Light->AttachToComponent(Root,FAttachmentTransformRules::KeepRelativeTransform);
        Light->SetRelativeLocation(P+FVector(0,0,160));
        Light->SetLightColor(FLinearColor(1.f,.38f,.08f));
        Light->SetIntensity(1700.f); Light->SetAttenuationRadius(460.f);
        Light->SetCastShadows(false);
    }
}

void APDEnvironment::BuildAmbientFX()
{
    UStaticMesh* Sphere=LoadObject<UStaticMesh>(
        nullptr,TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UStaticMesh* CloudMesh=FindProductionAsset<UStaticMesh>(FName(TEXT("cloud_A")));
    if(!CloudMesh) CloudMesh=Sphere;

    Fireflies->SetStaticMesh(Sphere);
    Dust->SetStaticMesh(Sphere);
    Birds->SetStaticMesh(Sphere);
    Clouds->SetStaticMesh(CloudMesh);
    if(UMaterialInterface* Material=LoadMaterial(TEXT("M_FX_Firefly")))
        Fireflies->SetMaterial(0,Material);
    if(UMaterialInterface* Material=LoadMaterial(TEXT("M_FX_Dust")))
        Dust->SetMaterial(0,Material);
    if(UMaterialInterface* Material=LoadMaterial(TEXT("M_Bird")))
        Birds->SetMaterial(0,Material);
    if(UMaterialInterface* Material=LoadMaterial(TEXT("M_Cloud")))
        Clouds->SetMaterial(0,Material);

    FRandomStream Random(4242);
    for(int32 Index=0;Index<18;++Index)
    {
        const FVector Origin(Random.FRandRange(-3200,3000),
            Random.FRandRange(-1750,1850),Random.FRandRange(110,390));
        FireflyOrigins.Add(Origin); FireflyPhases.Add(Random.FRandRange(0,2*PI));
        Fireflies->AddInstance(FTransform(FRotator::ZeroRotator,Origin,FVector(.022f)));
    }
    for(int32 Index=0;Index<20;++Index)
    {
        const FVector Origin(Random.FRandRange(-3100,3000),
            Random.FRandRange(-1700,1750),Random.FRandRange(80,260));
        DustOrigins.Add(Origin); DustPhases.Add(Random.FRandRange(0,2*PI));
        Dust->AddInstance(FTransform(FRotator::ZeroRotator,Origin,FVector(.012f)));
    }
    for(int32 Index=0;Index<9;++Index)
    {
        const FVector Origin(Random.FRandRange(-2400,2400),
            Random.FRandRange(-900,1600),Random.FRandRange(720,1050));
        BirdOrigins.Add(Origin); BirdPhases.Add(Random.FRandRange(0,2*PI));
        Birds->AddInstance(FTransform(FRotator::ZeroRotator,Origin,
            FVector(.18f,.055f,.026f)));
    }
    for(int32 Index=0;Index<5;++Index)
    {
        const FVector Origin(-4300.f+Index*1900.f,
            Random.FRandRange(-300,1900),Random.FRandRange(1250,1650));
        CloudOrigins.Add(Origin); CloudSpeeds.Add(Random.FRandRange(18.f,34.f));
        const float Scale=Random.FRandRange(.75f,1.25f);
        Clouds->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
            Origin,FVector(8.5f*Scale,4.2f*Scale,1.15f*Scale)));
    }
}


void APDEnvironment::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    const float Time=GetWorld()->GetTimeSeconds();
    if(Sun.IsValid())
    {
        FRotator Rotation=Sun->GetActorRotation();
        Rotation.Yaw=FMath::Fmod(Rotation.Yaw+DeltaSeconds*.18f,360.f);
        Sun->SetActorRotation(Rotation);
    }
    for(int32 Index=0;Index<FireflyOrigins.Num();++Index)
    {
        const float Phase=FireflyPhases[Index];
        const FVector Offset(
            FMath::Sin(Time*.85f+Phase)*70.f,
            FMath::Cos(Time*.65f+Phase)*55.f,
            FMath::Sin(Time*1.35f+Phase)*38.f);
        Fireflies->UpdateInstanceTransform(Index,
            FTransform(FRotator::ZeroRotator,FireflyOrigins[Index]+Offset,FVector(.022f)),
            false,false,true);
    }
    for(int32 Index=0;Index<DustOrigins.Num();++Index)
    {
        const float Phase=DustPhases[Index];
        FVector P=DustOrigins[Index]+FVector(
            FMath::Sin(Time*.24f+Phase)*95.f,
            FMath::Cos(Time*.19f+Phase)*70.f,
            FMath::Fmod(Time*13.f+Phase*35.f,180.f));
        Dust->UpdateInstanceTransform(Index,
            FTransform(FRotator::ZeroRotator,P,FVector(.012f)),false,false,true);
    }
    for(int32 Index=0;Index<BirdOrigins.Num();++Index)
    {
        const float Phase=BirdPhases[Index]+Time*(.24f+.018f*Index);
        const float Radius=260.f+38.f*(Index%4);
        FVector P=BirdOrigins[Index]+FVector(
            FMath::Cos(Phase)*Radius,FMath::Sin(Phase)*Radius*.62f,
            FMath::Sin(Phase*2.f)*42.f);
        const float Yaw=FMath::RadiansToDegrees(Phase)+90.f;
        Birds->UpdateInstanceTransform(Index,
            FTransform(FRotator(0,Yaw,0),P,FVector(.18f,.055f,.026f)),
            false,false,true);
    }
    for(int32 Index=0;Index<CloudOrigins.Num();++Index)
    {
        FVector P=CloudOrigins[Index];
        P.X=FMath::Fmod(P.X+Time*CloudSpeeds[Index]+4500.f,9000.f)-4500.f;
        P.Z+=FMath::Sin(Time*.08f+Index)*35.f;
        const float Scale=.82f+.09f*(Index%4);
        Clouds->UpdateInstanceTransform(Index,
            FTransform(FRotator(0,Index*37.f,0),P,
                FVector(8.5f*Scale,4.2f*Scale,1.15f*Scale)),
            false,false,true);
    }
    if(FireflyOrigins.Num()) Fireflies->MarkRenderStateDirty();
    if(DustOrigins.Num()) Dust->MarkRenderStateDirty();
    if(BirdOrigins.Num()) Birds->MarkRenderStateDirty();
    if(CloudOrigins.Num()) Clouds->MarkRenderStateDirty();
}
