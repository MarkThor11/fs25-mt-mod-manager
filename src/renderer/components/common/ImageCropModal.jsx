import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Move, Check, RotateCcw, Image as ImageIcon, Eye, EyeOff, Grid } from 'lucide-react';

const FONT_FAMILIES = {
  modern: 'inherit',
  display: "'Rajdhani', 'Impact', 'Trebuchet MS', sans-serif",
  rustic: "'Georgia', 'Cambria', 'Palatino', serif",
  slab: "'Rockwell', 'Clarendon', 'Copperplate Gothic Bold', serif",
  condensed: "'Impact', 'Arial Narrow', 'Franklin Gothic Medium', sans-serif",
  handwriting: "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive",
  elegant: "'Garamond', 'Baskerville', 'Times New Roman', serif",
  tech: "'Consolas', 'Fira Code', monospace"
};

const BANNER_SIZES = [
  {
    id: 'compact',
    label: 'Compact',
    sub: '200px',
    height: 200,
    desc: '200px slim ribbon — minimal vertical footprint'
  },
  {
    id: 'standard',
    label: 'Standard',
    sub: '280px',
    height: 280,
    desc: '280px standard — balanced view for titles and widgets'
  },
  {
    id: 'large',
    label: 'Tall',
    sub: '380px',
    height: 380,
    desc: '380px tall framing — scenic landscapes and machinery'
  },
  {
    id: 'epic',
    label: 'Cinematic',
    sub: '460px',
    height: 460,
    desc: '460px cinematic framing — maximum vertical showcase'
  },
  {
    id: 'full',
    label: 'Full Photo',
    sub: '2.5:1',
    height: 640,
    desc: '2.5:1 generous framing with wide vertical coverage'
  }
];

