const fs = require('fs');
const text = fs.readFileSync('src/renderer/components/modhub/ModCard.jsx', 'utf8');
const lines = text.split('\n');
const start = lines.findIndex(l => l.includes('className="mod-card"'));
if (start !== -1) {
  for (let i = start; i < start + 50; i++) {
    console.log(lines[i]);
  }
} else {
  const start2 = lines.findIndex(l => l.includes('mod-card'));
  for (let i = start2; i < start2 + 50; i++) {
    console.log(lines[i]);
  }
}
