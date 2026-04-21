import React, { useState, useEffect } from 'react';
import { Download, X, Search, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDownloadStore } from '../../store/useDownloadStore';

export default function DependencyDownloadModal({ missingMods, onComplete, onCancel, subFolder, parentId, mainTask }) {
    const registerBatch = useDownloadStore(s => s.registerBatch);
    const [status, setStatus] = useState('confirming'); // confirming, processing, complete
    
    // --- Deduplicate internally ---
    const uniqueMods = React.useMemo(() => {
        const seen = new Set();
        return missingMods.filter(m => {
                const norm = (m.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    .replace(/\[[^\]]*\]/g, '') // Strip [Tags]
                    .replace(/\([^)]*\)/g, '') // Strip (By Author) or (v1.0)
                    .replace(/^(?:fs\d{2}|dlc|pdlc|mod|fendt|jcb|caseih|newholland|massey|farming\s*simulator(?:\s*\d{2})?)(?:[\s_\.]+)/gi, '') // Common prefixes
                    .replace(/[\s_\.]+(?:by\s+.*|author:.*|pack|package|dlc|mod|map|expansion|set|kit|collection|building|shed|v\d+.*)\s*$/gi, '') // Trailing noise
                    .replace(/[^a-z0-9]/g, '');
            if (seen.has(norm)) return false;
            seen.add(norm);
            return true;
        });
    }, [missingMods]);

    // We use mod.title as the lookup key for progress updates
    const [modStatuses, setModStatuses] = useState(
        uniqueMods.reduce((acc, mod) => ({ ...acc, [mod.title]: { status: 'pending', progress: 0 } }), {})
    );

    useEffect(() => {
        if (!window.api?.on) return;
        const removeListener = window.api.on.dependencyProgress((data) => {
            const { type, modName, status, percent, title } = data;
            
            setModStatuses(prev => {
                // modName from the backend corresponds to mod.title passed into the start
                const current = prev[modName] || { status: 'pending', progress: 0 };
                const next = { ...current };
                
                if (type === 'STATUS') {
                    next.status = status;
                    if (title) next.title = title;
                } else if (type === 'PROGRESS') {
                    next.progress = percent;
                    next.status = 'downloading';
                }
                
                return { ...prev, [modName]: next };
            });
        });

        return () => removeListener();
    }, []);

    const handleManualSearch = (modName) => {
        window.api.shell.openExternal(`https://www.farming-simulator.com/mods.php?title=${encodeURIComponent(modName)}`);
    };

    const handleConfirm = async () => {
        setStatus('processing');
        
        // IMPORTANT: Queue the MAP/MAIN mod FIRST so it takes internal priority
        if (mainTask) {
            await window.api.mods.install(mainTask);
        }

        if (parentId) {
            registerBatch(parentId, uniqueMods.length);
        }
        const result = await window.api.localMods.autoInstallDependencies({ 
            mods: uniqueMods, 
            subFolder,
            parentId
        });
        
        // Refresh library
        const { useLocalModsStore } = await import('../../store/useLocalModsStore');
        const store = useLocalModsStore.getState();
        await store.scanMods();
        
        // If everything perfectly satisfied, we can close automatically, 
        // otherwise stay open so user can see what failed and search manually.
        setStatus('complete');
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
                        {status !== 'processing' && (
                            <button className="btn btn--ghost btn--sm" onClick={onCancel}><X size={20} /></button>
                        )}
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
                            const mod = modStatuses[m.title];
                            if (!mod) return null;
                            
                            const isNotFound = mod.status === 'NOT_FOUND_ON_MODHUB';
                            const isError = mod.status === 'error';

                            return (
                                <div key={m.title} style={{ 
                                    padding: '12px 16px', 
                                    background: 'var(--bg-primary)', 
                                    borderRadius: 12, 
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{mod.title || m.title}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800 }}>
                                            {mod.status === 'pending' && <span style={{ opacity: 0.8, color: 'var(--text-tertiary)' }}>PENDING</span>}
                                            {mod.status === 'SEARCHING' && <><Loader2 size={12} className="animate-spin" /> SEARCHING</>}
                                            {mod.status === 'DOWNLOADING' && <><Loader2 size={12} className="animate-spin text-accent" /> DOWNLOADING</>}
                                            {mod.status === 'downloading' && <span className="text-accent">{mod.progress}%</span>}
                                            {mod.status === 'success' && <><CheckCircle size={14} className="text-success" /> INSTALLED</>}
                                            {isNotFound && <><AlertCircle size={14} className="text-error" /> NOT FOUND</>}
                                            {isError && <><AlertCircle size={14} className="text-error" /> ERROR</>}
                                        </div>
                                    </div>
                                    {mod.status === 'downloading' && (
                                        <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ width: `${mod.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                                        </div>
                                    )}
                                    {(mod.status === 'SEARCHING' || isNotFound || isError) && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                            <span style={{ fontSize: 11, color: isNotFound || isError ? 'var(--error)' : 'var(--text-secondary)', opacity: 0.8 }}>
                                                {isNotFound ? 'Exhausted FS25 search database.' : isError ? 'An error occurred during download.' : 'Pinpointing best match on ModHub...'}
                                            </span>
                                            {isNotFound && (
                                                <button 
                                                    className="btn btn--ghost btn--xs" 
                                                    onClick={() => handleManualSearch(m.title)}
                                                    style={{ padding: '2px 8px', color: 'var(--accent)', textDecoration: 'underline' }}
                                                >
                                                    Search Manually
                                                </button>
                                            )}
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
                            <button className="btn btn--secondary" onClick={onCancel}>Ignore</button>
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
                            <button className="btn btn--primary" onClick={onComplete} style={{ padding: '0 24px' }}>
                                Continue to Map Selection
                            </button>
                        </div>
                    )}
                    {status === 'complete' && (
                        <button className="btn btn--primary" onClick={onComplete} style={{ width: '100%', height: 44 }}>
                            Continue to Map Selection
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
