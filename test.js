const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false });
const xml = `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<careerSavegame revision="2" valid="true">
  <settings>
    <savegameName>My Save</savegameName>
  </settings>
</careerSavegame>`;
const obj = parser.parse(xml);
console.log(builder.build(obj));
