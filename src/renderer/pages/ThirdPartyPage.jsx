import React, { useState, useMemo } from 'react';
import { 
  Globe, Plus, Trash2, ExternalLink, Link as LinkIcon, 
  Info, RefreshCw, AlertCircle, CheckCircle2, Package, X
} from 'lucide-react';
import { useThirdPartyStore } from '../store/useThirdPartyStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useToastStore } from '../store/useToastStore';

export default function ThirdPartyPage() {
  const { externalMods, addExternalMod, removeExternalMod, updateExternalMod, checkAllUpdates, isChecking } = useThirdPartyStore();
  const { mods: localMods } = useLocalModsStore();
  
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [selectedLocalMod, setSelectedLocalMod] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Filter local mods to only show those NOT already linked and NOT from ModHub
  const availableLocalMods = useMemo(() => {
    const linkedFileNames = new Set(externalMods.map(m => m.localFileName).filter(Boolean));
    return localMods.filter(m => !m.modId && !linkedFileNames.has(m.fileName));
  }, [localMods, externalMods]);

  const handleAddMod = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) {
      useToastStore.getState().error('Please enter both a title and a valid URL.');
      return;
    }

    try {
      new URL(newUrl);
    } catch {
      useToastStore.getState().error('Invalid URL format.');
      return;
    }

    const localMod = localMods.find(m => m.fileName === selectedLocalMod);

    const res = addExternalMod({ 
      title: newTitle.trim(), 
      url: newUrl.trim(),
      localFileName: selectedLocalMod || null,
      currentVersion: localMod?.version || null
    });
    
    if (res.success) {
      setNewTitle('');
      setNewUrl('');
      setSelectedLocalMod('');
      setShowAddForm(false);
      useToastStore.getState().success('External mod tracking added.');
    } else {
      useToastStore.getState().error(res.error);
    }
  };

  const handleOpenLink = (url) => {
    window.api.shell.openExternal(url);
  };

  const handleDownload = async (mod) => {
    const toast = useToastStore.getState();
    toast.info(`Attempting to find download for ${mod.title}...`);
    
    const downloadUrl = await window.api.thirdParty.findDownloadUrl({ url: mod.url });
    
    if (downloadUrl === mod.url) {
      toast.info("No direct zip found. Opening page for manual download.");
      handleOpenLink(mod.url);
    } else {
      toast.info("Direct download found! Starting installation...");
      try {
        // Use existing installMod logic from modManager (exposed via IPC)
        const result = await window.api.modhub.installMod({
          modId: `ext-${mod.id}`, // Custom prefix for tracking
          modTitle: mod.title,
          downloadUrl: downloadUrl
        });
        
        if (result.success) {
          toast.success(`Successfully updated ${mod.title}!`);
          // Refresh local mods to update version
          await useLocalModsStore.getState().scanMods();
          
          // Update tracking with new version
          const updatedMod = useLocalModsStore.getState().mods.find(m => m.fileName === mod.localFileName);
          updateExternalMod(mod.id, {
            currentVersion: updatedMod?.version || mod.remoteVersion,
            hasUpdate: false
          });
        }
      } catch (err) {
        toast.error(`Update failed: ${err.message}`);
        handleOpenLink(mod.url);
      }
    }
  };

  const handleRefreshSingle = async (mod) => {
    const toast = useToastStore.getState();
    toast.info(`Checking ${mod.title}...`);
    const res = await window.api.thirdParty.checkUrl({ url: mod.url });
    if (res.success) {
      const hasUpdate = mod.currentVersion && res.version !== mod.currentVersion;
      updateExternalMod(mod.id, {
        remoteVersion: res.version,
        lastChecked: new Date().toISOString(),
        hasUpdate
      });
      if (hasUpdate) toast.warning(`Update found for ${mod.title}: ${res.version}`);
      else toast.success(`${mod.title} is up to date.`);
    } else {
      toast.error(`Check failed: ${res.error}`);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div className="page-header__content">
          <h1 className="page-header__title">
            <Globe className="page-header__icon" />
            Third-Party Tracking
          </h1>
          <p className="page-header__subtitle">
            Monitor updates for mods installed from external sites like itch.io or KingMods.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn btn--secondary" 
            onClick={checkAllUpdates}
            disabled={isChecking || externalMods.length === 0}
          >
            <RefreshCw size={18} className={isChecking ? 'animate-spin' : ''} /> 
            {isChecking ? 'Checking...' : 'Check All Updates'}
          </button>
          <button 
            className="btn btn--primary" 
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? <X size={18} /> : <Plus size={18} />} 
            {showAddForm ? 'Cancel' : 'Track New Mod'}
          </button>
        </div>
      </div>

      <div className="third-party-layout">
        {showAddForm && (
          <div className="add-mod-card animate-slide-down" style={{ background: 'var(--bg-tertiary)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '24px' }}>
            <form onSubmit={handleAddMod}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Mod Title (Display Name)</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="e.g. Autodrive (Itch.io)" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Tracking URL</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="https://author.itch.io/mod-page" 
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Link to Installed Mod (Optional)</label>
                  <select 
                    className="form-input"
                    value={selectedLocalMod}
                    onChange={(e) => {
                      setSelectedLocalMod(e.target.value);
                      if (!newTitle && e.target.value) {
                         const mod = localMods.find(m => m.fileName === e.target.value);
                         setNewTitle(mod?.title || '');
                      }
                    }}
                    style={{ width: '100%', background: 'var(--bg-primary)' }}
                  >
                    <option value="">-- Select an installed mod --</option>
                    {availableLocalMods.map(m => (
                      <option key={m.fileName} value={m.fileName}>
                        {m.title} ({m.fileName})
                      </option>
                    ))}
                  </select>
                  <p style={{ marginTop: 6, fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Linking allows the manager to compare your local version with the website.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn--primary">
                  Start Tracking
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="external-mod-list">
          {externalMods.length === 0 ? (
            <div className="empty-state" style={{ padding: '80px 0', textAlign: 'center' }}>
              <LinkIcon size={64} style={{ opacity: 0.1, marginBottom: 16 }} />
              <h3 style={{ fontSize: 'var(--fs-lg)', marginBottom: 8 }}>Track your first external mod</h3>
              <p style={{ color: 'var(--text-tertiary)', maxWidth: 400, margin: '0 auto' }}>
                Paste links to mods on itch.io or other sites to get automatic change alerts.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
              {externalMods.map((mod) => (
                <div key={mod.id} className="external-item animate-fade-in-up" 
                  style={{ 
                    background: 'var(--bg-card)', 
                    borderRadius: 'var(--radius-md)', 
                    border: mod.hasUpdate ? '1px solid var(--warning)' : '1px solid var(--border)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mod.hasUpdate ? 'var(--warning)' : 'var(--accent)' }}>
                        <Package size={24} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{mod.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.url}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn--secondary btn--xs" onClick={() => handleRefreshSingle(mod)} disabled={isChecking}>
                        <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
                      </button>
                      <button className="btn btn--danger btn--xs" onClick={() => removeExternalMod(mod.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '10px', padding: '4px 8px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      Local: <span style={{ color: 'var(--text-primary)' }}>{mod.currentVersion || 'N/A'}</span>
                    </div>
                    <div style={{ fontSize: '10px', padding: '4px 8px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      Remote: <span style={{ color: mod.hasUpdate ? 'var(--warning)' : 'var(--text-primary)' }}>{mod.remoteVersion || 'Unknown'}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {mod.hasUpdate ? (
                        <span style={{ color: 'var(--warning)', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertCircle size={14} /> Update Ready
                        </span>
                      ) : mod.lastChecked ? (
                        <span style={{ color: 'var(--accent)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={14} /> Up to Date
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Never checked</span>
                      )}
                    </div>
                    <button 
                      className={mod.hasUpdate ? "btn btn--primary btn--sm" : "btn btn--secondary btn--sm"}
                      onClick={() => mod.hasUpdate ? handleDownload(mod) : handleOpenLink(mod.url)}
                      style={{ gap: 6 }}
                    >
                      {mod.hasUpdate ? (
                        <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
                      ) : (
                        <ExternalLink size={14} />
                      )}
                      {mod.hasUpdate ? 'Download Update' : 'View Page'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="third-party-info" style={{ marginTop: 'var(--sp-8)' }}>
          <div className="alert alert--info" style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '16px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Info size={18} style={{ color: 'var(--info)', marginTop: 2 }} />
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>How Universal Tracking Works</strong>
                The manager periodically checks your linked URLs for changes in version numbers or site content. 
                Even if a site isn't explicitly supported, the manager will alert you if the page's "fingerprint" 
                changes, indicating a potential update or new file.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
