import React from 'react';
import { useDownloadStore } from '../store/useDownloadStore';
import { Download, CheckCircle, X, Package, Trash2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadsPage() {
  const { activeDownloads, removeDownload, cancelDownload, clearFinished } = useDownloadStore();
  const navigate = useNavigate();

  const downloadsArray = Object.values(activeDownloads).sort((a, b) => {
    // Sort completed first, then descending progress
    if (a.status === 'success' && b.status !== 'success') return -1;
    if (b.status === 'success' && a.status !== 'success') return 1;
    return b.progress - a.progress;
  });

  const cancelAll = () => {
    if (window.confirm('Cancel all active downloads?')) {
      downloadsArray.forEach(dl => {
        if (dl.status !== 'success' && dl.progress < 100) {
          cancelDownload(dl.modId);
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
            {downloadsArray.some(dl => dl.status === 'success' || dl.status === 'error' || dl.progress >= 100) && (
              <button className="btn btn--ghost btn--sm" onClick={clearFinished} style={{ gap: 8 }}>
                <CheckCircle size={14} />
                Clear Completed
              </button>
            )}
            {downloadsArray.some(dl => dl.status !== 'success' && dl.progress < 100) && (
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
          {downloadsArray.map((dl) => (
            <div key={dl.modId} style={{ 
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
              {dl.status !== 'success' && dl.progress < 100 && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, bottom: 0,
                  width: `${dl.progress}%`,
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
                    <Package size={24} color={dl.status === 'success' ? 'var(--success)' : 'var(--accent)'} />
                  </div>
                  <div>
                    <h3 
                      style={{ margin: 0, fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.target.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-primary)'}
                      onClick={() => navigate(`/modhub/mod/${dl.modId}`)}
                      title="View Details"
                    >
                      {dl.title}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {dl.status === 'success' || dl.progress >= 100 ? (
                        <><CheckCircle size={12} color="var(--success)" /> Installed successfully</>
                      ) : dl.status === 'waiting' || dl.status === 'queued' ? (
                        <>Waiting in queue...</>
                      ) : dl.status === 'connecting' ? (
                        <>Connecting to ModHub...</>
                      ) : dl.status === 'handshaking' ? (
                        <>Establishing secure session...</>
                      ) : dl.status === 'starting' ? (
                        <>Finalizing handshake...</>
                      ) : (
                        <>Downloading... {typeof dl.receivedBytes === 'number' && typeof dl.totalBytes === 'number' && dl.totalBytes > 0 ? `(${(dl.receivedBytes / 1024 / 1024).toFixed(1)} MB / ${(dl.totalBytes / 1024 / 1024).toFixed(1)} MB)` : ''}</>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: dl.status === 'success' ? 'var(--success)' : 'var(--accent)', minWidth: '60px', textAlign: 'right' }}>
                    {Math.round(dl.progress || 0)}%
                  </div>
                  
                  {dl.progress < 100 && dl.status !== 'success' ? (
                    <button 
                      className="btn--cancel"
                      onClick={() => cancelDownload(dl.modId)}
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        color: 'var(--danger)', 
                        border: 'none', 
                        width: 36, height: 36, 
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      title="Cancel Download"
                    >
                      <X size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => removeDownload(dl.modId)}
                      style={{ 
                        background: 'rgba(34, 197, 94, 0.1)', 
                        color: 'var(--success)', 
                        border: 'none', 
                        width: 36, height: 36, 
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'}
                      title="Clear from list"
                    >
                      <CheckCircle size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Enhanced Progress Bar */}
              <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', overflow: 'hidden', zIndex: 1, position: 'relative' }}>
                <div style={{ 
                  width: `${dl.progress}%`, 
                  height: '100%', 
                  background: dl.status === 'success' || dl.progress >= 100 
                    ? 'var(--success)' 
                    : 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                  transition: 'width 0.3s ease-out',
                  position: 'relative'
                }}>
                   {/* Shimmer Effect */}
                   {dl.status !== 'success' && dl.progress < 100 && (
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
          ))}
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
