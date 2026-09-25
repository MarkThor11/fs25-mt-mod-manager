import React from 'react';
import { Package, UploadCloud } from 'lucide-react';

export default function DropOverlay({ isDragging, onClose }) {
  if (!isDragging) return null;

  return (
    <div 
      className="drop-overlay animate-fade-in" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '4px dashed var(--accent)',
        margin: 'var(--sp-4)',
        borderRadius: 'var(--radius-xl)',
        cursor: 'pointer'
      }}
    >
      <div className="drop-overlay__content" style={{
        textAlign: 'center',
        padding: 'var(--sp-8)',
        background: 'rgba(var(--accent-rgb), 0.12)',
        borderRadius: '50%',
        width: 300,
        height: 300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--accent-dim)',
        boxShadow: '0 0 40px rgba(var(--accent-rgb), 0.25)'
      }}>
        <div className="animate-bounce" style={{ color: 'var(--accent)', marginBottom: 'var(--sp-4)' }}>
          <UploadCloud size={64} />
        </div>
        <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: 'white', marginBottom: 'var(--sp-2)' }}>
          Ready to Import!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          Drop mod .ZIPs or savegame folders / ZIPs anywhere
        </p>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>(Click or press ESC to dismiss)</span>
      </div>
      
      <div style={{
        marginTop: 'var(--sp-6)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--card-bg)',
        padding: '12px 24px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <Package size={18} className="text-accent" />
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'white' }}>Smart Mod & Savegame Batch Importer</span>
      </div>
    </div>
  );
}
