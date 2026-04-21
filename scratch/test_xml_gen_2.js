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
    suppressBooleanAttributes: false // TEST THIS
});

let newXml = builder.build(jsonObj);
console.log('Generated XML (suppressBooleanAttributes: false):\n', newXml);
