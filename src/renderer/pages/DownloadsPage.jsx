import React, { useMemo } from 'react';
import { useDownloadStore } from '../store/useDownloadStore';
import { Download, CheckCircle, X, Package, Trash2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadsPage() {
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);
  const removeDownload = useDownloadStore((s) => s.removeDownload);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const clearFinished = useDownloadStore((s) => s.clearFinished);
  const navigate = useNavigate();

  const isFinished = (dl) => {
    if (!dl) return true;
    const st = String(dl.status || '').toLowerCase();
    const isDoneStatus = ['success', 'completed', 'done', 'finished', 'installed', 'error', 'failed', 'cancelled'].includes(st);
    const is100 = typeof dl.progress === 'number' && dl.progress >= 100;
    return isDoneStatus || is100;
  };

  const downloadsArray = useMemo(() => {
    const raw = activeDownloads || {};
    return Object.values(raw)
      .filter((dl) => dl && (dl.modId || dl.title))
      .sort((a, b) => {
        const aDone = isFinished(a);
        const bDone = isFinished(b);
        if (aDone && !bDone) return 1;
        if (bDone && !aDone) return -1;
        const progA = typeof a?.progress === 'number' ? a.progress : 0;
        const progB = typeof b?.progress === 'number' ? b.progress : 0;
        return progB - progA;
      });
  }, [activeDownloads]);

  const cancelAll = () => {
    if (window.confirm('Cancel all active downloads?')) {
      downloadsArray.forEach((dl) => {
        if (!dl) return;
        if (!isFinished(dl)) {
          cancelDownload?.(dl.modId);
        } else {
          removeDownload?.(dl.modId);
        }
      });
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Download size={28} color="var(--accent)" />
            Downloads
          </h1>
          <p className="page-subtitle" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Monitor and manage your active and queued mod installations
          </p>
        </div>

        {downloadsArray.length > 0 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {downloadsArray.some(isFinished) && (
              <button className="btn btn--ghost btn--sm" onClick={() => clearFinished?.()} style={{ gap: 8 }}>
                <CheckCircle size={14} />
                Clear Completed
              </button>
            )}
            {downloadsArray.some((dl) => !isFinished(dl)) && (
              <button className="btn btn--danger btn--sm" onClick={cancelAll} style={{ gap: 8 }}>
                <Trash2 size={14} />
                Cancel All
              </button>
            )}
          </div>
        )}
      </header>

      {downloadsArray.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '400px',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)'
        }}>
          <Package size={48} strokeWidth={1} style={{ opacity: 0.5, marginBottom: 16 }} />
          <h3 style={{ margin: 0, fontWeight: 600 }}>No Active Downloads</h3>
          <p style={{ fontSize: 13, marginTop: 8 }}>Mods you download from ModHub will appear here.</p>
          <button className="btn btn--primary" style={{ marginTop: 24, gap: 8 }} onClick={() => navigate('/modhub')}>
            Browse ModHub <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {downloadsArray.map((dl, idx) => {
            const rawProg = typeof dl.progress === 'number' && !isNaN(dl.progress) ? dl.progress : 0;
            const progressPercent = Math.max(0, Math.min(100, Math.round(rawProg)));
            const isCompleted = dl.status === 'success' || progressPercent >= 100;
            const isQueued = dl.status === 'waiting' || dl.status === 'queued';
            const modId = dl.modId || `dl-${idx}`;

            return (
              <div key={modId} style={{ 
                background: 'var(--bg-secondary)', 
                borderRadius: '12px', 
                padding: '20px',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Progress Background Overlay */}
                {!isCompleted && (
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, bottom: 0,
                    width: `${progressPercent}%`,
                    background: 'rgba(var(--accent-rgb), 0.03)',
                    zIndex: 0,
                    transition: 'width 0.3s ease-out'
                  }} />
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ 
                      width: 48, height: 48, 
                      borderRadius: 8, 
                      background: 'rgba(0,0,0,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Package size={24} color={isCompleted ? 'var(--success)' : 'var(--accent)'} />
                    </div>
                    <div>
                      <h3 
                        style={{ margin: 0, fontSize: 16, fontWeight: 700, cursor: dl.modId ? 'pointer' : 'default', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => { if (dl.modId) e.target.style.color = 'var(--accent)'; }}
                        onMouseLeave={(e) => { if (dl.modId) e.target.style.color = 'var(--text-primary)'; }}
                        onClick={() => { if (dl.modId) navigate(`/modhub/mod/${dl.modId}`); }}
                        title={dl.modId ? "View Details" : ""}
                      >
                        {dl.title || `Mod ${modId}`}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isCompleted ? (
                          <><CheckCircle size={12} color="var(--success)" /> Installed successfully</>
                        ) : isQueued ? (
                          <>Waiting in queue...</>
                        ) : dl.status === 'connecting' ? (
                          <>Connecting to ModHub...</>
                        ) : dl.status === 'handshaking' ? (
                          <>Establishing secure session...</>
                        ) : dl.status === 'starting' ? (
                          <>Finalizing handshake...</>
                        ) : (
                          <>Downloading... {typeof dl.receivedBytes === 'number' && typeof dl.totalBytes === 'number' && dl.totalBytes > 0 ? `${(dl.receivedBytes / 1024 / 1024).toFixed(1)} MB / ${(dl.totalBytes / 1024 / 1024).toFixed(1)} MB${dl.downloadSpeed > 0 ? ` • ${(dl.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s` : ''}` : ''}</>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: isCompleted ? 'var(--success)' : 'var(--accent)', minWidth: '60px', textAlign: 'right' }}>
                      {isCompleted ? 100 : progressPercent}%
                    </div>
                    
                    {!isFinished(dl) ? (
                      <button 
                        className="btn--cancel"
                        onClick={() => cancelDownload?.(dl.modId)}
                        style={{ 
                          background: 'rgba(239, 68, 68, 0.1)', 
                          color: 'var(--danger)', 
                          border: 'none', 
                          width: 36, height: 36, 
                          borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        title="Cancel Download"
                      >
                        <X size={18} />
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          if (dl.modId) removeDownload?.(dl.modId);
                          if (dl.title) removeDownload?.(dl.title);
                        }}
                        style={{ 
                          background: 'rgba(34, 197, 94, 0.1)', 
                          color: 'var(--success)', 
                          border: 'none', 
                          width: 36, height: 36, 
                          borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'}
                        title="Clear from list"
                      >
                        <CheckCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', overflow: 'hidden', zIndex: 1, position: 'relative' }}>
                  <div style={{ 
                    width: `${isCompleted ? 100 : progressPercent}%`, 
                    height: '100%', 
                    background: isCompleted 
                      ? 'var(--success)' 
                      : 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                    transition: 'width 0.3s ease-out',
                    position: 'relative'
                  }}>
                     {/* Shimmer Effect */}
                     {!isCompleted && (
                       <div style={{
                         position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
                         background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                         transform: 'translateX(-100%)',
                         animation: 'shimmer 1.5s infinite'
                       }} />
                     )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
