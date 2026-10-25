const fs = require('fs');
let vm = fs.readFileSync('src/main/services/versionManager.js', 'utf8').replace(/\r\n/g, '\n');

const target = `    if (cleanEffectiveId && delistedIdsSet.has(cleanEffectiveId)) {
      results.push({
        ...localMod,
        modId: effectiveModId,
        isRemoved: true,
        isDelisted: true,
        hasUpdate: false,
        modhubTitle: localMod.title
      });
      continue;
    }`;

const repl = `    if (cleanEffectiveId && delistedIdsSet.has(cleanEffectiveId)) {
      // Delisted mod from ModHub: do not include in pending updates list
      continue;
    }`;

if (!vm.includes(target)) {
  console.error('target not found in versionManager.js!');
  process.exit(1);
}
vm = vm.replace(target, repl);
fs.writeFileSync('src/main/services/versionManager.js', vm, 'utf8');
console.log('Successfully updated versionManager.js');
