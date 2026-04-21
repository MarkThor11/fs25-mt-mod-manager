const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const fs = require('fs');

const xmlData = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<game>
    <graphic>
        <display>
            <vsync adaptive="true">true</vsync>
        </display>
    </graphic>
    <audio enable="true" volume="1.000000"/>
</game>`;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false
});

const jsonObj = parser.parse(xmlData);
console.log('Parsed JSON:', JSON.stringify(jsonObj, null, 2));

const builder = new XMLBuilder({
    format: true,
    indentBy: '    ',
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    suppressEmptyNode: true,
    processEntities: false
});

let newXml = builder.build(jsonObj);
// Check if declaration is missing
if (!newXml.trim().startsWith('<?xml')) {
    newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
}

console.log('Generated XML:\n', newXml);
