import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Settings, Play, ShieldAlert, Check } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';
import { useToastStore } from '../../store/useToastStore';

const AutoUpdatePromptModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { modUpdateMode, setModUpdateMode } = useSettingsStore();

  useEffect(() => {
    // Only show if explicitly set to prompt (new installs or unconfigured users)
    if (modUpdateMode === 'prompt') {
      // Delay slightly so it doesn't collide violently with WelcomeTour or Consolidation modal
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [modUpdateMode]);

  const handleSelect = async (mode) => {
    await setModUpdateMode(mode);
    setIsOpen(false);
    
    useToastStore.getState().success(`Mod updates set to ${mode === 'auto' ? 'Automatic' : 'Manual'}`);

    // If they chose auto, trigger the first check now
    if (mode === 'auto') {
      setTimeout(() => {
        useLocalModsStore.getState().triggerAutoUpdateIfNeeded();
      }, 1000);
    }
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
              Do you want us to automatically update the mods currently sitting in your folder to their latest versions?
            </p>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <button 
            className="btn-card"
            onClick={() => handleSelect('auto')}
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
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Yes, keep my mods updated automatically</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.4 }}>
                We will immediately check your current mods and download the newest versions from ModHub. (This will overwrite your existing files).
              </div>
            </div>
          </button>

          <button 
            className="btn-card"
            onClick={() => handleSelect('manual')}
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
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>No, leave my mods exactly as they are</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.4 }}>
                Recommended if you have old savegames. We won't touch your existing files. You can manually choose which mods to update later.
              </div>
            </div>
          </button>

        </div>

        {/* Footer */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '16px 24px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          You can change this anytime in Settings &gt; Library & Files.
        </div>

      </div>
    </div>,
    document.body
  );
};

export default AutoUpdatePromptModal;
