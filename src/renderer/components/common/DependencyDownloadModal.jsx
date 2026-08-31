import React, { useState, useEffect } from 'react';
import { Download, X, Search, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDownloadStore } from '../../store/useDownloadStore';

const getModKey = (m) => {
    if (!m) return '';
    if (typeof m === 'string') return m.trim().toLowerCase();
    if (m.modId) return `id_${String(m.modId).replace(/^0+/, '')}`;
    if (m.url) {
        const idMatch = m.url.match(/mod_id=(\d+)/i) || m.url.match(/storage\/(\d+)\//i);
        if (idMatch) return `id_${parseInt(idMatch[1], 10)}`;
        const fileMatch = m.url.match(/\/([^\/]+\.zip)$/i);
        if (fileMatch) return fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
        return m.url.toLowerCase();
    }
    if (m.fileName) return m.fileName.replace(/\.zip$/i, '').toLowerCase();
    if (m.modName) return m.modName.toLowerCase();
    if (m.technicalName) return m.technicalName.toLowerCase();
    if (m.title) return m.title.trim().toLowerCase();
    if (m.name) return m.name.trim().toLowerCase();
    return JSON.stringify(m).toLowerCase();
};

export default function DependencyDownloadModal({ missingMods, onComplete, onCancel, subFolder, parentId, mainTask }) {
    const registerBatch = useDownloadStore(s => s.registerBatch);
    const [status, setStatus] = useState('confirming'); // confirming, processing, complete
    const [modStatuses, setModStatuses] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    
    // --- Deduplicate internally by unique mod key ---
    const uniqueMods = React.useMemo(() => {
        const seen = new Set();
        return (missingMods || []).filter(m => {
            const key = getModKey(m);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [missingMods]);

    // Auto-close if there are no missing mods to process
    useEffect(() => {
        if (!missingMods || missingMods.length === 0 || uniqueMods.length === 0) {
            const timer = setTimeout(() => {
                onComplete?.();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [missingMods, uniqueMods.length, onComplete]);

    // Keep modStatuses in sync with uniqueMods props (merge new mods as pending)
    useEffect(() => {
        setModStatuses(prev => {
            let changed = false;
            const next = { ...prev };
            uniqueMods.forEach(mod => {
                const key = getModKey(mod);
                if (!next[key]) {
                    const displayTitle = typeof mod === 'string' ? mod : (mod.title || mod.modName || mod.name || mod.technicalName || key);
                    next[key] = { status: 'pending', progress: 0, title: displayTitle };
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [uniqueMods]);

    useEffect(() => {
        if (!window.api?.on) return;
        const removeDepListener = window.api.on.dependencyProgress?.((data) => {
            const { type, modName, status, percent, title, modId } = data;
            const targetModIdStr = modId ? String(modId).replace(/^0+/, '') : null;
            const cleanIncomingTitle = (title || modName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            setModStatuses(prev => {
                let matchedKey = null;

                // 1. Check by modId in existing keys
                if (targetModIdStr) {
                    matchedKey = Object.keys(prev).find(k => k === `id_${targetModIdStr}` || k === targetModIdStr);
                }

                // 2. Check by clean title match in existing keys
                if (!matchedKey && cleanIncomingTitle) {
                    matchedKey = Object.keys(prev).find(k => {
                        const item = prev[k];
                        const itemTitle = (item.title || k).toLowerCase().replace(/[^a-z0-9]/g, '');
                        return itemTitle && (itemTitle === cleanIncomingTitle || itemTitle.includes(cleanIncomingTitle) || cleanIncomingTitle.includes(itemTitle));
                    });
                }

                if (!matchedKey) {
                    matchedKey = getModKey({ modId, title: title || modName, modName });
                }

                const current = prev[matchedKey] || { status: 'pending', progress: 0, title: title || modName || matchedKey };
                const nextItem = { ...current };

                if (type === 'STATUS') {
                    nextItem.status = status;
                    if (title || modName) nextItem.title = title || modName;
                } else if (type === 'PROGRESS') {
                    if (current.progress === percent && (current.status === 'downloading' || current.status === 'DOWNLOADING')) return prev;
                    nextItem.progress = percent;
                    if (nextItem.status !== 'success' && nextItem.status !== 'installed') nextItem.status = 'downloading';
                }

                return { ...prev, [matchedKey]: nextItem };
            });
        });

        const removeDlListener = window.api.on.downloadProgress?.((data) => {
            const { modId, status, progress, title, fileName } = data || {};
            const targetModIdStr = modId ? String(modId).replace(/^0+/, '') : null;
            const cleanIncomingTitle = (title || fileName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            setModStatuses(prev => {
                let matchedKey = null;
                if (targetModIdStr) {
                    matchedKey = Object.keys(prev).find(k => k === `id_${targetModIdStr}` || k === targetModIdStr);
                }
                if (!matchedKey && cleanIncomingTitle) {
                    matchedKey = Object.keys(prev).find(k => {
                        const item = prev[k];
                        const itemTitle = (item.title || k).toLowerCase().replace(/[^a-z0-9]/g, '');
                        return itemTitle && (itemTitle === cleanIncomingTitle || itemTitle.includes(cleanIncomingTitle) || cleanIncomingTitle.includes(itemTitle));
                    });
                }
                if (!matchedKey) return prev;

                const current = prev[matchedKey];
                const nextItem = { ...current };
                if (status === 'success' || status === 'installed') {
                    nextItem.status = 'success';
                    nextItem.progress = 100;
                } else if (status === 'downloading' || status === 'DOWNLOADING') {
                    nextItem.status = 'downloading';
                    if (typeof progress === 'number') nextItem.progress = progress;
                }
                return { ...prev, [matchedKey]: nextItem };
            });
        });

        return () => {
            removeDepListener?.();
            removeDlListener?.();
        };
    }, []);

    const processingRef = React.useRef(false);

    const processPendingMods = React.useCallback(async (modsToProcess) => {
        if (!modsToProcess || modsToProcess.length === 0 || processingRef.current) return;
        processingRef.current = true;
        setIsProcessing(true);
        setStatus('processing');

        try {
            if (parentId) {
                registerBatch(parentId, modsToProcess.length);
            }
            const res = await window.api.localMods.autoInstallDependencies({ 
                mods: modsToProcess, 
                subFolder,
                parentId
            });

            // Refresh library
            try {
                const { useLocalModsStore } = await import('../../store/useLocalModsStore');
                await useLocalModsStore.getState().scanMods(null, true);
            } catch (_) {}
            
            setStatus('complete');
        } catch (err) {
            console.error('[DEPENDENCY MODAL] Processing error:', err);
            setStatus('complete');
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    }, [parentId, registerBatch, subFolder]);

    const handleConfirm = async () => {
        setStatus('processing');
        if (mainTask) {
            await window.api.mods.install(mainTask).catch(() => {});
        }
        await processPendingMods(uniqueMods);
    };

    // Auto-trigger processing for newly added pending mods when modal is active
    useEffect(() => {
        if (status === 'processing' && !isProcessing && !processingRef.current) {
            const pendingMods = uniqueMods.filter(m => {
                const key = getModKey(m);
                const st = (modStatuses[key]?.status || '').toLowerCase();
                return !st || st === 'pending';
            });
            if (pendingMods.length > 0) {
                processPendingMods(pendingMods);
            }
        }
    }, [uniqueMods, modStatuses, status, isProcessing, processPendingMods]);

    // Check terminal statuses & auto-dismiss once all unique mods complete
    useEffect(() => {
        if (status === 'processing' || status === 'complete') {
            const keys = uniqueMods.map(m => getModKey(m));
            const statuses = keys.map(k => (modStatuses[k]?.status || '').toLowerCase()).filter(Boolean);

            if (statuses.length > 0 && statuses.length === uniqueMods.length) {
                const isAllTerminal = statuses.every(st => 
                    ['success', 'installed', 'completed', 'error', 'not_found_on_modhub'].includes(st)
                );

                if (isAllTerminal) {
                    if (status !== 'complete') setStatus('complete');
                    const allSuccess = statuses.every(st => st === 'success' || st === 'installed' || st === 'completed');
                    if (allSuccess) {
                        const timer = setTimeout(() => {
                            onComplete?.();
                        }, 1200);
                        return () => clearTimeout(timer);
                    }
                }
            }
        }
    }, [uniqueMods, modStatuses, status, onComplete]);

    const handleManualSearch = (modName) => {
        window.api.shell.openExternal(`https://www.farming-simulator.com/mods.php?title=${encodeURIComponent(modName)}`);
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 3000, background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)' }}>
            <div className="modal-content animate-zoom-in" style={{ width: 500, padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                <Download size={20} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Missing Dependencies</h3>
                                <p style={{ fontSize: 12, opacity: 0.6 }}>This map requires extra mods to function</p>
                            </div>
                        </div>
                        <button className="btn btn--ghost btn--sm" onClick={onCancel || onComplete} title="Close"><X size={20} /></button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
                    {status === 'confirming' && (
                        <div style={{ marginBottom: 20 }}>
                            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                                The following <strong>{uniqueMods.length} mods</strong> were detected as missing. Would you like to automatically download them?
                            </p>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {uniqueMods.map(m => {
                            const depKey = getModKey(m);
                            const mod = modStatuses[depKey] || (m.title && modStatuses[m.title]) || Object.values(modStatuses).find(st => {
                                const itemT = (st.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                const cleanK = depKey.replace(/[^a-z0-9]/g, '');
                                return itemT && cleanK && (itemT === cleanK || itemT.includes(cleanK) || cleanK.includes(itemT));
                            });
                            if (!mod) return null;
                            
                            const displayTitle = mod.title || (typeof m === 'string' ? m : m.title || m.modName || m.name || depKey);
                            const stLower = (mod.status || '').toLowerCase();
                            const isNotFound = stLower === 'not_found_on_modhub';
                            const isError = stLower === 'error';
                            const isSuccess = stLower === 'success' || stLower === 'installed' || stLower === 'completed';

                            return (
                                <div key={depKey} style={{ 
                                    padding: '12px 16px', 
                                    background: 'var(--bg-primary)', 
                                    borderRadius: 12, 
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{displayTitle}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800 }}>
                                             {stLower === 'pending' && <span style={{ opacity: 0.8, color: 'var(--text-tertiary)' }}>PENDING</span>}
                                            {stLower === 'searching' && <><Loader2 size={12} className="animate-spin" /> SEARCHING</>}
                                            {(stLower === 'downloading' || stLower === 'starting') && <><Loader2 size={12} className="animate-spin text-accent" /> DOWNLOADING</>}
                                            {stLower === 'downloading' && <span className="text-accent">{mod.progress}%</span>}
                                            {isSuccess && <><CheckCircle size={14} className="text-success" /> INSTALLED</>}
                                            {isNotFound && <><AlertCircle size={14} className="text-error" /> NOT FOUND</>}
                                            {isError && <><AlertCircle size={14} className="text-error" /> ERROR</>}
                                        </div>
                                    </div>
                                    {stLower === 'downloading' && (
                                        <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ width: `${mod.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                                        </div>
                                    )}
                                    {(stLower === 'searching' || isNotFound || isError) && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                            <span style={{ fontSize: 11, color: isNotFound || isError ? 'var(--error)' : 'var(--text-secondary)', opacity: 0.8 }}>
                                                {isNotFound ? 'Exhausted FS25 search database.' : isError ? 'Download failed. Click Retry or Search Manually.' : 'Pinpointing best match on ModHub...'}
                                            </span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {isError && (
                                                    <button 
                                                        className="btn btn--secondary btn--xs" 
                                                        onClick={() => {
                                                            setModStatuses(prev => ({
                                                                ...prev,
                                                                [depKey]: { status: 'pending', progress: 0, title: m.title || depKey }
                                                            }));
                                                            processPendingMods([m]);
                                                        }}
                                                        style={{ padding: '2px 8px', fontSize: 10 }}
                                                    >
                                                        Retry Download
                                                    </button>
                                                )}
                                                {(isNotFound || isError) && (
                                                    <button 
                                                        className="btn btn--ghost btn--xs" 
                                                        onClick={() => handleManualSearch(m.title || m.modName || depKey)}
                                                        style={{ padding: '2px 8px', color: 'var(--accent)', textDecoration: 'underline' }}
                                                    >
                                                        Search Manually
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    {status === 'confirming' && (
                        <>
                            <button className="btn btn--secondary" onClick={onCancel || onComplete}>Ignore</button>
                            <button className="btn btn--primary" onClick={handleConfirm} style={{ padding: '0 24px' }}>
                                <Download size={16} /> Download All
                            </button>
                        </>
                    )}
                    {status === 'processing' && (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)' }}>
                                <Loader2 size={16} className="animate-spin" /> Processing queue...
                            </div>
                            <button className="btn btn--secondary" onClick={onComplete || onCancel} style={{ padding: '0 20px' }}>
                                Close
                            </button>
                        </div>
                    )}
                    {status === 'complete' && (
                        <button className="btn btn--primary" onClick={onComplete || onCancel} style={{ width: '100%', height: 44 }}>
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
