import { useMemo } from 'react';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useDownloadStore } from '../store/useDownloadStore';

/**
 * Pre-computes a lookup map for installed mods.
 * Call ONCE at the page/layout level, then pass the result down as a prop.
 * This avoids each ModCard subscribing to the store individually.
 *
 * Returns a function: getInstalledVersion(mod) => string|null
 */
export function useInstalledLookup() {
  const localMods = useLocalModsStore((s) => s.mods);
  const sessionInstalled = useDownloadStore((s) => s.sessionInstalled);

  const cleanStr = (s) => s ? String(s).trim().toLowerCase() : '';
  const getBaseName = (str) => {
    if (!str) return '';
    const match = str.match(/([^/\\]+)\.zip$/i) || [null, str];
    return match[1].replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  };

  // Single unified lookup index precomputed ONCE per change
  const lookupIndex = useMemo(() => {
    const byModId = new Map();
    const byExactTitle = new Map();
    const byExactName = new Map();
    const byExactFileName = new Map();
    const byBaseName = new Map();

    // 1. Process local installed mods
    for (let i = 0; i < localMods.length; i++) {
      const lm = localMods[i];
      if (!lm) continue;
      const ver = lm.version || "0.0.0.0";
      const cleanModId = lm.modId ? String(lm.modId).replace(/^0+/, '') : null;

      if (cleanModId) {
        byModId.set(cleanModId, ver);
      }
      if (lm.fileName) {
        const fn = cleanStr(lm.fileName.split(/[/\\]/).pop());
        if (fn) byExactFileName.set(fn, ver);
        const base = getBaseName(lm.fileName);
        if (base) byBaseName.set(base, ver);
      }
      if (lm.title) {
        const norm = cleanStr(lm.title);
        if (norm) byExactTitle.set(norm, { version: ver, modId: cleanModId });
      }
      if (lm.modName) {
        const norm = cleanStr(lm.modName);
        if (norm) {
          byExactName.set(norm, ver);
          const base = getBaseName(lm.modName);
          if (base) byBaseName.set(base, ver);
        }
      }
    }

    // 2. Overlay session installed mods
    Object.keys(sessionInstalled || {}).forEach((modId) => {
      if (modId) byModId.set(String(modId).replace(/^0+/, ''), 'Installed');
    });

    return { byModId, byExactTitle, byExactName, byExactFileName, byBaseName };
  }, [localMods, sessionInstalled]);

  return useMemo(() => {
    function getInstalledVersion(mod) {
      if (!mod) return null;

      // 1. Primary check: official ModHub ID
      if (mod.modId) {
        const cleanId = String(mod.modId).replace(/^0+/, '');
        if (lookupIndex.byModId.has(cleanId)) return lookupIndex.byModId.get(cleanId);
      }

      // 2. Physical filename check (exact zip name / downloadUrl)
      const remoteFileStr = mod.fileName || (mod.downloadUrl ? mod.downloadUrl.split('?')[0].split('/').pop() : null);
      if (remoteFileStr) {
        const fn = cleanStr(remoteFileStr.split(/[/\\]/).pop());
        if (fn && lookupIndex.byExactFileName.has(fn)) {
          return lookupIndex.byExactFileName.get(fn);
        }
        const base = getBaseName(remoteFileStr);
        if (base && lookupIndex.byBaseName.has(base)) {
          return lookupIndex.byBaseName.get(base);
        }
      }

      // 3. Mod technical name check
      if (mod.modName) {
        const normName = cleanStr(mod.modName);
        if (normName) {
          if (lookupIndex.byExactName.has(normName)) return lookupIndex.byExactName.get(normName);
          const base = getBaseName(normName);
          if (base && lookupIndex.byBaseName.has(base)) return lookupIndex.byBaseName.get(base);
        }
      }

      // 4. Exact Title check (safeguarded against PC / Crossplay collisions)
      if (mod.title) {
        const normTitle = cleanStr(mod.title);
        if (normTitle && lookupIndex.byExactTitle.has(normTitle)) {
          const entry = lookupIndex.byExactTitle.get(normTitle);
          const modCleanId = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
          // Only reject if both have official IDs and they clearly differ (different PC/Crossplay variants)
          if (!entry.modId || !modCleanId || entry.modId === modCleanId) {
            return entry.version;
          }
        }
      }

      return null;
    }

    return getInstalledVersion;
  }, [lookupIndex]);
}
