import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';
import HomePage from './pages/HomePage';
import ModHubPage from './pages/ModHubPage';
import ModDetailPage from './pages/ModDetailPage';
import InstalledModsPage from './pages/InstalledModsPage';
import FavouritesPage from './pages/FavouritesPage';
import HiddenModsPage from './pages/HiddenModsPage';
import SavegamesPage from './pages/SavegamesPage';
import ProfilesPage from './pages/ProfilesPage';
import DiagnosticsPage from './pages/DiagnosticsPage';
import SaveTransferPage from './pages/SaveTransferPage';
import SettingsPage from './pages/SettingsPage';
import SupportPage from './pages/SupportPage';
import ThirdPartyPage from './pages/ThirdPartyPage';
import MapsPage from './pages/MapsPage';
import DownloadsPage from './pages/DownloadsPage';
import RadioPage from './pages/RadioPage';
import KeybindsPage from './pages/KeybindsPage';
import ToastContainer from './components/common/ToastContainer';
import DropOverlay from './components/common/DropOverlay';
import WelcomeTour from './components/common/WelcomeTour';
import ErrorBoundary from './components/common/ErrorBoundary';
import ScrollRestorer from './components/common/ScrollRestorer';
import AppUpdateModal from './components/common/AppUpdateModal';
import ConsolidationPromptModal from './components/common/ConsolidationPromptModal';
import AutoUpdatePromptModal from './components/common/AutoUpdatePromptModal';
import { useModHubStore } from './store/useModHubStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useLocalModsStore } from './store/useLocalModsStore';
import { useMapStore } from './store/useMapStore';
import { useDownloadStore } from './store/useDownloadStore';
import { useToastStore } from './store/useToastStore';
import { useSavegameStore } from './store/useSavegameStore';

const MAIN_ROUTES = [
  { path: '/', Component: HomePage },
  { path: '/modhub', Component: ModHubPage },
  { path: '/installed', Component: InstalledModsPage },
  { path: '/favourites', Component: FavouritesPage },
  { path: '/hidden', Component: HiddenModsPage },
  { path: '/savegames', Component: SavegamesPage },
  { path: '/profiles', Component: ProfilesPage },
  { path: '/keybinds', Component: KeybindsPage },
  { path: '/maps', Component: MapsPage },
  { path: '/downloads', Component: DownloadsPage },
  { path: '/radio', Component: RadioPage },
  { path: '/save-transfer', Component: SaveTransferPage },
  { path: '/diagnostics', Component: DiagnosticsPage },
  { path: '/settings', Component: SettingsPage },
  { path: '/support', Component: SupportPage },
  { path: '/third-party', Component: ThirdPartyPage }
];

