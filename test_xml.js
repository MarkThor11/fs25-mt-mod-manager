const path = require('path');
const fs = require('fs-extra');

async function testGenerate() {
    const savegameName = 'Test Save';
    const today = new Date().toISOString().split('T')[0];
    const mapId = 'SampleModMap'; // Saxlingham
    const mapTitle = 'Saxlingham Farm Estate';
    const mapModName = 'FS25_Saxlingham_crossplay';
    const initialMoney = 1000000;
    const initialLoan = 0;
    const difficulty = 1;
    const economicDifficulty = 'NORMAL';
    const loadDefaultFarm = true;
    const fixedSeasonLength = 1;
    const timeScale = 1.0;
    const selectedMods = [];

    const finalMods = [...selectedMods];
    if (mapModName) {
        finalMods.unshift({ modName: mapModName, title: mapTitle, version: '1.0.0.0' });
    }

    const modLines = finalMods.map(mod => {
      const modName = mod.modName;
      const title = mod.title;
      const version = mod.version || '1.0.0.0';
      const isRequired = mapModName && (modName === mapModName) ? 'true' : 'false';
      return `        <mod modName="${modName}" title="${title}" version="${version}" required="${isRequired}" fileHash=""/>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<careerSavegame revision="2" valid="true">
    <settings>
        <savegameName>${savegameName}</savegameName>
        <creationDate>${today}</creationDate>
        <mapId>${mapId}</mapId>
        <mapTitle>${mapTitle}</mapTitle>
        <saveDateFormatted>${today}</saveDateFormatted>
        <saveDate>${today}</saveDate>
        <initialMoney>${initialMoney}</initialMoney>
        <initialLoan>${initialLoan}</initialLoan>
        <difficulty>${difficulty}</difficulty>
        <economicDifficulty>${economicDifficulty}</economicDifficulty>
        <hasInitiallyOwnedFarmlands>${loadDefaultFarm}</hasInitiallyOwnedFarmlands>
        <loadDefaultFarm>${loadDefaultFarm}</loadDefaultFarm>
        <loadDefaultVehicles>${loadDefaultFarm}</loadDefaultVehicles>
        <loadDefaultPlaceables>${loadDefaultFarm}</loadDefaultPlaceables>
        <startWithGuidedTour>false</startWithGuidedTour>
        <trafficEnabled>true</trafficEnabled>
        <stopAndGoBraking>true</stopAndGoBraking>
        <trailerFillLimit>false</trailerFillLimit>
        <automaticMotorStartEnabled>true</automaticMotorStartEnabled>
        <growthMode>1</growthMode>
        <plannedDaysPerPeriod>${fixedSeasonLength}</plannedDaysPerPeriod>
        <fruitDestruction>true</fruitDestruction>
        <plowingRequiredEnabled>false</plowingRequiredEnabled>
        <stonesEnabled>true</stonesEnabled>
        <weedsEnabled>true</weedsEnabled>
        <limeRequired>true</limeRequired>
        <isSnowEnabled>true</isSnowEnabled>
        <fuelUsage>2</fuelUsage>
        <helperBuyFuel>true</helperBuyFuel>
        <helperBuySeeds>true</helperBuySeeds>
        <helperBuyFertilizer>true</helperBuyFertilizer>
        <helperSlurrySource>2</helperSlurrySource>
        <helperManureSource>2</helperManureSource>
        <densityMapRevision>4</densityMapRevision>
        <terrainTextureRevision>1</terrainTextureRevision>
        <terrainLodTextureRevision>2</terrainLodTextureRevision>
        <splitShapesRevision>2</splitShapesRevision>
        <tipCollisionRevision>2</tipCollisionRevision>
        <placementCollisionRevision>2</placementCollisionRevision>
        <navigationCollisionRevision>2</navigationCollisionRevision>
        <mapDensityMapRevision>1</mapDensityMapRevision>
        <mapTerrainTextureRevision>1</mapTerrainTextureRevision>
        <mapTerrainLodTextureRevision>1</mapTerrainLodTextureRevision>
        <mapSplitShapesRevision>1</mapSplitShapesRevision>
        <mapTipCollisionRevision>1</mapTipCollisionRevision>
        <mapPlacementCollisionRevision>1</mapPlacementCollisionRevision>
        <mapNavigationCollisionRevision>1</mapNavigationCollisionRevision>
        <disasterDestructionState>ENABLED</disasterDestructionState>
        <dirtInterval>3</dirtInterval>
        <timeScale>${timeScale.toFixed(6)}</timeScale>
        <autoSaveInterval>15.000000</autoSaveInterval>
        <isCrossPlatformSavegame>true</isCrossPlatformSavegame>
        <careerPreset>${difficulty}</careerPreset>
    </settings>
    <map>
        <foundHelpIcons>00000000000000000000</foundHelpIcons>
    </map>
    <introductionHelp active="false">
        <shownElements></shownElements>
        <shownHints></shownHints>
    </introductionHelp>
    <statistics>
        <money>${initialMoney}</money>
        <playTime>0.000000</playTime>
    </statistics>
    <mods>
${modLines}
    </mods>
    <mapsSplitShapeFileIds count="0"/>
    <slotSystem slotUsage="0"/>
</careerSavegame>`;

    console.log(xml);
}

testGenerate();
