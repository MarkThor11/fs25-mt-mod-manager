const { XMLBuilder } = require('fast-xml-parser');
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false });

const testData = {
    careerSavegame: {
        '@_revision': '2',
        '@_valid': 'true',
        savegameName: 'Test Save'
    }
};

let xml = builder.build(testData);
console.log('--- XML directly from builder ---');
console.log(xml);

function sanitizeXml(xmlContent) {
    if (!xmlContent) return xmlContent;
    xmlContent = xmlContent.replace(/<careerSavegame\b([^>]*?)>/gi, (match, attrs) => {
        if (!/valid=/i.test(attrs)) {
            return `<careerSavegame${attrs} valid="true">`;
        } else {
            return match.replace(/valid=(["']?)(?:true|false|\w*)\1/i, 'valid="true"');
        }
    });
    return xmlContent;
}

console.log('--- XML after sanitize ---');
console.log(sanitizeXml(xml));

const testXmlWithoutValid = '<careerSavegame revision="2">';
console.log('--- Test missing valid attribute ---');
console.log(sanitizeXml(testXmlWithoutValid));
