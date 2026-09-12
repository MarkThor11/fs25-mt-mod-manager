const fs = require('fs');
const path = require('path');

const testFile = path.join(process.env.TEMP, `test_link_${Date.now()}.txt`);
const symlinkFile = path.join(process.env.TEMP, `test_symlink_${Date.now()}.txt`);
const hardlinkFile = path.join(process.env.TEMP, `test_hardlink_${Date.now()}.txt`);

fs.writeFileSync(testFile, 'test');

console.log('Testing symlink (file)...');
try {
    fs.symlinkSync(testFile, symlinkFile, 'file');
    console.log('Symlink (file) SUCCESS');
} catch (e) {
    console.log(`Symlink (file) FAILED: ${e.message}`);
}

console.log('Testing hardlink...');
try {
    fs.linkSync(testFile, hardlinkFile);
    console.log('Hardlink SUCCESS');
} catch (e) {
    console.log(`Hardlink FAILED: ${e.message}`);
}

// Cleanup
try { fs.unlinkSync(testFile); } catch (e) {}
try { fs.unlinkSync(symlinkFile); } catch (e) {}
try { fs.unlinkSync(hardlinkFile); } catch (e) {}
