const { XMLParser, XMLBuilder } = require('fast-xml-parser');

const xmlData = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<game>
    <audio enable="true" volume="1.000000"/>
</game>`;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false
});

const jsonObj = parser.parse(xmlData);

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressBooleanAttributes: false,
    suppressEmptyNode: true
});

let newXml = builder.build(jsonObj);
// Clean up leading spaces/newlines
newXml = newXml.trim();

console.log('Final Test XML:\n', newXml);
if (newXml.startsWith('<?xml')) console.log('Starts with declaration: YES');
else console.log('Starts with declaration: NO');
