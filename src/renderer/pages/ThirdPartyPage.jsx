import React, { useState, useMemo, useEffect } from 'react';
import { 
  Globe, Plus, Trash2, ExternalLink, Link as LinkIcon, 
  Info, RefreshCw, RefreshCcw, AlertCircle, CheckCircle2, Package, X, Edit2
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
  const [refreshingId, setRefreshingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMod, setEditingMod] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editLocalFileName, setEditLocalFileName] = useState('');
  
  useEffect(() => {
    // Automatically trigger a check for all mods if any are in an "Unknown" state
    const needsCheck = externalMods.some(m => !m.lastChecked || !m.remoteVersion);
    if (needsCheck && externalMods.length > 0 && !isChecking) {
      checkAllUpdates();
    }
  }, []);

  // Filter local mods to only show those NOT already linked, NOT from ModHub, and NOT DLCs
  const availableLocalMods = useMemo(() => {
    const linkedFileNames = new Set(externalMods.map(m => m.localFileName).filter(Boolean));
    return localMods.filter(m => !m.modId && !m.isDLC && !linkedFileNames.has(m.fileName));
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
      const addedModUrl = newUrl.trim();
      setNewTitle('');
      setNewUrl('');
      setSelectedLocalMod('');
      setShowAddForm(false);
      useToastStore.getState().success('External mod tracking added.');
      
      // Trigger initial check immediately
      const newlyAdded = useThirdPartyStore.getState().externalMods.find(m => m.url === addedModUrl);
      if (newlyAdded) {
        handleRefreshSingle(newlyAdded);
      }
    } else {
      useToastStore.getState().error(res.error);
    }
  };

  const handleEditMod = (mod) => {
    setEditingMod(mod);
    setEditTitle(mod.title);
    setEditUrl(mod.url);
    setEditLocalFileName(mod.localFileName || '');
  };

  const saveEdit = (e) => {
    e.preventDefault();
    if (!editTitle.trim() || !editUrl.trim()) return;
    
    const localMod = localMods.find(m => m.fileName === editLocalFileName);

    updateExternalMod(editingMod.id, {
      title: editTitle.trim(),
      url: editUrl.trim(),
      localFileName: editLocalFileName || null,
      currentVersion: localMod?.version || editingMod.currentVersion
    });
    setEditingMod(null);
    useToastStore.getState().success('Mod details updated.');
  };

  const handleOpenLink = (url) => {
    window.api.shell.openExternal(url);
  };

  const handleDownload = async (mod) => {
    const toast = useToastStore.getState();
    toast.info(`Attempting to find download for ${mod.title}...`);

    if (!window.api?.thirdParty) {
      toast.error('Tracker service is not available.');
      handleOpenLink(mod.url);
      return;
    }
    
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
    setRefreshingId(mod.id);
    toast.info(`Checking ${mod.title}...`);

    if (!window.api?.thirdParty) {
      toast.error('Tracker service is not available.');
      setRefreshingId(null);
      return;
    }

    try {
      const res = await window.api.thirdParty.checkUrl({ url: mod.url });
      if (res.success) {
        let hasUpdate = false;
        
        if (res.version) {
          // Version-based detection (Normalize both for comparison)
          const normRemote = res.version.toLowerCase().replace(/^v/, '').trim();
          const normLocal = (mod.currentVersion || '').toLowerCase().replace(/^v/, '').trim();
          hasUpdate = normLocal && normRemote !== normLocal;
        } else if (mod.fingerprint && res.fingerprint && mod.fingerprint !== res.fingerprint) {
          // Fallback: Fingerprint-based detection (only if version isn't listed)
          hasUpdate = true;
        }

        updateExternalMod(mod.id, {
          remoteVersion: res.version || 'New',
          fingerprint: res.fingerprint,
          lastChecked: new Date().toISOString(),
          hasUpdate: hasUpdate
        });

        if (hasUpdate) {
            toast.warning(res.version ? `Update found for ${mod.title}: ${res.version}` : `Possible update for ${mod.title} (Site content changed)`);
        } else {
            toast.success(`${mod.title} check complete.`);
        }
      } else {
        toast.error(`Check failed: ${res.error}`);
      }
    } catch (err) {
      toast.error(`Error checking mod: ${err.message}`);
    } finally {
      setRefreshingId(null);
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
                      const fileName = e.target.value;
                      setSelectedLocalMod(fileName);
                      if (fileName) {
                         const mod = localMods.find(m => m.fileName === fileName);
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '24px' }}>
              {externalMods.map((mod) => {
                const localMod = localMods.find(m => m.fileName === mod.localFileName);
                const icon = (localMod?.storeData && !localMod.storeData.startsWith('CATEGORY:')) 
                  ? localMod.storeData 
                  : localMod?.iconData;

                return (
                <div key={mod.id} className="external-item animate-fade-in-up" 
                  style={{ 
                    border: mod.hasUpdate ? '2px solid var(--warning)' : undefined,
                  }}>
                  {/* Background Image Overlay */}
                  {icon && (
                    <div 
                      className="external-item__bg"
                      style={{ backgroundImage: `url(${icon})` }} 
                    />
                  )}
                  {/* Gradient to ensure readability */}
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, var(--bg-card) 100%)', 
                    pointerEvents: 'none',
                    zIndex: 1
                  }} />

                  {/* Top Action Row */}
                  <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
                    <button className="btn btn--secondary btn--sm" onClick={(e) => { e.stopPropagation(); handleRefreshSingle(mod); }} disabled={isChecking || refreshingId === mod.id} title="Refresh" style={{ width: 32, height: 32, padding: 0, justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
                      <RefreshCw size={14} className={(isChecking || refreshingId === mod.id) ? 'animate-spin' : ''} />
                    </button>
                    <button className="btn btn--danger btn--sm" onClick={(e) => { e.stopPropagation(); removeExternalMod(mod.id); }} title="Remove" style={{ width: 32, height: 32, padding: 0, justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Title Section */}
                  <div 
                    onClick={() => handleEditMod(mod)}
                    className="hover-opacity-1"
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 4, 
                      cursor: 'pointer',
                      padding: '4px 0',
                      zIndex: 5,
                      marginTop: -4
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '20px', color: 'var(--text-primary)' }}>{mod.title}</div>
                  </div>

                  {/* Version Badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, width: '100%', position: 'relative', zIndex: 5, padding: '8px 0' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Local Version</span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{mod.currentVersion || 'Not Linked'}</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Site Version</span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: mod.hasUpdate ? 'var(--warning)' : 'var(--text-primary)' }}>{(mod.remoteVersion === 'Unknown' ? 'New' : mod.remoteVersion) || 'New'}</span>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', position: 'relative', zIndex: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {mod.hasUpdate ? (
                        <span style={{ color: 'var(--warning)', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertCircle size={18} /> Update Available
                        </span>
                      ) : mod.lastChecked ? (
                        <span style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={18} /> Up to Date
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '14px', fontWeight: 600 }}>Never checked</span>
                      )}
                    </div>
                    <button 
                      className={mod.hasUpdate ? "btn btn--primary" : "btn btn--secondary btn--sm"}
                      onClick={() => mod.hasUpdate ? handleDownload(mod) : handleOpenLink(mod.url)}
                      style={{ gap: 8, height: 42, padding: '0 20px', fontWeight: 700 }}
                    >
                      {mod.hasUpdate ? (
                        <><RefreshCw size={18} /> Update Now</>
                      ) : (
                        <><ExternalLink size={18} /> Visit Site</>
                      )}
                    </button>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>


        {/* Edit Modal */}
        {editingMod && (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="modal-content animate-scale-in" style={{ background: 'var(--bg-secondary)', width: '100%', maxWidth: 500, borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>Edit Mod Details</h2>
                <button className="btn btn--icon" onClick={() => setEditingMod(null)}><X size={24} /></button>
              </div>
              
              <form onSubmit={saveEdit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Mod Title (Display Name)</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Tracking URL</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Linked Local Mod (Optional)</label>
                    <select 
                      className="form-input"
                      value={editLocalFileName}
                      onChange={(e) => setEditLocalFileName(e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-tertiary)' }}
                    >
                      <option value="">-- Not Linked --</option>
                      {availableLocalMods
                        .concat(editingMod?.localFileName ? localMods.filter(m => m.fileName === editingMod.localFileName) : [])
                        .filter((v, i, a) => a.findIndex(t => t.fileName === v.fileName) === i) // Deduplicate
                        .map(m => (
                        <option key={m.fileName} value={m.fileName}>{m.title} ({m.fileName})</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setEditingMod(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

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
