import React, { useState, useEffect, useRef } from 'react';
import { 
  X, ChevronRight, ChevronLeft, Rocket, Database, Settings, 
  ShieldCheck, Heart, Layout, LayoutGrid, Zap, Home, Globe, HardDrive, 
  Save, EyeOff, Map, MousePointer2, MessageCircle, Share2, Folders, Sliders, Layers,
  AlertTriangle, Pin, Palette, MousePointer, List, ShieldAlert, ArrowRightLeft, Download, Radio,
  SlidersHorizontal, Lock, Scale, Image, History, Users, Key
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

const SLIDES = [
  {
    title: "MT Mod Manager v1.2.3",
    description: "Welcome to v1.2.3! This update brings Multiplayer Server Save Management & Protected Exports, 1-Click Keybind Conflict Auto-Resolution, Fleet Maintenance & Teleportation tools, a Loading Screen Customizer, Multi-Drive Mod Migration, and Side-by-Side Mod Comparison!",
    icon: <Rocket className="w-12 h-12 text-accent" />,
    color: "var(--accent)"
  },
  {
    title: "Drag & Drop Anywhere",
    description: "Install mods or import savegames in seconds! Drag single mods, entire collections, or Savegame .zip archives and drop them anywhere into the app window. We'll extract, detect, and organize them automatically.",
    icon: <MousePointer2 className="w-12 h-12 text-yellow-400" />,
    color: "#fbbf24",
    targetId: "tour-sidebar-brand"
  },
  {
    title: "Intelligent Dashboard",
    description: "The Home page features real-time Diagnostics that verify your mod metadata and savegame integrity as you browse.",
    icon: <Home className="w-12 h-12 text-blue-400" />,
    color: "#3b82f6",
    targetId: "tour-nav-home"
  },
  {
    title: "Banner Studio & Wallpapers",
    description: "Personalize your homepage hero banner! Choose custom wallpapers, crop & position photos, set dynamic screenshot slideshows, or display daily farming quotes.",
    icon: <Palette className="w-12 h-12 text-amber-400" />,
    color: "#f59e0b",
    targetId: "tour-nav-home"
  },
  {
    title: "Multiplayer Mod Key Sync",
    description: "Sync with friends or servers in one click! Generate a compact Mod Key on the Home page to share your collection, or paste a friend's key to batch-download every required mod automatically.",
    icon: <Key className="w-12 h-12 text-emerald-400" />,
    color: "#10b981",
    targetId: "tour-nav-home"
  },
  {
    title: "ModHub Browser",
    description: "Access thousands of mods directly from the GIANTS ModHub. Filter by Latest release timeframes (Today, Past 3 Days, Week, or Month), Crossplay compatibility, or unit capacities, and install with a single click.",
    icon: <LayoutGrid className="w-12 h-12 text-accent" />,
    color: "var(--accent)",
    targetId: "tour-nav-modhub-browser"
  },
  {
    title: "Side-by-Side Mod Comparison",
    description: "Can't decide between two tractors or implements? Select up to 4 mods in the ModHub Browser to compare their horsepower, price, working width, and technical specs side-by-side.",
    icon: <Scale className="w-12 h-12 text-indigo-400" />,
    color: "#818cf8",
    targetId: "tour-nav-modhub-browser"
  },
  {
    title: "ModHub Smart Match",
    description: "Automatically filter equipment to match your tractor's horsepower requirements—and vice-versa—so you never buy an implement your fleet can't pull.",
    icon: <Globe className="w-12 h-12 text-green-400" />,
    color: "#22c55e",
    targetId: "tour-nav-modhub-browser"
  },
  {
    title: "Requirements Badge",
    description: "Never miss a dependency. ModHub listings feature clear badges for required mods, ensuring your game stays stable and complete.",
    icon: <AlertTriangle className="w-12 h-12 text-red-400" />,
    color: "#f87171",
    targetId: "tour-nav-modhub-browser"
  },
  {
    title: "Automated Map & Dependency Handling",
    description: "The manager creates a dedicated folder for every map you install. Shared required mods can be consolidated into a single 'Map Dependencies' folder and linked virtually with a SHARED badge to save disk space.",
    icon: <Folders className="w-12 h-12 text-yellow-500" />,
    color: "#eab308",
    targetId: "tour-nav-modhub-browser"
  },
  {
    title: "Third-Party Tracking",
    description: "Monitor updates for mods installed from external sites like itch.io or KingMods. Link your mods to their source URLs to get automatic alerts when a new version is detected.",
    icon: <Globe className="w-12 h-12 text-cyan-400" />,
    color: "#22d3ee",
    targetId: "tour-nav-third-party-mods"
  },
  {
    title: "The Library & Tag Filter Bar",
    description: "Manage your collection with ease. Categorize mods into custom folders, use the expandable Tag & Category filter bar to drill down by subcategory or user tags, and run bulk actions.",
    icon: <HardDrive className="w-12 h-12 text-purple-400" />,
    color: "#a855f7",
    targetId: "tour-nav-installed-mods"
  },
  {
    title: "Personalize Your Folders",
    description: "Make your library yours! Click the edit pencil on any folder header to rename it, or click its folder badge to pick a custom icon so your categories stand out.",
    icon: <Palette className="w-12 h-12 text-pink-400" />,
    color: "#ec4899",
    targetId: "tour-nav-installed-mods"
  },
  {
    title: "Library Layout & Cross-Drive Moves",
    description: "Drag and drop mods between folders, reorder or collapse folders, and toggle between Grid and List views. Managing multiple drives? Migrate individual mods or whole folders across drives in one click.",
    icon: <List className="w-12 h-12 text-emerald-400" />,
    color: "#10b981",
    targetId: "tour-nav-installed-mods"
  },
  {
    title: "Must-Have Pins",
    description: "Mark your essential mods with a pin! These mods will be automatically suggested or included whenever you create a new game profile.",
    icon: <Pin className="w-12 h-12 text-blue-400" />,
    color: "#60a5fa",
    targetId: "tour-nav-installed-mods"
  },
  {
    title: "Lock Mod Updates & Version Rollback",
    description: "Prefer a specific version of a mod? Click the Lock icon on any mod card to freeze it during batch updates, or roll back to a previous version backup from the Mod Details view.",
    icon: <Lock className="w-12 h-12 text-amber-400" />,
    color: "#f59e0b",
    targetId: "tour-nav-installed-mods"
  },
  {
    title: "Favorites & Personalization",
    description: "Star your favorite mods and heart authors to keep track of their latest releases in one dedicated place.",
    icon: <Heart className="w-12 h-12 text-red-500" />,
    color: "#ef4444",
    targetId: "tour-nav-my-favourites"
  },
  {
    title: "Hide the Clutter",
    description: "Keep your library clean. Use the 'Hidden' folder to tuck away unwanted mods—(even mods on ModHub)—without deleting them from your drive.",
    icon: <EyeOff className="w-12 h-12 text-gray-400" />,
    color: "#9ca3af",
    targetId: "tour-nav-hidden-mods"
  },
  {
    title: "Save Editor & Fleet Maintenance",
    description: "Modify money, loans, difficulty, and active mod lists instantly. Plus, clean, repair, and repaint your entire vehicle fleet with sliders, or teleport your player to Home, the Shop, or inside any owned vehicle!",
    icon: <Sliders className="w-12 h-12 text-pink-400" />,
    color: "#ec4899",
    targetId: "tour-nav-savegames"
  },
  {
    title: "Multiplayer Server Saves & Exports",
    description: "Switch any save into Server Mode! Edit in-game farm permissions offline, run Mod Integrity Audits, and export saves as a Locked Player Version (view-only) or Admin Version with a Server Mod Host link.",
    icon: <Users className="w-12 h-12 text-cyan-400" />,
    color: "#22d3ee",
    targetId: "tour-nav-savegames"
  },
  {
    title: "Save Vault, Rollback & Cloud Sync",
    description: "Never lose a farm. Swap saves in and out of the Archive Vault, roll back to automatic engine backups, or configure automatic backup syncing to a local or cloud folder every time you exit the game.",
    icon: <Save className="w-12 h-12 text-emerald-400" />,
    color: "#10b981",
    targetId: "tour-nav-savegames"
  },
  {
    title: "Fast Launch",
    description: "Skip the menus! Launch any savegame directly from the manager and jump straight into your farm. We'll handle the intro videos for you.",
    icon: <Zap className="w-12 h-12 text-orange-400" />,
    color: "#f97316",
    targetId: "tour-nav-savegames"
  },
  {
    title: "Save Transfer (Upcoming)",
    description: "Currently under construction: soon you'll be able to transfer money, stored products, vehicles, and livestock between career slots with built-in capacity validation!",
    icon: <ArrowRightLeft className="w-12 h-12 text-blue-400" />,
    color: "#3b82f6",
    targetId: "tour-nav-save-transfer"
  },
  {
    title: "Templates & Blueprints",
    description: "Create Profiles to use as blueprints for new careers. Map templates allow you to start new games with terrain and settings already seeded.",
    icon: <Database className="w-12 h-12 text-indigo-400" />,
    color: "#818cf8",
    targetId: "tour-nav-profiles"
  },
  {
    title: "Keybindings & Conflict Auto-Resolver",
    description: "Rebind Keyboard, Mouse, Steering Wheel, and Gamepad controls live! Automatically detect key clashes across all your mods and click 'Auto-Resolve' to reassign conflicting actions to safe, unused keys.",
    icon: <SlidersHorizontal className="w-12 h-12 text-purple-400" />,
    color: "#a855f7",
    targetId: "tour-nav-keybindings"
  },
  {
    title: "Map Library",
    description: "Manage your custom terrains. View, delete, and organize your map templates to keep your storage efficient.",
    icon: <Map className="w-12 h-12 text-green-400" />,
    color: "#22c55e",
    targetId: "tour-nav-map-library"
  },
  {
    title: "Radio Stations",
    description: "Tune in while you farm! Add real-world internet radio stations directly to your game. We've even included the official GIANTS presets if you want to restore the defaults.",
    icon: <Radio className="w-12 h-12 text-blue-400" />,
    color: "#3b82f6",
    targetId: "tour-nav-radio-stations"
  },
  {
    title: "Download Pipeline",
    description: "Keep track of your active mod downloads. Monitor progress, speeds, and completion status in real-time.",
    icon: <Download className="w-12 h-12 text-accent" />,
    color: "var(--accent)",
    targetId: "tour-nav-downloads"
  },
  {
    title: "Reporting & Diagnostics",
    description: "Encountered a bug? Use our dedicated Diagnostics tool to generate a technical snapshot. It includes paths and version info to help the community troubleshoot your issue faster.",
    icon: <ShieldAlert className="w-12 h-12 text-orange-400" />,
    color: "#f97316",
    targetId: "tour-nav-reporting-&-diagnostics"
  },
  {
    title: "Make it Your Own",
    description: "Head over to Settings to customize the interface, manage multiple mod storage drives, or tweak your mod mirroring and developer symlink preferences to match your workflow.",
    icon: <Settings className="w-12 h-12 text-slate-400" />,
    color: "#94a3b8",
    targetId: "tour-nav-settings"
  },
  {
    title: "Loading Screen & Menu Customizer",
    description: "Replace the default FS25 launch splash screen and main menu background! Pick from built-in presets or drag-and-drop your own custom images with a live 16:9 preview and 1-click default restore.",
    icon: <Image className="w-12 h-12 text-pink-400" />,
    color: "#ec4899",
    targetId: "tour-nav-settings"
  },
  {
    title: "System Optimization",
    description: "Push your PC to the limit. The manager detects your hardware and automatically applies extreme settings like 400% View Distance and smart upscaling (DLSS/FSR) for the best FS25 experience.",
    icon: <Zap className="w-12 h-12 text-yellow-400" />,
    color: "#fbbf24",
    targetId: "tour-nav-settings"
  },
  {
    title: "Multi-Drive Mod Mirroring",
    description: "Organization without limits. Store mods across multiple drives and subfolders with real-time free space indicators—the Manager mirrors or symlinks them to the root so the game sees everything.",
    icon: <Layers className="w-12 h-12 text-cyan-400" />,
    color: "#22d3ee",
    targetId: "tour-nav-settings"
  },
  {
    title: "Release History & Version Control",
    description: "Browse full changelogs for every release right inside Settings, roll back or switch to any historical app version on demand, and minimize active updates into a background widget.",
    icon: <History className="w-12 h-12 text-indigo-400" />,
    color: "#818cf8",
    targetId: "tour-nav-settings"
  },
  {
    title: "Community & Feedback",
    description: "Notice a mod missing HP in its description? Urge modders to include it! Report any issues, suggestions, or requests on my Discord. Your feedback helps me improve the Smart Match system.",
    icon: <MessageCircle className="w-12 h-12 text-blue-400" />,
    color: "#3b82f6",
    targetId: "tour-nav-support-me",
    action: {
      label: "Join Discord",
      onClick: () => window.api.shell.openExternal('https://discord.gg/qtXMRjFdAf')
    }
  },
  {
    title: "Support the Project",
    description: "If you find this manager helpful, please consider supporting the project. You can join my Discord or contribute via PayPal to help keep updates rolling and the community growing!",
    icon: <Heart className="w-12 h-12 text-red-500" />,
    color: "#ef4444",
    targetId: "tour-nav-support-me"
  },
  {
    title: "You're All Set!",
    description: "Go forth and build the ultimate farm. If you need this tour again, you can re-launch it anytime from the Settings page.",
    icon: <Rocket className="w-12 h-12 text-accent" />,
    color: "var(--accent)"
  }
];

export default function WelcomeTour({ forceShow = false, onClose }) {
  const { hasSeenGuide, setHasSeenGuide, tourVersion, setTourVersion } = useSettingsStore();
  const CURRENT_TOUR_VERSION = '1.2.3';
  const [currentSlide, setCurrentSlide] = useState(0);
  const [visible, setVisible] = useState(false);
  const [highlightStyle, setHighlightStyle] = useState(null);
  const highlightTimer = useRef(null);

  useEffect(() => {
    // Only auto-show if explicitly requested (forceShow) or if the user has NEVER seen the guide at all.
    // If user has already seen the guide, sync the tour version silently without trapping them in a modal on app restart.
    if (forceShow || !hasSeenGuide) {
      setVisible(true);
    } else if (hasSeenGuide && tourVersion !== CURRENT_TOUR_VERSION) {
      setTourVersion(CURRENT_TOUR_VERSION);
    }
  }, [hasSeenGuide, tourVersion, forceShow]);

  // Escape key handler to close tour safely
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setHighlightStyle(null);
      return;
    }

    const slide = SLIDES[currentSlide];
    if (slide.targetId) {
      highlightTimer.current = setTimeout(() => {
        const el = document.getElementById(slide.targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setHighlightStyle({
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            opacity: 1
          });
        } else {
          setHighlightStyle(null);
        }
      }, 100);
    } else {
      setHighlightStyle(null);
    }

    return () => clearTimeout(highlightTimer.current);
  }, [currentSlide, visible]);

  if (!visible) return null;

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleClose = () => {
    setVisible(false);
    setHasSeenGuide(true);
    setTourVersion(CURRENT_TOUR_VERSION);
    if (onClose) onClose();
  };

  const slide = SLIDES[currentSlide];

  return (
    <div 
      className="modal-overlay tour-overlay" 
      style={{ zIndex: 1100, backdropFilter: 'none' }}
      onClick={(e) => {
        // Clicking backdrop outside the modal content dismisses the tour
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      {/* Target Highlight */}
      {highlightStyle && (
        <div 
          className="tour-highlight"
          style={{
            position: 'fixed',
            border: '2px solid var(--accent)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6), 0 0 20px var(--accent)',
            borderRadius: '6px',
            zIndex: 1001,
            pointerEvents: 'none',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            ...highlightStyle
          }}
        >
          <div style={{
            position: 'absolute',
            right: '-40px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent)',
            animation: 'pulse-horizontal 1s infinite'
          }}>
            <MousePointer2 size={32} fill="currentColor" />
          </div>
        </div>
      )}

      <div className="modal-content welcome-tour" style={{ 
        maxWidth: '500px', 
        padding: 'var(--sp-8)', 
        textAlign: 'center',
        zIndex: 1002,
        position: 'relative',
        background: 'rgba(15, 23, 42, 0.95)',
        border: `1px solid ${slide.color || 'var(--border-light)'}`,
        boxShadow: `0 0 40px ${slide.color ? slide.color + '44' : 'rgba(0,0,0,0.5)'}, 0 20px 40px rgba(0,0,0,0.4)`,
        borderRadius: 'var(--radius-xl)'
      }}>

        {/* Close X Button */}
        <button 
          onClick={handleClose}
          title="Close Tour"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s ease, background 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-tertiary)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <X size={20} />
        </button>

        <div className="tour-icon-wrap" style={{ 
          marginBottom: 'var(--sp-6)', 
          background: `rgba(0,0,0, 0.2)`, 
          padding: 'var(--sp-6)',
          borderRadius: '20px',
          display: 'inline-flex',
          border: `1px solid ${slide.color || 'var(--border-light)'}`
        }}>
          {slide.icon}
        </div>

        <h2 style={{ marginBottom: 'var(--sp-3)', fontSize: '1.6rem', fontWeight: '700' }}>{slide.title}</h2>
        <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: 'var(--sp-8)' }}>
          {slide.description}
        </p>

        {slide.action && (
          <button 
            className="btn btn--primary btn--sm" 
            onClick={slide.action.onClick}
            style={{ marginBottom: 'var(--sp-8)', gap: 'var(--sp-2)' }}
          >
            <Share2 size={16} /> {slide.action.label}
          </button>
        )}

        <div className="tour-dots" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-8)' }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{ 
              width: i === currentSlide ? '20px' : '8px', 
              height: '8px', 
              borderRadius: '4px',
              background: i === currentSlide ? 'var(--accent)' : 'var(--border-light)',
              transition: 'all 0.3s ease'
            }} />
          ))}
        </div>

        <div className="tour-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button 
              className="btn btn--secondary" 
              onClick={handlePrev}
              style={{ visibility: currentSlide === 0 ? 'hidden' : 'visible', padding: 'var(--sp-2) var(--sp-4)' }}
            >
              <ChevronLeft size={18} /> Back
            </button>
            {currentSlide < SLIDES.length - 1 && (
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={handleClose}
                style={{ minWidth: 72, padding: 'var(--sp-2) var(--sp-4)', opacity: 0.7, fontSize: 'var(--fs-xs)' }}
              >
                Skip Tour
              </button>
            )}
          </div>
          
          <button 
            className="btn btn--primary" 
            onClick={handleNext} 
            style={{ 
              padding: 'var(--sp-2) var(--sp-6)',
              background: slide.color || 'var(--accent)',
              color: (slide.color === '#fbbf24' || slide.color === '#eab308' || slide.color === '#f97316') ? '#000' : '#fff',
              border: 'none',
              boxShadow: `0 4px 12px ${slide.color ? slide.color + '44' : 'var(--accent-glow)'}`,
              fontWeight: '700'
            }}
          >
            {currentSlide === SLIDES.length - 1 ? 'Start Exploration' : 'Next'} <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse-horizontal {
          0%, 100% { transform: translateY(-50%) translateX(0); }
          50% { transform: translateY(-50%) translateX(-10px); }
        }
        .tour-overlay {
          background: ${highlightStyle ? 'transparent' : 'rgba(0,0,0,0.7)'};
          transition: background 0.4s ease;
        }
      `}</style>
    </div>
  );
}
