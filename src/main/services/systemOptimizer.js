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
                        Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\00*' | Where-Object { $_.'HardwareInformation.AdapterString' -or $_.DriverDesc } | ForEach-Object {
                            [PSCustomObject]@{
                                Name = if ($_.'HardwareInformation.AdapterString') { $_.'HardwareInformation.AdapterString' } else { $_.DriverDesc }
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
                    
                    const matched = regEntries.find(e => e.Name && e.Name.toLowerCase() === specs.gpu.name.toLowerCase()) || 
                                    regEntries.sort((a, b) => (b.qwMem || b.mem || 0) - (a.qwMem || a.mem || 0))[0];
                                    
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
                    // RTX 50 Series
                    if (name.includes('rtx 5090')) specs.gpu.vramGB = 32;
                    else if (name.includes('rtx 5080')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 5070 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 5070')) specs.gpu.vramGB = 12;
                    else if (name.includes('rtx 5060 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 5060')) specs.gpu.vramGB = 8;
                    // RTX 40 Series
                    else if (name.includes('rtx 4090')) specs.gpu.vramGB = 24;
                    else if (name.includes('rtx 4080')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 4070 ti')) specs.gpu.vramGB = 12;
                    else if (name.includes('rtx 4070')) specs.gpu.vramGB = 12;
                    else if (name.includes('rtx 4060 ti')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 4060')) specs.gpu.vramGB = 8;
                    // RTX 30 Series
                    else if (name.includes('rtx 3090')) specs.gpu.vramGB = 24;
                    else if (name.includes('rtx 3080 ti')) specs.gpu.vramGB = 12;
                    else if (name.includes('rtx 3080')) specs.gpu.vramGB = 10;
                    else if (name.includes('rtx 3070 ti')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 3070')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 3060 ti')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 3060')) specs.gpu.vramGB = 12;
                    // RTX 20 Series
                    else if (name.includes('rtx 2080 ti')) specs.gpu.vramGB = 11;
                    else if (name.includes('rtx 2080')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 2070')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 2060 super')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 2060')) specs.gpu.vramGB = 6;
                    // GTX 10 Series
                    else if (name.includes('1080 ti')) specs.gpu.vramGB = 11;
                    else if (name.includes('1080')) specs.gpu.vramGB = 8;
                    else if (name.includes('1070')) specs.gpu.vramGB = 8;
                    else if (name.includes('1060')) specs.gpu.vramGB = 6;
                    // AMD RX Series
                    else if (name.includes('rx 7900 xtx')) specs.gpu.vramGB = 24;
                    else if (name.includes('rx 7900 xt')) specs.gpu.vramGB = 20;
                    else if (name.includes('rx 7900 gre')) specs.gpu.vramGB = 16;
                    else if (name.includes('rx 7800')) specs.gpu.vramGB = 16;
                    else if (name.includes('rx 7700')) specs.gpu.vramGB = 12;
                    else if (name.includes('rx 6950') || name.includes('rx 6900')) specs.gpu.vramGB = 16;
                    else if (name.includes('rx 6800')) specs.gpu.vramGB = 16;
                    else if (name.includes('rx 6750') || name.includes('rx 6700')) specs.gpu.vramGB = 12;
                    else if (name.includes('rx 6650') || name.includes('rx 6600')) specs.gpu.vramGB = 8;
                    // Intel Arc Series
                    else if (name.includes('arc a770')) specs.gpu.vramGB = 16;
                    else if (name.includes('arc a750') || name.includes('arc a580')) specs.gpu.vramGB = 8;
                    else if (name.includes('arc b580')) specs.gpu.vramGB = 12;
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

    return specs;
}

/**
 * Determine the recommended performance class based on specs.
 * 0: Low, 1: Medium, 2: High, 3: Very High, 4: Ultra
 */
function recommendPerformanceClass(specs) {
    const { ram, gpu } = specs;
    const gpuLower = gpu.name.toLowerCase();

    // ULTRA (4)
    if (ram.totalGB >= 32 && (gpu.vramGB >= 10 || gpuLower.includes('rtx 50') || gpuLower.includes('rtx 40') || gpuLower.includes('rtx 3080') || gpuLower.includes('rtx 3090') || gpuLower.includes('rx 7900') || gpuLower.includes('1080 ti'))) {
        return 4;
    }

    // VERY HIGH (3)
    if (ram.totalGB >= 16 && (gpu.vramGB >= 8 || gpuLower.includes('rtx 3070') || gpuLower.includes('rtx 3060') || gpuLower.includes('rtx 2080') || gpuLower.includes('rx 6800') || gpuLower.includes('gtx 1080'))) {
        return 3;
    }

    // HIGH (2)
    if (ram.totalGB >= 12 && (gpu.vramGB >= 6 || gpuLower.includes('rtx 2060') || gpuLower.includes('rx 6600') || gpuLower.includes('gtx 1660'))) {
        return 2;
    }

    // MEDIUM (1)
    if (ram.totalGB >= 8 && (gpu.vramGB >= 4 || gpuLower.includes('gtx 1060') || gpuLower.includes('gtx 1650') || gpuLower.includes('rx 580'))) {
        return 1;
    }

    return 0;
}

/**
 * Apply optimization settings to game.xml
 */
async function optimize() {
    const specs = await getSystemSpecs();
    const performanceClass = recommendPerformanceClass(specs);
    const dataRoot = pathProvider.getFS25DataRoot();
    const gameXmlPath = path.join(dataRoot, 'game.xml');
    const backupPath = path.join(dataRoot, 'game.xml.original');

    if (!fs.existsSync(gameXmlPath)) {
        throw new Error('game.xml not found');
    }

    // Create backup if it doesn't exist yet
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
    
    // Set basic performance class
    scalability.performanceClass = performanceClass >= 4 ? 'ultra' : 
                                   performanceClass === 3 ? 'very high' :
                                   performanceClass === 2 ? 'high' :
                                   performanceClass === 1 ? 'medium' : 'low';

    // ── GENTLE OPTIMIZATIONS (Merging, not replacing) ──
    
    // 1. Texture Filtering (Safe)
    scalability.textureFiltering = performanceClass >= 3 ? "16" : "8";

    // 2. View Distance (Extreme potential)
    if (performanceClass >= 4) {
        scalability.viewDistanceCoeff = "4.000000"; // Pushed to 400% for Ultra systems
        scalability.lodDistanceCoeff = "2.000000";
        scalability.foliageViewDistanceCoeff = "2.000000";
    } else if (performanceClass >= 2) {
        scalability.viewDistanceCoeff = "2.000000";
        scalability.lodDistanceCoeff = "1.500000";
    }

    // 3. Shadows (The usual crash culprit)
    if (performanceClass >= 4) {
        scalability.shadowMapSize = "4096";
        scalability.maxNumShadowLights = "15";
    } else {
        scalability.shadowMapSize = "2048";
        scalability.maxNumShadowLights = "10";
    }
    scalability.softShadows = "true";

    // 4. Smart Upscaling (Leveraging hardware potential)
    const gpuLower = specs.gpu.name.toLowerCase();
    
    // Clear existing upscaling to prevent conflicts
    delete scalability.dlss;
    delete scalability.fsr;
    delete scalability.xess;
    delete scalability.dlssFrameGen;

    if (gpuLower.includes('rtx')) {
        // NVIDIA RTX - Enable DLSS
        scalability.dlss = { "@_quality": "1" }; // Quality Mode
        
        // RTX 40-series - Enable Frame Generation
        if (gpuLower.includes('rtx 40')) {
            scalability.dlssFrameGen = { "@_enable": "true" };
        }
    } else if (gpuLower.includes('nvidia') || gpuLower.includes('gtx') || gpuLower.includes('amd') || gpuLower.includes('radeon')) {
        // GTX or AMD - Enable FSR (Best compatible upscaler)
        scalability.fsr = { "@_quality": "1" }; // Quality Mode
    } else if (gpuLower.includes('intel') && gpuLower.includes('arc')) {
        // Intel Arc - Enable XeSS
        scalability.xess = { "@_quality": "1" };
    }

    // 5. Effects
    scalability.volumetricFogQuality = performanceClass >= 3 ? "2" : "1";
    scalability.cloudShadowQuality = performanceClass >= 3 ? "1" : "0";

    // Development Controls
    if (!jsonObj.game.development) jsonObj.game.development = {};
    jsonObj.game.development.controls = "true";

    // Audio Hardening (Preserve the fix)
    if (!jsonObj.game.audio) jsonObj.game.audio = {};
    if (typeof jsonObj.game.audio !== 'object') jsonObj.game.audio = {};
    jsonObj.game.audio["@_enable"] = "true";
    if (!jsonObj.game.audio["@_volume"]) jsonObj.game.audio["@_volume"] = "1.000000";

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

    // 5. System Power Plan (New)
    try {
        if (!specs.power.isHighPerformance) {
            console.log('[OPTIMIZER] Setting Power Plan to High Performance...');
            execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'); // GUID for High Performance
        }
    } catch (e) {
        console.warn('[OPTIMIZER] Failed to set power plan:', e.message);
    }

    await fs.writeFile(gameXmlPath, newXml);

    return {
        success: true,
        specs,
        applied: performanceClass >= 4 ? 'ultra' : 
                 performanceClass === 3 ? 'very high' :
                 performanceClass === 2 ? 'high' :
                 performanceClass === 1 ? 'medium' : 'low',
        tweaks: {
            viewDistance: performanceClass >= 2 ? '300%' : '100%',
            shadows: performanceClass >= 4 ? 'HighRes' : 'Standard',
            powerPlan: !specs.power.isHighPerformance ? 'Optimized' : 'Existing'
        }
    };
}

async function optimizeRevert() {
    const dataRoot = pathProvider.getFS25DataRoot();
    const gameXmlPath = path.join(dataRoot, 'game.xml');
    const backupPath = path.join(dataRoot, 'game.xml.original');

    if (!fs.existsSync(backupPath)) {
        throw new Error('No backup found.');
    }

    await fs.copy(backupPath, gameXmlPath);
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

module.exports = { getSystemSpecs, recommendPerformanceClass, optimize, optimizeRevert, setHighPerformancePlan };
