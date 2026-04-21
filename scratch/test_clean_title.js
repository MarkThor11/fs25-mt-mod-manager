
function cleanModTitle(title, modName, fileName, isMap = false) {
	if (!title || !title.includes('(')) return title;

	const parts = title.match(/^(.+?)\s*\((.+?)\)$/);
	if (!parts) return title;

	const outer = parts[1].trim();
	const inner = parts[2].trim();
	const lowerOuter = outer.toLowerCase();
	const lowerInner = inner.toLowerCase();
	const lowerModName = (modName || '').toLowerCase();
	const lowerFileName = (fileName || '').toLowerCase();

	// 1. Remove redundant Repetitions (e.g., "Geistal (Geistal)")
	if (lowerOuter === lowerInner || lowerInner === lowerModName || lowerFileName.includes(lowerInner)) {
		return outer;
	}

	// 2. Remove Map-Associations from non-map mods (e.g., "Bio Tank (The_Peasant_Valley)")
	if (!isMap && (lowerInner.includes('valley') || lowerInner.includes('map') || lowerInner.includes('river') || lowerInner.includes('terrain'))) {
		return outer;
	}

	// 3. Keep for maps if inner is actually the map name and outer is marketing
	if (isMap) {
		const innerLooksLikeMap = lowerInner.includes('map') || lowerInner.includes('valley') || lowerInner.includes('river') || lowerInner.includes('terrain');
		if (innerLooksLikeMap && !lowerOuter.includes('map')) {
			return inner;
		}
		if (lowerInner.startsWith('v') && lowerInner.match(/v\d/)) {
			return outer;
		}
	}

	return title;
}

console.log('Test 1: Geistal (Geistal) ->', cleanModTitle('Geistal (Geistal)', 'FS25_Geistal', 'FS25_Geistal.zip', true));
console.log('Test 2: Gülzow (G_Izow) ->', cleanModTitle('Gülzow (G_Izow)', 'FS25_G_Izow', 'FS25_G_Izow.zip', true));
console.log('Test 3: Bio Tank (The_Peasant_Valley) ->', cleanModTitle('Bio Tank (The_Peasant_Valley)', 'FS25_BioTank', 'FS25_BioTank.zip', false));
console.log('Test 4: Farm Building Set (Kolonia_2026) ->', cleanModTitle('Farm Building Set (Kolonia_2026)', 'FS25_FarmBuildingSet', 'FS25_FarmBuildingSet.zip', false));
console.log('Test 5: Riverbend Springs (US) ->', cleanModTitle('Riverbend Springs (US)', 'MapUS', 'MapUS.zip', true));
