import React, { useEffect, useState } from 'react';
import { X, PlayCircle, PlusCircle, AlertCircle } from 'lucide-react';

export default function SaveSlotModal({ onClose, onCreate, profile }) {
  const [savegames, setSavegames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSaves();
  }, []);

  const fetchSaves = async () => {
    setLoading(true);
    try {
      const result = await window.api.savegames.getAll();
      setSavegames(result.savegames || []);
    } catch (err) {
      console.error('Failed to fetch saves for modal:', err);
    } finally {
      setLoading(false);
    }
  };

  const slots = Array.from({ length: 20 }, (_, i) => i + 1);

  const handleSelect = (index, isOccupied) => {
    if (isOccupied) {
      const { skipDeleteConfirm } = useSettingsStore.getState();
      if (skipDeleteConfirm || window.confirm(`WARNING: Slot ${index} already contains a savegame ("${savegames.find(s => s.index === index)?.farmName}").\n\nAre you sure you want to OVERWRITE it? All existing progress in this slot will be PERMANENTLY DELETED.`)) {
        onCreate(index);
      }
    } else {
      onCreate(index);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Select Save Slot</h2>
            <p className="modal-subtitle">Choose a slot to initialize your new game with the "{profile.name}" template.</p>
          </div>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div className="spinner" />
              <p style={{ marginTop: 'var(--sp-4)', color: 'var(--text-muted)' }}>Checking save slots...</p>
            </div>
          ) : (
            <div className="save-slot-grid">
              {slots.map(index => {
                const save = savegames.find(s => s.index === index);
                const isOccupied = !!save;

                return (
                  <div 
                    key={index} 
                    className={`save-slot-item ${isOccupied ? 'save-slot-item--occupied' : 'save-slot-item--empty'}`}
                    onClick={() => handleSelect(index, isOccupied)}
                  >
                    <div className="save-slot-index">Slot {index}</div>
                    {isOccupied ? (
                      <>
                        <div className="save-slot-info">
                          <div className="save-slot-name">{save.farmName}</div>
                          <div className="save-slot-meta">{save.mapTitle}</div>
                        </div>
                        <div className="save-slot-warning" title="Select to Overwrite">
                          <AlertCircle size={14} /> Overwrite
                        </div>
                      </>
                    ) : (
                      <div className="save-slot-action">
                        <PlusCircle size={20} />
                        <span>Create Here</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', color: 'var(--text-tertiary)', fontSize: 'var(--fs-xs)' }}>
            <AlertCircle size={14} />
            <span>Note: You can now select occupied slots to overwrite them with this template.</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .save-slot-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: var(--sp-3);
          max-height: 400px;
          overflow-y: auto;
          padding: 2px;
        }

        .save-slot-item {
          padding: var(--sp-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--bg-tertiary);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          position: relative;
        }

        .save-slot-item:hover {
          border-color: var(--accent);
          background: var(--accent-dim);
          transform: translateY(-2px);
        }

        .save-slot-item--occupied {
          background: rgba(255, 255, 255, 0.03);
        }

        .save-slot-item--occupied:hover {
          border-color: var(--error);
          background: rgba(239, 68, 68, 0.1);
        }

        .save-slot-index {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-tertiary);
        }

        .save-slot-name {
          font-weight: 700;
          font-size: var(--fs-sm);
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .save-slot-meta {
          font-size: 11px;
          color: var(--text-muted);
        }

        .save-slot-warning {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--error);
          opacity: 0.7;
        }

        .save-slot-action {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: var(--accent);
          font-weight: 600;
          font-size: 11px;
          margin: auto 0;
        }
      `}</style>
    </div>
  );
}