function AppRoutes() {
  const location = useLocation();
  const currentPath = location.pathname;

  // Track which main tab pages have been visited so we mount them on-demand and keep them alive
  const [visitedPaths, setVisitedPaths] = useState(() => new Set([currentPath]));

  useEffect(() => {
    if (MAIN_ROUTES.some(r => r.path === currentPath)) {
      setVisitedPaths(prev => {
        if (prev.has(currentPath)) return prev;
        const next = new Set(prev);
        next.add(currentPath);
        return next;
      });
    }
  }, [currentPath]);

  const isMainTab = MAIN_ROUTES.some(r => r.path === currentPath);

  return (
    <>
      {/* Keep-alive container for main tab views */}
      {MAIN_ROUTES.map(({ path, Component }) => {
        if (!visitedPaths.has(path)) return null;
        const isActive = isMainTab && currentPath === path;
        return (
          <div
            key={path}
            style={{
              display: isActive ? 'contents' : 'none'
            }}
          >
            <Component />
          </div>
        );
      })}

      {/* Detail / transient sub-routes that unmount when navigating back */}
      {!isMainTab && (
        <Routes>
          <Route path="/modhub/mod/:modId" element={<ModDetailPage />} />
          <Route path="/installed/mod/:fileName" element={<ModDetailPage />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  const { theme, loadSettings, isLoaded } = useSettingsStore();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const init = async () => {
        await loadSettings();
        
        if (!window.api) {
            console.warn("[APP] [INIT] window.api is missing. Skipping auto-updates and system checks.");
            return;
        }
        
        if (import.meta.env.DEV) {
          try {
            localStorage.removeItem('modhub_stats');
            localStorage.removeItem('modhub_cache_v2');
            console.log('[APP] [DEV MODE] Purged volatile modhub_stats & modhub_cache_v2 from localStorage.');
          } catch (_) {}
        }
        useModHubStore.getState().loadCache();
        
        // Load cached installed mods and savegames immediately so UI shows them right away
        await useLocalModsStore.getState().loadCache();
        await useMapStore.getState().loadCache();
        await useSavegameStore.getState().loadCache();
        
        // Startup ModHub Warming: 
        // Fetch the category menu structure immediately so it's ready before the user clicks "ModHub".
        // Once categories are retrieved, initiate a gentle background prefetch of popular mod lists.
        const { fetchCategories, prefetchCategories, startPeriodicStats } = useModHubStore.getState();
        fetchCategories().then(() => {
            // We wait for the category structure to be ready before firing the prefetch loop
            prefetchCategories();
        });
        
        startPeriodicStats();
        
        // Background sync to ensure physical disk files stay 100% in sync with cache
        setTimeout(() => {
            useLocalModsStore.getState().scanMods(null, false);
            useMapStore.getState().fetchTemplates();
        }, 2000);

        // ── DOWNLOAD RESUMPTION ──
        // Check if there were any interrupted downloads and resume them automatically
        if (window.api?.localMods?.resumePending) {
            useDownloadStore.getState().loadPendingDownloads().then(() => {
                window.api.localMods.resumePending().then(res => {
                    if (res?.count > 0) {
                        console.log(`[APP] Resumed ${res.count} pending downloads.`);
                    }
                }).catch(err => console.error('[APP] Failed to resume downloads:', err));
            });
        }
    };

    init();
    
    return () => {
        useModHubStore.getState().stopPeriodicStats();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Protection ──
  useEffect(() => {
    const handleContextMenu = (e) => {
      // Disable right-click in production to protect source 
      // (Can still be bypassed by tech-savvy users, but prevents 99% of casual copying)
      if (window.electron && !window.location.host.includes('localhost')) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // ── Drag & Drop Implementation ──
  useEffect(() => {
    let dragTimeout = null;

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isInternalDrag = useSettingsStore.getState().isInternalDragging;
        
        if (e.dataTransfer.types.includes('Files') && !isInternalDrag) {
            setIsDragging(true);

            // Heartbeat: if mouse leaves window or drag is dropped outside without dragleave firing
            if (dragTimeout) clearTimeout(dragTimeout);
            dragTimeout = setTimeout(() => {
                setIsDragging(false);
            }, 600);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only leave if we exit the window
        if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
            if (dragTimeout) clearTimeout(dragTimeout);
            setIsDragging(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            if (dragTimeout) clearTimeout(dragTimeout);
            setIsDragging(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragTimeout) clearTimeout(dragTimeout);
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        const toast = useToastStore.getState();

        const modPaths = [];
        const savegamePaths = [];

        for (const f of files) {
            const p = f.path;
            if (!p) continue;
            let isSave = false;
            try {
                if (window.api?.savegames?.isSavegame) {
                    isSave = await window.api.savegames.isSavegame(p);
                } else {
                    const name = (f.name || '').toLowerCase();
                    isSave = name.startsWith('savegame') || name.includes('savegame');
                }
            } catch (_) {}

            if (isSave) {
                savegamePaths.push(p);
            } else {
                modPaths.push(p);
            }
        }

        // 1. Process Savegame Imports
        if (savegamePaths.length > 0) {
            toast.info(`Importing ${savegamePaths.length} savegame${savegamePaths.length > 1 ? 's' : ''}...`);
            try {
                const allSaves = (await window.api?.savegames?.getAll?.()) || [];
                const occupiedIndices = new Set(allSaves.filter(s => s.modCount > 0 || (s.farmName && !s.farmName.startsWith('Empty'))).map(s => s.index));
                
                for (const sPath of savegamePaths) {
                    let freeSlot = null;
                    for (let i = 1; i <= 20; i++) {
                        if (!occupiedIndices.has(i)) {
                            freeSlot = i;
                            break;
                        }
                    }
                    if (!freeSlot) {
                        toast.error("All 20 savegame slots are occupied. Open the Savegames page to choose a slot to overwrite.");
                        break;
                    }
                    occupiedIndices.add(freeSlot);
                    const res = await window.api.savegames.import({ sourcePath: sPath, targetIndex: freeSlot });
                    if (res && res.success) {
                        toast.success(`Successfully imported savegame into Slot ${freeSlot}!`);
                    } else {
                        toast.error(`Savegame import failed: ${res?.error || 'Unknown error'}`);
                    }
                }
            } catch (err) {
                toast.error(`Savegame import failed: ${err.message}`);
            }
        }

        // 2. Process Mod Installs
        if (modPaths.length > 0) {
            toast.info(`Scanning and installing dropped mod${modPaths.length > 1 ? 's' : ''}...`);
            try {
                const result = await useLocalModsStore.getState().installLocalMods(modPaths);

                if (result.success.length > 0) {
                    if (result.success.length === 1) {
                        toast.success(`Successfully installed: ${result.success[0].title}`);
                    } else {
                        toast.success(`Successfully installed ${result.success.length} mods!`);
                    }
                }

                if (result.failed.length > 0 && result.success.length === 0) {
                    toast.error(`Import failed: No valid .ZIP files or mod folders found.`);
                } else if (result.failed.length > 0) {
                    toast.warning(`Skipped ${result.failed.length} invalid or incompatible items.`);
                }
            } catch (err) {
                toast.error(`Mod import failed: ${err.message}`);
            }
        }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleKeyDown);

    const handleOnline = () => useSettingsStore.getState().setIsOnline(true);
    const handleOffline = () => useSettingsStore.getState().setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        if (dragTimeout) clearTimeout(dragTimeout);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Background Update Manager & Stats ──
  useEffect(() => {
    if (!isLoaded) return;

    // Fetch initial ModHub stats on startup
    useModHubStore.getState().fetchStats();

    const { modUpdateMode } = useSettingsStore.getState();
    const { updates, triggerAutoUpdateIfNeeded } = useLocalModsStore.getState();

    // 1. Immediately trigger auto-download on launch if there are pending updates and mode is 'auto'
    if (modUpdateMode === 'auto' && Array.isArray(updates) && updates.length > 0) {
      console.log(`[AUTO-UPDATE] Found ${updates.length} pending update(s) on startup. Triggering auto-download...`);
      setTimeout(() => {
        triggerAutoUpdateIfNeeded();
      }, 2000);
    }

    const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

    const runAutoUpdateCheck = async () => {
      const { lastUpdateCheck, setLastUpdateCheck } = useSettingsStore.getState();
      const { checkUpdates, triggerAutoUpdateIfNeeded } = useLocalModsStore.getState();

      const now = Date.now();
      if (now - lastUpdateCheck < CHECK_INTERVAL) {
        triggerAutoUpdateIfNeeded();
        return;
      }

      console.log('[AUTO-UPDATE] Running background update check...');
      await checkUpdates(true);
      setLastUpdateCheck(now);
    };

    // Run once on load (with a delay to let startup settle)
    const initialTimer = setTimeout(runAutoUpdateCheck, 5000);
    
    // Then set interval
    const interval = setInterval(runAutoUpdateCheck, CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isLoaded]);

  // ── Game State Poller ──
  useEffect(() => {
    if (!isLoaded || !window.api?.game) return;
    
    const pollGameState = async () => {
      try {
        const status = window.api.game.getStatus ? await window.api.game.getStatus() : { isRunning: await window.api.game.isRunning(), playingSlot: null };
        const { isGameRunning, playingSlot, launchGraceUntil } = useSavegameStore.getState();
        
        const isRunning = !!status.isRunning;

        // If the game process is not yet detected, but we are within an active launch grace window, keep optimistic launch state
        if (!isRunning && isGameRunning && Date.now() < (launchGraceUntil || 0)) {
          return;
        }

        // Prioritize the existing playingSlot while the game is running so the highlighted slot never flickers or switches
        let currentSlot = null;
        if (isRunning) {
          currentSlot = playingSlot || status.playingSlot || null;
        }

        if (isRunning !== isGameRunning || currentSlot !== playingSlot) {
          if (!isRunning && (playingSlot !== null || status.playingSlot)) {
            const exitedSlot = playingSlot || status.playingSlot;
            useSavegameStore.getState().markSlotExited(exitedSlot);
            useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
            useSavegameStore.getState().fetchSavegames();
            useMapStore.getState().fetchTemplates();
          } else {
            useSavegameStore.setState({ isGameRunning: isRunning, playingSlot: currentSlot, launchGraceUntil: isRunning ? 0 : launchGraceUntil });
          }
        }
      } catch (err) {
        // Ignore errors if game API is unresponsive
      }
    };
    
    const gamePollInterval = setInterval(pollGameState, 3000);
    
    // Listen to event-driven gameExited channel for instant updates
    let unsubscribeGameExited = () => {};
    if (window.api?.on?.gameExited) {
      unsubscribeGameExited = window.api.on.gameExited((data) => {
        console.log('[APP] Game exited event received. Refreshing savegames and templates...');
        const exitedSlot = data?.savegameIndex || data?.slotIndex || useSavegameStore.getState().playingSlot;
        if (exitedSlot) {
          useSavegameStore.getState().markSlotExited(exitedSlot);
        }
        useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
        useSavegameStore.getState().fetchSavegames();
        useMapStore.getState().fetchTemplates();
      });
    }
    
    return () => {
      clearInterval(gamePollInterval);
      unsubscribeGameExited();
    };
  }, [isLoaded]);

  if (!isLoaded) return null;

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TitleBar />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <ScrollRestorer>
              <AppRoutes />
            </ScrollRestorer>
          </main>
        </div>
        <ToastContainer />
        <DropOverlay isDragging={isDragging} onClose={() => setIsDragging(false)} />
        <WelcomeTour />
        <AppUpdateModal />
        <ConsolidationPromptModal />
        <AutoUpdatePromptModal />
      </HashRouter>
    </ErrorBoundary>
  );
}
