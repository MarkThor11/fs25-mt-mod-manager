const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

async function extractMapDensityFiles(modZipOrDirPath, targetSavePath, overwrite = false) {
    if (!modZipOrDirPath || !fs.existsSync(modZipOrDirPath) || !targetSavePath || !fs.existsSync(targetSavePath)) {
        return 0;
    }
    let extractedCount = 0;
    try {
        const stats = fs.statSync(modZipOrDirPath);
        if (stats.isFile() && modZipOrDirPath.toLowerCase().endsWith('.zip')) {
            const zip = new AdmZip(modZipOrDirPath);
            const entries = zip.getEntries();

            const candidateMap = new Map();
            for (const entry of entries) {
                if (entry.isDirectory) continue;
                const baseName = path.basename(entry.entryName);
                const lowerBase = baseName.toLowerCase();
                const isFieldOrDensity = 
                    lowerBase.startsWith('densitymap_') || 
                    lowerBase.startsWith('infolayer_') ||
                    lowerBase === 'fields.xml' ||
                    lowerBase === 'fieldground.xml' ||
                    lowerBase === 'weed_growthstate.xml' ||
                    lowerBase === 'stone_growthstate.xml' ||
                    lowerBase === 'densitymapheight.xml';

                if (isFieldOrDensity && (lowerBase.endsWith('.gdm') || lowerBase.endsWith('.grle') || lowerBase.endsWith('.png') || lowerBase.endsWith('.xml'))) {
                    const normPath = entry.entryName.replace(/\\/g, '/').toLowerCase();
                    const existing = candidateMap.get(lowerBase);
                    if (!existing) {
                        candidateMap.set(lowerBase, { entry, baseName, normPath, size: entry.header.size });
                    } else {
                        const existingInMaps = existing.normPath.includes('maps/') || existing.normPath.includes('map/');
                        const currentInMaps = normPath.includes('maps/') || normPath.includes('map/');
                        if ((currentInMaps && !existingInMaps) || (currentInMaps === existingInMaps && entry.header.size > existing.size)) {
                            candidateMap.set(lowerBase, { entry, baseName, normPath, size: entry.header.size });
                        }
                    }
                }
            }

            for (const { entry, baseName } of candidateMap.values()) {
                const destPath = path.join(targetSavePath, baseName);
                if (overwrite || !fs.existsSync(destPath)) {
                    await fs.writeFile(destPath, entry.getData());
                    extractedCount++;
                    console.log(`[DENSITY-EXTRACT] Extracted ${entry.entryName} (${entry.header.size} bytes) -> ${destPath}`);
                }
            }
        }
    } catch (err) {
        console.error('[DENSITY-EXTRACT] Error during density extraction:', err.message);
    }
    return extractedCount;
}

async function test() {
  const testDir = path.join(__dirname, 'test_save_2village');
  await fs.emptyDir(testDir);
  const count = await extractMapDensityFiles('F:/mods4/FS25_2Village_Map.zip', testDir, true);
  console.log('Total extracted:', count);
}

test();
