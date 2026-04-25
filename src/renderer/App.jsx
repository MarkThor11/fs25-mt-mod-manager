import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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
import ToastContainer from './components/common/ToastContainer';
import DropOverlay from './components/common/DropOverlay';
import WelcomeTour from './components/common/WelcomeTour';
import ErrorBoundary from './components/common/ErrorBoundary';
import ScrollRestorer from './components/common/ScrollRestorer';
import AppUpdateModal from './components/common/AppUpdateModal';
import { useModHubStore } from './store/useModHubStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useLocalModsStore } from './store/useLocalModsStore';
import { useMapStore } from './store/useMapStore';
import { useToastStore } from './store/useToastStore';

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
        
        useModHubStore.getState().loadCache();
        
        // Load cached installed mods immediately so UI shows them right away
        await useLocalModsStore.getState().loadCache();
        await useMapStore.getState().loadCache();
        
        // Startup ModHub Warming: 
        // Fetch the category menu structure immediately so it's ready before the user clicks "ModHub".
        // Once categories are retrieved, initiate a gentle background prefetch of popular mod lists.
        const { fetchCategories, prefetchCategories, startPeriodicStats } = useModHubStore.getState();
        fetchCategories().then(() => {
            // We wait for the category structure to be ready before firing the prefetch loop
            prefetchCategories();
        });
        
        startPeriodicStats();
        
        // Full scan runs in background with a delay to let startup settle
        setTimeout(() => {
            useLocalModsStore.getState().scanMods();
            useMapStore.getState().fetchTemplates();
        }, 2000);

        // ── DOWNLOAD RESUMPTION ──
        // Check if there were any interrupted downloads and resume them automatically
        if (window.api?.localMods?.resumePending) {
            window.api.localMods.resumePending().then(res => {
                if (res?.count > 0) {
                    console.log(`[APP] Resumed ${res.count} pending downloads.`);
                }
            }).catch(err => console.error('[APP] Failed to resume downloads:', err));
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
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isInternalDrag = useSettingsStore.getState().isInternalDragging;
        
        if (e.dataTransfer.types.includes('Files') && !isInternalDrag) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only leave if we exit the window
        if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
            setIsDragging(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);

        if (files.length === 0) return;

        const toast = useToastStore.getState();
        toast.info(`Scanning and installing dropped item${files.length > 1 ? 's' : ''}...`);

        try {
            const paths = files.map(f => f.path);
            const result = await useLocalModsStore.getState().installLocalMods(paths);

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
            toast.error(`Import failed: ${err.message}`);
        }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    const handleOnline = () => useSettingsStore.getState().setIsOnline(true);
    const handleOffline = () => useSettingsStore.getState().setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Background Update Manager ──
  useEffect(() => {
    if (!isLoaded) return;

    const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

    const runAutoUpdateCheck = async () => {
      const { autoCheckUpdates, modUpdateMode, lastUpdateCheck, setLastUpdateCheck } = useSettingsStore.getState();
      const { checkUpdates, updateMod, scanMods } = useLocalModsStore.getState();
      const toast = useToastStore.getState();

      // Only run if auto-check is enabled
      if (!autoCheckUpdates) return;

      // Check if it's been long enough since last check
      const now = Date.now();
      if (now - lastUpdateCheck < CHECK_INTERVAL) return;

      console.log('[AUTO-UPDATE] Running background update check...');
      await checkUpdates();
      setLastUpdateCheck(now);

      const { updates } = useLocalModsStore.getState();
      
      if (updates.length > 0 && modUpdateMode === 'auto') {
        if (!window.api?.game) return;
        const isRunning = await window.api.game.isRunning();
        if (isRunning) {
          console.log('[AUTO-UPDATE] Game is running. Deferring background updates.');
          return;
        }

        toast.info(`Background Update: Installing ${updates.length} mod updates...`);
        
        let successCount = 0;
        for (const update of updates) {
          try {
            const result = await updateMod(update.fileName, update.modId);
            if (result.success) successCount++;
          } catch (err) {
            console.error(`[AUTO-UPDATE] Failed to update ${update.fileName}:`, err);
          }
        }

        if (successCount > 0) {
          toast.success(`Background Update: Successfully installed ${successCount} mod updates.`);
          await scanMods(); // Final refresh
        }
      }
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

  if (!isLoaded) return null;

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TitleBar />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <ScrollRestorer>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/modhub" element={<ModHubPage />} />
                <Route path="/modhub/mod/:modId" element={<ModDetailPage />} />
                <Route path="/installed" element={<InstalledModsPage />} />
                <Route path="/installed/mod/:fileName" element={<ModDetailPage />} />
                <Route path="/favourites" element={<FavouritesPage />} />
                <Route path="/hidden" element={<HiddenModsPage />} />
                <Route path="/savegames" element={<SavegamesPage />} />
                <Route path="/profiles" element={<ProfilesPage />} />
                <Route path="/maps" element={<MapsPage />} />
                <Route path="/downloads" element={<DownloadsPage />} />
                <Route path="/radio" element={<RadioPage />} />
                <Route path="/save-transfer" element={<SaveTransferPage />} />
                <Route path="/diagnostics" element={<DiagnosticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/third-party" element={<ThirdPartyPage />} />
              </Routes>
            </ScrollRestorer>
          </main>
        </div>
        <ToastContainer />
        <DropOverlay isDragging={isDragging} />
        <WelcomeTour />
        <AppUpdateModal />
      </HashRouter>
    </ErrorBoundary>
  );
}
