const fs = require('fs');
let content = fs.readFileSync('src/renderer/hooks/useInstalledLookup.js', 'utf8').replace(/\r\n/g, '\n');

// Replace both occurrences of byBaseName.set
content = content.replaceAll(
  'if (base) byBaseName.set(base, ver);',
  'if (base) byBaseName.set(base, { version: ver, modId: cleanModId });'
);

const target1 = `        const base = getBaseName(remoteFileStr);
        if (base && lookupIndex.byBaseName.has(base)) {
          return lookupIndex.byBaseName.get(base);
        }`;

const repl1 = `        const base = getBaseName(remoteFileStr);
        if (base && lookupIndex.byBaseName.has(base)) {
          const entry = lookupIndex.byBaseName.get(base);
          const modCleanId = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
          if (!entry.modId || !modCleanId || entry.modId === modCleanId) {
            return entry.version;
          }
        }`;

const target2 = `          const base = getBaseName(normName);
          if (base && lookupIndex.byBaseName.has(base)) return lookupIndex.byBaseName.get(base);`;

const repl2 = `          const base = getBaseName(normName);
          if (base && lookupIndex.byBaseName.has(base)) {
            const entry = lookupIndex.byBaseName.get(base);
            const modCleanId = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
            if (!entry.modId || !modCleanId || entry.modId === modCleanId) {
              return entry.version;
            }
          }`;

if (!content.includes(target1)) {
  console.error('target1 not found!');
  process.exit(1);
}
if (!content.includes(target2)) {
  console.error('target2 not found!');
  process.exit(1);
}

content = content.replace(target1, repl1);
content = content.replace(target2, repl2);

fs.writeFileSync('src/renderer/hooks/useInstalledLookup.js', content, 'utf8');
console.log('Successfully updated useInstalledLookup.js');
