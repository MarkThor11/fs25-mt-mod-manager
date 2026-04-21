import React, { useState, useEffect } from 'react';
import { EyeOff, Eye, Trash2, Package, ExternalLink } from 'lucide-react';
import { useModHubStore } from '../store/useModHubStore';
import { useNavigate } from 'react-router-dom';

export default function HiddenModsPage() {
  const navigate = useNavigate();
  const { hiddenMods, toggleHiddenMod } = useModHubStore();

  const handleUnhideAll = () => {
    hiddenMods.forEach(mod => toggleHiddenMod(mod));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header__icon page-header__icon--muted">
          <EyeOff size={24} />
        </div>
        <div>
          <h1 className="page-header__title">Hidden Mods</h1>
          <p className="page-header__subtitle">
            {hiddenMods.length} hidden mod{hiddenMods.length !== 1 ? 's' : ''}
          </p>
        </div>
        {hiddenMods.length > 0 && (
          <button className="btn btn--danger btn--sm" style={{ marginLeft: 'auto' }} onClick={handleUnhideAll}>
            <Trash2 size={14} /> Unhide All
          </button>
        )}
      </div>

      {hiddenMods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Eye size={48} />
          </div>
          <h2 className="empty-state__title">No Hidden Mods</h2>
          <p className="empty-state__text">
            Click the <EyeOff size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> eye icon 
            on any mod card in the ModHub to hide it from browsing.
          </p>
          <button className="btn btn--primary" onClick={() => navigate('/modhub')}>
            Browse ModHub
          </button>
        </div>
      ) : (
        <div className="hidden-mods-list">
          {hiddenMods.map((mod) => (
            <HiddenModItem key={mod.modId} mod={mod} onUnhide={toggleHiddenMod} onNavigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function HiddenModItem({ mod, onUnhide, onNavigate }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (mod.image) {
      resolveImage(mod.image);
    }
  }, [mod.image]);

  const resolveImage = async (url) => {
    try {
      const proxied = await window.api.images.proxy(url);
      setImgSrc(proxied);
    } catch {
      setImgError(true);
    }
  };

  return (
    <div className="hidden-mod-item">
      <div className="hidden-mod-item__info">
        <div 
          className="hidden-mod-item__thumb"
          onClick={() => onNavigate(`/modhub/mod/${mod.modId}`)}
          title="View mod details"
        >
          {imgSrc && !imgError ? (
            <img src={imgSrc} alt={mod.title} className="hidden-mod-item__thumb-img" />
          ) : (
            <div className="hidden-mod-item__thumb-placeholder">
              <Package size={18} />
            </div>
          )}
        </div>
        <div>
          <div 
            className="hidden-mod-item__title hidden-mod-item__title--link" 
            onClick={() => onNavigate(`/modhub/mod/${mod.modId}`)}
            title="View mod details"
          >
            {mod.title}
          </div>
          {mod.author && <div className="hidden-mod-item__author">by {mod.author}</div>}
        </div>
      </div>
      <div className="hidden-mod-item__actions">
        <button 
          className="btn btn--ghost btn--sm"
          onClick={() => onNavigate(`/modhub/mod/${mod.modId}`)}
          title="View mod details"
        >
          <ExternalLink size={14} /> Details
        </button>
        <button 
          className="btn btn--secondary btn--sm"
          onClick={() => onUnhide(mod)}
        >
          <Eye size={14} /> Unhide
        </button>
      </div>
    </div>
  );
}
