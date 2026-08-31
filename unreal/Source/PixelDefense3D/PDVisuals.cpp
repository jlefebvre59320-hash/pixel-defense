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
    static bool bProductionAssetsScanned=false;
    if(!bProductionAssetsScanned)
    {
        TArray<FString> PathsToScan;
        PathsToScan.Add(TEXT("/Game/ThirdParty"));
        Module.Get().ScanPathsSynchronous(PathsToScan,false);
        bProductionAssetsScanned=true;
    }
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

template <typename AssetType>
AssetType* FindPreferredProductionAsset(const TCHAR* Token,int32 Variant=0)
{
    static TMap<FString,TWeakObjectPtr<AssetType>> Cache;
    const FString Wanted(Token);
    const FString CacheKey=FString::Printf(TEXT("%s_%d"),Token,Variant);
    if(const TWeakObjectPtr<AssetType>* Cached=Cache.Find(CacheKey))
        if(Cached->IsValid()) return Cached->Get();

    FAssetRegistryModule& Module =
        FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
    TArray<FString> PathsToScan;
    PathsToScan.Add(TEXT("/Game/ThirdParty"));
    Module.Get().ScanPathsSynchronous(PathsToScan,false);

    TArray<FAssetData> Assets;
    Module.Get().GetAssetsByPath(
        FName(TEXT("/Game/ThirdParty")),Assets,true,false);
    TArray<FAssetData> Preferred;
    TArray<FAssetData> Fallback;
    const FTopLevelAssetPath WantedClass=AssetType::StaticClass()->GetClassPathName();
    for(const FAssetData& Asset:Assets)
    {
        if(Asset.AssetClassPath!=WantedClass) continue;
        if(!Asset.AssetName.ToString().ToLower().Contains(Wanted)) continue;
        if(Asset.PackageName.ToString().Contains(TEXT("/Quaternius/")))
            Preferred.Add(Asset);
        else
            Fallback.Add(Asset);
    }
    TArray<FAssetData>& Matches=Preferred.Num()>0?Preferred:Fallback;
    Matches.Sort([](const FAssetData& A,const FAssetData& B)
    {
        return A.AssetName.ToString()<B.AssetName.ToString();
    });
    if(Matches.Num()==0) return nullptr;
    AssetType* Loaded=Cast<AssetType>(Matches[Variant%Matches.Num()].GetAsset());
    if(Loaded) Cache.Add(CacheKey,Loaded);
    return Loaded;
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
    FVector(-3300,-1250,15),FVector(-2920,-980,15),FVector(-2460,-650,15),
    FVector(-1950,-500,15),FVector(-1450,-660,15),FVector(-930,-720,15),
    FVector(-470,-430,15),FVector(20,-90,15),FVector(560,-270,15),
    FVector(1080,-520,15),FVector(1570,-280,15),FVector(2040,80,15),
    FVector(2550,420,15),FVector(3150,800,15)
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
    Glow->SetAttenuationRadius(Kind==EPDTowerKind::Mage?520.f:420.f);
    Glow->SetIntensity(Kind==EPDTowerKind::Mage?5200.f:
        (Kind==EPDTowerKind::Bombard?3800.f:2600.f));
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
            Speed=1050.f; SetActorScale3D(FVector(.26f)); break;
        case EPDTowerKind::Bombard:
            Speed=850.f; ArcHeight=560.f; SetActorScale3D(FVector(.40f));
            if(UStaticMesh* Stone=FindProductionAsset<UStaticMesh>(
                FName(TEXT("projectile_catapult"))))
            { Visual->SetStaticMesh(Stone); SetActorScale3D(FVector(1.8f)); }
            break;
        case EPDTowerKind::Mage:
            Speed=2600.f; SetActorScale3D(FVector(.34f)); break;
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
    Glow->SetAttenuationRadius(InKind==EPDTowerKind::Bombard?760.f:580.f);
    Glow->SetIntensity(InKind==EPDTowerKind::Bombard?9000.f:
        (InKind==EPDTowerKind::Mage?7600.f:5200.f));
    FinalScale=InKind==EPDTowerKind::Bombard?5.4f:
        (InKind==EPDTowerKind::Mage?3.5f:
        (InKind==EPDTowerKind::Frost?2.7f:2.0f));
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
    Glow->SetIntensity(8200.f*Pulse);
}

