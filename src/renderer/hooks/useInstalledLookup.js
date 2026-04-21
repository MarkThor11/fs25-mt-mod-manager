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
    const byNormalizedTitle = new Map(); // normalized title -> version
    const byNormalizedName = new Map();  // normalized modName -> version

    // 1. Add finished downloads first (Optimistic UI)
    for (const d of finishedDownloads) {
      if (d.modId) {
        const cleanId = String(d.modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (d.title) {
        const norm = d.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm) byNormalizedTitle.set(norm, 'Installed');
      }
    }

    // 1b. Add session-installed mods (prevents flicker after download removed but before scan done)
    Object.entries(sessionInstalled || {}).forEach(([modId, normTitle]) => {
      if (modId) {
        const cleanId = String(modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (normTitle) byNormalizedTitle.set(normTitle, 'Installed');
    });

    // 2. Add actual local mods (takes precedence for version info)
    for (const lm of localMods) {
      if (!lm) continue;
      if (lm.modId) {
        const cleanId = String(lm.modId).replace(/^0+/, '');
        byModId.set(cleanId, lm.version);
      }
      if (lm.title) {
        const norm = lm.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm) byNormalizedTitle.set(norm, lm.version);
      }
      if (lm.modName) {
        const norm = lm.modName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm) byNormalizedName.set(norm, lm.version);
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
          return byModId.get(cleanId) || "0.0.0.0";
        }
      }

      // 2. Title/Name match (Strict)
      if (mod.title) {
        const normTitle = mod.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normTitle) {
          if (byNormalizedTitle.has(normTitle)) return byNormalizedTitle.get(normTitle) || "0.0.0.0";
          if (byNormalizedName.has(normTitle)) return byNormalizedName.get(normTitle) || "0.0.0.0";
        }
      }

      // 3. Fuzzy Match (Fallback for variations in ModHub titles)
      if (mod.title && mod.title.length > 5) {
        const normTitle = mod.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [localTitle, version] of byNormalizedTitle.entries()) {
           if (localTitle.length > 5 && (normTitle.includes(localTitle) || localTitle.includes(normTitle))) {
             return version || "0.0.0.0";
           }
        }
      }

      return null;
    }

    return getInstalledVersion;
  }, [localMods, activeDownloads, sessionInstalled]);
}
