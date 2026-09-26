const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const gameDir = path.join(process.env.USERPROFILE, 'Documents/My Games/FarmingSimulator2025');
const slotPath = path.join(gameDir, 'savegame1');
const modZipPath = 'F:/mods4/FS25_2Village_Map.zip';

async function prepareSavegame1() {
  await fs.ensureDir(slotPath);
  await fs.emptyDir(slotPath);
  
  console.log('1. Extracting all density and config files from 2Village zip...');
  const zip = new AdmZip(modZipPath);
  const entries = zip.getEntries();
  
  // Extract density maps, infolayers, fields, and config
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const baseName = path.basename(entry.entryName);
    const lowerBase = baseName.toLowerCase();
    
    const isTarget = 
      lowerBase.startsWith('densitymap_') ||
      lowerBase.startsWith('infolayer_') ||
      lowerBase === 'fields.xml' ||
      lowerBase === 'fieldground.xml' ||
      lowerBase === 'weed_growthstate.xml' ||
      lowerBase === 'stone_growthstate.xml' ||
      lowerBase === 'densitymapheight.xml';
      
    if (isTarget && (lowerBase.endsWith('.gdm') || lowerBase.endsWith('.grle') || lowerBase.endsWith('.xml') || lowerBase.endsWith('.png'))) {
      const dest = path.join(slotPath, baseName);
      if (!fs.existsSync(dest)) {
        await fs.writeFile(dest, entry.getData());
        console.log('  Extracted:', baseName, entry.header.size, 'bytes');
      }
    }
  }
  
  // Extract placeables, vehicles, items
  const pEntry = zip.getEntry('maps/config/placeables.xml');
  if (pEntry) await fs.writeFile(path.join(slotPath, 'placeables.xml'), pEntry.getData());
  
  const vEntry = zip.getEntry('maps/config/vehicles.xml');
  if (vEntry) await fs.writeFile(path.join(slotPath, 'vehicles.xml'), vEntry.getData());
  
  const iEntry = zip.getEntry('maps/config/items.xml');
  if (iEntry) await fs.writeFile(path.join(slotPath, 'items.xml'), iEntry.getData());
  
  // Generate farmland.xml
  let farmlandXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<farmlands>
`;
  for (let i = 1; i <= 28; i++) {
    const isOwned = (i === 1 || i === 18 || i === 19);
    farmlandXml += `    <farmland id="${i}" farmId="${isOwned ? '1' : '0'}"/>\n`;
  }
  farmlandXml += `</farmlands>\n`;
  await fs.writeFile(path.join(slotPath, 'farmland.xml'), farmlandXml);
  console.log('  Generated farmland.xml with owned farm property');

  // Generate farms.xml
  const farmsXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<farms>
    <farm farmId="1" name="My farm" color="1" loan="0.000000" money="1000000.000000">
        <players>
            <player uniqueUserId="i+QOspKR7Rz/+5dq9rqsECnaqxfS1Eeb0I4hrQbVzzs=" farmManager="true" />
        </players>
    </farm>
</farms>`;
  await fs.writeFile(path.join(slotPath, 'farms.xml'), farmsXml);
  console.log('  Generated farms.xml');

  // Generate environment.xml
  const envXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<environment>
    <dayTime>480.000000</dayTime>
    <currentDay>1</currentDay>
    <currentMonotonicDay>1</currentMonotonicDay>
    <realHourTimer>0.000000</realHourTimer>
    <daysPerPeriod>1</daysPerPeriod>
    <currentPeriod>6</currentPeriod>
    <time>480.000000</time>
    <weather timeSinceLastRain="24">
        <forecast>
            <instance typeName="SUN" season="SUMMER" variationIndex="1" startDay="1" startDayTime="28800000" duration="39600000"/>
        </forecast>
        <ground wetness="0.000000"/>
    </weather>
</environment>`;
  await fs.writeFile(path.join(slotPath, 'environment.xml'), envXml);
  console.log('  Generated environment.xml');

  // Generate careerSavegame.xml
  const careerXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<careerSavegame revision="2" valid="true">
  <settings>
    <savegameName>2 Villages</savegameName>
    <playerName>Farmer</playerName>
    <creationDate>2026-09-26</creationDate>
    <mapId>FS25_2Village_Map.SampleModMap</mapId>
    <mapTitle>2 Villages Map</mapTitle>
    <saveDateFormatted>2026-09-26</saveDateFormatted>
    <saveDate>2026-09-26</saveDate>
    <initialMoney>1000000</initialMoney>
    <initialLoan>0</initialLoan>
    <difficulty>1</difficulty>
    <economicDifficulty>NORMAL</economicDifficulty>
    <plannedDaysPerPeriod>1</plannedDaysPerPeriod>
    <timeScale>5</timeScale>
    <hasInitiallyOwnedFarmlands>true</hasInitiallyOwnedFarmlands>
    <loadDefaultFarm>true</loadDefaultFarm>
    <loadDefaultVehicles>true</loadDefaultVehicles>
    <isCrossPlatformSavegame>false</isCrossPlatformSavegame>
    <densityMapRevision>1</densityMapRevision>
  </settings>
  <statistics>
    <money>1000000</money>
    <playTime>0.000000</playTime>
  </statistics>
  <mod modName="FS25_2Village_Map" title="2 Villages Map" version="1.0.0.0" required="true" fileHash=""/>
  <mapsSplitShapeFileIds count="0"/>
  <slotSystem slotUsage="0"/>
</careerSavegame>`;
  await fs.writeFile(path.join(slotPath, 'careerSavegame.xml'), careerXml);
  console.log('  Generated careerSavegame.xml');

  console.log('Savegame1 successfully prepared with author density maps and farmlands!');
}

prepareSavegame1();
