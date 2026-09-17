import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Move, Check, RotateCcw, Image as ImageIcon } from 'lucide-react';

const ASPECT_RATIOS = [
  { id: '2.5', label: '2.5:1 Banner', ratioValue: 2.5, width: 1600, height: 640, desc: 'Taller balanced banner — ideal for machinery & landscapes' },
  { id: '2.33', label: '21:9 Ultrawide', ratioValue: 21 / 9, width: 1680, height: 720, desc: 'Cinematic widescreen framing' },
  { id: '1.78', label: '16:9 Full Photo', ratioValue: 16 / 9, width: 1600, height: 900, desc: 'Maximum height — captures full screenshot' },
  { id: '3.0', label: '3:1 Wide Ribbon', ratioValue: 3.0, width: 1600, height: 533, desc: 'Slim horizontal ribbon' }
];

export default function ImageCropModal({ isOpen, imageSrc, onClose, onApply }) {
  if (!isOpen || !imageSrc) return null;

  const [ratioId, setRatioId] = useState('2.5');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 600, height: 240 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  const activeRatio = ASPECT_RATIOS.find((r) => r.id === ratioId) || ASPECT_RATIOS[0];

  // Initialize image dimensions and center it
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      // Reset zoom & offset
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
  }, [isOpen, ratioId]);

  // Compute base dimensions for "cover" fit
  const displayWidth = containerSize.width || 600;
  const displayHeight = containerSize.height || 240;

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
      const targetWidth = activeRatio.width;
      const targetHeight = activeRatio.height;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const img = new Image();
      img.onload = () => {
        // Fill background with dark color
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

        // Convert to high-quality JPEG (~150-280KB)
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setIsProcessing(false);
        onApply(croppedDataUrl);
      };
      img.src = imageSrc;
    } catch (err) {
      console.error('Failed to crop image:', err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div 
        className="modal modal--medium animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal__header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Move size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Crop & Position Banner</h2>
              <p style={{ fontSize: '12px', margin: '2px 0 0 0', color: 'var(--text-tertiary)' }}>Drag to reposition the focal point • Zoom or switch aspect ratios</p>
            </div>
          </div>
          <button className="btn btn--icon btn--ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal__body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Aspect Ratio Selector Pills */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Crop Aspect Ratio</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{activeRatio.desc}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {ASPECT_RATIOS.map((r) => {
                const isSelected = ratioId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRatioId(r.id);
                      setZoom(1);
                      setOffset({ x: 0, y: 0 });
                    }}
                    style={{
                      padding: '8px 6px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isSelected ? '700' : '500',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Crop Viewport Frame */}
          <div 
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{
              width: '100%',
              aspectRatio: `${activeRatio.width} / ${activeRatio.height}`,
              maxHeight: '340px',
              borderRadius: '14px',
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
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.15)', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.15)', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.15)', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.15)', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.15)' }} />
            </div>

            {/* Subtle Greeting Mockup Overlay to test positioning */}
            <div style={{ position: 'absolute', bottom: '16px', left: '18px', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                Welcome 'Farmer'
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                Sample positioning preview
              </div>
            </div>

            {/* Focal Point Indicator */}
            <div style={{ position: 'absolute', top: '10px', right: '12px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', padding: '3px 8px', borderRadius: '8px', fontSize: '10px', color: '#ffffff', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.15)' }}>
              {activeRatio.label.split(' ')[0]} Frame
            </div>
          </div>

          {/* Zoom & Positioning Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, marginRight: '20px' }}>
              <button 
                className="btn btn--icon btn--ghost" 
                onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.15))}
                title="Zoom Out"
                style={{ width: '30px', height: '30px', padding: 0 }}
              >
                <ZoomOut size={16} />
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
                className="btn btn--icon btn--ghost" 
                onClick={() => setZoom((prev) => Math.min(3, prev + 0.15))}
                title="Zoom In"
                style={{ width: '30px', height: '30px', padding: 0 }}
              >
                <ZoomIn size={16} />
              </button>

              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', minWidth: '40px', textAlign: 'right' }}>
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <button 
              className="btn btn--ghost"
              onClick={handleResetPosition}
              style={{ fontSize: '12px', gap: '6px', height: '32px', padding: '0 10px', color: 'var(--text-secondary)' }}
              title="Reset Zoom & Offset"
            >
              <RotateCcw size={14} /> Center
            </button>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            💡 Tip: Click and drag the image inside the frame to center your favorite tractor or landscape.
          </div>
        </div>

        {/* Footer */}
        <div className="modal__footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          
          <button 
            className="btn btn--primary"
            onClick={handleSaveCrop}
            disabled={isProcessing}
            style={{ minWidth: '150px', gap: '8px' }}
          >
            {isProcessing ? 'Processing...' : (
              <>
                <Check size={16} /> Apply Wallpaper
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
