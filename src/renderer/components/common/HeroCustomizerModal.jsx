import React, { useState } from 'react';
import { 
  X, Palette, Image as ImageIcon, Upload, Check, RotateCcw, 
  AlignLeft, AlignCenter, AlignRight, Type, Eye, EyeOff, Sparkles, Sliders
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
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
  const toast = useToastStore();

  const {
    homeShowHero, setHomeShowHero,
    heroBgType, heroCustomBg, heroDimmer, heroAlignment,
    heroFont, heroTextSize, heroTextColor, heroTextShadow,
    heroShowText, heroShowSubtitle,
    updateHeroBannerSettings, resetHeroBannerSettings
  } = useSettingsStore();

  const handleSelectPreset = (type) => {
    updateHeroBannerSettings({ heroBgType: type });
  };

  const handleUploadCustomImage = async () => {
    try {
      if (!window.api?.dialog?.selectFile) return;
      const filePath = await window.api.dialog.selectFile({
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
      });

      if (!filePath) return;

      let dataUrl = null;
      if (window.api?.images?.readLocalAsDataUrl) {
        dataUrl = await window.api.images.readLocalAsDataUrl(filePath);
      }

      if (dataUrl) {
        await updateHeroBannerSettings({
          heroBgType: 'custom',
          heroCustomBg: dataUrl
        });
        toast.success('Custom banner wallpaper applied!');
      } else {
        toast.error('Could not load image file');
      }
    } catch (err) {
      console.error('Failed to upload custom banner:', err);
      toast.error('Failed to upload image: ' + err.message);
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal modal--medium animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="modal__header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Banner Studio</h2>
              <p style={{ fontSize: '12px', margin: '2px 0 0 0', color: 'var(--text-tertiary)' }}>Customize your dashboard banner wallpaper, typography, and layout</p>
            </div>
          </div>
          <button className="btn btn--icon btn--ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)', padding: '0 24px' }}>
          <button 
            onClick={() => setActiveTab('background')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'background' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'background' ? '700' : '500',
              fontSize: '13px',
              cursor: 'pointer',
              borderBottom: activeTab === 'background' ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ImageIcon size={16} /> Background
          </button>
          <button 
            onClick={() => setActiveTab('typography')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'typography' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'typography' ? '700' : '500',
              fontSize: '13px',
              cursor: 'pointer',
              borderBottom: activeTab === 'typography' ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Type size={16} /> Typography & Layout
          </button>
          <button 
            onClick={() => setActiveTab('visibility')}
            style={{
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'visibility' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'visibility' ? '700' : '500',
              fontSize: '13px',
              cursor: 'pointer',
              borderBottom: activeTab === 'visibility' ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Eye size={16} /> Visibility & Modes
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal__body" style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* ══ TAB 1: BACKGROUND ══ */}
          {activeTab === 'background' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px', display: 'block' }}>
                  Choose Wallpaper Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {presets.map((p) => {
                    const isSelected = heroBgType === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPreset(p.id)}
                        style={{
                          height: '90px',
                          borderRadius: '12px',
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
                          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)', 
                          display: 'flex', 
                          alignItems: 'flex-end', 
                          padding: '8px 10px' 
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                            {p.name}
                          </span>
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Custom Upload Tile */}
                  <div
                    onClick={handleUploadCustomImage}
                    style={{
                      height: '90px',
                      borderRadius: '12px',
                      border: heroBgType === 'custom' ? '2px solid var(--accent)' : '1px dashed var(--border)',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      background: heroCustomBg ? `url(${heroCustomBg}) center/cover no-repeat` : 'var(--bg-tertiary)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {heroCustomBg ? (
                      <div style={{ 
                        position: 'absolute', 
                        inset: 0, 
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)', 
                        display: 'flex', 
                        alignItems: 'flex-end', 
                        padding: '8px 10px' 
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff' }}>Custom Screenshot</span>
                      </div>
                    ) : (
                      <>
                        <Upload size={18} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Upload Photo</span>
                      </>
                    )}
                    {heroBgType === 'custom' && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload Button */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className="btn btn--secondary" 
                  onClick={handleUploadCustomImage}
                  style={{ flex: 1, gap: '8px', justifyContent: 'center' }}
                >
                  <Upload size={16} /> Choose Image from PC...
                </button>
              </div>

              {/* Dimmer Overlay Slider */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sliders size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Darkness Scrim Overlay</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)' }}>{heroDimmer}%</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  Adjusts the darkness of the background overlay to guarantee crisp text readability over bright scenes.
                </p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Text Alignment */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                  Text Placement & Alignment
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
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
                          gap: '8px',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Icon size={16} /> {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                  Font Family Style
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'modern', name: 'Modern Sans', preview: 'Inter / System' },
                    { id: 'display', name: 'AAA Gaming Display', preview: 'Heavy & Cinematic' },
                    { id: 'rustic', name: 'Rustic Farm', preview: 'Classic Serif' },
                    { id: 'tech', name: 'Industrial Tech', preview: 'Monospace' },
                  ].map((f) => {
                    const isSelected = heroFont === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => updateHeroBannerSettings({ heroFont: f.id })}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: '700', color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {f.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          {f.preview}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Text Size */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                  Greeting Text Size
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { id: 'compact', label: 'Compact' },
                    { id: 'standard', label: 'Standard' },
                    { id: 'large', label: 'Heroic Large' },
                  ].map((s) => {
                    const isSelected = heroTextSize === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => updateHeroBannerSettings({ heroTextSize: s.id })}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Color Swatches */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                  Text Color
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {COLOR_SWATCHES.map((c) => {
                    const isSelected = heroTextColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <div
                        key={c.value}
                        onClick={() => updateHeroBannerSettings({ heroTextColor: c.value })}
                        title={c.name}
                        style={{
                          width: '32px',
                          height: '32px',
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
                        {isSelected && <Check size={14} color={c.value === '#ffffff' ? '#000' : '#fff'} strokeWidth={3} />}
                      </div>
                    );
                  })}
                  
                  {/* Native Color Picker */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: '6px' }}>
                    <input 
                      type="color" 
                      value={heroTextColor}
                      onChange={(e) => updateHeroBannerSettings({ heroTextColor: e.target.value })}
                      style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Custom</span>
                  </label>
                </div>
              </div>

              {/* Drop Shadow Toggle */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>High-Contrast Drop Shadow</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Adds cinematic depth and guarantees contrast against bright photo areas</div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Photo Mode Toggle */}
              <div style={{ 
                background: !heroShowText ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-tertiary)', 
                border: !heroShowText ? '1px solid #22c55e' : '1px solid var(--border)',
                padding: '18px', 
                borderRadius: '14px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: !heroShowText ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-secondary)', color: !heroShowText ? '#22c55e' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={22} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Photo Mode (Clean Wallpaper)</span>
                      {!heroShowText && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontWeight: '700' }}>Active</span>
                      )}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Hides all welcome text, displaying your farm background photo as an uninterrupted visual showcase.
                    </p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={!heroShowText}
                  onChange={(e) => updateHeroBannerSettings({ heroShowText: !e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#22c55e', cursor: 'pointer' }}
                />
              </div>

              {/* Subtitle Description Toggle */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Show Subtitle Description</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Show the helper text beneath your farm greeting</div>
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
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Enable Dashboard Hero Banner</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Disable if you prefer a compact view with immediate access to dashboard cards</div>
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
        <div className="modal__footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <button 
            className="btn btn--ghost"
            onClick={handleReset}
            style={{ gap: '8px', color: 'var(--text-tertiary)' }}
          >
            <RotateCcw size={16} /> Reset to Defaults
          </button>
          
          <button 
            className="btn btn--primary"
            onClick={onClose}
            style={{ minWidth: '110px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