APDEnvironment::APDEnvironment()
{
    PrimaryActorTick.bCanEverTick=true;
    Root=CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    RootComponent=Root;
    Root->SetMobility(EComponentMobility::Static);

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
    PathJunctions=MakeHISM(TEXT("PathJunctions"));
    GroundPatches=MakeHISM(TEXT("GroundPatches"));
    Cliffs=MakeHISM(TEXT("Cliffs"));
    TreesA=MakeHISM(TEXT("TreesA")); TreesB=MakeHISM(TEXT("TreesB"));
    TreesC=MakeHISM(TEXT("TreesC")); Shrubs=MakeHISM(TEXT("Shrubs"));
    Meadow=MakeHISM(TEXT("Meadow")); Rocks=MakeHISM(TEXT("Rocks"));
    Houses=MakeHISM(TEXT("Houses")); HousesB=MakeHISM(TEXT("HousesB"));
    HousesC=MakeHISM(TEXT("HousesC")); Walls=MakeHISM(TEXT("Walls"));
    Gateways=MakeHISM(TEXT("Gateways"));
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
    TActorIterator<ADirectionalLight> SunIt(GetWorld());
    if(SunIt)
    {
        Sun=*SunIt;
        if(USceneComponent* SunRoot=Sun->GetRootComponent())
            SunRoot->SetMobility(EComponentMobility::Movable);
    }
}

