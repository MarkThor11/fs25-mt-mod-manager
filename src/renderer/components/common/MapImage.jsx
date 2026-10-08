import React from 'react';
import { Zap } from 'lucide-react';
import mapUS from '../../assets/maps/map_us.png';
import mapAS from '../../assets/maps/map_as.png';
import mapEU from '../../assets/maps/map_eu.png';
import mapKinlaig from '../../assets/maps/map_kinlaig.jpg';

export const MAP_PREVIEWS = {
  'Riverbend Springs': mapUS,
  'Hutan Pantai': mapAS,
  'Zielonka': mapEU,
  'Kinlaig': mapKinlaig,
  'Highlands Fishing Expansion': mapKinlaig,
  'Highlands Fishing Map': mapKinlaig,
};

const MapImage = ({ mapTitle, mapId, mods, savePath, opacity = 0.25 }) => {
  // 0. Primary slot savegame.png match
  if (savePath) {
    const saveImgUrl = `mod-icon://icon?path=${encodeURIComponent(savePath + '/savegame.png')}`;
    return (
      <img 
        src={saveImgUrl} 
        alt="" 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover'
        }} 
        onError={(e) => {
          // Hide broken image so fallback layers render cleanly
          e.target.style.display = 'none';
        }}
      />
    );
  }

  // 1. Base map match (16:9 full-bleed landscape photos)
  if (MAP_PREVIEWS[mapTitle]) {
    const isKinlaig = mapTitle.includes('Kinlaig') || mapTitle.includes('Highlands');
    return (
      <img 
        src={MAP_PREVIEWS[mapTitle]} 
        alt="" 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          transform: isKinlaig ? 'scale(1.3)' : 'scale(1.0)',
          transition: 'transform 0.3s ease'
        }} 
      />
    );
  }

  // 2. Mod map match (using mapId or Title)
  if (mods) {
    let mapMod = null;
    
    // a. Try matching by parsed modName from mapId containing a dot (e.g. ModName.MapId)
    if (mapId && mapId.includes('.')) {
        const parsedModName = mapId.split('.')[0];
        mapMod = mods.find(m => m.isMap && m.modName && m.modName.toLowerCase() === parsedModName.toLowerCase());
    }
    
    if (!mapMod) {
        mapMod = mods.find(m => {
            if (!m.isMap) return false;
            
            // Match by Title (case insensitive)
            if (mapTitle && m.title && m.title.toLowerCase() === mapTitle.toLowerCase()) return true;

            // Match by modName
            if (mapId && m.modName && m.modName.toLowerCase() === mapId.toLowerCase()) return true;

            return false;
        });
    }

    if (mapMod) {
        let imgSrc = null;
        if (mapMod.iconData && !mapMod.iconData.startsWith('CATEGORY:')) {
            imgSrc = mapMod.iconData;
        } else if (mapMod.filePath) {
            imgSrc = `mod-icon://icon?path=${encodeURIComponent(mapMod.filePath)}`;
        }

        if (imgSrc) {
            return (
              <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                {/* Atmospheric Ambient Background */}
                <img 
                  src={imgSrc} 
                  alt="" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    filter: 'blur(14px) brightness(0.4) saturate(1.2)', 
                    transform: 'scale(1.25)' 
                  }} 
                />
                {/* Crisp Uncropped Map Icon Preview Badge on the Right */}
                <div style={{
                  position: 'absolute',
                  right: 14,
                  top: '52%',
                  transform: 'translateY(calc(-50% + 10px))',
                  height: '75%',
                  maxHeight: 125,
                  aspectRatio: '1/1',
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.65)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(0,0,0,0.4)',
                  zIndex: 2
                }}>
                  <img 
                    src={imgSrc} 
                    alt="" 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'contain'
                    }} 
                  />
                </div>
              </div>
            );
        }
    }
  }

  // 3. Fallback
  return (
    <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
       <Zap size={64} style={{ opacity: 0.1, color: 'var(--accent)' }} />
    </div>
  );
};

export default MapImage;
