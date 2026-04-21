import React, { useState, useEffect } from 'react';
import { Heart, Star, X, User, Package, LayoutGrid, Pin } from 'lucide-react';
import { useModHubStore } from '../store/useModHubStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNavigate } from 'react-router-dom';
import { useToastStore } from '../store/useToastStore';
import ModCard from '../components/modhub/ModCard';
import { useInstalledLookup } from '../hooks/useInstalledLookup';

export default function FavouritesPage() {
  const navigate = useNavigate();
  const { 
    favoriteAuthors, toggleFavoriteAuthor, setAuthorFilter,
    favoriteMods, toggleFavoriteMod, modCache, loadCache
  } = useModHubStore();
  const { 
    favouritesIconOnly, setFavouritesIconOnly,
    favouritesZoom, setFavouritesZoom,
    isOnline,
    folderZooms
  } = useSettingsStore();
  const mods = useLocalModsStore((state) => state.mods);
  const getInstalledVersion = useInstalledLookup();
  const [activeTab, setActiveTab] = useState('mods');

  useEffect(() => {
    loadCache();
  }, []);

  const handleAuthorClick = (author) => {
    setAuthorFilter(author);
    navigate('/modhub');
  };
  



  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header__icon" style={{ background: 'rgba(var(--danger-rgb), 0.14)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          <Heart size={24} fill="currentColor" />
        </div>
        <div>
          <h1 className="page-header__title">Favourites Library</h1>
          <p className="page-header__subtitle">
            {favoriteAuthors.length} author{favoriteAuthors.length !== 1 ? 's' : ''}, {favoriteMods.length} mod{favoriteMods.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        
        {activeTab === 'mods' && favoriteMods.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ 
              display: 'flex', 
              background: 'var(--bg-tertiary)', 
              padding: 4, 
              borderRadius: 8,
              border: '1px solid var(--border)' 
            }}>
              <button 
                onClick={() => setFavouritesIconOnly(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: !favouritesIconOnly ? 'var(--accent)' : 'transparent',
                  color: !favouritesIconOnly ? 'white' : 'var(--text-tertiary)',
                  transition: 'all 0.2s'
                }}
              >
                <LayoutGrid size={14} /> DETAILS
              </button>
              <button 
                onClick={() => setFavouritesIconOnly(true)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: favouritesIconOnly ? 'var(--accent)' : 'transparent',
                  color: favouritesIconOnly ? 'white' : 'var(--text-tertiary)',
                  transition: 'all 0.2s'
                }}
              >
                <Package size={14} /> ICONS
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <LayoutGrid size={12} style={{ opacity: 0.4 }} />
              <div style={{ 
                position: 'relative', 
                width: 70, 
                height: 4, 
                background: 'rgba(255,255,255,0.1)', 
                borderRadius: 2, 
                display: 'flex', 
                alignItems: 'center',
                margin: '0 4px'
              }}>
                <input 
                  type="range" 
                  min="140" 
                  max="350" 
                  step="5"
                  value={favouritesZoom}
                  onChange={(e) => setFavouritesZoom(parseInt(e.target.value, 10))}
                  className="range-slider"
                  style={{ 
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'calc(100% + 16px)', 
                    margin: 0,
                    padding: 0,
                    cursor: 'pointer',
                    background: 'transparent'
                  }}
                  title="Card Size"
                />
              </div>
              <LayoutGrid size={16} style={{ opacity: 0.7 }} />
            </div>
          </div>
        )}
      </div>

      <div className="tab-container" style={{ marginBottom: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)' }}>
        <button 
            className={`tab-item ${activeTab === 'mods' ? 'tab-item--active' : ''}`}
            onClick={() => setActiveTab('mods')}
            style={{ 
                color: activeTab === 'mods' ? 'var(--accent)' : 'var(--text-tertiary)',
                background: activeTab === 'mods' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                border: activeTab === 'mods' ? '1px solid var(--accent)' : '1px solid transparent',
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s ease',
                cursor: 'pointer'
            }}
        >
            <Star size={16} fill={activeTab === 'mods' ? "#facc15" : "none"} style={{ color: activeTab === 'mods' ? '#facc15' : 'inherit' }} /> Mods
        </button>
        <button 
            className={`tab-item ${activeTab === 'authors' ? 'tab-item--active' : ''}`}
            onClick={() => setActiveTab('authors')}
            style={{ 
                color: activeTab === 'authors' ? 'var(--danger)' : 'var(--text-tertiary)',
                background: activeTab === 'authors' ? 'rgba(var(--danger-rgb), 0.1)' : 'transparent',
                border: activeTab === 'authors' ? '1px solid var(--danger)' : '1px solid transparent',
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s ease',
                cursor: 'pointer'
            }}
        >
            <Heart size={16} fill={activeTab === 'authors' ? "currentColor" : "none"} /> Authors
        </button>
      </div>

      {activeTab === 'authors' ? (
        favoriteAuthors.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon" style={{ color: 'var(--danger)' }}>
              <Heart size={48} fill="currentColor" />
            </div>
            <h2 className="empty-state__title">No Favourite Authors Yet</h2>
            <p className="empty-state__text">
              Browse mods in the ModHub and click the <Heart size={14} style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--danger)' }} fill="currentColor" /> heart icon 
              next to an author's name to add them here.
            </p>
            <button className="btn btn--primary" onClick={() => navigate('/modhub')}>
              Browse ModHub
            </button>
          </div>
        ) : (
          <div className="fav-authors-grid animate-fade-in-up">
            {favoriteAuthors.map((author) => (
              <div key={author.id} className="fav-author-card">
                <div className="fav-author-card__avatar">
                  <User size={24} />
                </div>
                <div className="fav-author-card__info">
                  <div className="fav-author-card__name" style={{ color: 'var(--danger)', fontWeight: 800 }}>{author.name}</div>
                  <div className="fav-author-card__id">ID: {author.id}</div>
                </div>
                <div className="fav-author-card__actions">
                  <button 
                    className="btn btn--primary btn--sm"
                    onClick={() => handleAuthorClick(author)}
                  >
                    <Star size={14} /> View Mods
                  </button>
                  <button 
                    className="btn btn--danger btn--sm btn--icon"
                    onClick={() => toggleFavoriteAuthor(author)}
                    title="Remove from favourites"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        favoriteMods.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Star size={48} />
            </div>
            <h2 className="empty-state__title">No Favourite Mods Yet</h2>
            <p className="empty-state__text">
              Find mods you love in the ModHub and bookmark them by clicking the star icon.
            </p>
            <button className="btn btn--primary" onClick={() => navigate('/modhub')}>
              Explore Mods
            </button>
          </div>
        ) : (
<div className="mod-grid-container animate-fade-in-up">
                  {(() => {
                    const mustHaves = favoriteMods.filter(m => m.isMustHave);
                    const others = favoriteMods.filter(m => !m.isMustHave);
                    
                    const renderModCard = (mod) => {
                      // Enrich local meta with cached remote data if missing
                      let enriched = { ...mod };
                    
                      // IF we are missing images/ratings, try to find the mod in the live Library (LocalMods)
                      if (!enriched.iconData || !enriched.rating) {
                          const localMatch = mods.find(lm => 
                              (lm.modId && enriched.modId && String(lm.modId) === String(enriched.modId)) ||
                              (lm.fileName && enriched.fileName && lm.fileName === enriched.fileName) ||
                              (lm.title && enriched.title && lm.title === enriched.title)
                          );
                          if (localMatch) {
                              enriched = { ...enriched, ...localMatch };
                          }
                      }

                      if (!enriched.rating || !enriched.image) {
                          const targetId = enriched.modId ? String(enriched.modId) : null;
                          const fileName = enriched.fileName ? enriched.fileName.toLowerCase() : null;
                          
                          const normalize = (t) => t ? t.toLowerCase()
                              .replace(/v\d+(\.\d+)*/g, '') 
                              .replace(/fs2[25]/g, '')     
                              .replace(/[^a-z0-9]/g, '')   
                              .trim() : null;

                          const targetTitle = normalize(enriched.title);

                          let match = null;
                          if (targetId && modCache[targetId]) match = modCache[targetId];
                          else if (fileName && modCache[`file_${fileName}`]) match = modCache[`file_${fileName}`];
                          
                          if (!match) {
                              for (const val of Object.values(modCache)) {
                                  if (val && typeof val === 'object' && val.title) {
                                      const vTitle = normalize(val.title);
                                      if (vTitle && targetTitle && (vTitle === targetTitle || vTitle.includes(targetTitle) || targetTitle.includes(vTitle))) {
                                          match = val;
                                          break;
                                      }
                                  }
                              }
                          }

                          if (match) {
                              enriched = { ...enriched, ...match, iconData: enriched.iconData || match.iconData };
                          }
                      }
                      return <ModCard key={mod.modId || mod.fileName} mod={enriched} showActions={false} hidePower={true} hidePrice={true} hideCompare={true} hideMatch={true} isIconOnly={favouritesIconOnly} zoom={favouritesZoom} getInstalledVersion={getInstalledVersion} />;
                    };

                    return (
                      <>
                        {mustHaves.length > 0 && (
                          <div style={{ marginBottom: 40 }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Pin size={12} fill="var(--accent)" /> MUST-HAVE MODS ({mustHaves.length})
                            </div>
                            <div className="mod-grid">
                              {mustHaves.map(renderModCard)}
                            </div>
                          </div>
                        )}
                        
                        {others.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-tertiary)', letterSpacing: '0.1em', marginBottom: 16 }}>
                              OTHER FAVOURITES ({others.length})
                            </div>
                            <div className="mod-grid">
                              {others.map(renderModCard)}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
              </div>
        )
      )}
    </div>
  );
}