void APDEnvironment::BuildTerrain()
{
    UStaticMesh* Cube=LoadObject<UStaticMesh>(
        nullptr,TEXT("/Engine/BasicShapes/Cube.Cube"));
    UStaticMesh* Cylinder=LoadObject<UStaticMesh>(
        nullptr,TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

    Terrain->SetStaticMesh(Cube);
    Terrain->SetRelativeLocation(FVector(0,250,-85));
    Terrain->SetRelativeScale3D(FVector(82,55,1.6f));
    if(UMaterialInterface* Ground=LoadMaterial(TEXT("M_Ground_MeadowV3")))
        Terrain->SetMaterial(0,Ground);

    Water->SetStaticMesh(Cube);
    Water->SetRelativeLocation(FVector(0,0,-58));
    Water->SetRelativeScale3D(FVector(104,79,.56f));
    if(UMaterialInterface* WaterMaterial=LoadMaterial(TEXT("M_Water_ValleyV2")))
        Water->SetMaterial(0,WaterMaterial);

    GroundPatches->SetStaticMesh(Cylinder);
    if(UMaterialInterface* Patch=LoadMaterial(TEXT("M_Ground_ForestV3")))
        GroundPatches->SetMaterial(0,Patch);
    const FTransform Patches[]={
        {FRotator::ZeroRotator,FVector(-2800,1450,4),FVector(9.5f,6.5f,.025f)},
        {FRotator::ZeroRotator,FVector(-1550,1250,4),FVector(7.0f,5.0f,.025f)},
        {FRotator::ZeroRotator,FVector(1250,1450,4),FVector(9.0f,5.8f,.025f)},
        {FRotator::ZeroRotator,FVector(2550,1350,4),FVector(7.5f,5.0f,.025f)},
        {FRotator::ZeroRotator,FVector(-2950,-1850,4),FVector(8.0f,4.5f,.025f)},
        {FRotator::ZeroRotator,FVector(2750,-1650,4),FVector(8.5f,5.0f,.025f)}
    };
    for(const FTransform& Patch:Patches) GroundPatches->AddInstance(Patch);

    Path->SetStaticMesh(Cube);
    PathJunctions->SetStaticMesh(Cylinder);
    if(UMaterialInterface* Road=LoadMaterial(TEXT("M_Path_ClayV6")))
    {
        Path->SetMaterial(0,Road);
        PathJunctions->SetMaterial(0,Road);
    }
    for(int32 Index=1;Index<UE_ARRAY_COUNT(Route);++Index)
    {
        const FVector A=Route[Index-1],B=Route[Index];
        const FVector Mid=(A+B)*.5f;
        const FVector Delta=B-A;
        const float Length=FVector2D(Delta.X,Delta.Y).Size()+45.f;
        const float Yaw=FMath::RadiansToDegrees(FMath::Atan2(Delta.Y,Delta.X));
        Path->AddInstance(FTransform(FRotator(0,Yaw,0),Mid,
            FVector(Length/100.f,2.18f,.075f)));
        if(Index<UE_ARRAY_COUNT(Route)-1)
            PathJunctions->AddInstance(FTransform(FRotator::ZeroRotator,Route[Index],
                FVector(2.22f,2.22f,.075f)));
    }
}

void APDEnvironment::BuildForest()
{
    UStaticMesh* TreeA=FindPreferredProductionAsset<UStaticMesh>(TEXT("tree"),0);
    UStaticMesh* TreeB=FindPreferredProductionAsset<UStaticMesh>(TEXT("tree"),1);
    UStaticMesh* TreeC=FindPreferredProductionAsset<UStaticMesh>(TEXT("tree"),2);
    UStaticMesh* Shrub=FindPreferredProductionAsset<UStaticMesh>(TEXT("bush"),0);
    UStaticMesh* Grass=FindPreferredProductionAsset<UStaticMesh>(TEXT("grass"),0);
    UStaticMesh* Rock=FindPreferredProductionAsset<UStaticMesh>(TEXT("rock"),0);
    UStaticMesh* Cliff=FindPreferredProductionAsset<UStaticMesh>(TEXT("rock"),4);

    if(!TreeA) TreeA=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_A")));
    if(!TreeB) TreeB=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_B")));
    if(!TreeC) TreeC=FindProductionAsset<UStaticMesh>(FName(TEXT("tree_single_C")));
    if(!Shrub) Shrub=FindProductionAsset<UStaticMesh>(FName(TEXT("bush_single_A")));
    if(!Grass) Grass=FindProductionAsset<UStaticMesh>(FName(TEXT("grass_A")));
    if(!Rock) Rock=FindProductionAsset<UStaticMesh>(FName(TEXT("rock_single_C")));
    const bool bUsingRockCliffs=Cliff!=nullptr;
    if(!Cliff) Cliff=FindProductionAsset<UStaticMesh>(FName(TEXT("mountain_A")));
    if(!Cliff) Cliff=FindProductionAsset<UStaticMesh>(FName(TEXT("hills_A")));
    if(!Cliff) Cliff=Rock;
    if(!TreeB) TreeB=TreeA;
    if(!TreeC) TreeC=TreeB?TreeB:TreeA;

    TreesA->SetStaticMesh(TreeA); TreesB->SetStaticMesh(TreeB);
    TreesC->SetStaticMesh(TreeC); Shrubs->SetStaticMesh(Shrub);
    Meadow->SetStaticMesh(Grass); Rocks->SetStaticMesh(Rock);
    Cliffs->SetStaticMesh(Cliff);

    const float TreeAScale=UniformHeightScale(TreeA,520.f);
    const float TreeBScale=UniformHeightScale(TreeB,430.f);
    const float TreeCScale=UniformHeightScale(TreeC,350.f);
    const float ShrubScale=UniformWidthScale(Shrub,135.f);
    const float GrassScale=UniformWidthScale(Grass,86.f);
    const float RockScale=UniformWidthScale(Rock,190.f);
    const float CliffScale=UniformWidthScale(Cliff,bUsingRockCliffs?235.f:520.f);
    FRandomStream Random(20260831);

    struct FGrove { FVector Center; float Radius; int32 Count; };
    const FGrove Groves[]={
        {{-3550,2200,12},560.f,14},{{-2150,2240,12},460.f,10},
        {{-3500,-1900,12},720.f,17},{{-900,-1950,12},600.f,12},
        {{850,2240,12},460.f,10},{{2450,2200,12},560.f,14},
        {{3550,-1650,12},760.f,18},{{1200,-1900,12},560.f,11}
    };
    int32 TreeIndex=0;
    for(const FGrove& Grove:Groves)
    {
        for(int32 Index=0;Index<Grove.Count;++Index)
        {
            const float Angle=Random.FRandRange(0.f,2.f*PI);
            const float Radius=FMath::Sqrt(Random.FRand())*Grove.Radius;
            FVector P=Grove.Center+FVector(
                FMath::Cos(Angle)*Radius,FMath::Sin(Angle)*Radius,0);
            if(!IsClearOfRoute(P,560.f)) continue;
            const int32 Pick=(TreeIndex++ + Index/3)%3;
            UHierarchicalInstancedStaticMeshComponent* Layer=
                Pick==0?TreesA:(Pick==1?TreesB:TreesC);
            const float Base=Pick==0?TreeAScale:(Pick==1?TreeBScale:TreeCScale);
            Layer->AddInstance(FTransform(
                FRotator(Random.FRandRange(-1.5f,1.5f),
                         Random.FRandRange(0.f,360.f),0),
                P,FVector(Base*Random.FRandRange(.72f,1.24f),
                          Base*Random.FRandRange(.72f,1.24f),
                          Base*Random.FRandRange(.86f,1.26f))));
        }
    }

    // Rock ridges form an irregular valley silhouette instead of a square platform.
    const int32 RidgeCount=bUsingRockCliffs?18:26;
    const int32 HorizontalCount=bUsingRockCliffs?10:14;
    for(int32 Index=0;Index<RidgeCount;++Index)
    {
        const bool bHorizontal=Index<HorizontalCount;
        FVector P;
        if(bHorizontal)
        {
            const float Side=Index%2?1.f:-1.f;
            P=FVector(-3800.f+(Index/2)*760.f+Random.FRandRange(-130.f,130.f),
                      Side*2500.f+Random.FRandRange(-100.f,100.f),-15.f);
        }
        else
        {
            const float Side=Index%2?1.f:-1.f;
            P=FVector(Side*4250.f+Random.FRandRange(-100.f,100.f),
                      -2100.f+((Index-HorizontalCount)/2)*820.f+Random.FRandRange(-120.f,120.f),
                      -15.f);
        }
        Cliffs->AddInstance(FTransform(
            FRotator(Random.FRandRange(-5.f,5.f),Random.FRandRange(0.f,360.f),0),
            P,FVector(CliffScale*Random.FRandRange(.72f,1.08f))));
    }

    for(int32 Attempt=0;Attempt<155;++Attempt)
    {
        FVector P(Random.FRandRange(-3850,3850),Random.FRandRange(-2150,2150),9);
        if(!IsClearOfRoute(P,350.f)||Random.FRand()>.62f) continue;
        if(Shrub)
            Shrubs->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
                P,FVector(ShrubScale*Random.FRandRange(.55f,1.18f))));
    }
    for(int32 Attempt=0;Attempt<210;++Attempt)
    {
        FVector P(Random.FRandRange(-3750,3750),Random.FRandRange(-2050,2050),8);
        if(!IsClearOfRoute(P,270.f)||Random.FRand()>.64f) continue;
        if(Grass)
            Meadow->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
                P,FVector(GrassScale*Random.FRandRange(.48f,1.08f))));
    }
    for(int32 Attempt=0,Placed=0;Attempt<120&&Placed<34;++Attempt)
    {
        FVector P(Random.FRandRange(-3800,3800),Random.FRandRange(-2100,2100),10);
        if(!IsClearOfRoute(P,470.f)) continue;
        Rocks->AddInstance(FTransform(
            FRotator(Random.FRandRange(-8,8),Random.FRandRange(0,360),0),
            P,FVector(RockScale*Random.FRandRange(.42f,1.12f))));
        ++Placed;
    }
}

