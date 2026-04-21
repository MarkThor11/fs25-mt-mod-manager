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

const MapImage = ({ mapTitle, mapId, mods, opacity = 0.25 }) => {
  // 1. Base map match
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
    const mapMod = mods.find(m => {
        if (!m.isMap) return false;
        
        // a. Exact match by ID
        if (mapId && m.mapId === mapId) return true;
        
        // b. Match by Title (case insensitive)
        if (mapTitle && m.title && m.title.toLowerCase() === mapTitle.toLowerCase()) return true;
        
        // c. Match by "Cleaned" ID (folder name consistency)
        if (mapId && m.mapId && m.mapId.replace(/[^a-z0-9]/gi, '_') === mapId.replace(/[^a-z0-9]/gi, '_')) return true;

        return false;
    });

    if (mapMod && mapMod.iconData) {
        return <img src={mapMod.iconData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
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
