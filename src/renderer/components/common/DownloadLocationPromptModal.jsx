import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderDown, Folder, HardDrive, Check, X, ArrowRight } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';

/**
 * Modal dialog that prompts the user to select a destination folder or drive
 * for a pending mod download when download routing prompt mode is enabled.
 */
export default function DownloadLocationPromptModal({
  isOpen,
  modTitle,
  category,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  const modsPaths = useSettingsStore(s => s.modsPaths) || [];
  const allFolders = useLocalModsStore(s => s.allFolders) || [];
  const lastUsed = useSettingsStore(s => s.lastUsedDownloadDestination) || '';
  const downloadCategoryRoutes = useSettingsStore(s => s.downloadCategoryRoutes) || {};

  // Find if there is a category route suggested
  const suggestedRoute = category && downloadCategoryRoutes[category] ? downloadCategoryRoutes[category] : '';

  // Initial selection priority: category route -> last used -> Primary root ('')
  const [selectedDestination, setSelectedDestination] = useState(() => {
    if (suggestedRoute) return suggestedRoute;
    if (lastUsed) return lastUsed;
    return ''; // Primary root folder
  });

  const [rememberForCategory, setRememberForCategory] = useState(false);
  const [customSubfolder, setCustomSubfolder] = useState('');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  // Available standard subfolders (excluding system/internal folders)
  const userFolders = (allFolders || []).filter(f => {
    if (!f) return false;
    const low = f.toLowerCase();
    return low !== 'dlc' && low !== 'pdlc' && low !== 'backups' && low !== 'map dependencies';
  });

  const handleConfirm = () => {
    const finalDest = isCreatingCustom && customSubfolder.trim() ? customSubfolder.trim() : selectedDestination;
    
    // If user checked "Remember for this category", save the route
    if (rememberForCategory && category) {
      const nextRoutes = { ...downloadCategoryRoutes, [category]: finalDest };
      useSettingsStore.getState().setDownloadCategoryRoutes(nextRoutes);
    }

    // Save as last-used
    useSettingsStore.getState().setLastUsedDownloadDestination(finalDest);

    onConfirm(finalDest);
  };

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        style={{
          background: 'var(--bg-surface, #1e222b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeIn 0.15s ease'
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div 
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(14, 165, 233, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <FolderDown size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary, #fff)' }}>
                Choose Download Destination
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                {modTitle} {category ? `• ${category}` : ''}
              </div>
            </div>
          </div>
          <button 
            className="btn btn--icon btn--ghost" 
            onClick={onCancel}
            style={{ padding: 6, borderRadius: 8 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)', marginBottom: 12 }}>
            Select which folder or drive to install this mod into:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Primary Mods Directory (Root) */}
            <div 
              onClick={() => {
                setSelectedDestination('');
                setIsCreatingCustom(false);
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: `1.5px solid ${selectedDestination === '' && !isCreatingCustom ? 'var(--accent, #38bdf8)' : 'rgba(255, 255, 255, 0.08)'}`,
                background: selectedDestination === '' && !isCreatingCustom ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <HardDrive size={18} style={{ color: selectedDestination === '' && !isCreatingCustom ? '#38bdf8' : '#94a3b8' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>Primary Mods Folder (Default)</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{modsPaths[0] || 'Default Root Directory'}</div>
                </div>
              </div>
              {selectedDestination === '' && !isCreatingCustom && <Check size={16} style={{ color: '#38bdf8' }} />}
            </div>

            {/* Other Configured Mods Drives */}
            {modsPaths.slice(1).map((drivePath, idx) => {
              const isSelected = selectedDestination === drivePath && !isCreatingCustom;
              return (
                <div 
                  key={drivePath}
                  onClick={() => {
                    setSelectedDestination(drivePath);
                    setIsCreatingCustom(false);
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${isSelected ? 'var(--accent, #38bdf8)' : 'rgba(255, 255, 255, 0.08)'}`,
                    background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <HardDrive size={18} style={{ color: isSelected ? '#38bdf8' : '#94a3b8' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>Secondary Drive #{idx + 2}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{drivePath}</div>
                    </div>
                  </div>
                  {isSelected && <Check size={16} style={{ color: '#38bdf8' }} />}
                </div>
              );
            })}

            {/* Subfolders */}
            {userFolders.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                  Subfolders
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {userFolders.map(folderName => {
                    const isSelected = selectedDestination === folderName && !isCreatingCustom;
                    return (
                      <div 
                        key={folderName}
                        onClick={() => {
                          setSelectedDestination(folderName);
                          setIsCreatingCustom(false);
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1.5px solid ${isSelected ? 'var(--accent, #38bdf8)' : 'rgba(255, 255, 255, 0.08)'}`,
                          background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          <Folder size={16} style={{ color: isSelected ? '#38bdf8' : '#fbbf24', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {folderName}
                          </span>
                        </div>
                        {isSelected && <Check size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Subfolder Option */}
            <div style={{ marginTop: 10 }}>
              <div 
                onClick={() => setIsCreatingCustom(true)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${isCreatingCustom ? 'var(--accent, #38bdf8)' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: isCreatingCustom ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Folder size={16} style={{ color: isCreatingCustom ? '#38bdf8' : '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Create or enter new subfolder name..."
                  value={customSubfolder}
                  onChange={(e) => {
                    setCustomSubfolder(e.target.value);
                    setIsCreatingCustom(true);
                  }}
                  onFocus={() => setIsCreatingCustom(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    outline: 'none',
                    width: '100%'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Remember for category checkbox */}
          {category && (
            <label 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '8px 4px',
                cursor: 'pointer',
                fontSize: 12,
                color: '#cbd5e1'
              }}
            >
              <input 
                type="checkbox"
                checked={rememberForCategory}
                onChange={(e) => setRememberForCategory(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
              />
              <span>Remember this destination for all <strong>{category}</strong> mods</span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div 
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button 
            className="btn btn--primary" 
            onClick={handleConfirm}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Start Download</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
