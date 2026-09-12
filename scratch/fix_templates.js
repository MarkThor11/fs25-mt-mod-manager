const fs = require('fs');
const path = require('path');

const templatesDir = "C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\modManagerTemplates";

if (fs.existsSync(templatesDir)) {
    const folders = fs.readdirSync(templatesDir);
    folders.forEach(folder => {
        const careerPath = path.join(templatesDir, folder, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            let content = fs.readFileSync(careerPath, 'utf8');
            const match = content.match(/<careerSavegame([^>]*)/);
            if (match) {
                let attrs = match[1];
                if (!attrs.includes('valid="true"') && !attrs.includes("valid='true'")) {
                    console.log(`Fixing template: ${folder}...`);
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
    });
}

console.log("All templates checked and fixed.");
