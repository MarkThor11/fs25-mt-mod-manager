import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Globe, HardDrive, Save, Settings, Play, Download, Radio,
  Tractor, Package, Database, Heart, EyeOff, Map,
  ChevronLeft, ChevronRight, LayoutGrid, RefreshCw, ShieldAlert, ArrowRightLeft
} from 'lucide-react';
import { useLocalModsStore } from '../../store/useLocalModsStore';
import { useModHubStore } from '../../store/useModHubStore';
import { useDownloadStore } from '../../store/useDownloadStore';

import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
import { useScrollPersistence } from '../../hooks/useScrollPersistence';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/modhub', label: 'ModHub Browser', icon: LayoutGrid },
  { to: '/third-party', label: 'Third-Party Mods', icon: Globe },
  { to: '/installed', label: 'Installed Mods', icon: HardDrive },
  { to: '/favourites', label: 'My Favourites', icon: Heart },
  { to: '/hidden', label: 'Hidden Mods', icon: EyeOff },
  { to: '/savegames', label: 'Savegames', icon: Save },
  { to: '/save-transfer', label: 'Save Transfer', icon: ArrowRightLeft },
  { to: '/profiles', label: 'Profiles', icon: Database },
  { to: '/maps', label: 'Map Library', icon: Map },
  { to: '/radio', label: 'Radio Stations', icon: Radio },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/diagnostics', label: 'Reporting & Diagnostics', icon: ShieldAlert },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support Me', icon: Heart },
];


export default function Sidebar() {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const scrollRef = useScrollPersistence('sidebar');
  
  const modCount = useLocalModsStore((s) => s.mods?.length || 0);
  const { favoriteAuthors, favoriteMods } = useModHubStore();
  const favCount = (favoriteAuthors?.length || 0) + (favoriteMods?.length || 0);
  const hiddenCount = useModHubStore((s) => s.hiddenMods?.length || 0);
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);
  const downloadCount = Object.keys(activeDownloads).length;

  const toggleCollapse = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem('sidebar_collapsed', newVal);
  };

  const handleLaunch = async () => {
    try {
      const { savegameSlot, enableCheats, skipModDialog, skipIntro } = useSettingsStore.getState();
      const options = {};
      if (savegameSlot) options.savegameIndex = savegameSlot;
      if (enableCheats) options.cheats = true;
      options.skipModUpdateDialog = skipModDialog !== false;
      options.skipIntro = skipIntro !== false;
      
      const result = await window.api.game.launch(options);
      if (result.success) {
        if (result.needsManualInit) {
          useToastStore.getState().info(`GHOST SLOT: Slot ${savegameSlot} will show as 'Empty'. Select it, start the map, and SAVE ONCE to initialize.`, { duration: 10000 });
        } else {
          useToastStore.getState().success(`Launching Slot ${savegameSlot}...`);
        }
      } else {
        useToastStore.getState().error(result.error || 'Failed to launch game');
      }
    } catch (err) {
      useToastStore.getState().error('Failed to launch game: ' + err.message);
    }
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''}`} ref={scrollRef}>
      <div className="sidebar__brand" id="tour-sidebar-brand">
        <div className="sidebar__logo">
          <Tractor size={20} />
        </div>
        {!isCollapsed && (
          <div>
            <div className="sidebar__app-name">MT Mod Manager</div>
            <div className="sidebar__app-sub">Farming Simulator 25</div>
          </div>
        )}
        <button 
          className="btn btn--secondary btn--xs" 
          onClick={toggleCollapse} 
          style={{ marginLeft: isCollapsed ? 0 : 'auto', padding: 4 }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              id={`tour-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              data-tour-id={item.label.toLowerCase().replace(/\s+/g, '-')}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
              end={item.to === '/'}
              title={isCollapsed ? item.label : ''}
            >
              <Icon className="sidebar__link-icon" size={20} />
              <span>{item.label}</span>
              {item.to === '/installed' && modCount > 0 && (
                <span className="sidebar__link-badge">{modCount}</span>
              )}
              {item.to === '/downloads' && downloadCount > 0 && (
                <span className="sidebar__link-badge" style={{ background: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={10} className="animate-spin" /> {downloadCount}
                </span>
              )}
              {item.to === '/favourites' && favCount > 0 && (
                <span className="sidebar__link-badge">{favCount}</span>
              )}
              {item.to === '/hidden' && hiddenCount > 0 && (
                <span className="sidebar__link-badge">{hiddenCount}</span>
              )}

            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar__launch-section">
        <button className="launch-btn" onClick={handleLaunch} id="launch-game-btn">
          <Play size={20} />
          <span>Launch Game</span>
        </button>
      </div>

      <div className="sidebar__footer">
        {useSettingsStore(s => !s.isOnline) && (
            <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: '#ef4444', 
                padding: '6px 12px', 
                borderRadius: 6, 
                fontSize: 10, 
                fontWeight: 800, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                border: '1px solid rgba(239, 68, 68, 0.2)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                Offline Mode
            </div>
        )}
        <div className="sidebar__credits">
          Created By Mark Thor
        </div>
      </div>
    </aside>
  );
}
