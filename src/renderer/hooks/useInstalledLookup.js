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
  const finishedDownloads = useMemo(() => 
    Object.values(activeDownloads).filter(d => d.status === 'success'),
    [activeDownloads]
  );

  return useMemo(() => {
    // Build multiple indexes for fast O(1) lookups
    const byModId = new Map();          // modId -> version
    const byExactTitle = new Map();     // exact title (lowercased & normalized) -> version
    const byExactName = new Map();      // exact modName (lowercased & normalized) -> version

    const cleanStr = (s) => s ? String(s).trim().toLowerCase() : '';
    const normStr = (s) => s ? String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    // Helper to register a key into map
    const register = (map, key, val) => {
      if (!key) return;
      map.set(key, val);
      const nKey = normStr(key);
      if (nKey) map.set(nKey, val);
    };

    // 1. Add finished downloads first (Optimistic UI)
    for (const d of finishedDownloads) {
      if (d.modId) {
        const cleanId = String(d.modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (d.title) {
        register(byExactTitle, cleanStr(d.title), 'Installed');
      }
    }

    // 1b. Add session-installed mods
    Object.entries(sessionInstalled || {}).forEach(([modId, normTitle]) => {
      if (modId) {
        const cleanId = String(modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (normTitle) {
        register(byExactTitle, cleanStr(normTitle), 'Installed');
      }
    });

    // 2. Add actual local mods (takes precedence for version info)
    for (const lm of localMods) {
      if (!lm) continue;
      const ver = lm.version || 'Installed';
      if (lm.modId) {
        const cleanId = String(lm.modId).replace(/^0+/, '');
        byModId.set(cleanId, ver);
      }
      if (lm.title) {
        register(byExactTitle, cleanStr(lm.title), ver);
      }
      if (lm.mapTitle) {
        register(byExactTitle, cleanStr(lm.mapTitle), ver);
      }
      if (lm.modName) {
        register(byExactName, cleanStr(lm.modName), ver);
      }
      if (lm.technicalName) {
        register(byExactName, cleanStr(lm.technicalName), ver);
      }
      if (lm.fileName) {
        const baseName = String(lm.fileName).split(/[\/\\]/).pop().replace(/\.zip$/i, '');
        register(byExactName, cleanStr(baseName), ver);
      }
    }

    /**
     * Fast installed-version check. Returns the installed version string or null.
     */
    function getInstalledVersion(mod) {
      if (!mod) return null;

      // 1. Direct modId match (fastest)
      if (mod.modId) {
        const cleanId = String(mod.modId).replace(/^0+/, '');
        if (byModId.has(cleanId)) {
          return byModId.get(cleanId) || "Installed";
        }
      }

      // 2. Title/Name match (with alphanumeric normalization)
      const titleClean = cleanStr(mod.title);
      const titleNorm = normStr(mod.title);
      if (titleClean) {
        if (byExactTitle.has(titleClean)) return byExactTitle.get(titleClean) || "Installed";
        if (byExactTitle.has(titleNorm)) return byExactTitle.get(titleNorm) || "Installed";
        if (byExactName.has(titleClean)) return byExactName.get(titleClean) || "Installed";
        if (byExactName.has(titleNorm)) return byExactName.get(titleNorm) || "Installed";
      }

      const nameClean = cleanStr(mod.modName);
      const nameNorm = normStr(mod.modName);
      if (nameClean) {
        if (byExactName.has(nameClean)) return byExactName.get(nameClean) || "Installed";
        if (byExactName.has(nameNorm)) return byExactName.get(nameNorm) || "Installed";
        if (byExactTitle.has(nameClean)) return byExactTitle.get(nameClean) || "Installed";
        if (byExactTitle.has(nameNorm)) return byExactTitle.get(nameNorm) || "Installed";
      }

      return null;
    }

    return getInstalledVersion;
  }, [localMods, finishedDownloads, sessionInstalled]);
}
