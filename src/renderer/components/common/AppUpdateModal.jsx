import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, AlertCircle, CheckCircle2, ArrowRight, X, Minimize2, Maximize2 } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

export default function AppUpdateModal() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('available'); // available, downloading, downloaded, error
  const [error, setError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!window.api?.on) return;

    const unsubs = [
      window.api.on.appUpdateAvailable((info) => {
        setUpdateInfo(info);
        setStatus('available');
        setIsDismissed(false);
        // Show a non-intrusive toast notification letting the user know an update is ready
        useToastStore.getState().info(`App Update v${info?.version || ''} available!`, {
          duration: 8000,
          action: {
            label: 'View',
            onClick: () => {
              setIsMinimized(false);
              setIsDismissed(false);
            }
          }
        });
      }),
      window.api.on.appUpdateProgress((p) => {
        setProgress(p);
        setStatus('downloading');
      }),
      window.api.on.appUpdateDownloaded((info) => {
        setStatus('downloaded');
        useToastStore.getState().success('App update downloaded! Click to restart and install.', {
          duration: 10000,
          action: {
            label: 'Restart',
            onClick: () => handleInstall()
          }
        });
      }),
      window.api.on.appUpdateError((msg) => {
        setError(msg);
        setStatus('error');
      })
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const handleDownload = async () => {
    if (!window.api?.appUpdate) return;
    setStatus('downloading');
    // Automatically minimize to background so user isn't trapped during download
    setIsMinimized(true);
    useToastStore.getState().info('Downloading app update in the background...');
    try {
      await window.api.appUpdate.download();
    } catch (err) {
      setError(err.message || 'Download failed');
      setStatus('error');
      setIsMinimized(false);
    }
  };

  const handleInstall = () => {
    if (!window.api?.appUpdate) return;
    window.api.appUpdate.install();
  };

  const handleClose = () => {
    setIsDismissed(true);
  };

  if (isDismissed || (!updateInfo && status !== 'error')) return null;

  // ── FLOATING MINIMIZED WIDGET (Bottom Right) ──
  if (isMinimized) {
    return (
      <div 
        className="animate-slide-up"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9000,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          maxWidth: 360,
          backdropFilter: 'blur(12px)',
          color: 'var(--text-primary)',
          cursor: 'pointer'
        }}
        onClick={() => setIsMinimized(false)}
        title="Click to expand update view"
      >
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: status === 'downloaded' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(var(--accent-rgb), 0.15)',
          color: status === 'downloaded' ? 'var(--success)' : 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {status === 'downloading' && <RefreshCw size={18} className="animate-spin" />}
          {status === 'downloaded' && <CheckCircle2 size={18} />}
          {status === 'available' && <Download size={18} />}
          {status === 'error' && <AlertCircle size={18} style={{ color: 'var(--danger)' }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {status === 'downloading' && `Updating App... (${Math.round(progress?.percent || 0)}%)`}
            {status === 'downloaded' && 'App Update Ready!'}
            {status === 'available' && `App Update v${updateInfo?.version || ''}`}
            {status === 'error' && 'Update Failed'}
          </div>

          {status === 'downloading' && (
            <div style={{ marginTop: 4 }}>
              <div style={{ height: 4, width: '100%', background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress?.percent || 0}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>{((progress?.bytesPerSecond || 0) / (1024 * 1024)).toFixed(1)} MB/s</span>
                <span>Background</span>
              </div>
            </div>
          )}

          {status === 'downloaded' && (
            <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 2, fontWeight: 700 }}>
              Click to restart & apply
            </div>
          )}

          {status === 'available' && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
              Click to install in background
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {status === 'downloaded' ? (
            <button 
              className="btn btn--primary btn--xs" 
              onClick={handleInstall}
              style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
            >
              Restart
            </button>
          ) : (
            <button 
              className="btn btn--ghost btn--xs" 
              onClick={() => setIsMinimized(false)}
              title="Expand Update Dialog"
              style={{ padding: 4, height: 28, width: 28 }}
            >
              <Maximize2 size={14} />
            </button>
          )}

          <button 
            className="btn btn--ghost btn--xs" 
            onClick={handleClose}
            title="Dismiss notification"
            style={{ padding: 4, height: 28, width: 28, color: 'var(--text-tertiary)' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── FULL MODAL DIALOG (Non-Blocking Overlay) ──
  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: 460, padding: 'var(--sp-6)', position: 'relative' }}>
        
        {/* Top bar controls */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
          <button 
            className="btn btn--ghost btn--xs"
            onClick={() => setIsMinimized(true)}
            title="Run in background"
            style={{ padding: 6, borderRadius: '50%', color: 'var(--text-secondary)' }}
          >
            <Minimize2 size={16} />
          </button>
          <button 
            className="btn btn--ghost btn--xs"
            onClick={handleClose}
            title="Close dialog"
            style={{ padding: 6, borderRadius: '50%', color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--sp-4)' }}>
          
          {status === 'available' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>New Update Available!</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  Version <strong>v{updateInfo?.version}</strong> is ready. 
                  Download now in the background and continue using the app.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 'var(--sp-4)' }}>
                <button className="btn btn--secondary btn--lg btn--full" onClick={() => setIsMinimized(true)}>Run in Background</button>
                <button className="btn btn--primary btn--lg btn--full" onClick={handleDownload}>Update Now</button>
              </div>
            </>
          )}

          {status === 'downloading' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={32} className="animate-spin" />
              </div>
              <div style={{ width: '100%' }}>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>Downloading Update...</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 'var(--sp-6)' }}>
                  Downloading in the background. Feel free to minimize and keep using the app.
                </p>
                
                <div style={{ height: 8, width: '100%', background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ 
                    position: 'absolute', 
                    left: 0, 
                    top: 0, 
                    bottom: 0, 
                    width: `${progress?.percent || 0}%`, 
                    background: 'var(--accent)', 
                    transition: 'width 0.3s ease-out' 
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                  <span>{Math.round(progress?.percent || 0)}% Complete</span>
                  <span>{((progress?.bytesPerSecond || 0) / (1024 * 1024)).toFixed(1)} MB/s</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 'var(--sp-4)' }}>
                <button className="btn btn--secondary btn--lg btn--full" onClick={() => setIsMinimized(true)}>
                  <Minimize2 size={16} style={{ marginRight: 8 }} /> Continue in Background
                </button>
              </div>
            </>
          )}

          {status === 'downloaded' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--success-rgb), 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>Update Ready!</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  The download is complete. Restart the application whenever you are ready to apply the update.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 'var(--sp-4)' }}>
                <button className="btn btn--secondary btn--lg btn--full" onClick={() => setIsMinimized(true)}>Later</button>
                <button className="btn btn--primary btn--lg btn--full" onClick={handleInstall}>
                  Restart and Install <ArrowRight size={18} style={{ marginLeft: 8 }} />
                </button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--danger-rgb), 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertCircle size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>Update Failed</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  Something went wrong while checking or downloading updates.<br />
                  <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}>{error}</span>
                </p>
              </div>
              <button className="btn btn--secondary btn--lg btn--full" style={{ marginTop: 'var(--sp-4)' }} onClick={handleClose}>
                Close
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

