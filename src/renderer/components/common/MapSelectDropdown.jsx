import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Zap, ChevronDown, Search, X } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

const OFFICIAL_MAPS = [
  { value: 'MapUS|Riverbend Springs|||', title: 'Riverbend Springs (US)', hasTemplate: true },
  { value: 'MapAS|Hutan Pantai|||', title: 'Hutan Pantai (Asia)', hasTemplate: true },
  { value: 'MapEU|Zielonka|||', title: 'Zielonka (Europe)', hasTemplate: true },
  { value: 'HighlandsFishingMap|Kinlaig|pdlc_highlandsFishingPack||', title: 'Kinlaig (DLC)', hasTemplate: true }
];

export default function MapSelectDropdown({ value, onChange, mods = [], mapHasTemplate = false, style = {} }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredValue, setHoveredValue] = useState(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const { templates, fetchTemplates } = useMapStore();

  useEffect(() => {
    fetchTemplates?.();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates?.();
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setSearchTerm('');
      setHoveredValue(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Check if a mod map has an automation template using ZIP name
  const checkModHasTemplate = useMemo(() => {
    const clean = (s) => (s || '').toLowerCase().trim();
    const norm = (s) => clean(s).replace(/[^a-z0-9]/g, '');

    const OFFICIAL_TEMPLATES = new Set([
      'mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'pdlchighlandsfishingpackhighlandsfishingmap'
    ]);
    const GENERIC_MAP_NAMES = new Set([
      'samplemodmap', 'templatemap', 'multifruitmodmap', 'modmap', 
      'map', 'maps4s', 'novabase', 'mountain', 'firstmap', 
      'davidsmap', 'baseblack', 'camposgauchos', 'elmcreek',
      'mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'pdlchighlandsfishingpack', 'mapforest'
    ]);

    return (mod) => {
      if (!templates || templates.length === 0 || !mod) return false;

      // Primary zip name identifier (e.g. FS25_Alliklepa_CP from FS25_Alliklepa_CP.zip)
      const rawZip = mod.fileName || mod.filePath || mod.zipName || '';
      const zipName = rawZip.split(/[/\\]/).pop().replace(/\.zip$/i, '');
      const zipNorm = norm(zipName);
      const mNameNorm = norm(mod.modName);

      const effectiveNorm = (zipNorm && !GENERIC_MAP_NAMES.has(zipNorm)) ? zipNorm : mNameNorm;
      if (!effectiveNorm || GENERIC_MAP_NAMES.has(effectiveNorm)) return false;

      return templates.some((t) => {
        const cleanTId = (t.id || '').replace(/\.zip$/i, '').toLowerCase();
        if (OFFICIAL_TEMPLATES.has(cleanTId)) return false;

        const tIdNorm = norm(cleanTId);

        // 1. Strict Exact Match by ZIP name (or normalized zip name)
        if (tIdNorm === effectiveNorm || cleanTId === (zipName || '').toLowerCase()) {
          return true;
        }

        // 2. Suffix Match: e.g. template named zipName_samplemodmap or zipName.samplemodmap
        if (effectiveNorm.length >= 4) {
          if (tIdNorm === effectiveNorm + 'samplemodmap' || tIdNorm.startsWith(effectiveNorm + '_samplemodmap')) {
            return true;
          }
        }

        return false;
      });
    };
  }, [templates]);

  // Format modded maps list
  const moddedMaps = useMemo(() => {
    const rawList = mods
      .filter((m) => m.isMap && !m.isDLC)
      .map((m) => {
        const isCP =
          m.isCrossplay ||
          /crossplay|\(cp\)|\[cp\]/i.test(m.title || '') ||
          /crossplay|\(cp\)|\[cp\]/i.test(m.modName || '') ||
          /crossplay|\(cp\)|\[cp\]/i.test(m.fileName || '') ||
          /crossplay|\(cp\)|\[cp\]/i.test(m.filePath || '') ||
          /crossplay|\(cp\)|\[cp\]/i.test(m.folder || '');

        let baseTitle = (m.title || '').replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                                       .replace(/\s+crossplay\s*$/i, '')
                                       .replace(/\s+cp\s*$/i, '')
                                       .trim();
        const displayTitle = isCP ? `${baseTitle} (CP)` : baseTitle;

        const rawZip = m.fileName || m.filePath || m.modName || '';
        const zipName = rawZip.split(/[/\\]/).pop().replace(/\.zip$/i, '');

        const val = `${m.mapId || zipName || m.modName}|${m.title}|${zipName || m.modName}|${m.iconData || ''}|${m.filePath || ''}`;
        const hasTemplate = checkModHasTemplate(m);

        return {
          value: val,
          title: displayTitle,
          hasTemplate,
          mod: m
        };
      });

    // Count occurrences of each title to disambiguate duplicate titles
    const titleCounts = new Map();
    rawList.forEach((item) => {
      const key = item.title.toLowerCase();
      titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    });

    return rawList.map((item) => {
      if ((titleCounts.get(item.title.toLowerCase()) || 0) > 1) {
        const modTag = item.mod.modName || (item.mod.fileName ? item.mod.fileName.replace(/\.zip$/i, '') : '');
        return {
          ...item,
          title: `${item.title} (${modTag})`
        };
      }
      return item;
    });
  }, [mods, checkModHasTemplate]);

  // Find currently selected item title and template status
  const selectedInfo = useMemo(() => {
    const off = OFFICIAL_MAPS.find((m) => m.value === value);
    if (off) return off;

    const mod = moddedMaps.find((m) => m.value === value);
    if (mod) return mod;

    // Fallback parsing from value
    if (value && value.includes('|')) {
      const parts = value.split('|');
      return {
        value,
        title: parts[1] || parts[0],
        hasTemplate: mapHasTemplate
      };
    }

    return { value: '', title: 'Select a Map...', hasTemplate: false };
  }, [value, moddedMaps, mapHasTemplate]);

  // Filtered lists for search
  const filteredOfficial = useMemo(() => {
    if (!searchTerm.trim()) return OFFICIAL_MAPS;
    const term = searchTerm.toLowerCase();
    return OFFICIAL_MAPS.filter((m) => m.title.toLowerCase().includes(term));
  }, [searchTerm]);

  const filteredModded = useMemo(() => {
    if (!searchTerm.trim()) return moddedMaps;
    const term = searchTerm.toLowerCase();
    return moddedMaps.filter((m) => m.title.toLowerCase().includes(term));
  }, [searchTerm, moddedMaps]);

  const totalFilteredCount = filteredOfficial.length + filteredModded.length;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          padding: '13px 16px',
          fontSize: 15,
          background: 'var(--bg-tertiary)',
          border: selectedInfo.hasTemplate ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: selectedInfo.hasTemplate ? '0 0 12px rgba(74, 222, 128, 0.12)' : 'none',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {selectedInfo.hasTemplate && (
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              <Zap size={16} fill="var(--accent)" />
            </div>
          )}
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--text-primary)'
            }}
          >
            {selectedInfo.title}
          </span>
          {selectedInfo.hasTemplate && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.05em',
                color: 'var(--accent)',
                background: 'rgba(74, 222, 128, 0.15)',
                padding: '2px 6px',
                borderRadius: 4,
                flexShrink: 0
              }}
            >
              AUTOMATED
            </span>
          )}
        </div>

        <ChevronDown
          size={18}
          style={{
            color: 'var(--text-secondary)',
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            flexShrink: 0
          }}
        />
      </div>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          className="animate-zoom-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 1200,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-2xl)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-tertiary)'
            }}
          >
            <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search maps..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                width: '100%',
                padding: 0
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* List Area */}
          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              padding: '6px 0'
            }}
          >
            {totalFilteredCount === 0 ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No maps found matching "{searchTerm}"
              </div>
            ) : (
              <>
                {/* Official Maps Group */}
                {filteredOfficial.length > 0 && (
                  <div style={{ marginBottom: filteredModded.length > 0 ? 8 : 0 }}>
                    <div
                      style={{
                        padding: '6px 14px',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      Official Maps
                    </div>
                    {filteredOfficial.map((map) => {
                      const isSelected = value === map.value;
                      const isHovered = hoveredValue === map.value;
                      return (
                        <div
                          key={map.value}
                          onClick={() => {
                            onChange(map.value);
                            setIsOpen(false);
                          }}
                          onMouseEnter={() => setHoveredValue(map.value)}
                          onMouseLeave={() => setHoveredValue(null)}
                          style={{
                            padding: '9px 14px',
                            margin: '1px 6px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            background: isSelected
                              ? 'var(--accent-dim)'
                              : isHovered
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'transparent',
                            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                            transition: 'background 0.12s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <Zap size={14} fill="var(--accent)" color="var(--accent)" style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: isSelected ? 700 : 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {map.title}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              letterSpacing: '0.05em',
                              color: 'var(--accent)',
                              background: 'rgba(74, 222, 128, 0.12)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              flexShrink: 0
                            }}
                          >
                            AUTOMATED
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Modded Maps Group */}
                {filteredModded.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '6px 14px',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-tertiary)',
                        borderTop: filteredOfficial.length > 0 ? '1px solid var(--border)' : 'none',
                        paddingTop: filteredOfficial.length > 0 ? 10 : 6
                      }}
                    >
                      Modded Maps ({moddedMaps.length})
                    </div>
                    {filteredModded.map((map) => {
                      const isSelected = value === map.value;
                      const isHovered = hoveredValue === map.value;
                      return (
                        <div
                          key={map.value}
                          onClick={() => {
                            onChange(map.value);
                            setIsOpen(false);
                          }}
                          onMouseEnter={() => setHoveredValue(map.value)}
                          onMouseLeave={() => setHoveredValue(null)}
                          style={{
                            padding: '9px 14px',
                            margin: '1px 6px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            background: isSelected
                              ? 'var(--accent-dim)'
                              : isHovered
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'transparent',
                            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                            transition: 'background 0.12s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            {map.hasTemplate ? (
                              <Zap size={14} fill="var(--accent)" color="var(--accent)" style={{ flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 14, flexShrink: 0 }} />
                            )}
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: isSelected ? 700 : 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {map.title}
                            </span>
                          </div>
                          {map.hasTemplate && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: '0.05em',
                                color: 'var(--accent)',
                                background: 'rgba(74, 222, 128, 0.12)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                flexShrink: 0
                              }}
                            >
                              AUTOMATED
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
