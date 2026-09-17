import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Palette, Image as ImageIcon, Upload, Check, RotateCcw, 
  AlignLeft, AlignCenter, AlignRight, Type, Eye, EyeOff, Sparkles, Sliders, Move,
  Quote, HelpCircle, Shuffle, Calendar, GripHorizontal,
  Folder, FolderSearch, Images, Clock, Trash2, RefreshCw,
  FolderOpen, CheckSquare, Square
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
import ImageCropModal from './ImageCropModal';
import { getQuoteOfTheDay, getQuoteByIndex, FARMING_QUOTES } from '../../utils/dailyQuotes';
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

const SLIDESHOW_INTERVALS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '1 hr', value: 3600 },
];

const thumbCache = new Map();

const fileToDataUrl = (file, maxWidth = 1920, maxHeight = 1080) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result;
      if (!rawUrl) return resolve(null);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

function SlideshowThumbnail({ path: imgPath, onRemove }) {
  const [src, setSrc] = useState(() => {
    if (!imgPath) return null;
    if (imgPath.startsWith('data:')) return imgPath;
    return thumbCache.get(imgPath) || null;
  });

  useEffect(() => {
    if (!imgPath) return;
    if (imgPath.startsWith('data:')) {
      setSrc(imgPath);
      thumbCache.set(imgPath, imgPath);
      return;
    }
    if (thumbCache.has(imgPath)) {
      setSrc(thumbCache.get(imgPath));
      return;
    }
    let isMounted = true;
    if (window.api?.images?.readLocalAsDataUrl) {
      window.api.images.readLocalAsDataUrl(imgPath).then(dataUrl => {
        if (isMounted && dataUrl) {
          thumbCache.set(imgPath, dataUrl);
          setSrc(dataUrl);
        }
      });
    }
    return () => { isMounted = false; };
  }, [imgPath]);

  const filename = imgPath 
    ? (imgPath.startsWith('data:') ? 'Custom Photo' : imgPath.split(/[\\/]/).pop()) 
    : '';

  return (
    <div 
      style={{
        position: 'relative',
        height: '62px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        backgroundImage: src ? `url("${src}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'flex-end',
        userSelect: 'none'
      }}
      title={filename}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)' }} />
      <span style={{ position: 'relative', zIndex: 2, fontSize: '9px', color: '#fff', padding: '3px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: onRemove ? '75%' : '95%' }}>
        {filename}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(imgPath); }}
          style={{
            position: 'absolute',
            top: '3px',
            right: '3px',
            zIndex: 3,
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.85)',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0
          }}
          title="Remove from slideshow"
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}

