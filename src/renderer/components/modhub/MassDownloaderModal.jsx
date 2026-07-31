import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Play, Square, RefreshCw, CheckCircle, Package, Layers, Zap, AlertCircle, Shield, RotateCcw } from 'lucide-react';
import { useDownloadStore } from '../../store/useDownloadStore';
import { useToastStore } from '../../store/useToastStore';
import { useModHubStore } from '../../store/useModHubStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';

export default function MassDownloaderModal({ isOpen, onClose }) {
  const { categories, fetchMods } = useModHubStore();
  const { addDownload, removeDownload } = useDownloadStore();
  const { toast } = useToastStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [targetCount, setTargetCount] = useState(100);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedModsList, setFailedModsList] = useState([]);
  const [currentModTitle, setCurrentModTitle] = useState('');
  const [currentCategoryName, setCurrentCategoryName] = useState('');
  const [log, setLog] = useState([]);

  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setIsDownloading(false);
      isCancelledRef.current = true;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const categoryOptions = [
    { filter: 'all', name: '⚡ All Categories (Sequential)' },
    { filter: 'latest', name: '🆕 Latest Releases' },
    { filter: 'best', name: '⭐ Most Popular / Top Downloaded' },
    { filter: 'tractorsS', name: '🚜 Small Tractors' },
    { filter: 'tractorsM', name: '🚜 Medium Tractors' },
    { filter: 'tractorsL', name: '🚜 Large Tractors' },
    { filter: 'trucks', name: '🚛 Trucks & Transporters' },
    { filter: 'trailers', name: '🌾 Trailers & Tippers' },
    { filter: 'combines', name: '🌽 Harvesters & Combines' },
    { filter: 'cutters', name: '🌾 Cutters & Headers' },
    { filter: 'cultivators', name: '🌱 Cultivators & Harrows' },
    { filter: 'seeders', name: '🌱 Seeders & Planters' },
    { filter: 'sprayers', name: '💧 Sprayers & Fertilizers' },
    { filter: 'mowers', name: '✂️ Mowers & Tedders' },
    { filter: 'baling', name: '📦 Baling Technology' },
    { filter: 'maps', name: '🗺️ Maps & Environments' },
    { filter: 'buildings', name: '🏠 Placeables & Sheds' },
  ];

  const appendLog = (msg) => {
    setLog((prev) => [msg, ...prev.slice(0, 49)]);
  };

  const handleStartMassDownload = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    isCancelledRef.current = false;
    setDownloadedCount(0);
    setFailedCount(0);
    setFailedModsList([]);
    setLog([]);
    appendLog(`🚀 Starting mass download sequence (Target: ${targetCount} mods)...`);

    let totalQueued = 0;
    let failedItems = [];

    let targetFilters = [];
    if (selectedCategory === 'all') {
      targetFilters = ['latest', 'best', 'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'trailers', 'combines', 'cutters', 'cultivators', 'seeders', 'sprayers', 'mowers', 'baling', 'buildings'];
    } else {
      targetFilters = [selectedCategory];
    }

    try {
      for (const filter of targetFilters) {
        if (isCancelledRef.current || totalQueued >= targetCount) break;

        const catName = categoryOptions.find(c => c.filter === filter)?.name || filter;
        setCurrentCategoryName(catName);
        appendLog(`📂 Fetching category: ${catName}...`);

        let page = 0;
        let maxPages = 15;

        while (page < maxPages && totalQueued < targetCount && !isCancelledRef.current) {
          try {
            const pageMods = await fetchMods(filter, page, true);
            if (!pageMods || pageMods.length === 0) break;

            for (const mod of pageMods) {
              if (isCancelledRef.current || totalQueued >= targetCount) break;
              if (!mod.modId) continue;

              setCurrentModTitle(mod.title || `Mod ${mod.modId}`);

              try {
                const detail = await window.api.modhub.fetchModDetail({ modId: mod.modId });
                const downloadUrl = detail?.downloadUrl || mod.downloadUrl;

                if (!downloadUrl) {
                  appendLog(`⚠️ Skipping ${mod.title}: No download URL found`);
                  failedItems.push(mod);
                  setFailedCount(failedItems.length);
                  setFailedModsList([...failedItems]);
                  continue;
                }

                addDownload(mod.modId, mod.title || `Mod #${mod.modId}`);
                
                const result = await window.api.mods.install({
                  modId: mod.modId,
                  modTitle: mod.title,
                  downloadUrl: downloadUrl,
                  category: mod.category || filter,
                  subFolder: null
                });

                if (result && result.success) {
                  totalQueued++;
                  setDownloadedCount(totalQueued);
                  appendLog(`✅ Downloaded [${totalQueued}/${targetCount}]: ${mod.title}`);
                } else {
                  failedItems.push(mod);
                  setFailedCount(failedItems.length);
                  setFailedModsList([...failedItems]);
                  removeDownload(mod.modId);
                  appendLog(`❌ Failed: ${mod.title} (${result?.error || 'Unknown error'})`);
                }

                await new Promise((r) => setTimeout(r, 250));

              } catch (err) {
                failedItems.push(mod);
                setFailedCount(failedItems.length);
                setFailedModsList([...failedItems]);
                removeDownload(mod.modId);
                appendLog(`❌ Exception downloading ${mod.title}: ${err.message}`);
              }
            }

            page++;
          } catch (err) {
            appendLog(`⚠️ Error fetching page ${page} for ${filter}: ${err.message}`);
            break;
          }
        }
      }

      if (isCancelledRef.current) {
        appendLog(`⏹️ Mass download process stopped by user.`);
        toast.info(`Mass download stopped. ${totalQueued} mods downloaded.`);
      } else {
        appendLog(`🎉 Mass download complete! Total downloaded: ${totalQueued}`);
        toast.success(`Mass download finished! Successfully downloaded ${totalQueued} mods.`);
        await useLocalModsStore.getState().scanMods();
      }

    } catch (err) {
      appendLog(`💥 Critical error: ${err.message}`);
      toast.error(`Mass download encountered an error: ${err.message}`);
    } finally {
      setIsDownloading(false);
      setCurrentModTitle('');
    }
  };

  const handleRetryFailed = async () => {
    if (isDownloading || failedModsList.length === 0) return;

    setIsDownloading(true);
    isCancelledRef.current = false;
    const retryQueue = [...failedModsList];
    setFailedModsList([]);
    appendLog(`🔄 Retrying ${retryQueue.length} failed downloads...`);

    let retrySuccess = 0;
    let remainingFailed = [];

    try {
      for (const mod of retryQueue) {
        if (isCancelledRef.current) break;
        setCurrentModTitle(mod.title || `Mod ${mod.modId}`);

        try {
          // Bust cache to ensure a fresh URL fetch
          const detail = await window.api.modhub.fetchModDetail({ modId: mod.modId, bustCache: true });
          const downloadUrl = detail?.downloadUrl || mod.downloadUrl;

          if (!downloadUrl) {
            appendLog(`⚠️ Retry skipped ${mod.title}: No download URL`);
            remainingFailed.push(mod);
            continue;
          }

          addDownload(mod.modId, mod.title || `Mod #${mod.modId}`);

          const result = await window.api.mods.install({
            modId: mod.modId,
            modTitle: mod.title,
            downloadUrl: downloadUrl,
            category: mod.category || 'retry',
            subFolder: null
          });

          if (result && result.success) {
            retrySuccess++;
            setDownloadedCount((prev) => prev + 1);
            appendLog(`✅ Retry Successful: ${mod.title}`);
          } else {
            remainingFailed.push(mod);
            removeDownload(mod.modId);
            appendLog(`❌ Retry Failed: ${mod.title}`);
          }

          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          remainingFailed.push(mod);
          removeDownload(mod.modId);
          appendLog(`❌ Retry Error ${mod.title}: ${e.message}`);
        }
      }

      setFailedModsList(remainingFailed);
      setFailedCount(remainingFailed.length);

      if (retrySuccess > 0) {
        toast.success(`Successfully retried and downloaded ${retrySuccess} mods!`);
        await useLocalModsStore.getState().scanMods();
      }

    } finally {
      setIsDownloading(false);
      setCurrentModTitle('');
    }
  };

  const handleStop = () => {
    isCancelledRef.current = true;
    setIsDownloading(false);
    appendLog(`Stopping mass download...`);
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="modal-content animate-fade-in" style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.1), transparent)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '12px' }}>
              <Download size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                Mass Mod Downloader (Heavy Stress Testing Tool)
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Automate downloading hundreds of mods from ModHub to test app performance with high mod counts.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isDownloading}
            style={{ padding: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: isDownloading ? 'not-allowed' : 'pointer', borderRadius: '8px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }} className="custom-scrollbar">
          {/* Options Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Select Target Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={isDownloading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: isDownloading ? 'not-allowed' : 'pointer'
                }}
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.filter} value={opt.filter}>{opt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Mod Count Target
              </label>
              <select
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                disabled={isDownloading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: isDownloading ? 'not-allowed' : 'pointer'
                }}
              >
                <option value={25}>25 Mods (Quick Test)</option>
                <option value={50}>50 Mods</option>
                <option value={100}>100 Mods (Recommended)</option>
                <option value={250}>250 Mods</option>
                <option value={500}>500 Mods (Heavy)</option>
                <option value={1000}>1000 Mods (Extreme Stress Test)</option>
              </select>
            </div>
          </div>

          {/* Progress Bar & Status */}
          <div style={{
            background: 'var(--bg-tertiary)',
            borderRadius: '14px',
            padding: '16px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {isDownloading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    Downloading: {currentCategoryName || 'Preparing...'}
                  </span>
                ) : (
                  'Ready to start mass download sequence'
                )}
              </span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent)' }}>
                {downloadedCount} / {targetCount} Mods
              </span>
            </div>

            {/* Progress Bar Track */}
            <div style={{ width: '100%', height: '10px', background: 'var(--bg-card)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, Math.round((downloadedCount / targetCount) * 100))}%`,
                background: 'linear-gradient(90deg, var(--accent), #1DB954)',
                borderRadius: '6px',
                transition: 'width 0.3s ease'
              }} />
            </div>

            {currentModTitle && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Current item: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{currentModTitle}</span>
              </div>
            )}
          </div>

          {/* Real-time Activity Log */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Live Execution Log
            </div>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '12px',
              height: '140px',
              overflowY: 'auto',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }} className="custom-scrollbar">
              {log.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Click "Start Mass Download" to begin...</span>
              ) : (
                log.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-card)'
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Failed downloads: <strong style={{ color: failedCount > 0 ? '#ef4444' : 'var(--text-secondary)' }}>{failedCount}</strong>
          </span>

          <div style={{ display: 'flex', gap: '10px' }}>
            {failedModsList.length > 0 && !isDownloading && (
              <button
                onClick={handleRetryFailed}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #ef4444',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RotateCcw size={16} /> Retry Failed ({failedModsList.length})
              </button>
            )}

            <button
              onClick={onClose}
              disabled={isDownloading}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '13px',
                cursor: isDownloading ? 'not-allowed' : 'pointer'
              }}
            >
              Close
            </button>

            {isDownloading ? (
              <button
                onClick={handleStop}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Square size={16} /> Stop Downloading
              </button>
            ) : (
              <button
                onClick={handleStartMassDownload}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(var(--accent-rgb), 0.3)'
                }}
              >
                <Play size={16} /> Start Mass Download
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
