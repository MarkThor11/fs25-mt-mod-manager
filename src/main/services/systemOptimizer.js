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
            // 1. IMPROVED GPU DETECTION (Bypassing 4GB WMI Cap)
            // We use a combination of CIM and a registry fallback for VRAM
            const psGpuCommand = 'powershell "Get-CimInstance Win32_VideoController | Select-Object Name, @{Name=\'VRAM\';Expression={[int64]$_.AdapterRAM}} | ConvertTo-Json"';
            const gpuOutput = execSync(psGpuCommand).toString();
            
            let gpuData = JSON.parse(gpuOutput);
            if (Array.isArray(gpuData)) {
                gpuData = gpuData.sort((a, b) => (b.VRAM || 0) - (a.VRAM || 0))[0];
            }

            if (gpuData && gpuData.Name) {
                specs.gpu.name = gpuData.Name;
                let ramBytes = parseInt(gpuData.VRAM || 0);
                
                // If it's capped at exactly 4GB (4294967295), it's likely a WMI bug
                if (ramBytes === 4294967295 || ramBytes === -1 || ramBytes === 4294901760) {
                    try {
                        // Fallback to registry for actual VRAM size - search across all active display instances
                        const regCommand = 'powershell "Get-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\000* | Where-Object { $_.\'HardwareInformation.AdapterString\' -ne $null } | Select-Object -ExpandProperty \'HardwareInformation.MemorySize\'"';
                        const regOutput = execSync(regCommand).toString().trim().split('\n')[0]; // Take first valid entry
                        if (regOutput && !isNaN(parseInt(regOutput))) {
                            ramBytes = parseInt(regOutput);
                        }
                    } catch (e) {}
                }

                specs.gpu.vramGB = Math.round(ramBytes / (1024 * 1024 * 1024));
                
                // Heuristic Fallback: If it's an RTX/GTX card and still says 0 or 4, but we know it's higher
                if (specs.gpu.vramGB <= 4) {
                    const name = specs.gpu.name.toLowerCase();
                    if (name.includes('rtx 4090')) specs.gpu.vramGB = 24;
                    else if (name.includes('rtx 4080')) specs.gpu.vramGB = 16;
                    else if (name.includes('rtx 4070')) specs.gpu.vramGB = 12;
                    else if (name.includes('rtx 3090')) specs.gpu.vramGB = 24;
                    else if (name.includes('rtx 3080')) specs.gpu.vramGB = 10;
                    else if (name.includes('rtx 3070')) specs.gpu.vramGB = 8;
                    else if (name.includes('rtx 3060')) specs.gpu.vramGB = 12;
                    else if (name.includes('1080 ti')) specs.gpu.vramGB = 11;
                    else if (name.includes('1080')) specs.gpu.vramGB = 8;
                }
            }

            // 2. POWER PLAN DETECTION
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
    if (ram.totalGB >= 32 && (gpu.vramGB >= 10 || gpuLower.includes('rtx 40') || gpuLower.includes('rtx 3080') || gpuLower.includes('rtx 3090') || gpuLower.includes('rx 7900') || gpuLower.includes('1080 ti'))) {
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