function PickerPhotoCard({ imgPath, isSelected, onToggle }) {
  const [src, setSrc] = useState(() => {
    if (!imgPath) return null;
    if (imgPath.startsWith('data:')) return imgPath;
    return thumbCache.get(imgPath) || null;
  });

  useEffect(() => {
    if (!imgPath) return;
    if (imgPath.startsWith('data:')) {
      setSrc(imgPath);
      thumbCache.set(imgPath, imgPath);
      return;
    }
    if (thumbCache.has(imgPath)) {
      setSrc(thumbCache.get(imgPath));
      return;
    }
    let isMounted = true;
    if (window.api?.images?.readLocalAsDataUrl) {
      window.api.images.readLocalAsDataUrl(imgPath, { thumbnail: true, width: 280 }).then(dataUrl => {
        if (isMounted && dataUrl) {
          thumbCache.set(imgPath, dataUrl);
          setSrc(dataUrl);
        }
      });
    }
    return () => { isMounted = false; };
  }, [imgPath]);

  const filename = imgPath 
    ? (imgPath.startsWith('data:') ? 'Custom Photo' : imgPath.split(/[\\/]/).pop()) 
    : '';

  return (
    <div
      onClick={onToggle}
      style={{
        position: 'relative',
        height: '110px',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected ? '0 0 0 2px var(--accent-dim), 0 4px 14px rgba(0,0,0,0.5)' : 'none',
        transform: isSelected ? 'scale(0.98)' : 'scale(1)',
        transition: 'all 0.15s ease',
        backgroundImage: src ? `url("${src}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: 'var(--bg-tertiary)',
        userSelect: 'none'
      }}
      title={filename}
    >
      {/* Checkmark circle badge in top-right */}
      <div
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: isSelected ? 'var(--accent)' : 'rgba(0, 0, 0, 0.65)',
          border: isSelected ? 'none' : '1.5px solid rgba(255, 255, 255, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          transition: 'all 0.15s ease',
          zIndex: 2
        }}
      >
        {isSelected && <Check size={14} strokeWidth={3} />}
      </div>

      {/* Semi-transparent tint when selected */}
      {isSelected && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.2)', pointerEvents: 'none' }} />
      )}

      {/* Bottom Filename Ribbon */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 6px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', pointerEvents: 'none' }}>
        <span style={{ fontSize: '10px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {filename}
        </span>
      </div>
    </div>
  );
}

export default function HeroCustomizerModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('background'); // 'background' | 'typography' | 'visibility'
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [originalImageSrc, setOriginalImageSrc] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef(null);
  const multipleFileInputRef = useRef(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [pickerFolder, setPickerFolder] = useState('');
  const [pickerImages, setPickerImages] = useState([]);
  const [selectedPickerPaths, setSelectedPickerPaths] = useState(new Set());
  const [isScanningPickerFolder, setIsScanningPickerFolder] = useState(false);
  const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
  const toast = useToastStore();

  const modalRef = useRef(null);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [modalHeight, setModalHeight] = useState(null);
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);

  const dragModalRef = useRef({ startX: 0, startY: 0, initX: 0, initY: 0 });
  const resizeRef = useRef({ startY: 0, initHeight: 560 });

  useEffect(() => {
    if (isOpen) {
      setModalPos({ x: 0, y: 0 });
      const main = document.querySelector('.main-content');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isOpen]);

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = modalPos.x;
    const initY = modalPos.y;

    setIsDraggingModal(true);

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxDx = window.innerWidth * 0.46;
      const minDx = -window.innerWidth * 0.46;
      const minDy = -window.innerHeight * 0.42;
      const maxDy = window.innerHeight * 0.45;

      setModalPos({
        x: Math.max(minDx, Math.min(maxDx, initX + dx)),
        y: Math.max(minDy, Math.min(maxDy, initY + dy))
      });
    };

    const onMouseUp = () => {
      setIsDraggingModal(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTopResizeMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    
    const startY = e.clientY;
    const initHeight = modalRef.current ? modalRef.current.getBoundingClientRect().height : 560;

    setIsResizingHeight(true);

    const onMouseMove = (moveEvent) => {
      const dy = startY - moveEvent.clientY;
      const minH = 340;
      const maxH = window.innerHeight * 0.85;
      const newHeight = Math.max(minH, Math.min(maxH, initHeight + dy));
      setModalHeight(newHeight);
    };

    const onMouseUp = () => {
      setIsResizingHeight(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetModalPos = () => {
    setModalPos({ x: 0, y: 0 });
    setModalHeight(null);
  };

  const {
    nickname,
    homeShowHero, setHomeShowHero,
    heroBgType, heroCustomBg, heroCustomOriginalBg, heroDimmer, heroAlignment,
    heroTextPosX, heroTextPosY,
    heroFont, heroTextSize, heroTextScale, heroTextColor, heroTextShadow,
    heroShowText, heroShowSubtitle, heroSubtitleMode, heroQuoteIndex,
    heroSlideshowSource, heroSlideshowFolder, heroSlideshowImages, heroSlideshowInterval, heroSlideshowShuffle,
    setHeroSlideshowFolder, setHeroSlideshowImages, addHeroSlideshowImages, removeHeroSlideshowImage,
    updateHeroBannerSettings, resetHeroBannerSettings, setCustomHeroBanner, revertHeroBannerCrop
  } = useSettingsStore();

  const [folderImageCount, setFolderImageCount] = useState(0);
  const [folderPreviews, setFolderPreviews] = useState([]);
  const [isScanningFolder, setIsScanningFolder] = useState(false);

  // Scan folder for images whenever heroSlideshowFolder changes
  const scanSlideshowFolder = async (folderPath) => {
    const target = folderPath || heroSlideshowFolder;
    if (!target || !window.api?.images?.scanFolder) {
      setFolderImageCount(0);
      setFolderPreviews([]);
      return;
    }
    setIsScanningFolder(true);
    try {
      const files = await window.api.images.scanFolder(target);
      const list = files || [];
      setFolderImageCount(list.length);
      
      const previewFiles = list.slice(0, 6);
      const loadedPreviews = [];
      for (const f of previewFiles) {
        if (window.api?.images?.readLocalAsDataUrl) {
          const dataUrl = await window.api.images.readLocalAsDataUrl(f);
          if (dataUrl) loadedPreviews.push({ path: f, dataUrl });
        }
      }
      setFolderPreviews(loadedPreviews);
    } catch (e) {
      console.warn('Failed to scan folder:', e);
    } finally {
      setIsScanningFolder(false);
    }
  };

  useEffect(() => {
    if (heroSlideshowFolder) {
      scanSlideshowFolder(heroSlideshowFolder);
    }
  }, [heroSlideshowFolder]);

  const handleDetectFsScreenshots = async () => {
    if (!window.api?.images?.getFsScreenshotsPath) return;
    try {
      const detected = await window.api.images.getFsScreenshotsPath();
      if (detected) {
        await setHeroSlideshowFolder(detected);
        await scanSlideshowFolder(detected);
        toast.success('Found FS25 Screenshots folder!');
      } else {
        toast.info('Could not automatically detect FS25 screenshots. Please browse to your folder.');
      }
    } catch (err) {
      toast.error('Error detecting folder: ' + err.message);
    }
  };

  const handlePickSlideshowFolder = async () => {
    if (!window.api?.dialog?.selectFolder) return;
    try {
      const folder = await window.api.dialog.selectFolder();
      if (folder) {
        await setHeroSlideshowFolder(folder);
        await scanSlideshowFolder(folder);
        toast.success('Folder selected for slideshow!');
      }
    } catch (err) {
      toast.error('Error selecting folder: ' + err.message);
    }
  };

  const handleOpenPhotoPicker = async () => {
    let folder = pickerFolder || heroSlideshowFolder;
    if (!folder && window.api?.images?.getFsScreenshotsPath) {
      folder = await window.api.images.getFsScreenshotsPath();
    }

    if (!folder) {
      if (window.api?.dialog?.selectFolderOrImage) {
        folder = await window.api.dialog.selectFolderOrImage();
      } else if (window.api?.dialog?.selectFolder) {
        folder = await window.api.dialog.selectFolder({
          title: 'Select Folder Containing Photos',
          buttonLabel: 'Select Folder'
        });
      }
    }

    if (!folder) {
      toast.info('Please select a folder containing photos.');
      return;
    }

    await loadFolderIntoPicker(folder);
  };

  const loadFolderIntoPicker = async (folder) => {
    setIsScanningPickerFolder(true);
    setPickerFolder(folder);
    setShowPhotoPicker(true);
    try {
      if (window.api?.images?.scanFolder) {
        const found = await window.api.images.scanFolder(folder);
        setPickerImages(found || []);
        setSelectedPickerPaths(new Set());
      }
    } catch (err) {
      toast.error('Failed to load photos: ' + err.message);
    } finally {
      setIsScanningPickerFolder(false);
    }
  };

  const handleChangePickerFolder = async () => {
    try {
      let newFolder = null;
      if (window.api?.dialog?.selectFolderOrImage) {
        newFolder = await window.api.dialog.selectFolderOrImage();
      } else if (window.api?.dialog?.selectFolder) {
        newFolder = await window.api.dialog.selectFolder({
          title: 'Select Folder Containing Photos',
          buttonLabel: 'Select Folder'
        });
      }
      if (newFolder) {
        await loadFolderIntoPicker(newFolder);
      }
    } catch (err) {
      toast.error('Failed to switch folder: ' + err.message);
    }
  };

  const togglePickerPath = (path) => {
    setSelectedPickerPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSelectAllPicker = () => {
    setSelectedPickerPaths(new Set(pickerImages));
  };

  const handleClearPickerSelection = () => {
    setSelectedPickerPaths(new Set());
  };

  const handleConfirmPickerSelection = async () => {
    const chosen = Array.from(selectedPickerPaths);
    if (chosen.length === 0) return;
    
    await addHeroSlideshowImages(chosen);
    toast.success(`Added ${chosen.length} photo${chosen.length > 1 ? 's' : ''} to slideshow!`);
    setShowPhotoPicker(false);
    setSelectedPickerPaths(new Set());
  };

  const handleAddHandpickedImages = () => {
    if (multipleFileInputRef.current) {
      multipleFileInputRef.current.value = '';
      multipleFileInputRef.current.click();
    }
  };

  const handleMultipleFileInputChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    toast.info(`Adding ${files.length} photo${files.length > 1 ? 's' : ''}...`);

    const newItems = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        if (dataUrl) {
          newItems.push(dataUrl);
          thumbCache.set(dataUrl, dataUrl);
        }
      } catch (err) {
        console.warn('Failed to process image:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      await addHeroSlideshowImages(newItems);
      toast.success(`Added ${newItems.length} photo${newItems.length > 1 ? 's' : ''} to slideshow!`);
    }
    e.target.value = '';
  };



  const handleDropPhotos = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverGallery(false);

    const files = Array.from(e.dataTransfer.files || []).filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f.name));
    if (files.length === 0) return;

    toast.info(`Adding ${files.length} dropped photo${files.length > 1 ? 's' : ''}...`);
    const newItems = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        if (dataUrl) {
          newItems.push(dataUrl);
          thumbCache.set(dataUrl, dataUrl);
        }
      } catch (err) {
        console.warn('Failed to process dropped image:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      await addHeroSlideshowImages(newItems);
      toast.success(`Added ${newItems.length} photo${newItems.length > 1 ? 's' : ''} to slideshow!`);
    }
  };

  const activeSubtitleMode = heroSubtitleMode || (heroShowSubtitle === false ? 'off' : 'quote');
  const currentQuote = (typeof heroQuoteIndex === 'number' && !isNaN(heroQuoteIndex))
    ? getQuoteByIndex(heroQuoteIndex)
    : getQuoteOfTheDay();

  const handleSelectPreset = (type) => {
    updateHeroBannerSettings({ heroBgType: type });
  };

  const handlePickFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setOriginalImageSrc(dataUrl);
        setCropImageSrc(dataUrl);
        setShowCropper(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCropped = async (croppedDataUrl, targetSize) => {
    try {
      if (targetSize && targetSize !== 'full') {
        await updateHeroBannerSettings({ heroTextSize: targetSize });
      }
      await setCustomHeroBanner(croppedDataUrl, originalImageSrc);
      setShowCropper(false);
      toast.success('Custom banner wallpaper & height applied!');
    } catch (err) {
      console.error('Failed to apply cropped banner:', err);
      toast.error('Failed to save cropped image: ' + err.message);
    }
  };

  const handleUseFullPhoto = async (targetSize) => {
    try {
      if (targetSize && targetSize !== 'full') {
        await updateHeroBannerSettings({ heroTextSize: targetSize });
      }
      const fullSrc = originalImageSrc || heroCustomOriginalBg || cropImageSrc;
      await setCustomHeroBanner(fullSrc, fullSrc);
      setShowCropper(false);
      toast.success('Cropping undone — applied full uncropped photo!');
    } catch (err) {
      console.error('Failed to apply full photo:', err);
      toast.error('Failed to apply photo: ' + err.message);
    }
  };

  const handleRecrop = async () => {
    let src = heroCustomOriginalBg;
    if (!src && window.api?.images?.getHeroBannerOriginal) {
      try {
        const diskOrig = await window.api.images.getHeroBannerOriginal();
        if (diskOrig) src = diskOrig;
      } catch (e) {
        console.warn('Failed to read original hero banner from disk for recrop:', e);
      }
    }
    if (!src) {
      src = heroCustomBg;
      if ((!src || src === 'custom_hero_banner.jpg') && window.api?.images?.getHeroBanner) {
        try {
          const disk = await window.api.images.getHeroBanner();
          if (disk) src = disk;
        } catch (e) {
          console.warn('Failed to read hero banner from disk for recrop:', e);
        }
      }
    }
    if (src) {
      setOriginalImageSrc(src);
      setCropImageSrc(src);
      setShowCropper(true);
    } else {
      handlePickFile();
    }
  };

  const handleUndoCrop = async () => {
    const success = await revertHeroBannerCrop();
    if (success) {
      toast.success('Cropping undone — restored original photo!');
    } else {
      toast.info('No original uncropped photo found to restore.');
    }
  };

  const handleReset = async () => {
    await resetHeroBannerSettings();
    toast.info('Hero banner reset to default');
  };

  const presets = [
    { id: 'default', name: 'Default Glow', preview: null, isDefault: true },
    { id: 'slideshow', name: 'Slideshow', preview: null, isSlideshow: true },
    { id: 'riverbend', name: 'Riverbend (US)', preview: mapUs },
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
          zIndex: 1500, 
          alignItems: 'flex-end', 
          justifyContent: 'center', 
          paddingBottom: '16px',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.15) 35%, transparent 55%)',
          backdropFilter: 'none',
          pointerEvents: 'none'
        }}
      >
        <div 
          ref={modalRef}
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{ 
            position: 'relative',
            left: `${modalPos.x}px`,
            top: `${modalPos.y}px`,
            pointerEvents: 'auto',
            width: '94%',
            maxWidth: '920px', 
            height: modalHeight ? `${modalHeight}px` : '62vh',
            minHeight: '360px',
            maxHeight: '85vh', 
            display: 'flex', 
            flexDirection: 'column',
            boxShadow: isDraggingModal 
              ? '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 2px var(--accent)' 
              : '0 -8px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--border)',
            transition: (isDraggingModal || isResizingHeight) ? 'none' : 'box-shadow 0.2s ease',
            userSelect: (isDraggingModal || isResizingHeight) ? 'none' : 'auto'
          }}
        >
          {/* Top Edge Resize Bar */}
          <div
            onMouseDown={handleTopResizeMouseDown}
            style={{
              position: 'absolute',
              top: '-12px',
              left: '0',
              right: '0',
              height: '18px',
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20
            }}
            title="Drag up or down to adjust studio height"
          >
            <div style={{
              width: '56px',
              height: '5px',
              borderRadius: '3px',
              background: isResizingHeight ? 'var(--accent)' : 'rgba(255, 255, 255, 0.35)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
              transition: 'background 0.15s ease'
            }} />
          </div>

          {/* Modal Header */}
          <div 
            className="modal__header" 
            onMouseDown={handleHeaderMouseDown}
            onDoubleClick={handleResetModalPos}
            style={{ 
              padding: '12px 18px', 
              borderBottom: '1px solid var(--border)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: isDraggingModal ? 'grabbing' : 'grab',
              userSelect: 'none'
            }}
            title="Click and drag to move studio anywhere • Double-click to reset position"
          >
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

            {/* Central Drag Grip Badge */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 12px',
                borderRadius: '8px',
                background: isDraggingModal ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                border: isDraggingModal ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: isDraggingModal ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                pointerEvents: 'none',
                transition: 'all 0.15s ease'
              }}
              title="Click and drag to move modal anywhere on screen"
            >
              <GripHorizontal size={14} />
              <span>Drag to move modal</span>
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
          <div className="modal__body" style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* ══ TAB 1: BACKGROUND ══ */}
            {activeTab === 'background' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                    Choose Wallpaper Preset
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
                    {presets.map((p) => {
                      const isSelected = heroBgType === p.id;
                      if (p.isSlideshow) {
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleSelectPreset('slideshow')}
                            style={{
                              height: '68px',
                              borderRadius: '10px',
                              border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                              cursor: 'pointer',
                              position: 'relative',
                              overflow: 'hidden',
                              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%), var(--bg-tertiary)',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 0 14px rgba(var(--accent-rgb, 59, 130, 246), 0.3)' : 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            <Images size={20} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }} />
                            <span style={{ fontSize: '10px', fontWeight: '700', color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                              Slideshow
                            </span>
                            {isSelected && (
                              <div style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={10} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        );
                      }
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

                {/* Custom Photo Controls */}
                {heroBgType === 'custom' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      type="button"
                      className="btn btn--secondary" 
                      onClick={handlePickFile}
                      style={{ flex: 1, minWidth: '140px', gap: '6px', justifyContent: 'center', padding: '8px 12px', fontSize: '12px' }}
                    >
                      <Upload size={14} /> Choose Image...
                    </button>
                    {heroCustomBg && (
                      <button 
                        type="button"
                        className="btn btn--secondary" 
                        onClick={handleRecrop}
                        style={{ flex: 1, minWidth: '140px', gap: '6px', justifyContent: 'center', padding: '8px 12px', fontSize: '12px' }}
                        title="Adjust framing, zoom and positioning of your custom wallpaper"
                      >
                        <Move size={14} /> Reposition & Crop
                      </button>
                    )}
                    {heroCustomBg && (
                      <button 
                        type="button"
                        className="btn btn--secondary" 
                        onClick={handleUndoCrop}
                        style={{ flex: 1, minWidth: '140px', gap: '6px', justifyContent: 'center', padding: '8px 12px', fontSize: '12px' }}
                        title="Restore full uncropped original photo"
                      >
                        <RotateCcw size={14} /> Undo Crop (Original)
                      </button>
                    )}
                  </div>
                )}

                {/* ── Slideshow Controls Panel ── */}
                {heroBgType === 'slideshow' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-tertiary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    {/* Header & Source Mode Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Images size={15} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Slideshow Source</span>
                      </div>
                      
                      <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => updateHeroBannerSettings({ heroSlideshowSource: 'folder' })}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            background: (heroSlideshowSource || 'folder') === 'folder' ? 'var(--accent)' : 'transparent',
                            color: (heroSlideshowSource || 'folder') === 'folder' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Folder size={12} /> Entire Folder
                        </button>
                        <button
                          type="button"
                          onClick={() => updateHeroBannerSettings({ heroSlideshowSource: 'selection' })}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            background: heroSlideshowSource === 'selection' ? 'var(--accent)' : 'transparent',
                            color: heroSlideshowSource === 'selection' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Images size={12} /> Handpicked Photos ({heroSlideshowImages?.length || 0})
                        </button>
                      </div>
                    </div>

                    {/* Mode A: Folder Selection */}
                    {(heroSlideshowSource || 'folder') === 'folder' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={handleDetectFsScreenshots}
                            style={{ flex: 1, minWidth: '180px', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
                            title="Automatically detect Documents\My Games\FarmingSimulator2025\screenshots"
                          >
                            <Sparkles size={14} style={{ color: 'var(--accent)' }} /> Auto-Detect FS25 Screenshots
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={handlePickSlideshowFolder}
                            style={{ flex: 1, minWidth: '150px', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
                          >
                            <Folder size={14} /> Browse Folder...
                          </button>
                        </div>

                        {heroSlideshowFolder ? (
                          <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {heroSlideshowFolder}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: '6px' }}>
                                  {folderImageCount} photos found
                                </span>
                                <button
                                  type="button"
                                  className="btn btn--icon btn--ghost"
                                  onClick={() => scanSlideshowFolder(heroSlideshowFolder)}
                                  title="Re-scan folder for new photos"
                                  style={{ width: '24px', height: '24px', padding: 0 }}
                                >
                                  <RefreshCw size={12} className={isScanningFolder ? 'animate-spin' : ''} />
                                </button>
                              </div>
                            </div>

                            {/* Thumbnail strip of first several photos */}
                            {folderPreviews.length > 0 && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginTop: '2px' }}>
                                {folderPreviews.map((p, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      height: '52px',
                                      borderRadius: '6px',
                                      overflow: 'hidden',
                                      background: `url(${p.dataUrl}) center/cover no-repeat`,
                                      border: '1px solid var(--border)'
                                    }}
                                    title={p.path}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                            No folder selected yet. Click <strong>Auto-Detect FS25 Screenshots</strong> or <strong>Browse Folder</strong> to select your screenshot library.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode B: Handpicked Selection */}
                    {heroSlideshowSource === 'selection' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={handleOpenPhotoPicker}
                            style={{ gap: '6px', fontSize: '12px', padding: '8px 16px' }}
                            title="Open in-app gallery to pick photos with mouse and click OK"
                          >
                            <FolderOpen size={14} /> Select Photos from Folder...
                          </button>
                          
                          {heroSlideshowImages && heroSlideshowImages.length > 0 && (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => setHeroSlideshowImages([])}
                              style={{ fontSize: '11px', color: 'var(--danger)', gap: '4px' }}
                            >
                              <Trash2 size={12} /> Clear All ({heroSlideshowImages.length})
                            </button>
                          )}
                        </div>

                        {/* Handpicked Photos Gallery / Drop Zone */}
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingOverGallery(true); }}
                          onDragLeave={() => setIsDraggingOverGallery(false)}
                          onDrop={handleDropPhotos}
                          style={{
                            borderRadius: '8px',
                            border: isDraggingOverGallery ? '2px dashed var(--accent)' : '1px solid transparent',
                            background: isDraggingOverGallery ? 'var(--accent-dim)' : 'transparent',
                            transition: 'all 0.15s ease',
                            padding: '2px'
                          }}
                        >
                          {heroSlideshowImages && heroSlideshowImages.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '4px 0' }}>
                              {heroSlideshowImages.map((p, idx) => (
                                <SlideshowThumbnail
                                  key={`${p}-${idx}`}
                                  path={p}
                                  onRemove={removeHeroSlideshowImage}
                                />
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '18px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>No handpicked photos yet</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                Click <strong>Pick from Folder with OK Button</strong> to check off photos visually, or drag & drop image files directly here.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Shared Rotation & Interval Settings */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '2px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>Cycle Every:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {SLIDESHOW_INTERVALS.map((intv) => {
                            const isAct = (heroSlideshowInterval || 30) === intv.value;
                            return (
                              <button
                                key={intv.value}
                                type="button"
                                onClick={() => updateHeroBannerSettings({ heroSlideshowInterval: intv.value })}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: isAct ? '1px solid var(--accent)' : '1px solid var(--border)',
                                  background: isAct ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                                  color: isAct ? 'var(--accent)' : 'var(--text-secondary)',
                                  fontSize: '11px',
                                  fontWeight: isAct ? '700' : '500',
                                  cursor: 'pointer'
                                }}
                              >
                                {intv.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Shuffle Toggle */}
                      <button
                        type="button"
                        onClick={() => updateHeroBannerSettings({ heroSlideshowShuffle: heroSlideshowShuffle === false ? true : false })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: heroSlideshowShuffle !== false ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                          color: heroSlideshowShuffle !== false ? 'var(--accent)' : 'var(--text-tertiary)',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Shuffle size={12} />
                        <span>Shuffle: {heroSlideshowShuffle !== false ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  </div>
                )}

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
              {/* Text Placement & Alignment */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    Text Placement & Alignment
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '700', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: '6px' }}>
                    X: {Math.round(heroTextPosX ?? 10)}% • Y: {Math.round(heroTextPosY ?? 50)}%
                  </span>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px dashed rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  <Move size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span>
                    <strong>Free-form move:</strong> Click and drag the welcome greeting directly on the banner above to place it anywhere!
                  </span>
                </div>
              </div>

              {/* Text Size & Scale */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Type size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Text Size & Scale</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '1px 8px', borderRadius: '6px' }}>
                    {heroTextScale || 100}%
                  </span>
                </div>
                <input 
                  type="range"
                  min="75"
                  max="150"
                  step="5"
                  value={heroTextScale || 100}
                  onChange={(e) => updateHeroBannerSettings({ heroTextScale: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: '8px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {[
                    { label: 'Compact', scale: 85 },
                    { label: 'Standard', scale: 100 },
                    { label: 'Large', scale: 120 },
                    { label: 'Cinematic', scale: 140 },
                  ].map((s) => {
                    const isSelected = (heroTextScale || 100) === s.scale;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => updateHeroBannerSettings({ heroTextScale: s.scale })}
                        style={{
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontSize: '11px',
                          fontWeight: isSelected ? '700' : '500',
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
                    { id: 'slab', name: 'Western Slab', preview: 'Machinery' },
                    { id: 'condensed', name: 'Tall Poster', preview: 'Impact' },
                    { id: 'handwriting', name: 'Farm Script', preview: 'Cursive' },
                    { id: 'elegant', name: 'Editorial', preview: 'Baskerville' },
                    { id: 'tech', name: 'Industrial', preview: 'Mono' },
                  ].map((f) => {
                    const isSelected = (heroFont || 'modern') === f.id;
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

              {/* Subtitle / Tagline Options */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>Banner Subtitle / Tagline</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Choose what appears beneath your farmer greeting</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: activeSubtitleMode === 'quote' ? '10px' : '0' }}>
                  {[
                    { id: 'quote', label: 'Quote of the Day', icon: Quote, sub: 'Daily inspiring & farming quotes' },
                    { id: 'helper', label: 'Help Guide', icon: HelpCircle, sub: 'App navigation and mod tips' },
                    { id: 'off', label: 'Hidden / Off', icon: EyeOff, sub: 'Clean minimalist look' },
                  ].map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = activeSubtitleMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          updateHeroBannerSettings({
                            heroSubtitleMode: mode.id,
                            heroShowSubtitle: mode.id !== 'off'
                          });
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', marginBottom: '2px' }}>
                          <Icon size={14} style={{ color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }} />
                          <span style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {mode.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
                          {mode.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quote details & shuffle controls when 'quote' mode is active */}
                {activeSubtitleMode === 'quote' && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--accent)' }}>
                        <Sparkles size={13} />
                        <span>{typeof heroQuoteIndex === 'number' && !isNaN(heroQuoteIndex) ? "Shuffled Quote" : "Today's Featured Quote"}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {typeof heroQuoteIndex === 'number' && !isNaN(heroQuoteIndex) && (
                          <button
                            type="button"
                            onClick={() => updateHeroBannerSettings({ heroQuoteIndex: null })}
                            title="Reset to today's scheduled quote"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              fontSize: '10px',
                              fontWeight: '600',
                              borderRadius: '4px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer'
                            }}
                          >
                            <Calendar size={11} />
                            <span>Today</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const currentIdx = (typeof heroQuoteIndex === 'number' && !isNaN(heroQuoteIndex))
                              ? heroQuoteIndex
                              : getQuoteOfTheDay().index;
                            const nextIdx = (currentIdx + 1) % FARMING_QUOTES.length;
                            updateHeroBannerSettings({ heroQuoteIndex: nextIdx });
                          }}
                          title="Preview another quote"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            fontSize: '10px',
                            fontWeight: '600',
                            borderRadius: '4px',
                            border: '1px solid var(--accent)',
                            background: 'var(--accent-dim)',
                            color: 'var(--accent)',
                            cursor: 'pointer'
                          }}
                        >
                          <Shuffle size={11} />
                          <span>Shuffle</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      “{currentQuote?.quote || getQuoteOfTheDay().quote}”
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                      — {currentQuote?.author || getQuoteOfTheDay().author}
                    </div>
                  </div>
                )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="btn btn--ghost"
              onClick={handleReset}
              style={{ gap: '6px', fontSize: '12px', color: 'var(--text-tertiary)', padding: '6px 12px' }}
            >
              <RotateCcw size={14} /> Reset to Defaults
            </button>

            {(modalPos.x !== 0 || modalPos.y !== 0 || modalHeight !== null) && (
              <button 
                type="button"
                className="btn btn--ghost"
                onClick={handleResetModalPos}
                style={{ fontSize: '11px', color: 'var(--accent)', padding: '4px 8px' }}
                title="Reset window position and size back to dock"
              >
                Reset Position
              </button>
            )}
          </div>
          
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

    {/* Hidden File Input for browser/file selection */}
    <input 
      type="file" 
      ref={fileInputRef} 
      accept="image/*,.jpg,.jpeg,.png,.webp,.bmp" 
      onChange={handleFileInputChange} 
      style={{ display: 'none' }} 
    />

    {/* Hidden Multi-File Input for slideshow handpicked selection */}
    <input 
      type="file" 
      ref={multipleFileInputRef} 
      multiple
      accept="image/*,.jpg,.jpeg,.png,.webp,.bmp" 
      onChange={handleMultipleFileInputChange} 
      style={{ display: 'none' }} 
    />



    {/* In-App Visual Photo Picker Modal (Select multiple photos with mouse clicks, no Ctrl/Shift, doesn't close on click, OK button) */}
    {showPhotoPicker && (
      <div 
        className="modal-overlay" 
        style={{ 
          zIndex: 2200, 
          background: 'rgba(0, 0, 0, 0.85)', 
          backdropFilter: 'blur(10px)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}
        onClick={() => setShowPhotoPicker(false)}
      >
        <div 
          className="modal" 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            width: '94%', 
            maxWidth: '920px', 
            height: '82vh', 
            maxHeight: '720px', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: 0, 
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 0 1px var(--border)'
          }}
        >
          {/* Header */}
          <div className="modal__header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <Images size={16} style={{ color: 'var(--accent)' }} />
                Select Photos for Slideshow
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Click photos to select or unselect with your mouse — no Ctrl or Shift needed! When done, click <strong>OK</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                type="button" 
                className="btn btn--secondary" 
                onClick={handleSelectAllPicker}
                disabled={pickerImages.length === 0}
                style={{ fontSize: '11px', padding: '5px 12px', gap: '5px' }}
              >
                <CheckSquare size={13} /> Select All ({pickerImages.length})
              </button>
              <button 
                type="button" 
                className="btn btn--ghost" 
                onClick={handleClearPickerSelection}
                disabled={selectedPickerPaths.size === 0}
                style={{ fontSize: '11px', padding: '5px 10px', gap: '5px' }}
              >
                <Square size={13} /> Clear
              </button>
              <button 
                type="button" 
                className="btn btn--icon btn--ghost" 
                onClick={() => setShowPhotoPicker(false)}
                style={{ width: '28px', height: '28px' }}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Folder Location Bar */}
          <div style={{ padding: '8px 20px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pickerFolder || 'No folder selected'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleChangePickerFolder}
              style={{ fontSize: '11px', padding: '4px 10px', gap: '5px', flexShrink: 0 }}
            >
              <FolderOpen size={12} /> Change Folder...
            </button>
          </div>

          {/* Photo Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'var(--bg-primary)' }}>
            {isScanningPickerFolder ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', gap: '10px', color: 'var(--text-secondary)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '12px' }}>Loading photos from folder...</span>
              </div>
            ) : pickerImages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', gap: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <Images size={36} style={{ opacity: 0.4 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>No images found in this folder</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Supported formats: .jpg, .jpeg, .png, .webp, .bmp</div>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleChangePickerFolder}
                  style={{ fontSize: '12px', gap: '6px' }}
                >
                  <FolderOpen size={14} /> Browse a Different Folder...
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                {pickerImages.map((imgPath) => (
                  <PickerPhotoCard
                    key={imgPath}
                    imgPath={imgPath}
                    isSelected={selectedPickerPaths.has(imgPath)}
                    onToggle={() => togglePickerPath(imgPath)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer with OK button */}
          <div className="modal__footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: selectedPickerPaths.size > 0 ? 'var(--accent)' : 'var(--text-primary)', fontSize: '13px' }}>
                {selectedPickerPaths.size}
              </strong> of {pickerImages.length} photos selected
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn--ghost" 
                onClick={() => setShowPhotoPicker(false)}
                style={{ padding: '7px 16px', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn--primary" 
                disabled={selectedPickerPaths.size === 0}
                onClick={handleConfirmPickerSelection}
                style={{ padding: '7px 24px', fontSize: '13px', fontWeight: '700', gap: '6px' }}
              >
                <Check size={15} strokeWidth={2.5} /> OK — Add Selected ({selectedPickerPaths.size})
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Interactive Crop & Position Modal */}
    <ImageCropModal 
      isOpen={showCropper} 
      imageSrc={cropImageSrc} 
      originalSrc={originalImageSrc || heroCustomOriginalBg}
      heroTextSize={heroTextSize || 'standard'}
      bannerProps={{
        nickname: nickname || 'Farmer',
        heroFont: heroFont || 'modern',
        heroTextScale: heroTextScale || 100,
        heroTextColor: heroTextColor || '#ffffff',
        heroTextShadow: heroTextShadow !== false,
        heroTextPosX: heroTextPosX ?? 10,
        heroTextPosY: heroTextPosY ?? 50,
        heroSubtitleMode: activeSubtitleMode,
        quoteText: currentQuote?.quote,
        quoteAuthor: currentQuote?.author,
        heroShowText: heroShowText !== false
      }}
      onClose={() => setShowCropper(false)} 
      onApply={handleApplyCropped} 
      onUseFullPhoto={handleUseFullPhoto}
      onSizePreviewChange={(newSize) => updateHeroBannerSettings({ heroTextSize: newSize })}
    />
  </>
  );
}
