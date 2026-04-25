const fs = require('fs');
const content = fs.readFileSync('c:/Users/Mark/Desktop/GoogleModManager/src/main/services/modManager.js', 'utf8');
let open = 0;
let close = 0;
for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') open++;
    else if (content[i] === '}') close++;
}
console.log(`Open: ${open}, Close: ${close}`);
