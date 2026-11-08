const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const pathProvider = require('./pathProvider');

/**
 * Detect system hardware specs.
 */
/**
 * Detect system hardware specs.
 */
async function getSystemSpecs() {
    const specs = {
        cpu: {
            model: os.cpus()[0].model,
            cores: os.cpus().length,
        },
        ram: {
            totalGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        },
        gpu: {
            name: 'Unknown',
            vramGB: 0,
        },
        power: {
            isHighPerformance: false,
            planName: 'Unknown'
        },
        platform: process.platform,
    };

    if (process.platform === 'win32') {
        try {
            // 1. Get GPU Name & WMI AdapterRAM via CIM
            const psGpuCommand = 'powershell "Get-CimInstance Win32_VideoController | Select-Object Name, @{Name=\'VRAM\';Expression={[int64]$_.AdapterRAM}} | ConvertTo-Json"';
            const gpuOutput = execSync(psGpuCommand).toString();
            
            let gpuData = JSON.parse(gpuOutput);
            if (Array.isArray(gpuData)) {
                gpuData = gpuData.sort((a, b) => (b.VRAM || 0) - (a.VRAM || 0))[0];
            }

            if (gpuData && gpuData.Name) {
                specs.gpu.name = gpuData.Name;
                let ramBytes = parseInt(gpuData.VRAM || 0);

                // 2. Registry Fallback: Query 64-bit qwMemorySize first (QWORD), then MemorySize (DWORD)
                // Win32_VideoController.AdapterRAM caps at 4GB (32-bit uint) for high-vram GPUs
                try {
                    const regScript = `
                        $paths = @(
                            'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*',
                            'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0*'
                        )
                        Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object { 
                            $_.'HardwareInformation.AdapterString' -or $_.DriverDesc 
                        } | ForEach-Object {
                            [PSCustomObject]@{
                                Adapter = [string]($_.'HardwareInformation.AdapterString')
                                Desc = [string]($_.DriverDesc)
                                qwMem = [int64]($_.'HardwareInformation.qwMemorySize')
                                mem = [int64]($_.'HardwareInformation.MemorySize')
                            }
                        } | ConvertTo-Json
                    `;
                    const buffer = Buffer.from(regScript, 'utf16le');
                    const base64 = buffer.toString('base64');
                    const regOutput = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64}`).toString();
                    
                    const jsonStart = regOutput.indexOf('[');
                    const jsonStartObj = regOutput.indexOf('{');
                    let cleanJson = regOutput;
                    if (jsonStart !== -1 || jsonStartObj !== -1) {
                        const startIdx = (jsonStart !== -1 && (jsonStartObj === -1 || jsonStart < jsonStartObj)) ? jsonStart : jsonStartObj;
                        cleanJson = regOutput.substring(startIdx);
                    }
                    
                    let regEntries = JSON.parse(cleanJson);
                    if (!Array.isArray(regEntries)) regEntries = [regEntries];
                    
                    const gpuTargetName = specs.gpu.name.toLowerCase();
                    // Match by full or partial name, prioritizing highest qwMem / mem
                    const matched = regEntries.find(e => {
                        const a = (e.Adapter || '').toLowerCase();
                        const d = (e.Desc || '').toLowerCase();
                        return (a && (a === gpuTargetName || gpuTargetName.includes(a) || a.includes(gpuTargetName))) ||
                               (d && (d === gpuTargetName || gpuTargetName.includes(d) || d.includes(gpuTargetName)));
                    }) || regEntries.sort((a, b) => (b.qwMem || b.mem || 0) - (a.qwMem || a.mem || 0))[0];
                                    
                    if (matched) {
                        if (matched.qwMem && matched.qwMem > 0) {
                            ramBytes = matched.qwMem;
                        } else if (matched.mem && matched.mem > 0 && ramBytes <= 4294967295) {
                            ramBytes = matched.mem;
                        }
                    }
                } catch (e) {}

                // 3. nvidia-smi fallback for NVIDIA GPUs if ramBytes is still capped at <= 4GB
                if (ramBytes <= 4294967295 && specs.gpu.name.toLowerCase().includes('nvidia')) {
                    try {
                        const smiOut = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits').toString().trim();
                        const smiMb = parseInt(smiOut.split('\n')[0]);
                        if (!isNaN(smiMb) && smiMb > 0) {
                            ramBytes = smiMb * 1024 * 1024;
                        }
                    } catch (e) {}
                }

                specs.gpu.vramGB = Math.round(ramBytes / (1024 * 1024 * 1024));

                // 4. Heuristic Fallback for known GPU series if vramGB is still <= 4
                if (specs.gpu.vramGB <= 4) {
                    const name = specs.gpu.name.toLowerCase();
                    // NVIDIA RTX 50 Series
                    if (name.includes('5090')) specs.gpu.vramGB = 32;
                    else if (name.includes('5080')) specs.gpu.vramGB = 16;
                    else if (name.includes('5070 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('5070')) specs.gpu.vramGB = 12;
                    else if (name.includes('5060 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('5060')) specs.gpu.vramGB = 8;
                    // NVIDIA RTX 40 Series
                    else if (name.includes('4090')) specs.gpu.vramGB = 24;
                    else if (name.includes('4080 super') || name.includes('4080')) specs.gpu.vramGB = 16;
                    else if (name.includes('4070 ti super')) specs.gpu.vramGB = 16;
                    else if (name.includes('4070 ti') || name.includes('4070 super') || name.includes('4070')) specs.gpu.vramGB = 12;
                    else if (name.includes('4060 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('4060')) specs.gpu.vramGB = 8;
                    // NVIDIA RTX 30 Series
                    else if (name.includes('3090')) specs.gpu.vramGB = 24;
                    else if (name.includes('3080 ti')) specs.gpu.vramGB = 12;
                    else if (name.includes('3080')) specs.gpu.vramGB = 10;
                    else if (name.includes('3070 ti') || name.includes('3070')) specs.gpu.vramGB = 8;
                    else if (name.includes('3060 ti')) specs.gpu.vramGB = 8;
                    else if (name.includes('3060')) specs.gpu.vramGB = 12;
                    else if (name.includes('3050 6gb')) specs.gpu.vramGB = 6;
                    else if (name.includes('3050')) specs.gpu.vramGB = 8;
                    // NVIDIA RTX 20 Series
                    else if (name.includes('2080 ti')) specs.gpu.vramGB = 11;
                    else if (name.includes('2080 super') || name.includes('2080')) specs.gpu.vramGB = 8;
                    else if (name.includes('2070 super') || name.includes('2070')) specs.gpu.vramGB = 8;
                    else if (name.includes('2060 super')) specs.gpu.vramGB = 8;
                    else if (name.includes('2060')) specs.gpu.vramGB = 6;
                    // NVIDIA GTX 16 Series
                    else if (name.includes('1660 ti') || name.includes('1660 super') || name.includes('1660')) specs.gpu.vramGB = 6;
                    else if (name.includes('1650 super') || name.includes('1650')) specs.gpu.vramGB = 4;
                    // NVIDIA GTX 10 Series
                    else if (name.includes('1080 ti')) specs.gpu.vramGB = 11;
                    else if (name.includes('1080') || name.includes('1070 ti') || name.includes('1070')) specs.gpu.vramGB = 8;
                    else if (name.includes('1060 6gb') || name.includes('1060')) specs.gpu.vramGB = 6;
                    else if (name.includes('1050 ti') || name.includes('1050')) specs.gpu.vramGB = 4;
                    // NVIDIA GTX 900 / Titan Series
                    else if (name.includes('titan x') || name.includes('titan')) specs.gpu.vramGB = 12;
                    else if (name.includes('980 ti')) specs.gpu.vramGB = 6;
                    else if (name.includes('980') || name.includes('970')) specs.gpu.vramGB = 4;
                    // AMD RX 9000 Series (RDNA 4)
                    else if (name.includes('9070 xt') || name.includes('9070')) specs.gpu.vramGB = 16;
                    else if (name.includes('9060 xt') || name.includes('9060')) specs.gpu.vramGB = 16;
                    else if (name.includes('9050')) specs.gpu.vramGB = 8;
                    // AMD RX 8000 Series (RDNA 4 pre-release designations)
                    else if (name.includes('8800 xt') || name.includes('8800') || name.includes('8700')) specs.gpu.vramGB = 16;
                    else if (name.includes('8600')) specs.gpu.vramGB = 12;
                    // AMD RX 7000 Series
                    else if (name.includes('7900 xtx')) specs.gpu.vramGB = 24;
                    else if (name.includes('7900 xt')) specs.gpu.vramGB = 20;
                    else if (name.includes('7900 gre')) specs.gpu.vramGB = 16;
                    else if (name.includes('7800 xt') || name.includes('7800')) specs.gpu.vramGB = 16;
                    else if (name.includes('7700 xt') || name.includes('7700')) specs.gpu.vramGB = 12;
                    else if (name.includes('7600 xt')) specs.gpu.vramGB = 16;
                    else if (name.includes('7600')) specs.gpu.vramGB = 8;
                    // AMD RX 6000 Series
                    else if (name.includes('6950') || name.includes('6900')) specs.gpu.vramGB = 16;
                    else if (name.includes('6800 xt') || name.includes('6800')) specs.gpu.vramGB = 16;
                    else if (name.includes('6750') || name.includes('6700 xt')) specs.gpu.vramGB = 12;
                    else if (name.includes('6700')) specs.gpu.vramGB = 10;
                    else if (name.includes('6650') || name.includes('6600 xt') || name.includes('6600')) specs.gpu.vramGB = 8;
                    else if (name.includes('6500 xt') || name.includes('6400')) specs.gpu.vramGB = 4;
                    // AMD RX 5000 Series
                    else if (name.includes('5700 xt') || name.includes('5700')) specs.gpu.vramGB = 8;
                    else if (name.includes('5600 xt')) specs.gpu.vramGB = 6;
                    else if (name.includes('5500 xt')) specs.gpu.vramGB = 8;
                    // AMD Vega / Radeon VII / RX 500 / 400 Series
                    else if (name.includes('radeon vii')) specs.gpu.vramGB = 16;
                    else if (name.includes('vega 64') || name.includes('vega 56')) specs.gpu.vramGB = 8;
                    else if (name.includes('rx 590') || name.includes('rx 580') || name.includes('rx 480')) specs.gpu.vramGB = 8;
                    else if (name.includes('rx 570') || name.includes('rx 470')) specs.gpu.vramGB = 4;
                    // Intel Arc Series
                    else if (name.includes('arc a770')) specs.gpu.vramGB = 16;
                    else if (name.includes('arc a750') || name.includes('arc a580')) specs.gpu.vramGB = 8;
                    else if (name.includes('arc b580')) specs.gpu.vramGB = 12;
                    else if (name.includes('arc a380') || name.includes('arc b570')) specs.gpu.vramGB = 6;
                }
            }

            // 5. POWER PLAN DETECTION
            try {
                const powerCommand = 'powercfg /getactivescheme';
                const powerOutput = execSync(powerCommand).toString();
                specs.power.isHighPerformance = powerOutput.toLowerCase().includes('high performance') || powerOutput.toLowerCase().includes('ultimate');
                const nameMatch = powerOutput.match(/\(([^)]+)\)/);
                specs.power.planName = nameMatch ? nameMatch[1] : 'Balanced';
            } catch (e) {}

        } catch (e) {
            console.error('[OPTIMIZER] Specs detection failed:', e.message);
        }
    }

    const perfClass = recommendPerformanceClass(specs);
    specs.recommendedClass = perfClass;
    specs.recommendedPreset = perfClass >= 4 ? 'ULTRA' : 
                              perfClass === 3 ? 'VERY HIGH' : 
                              perfClass === 2 ? 'HIGH' : 
                              perfClass === 1 ? 'MEDIUM' : 'LOW';

    return specs;
}

/**
 * Determine the recommended performance class based on specs.
 * 0: Low, 1: Medium, 2: High, 3: Very High, 4: Ultra
 */
function recommendPerformanceClass(specs) {
    const { ram = {}, gpu = {} } = specs || {};
    const ramGB = ram.totalGB || 0;
    const vramGB = gpu.vramGB || 0;
    const gpuLower = (gpu.name || '').toLowerCase();

    // Check if GPU indicates dedicated/powerful graphics even if vram is unknown
    const isUltraGpu = vramGB >= 10 || 
        gpuLower.includes('rtx 50') || gpuLower.includes('rtx 40') || 
        gpuLower.includes('rtx 3080') || gpuLower.includes('rtx 3090') || 
        gpuLower.includes('rx 9070') || gpuLower.includes('rx 9060') ||
        gpuLower.includes('rx 8800') || gpuLower.includes('rx 8700') ||
        gpuLower.includes('rx 7900') || gpuLower.includes('rx 7800') || 
        gpuLower.includes('rx 6900') || gpuLower.includes('rx 6950') || 
        gpuLower.includes('1080 ti') || gpuLower.includes('arc a770');

    // ULTRA (4): 32GB+ RAM and top-tier GPU (10GB+ VRAM)
    if (ramGB >= 32 && isUltraGpu) {
        return 4;
    }

    // VERY HIGH (3): 16GB+ RAM and high-tier GPU (8GB+ VRAM)
    const isVeryHighGpu = vramGB >= 8 || isUltraGpu ||
        gpuLower.includes('rtx 3070') || gpuLower.includes('rtx 3060') || 
        gpuLower.includes('rtx 2080') || gpuLower.includes('rtx 2070') || 
        gpuLower.includes('rx 6800') || gpuLower.includes('rx 6700') || 
        gpuLower.includes('rx 7700') || gpuLower.includes('gtx 1080') || 
        gpuLower.includes('arc a750') || gpuLower.includes('arc b580');

    if (ramGB >= 16 && isVeryHighGpu) {
        return 3;
    }

    // HIGH (2): 12GB+ RAM and mid-high GPU (6GB+ VRAM)
    const isHighGpu = vramGB >= 6 || isVeryHighGpu ||
        gpuLower.includes('rtx 2060') || gpuLower.includes('rtx 3050') || 
        gpuLower.includes('rx 6600') || gpuLower.includes('rx 7600') || 
        gpuLower.includes('gtx 1660') || gpuLower.includes('gtx 1070');

    if (ramGB >= 12 && isHighGpu) {
        return 2;
    }

    // MEDIUM (1): 8GB+ RAM and mid GPU (4GB+ VRAM) or modern dedicated/discrete GPU
    const isMediumGpu = vramGB >= 4 || isHighGpu ||
        gpuLower.includes('gtx 1060') || gpuLower.includes('gtx 1650') || 
        gpuLower.includes('rx 580') || gpuLower.includes('rx 570') || 
        gpuLower.includes('geforce') || gpuLower.includes('radeon');

    if (ramGB >= 8 && isMediumGpu) {
        return 1;
    }

    // If system has at least 16GB RAM, default to Medium rather than dropping to Low
    if (ramGB >= 16) {
        return 1;
    }

    return 0;
}

/**
 * Inspect a map mod or official map to determine its dimension scale (1x, 4x, 16x).
 * Standard maps in FS are 2048x2048 (1x ~2km). 4096 is 4x (~4km). 8192 is 16x (~8km).
 * @param {string} mapId
 * @param {string} [savePath]
 * @returns {Promise<{ scale: number, label: string }>} 
 */
async function detectMapScale(mapId, savePath = null) {
    if (!mapId) return { scale: 1, label: '1x (Standard)' };
    const lowerId = String(mapId).toLowerCase();
    if (['mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'kinlaig', 'beansandalpacasmap', 'catuai', 'catuaí'].includes(lowerId) ||
        lowerId.startsWith('pdlc_') || lowerId.includes('highlandsfishing') || lowerId.includes('kinlaig') ||
        lowerId.includes('beansandalpacas') || lowerId.includes('catuai') || lowerId.includes('catuaí')) {
        return { scale: 1, label: '1x (Standard)' };
    }
    try {
        const savegameManager = require('./savegameManager');
        let mapZipPath = null;
        if (savePath) {
            mapZipPath = await savegameManager.resolveMapModPath(savePath);
        }
        if (!mapZipPath) {
            const mapModName = mapId.includes('.') ? mapId.split('.')[0] : mapId;
            const modManager = require('./modManager');
            const configuredRoots = modManager.getModsPaths ? modManager.getModsPaths() : [];
            for (const root of configuredRoots) {
                if (!fs.existsSync(root)) continue;
                const directZip = path.join(root, `${mapModName}.zip`);
                if (fs.existsSync(directZip) && fs.statSync(directZip).size > 0) {
                    mapZipPath = directZip;
                    break;
                }
            }
        }
        if (mapZipPath && fs.existsSync(mapZipPath)) {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(mapZipPath);
            const modDescEntry = zip.getEntry('modDesc.xml');
            if (modDescEntry) {
                const modDescXml = modDescEntry.getData().toString('utf8');
                const cfgMatch = modDescXml.match(/<map\s+[^>]*configFilename=["']([^"']+)["']/i) || modDescXml.match(/configFilename=["']([^"']+)["']/i);
                if (cfgMatch && cfgMatch[1]) {
                    const normCfg = cfgMatch[1].replace(/\\/g, '/');
                    const cfgEntry = zip.getEntry(normCfg) || zip.getEntry(cfgMatch[1]);
                    if (cfgEntry) {
                        const cfgXml = cfgEntry.getData().toString('utf8');
                        const wMatch = cfgXml.match(/<map\s+[^>]*width=["'](\d+)["']/i) || cfgXml.match(/width=["'](\d+)["']/i);
                        const hMatch = cfgXml.match(/<map\s+[^>]*height=["'](\d+)["']/i) || cfgXml.match(/height=["'](\d+)["']/i);
                        const width = wMatch ? parseInt(wMatch[1], 10) : 2048;
                        const height = hMatch ? parseInt(hMatch[1], 10) : 2048;
                        const maxDim = Math.max(width, height);
                        if (maxDim >= 8192) return { scale: 16, label: '16x (Massive)' };
                        if (maxDim >= 4096) return { scale: 4, label: '4x (Large)' };
                        return { scale: 1, label: '1x (Standard)' };
                    }
                }
            }
            const baseName = path.basename(mapZipPath).toLowerCase();
            if (baseName.includes('16x')) return { scale: 16, label: '16x (Massive)' };
            if (baseName.includes('4x')) return { scale: 4, label: '4x (Large)' };
        }
    } catch (e) {
        console.warn('[MAP-SCALE] Error detecting map scale:', e.message);
    }
    if (lowerId.includes('16x')) return { scale: 16, label: '16x (Massive)' };
    if (lowerId.includes('4x')) return { scale: 4, label: '4x (Large)' };
    return { scale: 1, label: '1x (Standard)' };
}

/**
 * Apply optimization settings to game.xml
 * @param {Object} [options]
 * @param {number|string} [options.savegameIndex]
 * @param {string} [options.graphicsProfile]
 */
async function optimize(options = {}) {
    const specs = await getSystemSpecs();
    const performanceClass = recommendPerformanceClass(specs);
    const dataRoot = pathProvider.getFS25DataRoot();
    const gameXmlPath = path.join(dataRoot, 'game.xml');
    const backupPath = path.join(dataRoot, 'game.xml.original');

    if (!fs.existsSync(gameXmlPath)) {
        throw new Error('game.xml not found');
    }

    let savePath = null;
    let customSettings = null;
    let mapId = null;
    if (options.savegameIndex) {
        savePath = path.join(dataRoot, `savegame${options.savegameIndex}`);
        const savegameManager = require('./savegameManager');
        customSettings = savegameManager.readSavegameCustomSettingsSync ? savegameManager.readSavegameCustomSettingsSync(savePath) : {};
        const careerFile = path.join(savePath, 'careerSavegame.xml');
        const pendingFile = path.join(savePath, '.mm_pending_settings.json');
        if (fs.existsSync(careerFile)) {
            try {
                const cXml = fs.readFileSync(careerFile, 'utf8');
                const mMatch = cXml.match(/<mapId>([^<]+)<\/mapId>/i);
                if (mMatch) mapId = mMatch[1].trim();
            } catch (_) {}
        } else if (fs.existsSync(pendingFile)) {
            try {
                const pending = fs.readJsonSync(pendingFile);
                mapId = pending?.mapId || null;
            } catch (_) {}
        }
    }

    const profileOverride = options.graphicsProfile || customSettings?.graphicsProfile || 'auto';
    if (profileOverride === 'default') {
        return await optimizeRevert();
    }

    let mapScale = { scale: 1, label: '1x (Standard)' };
    if (profileOverride === 'auto' && mapId) {
        mapScale = await detectMapScale(mapId, savePath);
    }

    if (!fs.existsSync(backupPath)) {
        await fs.copy(gameXmlPath, backupPath);
    }

    const xmlData = await fs.readFile(gameXmlPath, 'utf8');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseAttributeValue: false,
        parseTagValue: false
    });
    const jsonObj = parser.parse(xmlData);

    if (!jsonObj.game) jsonObj.game = {};
    if (!jsonObj.game.graphic) jsonObj.game.graphic = {};
    if (!jsonObj.game.graphic.scalability) jsonObj.game.graphic.scalability = {};

    const scalability = jsonObj.game.graphic.scalability;
    scalability.performanceClass = performanceClass >= 4 ? 'ultra' : 
                                   performanceClass === 3 ? 'very high' :
                                   performanceClass === 2 ? 'high' :
                                   performanceClass === 1 ? 'medium' : 'low';

    // 1. Texture Filtering
    scalability.textureFiltering = performanceClass >= 3 ? "16" : "8";

    // 2. View Distance & LOD Scaling adapting to map scale
    const isUltraRig = performanceClass >= 4;
    if (profileOverride === 'performance_16x' || (profileOverride === 'auto' && mapScale.scale >= 16)) {
        scalability.viewDistanceCoeff = "1.500000";
        scalability.lodDistanceCoeff = "1.200000";
        scalability.foliageViewDistanceCoeff = "1.200000";
        scalability.foliageLODDistanceCoeff = "1.000000";
    } else if (profileOverride === 'balanced_4x' || (profileOverride === 'auto' && mapScale.scale >= 4)) {
        scalability.viewDistanceCoeff = isUltraRig ? "2.500000" : "2.000000";
        scalability.lodDistanceCoeff = "1.500000";
        scalability.foliageViewDistanceCoeff = "1.500000";
        scalability.foliageLODDistanceCoeff = "1.200000";
    } else if (profileOverride === 'ultra' || isUltraRig) {
        scalability.viewDistanceCoeff = "4.000000";
        scalability.lodDistanceCoeff = "2.000000";
        scalability.foliageViewDistanceCoeff = "2.000000";
        scalability.foliageLODDistanceCoeff = "1.500000";
    } else if (performanceClass >= 2) {
        scalability.viewDistanceCoeff = "2.000000";
        scalability.lodDistanceCoeff = "1.500000";
        scalability.foliageViewDistanceCoeff = "1.400000";
    }

    // 3. Shadows
    if (isUltraRig && (profileOverride === 'ultra' || mapScale.scale <= 4)) {
        scalability.shadowMapSize = "4096";
        scalability.maxNumShadowLights = "15";
    } else {
        scalability.shadowMapSize = "2048";
        scalability.maxNumShadowLights = "10";
    }
    scalability.softShadows = "true";

    // 4. Smart Upscaling
    const gpuLower = specs.gpu.name.toLowerCase();
    delete scalability.dlss;
    delete scalability.fsr;
    delete scalability.xess;
    delete scalability.dlssFrameGen;
    if (gpuLower.includes('rtx')) {
        scalability.dlss = { "@_quality": "1" };
        if (gpuLower.includes('rtx 40')) {
            scalability.dlssFrameGen = { "@_enable": "true" };
        }
    } else if (gpuLower.includes('nvidia') || gpuLower.includes('gtx') || gpuLower.includes('amd') || gpuLower.includes('radeon')) {
        scalability.fsr = { "@_quality": "1" };
    } else if (gpuLower.includes('intel') && gpuLower.includes('arc')) {
        scalability.xess = { "@_quality": "1" };
    }

    // 5. Effects
    scalability.volumetricFogQuality = performanceClass >= 3 ? "2" : "1";
    scalability.cloudShadowQuality = performanceClass >= 3 ? "1" : "0";

    // Development Controls
    if (!jsonObj.game.development) jsonObj.game.development = {};
    jsonObj.game.development.controls = "true";

    // Audio Hardening
    if (jsonObj.game.audio && typeof jsonObj.game.audio === 'object') {
        jsonObj.game.audio["@_enable"] = "true";
        if (jsonObj.game.audio["@_volume"] === undefined || jsonObj.game.audio["@_volume"] === null) {
            jsonObj.game.audio["@_volume"] = "1.000000";
        }
    }

    const builder = new XMLBuilder({
        format: true,
        indentBy: '    ',
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        suppressEmptyNode: true,
        processEntities: false,
        suppressBooleanAttributes: false
    });
    let newXml = builder.build(jsonObj).trim();
    if (!newXml.startsWith('<?xml')) {
        newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
    }

    try {
        if (!specs.power.isHighPerformance) {
            execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
        }
    } catch (e) {}

    await fs.writeFile(gameXmlPath, newXml);

    return {
        success: true,
        specs,
        profile: profileOverride,
        mapScale: mapScale.label,
        applied: performanceClass >= 4 ? 'ultra' : 
                 performanceClass === 3 ? 'very high' :
                 performanceClass === 2 ? 'high' :
                 performanceClass === 1 ? 'medium' : 'low',
        tweaks: {
            viewDistance: `${Math.round(parseFloat(scalability.viewDistanceCoeff || 1) * 100)}%`,
            shadows: scalability.shadowMapSize === '4096' ? 'HighRes (4096)' : 'Standard (2048)',
            powerPlan: !specs.power.isHighPerformance ? 'Optimized' : 'Existing'
        }
    };
}

async function optimizeRevert() {
    const dataRoot = pathProvider.getFS25DataRoot();
    const gameXmlPath = path.join(dataRoot, 'game.xml');
    const backupPath = path.join(dataRoot, 'game.xml.original');

    if (!fs.existsSync(gameXmlPath)) {
        throw new Error('game.xml not found.');
    }

    // 1. If an original backup exists and contains valid graphic settings, restore it
    if (fs.existsSync(backupPath)) {
        try {
            const backupContent = await fs.readFile(backupPath, 'utf8');
            if (backupContent && backupContent.includes('<graphic>')) {
                await fs.copy(backupPath, gameXmlPath);
                return { success: true };
            }
        } catch (_) {}
    }

    // 2. Otherwise reset game.xml scalability overrides to default game engine auto-detection
    const xmlData = await fs.readFile(gameXmlPath, 'utf8');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseAttributeValue: false,
        parseTagValue: false
    });
    const jsonObj = parser.parse(xmlData);

    if (jsonObj && jsonObj.game && jsonObj.game.graphic) {
        if (jsonObj.game.graphic.scalability) {
            jsonObj.game.graphic.scalability = {
                performanceClass: 'auto'
            };
        }
    }

    const builder = new XMLBuilder({
        format: true,
        indentBy: '    ',
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        suppressEmptyNode: true,
        processEntities: false,
        suppressBooleanAttributes: false
    });

    let newXml = builder.build(jsonObj);
    newXml = newXml.trim();
    if (!newXml.startsWith('<?xml')) {
        newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
    }

    await fs.writeFile(gameXmlPath, newXml, 'utf8');
    return { success: true };
}

async function setHighPerformancePlan() {
    if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
    try {
        execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
        return { success: true };
    } catch (e) {
        throw new Error(`Failed to set power plan: ${e.message}`);
    }
}

module.exports = { getSystemSpecs, recommendPerformanceClass, optimize, optimizeRevert, setHighPerformancePlan, detectMapScale };