void APDEnvironment::BuildVillage()
{
    UStaticMesh* HouseA=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_A_blue")));
    UStaticMesh* HouseB=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_B_red")));
    UStaticMesh* HouseC=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_C_yellow")));
    if(!HouseB) HouseB=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_B_blue")));
    if(!HouseC) HouseC=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_home_A_red")));
    if(UStaticMesh* Premium=FindPreferredProductionAsset<UStaticMesh>(TEXT("house"),0))
        HouseA=Premium;
    if(UStaticMesh* Premium=FindPreferredProductionAsset<UStaticMesh>(TEXT("house"),1))
        HouseB=Premium;
    if(UStaticMesh* Premium=FindPreferredProductionAsset<UStaticMesh>(TEXT("house"),2))
        HouseC=Premium;
    if(!HouseB) HouseB=HouseA;
    if(!HouseC) HouseC=HouseA;

    UStaticMesh* Wall=FindProductionAsset<UStaticMesh>(FName(TEXT("wall_straight")));
    UStaticMesh* Gate=FindProductionAsset<UStaticMesh>(FName(TEXT("wall_gate")));
    if(!Gate) Gate=FindProductionAsset<UStaticMesh>(FName(TEXT("gate")));
    if(!Gate) Gate=Wall;
    UStaticMesh* Crate=FindPreferredProductionAsset<UStaticMesh>(TEXT("crate"),0);
    if(!Crate) Crate=FindProductionAsset<UStaticMesh>(FName(TEXT("crate_A_big")));
    UStaticMesh* Torch=FindProductionAsset<UStaticMesh>(FName(TEXT("torch_lit")));
    UStaticMesh* CastleMesh=FindProductionAsset<UStaticMesh>(
        FName(TEXT("building_castle_blue")));

    Houses->SetStaticMesh(HouseA); HousesB->SetStaticMesh(HouseB);
    HousesC->SetStaticMesh(HouseC); Walls->SetStaticMesh(Wall);
    Gateways->SetStaticMesh(Gate);
    Props->SetStaticMesh(Crate); Torches->SetStaticMesh(Torch);
    Castle->SetStaticMesh(CastleMesh);

    const float HouseAScale=UniformWidthScale(HouseA,535.f);
    const float HouseBScale=UniformWidthScale(HouseB,500.f);
    const float HouseCScale=UniformWidthScale(HouseC,475.f);
    const float WallScale=UniformWidthScale(Wall,480.f);
    const float GateScale=UniformWidthScale(Gate,650.f);
    const float PropScale=UniformWidthScale(Crate,105.f);
    const float TorchScale=UniformHeightScale(Torch,175.f);
    const float CastleScale=UniformWidthScale(CastleMesh,1020.f);

    Castle->SetRelativeLocation(FVector(3520,1120,8));
    Castle->SetRelativeRotation(FRotator(0,-32,0));
    Castle->SetRelativeScale3D(FVector(CastleScale));

    struct FHouseSpot { FVector Position; float Yaw; int32 Style; float Scale; };
    const FHouseSpot HouseSpots[]={
        {{-2850,1130,8},-28.f,0,1.0f},{{-2290,1450,8},22.f,1,.96f},
        {{-1700,1120,8},-18.f,2,.92f},{{-1120,1500,8},36.f,0,.88f},
        {{980,1320,8},-32.f,1,.94f},{{1510,1580,8},18.f,0,1.0f},
        {{2070,1250,8},-24.f,2,.92f},{{2630,1580,8},28.f,1,.96f}
    };
    for(const FHouseSpot& Spot:HouseSpots)
    {
        UHierarchicalInstancedStaticMeshComponent* Layer=
            Spot.Style==0?Houses:(Spot.Style==1?HousesB:HousesC);
        const float Base=Spot.Style==0?HouseAScale:
            (Spot.Style==1?HouseBScale:HouseCScale);
        Layer->AddInstance(FTransform(FRotator(0,Spot.Yaw,0),Spot.Position,
            FVector(Base*Spot.Scale)));
    }

    // Castle wall follows the landscape and leaves a clear approach to the gate.
    for(int32 Index=0;Index<6;++Index)
        Walls->AddInstance(FTransform(FRotator(0,90,0),
            FVector(3330,80-Index*285,8),FVector(WallScale)));
    for(int32 Index=0;Index<3;++Index)
        Walls->AddInstance(FTransform(FRotator(0,0,0),
            FVector(3520+Index*285,-1500,8),FVector(WallScale)));

    Gateways->AddInstance(FTransform(FRotator(0,36.f,0),
        FVector(-3330,-1250,8),FVector(GateScale)));
    Gateways->AddInstance(FTransform(FRotator(0,35.f,0),
        FVector(3180,820,8),FVector(GateScale)));

    FRandomStream Random(137);
    const FVector MarketCenters[]={
        FVector(-2150,900,14),FVector(1550,940,14),FVector(2580,1030,14)
    };
    for(const FVector& Center:MarketCenters)
    {
        for(int32 Index=0;Index<5;++Index)
        {
            const FVector P=Center+FVector(
                Random.FRandRange(-260,260),Random.FRandRange(-210,210),0);
            Props->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),
                P,FVector(PropScale*Random.FRandRange(.72f,1.12f))));
        }
    }

    const FVector TorchSpots[]={
        {-3420,-1430,32},{-3180,-1090,32},{-2400,920,32},{-1500,980,32},
        {880,880,32},{1780,900,32},{2910,610,32},{3270,1000,32}
    };
    for(const FVector& P:TorchSpots)
    {
        Torches->AddInstance(FTransform(FRotator::ZeroRotator,P,FVector(TorchScale)));
        UPointLightComponent* Light=NewObject<UPointLightComponent>(this);
        AddInstanceComponent(Light); Light->RegisterComponent();
        Light->AttachToComponent(Root,FAttachmentTransformRules::KeepRelativeTransform);
        Light->SetRelativeLocation(P+FVector(0,0,150));
        Light->SetLightColor(FLinearColor(1.f,.42f,.11f));
        Light->SetIntensity(1550.f); Light->SetAttenuationRadius(430.f);
        Light->SetCastShadows(false);
        TorchLights.Add(Light);
    }
}

