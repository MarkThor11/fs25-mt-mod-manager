import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Palette, Image as ImageIcon, Upload, Check, RotateCcw, 
  AlignLeft, AlignCenter, AlignRight, Type, Eye, EyeOff, Sparkles, Sliders, Move
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
import ImageCropModal from './ImageCropModal';
import mapUs from '../../assets/maps/map_us.png';
import mapEu from '../../assets/maps/map_eu.png';
import mapAs from '../../assets/maps/map_as.png';
import mapKinlaig from '../../assets/maps/map_kinlaig.jpg';

const COLOR_SWATCHES = [
  { name: 'Pure White', value: '#ffffff' },
  { name: 'Harvest Gold', value: '#f59e0b' },
  { name: 'Farming Green', value: '#22c55e' },
  { name: 'Sky Cyan', value: '#06b6d4' },
  { name: 'Sunset Amber', value: '#f97316' },
  { name: 'Crimson Red', value: '#ef4444' },
  { name: 'Violet Accent', value: '#a855f7' },
];

export default function HeroCustomizerModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('background'); // 'background' | 'typography' | 'visibility'
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToastStore();

  useEffect(() => {
    if (isOpen) {
      const main = document.querySelector('.main-content');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isOpen]);

  const {
    homeShowHero, setHomeShowHero,
    heroBgType, heroCustomBg, heroDimmer, heroAlignment,
    heroFont, heroTextSize, heroTextColor, heroTextShadow,
    heroShowText, heroShowSubtitle,
    updateHeroBannerSettings, resetHeroBannerSettings, setCustomHeroBanner
  } = useSettingsStore();

  const handleSelectPreset = (type) => {
    updateHeroBannerSettings({ heroBgType: type });
  };

  const handlePickFile = async () => {
    // 1. Try native dialog first
    try {
      if (window.api?.dialog?.selectFile) {
        const filePath = await window.api.dialog.selectFile({
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
        });

        if (filePath) {
          let dataUrl = null;
          if (window.api?.images?.readLocalAsDataUrl) {
            dataUrl = await window.api.images.readLocalAsDataUrl(filePath);
          }
          if (dataUrl) {
            setCropImageSrc(dataUrl);
            setShowCropper(true);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Native dialog error, falling back to file input:', e);
    }

    // 2. Fallback to HTML file input
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setCropImageSrc(dataUrl);
        setShowCropper(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCropped = async (croppedDataUrl) => {
    try {
      await setCustomHeroBanner(croppedDataUrl);
      setShowCropper(false);
      toast.success('Custom banner wallpaper cropped & applied!');
    } catch (err) {
      console.error('Failed to apply cropped banner:', err);
      toast.error('Failed to save cropped image: ' + err.message);
    }
  };

  const handleRecrop = async () => {
    let src = heroCustomBg;
    if ((!src || src === 'custom_hero_banner.jpg') && window.api?.images?.getHeroBanner) {
      try {
        const disk = await window.api.images.getHeroBanner();
        if (disk) src = disk;
      } catch (e) {
        console.warn('Failed to read hero banner from disk for recrop:', e);
      }
    }
    if (src) {
      setCropImageSrc(src);
      setShowCropper(true);
    } else {
      handlePickFile();
    }
  };

  const handleReset = async () => {
    await resetHeroBannerSettings();
    toast.info('Hero banner reset to default');
  };

  const presets = [
    { id: 'default', name: 'Default Glow', preview: null, isDefault: true },
    { id: 'riverbend', name: 'Riverbend Springs (US)', preview: mapUs },
    { id: 'zielonka', name: 'Zielonka (EU)', preview: mapEu },
    { id: 'hutan', name: 'Hutan Pantai (Asia)', preview: mapAs },
    { id: 'kinlaig', name: 'Kinlaig (Highlands)', preview: mapKinlaig },
  ];

  return (
    <>
      <div 
        className="modal-overlay" 
        onClick={onClose} 
        style={{ 
          zIndex: 1100, 
          alignItems: 'flex-end', 
          justifyContent: 'center', 
          paddingBottom: '16px',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.25) 35%, transparent 55%)',
          backdropFilter: 'none'
        }}
      >
        <div 
          className="modal animate-scale-up"
          onClick={(e) => e.stopPropagation()}
          style={{ 
            width: '94%',
            maxWidth: '880px', 
            maxHeight: '44vh', 
            display: 'flex', 
            flexDirection: 'column',
            boxShadow: '0 -8px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--border)'
          }}
        >
          {/* Modal Header */}
          <div className="modal__header" style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Palette size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Banner Studio</h2>
                  <span style={{ fontSize: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>Live Preview</span>
                </div>
                <p style={{ fontSize: '11px', margin: 0, color: 'var(--text-tertiary)' }}>Live controls — see the banner above update in real-time</p>
              </div>
            </div>
            <button className="btn btn--icon btn--ghost" onClick={onClose} style={{ width: '28px', height: '28px', padding: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: '0 18px' }}>
            <button 
              onClick={() => setActiveTab('background')}
              style={{
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: activeTab === 'background' ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'background' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                borderBottom: activeTab === 'background' ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ImageIcon size={14} /> Background
            </button>
            <button 
              onClick={() => setActiveTab('typography')}
              style={{
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: activeTab === 'typography' ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'typography' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                borderBottom: activeTab === 'typography' ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Type size={14} /> Typography & Layout
            </button>
            <button 
              onClick={() => setActiveTab('visibility')}
              style={{
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: activeTab === 'visibility' ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'visibility' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                borderBottom: activeTab === 'visibility' ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Eye size={14} /> Visibility & Modes
            </button>
          </div>

          {/* Modal Body */}
          <div className="modal__body" style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* ══ TAB 1: BACKGROUND ══ */}
            {activeTab === 'background' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                    Choose Wallpaper Preset
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                    {presets.map((p) => {
                      const isSelected = heroBgType === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPreset(p.id)}
                          style={{
                            height: '68px',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden',
                            background: p.preview ? `url(${p.preview}) center/cover no-repeat` : 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 0 14px rgba(var(--accent-rgb, 59, 130, 246), 0.3)' : 'none'
                          }}
                        >
                          <div style={{ 
                            position: 'absolute', 
                            inset: 0, 
                            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 65%)', 
                            display: 'flex', 
                            alignItems: 'flex-end', 
                            padding: '6px 8px' 
                          }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                            </span>
                          </div>
                          {isSelected && (
                            <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={10} strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Custom Upload Tile */}
                    <div
                      onClick={() => {
                        if (heroCustomBg) {
                          handleSelectPreset('custom');
                        } else {
                          handlePickFile();
                        }
                      }}
                      style={{
                        height: '68px',
                        borderRadius: '10px',
                        border: heroBgType === 'custom' ? '2px solid var(--accent)' : '1px dashed var(--border)',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        background: heroCustomBg ? `url(${heroCustomBg}) center/cover no-repeat` : 'var(--bg-tertiary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {heroCustomBg ? (
                        <div style={{ 
                          position: 'absolute', 
                          inset: 0, 
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 65%)', 
                          display: 'flex', 
                          alignItems: 'flex-end', 
                          padding: '6px 8px' 
                        }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Custom Photo</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={16} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-secondary)' }}>Upload</span>
                        </>
                      )}
                      {heroBgType === 'custom' && (
                        <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={10} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upload & Crop Buttons */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn--secondary" 
                    onClick={handlePickFile}
                    style={{ flex: 1, minWidth: '160px', gap: '6px', justifyContent: 'center', padding: '8px 14px', fontSize: '12px' }}
                  >
                    <Upload size={14} /> Choose Image from PC...
                  </button>
                  {heroCustomBg && (
                    <button 
                      className="btn btn--secondary" 
                      onClick={handleRecrop}
                      style={{ flex: 1, minWidth: '160px', gap: '6px', justifyContent: 'center', padding: '8px 14px', fontSize: '12px' }}
                      title="Adjust framing, zoom and positioning of your custom wallpaper"
                    >
                      <Move size={14} /> Reposition & Crop
                    </button>
                  )}
                </div>

                {/* Dimmer Overlay Slider */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Darkness Scrim Overlay</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)' }}>{heroDimmer}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                  max="90"
                  step="5"
                  value={heroDimmer}
                  onChange={(e) => updateHeroBannerSettings({ heroDimmer: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* ══ TAB 2: TYPOGRAPHY & LAYOUT ══ */}
          {activeTab === 'typography' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Text Alignment */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Text Placement & Alignment
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'left', label: 'Left Aligned', icon: AlignLeft },
                    { id: 'center', label: 'Centered', icon: AlignCenter },
                    { id: 'right', label: 'Right Aligned', icon: AlignRight },
                  ].map((a) => {
                    const Icon = a.icon;
                    const isSelected = heroAlignment === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => updateHeroBannerSettings({ heroAlignment: a.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Icon size={14} /> {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Font Family Style
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'modern', name: 'Modern Sans', preview: 'Inter' },
                    { id: 'display', name: 'AAA Display', preview: 'Cinematic' },
                    { id: 'rustic', name: 'Rustic Farm', preview: 'Classic' },
                    { id: 'tech', name: 'Industrial', preview: 'Mono' },
                  ].map((f) => {
                    const isSelected = heroFont === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => updateHeroBannerSettings({ heroFont: f.id })}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {f.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                          {f.preview}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Banner Scale & Height */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Banner Height & Scale
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'compact', label: 'Compact', sub: '200px' },
                    { id: 'standard', label: 'Standard', sub: '280px' },
                    { id: 'large', label: 'Tall', sub: '380px' },
                    { id: 'epic', label: 'Cinematic', sub: '460px' },
                  ].map((s) => {
                    const isSelected = (heroTextSize || 'standard') === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => updateHeroBannerSettings({ heroTextSize: s.id })}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px 6px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: '600',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{s.label}</span>
                        <span style={{ fontSize: '9px', opacity: 0.7, marginTop: '1px' }}>{s.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Color Swatches */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Text Color
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {COLOR_SWATCHES.map((c) => {
                    const isSelected = heroTextColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <div
                        key={c.value}
                        onClick={() => updateHeroBannerSettings({ heroTextColor: c.value })}
                        title={c.name}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: c.value,
                          border: isSelected ? '3px solid var(--accent)' : '2px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 0 10px rgba(var(--accent-rgb, 59, 130, 246), 0.5)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.1s ease',
                          transform: isSelected ? 'scale(1.15)' : 'scale(1)'
                        }}
                      >
                        {isSelected && <Check size={12} color={c.value === '#ffffff' ? '#000' : '#fff'} strokeWidth={3} />}
                      </div>
                    );
                  })}
                  
                  {/* Native Color Picker */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: '6px' }}>
                    <input 
                      type="color" 
                      value={heroTextColor}
                      onChange={(e) => updateHeroBannerSettings({ heroTextColor: e.target.value })}
                      style={{ width: '28px', height: '28px', padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Custom</span>
                  </label>
                </div>
              </div>

              {/* Drop Shadow Toggle */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>High-Contrast Drop Shadow</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Guarantees crisp readability over bright photo areas</div>
                </div>
                <input 
                  type="checkbox"
                  checked={heroTextShadow}
                  onChange={(e) => updateHeroBannerSettings({ heroTextShadow: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* ══ TAB 3: VISIBILITY & MODES ══ */}
          {activeTab === 'visibility' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Photo Mode Toggle */}
              <div style={{ 
                background: !heroShowText ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-tertiary)', 
                border: !heroShowText ? '1px solid #22c55e' : '1px solid var(--border)',
                padding: '12px 14px', 
                borderRadius: '10px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: !heroShowText ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-secondary)', color: !heroShowText ? '#22c55e' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Photo Mode (Clean Wallpaper)</span>
                      {!heroShowText && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontWeight: '700' }}>Active</span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Hides welcome text to display your farm background as an uninterrupted visual showcase.
                    </p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={!heroShowText}
                  onChange={(e) => updateHeroBannerSettings({ heroShowText: !e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
                />
              </div>

              {/* Subtitle Description Toggle */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Show Subtitle Description</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Show the status helper text beneath your farm greeting</div>
                </div>
                <input 
                  type="checkbox"
                  checked={heroShowSubtitle}
                  disabled={!heroShowText}
                  onChange={(e) => updateHeroBannerSettings({ heroShowSubtitle: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>

              {/* Show Entire Hero Card Toggle */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Enable Dashboard Hero Banner</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Disable if you prefer a compact view with immediate access to dashboard cards</div>
                </div>
                <input 
                  type="checkbox"
                  checked={homeShowHero}
                  onChange={(e) => setHomeShowHero(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal__footer" style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <button 
            className="btn btn--ghost"
            onClick={handleReset}
            style={{ gap: '6px', fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px 12px' }}
          >
            <RotateCcw size={14} /> Reset to Defaults
          </button>
          
          <button 
            className="btn btn--primary"
            onClick={onClose}
            style={{ minWidth: '90px', padding: '6px 18px', fontSize: '13px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>

    {/* Hidden File Input for browser/fallback selection */}
    <input 
      type="file" 
      ref={fileInputRef} 
      accept="image/*" 
      onChange={handleFileInputChange} 
      style={{ display: 'none' }} 
    />

    {/* Interactive Crop & Position Modal */}
    <ImageCropModal 
      isOpen={showCropper} 
      imageSrc={cropImageSrc} 
      onClose={() => setShowCropper(false)} 
      onApply={handleApplyCropped} 
    />
  </>
  );
}
