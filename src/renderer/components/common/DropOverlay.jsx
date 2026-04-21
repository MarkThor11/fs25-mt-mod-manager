import React from 'react';
import { Package, Download, UploadCloud } from 'lucide-react';

export default function DropOverlay({ isDragging }) {
  if (!isDragging) return null;

  return (
    <div className="drop-overlay animate-fade-in" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(var(--bg-rgb), 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      border: '4px dashed var(--accent)',
      margin: 'var(--sp-4)',
      borderRadius: 'var(--radius-xl)',
      pointerEvents: 'none'
    }}>
      <div className="drop-overlay__content" style={{
        textAlign: 'center',
        padding: 'var(--sp-8)',
        background: 'rgba(var(--accent-rgb), 0.1)',
        borderRadius: '50%',
        width: 300,
        height: 300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--accent-dim)',
        boxShadow: '0 0 40px rgba(var(--accent-rgb), 0.2)'
      }}>
        <div className="animate-bounce" style={{ color: 'var(--accent)', marginBottom: 'var(--sp-4)' }}>
          <UploadCloud size={64} />
        </div>
        <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>
          Ready to Install!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          Drop your mod .ZIP files here
        </p>
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
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Mod Manager V1.0 Batch Importer</span>
      </div>
    </div>
  );
}
