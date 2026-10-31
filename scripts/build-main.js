const fs = require('fs-extra');
const path = require('path');
const electronPath = require('electron');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src', 'main');
const outDir = path.join(rootDir, 'dist-main');

console.log('[HARDEN-BUILD] Starting main process hardening pipeline...');
console.log(`[HARDEN-BUILD] Source: ${srcDir}`);
console.log(`[HARDEN-BUILD] Output: ${outDir}`);

// Clean and recreate output directory
fs.removeSync(outDir);
fs.ensureDirSync(outDir);

// 1. Copy resources and non-js static assets intact
fs.copySync(path.join(srcDir, 'resources'), path.join(outDir, 'resources'));
if (fs.existsSync(path.join(srcDir, 'assets'))) {
  fs.copySync(path.join(srcDir, 'assets'), path.join(outDir, 'assets'));
}

// 2. Identify files to process
const servicesDir = path.join(srcDir, 'services');
const serviceFiles = fs.readdirSync(servicesDir);

fs.ensureDirSync(path.join(outDir, 'services'));

// Temporary runner script to compile files with Electron's exact V8 engine
const compilerScript = path.join(rootDir, '.compile_runner.js');
const jsFilesToCompile = [];

for (const file of serviceFiles) {
  const fullPath = path.join(servicesDir, file);
  const outPath = path.join(outDir, 'services', file);

  // Skip legacy / unreferenced backup files that fail parsing
  if (file === 'modManager2.js') {
    continue;
  }

  if (file.endsWith('.json')) {
    // Minify JSON files
    const jsonContent = fs.readJsonSync(fullPath);
    fs.writeJsonSync(outPath, jsonContent);
    console.log(`[HARDEN-BUILD] Minified JSON: services/${file}`);
  } else if (file.endsWith('.js')) {
    // Read source JS
    const rawJs = fs.readFileSync(fullPath, 'utf8');

    // Step A: Strong Obfuscation
    const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawJs, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.6,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });

    const obfuscatedJsPath = path.join(outDir, 'services', file);
    fs.writeFileSync(obfuscatedJsPath, obfuscatedResult.getObfuscatedCode(), 'utf8');

    // Step B: Record for V8 Bytecode Compilation
    jsFilesToCompile.push({
      inputJs: obfuscatedJsPath,
      outputJsc: obfuscatedJsPath.replace(/\.js$/, '.jsc'),
      fileName: file
    });
  }
}

// Write the batch compiler runner that Electron will execute
const runnerCode = `
const bytenode = require('bytenode');
const fs = require('fs');
const files = ${JSON.stringify(jsFilesToCompile)};

for (const f of files) {
  try {
    bytenode.compileFile({
      filename: f.inputJs,
      output: f.outputJsc,
      compileAsModule: true
    });
    // Remove the plaintext JS file so ONLY the compiled bytecode remains
    fs.unlinkSync(f.inputJs);
    console.log('[BYTECODE] Compiled: ' + f.fileName + ' -> ' + f.fileName.replace(/\\.js$/, '.jsc'));
  } catch (err) {
    console.error('[BYTECODE-ERROR] Failed compiling ' + f.fileName + ':', err);
    process.exit(1);
  }
}
process.exit(0);
`;

fs.writeFileSync(compilerScript, runnerCode, 'utf8');

try {
  console.log('[HARDEN-BUILD] Running V8 bytecode compilation via Electron V8 engine...');
  execSync(`"${electronPath}" "${compilerScript}"`, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit'
  });
} finally {
  if (fs.existsSync(compilerScript)) {
    fs.unlinkSync(compilerScript);
  }
}

// 3. Create loader shims in dist-main/services so index.js requires work seamlessly
for (const f of jsFilesToCompile) {
  const shimPath = f.inputJs; // original .js path
  const baseJsc = path.basename(f.outputJsc);
  const shimCode = `require('bytenode');\nmodule.exports = require('./${baseJsc}');\n`;
  fs.writeFileSync(shimPath, shimCode, 'utf8');
}

// 4. Obfuscate preload.js into dist-main/preload.js (preload must remain JS for Electron contextBridge)
const rawPreload = fs.readFileSync(path.join(srcDir, 'preload.js'), 'utf8');
const obPreload = JavaScriptObfuscator.obfuscate(rawPreload, {
  compact: true,
  controlFlowFlattening: false,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8
});
fs.writeFileSync(path.join(outDir, 'preload.js'), obPreload.getObfuscatedCode(), 'utf8');
console.log('[HARDEN-BUILD] Obfuscated preload.js');

// 5. Build bootstrap entry index.js that ensures bytenode is registered before anything loads
const rawIndex = fs.readFileSync(path.join(srcDir, 'index.js'), 'utf8');
const obIndex = JavaScriptObfuscator.obfuscate(rawIndex, {
  compact: true,
  controlFlowFlattening: false,
  stringArray: true,
  stringArrayThreshold: 0.75
});

const bootstrapIndex = `require('bytenode');\n` + obIndex.getObfuscatedCode();
fs.writeFileSync(path.join(outDir, 'index.js'), bootstrapIndex, 'utf8');
console.log('[HARDEN-BUILD] Hardened and obfuscated index.js');

console.log('[HARDEN-BUILD] ✅ Build pipeline hardening complete. Protected bytecode and obfuscation ready in dist-main/');
