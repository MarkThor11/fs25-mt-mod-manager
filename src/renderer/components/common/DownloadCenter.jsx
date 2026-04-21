import React, { useState } from 'react';
import { useDownloadStore } from '../../store/useDownloadStore';
import { Download, ChevronDown, ChevronUp, CheckCircle, X, Package, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadCenter() {
  const { activeDownloads, removeDownload, cancelDownload, clearFinished } = useDownloadStore();
  const [isMinimized, setIsMinimized] = useState(false);
  const navigate = useNavigate();

  const downloadsArray = Object.values(activeDownloads);
  if (downloadsArray.length === 0) return null;

  const hasFinished = downloadsArray.some(dl => dl.status === 'success' || dl.status === 'error' || dl.progress >= 100);

  const totalProgress = downloadsArray.reduce((acc, d) => acc + d.progress, 0) / downloadsArray.length;

  return (
    <div className={`download-center ${isMinimized ? 'download-center--minimized' : ''}`} style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      width: isMinimized ? '200px' : '320px',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'hidden',
      padding: '16px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMinimized ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="animate-pulse" style={{ 
            background: 'var(--accent)', 
            borderRadius: '8px', 
            padding: '6px',
            boxShadow: '0 0 15px rgba(var(--accent-rgb), 0.3)'
          }}>
            <Download size={16} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'white' }}>
              {downloadsArray.length} Active Download{downloadsArray.length !== 1 ? 's' : ''}
            </div>
            {isMinimized && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Overall: {Math.round(totalProgress)}%
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasFinished && !isMinimized && (
            <button 
              onClick={() => clearFinished()}
              className="btn btn--icon hover-danger" 
              style={{ width: 28, height: 28, color: 'var(--text-tertiary)' }}
              title="Clear Finished"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="btn btn--icon" 
            style={{ width: 28, height: 28 }}
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* List (Expanded only) */}
      {!isMinimized && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '300px', overflowY: 'auto', paddingRight: 4 }}>
          {downloadsArray.map((dl) => (
            <div key={dl.modId} style={{ 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: '12px', 
              padding: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div 
                  style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}
                  onClick={() => navigate(`/modhub/mod/${dl.modId}`)}
                  title="Go to mod details"
                >
                  {dl.title}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>
                  {Math.round(dl.progress)}%
                </div>
              </div>

              {/* Progress Bar Container */}
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${dl.progress}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                  transition: 'width 0.3s ease-out',
                  boxShadow: '0 0 10px rgba(var(--accent-rgb), 0.5)'
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                   <Package size={10} /> {
                     dl.status === 'success' ? 'COMPLETED' :
                     dl.progress >= 100 ? 'Finalizing...' : 
                     dl.status === 'waiting' ? 'Waiting in queue...' : 
                     'Downloading...'
                   }
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dl.progress < 100 && (
                    <button 
                      onClick={() => cancelDownload(dl.modId)}
                      className="btn--cancel"
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                      title="Cancel Download"
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {dl.progress >= 100 && (
                    <button 
                      onClick={() => removeDownload(dl.modId)}
                      style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', padding: 2 }}
                    >
                      <CheckCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
