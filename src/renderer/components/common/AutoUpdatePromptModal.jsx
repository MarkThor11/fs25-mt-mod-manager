import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, ShieldAlert, Check } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';
import { useToastStore } from '../../store/useToastStore';

const AutoUpdatePromptModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { hasPromptedInitialUpdate, setHasPromptedInitialUpdate } = useSettingsStore();
  const { mods, setModTags } = useLocalModsStore();
  
  useEffect(() => {
    // Only show if we haven't prompted yet, and they actually have mods installed
    if (!hasPromptedInitialUpdate && mods && mods.length > 0) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (!hasPromptedInitialUpdate && mods && mods.length === 0) {
      // If they have no mods, we don't need to ask them about updating existing mods
      setHasPromptedInitialUpdate(true);
    } else {
      setIsOpen(false);
    }
  }, [hasPromptedInitialUpdate, mods, setHasPromptedInitialUpdate]);

  const handleSelect = async (shouldUpdate) => {
    setIsOpen(false);
    
    if (shouldUpdate) {
      useToastStore.getState().success('Mods will be updated automatically.');
      setTimeout(() => {
        useLocalModsStore.getState().triggerAutoUpdateIfNeeded();
      }, 1000);
    } else {
      useToastStore.getState().success('Locking current mods to prevent automatic updates...');
      // Loop through all current mods and add the lock-updates tag
      for (const mod of mods) {
        const currentTags = mod.tags || [];
        if (!currentTags.includes('lock-updates')) {
          await setModTags(mod.fileName, [...currentTags, 'lock-updates']);
        }
      }
      useToastStore.getState().success('All current mods have been locked against updates.');
    }

    await setHasPromptedInitialUpdate(true);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content animate-zoom-in" style={{ width: 600, padding: 0, overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ 
            width: 48, height: 48, borderRadius: 12, 
            background: 'rgba(var(--accent-rgb), 0.15)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: 'var(--accent)', flexShrink: 0 
          }}>
            <RefreshCw size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, margin: '0 0 4px 0' }}>Update your existing mods?</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 'var(--fs-sm)' }}>
              We detected out of date mods in your folder. Do you want them updated to their latest versions?
            </p>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <button 
            className="btn-card"
            onClick={() => handleSelect(true)}
            style={{ 
              display: 'flex', alignItems: 'flex-start', gap: 16, 
              padding: 20, textAlign: 'left',
              border: '1px solid var(--border)', borderRadius: 12,
              background: 'var(--bg-secondary)', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ color: 'var(--success)', marginTop: 2 }}>
              <Check size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Yes, allow existing mods to update</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.4 }}>
                We will immediately check your current mods and download the newest versions from ModHub. (This will overwrite your existing files).
              </div>
            </div>
          </button>

          <button 
            className="btn-card"
            onClick={() => handleSelect(false)}
            style={{ 
              display: 'flex', alignItems: 'flex-start', gap: 16, 
              padding: 20, textAlign: 'left',
              border: '1px solid var(--border)', borderRadius: 12,
              background: 'var(--bg-secondary)', cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ color: 'var(--warning)', marginTop: 2 }}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>No, block existing mods from updates</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.4 }}>
                Recommended if you have old savegames. We will lock all your current mods so they are never touched. Future downloads will still update normally.
              </div>
            </div>
          </button>

        </div>

      </div>
    </div>,
    document.body
  );
};

export default AutoUpdatePromptModal;
