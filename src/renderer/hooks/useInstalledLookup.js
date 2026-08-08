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
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);
  const sessionInstalled = useDownloadStore((s) => s.sessionInstalled);

  const cleanStr = (s) => s ? String(s).trim().toLowerCase() : '';

  // Single unified lookup index precomputed ONCE per change
  const lookupIndex = useMemo(() => {
    const byModId = new Map();
    const byExactTitle = new Map();
    const byExactName = new Map();

    // 1. Process local installed mods
    for (let i = 0; i < localMods.length; i++) {
      const lm = localMods[i];
      if (!lm) continue;
      if (lm.modId) {
        const cleanId = String(lm.modId).replace(/^0+/, '');
        byModId.set(cleanId, lm.version || "0.0.0.0");
      }
      if (lm.title) {
        const norm = cleanStr(lm.title);
        if (norm) byExactTitle.set(norm, lm.version || "0.0.0.0");
      }
      if (lm.modName) {
        const norm = cleanStr(lm.modName);
        if (norm) byExactName.set(norm, lm.version || "0.0.0.0");
      }
    }

    // 2. Overlay finished downloads
    Object.values(activeDownloads).forEach(d => {
      if (d.status === 'success') {
        if (d.modId) byModId.set(String(d.modId).replace(/^0+/, ''), 'Installed');
        if (d.title) {
          const norm = cleanStr(d.title);
          if (norm) byExactTitle.set(norm, 'Installed');
        }
      }
    });

    // 3. Overlay session installed mods
    Object.entries(sessionInstalled || {}).forEach(([modId, normTitle]) => {
      if (modId) byModId.set(String(modId).replace(/^0+/, ''), 'Installed');
      if (normTitle) {
        const norm = cleanStr(normTitle);
        if (norm) byExactTitle.set(norm, 'Installed');
      }
    });

    return { byModId, byExactTitle, byExactName };
  }, [localMods, activeDownloads, sessionInstalled]);

  return useMemo(() => {
    function getInstalledVersion(mod) {
      if (!mod) return null;

      if (mod.modId) {
        const cleanId = String(mod.modId).replace(/^0+/, '');
        if (lookupIndex.byModId.has(cleanId)) return lookupIndex.byModId.get(cleanId);
      }

      if (mod.title) {
        const normTitle = cleanStr(mod.title);
        if (normTitle) {
          if (lookupIndex.byExactTitle.has(normTitle)) return lookupIndex.byExactTitle.get(normTitle);
          if (lookupIndex.byExactName.has(normTitle)) return lookupIndex.byExactName.get(normTitle);
        }
      }

      if (mod.modName) {
        const normName = cleanStr(mod.modName);
        if (normName) {
          if (lookupIndex.byExactName.has(normName)) return lookupIndex.byExactName.get(normName);
          if (lookupIndex.byExactTitle.has(normName)) return lookupIndex.byExactTitle.get(normName);
        }
      }

      return null;
    }

    return getInstalledVersion;
  }, [lookupIndex]);
}
