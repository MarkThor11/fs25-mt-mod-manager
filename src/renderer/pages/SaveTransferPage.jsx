import React from 'react';
import { ArrowRightLeft, Construction, AlertTriangle, Info, ChevronRight, Tractor, ShieldAlert, Coins, Package } from 'lucide-react';

export default function SaveTransferPage() {
  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div className="page-header__content">
          <h1 className="page-header__title">
            <ArrowRightLeft className="page-header__icon text-accent" />
            Save Transfer
          </h1>
          <p className="page-header__subtitle">
            Securely move assets between FS25 savegames with data integrity.
          </p>
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '60vh',
        textAlign: 'center',
        padding: 40,
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background Decoration */}
        <Tractor size={400} style={{ position: 'absolute', opacity: 0.03, right: -100, bottom: -100, transform: 'rotate(-15deg)' }} />

        <div style={{ 
          width: 80, 
          height: 80, 
          borderRadius: '50%', 
          background: 'rgba(234, 179, 8, 0.1)', 
          color: 'var(--warning)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: 24,
          border: '1px solid rgba(234, 179, 8, 0.2)'
        }}>
          <Construction size={40} />
        </div>

        <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 16, color: 'var(--text-primary)' }}>
          Under Construction
        </h2>
        
        <p style={{ maxWidth: 500, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
          I'm building a robust system to securely move assets between your FS25 savegames. This feature is currently in development and will be available in a future update.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tractor size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Fleet Migration</span>
          </div>
          <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Coins size={18} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Capital Transfer</span>
          </div>
          <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Package size={18} style={{ color: 'var(--info)' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Resource Sync</span>
          </div>
        </div>
      </div>
    </div>
  );
}


