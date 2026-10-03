const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

const BASE_FRUIT_ENTRIES = [
  '$data/foliage/wheat/wheat.xml',
  '$data/foliage/barley/barley.xml',
  '$data/foliage/canola/canola.xml',
  '$data/foliage/oat/oat.xml',
  '$data/foliage/maize/maize.xml',
  '$data/foliage/sunflower/sunflower.xml',
  '$data/foliage/soybean/soybean.xml',
  '$data/foliage/potato/potato.xml',
  '$data/foliage/rice/rice.xml',
  '$data/foliage/riceLongGrain/riceLongGrain.xml',
  '$data/foliage/sugarbeet/sugarbeet.xml',
  '$data/foliage/sugarcane/sugarcane.xml',
  '$data/foliage/cotton/cotton.xml',
  '$data/foliage/sorghum/sorghum.xml',
  '$data/foliage/grape/grape.xml',
  '$data/foliage/olive/olive.xml',
  '$data/foliage/poplar/poplar.xml',
  '$data/foliage/beetRoot/beetRoot.xml',
  '$data/foliage/carrot/carrot.xml',
  '$data/foliage/parsnip/parsnip.xml',
  '$data/foliage/greenBean/greenBean.xml',
  '$data/foliage/pea/pea.xml',
  '$data/foliage/spinach/spinach.xml',
  '$data/foliage/grass/grass.xml',
  '$data/foliage/oilseedRadish/oilseedRadish.xml',
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'fruitType',
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '    ',
  suppressEmptyNode: true,
});

function detectExternalFruitTypesPath(zip) {
  const candidates = ['maps/mapEU.xml', 'maps/map.xml', 'mapEU.xml', 'map.xml'];

  for (const candidate of candidates) {
    const entry = zip.getEntry(candidate);
    if (!entry) continue;

    const xml = entry.getData().toString('utf8');
    const parsed = parser.parse(xml);
    const mapNode = parsed?.map;
    if (!mapNode) continue;

    const fruitTypesNode = mapNode.fruitTypes;
    if (!fruitTypesNode) continue;

    if (typeof fruitTypesNode === 'object' && fruitTypesNode.fruitType) {
      return null;
    }

    const filename = fruitTypesNode?.['@_filename'];
    if (filename) return filename;
  }

  return null;
}

function isMissingBaseEntries(parsedXml) {
  const entries = parsedXml?.map?.fruitTypes?.fruitType ?? [];
  const filenames = entries.map((e) => e?.['@_filename'] ?? '');
  const missingBaseFruits = !filenames.some((f) => f && f.includes('wheat.xml'));
  const missingCategories = !parsedXml?.map?.fruitTypeCategories;
  return missingBaseFruits || missingCategories;
}

function buildMergedXml(parsedXml) {
  const existingEntries = parsedXml?.map?.fruitTypes?.fruitType ?? [];
  const existingFilenames = new Set(existingEntries.map((e) => e?.['@_filename']));

  const baseToAdd = BASE_FRUIT_ENTRIES
    .filter((f) => !existingFilenames.has(f))
    .map((f) => ({ '@_filename': f }));

  const mergedEntries = [...baseToAdd, ...existingEntries];

  // Try to load base game categories and converters from FS25 install
  let baseCategories = null;
  let baseConverters = null;
  try {
    const fs25Root = path.join(require('./pathProvider').getFS25DataRoot(), '..', 'Farming Simulator 25', 'data', 'maps', 'maps_fruitTypes.xml');
    if (fs.existsSync(fs25Root)) {
      const bXml = fs.readFileSync(fs25Root, 'utf8');
      const bParsed = parser.parse(bXml);
      baseCategories = bParsed?.map?.fruitTypeCategories;
      baseConverters = bParsed?.map?.fruitTypeConverters;
    }
  } catch (_) {}

  const mergedXml = {
    '?xml': { '@_version': '1.0', '@_encoding': 'utf-8', '@_standalone': 'no' },
    map: {
      '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@_xsi:noNamespaceSchemaLocation': '../../shared/xml/schema/fruitTypes.xsd',
      fruitTypes: {
        fruitType: mergedEntries,
      },
      fruitTypeCategories: baseCategories || {
        fruitTypeCategory: [
          { '@_name': 'GRAINHEADER', '#text': 'WHEAT BARLEY OAT CANOLA SOYBEAN SORGHUM RICELONGGRAIN' },
          { '@_name': 'MAIZEHEADER', '#text': 'MAIZE SUNFLOWER' },
          { '@_name': 'MAIZECUTTER', '#text': 'MAIZE WHEAT BARLEY OAT CANOLA SORGHUM SOYBEAN SUNFLOWER' },
          { '@_name': 'DIRECTCUTTER', '#text': 'GRASS WHEAT BARLEY OAT CANOLA SORGHUM SOYBEAN SUNFLOWER' },
          { '@_name': 'SOWINGMACHINE', '#text': 'WHEAT BARLEY OAT CANOLA RICELONGGRAIN OILSEEDRADISH GRASS PEA SPINACH' },
          { '@_name': 'SUGARCANE_PLANTER', '#text': 'SUGARCANE' },
          { '@_name': 'PLANTER', '#text': 'MAIZE SORGHUM SUNFLOWER SOYBEAN SUGARBEET COTTON GREENBEAN' },
          { '@_name': 'PLANTER_SMALL', '#text': 'CARROT PARSNIP BEETROOT SPINACH' },
          { '@_name': 'WEEDER', '#text': 'OILSEEDRADISH GRASS' },
          { '@_name': 'TOPLIFTINGHARVESTER', '#text': 'CARROT BEETROOT PARSNIP' },
          { '@_name': 'MOWER', '#text': 'GRASS WHEAT BARLEY OAT CANOLA SOYBEAN' },
          { '@_name': 'COMBINE_MOWER', '#text': 'WHEAT BARLEY OAT CANOLA SOYBEAN' }
        ]
      },
      fruitTypeConverters: baseConverters || undefined
    },
  };

  return builder.build(mergedXml);
}

function patchMapFruitTypes(zipPath) {
  if (!fs.existsSync(zipPath)) {
    return { patched: false, reason: 'ZIP not found' };
  }

  try {
    const zip = new AdmZip(zipPath);
    const externalPath = detectExternalFruitTypesPath(zip);
    if (!externalPath) {
      return { patched: false, reason: 'No external fruitTypes file reference — no patch needed' };
    }

    const entry = zip.getEntry(externalPath);
    if (!entry) {
      return { patched: false, reason: `External fruitTypes file declared but not found in ZIP: ${externalPath}` };
    }

    const originalXml = entry.getData().toString('utf8');
    const parsedXml = parser.parse(originalXml);

    if (!isMissingBaseEntries(parsedXml)) {
      return { patched: false, reason: 'Base fruit entries already present — no patch needed' };
    }

    const bakPath = zipPath + '.bak';
    if (!fs.existsSync(bakPath)) {
      fs.copyFileSync(zipPath, bakPath);
    }

    const mergedXml = buildMergedXml(parsedXml);
    zip.updateFile(externalPath, Buffer.from(mergedXml, 'utf8'));
    zip.writeZip(zipPath);

    return {
      patched: true,
      reason: `Prepended ${BASE_FRUIT_ENTRIES.length} base fruit entries to ${externalPath}`,
    };
  } catch (err) {
    return { patched: false, reason: `Failed to patch ZIP: ${err.message}` };
  }
}

module.exports = {
  patchMapFruitTypes
};
