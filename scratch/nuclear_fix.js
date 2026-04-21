const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const fs25Path = "C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025";
const userDataPath = "C:\\Users\\Mark\\AppData\\Roaming\\GoogleModManager"; // Fallback guess or use electron app path if known

async function nuclearFix() {
    console.log("--- Farming Simulator 25 Nuclear Repair ---");

    // 1. Kill processes
    try {
        console.log("Closing game processes...");
        execSync('taskkill /F /IM FarmingSimulator2025.exe /T', { stdio: 'ignore' });
        execSync('taskkill /F /IM GIANTS_Engine.exe /T', { stdio: 'ignore' });
    } catch (e) {}

    // 2. Clear Shader Cache
    const shaderCache = path.join(fs25Path, 'shader_cache');
    if (fs.existsSync(shaderCache)) {
        console.log("Clearing shader cache...");
        try {
            await fs.emptyDir(shaderCache);
            console.log("  Success.");
        } catch (e) {
            console.log(`  Failed to clear shader cache: ${e.message}`);
        }
    }

    // 3. Clear Virtual Folders
    // We'll search for folders starting with "VirtualActiveMods" in UserData
    // Since I don't have the exact electron path here, I'll use the one from the logs if possible
    // For now, I'll assume it's in the app's working directory or standard locations
    const possibleUserData = [
        path.join(process.env.APPDATA, 'GoogleModManager'),
        path.join(process.env.LOCALAPPDATA, 'GoogleModManager')
    ];

    for (const ud of possibleUserData) {
        if (fs.existsSync(ud)) {
            const files = fs.readdirSync(ud);
            for (const f of files) {
                if (f.startsWith('VirtualActiveMods')) {
                    console.log(`Deleting virtual folder: ${f}`);
                    try {
                        await fs.remove(path.join(ud, f));
                    } catch (e) {
                        console.log(`  Failed: ${e.message}`);
                    }
                }
            }
        }
    }

    // 4. Check for 'game.xml' reset
    // Sometimes windowed_fullscreen with weird resolutions causes crashes
    console.log("Resetting game resolution to safe defaults...");
    const gameXmlPath = path.join(fs25Path, 'game.xml');
    if (fs.existsSync(gameXmlPath)) {
        let content = fs.readFileSync(gameXmlPath, 'utf8');
        content = content.replace(/<width>\d+<\/width>/, '<width>1920</width>');
        content = content.replace(/<height>\d+<\/height>/, '<height>1080</height>');
        content = content.replace(/<fullscreenMode>.*?<\/fullscreenMode>/, '<fullscreenMode>windowed</fullscreenMode>');
        fs.writeFileSync(gameXmlPath, content);
    }

    console.log("--- Repair Complete ---");
    console.log("Please try launching the game from the Mod Manager now.");
}

nuclearFix();
