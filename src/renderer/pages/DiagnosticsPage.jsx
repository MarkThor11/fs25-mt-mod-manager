import React, { useState } from 'react';
import { ShieldAlert, Heart, Copy, Check, Info, Server, Cpu, HardDrive } from 'lucide-react';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useSavegameStore } from '../store/useSavegameStore';
import { useModHubStore } from '../store/useModHubStore';
import { useSettingsStore } from '../store/useSettingsStore';

export default function DiagnosticsPage() {
  const [copied, setCopied] = useState(false);
  
  const modCount = useLocalModsStore(s => s.mods?.length || 0);
  const savegameCount = useSavegameStore(s => s.savegames?.length || 0);
  const favCount = useModHubStore(s => (s.favoriteMods?.length || 0) + (s.favoriteAuthors?.length || 0));
  
  const { modsPath, gamePath } = useSettingsStore();

  const handleCopyReport = async () => {
    try {
      const report = {
        app: 'FS25 MT Mod Manager',
        version: '1.0.6',
        platform: window.navigator.platform,
        timestamp: new Date().toISOString(),
        stats: {
          mods: modCount,
          savegames: savegameCount,
          favourites: favCount
        },
        paths: {
          game: gamePath || 'not set',
          mods: modsPath || 'not set'
        },
        userAgent: window.navigator.userAgent
      };
      
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy report:', err);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div className="page-header__content">
          <h1 className="page-header__title">
            <ShieldAlert className="page-header__icon text-accent" />
            Reporting & Diagnostics
          </h1>
          <p className="page-header__subtitle">
            Generate technical reports to help troubleshoot issues or report bugs to the community.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
        {/* Report Generator */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
              <Server size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>System Snapshot</h2>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Includes paths, counts, and OS info</p>
            </div>
          </div>

          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            If you are experiencing a bug or the manager isn't behaving as expected, generating a snapshot provides the necessary technical context for support.
          </p>

          <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)', overflow: 'hidden' }}>
            <div style={{ marginBottom: 4 }}>App: FS25 MT Mod Manager v1.0.6</div>
            <div style={{ marginBottom: 4 }}>OS: {window.navigator.platform}</div>
            <div style={{ marginBottom: 4 }}>Mods: {modCount} | Saves: {savegameCount}</div>
            <div style={{ opacity: 0.5 }}>[Click button below to copy full JSON]</div>
          </div>

          <button 
            className={`btn ${copied ? 'btn--success' : 'btn--primary'} btn--full`}
            onClick={handleCopyReport}
            style={{ height: 48, gap: 12 }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}
          </button>
        </div>

        {/* Support Card */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <Heart size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--fs-md)', fontWeight: 800 }}>Need Help?</h2>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Get assistance on Discord</p>
            </div>
          </div>

          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Our community Discord is the best place to report bugs, request features, or get help with mod conflicts. Paste your diagnostic report there for faster assistance!
          </p>

          <button 
            className="btn btn--secondary btn--full"
            onClick={() => window.api.shell.openExternal('https://discord.gg/qtXMRjFdAf')}
            style={{ height: 48, gap: 12 }}
          >
            Join Official Discord
          </button>
          
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 11 }}>
            <Info size={14} />
            <span>Reports do not contain personal files or passwords.</span>
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: 40, padding: 24, background: 'rgba(255, 165, 0, 0.05)', borderRadius: 12, border: '1px solid rgba(255, 165, 0, 0.2)' }}>
        <h3 style={{ fontSize: 'var(--fs-sm)', fontWeight: 800, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} /> Technical Integrity Check
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Cpu size={20} style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Process Priority</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>High Performance</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <HardDrive size={20} style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Storage IO</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Atomic Swap Active</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldAlert size={20} style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Security Context</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Sandboxed Bridge</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
