const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('SELECT * FROM local_mod_cache').all();
const localMods = rows.map(r => JSON.parse(r.value));

console.log("Local mods count:", localMods.length);

const targetMap = localMods.find(m => m.modName === 'FS25_Monteriggioni');
if (!targetMap) {
    console.log("Monteriggioni not found");
    process.exit(1);
}

const resolveRecursiveDependencies = (targetModName, allMods) => {
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  const cleanModName = (name) => {
    if (!name) return "";
    return name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim();
  };

  const resolve = (depObjOrString) => {
    let depString = '';
    let depId = null;
    let fallbackFileName = null;
    
    if (typeof depObjOrString === 'string') {
        depString = depObjOrString;
    } else {
        const url = depObjOrString.url || '';
        if (url) {
            const fileMatch = url.match(/\/([^\/]+\.zip)$/i);
            if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
        }
        depString = fallbackFileName || depObjOrString.modName || depObjOrString.technicalName || depObjOrString.title || depObjOrString.fileName || '';
        const idMatch = url.match(/mod_id=(\d+)/) || url.match(/storage\/(\d+)\//);
        if (idMatch) depId = parseInt(idMatch[1], 10).toString();
    }

    const cleanedName = cleanModName(depString);
    if (!cleanedName) return;
    const nameLower = cleanedName.toLowerCase();
    
    if (processed.has(nameLower)) return;
    processed.add(nameLower);

    const match = allMods.find(m => {
        if (depId && m.modId && String(m.modId) === depId) return true;
        const mName = (m.modName || '').toLowerCase();
        const cleanForMatch = (str) => str.replace(/[^a-z0-9]/g, '').replace(/^(?:fs25|pdlc)+/, '');
        const reqClean = cleanForMatch(nameLower);
        const mClean = cleanForMatch(mName);
        if (reqClean === mClean && reqClean.length > 0) return true;
        const cleanFile = m.fileName ? m.fileName.replace(/\.zip$/i, '').toLowerCase() : '';
        if (reqClean === cleanForMatch(cleanFile) && reqClean.length > 0) return true;
        return false;
    });
    
    if (match) {
      if (match.modName && match.modName.toLowerCase() !== targetModName.toLowerCase()) {
        installed.add(match.modName);
      }
      if (match.dependencies) {
        match.dependencies.forEach(dep => resolve(dep));
      }
    } else {
      missing.add(cleanedName);
    }
  };

  resolve(targetModName);
  return { installed, missing };
};

const res = resolveRecursiveDependencies("FS25_Monteriggioni", localMods);
console.log("Missing set:", Array.from(res.missing));

const cleanModName = (name) => name ? name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim() : '';

// Simulate ModDetailPage logic for "Wooden Shed" and "Small Wooden Shed"
targetMap.dependencies.forEach(dep => {
    let depId = null;
    let fallbackFileName = null;
    if (typeof dep === 'object' && dep.url) {
        const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
        if (idMatch) depId = idMatch[1];
        const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
        if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
    }
    const depString = fallbackFileName || (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || ''));
    const cleanedName = cleanModName(depString);
    const isInstalled = !res.missing.has(cleanedName);
    
    if (dep.title === 'Wooden Shed' || dep.title === 'Small Wooden Shed') {
        console.log(`[${dep.title}] cleanedName: ${cleanedName}, isInstalled: ${isInstalled}`);
    }
});
