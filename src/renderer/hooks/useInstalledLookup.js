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
    const byExactTitle = new Map();     // exact title (lowercased & trimmed) -> version
    const byExactName = new Map();      // exact modName (lowercased & trimmed) -> version

    const cleanStr = (s) => s ? String(s).trim().toLowerCase() : '';

    // 1. Add finished downloads first (Optimistic UI)
    for (const d of finishedDownloads) {
      if (d.modId) {
        const cleanId = String(d.modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (d.title) {
        const norm = cleanStr(d.title);
        if (norm) byExactTitle.set(norm, 'Installed');
      }
    }

    // 1b. Add session-installed mods (prevents flicker after download removed but before scan done)
    Object.entries(sessionInstalled || {}).forEach(([modId, normTitle]) => {
      if (modId) {
        const cleanId = String(modId).replace(/^0+/, '');
        byModId.set(cleanId, 'Installed');
      }
      if (normTitle) {
        const norm = cleanStr(normTitle);
        if (norm) byExactTitle.set(norm, 'Installed');
      }
    });

    // 2. Add actual local mods (takes precedence for version info)
    for (const lm of localMods) {
      if (!lm) continue;
      if (lm.modId) {
        const cleanId = String(lm.modId).replace(/^0+/, '');
        byModId.set(cleanId, lm.version);
      }
      if (lm.title) {
        const norm = cleanStr(lm.title);
        if (norm) byExactTitle.set(norm, lm.version);
      }
      if (lm.modName) {
        const norm = cleanStr(lm.modName);
        if (norm) byExactName.set(norm, lm.version);
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

      // 2. Title/Name match (Exact string match preserving hyphens/punctuation)
      if (mod.title) {
        const normTitle = cleanStr(mod.title);
        if (normTitle) {
          if (byExactTitle.has(normTitle)) return byExactTitle.get(normTitle) || "0.0.0.0";
          if (byExactName.has(normTitle)) return byExactName.get(normTitle) || "0.0.0.0";
        }
      }

      if (mod.modName) {
        const normName = cleanStr(mod.modName);
        if (normName) {
          if (byExactName.has(normName)) return byExactName.get(normName) || "0.0.0.0";
          if (byExactTitle.has(normName)) return byExactTitle.get(normName) || "0.0.0.0";
        }
      }

      return null;
    }

    return getInstalledVersion;
  }, [localMods, finishedDownloads, sessionInstalled]);
}
