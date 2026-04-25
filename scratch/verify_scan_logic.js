const path = require('path');
const fs = require('fs-extra');

async function testScan() {
    const testRoot = path.join(__dirname, 'test_mods_root');
    await fs.ensureDir(testRoot);
    await fs.emptyDir(testRoot);

    // 1. Create a zipped mod
    await fs.writeFile(path.join(testRoot, 'ZippedMod.zip'), 'dummy content');

    // 2. Create an unzipped mod (folder with modDesc.xml)
    const unzippedModPath = path.join(testRoot, 'UnzippedMod');
    await fs.ensureDir(unzippedModPath);
    await fs.writeFile(path.join(unzippedModPath, 'modDesc.xml'), '<modDesc><version>1.0.0</version></modDesc>');

    // 3. Create an organizational folder with a mod inside
    const orgFolderPath = path.join(testRoot, 'MyOrgFolder');
    await fs.ensureDir(orgFolderPath);
    await fs.writeFile(path.join(orgFolderPath, 'ModInside.zip'), 'dummy content');

    // 4. Create a folder that is NOT a mod (no modDesc.xml)
    const normalFolderPath = path.join(testRoot, 'NotAMod');
    await fs.ensureDir(normalFolderPath);
    await fs.writeFile(path.join(normalFolderPath, 'random.txt'), 'hello');

    console.log('--- SCANNING ---');
    const modsPath = testRoot;
    const entries = await fs.readdir(modsPath, { withFileTypes: true });
    
    const potentialRootEntries = [];
    const folderEntries = [];
    const allFolders = [];
    const subfolderModNames = new Set();

    for (const entry of entries) {
        const entryName = entry.name;
        if (entryName.startsWith('.') || entryName.toLowerCase() === 'backups') continue;

        if (entry.isDirectory()) {
            const subPath = path.join(modsPath, entryName);

            // Check if the folder itself is an unzipped mod
            const isModDir = await fs.pathExists(path.join(subPath, 'modDesc.xml'));
            if (isModDir) {
                potentialRootEntries.push({ root: modsPath, name: entryName, sub: '' });
                console.log(`Detected UNZIPPED MOD: ${entryName}`);
            } else {
                // Treat as organizational folder
                const subEntries = await fs.readdir(subPath, { withFileTypes: true }).catch(() => []);
                
                for (const sub of subEntries) {
                    if (sub.name.toLowerCase().endsWith('.zip')) {
                        folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
                        subfolderModNames.add(sub.name.toLowerCase());
                        console.log(`Detected mod INSIDE folder: ${entryName}/${sub.name}`);
                    } else if (sub.isDirectory()) {
                        const hasModDesc = await fs.pathExists(path.join(subPath, sub.name, 'modDesc.xml'));
                        if (hasModDesc) {
                            folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
                            subfolderModNames.add(sub.name.toLowerCase());
                            console.log(`Detected unzipped mod INSIDE folder: ${entryName}/${sub.name}`);
                        }
                    }
                }
                allFolders.push(entryName);
                console.log(`Detected ORGANIZATIONAL FOLDER: ${entryName}`);
            }
        } else if ((entry.isFile() || entry.isSymbolicLink()) && entryName.toLowerCase().endsWith('.zip')) {
            potentialRootEntries.push({ root: modsPath, name: entryName, sub: '' });
            console.log(`Detected ZIPPED MOD: ${entryName}`);
        }
    }

    console.log('\n--- SUMMARY ---');
    console.log('Potential Root Entries:', potentialRootEntries.map(e => e.name));
    console.log('Folder Entries:', folderEntries.map(e => `${e.sub}/${e.name}`));
    console.log('All Folders:', allFolders);

    // Assertions
    const detectedNames = [...potentialRootEntries.map(e => e.name), ...folderEntries.map(e => e.name)];
    const expected = ['ZippedMod.zip', 'UnzippedMod', 'ModInside.zip'];
    const missing = expected.filter(x => !detectedNames.includes(x));
    
    if (missing.length === 0 && !allFolders.includes('UnzippedMod')) {
        console.log('\nSUCCESS: All mods detected correctly and unzipped mod was not treated as organizational folder.');
    } else {
        console.log('\nFAILURE: Missing mods or incorrect folder categorization.');
        if (allFolders.includes('UnzippedMod')) console.log('- UnzippedMod was incorrectly added to allFolders.');
        if (missing.length > 0) console.log('- Missing:', missing);
    }

    // Cleanup
    await fs.remove(testRoot);
}

testScan().catch(console.error);
