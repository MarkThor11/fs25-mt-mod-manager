import React, { useState } from 'react';
import { FolderDown, HardDrive, Folder, Plus, Trash2, Check, ArrowRight } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';

const ROUTING_MODES = [
  {
    id: 'prompt_and_rules',
    label: 'Smart Hybrid (Prompt + Category Rules)',
    desc: 'Auto-routes mods that match your category rules; prompts you for any other mod so you can choose on the fly.'
  },
  {
    id: 'rules_only',
    label: 'Category Rules Only',
    desc: 'Silently routes downloads according to category mappings. Unmapped mods go to your Primary mods folder.'
  },
  {
    id: 'prompt_only',
    label: 'Always Ask (Prompt Modal)',
    desc: 'Always prompts you to select a destination drive or subfolder before starting any download.'
  },
  {
    id: 'direct',
    label: 'Direct to Primary (Default)',
    desc: 'Downloads all non-map mods straight into your primary mods folder without prompting.'
  }
];

const COMMON_CATEGORIES = [
  'Drivables',
  'Loaders',
  'Trailers',
  'Soil Cultivation',
  'Seeding',
  'Yield Improvements',
  'Combine Harvesting',
  'Forage Harvesting',
  'Grassland',
  'Baling',
  'Animals',
  'Rootcrops',
  'Vegetables',
  'Special Crops',
  'Grapes & Olives',
  'Forestry',
  'Gameplay',
  'Placeable',
  'Objects',
  'Hand Tools',
  'Miscellaneous'
];

export default function DownloadRoutingSection() {
  const {
    downloadRoutingMode,
    setDownloadRoutingMode,
    downloadCategoryRoutes,
    setDownloadCategoryRoutes,
    modsPaths
  } = useSettingsStore();

  const allFolders = useLocalModsStore(s => s.allFolders) || [];

  const [selectedCat, setSelectedCat] = useState(COMMON_CATEGORIES[0]);
  const [targetDest, setTargetDest] = useState('');
  const [customFolder, setCustomFolder] = useState('');

  // Clean subfolders available
  const userFolders = allFolders.filter(f => {
    if (!f) return false;
    const l = f.toLowerCase();
    return l !== 'dlc' && l !== 'pdlc' && l !== 'backups' && l !== 'map dependencies';
  });

  const handleAddRule = () => {
    const finalDest = targetDest === '__CUSTOM__' ? customFolder.trim() : targetDest;
    if (!finalDest) return;

    const nextRoutes = {
      ...downloadCategoryRoutes,
      [selectedCat]: finalDest
    };
    setDownloadCategoryRoutes(nextRoutes);
    setCustomFolder('');
    setTargetDest('');
  };

  const handleRemoveRule = (catKey) => {
    const nextRoutes = { ...downloadCategoryRoutes };
    delete nextRoutes[catKey];
    setDownloadCategoryRoutes(nextRoutes);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Routing Mode Picker */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: 8 }}>
          Download Routing Mode
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {ROUTING_MODES.map(mode => {
            const isSelected = downloadRoutingMode === mode.id;
            return (
              <div 
                key={mode.id}
                onClick={() => setDownloadRoutingMode(mode.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${isSelected ? 'var(--accent, #38bdf8)' : 'rgba(255, 255, 255, 0.08)'}`,
                  background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--accent, #38bdf8)' : '#fff' }}>
                    {mode.label}
                  </span>
                  {isSelected && <Check size={16} style={{ color: 'var(--accent, #38bdf8)', flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
                  {mode.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Routing Rules */}
      {(downloadRoutingMode === 'prompt_and_rules' || downloadRoutingMode === 'rules_only') && (
        <div 
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: 16
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: 4 }}>
            Pre-determined Category Destinations
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginBottom: 14 }}>
            Assign specific drives or subfolders to ModHub categories so new mods are placed in their proper location automatically.
          </div>

          {/* Existing Rules List */}
          {Object.keys(downloadCategoryRoutes || {}).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {Object.entries(downloadCategoryRoutes).map(([cat, dest]) => (
                <div 
                  key={cat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>{cat}</span>
                    <ArrowRight size={14} style={{ color: '#64748b' }} />
                    <span style={{ fontSize: 12, color: 'var(--accent, #38bdf8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {dest.includes(':') || dest.startsWith('\\\\') ? <HardDrive size={13} /> : <Folder size={13} />}
                      {dest}
                    </span>
                  </div>
                  <button 
                    className="btn btn--icon btn--ghost"
                    onClick={() => handleRemoveRule(cat)}
                    title="Remove rule"
                    style={{ padding: 4, color: '#ef4444' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 14 }}>
              No custom category rules configured yet. Mods will default to your primary folder or prompt you.
            </div>
          )}

          {/* Add Rule Form */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="sort-bar__select"
              style={{
                background: 'var(--bg-tertiary, #1e222b)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                color: 'var(--text-primary, #fff)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                outline: 'none',
                minWidth: 160
              }}
            >
              {COMMON_CATEGORIES.map(c => (
                <option key={c} value={c} style={{ background: '#1e222b', color: '#fff' }}>{c}</option>
              ))}
            </select>

            <span style={{ color: '#64748b', fontSize: 12 }}>routes to</span>

            <select
              value={targetDest}
              onChange={(e) => setTargetDest(e.target.value)}
              className="sort-bar__select"
              style={{
                background: 'var(--bg-tertiary, #1e222b)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                color: 'var(--text-primary, #fff)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                outline: 'none',
                minWidth: 180
              }}
            >
              <option value="" style={{ background: '#1e222b', color: '#94a3b8' }}>Select destination...</option>
              {/* Secondary Drives */}
              {modsPaths.slice(1).map((p, idx) => (
                <option key={p} value={p} style={{ background: '#1e222b', color: '#fff' }}>Drive: {p}</option>
              ))}
              {/* Subfolders */}
              {userFolders.map(f => (
                <option key={f} value={f} style={{ background: '#1e222b', color: '#fff' }}>Folder: {f}</option>
              ))}
              <option value="__CUSTOM__" style={{ background: '#1e222b', color: '#38bdf8' }}>+ New custom subfolder...</option>
            </select>

            {targetDest === '__CUSTOM__' && (
              <input
                type="text"
                placeholder="Folder name (e.g. Tractors)"
                value={customFolder}
                onChange={(e) => setCustomFolder(e.target.value)}
                style={{
                  background: 'var(--bg-surface, #1e222b)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  outline: 'none',
                  minWidth: 150
                }}
              />
            )}

            <button
              className="btn btn--secondary btn--sm"
              onClick={handleAddRule}
              disabled={!targetDest || (targetDest === '__CUSTOM__' && !customFolder.trim())}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={14} /> Add Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
