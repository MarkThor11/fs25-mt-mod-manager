const { app } = require('electron');
const path = require('path');
app.setPath('userData', path.join(process.env.APPDATA, 'fs25-mt-mod-manager'));

app.whenReady().then(async () => {
    const modManager = require('./src/main/services/modManager');
    const { mods } = await modManager.scanLocalMods();
    
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
            const cleanFile = m.fileName ? m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase() : '';
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
          console.log("Missing:", cleanedName, depId, nameLower);
        }
      };

      resolve(targetModName);
      return { installed, missing };
    };

    resolveRecursiveDependencies("FS25_Monteriggioni", mods);
    app.quit();
});
