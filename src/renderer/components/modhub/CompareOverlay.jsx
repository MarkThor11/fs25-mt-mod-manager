import React, { useEffect, useState } from 'react';
import { X, Layers, Zap, DollarSign, Download, Star, ExternalLink } from 'lucide-react';
import { useModHubStore } from '../../store/useModHubStore';
import { useDownloadStore } from '../../store/useDownloadStore';

export default function CompareOverlay({ isOpen, onClose }) {
  const { selectedCompareIds, mods, clearCompare } = useModHubStore();
  const [detailedMods, setDetailedMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);

  useEffect(() => {
    if (isOpen && selectedCompareIds.length > 0) {
      loadDetailedMods();
    }
  }, [isOpen, selectedCompareIds]);

  const loadDetailedMods = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        selectedCompareIds.map(async (id) => {
          const existing = mods.find(m => m.modId === id);
          let detail = existing;
          
          if (!existing || !existing.techData || !existing.metadata) {
            try {
              detail = await window.api.modhub.fetchModDetail({ modId: id });
            } catch (err) {
              console.error(`Failed to fetch detail for comparison ${id}:`, err);
              return { modId: id, title: 'Error loading', error: true };
            }
          }

          // Proxy the main image if it exists
          let displayImage = detail.image || (detail.images && detail.images[0]);
          if (displayImage) {
            try {
              displayImage = await window.api.images.proxy(displayImage);
            } catch (err) {
              console.error('Image proxy failed in compare:', err);
            }
          }
          
          return { 
            ...detail, 
            displayImage,
            modId: id 
          };
        })
      );
      setDetailedMods(results);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="compare-overlay animate-fade-in">
      <div className="compare-overlay__header">
        <div className="compare-overlay__title">
          <Layers size={20} />
          <h2>Mod Comparison ({selectedCompareIds.length}/4)</h2>
        </div>
        <div className="compare-overlay__actions">
          <button className="btn btn--secondary btn--sm" onClick={clearCompare}>
            Clear Selection
          </button>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="compare-grid">
        {loading ? (
          <div className="compare-grid__loading">
            <div className="spinner" />
            <p>Fetching technical specifications...</p>
          </div>
        ) : (
          detailedMods.map((mod) => (
            <div key={mod.modId} className="compare-column">
              <div className="compare-column__content scrollable-y">
                {/* Header Info */}
                <div className="compare-header">
                  <div className="compare-header__image">
                    {mod.displayImage ? (
                      <img src={mod.displayImage} alt={mod.title} />
                    ) : (
                      <Layers size={48} opacity={0.2} />
                    )}
                  </div>
                  <h3 className="compare-header__title">{mod.title}</h3>
                  <div className="compare-header__author">by {mod.author}</div>
                </div>

                {/* Full Metadata */}
                <div className="compare-section">
                  <h4 className="compare-section__title">Technical Data</h4>
                  <div className="metadata-grid">
                    {Object.entries(mod.metadata || {}).map(([key, value]) => {
                      return (
                        <div key={key} className="metadata-item">
                          <div className="metadata-key">{key}</div>
                          <div className="metadata-value">{value}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div className="compare-section">
                  <h4 className="compare-section__title">Description</h4>
                  <div 
                    className="compare-description"
                    dangerouslySetInnerHTML={{ __html: mod.description }}
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="compare-column__footer">
                <button 
                  className="btn btn--primary btn--full"
                  disabled={!!activeDownloads[mod.modId]}
                >
                  <Download size={16} /> 
                  {activeDownloads[mod.modId] ? `Downloading ${activeDownloads[mod.modId].percent}%` : 'Install Mod'}
                </button>
              </div>
            </div>
          )
        ))}
        {detailedMods.length === 0 && !loading && (
          <div className="compare-empty">
            <Layers size={48} opacity={0.1} />
            <p>Select up to 4 mods to compare them side-by-side.</p>
          </div>
        )}
      </div>
    </div>
  );
}
