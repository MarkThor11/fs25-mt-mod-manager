const fs = require('fs');
const path = require('path');

const fs25Path = "C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025";

for (let i = 1; i <= 20; i++) {
    const careerPath = path.join(fs25Path, `savegame${i}`, 'careerSavegame.xml');
    if (fs.existsSync(careerPath)) {
        let content = fs.readFileSync(careerPath, 'utf8');
        
        // Match the <careerSavegame ...> tag
        const match = content.match(/<careerSavegame([^>]*)/);
        if (match) {
            let attrs = match[1];
            
            // Check if valid="true" is missing
            if (!attrs.includes('valid="true"') && !attrs.includes("valid='true'")) {
                console.log(`Fixing savegame${i}...`);
                // If there's a bare 'valid', replace it
                if (attrs.includes(' valid')) {
                    attrs = attrs.replace(' valid', ' valid="true"');
                } else {
                    attrs += ' valid="true"';
                }
                
                const newTag = `<careerSavegame${attrs}`;
                content = content.replace(/<careerSavegame[^>]*/, newTag);
                fs.writeFileSync(careerPath, content);
            }
        }
    }
}

console.log("All savegames checked and fixed.");
