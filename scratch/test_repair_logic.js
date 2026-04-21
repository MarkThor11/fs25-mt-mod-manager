const { XMLParser, XMLBuilder } = require('fast-xml-parser');

const xmlData = `<settings helperBuyFuel helperBuySeeds helperBuyFertilizer helperSlurrySource="2" />`;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false
});

const jsonObj = parser.parse(xmlData);
console.log('Parsed:', JSON.stringify(jsonObj, null, 2));

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressBooleanAttributes: false,
    suppressEmptyNode: true
});

const newXml = builder.build(jsonObj);
console.log('Fixed XML:\n', newXml);
