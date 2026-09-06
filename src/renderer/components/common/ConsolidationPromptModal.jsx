import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderOutput, AlertTriangle, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';

const ConsolidationPromptModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const hasPrompted = useSettingsStore(s => s.hasPromptedConsolidation);
  const mods = useLocalModsStore(s => s.mods);
  const isScanning = useLocalModsStore(s => s.isScanning);

  useEffect(() => {
    if (hasPrompted) return;
    if (isScanning || !mods) return;
    if (mods.length === 0) {
        // Empty library, no need to ever prompt them.
        useSettingsStore.getState().setHasPromptedConsolidation(true);
        return;
    }

    // Check if they actually have duplicate-prone map subfolder mods
    // Basically, any non-map zip that lives inside a subfolder that is NOT 'Map Dependencies'
    const hasConsolidatableMods = mods.some(m => 
        m.folder && 
        m.folder !== '' && 
        m.folder !== 'DLC' &&
        m.folder.toLowerCase() !== 'map dependencies' && 
        m.folder.toLowerCase() !== 'pdlc' &&
        !m.isMap
    );

    if (hasConsolidatableMods) {
        setIsOpen(true);
    } else {
        useSettingsStore.getState().setHasPromptedConsolidation(true);
    }
  }, [hasPrompted, mods, isScanning]);
  
  if (!isOpen) return null;

  const handleSkip = () => {
    useSettingsStore.getState().setHasPromptedConsolidation(true);
    setIsOpen(false);
  };

  const handleConsolidate = async () => {
    setIsProcessing(true);
    useToastStore.getState().info('Consolidating dependencies...');
    
    try {
      const result = await window.api.mods.consolidateDependencies();
      if (result?.success) {
        useToastStore.getState().success(`Done! Moved ${result.movedCount} mods, removed ${result.removedCount} duplicates.`);
        await useLocalModsStore.getState().scanMods();
      } else {
        useToastStore.getState().error(`Consolidation failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      useToastStore.getState().error(`Consolidation error: ${err.message}`);
    } finally {
      useSettingsStore.getState().setHasPromptedConsolidation(true);
      setIsProcessing(false);
      setIsOpen(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal__header">
          <h3>Clean Up Map Dependencies</h3>
        </div>
        
        <div className="modal__content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(56, 189, 248, 0.1)', padding: 16, borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            <FolderOutput size={32} color="var(--accent)" />
            <div style={{ flex: 1, fontSize: '14px', lineHeight: '1.5' }}>
              <strong>New feature: Shared Map Dependencies!</strong><br />
              We now organize all map dependencies into a single "Map Dependencies" folder to save disk space and prevent duplicates.
            </div>
          </div>
          
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            We noticed you have mods in map subfolders. Would you like us to automatically move all non-map dependency mods into the new shared folder and remove any duplicates?
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)', background: 'rgba(234, 179, 8, 0.1)', padding: 12, borderRadius: 6, fontSize: '13px' }}>
            <AlertTriangle size={16} />
            <span>Maps will still show their dependencies as virtual links in the UI.</span>
          </div>
        </div>

        <div className="modal__actions">
          <button 
            className="btn btn--secondary" 
            onClick={handleSkip}
            disabled={isProcessing}
          >
            Not Now
          </button>
          <button 
            className="btn btn--primary" 
            onClick={handleConsolidate}
            disabled={isProcessing}
            style={{ minWidth: 140, display: 'flex', justifyContent: 'center' }}
          >
            {isProcessing ? <Loader2 size={16} className="spin" /> : 'Consolidate Now'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConsolidationPromptModal;