export default function ImageCropModal({
  isOpen,
  imageSrc,
  originalSrc,
  heroTextSize = 'standard',
  bannerProps = {},
  onClose,
  onApply,
  onUseFullPhoto,
  onSizePreviewChange
}) {
  if (!isOpen || !imageSrc) return null;

  const [selectedSize, setSelectedSize] = useState(heroTextSize || 'standard');
  const [initialSize, setInitialSize] = useState(heroTextSize || 'standard');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 700, height: 260 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      const activeSize = heroTextSize || 'standard';
      setSelectedSize(activeSize);
      setInitialSize(activeSize);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [isOpen, heroTextSize]);

  // Measure live width of banner element on screen
  const getBannerWidth = () => {
    try {
      const heroEl = document.querySelector('.home-hero');
      if (heroEl) {
        const rect = heroEl.getBoundingClientRect();
        if (rect.width > 200) return Math.round(rect.width);
      }
    } catch (_) {}
    return 1600;
  };

  const activePreset = BANNER_SIZES.find((s) => s.id === selectedSize) || BANNER_SIZES[1];
  const targetBannerWidth = getBannerWidth();
  const targetBannerHeight = activePreset.height;

  // Handler for changing size preset
  const handleSelectSize = (sizeId) => {
    setSelectedSize(sizeId);
    const targetHeroSize = sizeId === 'full' ? 'epic' : sizeId;
    if (onSizePreviewChange) {
      onSizePreviewChange(targetHeroSize);
    }
  };

  const handleCancel = () => {
    if (onSizePreviewChange && initialSize) {
      onSizePreviewChange(initialSize);
    }
    onClose();
  };

  // Initialize image dimensions and center it
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Update container size on mount/resize/ratio change
  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          setContainerSize({ width: rect.width, height: rect.height });
        }
      };
      const raf = requestAnimationFrame(updateSize);
      window.addEventListener('resize', updateSize);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', updateSize);
      };
    }
  }, [isOpen, selectedSize]);

  // Compute base dimensions for "cover" fit
  const displayWidth = containerSize.width || 700;
  const displayHeight = containerSize.height || 260;

  let baseW = displayWidth;
  let baseH = displayHeight;
  if (imageSize.width > 0 && imageSize.height > 0) {
    const imgAspect = imageSize.width / imageSize.height;
    const containerAspect = displayWidth / displayHeight;
    if (imgAspect > containerAspect) {
      baseH = displayHeight;
      baseW = displayHeight * imgAspect;
    } else {
      baseW = displayWidth;
      baseH = displayWidth / imgAspect;
    }
  }

  // Mouse drag handlers
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(Math.max(0.5, prev + delta), 4));
  };

  const handleResetPosition = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Render cropped image to canvas at current ratio resolution
  const handleSaveCrop = () => {
    if (!imageSrc || isProcessing) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      const targetWidth = targetBannerWidth;
      const targetHeight = targetBannerHeight;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Calculate scaling ratio between container display and output canvas
        const scaleToCanvas = targetWidth / displayWidth;

        // Apply zoom and offset in canvas space
        const drawW = baseW * zoom * scaleToCanvas;
        const drawH = baseH * zoom * scaleToCanvas;
        const drawX = ((displayWidth - baseW * zoom) / 2 + offset.x) * scaleToCanvas;
        const drawY = ((displayHeight - baseH * zoom) / 2 + offset.y) * scaleToCanvas;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        // Convert to high-quality JPEG
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
        setIsProcessing(false);
        const finalSize = selectedSize === 'full' ? 'epic' : selectedSize;
        onApply(croppedDataUrl, finalSize);
      };
      img.src = imageSrc;
    } catch (err) {
      console.error('Failed to crop image:', err);
      setIsProcessing(false);
    }
  };

  // Skip/undo crop and apply full original photo
  const handleUseFull = () => {
    const finalSize = selectedSize === 'full' ? 'epic' : selectedSize;
    if (onUseFullPhoto) {
      onUseFullPhoto(finalSize);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleCancel} style={{ zIndex: 2000 }}>
      <div 
        className="modal modal--medium animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '840px', width: '94%', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal__header" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Move size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Crop & Position Banner</h2>
                <span style={{ fontSize: '11px', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 8px', borderRadius: '6px', fontWeight: '700' }}>
                  {activePreset.label} ({activePreset.sub})
                </span>
              </div>
              <p style={{ fontSize: '11px', margin: '2px 0 0 0', color: 'var(--text-tertiary)' }}>
                Drag your photo to place the focal point • Preview and height are directly linked to your banner
              </p>
            </div>
          </div>
          <button className="btn btn--icon btn--ghost" onClick={handleCancel} style={{ width: '28px', height: '28px', padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal__body" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Banner Height & Scale Linked Selector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Banner Height & Scale</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>• {activePreset.desc}</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Adjust in preview, applied on confirm
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {BANNER_SIZES.map((s) => {
                const isSelected = selectedSize === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSize(s.id)}
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
                      fontWeight: isSelected ? '700' : '500',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    title={s.desc}
                  >
                    <span>{s.label}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7, marginTop: '2px' }}>{s.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Crop Viewport Frame */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Live Banner Framing Preview</span>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>• Drag photo to position • Scroll wheel to zoom</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: showGrid ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                    color: showGrid ? 'var(--accent)' : 'var(--text-tertiary)',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                  title="Toggle rule-of-thirds grid"
                >
                  <Grid size={11} />
                  <span>Grid</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTextOverlay(!showTextOverlay)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: showTextOverlay ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                    color: showTextOverlay ? 'var(--accent)' : 'var(--text-tertiary)',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                  title="Toggle real banner text placement overlay"
                >
                  {showTextOverlay ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>Text Preview: {showTextOverlay ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>

            <div 
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{
                width: '100%',
                aspectRatio: `${targetBannerWidth} / ${targetBannerHeight}`,
                maxHeight: '380px',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                background: '#0a0d14',
                border: '2px solid var(--accent)',
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Draggable & Scalable Image */}
              <img 
                ref={imgRef}
                src={imageSrc}
                alt="Crop target"
                draggable={false}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${baseW}px`,
                  height: `${baseH}px`,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  transition: isDragging ? 'none' : 'transform 0.05s ease-out'
                }}
              />

              {/* Rule-of-Thirds Alignment Grid Overlay */}
              {showGrid && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
                  <div style={{ borderRight: '1px dashed rgba(255,255,255,0.18)', borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                  <div style={{ borderRight: '1px dashed rgba(255,255,255,0.18)', borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                  <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                  <div style={{ borderRight: '1px dashed rgba(255,255,255,0.18)', borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                  <div style={{ borderRight: '1px dashed rgba(255,255,255,0.18)', borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                  <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.18)' }} />
                </div>
              )}

              {/* Live Real-World Banner Text Overlay (matches HomePage positioning and styling) */}
              {showTextOverlay && (bannerProps?.heroShowText ?? true) && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    left: `${bannerProps?.heroTextPosX ?? 10}%`,
                    top: `${bannerProps?.heroTextPosY ?? 50}%`,
                    transform: `translate(-${bannerProps?.heroTextPosX ?? 10}%, -${bannerProps?.heroTextPosY ?? 50}%)`,
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    pointerEvents: 'none', 
                    zIndex: 10,
                    maxWidth: '85%',
                    userSelect: 'none'
                  }}
                >
                  <div 
                    style={{ 
                      fontSize: `calc(18px * ${(bannerProps?.heroTextScale || 100) / 100})`, 
                      fontWeight: '800', 
                      lineHeight: 1.15,
                      color: bannerProps?.heroTextColor || '#ffffff', 
                      textShadow: (bannerProps?.heroTextShadow !== false) 
                        ? '0 2px 12px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.95)' 
                        : 'none',
                      fontFamily: FONT_FAMILIES[bannerProps?.heroFont] || 'inherit',
                      textTransform: (bannerProps?.heroFont === 'display' || bannerProps?.heroFont === 'condensed') ? 'uppercase' : 'none',
                      fontStyle: bannerProps?.heroFont === 'rustic' ? 'italic' : 'normal',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Welcome '{bannerProps?.nickname || 'Farmer'}'
                  </div>
                  {bannerProps?.heroSubtitleMode !== 'off' && (
                    <div 
                      style={{ 
                        marginTop: '4px',
                        fontSize: `calc(10.5px * ${Math.max(0.85, (bannerProps?.heroTextScale || 100) / 100)})`, 
                        color: bannerProps?.heroTextColor || 'rgba(255,255,255,0.88)', 
                        opacity: 0.92,
                        textShadow: (bannerProps?.heroTextShadow !== false) 
                          ? '0 1px 8px rgba(0,0,0,0.95)' 
                          : 'none',
                        lineHeight: 1.35,
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start'
                      }}
                    >
                      {bannerProps?.heroSubtitleMode === 'quote' ? (
                        <>
                          <span style={{ fontStyle: 'italic', display: 'block' }}>“{bannerProps?.quoteText || "Don't judge each day by the harvest you reap, but by the seeds you plant."}”</span>
                          <span style={{ fontSize: '9px', opacity: 0.8, fontWeight: '600', display: 'block', marginTop: '1px' }}>— {bannerProps?.quoteAuthor || 'Robert Louis Stevenson'}</span>
                        </>
                      ) : (
                        <span>Browse, install, and manage your Farming Simulator 25 mods.</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Ratio badge */}
              <div style={{ position: 'absolute', top: '8px', right: '10px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', color: '#ffffff', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.15)' }}>
                {activePreset.label} ({activePreset.sub}) Frame
              </div>
            </div>
          </div>

          {/* Zoom & Positioning Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, marginRight: '16px' }}>
              <button 
                type="button"
                className="btn btn--icon btn--ghost" 
                onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.15))}
                title="Zoom Out"
                style={{ width: '28px', height: '28px', padding: 0 }}
              >
                <ZoomOut size={15} />
              </button>

              <input 
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />

              <button 
                type="button"
                className="btn btn--icon btn--ghost" 
                onClick={() => setZoom((prev) => Math.min(3, prev + 0.15))}
                title="Zoom In"
                style={{ width: '28px', height: '28px', padding: 0 }}
              >
                <ZoomIn size={15} />
              </button>

              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', minWidth: '38px', textAlign: 'right' }}>
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <button 
              type="button"
              className="btn btn--ghost"
              onClick={handleResetPosition}
              style={{ fontSize: '11px', gap: '6px', height: '28px', padding: '0 10px', color: 'var(--text-secondary)' }}
              title="Reset Zoom & Offset back to center"
            >
              <RotateCcw size={13} /> Center
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="modal__footer" style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <button type="button" className="btn btn--ghost" onClick={handleCancel} style={{ fontSize: '12px' }}>
            Cancel
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              type="button" 
              className="btn btn--secondary" 
              onClick={handleUseFull}
              title="Apply the full uncropped photo without cutting any parts off"
              style={{ fontSize: '12px', gap: '6px' }}
            >
              <RotateCcw size={14} /> Use Full Photo (Undo Crop)
            </button>

            <button 
              type="button"
              className="btn btn--primary"
              onClick={handleSaveCrop}
              disabled={isProcessing}
              style={{ minWidth: '150px', gap: '8px', fontSize: '12px', padding: '7px 18px' }}
            >
              {isProcessing ? 'Processing...' : (
                <>
                  <Check size={15} /> Apply Wallpaper
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