void APDEnvironment::BuildAmbientFX()
{
    UStaticMesh* Sphere=LoadObject<UStaticMesh>(
        nullptr,TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    UStaticMesh* CloudMesh=FindProductionAsset<UStaticMesh>(FName(TEXT("cloud_A")));
    // A restrained flattened-sphere fallback keeps the sky alive on every pack variant.
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
    if(UMaterialInterface* Material=LoadMaterial(TEXT("M_Cloud_SoftV2")))
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
    if(CloudMesh)
    {
        for(int32 Cluster=0;Cluster<5;++Cluster)
        {
            const FVector Center(-4100.f+Cluster*2050.f,
                Random.FRandRange(1150,2450),Random.FRandRange(1420,1770));
            const float Drift=Random.FRandRange(11.f,19.f);
            for(int32 Blob=0;Blob<3;++Blob)
            {
                const FVector Origin=Center+FVector(
                    (Blob-1)*170.f,Blob==1?0.f:55.f,Blob==1?75.f:0.f);
                CloudOrigins.Add(Origin); CloudSpeeds.Add(Drift);
                const float Scale=Random.FRandRange(.72f,1.04f);
                Clouds->AddInstance(FTransform(
                    FRotator(0,Random.FRandRange(0,360),0),Origin,
                    FVector((Blob==1?3.2f:2.45f)*Scale,
                            (Blob==1?1.7f:1.3f)*Scale,
                            (Blob==1?.62f:.48f)*Scale)));
            }
        }
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
        const int32 Blob=Index%3;
        const float Scale=.82f+.06f*(Index%5);
        Clouds->UpdateInstanceTransform(Index,
            FTransform(FRotator(0,Index*29.f,0),P,
                FVector((Blob==1?3.2f:2.45f)*Scale,
                        (Blob==1?1.7f:1.3f)*Scale,
                        (Blob==1?.62f:.48f)*Scale)),
            false,false,true);
    }
    for(int32 Index=0;Index<TorchLights.Num();++Index)
    {
        if(TorchLights[Index].IsValid())
            TorchLights[Index]->SetIntensity(
                1520.f+FMath::Sin(Time*7.2f+Index*1.73f)*230.f);
    }
    if(FireflyOrigins.Num()) Fireflies->MarkRenderStateDirty();
    if(DustOrigins.Num()) Dust->MarkRenderStateDirty();
    if(BirdOrigins.Num()) Birds->MarkRenderStateDirty();
    if(CloudOrigins.Num()) Clouds->MarkRenderStateDirty();
}
