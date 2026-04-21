import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

export default function AppUpdateModal() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('available'); // available, downloading, downloaded, error
  const [error, setError] = useState(null);
  const toast = useToastStore();

  useEffect(() => {
    if (!window.api?.on) return;

    const unsubs = [
      window.api.on.appUpdateAvailable((info) => {
        setUpdateInfo(info);
        setStatus('available');
      }),
      window.api.on.appUpdateProgress((p) => {
        setProgress(p);
        setStatus('downloading');
      }),
      window.api.on.appUpdateDownloaded((info) => {
        setStatus('downloaded');
        // Auto-install if user wants? Or wait for click.
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
    await window.api.appUpdate.download();
  };

  const handleInstall = () => {
    if (!window.api?.appUpdate) return;
    window.api.appUpdate.install();
  };

  if (!updateInfo && status !== 'error') return null;

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: 450, padding: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--sp-4)' }}>
          
          {status === 'available' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>New Update Available!</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  Version <strong>v{updateInfo.version}</strong> is now ready. 
                  Update now for the latest features and bug fixes.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 'var(--sp-4)' }}>
                <button className="btn btn--secondary btn--lg btn--full" onClick={() => setUpdateInfo(null)}>Later</button>
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
                  Please wait while we fetch the latest version.
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
                  The download is complete. Restart the application to apply the update and start using the new version.
                </p>
              </div>
              <button className="btn btn--primary btn--lg btn--full" style={{ marginTop: 'var(--sp-4)' }} onClick={handleInstall}>
                Restart and Install <ArrowRight size={18} style={{ marginLeft: 8 }} />
              </button>
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
                  Something went wrong while checking for updates.<br />
                  <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}>{error}</span>
                </p>
              </div>
              <button className="btn btn--secondary btn--lg btn--full" style={{ marginTop: 'var(--sp-4)' }} onClick={() => { setUpdateInfo(null); setStatus('available'); setError(null); }}>
                Close
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
