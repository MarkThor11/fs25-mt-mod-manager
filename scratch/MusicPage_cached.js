import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/pages/MusicPage.jsx");import __vite__cjsImport0_react_jsxDevRuntime from "/@fs/C:/Users/Mark/Desktop/GoogleModManager/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=b269ea24"; const Fragment = __vite__cjsImport0_react_jsxDevRuntime["Fragment"]; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
let prevRefreshReg;
let prevRefreshSig;
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}
var _s = $RefreshSig$();
import __vite__cjsImport3_react from "/@fs/C:/Users/Mark/Desktop/GoogleModManager/node_modules/.vite/deps/react.js?v=b269ea24"; const React = __vite__cjsImport3_react.__esModule ? __vite__cjsImport3_react.default : __vite__cjsImport3_react; const useState = __vite__cjsImport3_react["useState"]; const useEffect = __vite__cjsImport3_react["useEffect"];
import {
  Music,
  FolderOpen,
  RefreshCw,
  Unlink,
  ExternalLink,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mic2,
  Disc3
} from "/@fs/C:/Users/Mark/Desktop/GoogleModManager/node_modules/.vite/deps/lucide-react.js?v=b269ea24";
import { useSettingsStore } from "/store/useSettingsStore.js";
import { useToastStore } from "/store/useToastStore.js";
import "/styles/MusicPage.css";
export default function MusicPage() {
  _s();
  const {
    musicFolderPath,
    setMusicFolderPath,
    isMusicSynced,
    setIsMusicSynced
  } = useSettingsStore();
  const { addToast } = useToastStore();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [gameMusicPath, setGameMusicPath] = useState("");
  const [activeTab, setActiveTab] = useState("local");
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [useSpotifyHotkeys, setUseSpotifyHotkeys] = useState(false);
  useEffect(() => {
    loadStatus();
    if (musicFolderPath) {
      scanFolder(musicFolderPath);
    }
    const timer = setInterval(loadSpotifyStatus, 5e3);
    loadSpotifyStatus();
    return () => clearInterval(timer);
  }, []);
  const loadSpotifyStatus = async () => {
    try {
      const status = await window.api.spotify.getStatus();
      setSpotifyStatus(status.playback);
      setUseSpotifyHotkeys(status.useGameKeys);
    } catch (err) {
      console.error("Failed to get Spotify status:", err);
    }
  };
  const handleSpotifyLogin = async () => {
    try {
      await window.api.spotify.login();
      addToast("Opening Spotify Login...", "info");
    } catch (err) {
      addToast("Failed to start login", "error");
    }
  };
  const toggleSpotifyHotkeys = async () => {
    const newVal = !useSpotifyHotkeys;
    setUseSpotifyHotkeys(newVal);
    await window.api.spotify.setUseGameKeys(newVal);
    addToast(newVal ? "In-game keys enabled for Spotify" : "In-game keys disabled", "info");
  };
  const loadStatus = async () => {
    try {
      const status = await window.api.music.getStatus();
      setGameMusicPath(status.gameMusicPath);
      setIsMusicSynced(status.isSynced);
    } catch (err) {
      console.error("Failed to get music status:", err);
    }
  };
  const scanFolder = async (path) => {
    setLoading(true);
    try {
      const result = await window.api.music.selectFolder(path);
      if (result) {
        setTracks(result.tracks || []);
      }
    } catch (err) {
      addToast("Failed to scan folder", "error");
    } finally {
      setLoading(false);
    }
  };
  const handleSelectFolder = async () => {
    try {
      const result = await window.api.music.selectFolder();
      if (result) {
        setMusicFolderPath(result.path);
        setTracks(result.tracks || []);
        addToast("Music folder updated", "success");
      }
    } catch (err) {
      addToast("Failed to select folder", "error");
    }
  };
  const handleSync = async () => {
    if (!musicFolderPath) {
      addToast("Please select a music folder first", "warning");
      return;
    }
    setSyncing(true);
    try {
      const result = await window.api.music.sync(musicFolderPath);
      if (result.success) {
        setIsMusicSynced(true);
        addToast("Library synced with FS25!", "success");
      } else {
        addToast(result.error || "Sync failed", "error");
      }
    } catch (err) {
      addToast("Critical sync error", "error");
    } finally {
      setSyncing(false);
    }
  };
  const handleUnlink = async () => {
    try {
      const result = await window.api.music.unlink();
      if (result.success) {
        setIsMusicSynced(false);
        addToast("Library unlinked from game", "info");
      }
    } catch (err) {
      addToast("Failed to unlink", "error");
    }
  };
  const renderSpotifyTab = () => /* @__PURE__ */ jsxDEV("div", { className: "spotify-container", style: { padding: "var(--sp-8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "var(--sp-6)" }, children: spotifyStatus ? /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-6)", width: "100%" }, children: [
    /* @__PURE__ */ jsxDEV("div", { style: { position: "relative" }, children: [
      /* @__PURE__ */ jsxDEV("div", { style: { width: "240px", height: "240px", background: "#181818", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-xl)" }, children: spotifyStatus.item?.album?.images?.[0]?.url ? /* @__PURE__ */ jsxDEV("img", { src: spotifyStatus.item.album.images[0].url, alt: "Album Art", style: { width: "100%", height: "100%", objectFit: "cover" } }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 173,
        columnNumber: 11
      }, this) : /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyCenter: "center", color: "#555" }, children: /* @__PURE__ */ jsxDEV(Music, { size: 80 }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 176,
        columnNumber: 19
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 175,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 171,
        columnNumber: 13
      }, this),
      spotifyStatus.is_playing && /* @__PURE__ */ jsxDEV("div", { style: { position: "absolute", bottom: "-10px", right: "-10px", width: "40px", height: "40px", background: "#1db954", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", border: "4px solid var(--bg-card)" }, children: /* @__PURE__ */ jsxDEV(RefreshCw, { size: 20, className: "animate-spin" }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 182,
        columnNumber: 17
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 181,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 170,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("div", { style: { maxWidth: "400px" }, children: [
      /* @__PURE__ */ jsxDEV("h2", { style: { fontSize: "var(--fs-xl)", fontWeight: "var(--fw-bold)", color: "white", margin: 0 }, children: spotifyStatus.item?.name || "Nothing Playing" }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 188,
        columnNumber: 13
      }, this),
      /* @__PURE__ */ jsxDEV("p", { style: { color: "var(--text-tertiary)", marginTop: "var(--sp-1)" }, children: spotifyStatus.item?.artists?.map((a) => a.name).join(", ") || "Connect a device" }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 189,
        columnNumber: 13
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 187,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: "var(--sp-4)", marginTop: "var(--sp-2)" }, children: [
      /* @__PURE__ */ jsxDEV("button", { onClick: () => window.api.spotify.skipPrevious(), className: "btn-music btn-music--outline", style: { borderRadius: "50%", width: "50px", height: "50px", padding: 0, justifyContent: "center" }, children: /* @__PURE__ */ jsxDEV(Play, { size: 20, style: { transform: "rotate(180deg)" } }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 194,
        columnNumber: 15
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 193,
        columnNumber: 13
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: () => window.api.spotify.togglePlayback(), className: "btn-music btn-music--primary", style: { borderRadius: "50%", width: "60px", height: "60px", padding: 0, justifyContent: "center", background: "#1db954" }, children: spotifyStatus.is_playing ? /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: "4px" }, children: [
        /* @__PURE__ */ jsxDEV("div", { style: { width: "4px", height: "20px", background: "white" } }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 197,
          columnNumber: 88
        }, this),
        /* @__PURE__ */ jsxDEV("div", { style: { width: "4px", height: "20px", background: "white" } }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 197,
          columnNumber: 157
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 197,
        columnNumber: 43
      }, this) : /* @__PURE__ */ jsxDEV(Play, { size: 24, fill: "white" }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 197,
        columnNumber: 235
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 196,
        columnNumber: 13
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: () => window.api.spotify.skipNext(), className: "btn-music btn-music--outline", style: { borderRadius: "50%", width: "50px", height: "50px", padding: 0, justifyContent: "center" }, children: /* @__PURE__ */ jsxDEV(Play, { size: 20 }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 200,
        columnNumber: 15
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 199,
        columnNumber: 13
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 192,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("div", { style: { marginTop: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "var(--sp-4)", width: "100%", maxWidth: "350px" }, children: /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-4)", background: "rgba(29, 185, 84, 0.05)", border: "1px solid rgba(29, 185, 84, 0.2)", borderRadius: "var(--radius-lg)" }, children: [
      /* @__PURE__ */ jsxDEV("div", { style: { textAlign: "left" }, children: [
        /* @__PURE__ */ jsxDEV("p", { style: { fontSize: "var(--fs-sm)", fontWeight: "bold", color: "#1db954" }, children: "In-Game Controls" }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 207,
          columnNumber: 19
        }, this),
        /* @__PURE__ */ jsxDEV("p", { style: { fontSize: "10px", color: "var(--text-muted)" }, children: "Use Numpad 4/6 in your tractor" }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 208,
          columnNumber: 19
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 206,
        columnNumber: 16
      }, this),
      /* @__PURE__ */ jsxDEV(
        "button",
        {
          onClick: toggleSpotifyHotkeys,
          className: `btn-music ${useSpotifyHotkeys ? "btn-music--primary" : "btn-music--outline"}`,
          style: { background: useSpotifyHotkeys ? "#1db954" : "", padding: "6px 12px", fontSize: "10px" },
          children: useSpotifyHotkeys ? "ENABLED" : "DISABLED"
        },
        void 0,
        false,
        {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 210,
          columnNumber: 16
        },
        this
      )
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 205,
      columnNumber: 14
    }, this) }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 204,
      columnNumber: 11
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
    lineNumber: 169,
    columnNumber: 5
  }, this) : /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-4)" }, children: [
    /* @__PURE__ */ jsxDEV("div", { style: { width: "80px", height: "80px", background: "#1db954", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", marginBottom: "var(--sp-4)" }, children: /* @__PURE__ */ jsxDEV(Music, { size: 40 }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 223,
      columnNumber: 13
    }, this) }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 222,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("h2", { style: { fontSize: "var(--fs-xl)", color: "white" }, children: "Spotify Remote Control" }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 225,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("p", { style: { color: "var(--text-muted)", maxWidth: "300px" }, children: "Control your Spotify playback directly from your tractor's dashboard." }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 226,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV("button", { onClick: handleSpotifyLogin, className: "btn-music btn-music--primary", style: { background: "#1db954", marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-8)", borderRadius: "var(--radius-full)" }, children: "Connect Spotify" }, void 0, false, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 229,
      columnNumber: 11
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
    lineNumber: 221,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
    lineNumber: 167,
    columnNumber: 3
  }, this);
  return /* @__PURE__ */ jsxDEV("div", { className: "music-page", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "music-header", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "header-info", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "header-icon", children: /* @__PURE__ */ jsxDEV(Music, { className: "w-10 h-10 text-white" }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 243,
          columnNumber: 13
        }, this) }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 242,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "header-text", children: [
          /* @__PURE__ */ jsxDEV("h1", { children: "My Music Library" }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 246,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("p", { children: "Sync your personal MP3 collection with Farming Simulator 25 and use your tractor's controls to skip tracks." }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 247,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 245,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 241,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "header-actions", children: [
        /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", background: "rgba(255,255,255,0.05)", padding: "4px", borderRadius: "var(--radius-md)", marginRight: "var(--sp-4)" }, children: [
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => setActiveTab("local"),
              className: `btn-music ${activeTab === "local" ? "btn-music--outline" : ""}`,
              style: { background: activeTab === "local" ? "rgba(255,255,255,0.1)" : "transparent", border: "none", fontSize: "12px" },
              children: "Local Music"
            },
            void 0,
            false,
            {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 255,
              columnNumber: 14
            },
            this
          ),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => setActiveTab("spotify"),
              className: `btn-music ${activeTab === "spotify" ? "btn-music--outline" : ""}`,
              style: { background: activeTab === "spotify" ? "rgba(255,255,255,0.1)" : "transparent", border: "none", fontSize: "12px", color: activeTab === "spotify" ? "#1db954" : "" },
              children: "Spotify"
            },
            void 0,
            false,
            {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 262,
              columnNumber: 14
            },
            this
          )
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 254,
          columnNumber: 11
        }, this),
        activeTab === "local" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
          /* @__PURE__ */ jsxDEV("button", { onClick: handleSelectFolder, className: "btn-music btn-music--outline", children: [
            /* @__PURE__ */ jsxDEV(FolderOpen, { size: 18 }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 274,
              columnNumber: 17
            }, this),
            /* @__PURE__ */ jsxDEV("span", { children: "Select Folder" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 275,
              columnNumber: 17
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 273,
            columnNumber: 15
          }, this),
          isMusicSynced ? /* @__PURE__ */ jsxDEV("button", { onClick: handleUnlink, className: "btn-music btn-music--danger", children: [
            /* @__PURE__ */ jsxDEV(Unlink, { size: 18 }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 280,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("span", { children: "Unlink Game" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 281,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 279,
            columnNumber: 13
          }, this) : /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: handleSync,
              disabled: syncing || !musicFolderPath,
              className: "btn-music btn-music--primary",
              children: [
                /* @__PURE__ */ jsxDEV(RefreshCw, { size: 18, className: syncing ? "animate-spin" : "" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 289,
                  columnNumber: 19
                }, this),
                /* @__PURE__ */ jsxDEV("span", { children: "Sync with Game" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 290,
                  columnNumber: 19
                }, this)
              ]
            },
            void 0,
            true,
            {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 284,
              columnNumber: 13
            },
            this
          )
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 272,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 253,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 240,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "music-grid", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "track-section", children: activeTab === "local" ? /* @__PURE__ */ jsxDEV(Fragment, { children: [
        /* @__PURE__ */ jsxDEV("div", { className: "section-title", children: /* @__PURE__ */ jsxDEV("h2", { children: [
          /* @__PURE__ */ jsxDEV(Disc3, { size: 20, style: { color: "var(--accent2)" } }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 305,
            columnNumber: 19
          }, this),
          "Detected Tracks",
          /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "var(--fs-sm)", color: "var(--text-muted)", fontWeight: "normal", marginLeft: "var(--sp-2)" }, children: [
            "(",
            tracks.length,
            " files)"
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 307,
            columnNumber: 19
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 304,
          columnNumber: 17
        }, this) }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 303,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "track-container", children: loading ? /* @__PURE__ */ jsxDEV("div", { className: "empty-state", children: [
          /* @__PURE__ */ jsxDEV(RefreshCw, { size: 40, className: "animate-spin", style: { opacity: 0.3 } }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 316,
            columnNumber: 21
          }, this),
          /* @__PURE__ */ jsxDEV("p", { style: { marginTop: "var(--sp-4)", color: "var(--text-muted)" }, children: "Scanning your music..." }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 317,
            columnNumber: 21
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 315,
          columnNumber: 15
        }, this) : tracks.length > 0 ? /* @__PURE__ */ jsxDEV("div", { className: "track-list", children: [
          tracks.slice(0, 100).map(
            (track, idx) => /* @__PURE__ */ jsxDEV("div", { className: "track-item", children: [
              /* @__PURE__ */ jsxDEV("div", { className: "track-info", children: [
                /* @__PURE__ */ jsxDEV("div", { className: "track-play-icon", children: /* @__PURE__ */ jsxDEV(Play, { size: 14 }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 325,
                  columnNumber: 29
                }, this) }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 324,
                  columnNumber: 27
                }, this),
                /* @__PURE__ */ jsxDEV("div", { className: "track-details", children: [
                  /* @__PURE__ */ jsxDEV("p", { className: "track-name", children: track.name }, void 0, false, {
                    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                    lineNumber: 328,
                    columnNumber: 29
                  }, this),
                  /* @__PURE__ */ jsxDEV("p", { className: "track-path", children: track.relativePath }, void 0, false, {
                    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                    lineNumber: 329,
                    columnNumber: 29
                  }, this)
                ] }, void 0, true, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 327,
                  columnNumber: 27
                }, this)
              ] }, void 0, true, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 323,
                columnNumber: 25
              }, this),
              /* @__PURE__ */ jsxDEV(Music, { size: 14, style: { opacity: 0.2 } }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 332,
                columnNumber: 25
              }, this)
            ] }, idx, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 322,
              columnNumber: 17
            }, this)
          ),
          tracks.length > 100 && /* @__PURE__ */ jsxDEV("div", { style: { padding: "var(--sp-4)", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-xs)", fontStyle: "italic" }, children: [
            "And ",
            tracks.length - 100,
            " more tracks..."
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 336,
            columnNumber: 17
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 320,
          columnNumber: 15
        }, this) : /* @__PURE__ */ jsxDEV("div", { className: "empty-state", children: [
          /* @__PURE__ */ jsxDEV("div", { className: "empty-icon", children: /* @__PURE__ */ jsxDEV(FolderOpen, { size: 32 }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 344,
            columnNumber: 23
          }, this) }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 343,
            columnNumber: 21
          }, this),
          /* @__PURE__ */ jsxDEV("h3", { style: { color: "var(--text-secondary)" }, children: "No Music Selected" }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 346,
            columnNumber: 21
          }, this),
          /* @__PURE__ */ jsxDEV("p", { style: { color: "var(--text-muted)", marginTop: "var(--sp-2)", maxWidth: "250px" }, children: 'Click "Select Folder" to choose where you keep your music.' }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 347,
            columnNumber: 21
          }, this),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: handleSelectFolder,
              className: "btn-music btn-music--outline",
              style: { marginTop: "var(--sp-6)", borderRadius: "var(--radius-full)" },
              children: "Select a folder"
            },
            void 0,
            false,
            {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 350,
              columnNumber: 21
            },
            this
          )
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 342,
          columnNumber: 15
        }, this) }, void 0, false, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 313,
          columnNumber: 15
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 302,
        columnNumber: 11
      }, this) : /* @__PURE__ */ jsxDEV("div", { className: "track-container", children: renderSpotifyTab() }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 362,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 300,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "status-section", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "status-card", children: [
          /* @__PURE__ */ jsxDEV("h2", { style: { fontSize: "var(--fs-md)", color: "var(--text-primary)", marginBottom: "var(--sp-6)" }, children: "System Status" }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 371,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "status-item", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "status-label", children: "Source Path" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 374,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "status-value", children: musicFolderPath || "Not set" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 375,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 373,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "status-item", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "status-label", children: "Game Music Path" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 379,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "status-value", children: gameMusicPath || "Auto-detecting..." }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 380,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 378,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: `sync-badge ${isMusicSynced ? "sync-badge--active" : "sync-badge--inactive"}`, children: isMusicSynced ? /* @__PURE__ */ jsxDEV(Fragment, { children: [
            /* @__PURE__ */ jsxDEV(CheckCircle2, { size: 20 }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 386,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("div", { style: { fontSize: "var(--fs-sm)" }, children: "Active Sync" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 388,
                columnNumber: 21
              }, this),
              /* @__PURE__ */ jsxDEV("div", { style: { fontSize: "10px", opacity: 0.7, fontWeight: "normal" }, children: "Files are linked to game" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 389,
                columnNumber: 21
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 387,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 385,
            columnNumber: 15
          }, this) : /* @__PURE__ */ jsxDEV(Fragment, { children: [
            /* @__PURE__ */ jsxDEV(AlertCircle, { size: 20 }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 394,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("div", { style: { fontSize: "var(--fs-sm)" }, children: "Not Synced" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 396,
                columnNumber: 21
              }, this),
              /* @__PURE__ */ jsxDEV("div", { style: { fontSize: "10px", opacity: 0.7, fontWeight: "normal" }, children: "Click Sync to enable" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 397,
                columnNumber: 21
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 395,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 393,
            columnNumber: 15
          }, this) }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 383,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 370,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "status-card", style: { background: "rgba(255,255,255,0.02)" }, children: [
          /* @__PURE__ */ jsxDEV("h2", { style: { fontSize: "var(--fs-md)", color: "var(--text-primary)", marginBottom: "var(--sp-4)" }, children: "In-Game Controls" }, void 0, false, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 406,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "space-y-3", style: { display: "flex", flexDirection: "column", gap: "var(--sp-3)" }, children: [
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }, children: [
              /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }, children: "Toggle Radio" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 409,
                columnNumber: 17
              }, this),
              /* @__PURE__ */ jsxDEV("kbd", { style: { background: "#334155", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", borderBottom: "2px solid #1e293b" }, children: "5" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 410,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 408,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }, children: [
              /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }, children: "Next Station" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 413,
                columnNumber: 17
              }, this),
              /* @__PURE__ */ jsxDEV("kbd", { style: { background: "#334155", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", borderBottom: "2px solid #1e293b" }, children: "." }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 414,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 412,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }, children: [
              /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }, children: "Next Track" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 417,
                columnNumber: 17
              }, this),
              /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: "4px" }, children: [
                /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "9px", color: "var(--text-muted)", alignSelf: "center", marginRight: "4px" }, children: "NUM" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 419,
                  columnNumber: 19
                }, this),
                /* @__PURE__ */ jsxDEV("kbd", { style: { background: "#334155", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", borderBottom: "2px solid #1e293b" }, children: "6" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 420,
                  columnNumber: 19
                }, this)
              ] }, void 0, true, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 418,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 416,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)" }, children: [
              /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }, children: "Prev Track" }, void 0, false, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 424,
                columnNumber: 17
              }, this),
              /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: "4px" }, children: [
                /* @__PURE__ */ jsxDEV("span", { style: { fontSize: "9px", color: "var(--text-muted)", alignSelf: "center", marginRight: "4px" }, children: "NUM" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 426,
                  columnNumber: 19
                }, this),
                /* @__PURE__ */ jsxDEV("kbd", { style: { background: "#334155", color: "white", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", borderBottom: "2px solid #1e293b" }, children: "4" }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 427,
                  columnNumber: 19
                }, this)
              ] }, void 0, true, {
                fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                lineNumber: 425,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 423,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 407,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 405,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "tip-card", children: [
          /* @__PURE__ */ jsxDEV("div", { className: "tip-header", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "tip-icon", children: /* @__PURE__ */ jsxDEV(Mic2, { size: 20 }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 436,
              columnNumber: 17
            }, this) }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 435,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("span", { style: { fontWeight: "var(--fw-bold)" }, children: "Pro Tip" }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 438,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 434,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("p", { children: [
            "Once synced, start the game and enter a vehicle. Cycle your radio sources until you reach",
            /* @__PURE__ */ jsxDEV("strong", { style: { color: "white" }, children: ' "Music"' }, void 0, false, {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 442,
              columnNumber: 15
            }, this),
            ". Use your keyboard (Numpad 4/6) to skip through your personal tracks!"
          ] }, void 0, true, {
            fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
            lineNumber: 440,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => window.api.shell.openExternal("https://github.com/MarkThor11/fs25-mt-mod-manager/wiki"),
              style: { background: "none", border: "none", color: "white", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "var(--sp-4)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" },
              children: [
                "View Full Guide ",
                /* @__PURE__ */ jsxDEV(ExternalLink, { size: 10 }, void 0, false, {
                  fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
                  lineNumber: 449,
                  columnNumber: 31
                }, this)
              ]
            },
            void 0,
            true,
            {
              fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
              lineNumber: 445,
              columnNumber: 13
            },
            this
          )
        ] }, void 0, true, {
          fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
          lineNumber: 433,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
        lineNumber: 369,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
      lineNumber: 298,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx",
    lineNumber: 238,
    columnNumber: 5
  }, this);
}
_s(MusicPage, "hUNE4Wb0f0Bo8jS6AMCWMCBnFHM=", false, function() {
  return [useSettingsStore, useToastStore];
});
_c = MusicPage;
var _c;
$RefreshReg$(_c, "MusicPage");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("C:/Users/Mark/Desktop/GoogleModManager/src/renderer/pages/MusicPage.jsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,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QztBQUFBO0FBQUEsY0FDQyxTQUFTLE1BQU05QyxPQUFPQyxJQUFJNEUsTUFBTUMsYUFBYSx3REFBd0Q7QUFBQSxjQUNyRyxPQUFPLEVBQUUxQyxZQUFZLFFBQVFjLFFBQVEsUUFBUUosT0FBTyxTQUFTTSxVQUFVLFFBQVFDLFlBQVksUUFBUTBCLGVBQWUsYUFBYUMsZUFBZSxTQUFTeEIsV0FBVyxlQUFleUIsUUFBUSxXQUFXdEQsU0FBUyxRQUFRRSxZQUFZLFVBQVVHLEtBQUssTUFBTTtBQUFBLGNBQUU7QUFBQTtBQUFBLGdCQUV4Tyx1QkFBQyxnQkFBYSxNQUFNLE1BQXBCO0FBQUE7QUFBQTtBQUFBO0FBQUEsdUJBQXVCO0FBQUE7QUFBQTtBQUFBLFlBSnpDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxVQUtBO0FBQUEsYUFqQkY7QUFBQTtBQUFBO0FBQUE7QUFBQSxlQWtCQTtBQUFBLFdBbEZGO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFtRkE7QUFBQSxTQTFKRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBMkpBO0FBQUEsT0F2TkY7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQXdOQTtBQUVKO0FBQUMzRCxHQWxhdUJELFdBQVM7QUFBQSxVQU0zQkYsa0JBQ2lCQyxhQUFhO0FBQUE7QUFBQSxLQVBaQztBQUFTLElBQUE4RztBQUFBLGFBQUFBLElBQUEiLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlRWZmZWN0IiwiTXVzaWMiLCJGb2xkZXJPcGVuIiwiUmVmcmVzaEN3IiwiVW5saW5rIiwiRXh0ZXJuYWxMaW5rIiwiUGxheSIsIkNoZWNrQ2lyY2xlMiIsIkFsZXJ0Q2lyY2xlIiwiQ2xvY2siLCJNaWMyIiwiRGlzYzMiLCJ1c2VTZXR0aW5nc1N0b3JlIiwidXNlVG9hc3RTdG9yZSIsIk11c2ljUGFnZSIsIl9zIiwibXVzaWNGb2xkZXJQYXRoIiwic2V0TXVzaWNGb2xkZXJQYXRoIiwiaXNNdXNpY1N5bmNlZCIsInNldElzTXVzaWNTeW5jZWQiLCJhZGRUb2FzdCIsInRyYWNrcyIsInNldFRyYWNrcyIsImxvYWRpbmciLCJzZXRMb2FkaW5nIiwic3luY2luZyIsInNldFN5bmNpbmciLCJnYW1lTXVzaWNQYXRoIiwic2V0R2FtZU11c2ljUGF0aCIsImFjdGl2ZVRhYiIsInNldEFjdGl2ZVRhYiIsInNwb3RpZnlTdGF0dXMiLCJzZXRTcG90aWZ5U3RhdHVzIiwidXNlU3BvdGlmeUhvdGtleXMiLCJzZXRVc2VTcG90aWZ5SG90a2V5cyIsImxvYWRTdGF0dXMiLCJzY2FuRm9sZGVyIiwidGltZXIiLCJzZXRJbnRlcnZhbCIsImxvYWRTcG90aWZ5U3RhdHVzIiwiY2xlYXJJbnRlcnZhbCIsInN0YXR1cyIsIndpbmRvdyIsImFwaSIsInNwb3RpZnkiLCJnZXRTdGF0dXMiLCJwbGF5YmFjayIsInVzZUdhbWVLZXlzIiwiZXJyIiwiY29uc29sZSIsImVycm9yIiwiaGFuZGxlU3BvdGlmeUxvZ2luIiwibG9naW4iLCJ0b2dnbGVTcG90aWZ5SG90a2V5cyIsIm5ld1ZhbCIsInNldFVzZUdhbWVLZXlzIiwibXVzaWMiLCJpc1N5bmNlZCIsInBhdGgiLCJyZXN1bHQiLCJzZWxlY3RGb2xkZXIiLCJoYW5kbGVTZWxlY3RGb2xkZXIiLCJoYW5kbGVTeW5jIiwic3luYyIsInN1Y2Nlc3MiLCJoYW5kbGVVbmxpbmsiLCJ1bmxpbmsiLCJyZW5kZXJTcG90aWZ5VGFiIiwicGFkZGluZyIsImRpc3BsYXkiLCJmbGV4RGlyZWN0aW9uIiwiYWxpZ25JdGVtcyIsImp1c3RpZnlDb250ZW50IiwidGV4dEFsaWduIiwiZ2FwIiwid2lkdGgiLCJwb3NpdGlvbiIsImhlaWdodCIsImJhY2tncm91bmQiLCJib3JkZXJSYWRpdXMiLCJvdmVyZmxvdyIsImJveFNoYWRvdyIsIml0ZW0iLCJhbGJ1bSIsImltYWdlcyIsInVybCIsIm9iamVjdEZpdCIsImp1c3RpZnlDZW50ZXIiLCJjb2xvciIsImlzX3BsYXlpbmciLCJib3R0b20iLCJyaWdodCIsImJvcmRlciIsIm1heFdpZHRoIiwiZm9udFNpemUiLCJmb250V2VpZ2h0IiwibWFyZ2luIiwibmFtZSIsIm1hcmdpblRvcCIsImFydGlzdHMiLCJtYXAiLCJhIiwiam9pbiIsInNraXBQcmV2aW91cyIsInRyYW5zZm9ybSIsInRvZ2dsZVBsYXliYWNrIiwic2tpcE5leHQiLCJtYXJnaW5Cb3R0b20iLCJtYXJnaW5SaWdodCIsIm1hcmdpbkxlZnQiLCJsZW5ndGgiLCJvcGFjaXR5Iiwic2xpY2UiLCJ0cmFjayIsImlkeCIsInJlbGF0aXZlUGF0aCIsImZvbnRTdHlsZSIsImJvcmRlckJvdHRvbSIsImFsaWduU2VsZiIsInNoZWxsIiwib3BlbkV4dGVybmFsIiwidGV4dFRyYW5zZm9ybSIsImxldHRlclNwYWNpbmciLCJjdXJzb3IiLCJfYyJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlcyI6WyJNdXNpY1BhZ2UuanN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0IH0gZnJvbSAncmVhY3QnO1xyXG5pbXBvcnQgeyBcclxuICBNdXNpYywgXHJcbiAgRm9sZGVyT3BlbiwgXHJcbiAgUmVmcmVzaEN3LCBcclxuICBVbmxpbmssIFxyXG4gIEV4dGVybmFsTGluaywgXHJcbiAgUGxheSwgXHJcbiAgQ2hlY2tDaXJjbGUyLCBcclxuICBBbGVydENpcmNsZSxcclxuICBDbG9jayxcclxuICBNaWMyLFxyXG4gIERpc2MzXHJcbn0gZnJvbSAnbHVjaWRlLXJlYWN0JztcclxuaW1wb3J0IHsgdXNlU2V0dGluZ3NTdG9yZSB9IGZyb20gJy4uL3N0b3JlL3VzZVNldHRpbmdzU3RvcmUnO1xyXG5pbXBvcnQgeyB1c2VUb2FzdFN0b3JlIH0gZnJvbSAnLi4vc3RvcmUvdXNlVG9hc3RTdG9yZSc7XHJcbmltcG9ydCAnLi4vc3R5bGVzL011c2ljUGFnZS5jc3MnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTXVzaWNQYWdlKCkge1xyXG4gIGNvbnN0IHsgXHJcbiAgICBtdXNpY0ZvbGRlclBhdGgsIFxyXG4gICAgc2V0TXVzaWNGb2xkZXJQYXRoLCBcclxuICAgIGlzTXVzaWNTeW5jZWQsIFxyXG4gICAgc2V0SXNNdXNpY1N5bmNlZCBcclxuICB9ID0gdXNlU2V0dGluZ3NTdG9yZSgpO1xyXG4gIGNvbnN0IHsgYWRkVG9hc3QgfSA9IHVzZVRvYXN0U3RvcmUoKTtcclxuICBcclxuICBjb25zdCBbdHJhY2tzLCBzZXRUcmFja3NdID0gdXNlU3RhdGUoW10pO1xyXG4gIGNvbnN0IFtsb2FkaW5nLCBzZXRMb2FkaW5nXSA9IHVzZVN0YXRlKGZhbHNlKTtcclxuICBjb25zdCBbc3luY2luZywgc2V0U3luY2luZ10gPSB1c2VTdGF0ZShmYWxzZSk7XHJcbiAgY29uc3QgW2dhbWVNdXNpY1BhdGgsIHNldEdhbWVNdXNpY1BhdGhdID0gdXNlU3RhdGUoJycpO1xyXG4gIFxyXG4gIGNvbnN0IFthY3RpdmVUYWIsIHNldEFjdGl2ZVRhYl0gPSB1c2VTdGF0ZSgnbG9jYWwnKTsgLy8gJ2xvY2FsJyBvciAnc3BvdGlmeSdcclxuICBjb25zdCBbc3BvdGlmeVN0YXR1cywgc2V0U3BvdGlmeVN0YXR1c10gPSB1c2VTdGF0ZShudWxsKTtcclxuICBjb25zdCBbdXNlU3BvdGlmeUhvdGtleXMsIHNldFVzZVNwb3RpZnlIb3RrZXlzXSA9IHVzZVN0YXRlKGZhbHNlKTtcclxuXHJcbiAgdXNlRWZmZWN0KCgpID0+IHtcclxuICAgIGxvYWRTdGF0dXMoKTtcclxuICAgIGlmIChtdXNpY0ZvbGRlclBhdGgpIHtcclxuICAgICAgc2NhbkZvbGRlcihtdXNpY0ZvbGRlclBhdGgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBQb2xsIFNwb3RpZnkgc3RhdHVzIGlmIGFjdGl2ZVxyXG4gICAgY29uc3QgdGltZXIgPSBzZXRJbnRlcnZhbChsb2FkU3BvdGlmeVN0YXR1cywgNTAwMCk7XHJcbiAgICBsb2FkU3BvdGlmeVN0YXR1cygpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aW1lcik7XHJcbiAgfSwgW10pO1xyXG5cclxuICBjb25zdCBsb2FkU3BvdGlmeVN0YXR1cyA9IGFzeW5jICgpID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IHdpbmRvdy5hcGkuc3BvdGlmeS5nZXRTdGF0dXMoKTtcclxuICAgICAgc2V0U3BvdGlmeVN0YXR1cyhzdGF0dXMucGxheWJhY2spO1xyXG4gICAgICBzZXRVc2VTcG90aWZ5SG90a2V5cyhzdGF0dXMudXNlR2FtZUtleXMpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgU3BvdGlmeSBzdGF0dXM6JywgZXJyKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBoYW5kbGVTcG90aWZ5TG9naW4gPSBhc3luYyAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB3aW5kb3cuYXBpLnNwb3RpZnkubG9naW4oKTtcclxuICAgICAgYWRkVG9hc3QoJ09wZW5pbmcgU3BvdGlmeSBMb2dpbi4uLicsICdpbmZvJyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgYWRkVG9hc3QoJ0ZhaWxlZCB0byBzdGFydCBsb2dpbicsICdlcnJvcicpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbnN0IHRvZ2dsZVNwb3RpZnlIb3RrZXlzID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgY29uc3QgbmV3VmFsID0gIXVzZVNwb3RpZnlIb3RrZXlzO1xyXG4gICAgc2V0VXNlU3BvdGlmeUhvdGtleXMobmV3VmFsKTtcclxuICAgIGF3YWl0IHdpbmRvdy5hcGkuc3BvdGlmeS5zZXRVc2VHYW1lS2V5cyhuZXdWYWwpO1xyXG4gICAgYWRkVG9hc3QobmV3VmFsID8gJ0luLWdhbWUga2V5cyBlbmFibGVkIGZvciBTcG90aWZ5JyA6ICdJbi1nYW1lIGtleXMgZGlzYWJsZWQnLCAnaW5mbycpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGxvYWRTdGF0dXMgPSBhc3luYyAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBzdGF0dXMgPSBhd2FpdCB3aW5kb3cuYXBpLm11c2ljLmdldFN0YXR1cygpO1xyXG4gICAgICBzZXRHYW1lTXVzaWNQYXRoKHN0YXR1cy5nYW1lTXVzaWNQYXRoKTtcclxuICAgICAgc2V0SXNNdXNpY1N5bmNlZChzdGF0dXMuaXNTeW5jZWQpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgbXVzaWMgc3RhdHVzOicsIGVycik7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgY29uc3Qgc2NhbkZvbGRlciA9IGFzeW5jIChwYXRoKSA9PiB7XHJcbiAgICBzZXRMb2FkaW5nKHRydWUpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgd2luZG93LmFwaS5tdXNpYy5zZWxlY3RGb2xkZXIocGF0aCk7XHJcbiAgICAgIGlmIChyZXN1bHQpIHtcclxuICAgICAgICBzZXRUcmFja3MocmVzdWx0LnRyYWNrcyB8fCBbXSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBhZGRUb2FzdCgnRmFpbGVkIHRvIHNjYW4gZm9sZGVyJywgJ2Vycm9yJyk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRMb2FkaW5nKGZhbHNlKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBoYW5kbGVTZWxlY3RGb2xkZXIgPSBhc3luYyAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuYXBpLm11c2ljLnNlbGVjdEZvbGRlcigpO1xyXG4gICAgICBpZiAocmVzdWx0KSB7XHJcbiAgICAgICAgc2V0TXVzaWNGb2xkZXJQYXRoKHJlc3VsdC5wYXRoKTtcclxuICAgICAgICBzZXRUcmFja3MocmVzdWx0LnRyYWNrcyB8fCBbXSk7XHJcbiAgICAgICAgYWRkVG9hc3QoJ011c2ljIGZvbGRlciB1cGRhdGVkJywgJ3N1Y2Nlc3MnKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGFkZFRvYXN0KCdGYWlsZWQgdG8gc2VsZWN0IGZvbGRlcicsICdlcnJvcicpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbnN0IGhhbmRsZVN5bmMgPSBhc3luYyAoKSA9PiB7XHJcbiAgICBpZiAoIW11c2ljRm9sZGVyUGF0aCkge1xyXG4gICAgICBhZGRUb2FzdCgnUGxlYXNlIHNlbGVjdCBhIG11c2ljIGZvbGRlciBmaXJzdCcsICd3YXJuaW5nJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBzZXRTeW5jaW5nKHRydWUpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgd2luZG93LmFwaS5tdXNpYy5zeW5jKG11c2ljRm9sZGVyUGF0aCk7XHJcbiAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xyXG4gICAgICAgIHNldElzTXVzaWNTeW5jZWQodHJ1ZSk7XHJcbiAgICAgICAgYWRkVG9hc3QoJ0xpYnJhcnkgc3luY2VkIHdpdGggRlMyNSEnLCAnc3VjY2VzcycpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGFkZFRvYXN0KHJlc3VsdC5lcnJvciB8fCAnU3luYyBmYWlsZWQnLCAnZXJyb3InKTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGFkZFRvYXN0KCdDcml0aWNhbCBzeW5jIGVycm9yJywgJ2Vycm9yJyk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRTeW5jaW5nKGZhbHNlKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBoYW5kbGVVbmxpbmsgPSBhc3luYyAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB3aW5kb3cuYXBpLm11c2ljLnVubGluaygpO1xyXG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgICBzZXRJc011c2ljU3luY2VkKGZhbHNlKTtcclxuICAgICAgICBhZGRUb2FzdCgnTGlicmFyeSB1bmxpbmtlZCBmcm9tIGdhbWUnLCAnaW5mbycpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgYWRkVG9hc3QoJ0ZhaWxlZCB0byB1bmxpbmsnLCAnZXJyb3InKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCByZW5kZXJTcG90aWZ5VGFiID0gKCkgPT4gKFxyXG4gICAgPGRpdiBjbGFzc05hbWU9XCJzcG90aWZ5LWNvbnRhaW5lclwiIHN0eWxlPXt7IHBhZGRpbmc6ICd2YXIoLS1zcC04KScsIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIHRleHRBbGlnbjogJ2NlbnRlcicsIGdhcDogJ3ZhcigtLXNwLTYpJyB9fT5cclxuICAgICAge3Nwb3RpZnlTdGF0dXMgPyAoXHJcbiAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiAndmFyKC0tc3AtNiknLCB3aWR0aDogJzEwMCUnIH19PlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT17eyBwb3NpdGlvbjogJ3JlbGF0aXZlJyB9fT5cclxuICAgICAgICAgICAgPGRpdiBzdHlsZT17eyB3aWR0aDogJzI0MHB4JywgaGVpZ2h0OiAnMjQwcHgnLCBiYWNrZ3JvdW5kOiAnIzE4MTgxOCcsIGJvcmRlclJhZGl1czogJ3ZhcigtLXJhZGl1cy1sZyknLCBvdmVyZmxvdzogJ2hpZGRlbicsIGJveFNoYWRvdzogJ3ZhcigtLXNoYWRvdy14bCknIH19PlxyXG4gICAgICAgICAgICAgIHtzcG90aWZ5U3RhdHVzLml0ZW0/LmFsYnVtPy5pbWFnZXM/LlswXT8udXJsID8gKFxyXG4gICAgICAgICAgICAgICAgPGltZyBzcmM9e3Nwb3RpZnlTdGF0dXMuaXRlbS5hbGJ1bS5pbWFnZXNbMF0udXJsfSBhbHQ9XCJBbGJ1bSBBcnRcIiBzdHlsZT17eyB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJywgb2JqZWN0Rml0OiAnY292ZXInIH19IC8+XHJcbiAgICAgICAgICAgICAgKSA6IChcclxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDZW50ZXI6ICdjZW50ZXInLCBjb2xvcjogJyM1NTUnIH19PlxyXG4gICAgICAgICAgICAgICAgICA8TXVzaWMgc2l6ZT17ODB9IC8+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICApfVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAge3Nwb3RpZnlTdGF0dXMuaXNfcGxheWluZyAmJiAoXHJcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBwb3NpdGlvbjogJ2Fic29sdXRlJywgYm90dG9tOiAnLTEwcHgnLCByaWdodDogJy0xMHB4Jywgd2lkdGg6ICc0MHB4JywgaGVpZ2h0OiAnNDBweCcsIGJhY2tncm91bmQ6ICcjMWRiOTU0JywgYm9yZGVyUmFkaXVzOiAnNTAlJywgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBjb2xvcjogJ3doaXRlJywgYm9yZGVyOiAnNHB4IHNvbGlkIHZhcigtLWJnLWNhcmQpJyB9fT5cclxuICAgICAgICAgICAgICAgIDxSZWZyZXNoQ3cgc2l6ZT17MjB9IGNsYXNzTmFtZT1cImFuaW1hdGUtc3BpblwiIC8+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICl9XHJcbiAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IG1heFdpZHRoOiAnNDAwcHgnIH19PlxyXG4gICAgICAgICAgICA8aDIgc3R5bGU9e3sgZm9udFNpemU6ICd2YXIoLS1mcy14bCknLCBmb250V2VpZ2h0OiAndmFyKC0tZnctYm9sZCknLCBjb2xvcjogJ3doaXRlJywgbWFyZ2luOiAwIH19PntzcG90aWZ5U3RhdHVzLml0ZW0/Lm5hbWUgfHwgJ05vdGhpbmcgUGxheWluZyd9PC9oMj5cclxuICAgICAgICAgICAgPHAgc3R5bGU9e3sgY29sb3I6ICd2YXIoLS10ZXh0LXRlcnRpYXJ5KScsIG1hcmdpblRvcDogJ3ZhcigtLXNwLTEpJyB9fT57c3BvdGlmeVN0YXR1cy5pdGVtPy5hcnRpc3RzPy5tYXAoYSA9PiBhLm5hbWUpLmpvaW4oJywgJykgfHwgJ0Nvbm5lY3QgYSBkZXZpY2UnfTwvcD5cclxuICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBnYXA6ICd2YXIoLS1zcC00KScsIG1hcmdpblRvcDogJ3ZhcigtLXNwLTIpJyB9fT5cclxuICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiB3aW5kb3cuYXBpLnNwb3RpZnkuc2tpcFByZXZpb3VzKCl9IGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLW91dGxpbmVcIiBzdHlsZT17eyBib3JkZXJSYWRpdXM6ICc1MCUnLCB3aWR0aDogJzUwcHgnLCBoZWlnaHQ6ICc1MHB4JywgcGFkZGluZzogMCwganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19PlxyXG4gICAgICAgICAgICAgIDxQbGF5IHNpemU9ezIwfSBzdHlsZT17eyB0cmFuc2Zvcm06ICdyb3RhdGUoMTgwZGVnKScgfX0gLz5cclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gd2luZG93LmFwaS5zcG90aWZ5LnRvZ2dsZVBsYXliYWNrKCl9IGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLXByaW1hcnlcIiBzdHlsZT17eyBib3JkZXJSYWRpdXM6ICc1MCUnLCB3aWR0aDogJzYwcHgnLCBoZWlnaHQ6ICc2MHB4JywgcGFkZGluZzogMCwganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBiYWNrZ3JvdW5kOiAnIzFkYjk1NCcgfX0+XHJcbiAgICAgICAgICAgICAge3Nwb3RpZnlTdGF0dXMuaXNfcGxheWluZyA/IDxkaXYgc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBnYXA6ICc0cHgnIH19PjxkaXYgc3R5bGU9e3sgd2lkdGg6ICc0cHgnLCBoZWlnaHQ6ICcyMHB4JywgYmFja2dyb3VuZDogJ3doaXRlJyB9fSAvPjxkaXYgc3R5bGU9e3sgd2lkdGg6ICc0cHgnLCBoZWlnaHQ6ICcyMHB4JywgYmFja2dyb3VuZDogJ3doaXRlJyB9fSAvPjwvZGl2PiA6IDxQbGF5IHNpemU9ezI0fSBmaWxsPVwid2hpdGVcIiAvPn1cclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gd2luZG93LmFwaS5zcG90aWZ5LnNraXBOZXh0KCl9IGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLW91dGxpbmVcIiBzdHlsZT17eyBib3JkZXJSYWRpdXM6ICc1MCUnLCB3aWR0aDogJzUwcHgnLCBoZWlnaHQ6ICc1MHB4JywgcGFkZGluZzogMCwganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInIH19PlxyXG4gICAgICAgICAgICAgIDxQbGF5IHNpemU9ezIwfSAvPlxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAndmFyKC0tc3AtNCknLCBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLCBnYXA6ICd2YXIoLS1zcC00KScsIHdpZHRoOiAnMTAwJScsIG1heFdpZHRoOiAnMzUwcHgnIH19PlxyXG4gICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLCBwYWRkaW5nOiAndmFyKC0tc3AtNCknLCBiYWNrZ3JvdW5kOiAncmdiYSgyOSwgMTg1LCA4NCwgMC4wNSknLCBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyOSwgMTg1LCA4NCwgMC4yKScsIGJvcmRlclJhZGl1czogJ3ZhcigtLXJhZGl1cy1sZyknIH19PlxyXG4gICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IHRleHRBbGlnbjogJ2xlZnQnIH19PlxyXG4gICAgICAgICAgICAgICAgICA8cCBzdHlsZT17eyBmb250U2l6ZTogJ3ZhcigtLWZzLXNtKScsIGZvbnRXZWlnaHQ6ICdib2xkJywgY29sb3I6ICcjMWRiOTU0JyB9fT5Jbi1HYW1lIENvbnRyb2xzPC9wPlxyXG4gICAgICAgICAgICAgICAgICA8cCBzdHlsZT17eyBmb250U2l6ZTogJzEwcHgnLCBjb2xvcjogJ3ZhcigtLXRleHQtbXV0ZWQpJyB9fT5Vc2UgTnVtcGFkIDQvNiBpbiB5b3VyIHRyYWN0b3I8L3A+XHJcbiAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICA8YnV0dG9uIFxyXG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXt0b2dnbGVTcG90aWZ5SG90a2V5c31cclxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgYnRuLW11c2ljICR7dXNlU3BvdGlmeUhvdGtleXMgPyAnYnRuLW11c2ljLS1wcmltYXJ5JyA6ICdidG4tbXVzaWMtLW91dGxpbmUnfWB9XHJcbiAgICAgICAgICAgICAgICAgIHN0eWxlPXt7IGJhY2tncm91bmQ6IHVzZVNwb3RpZnlIb3RrZXlzID8gJyMxZGI5NTQnIDogJycsIHBhZGRpbmc6ICc2cHggMTJweCcsIGZvbnRTaXplOiAnMTBweCcgfX1cclxuICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgIHt1c2VTcG90aWZ5SG90a2V5cyA/ICdFTkFCTEVEJyA6ICdESVNBQkxFRCd9XHJcbiAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgKSA6IChcclxuICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBnYXA6ICd2YXIoLS1zcC00KScgfX0+XHJcbiAgICAgICAgICA8ZGl2IHN0eWxlPXt7IHdpZHRoOiAnODBweCcsIGhlaWdodDogJzgwcHgnLCBiYWNrZ3JvdW5kOiAnIzFkYjk1NCcsIGJvcmRlclJhZGl1czogJzUwJScsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgY29sb3I6ICd3aGl0ZScsIG1hcmdpbkJvdHRvbTogJ3ZhcigtLXNwLTQpJyB9fT5cclxuICAgICAgICAgICAgPE11c2ljIHNpemU9ezQwfSAvPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8aDIgc3R5bGU9e3sgZm9udFNpemU6ICd2YXIoLS1mcy14bCknLCBjb2xvcjogJ3doaXRlJyB9fT5TcG90aWZ5IFJlbW90ZSBDb250cm9sPC9oMj5cclxuICAgICAgICAgIDxwIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0tdGV4dC1tdXRlZCknLCBtYXhXaWR0aDogJzMwMHB4JyB9fT5cclxuICAgICAgICAgICAgQ29udHJvbCB5b3VyIFNwb3RpZnkgcGxheWJhY2sgZGlyZWN0bHkgZnJvbSB5b3VyIHRyYWN0b3IncyBkYXNoYm9hcmQuXHJcbiAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZVNwb3RpZnlMb2dpbn0gY2xhc3NOYW1lPVwiYnRuLW11c2ljIGJ0bi1tdXNpYy0tcHJpbWFyeVwiIHN0eWxlPXt7IGJhY2tncm91bmQ6ICcjMWRiOTU0JywgbWFyZ2luVG9wOiAndmFyKC0tc3AtNCknLCBwYWRkaW5nOiAndmFyKC0tc3AtMykgdmFyKC0tc3AtOCknLCBib3JkZXJSYWRpdXM6ICd2YXIoLS1yYWRpdXMtZnVsbCknIH19PlxyXG4gICAgICAgICAgICBDb25uZWN0IFNwb3RpZnlcclxuICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICApfVxyXG4gICAgPC9kaXY+XHJcbiAgKTtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDxkaXYgY2xhc3NOYW1lPVwibXVzaWMtcGFnZVwiPlxyXG4gICAgICB7LyogSGVhZGVyIFNlY3Rpb24gKi99XHJcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXVzaWMtaGVhZGVyXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJoZWFkZXItaW5mb1wiPlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJoZWFkZXItaWNvblwiPlxyXG4gICAgICAgICAgICA8TXVzaWMgY2xhc3NOYW1lPVwidy0xMCBoLTEwIHRleHQtd2hpdGVcIiAvPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImhlYWRlci10ZXh0XCI+XHJcbiAgICAgICAgICAgIDxoMT5NeSBNdXNpYyBMaWJyYXJ5PC9oMT5cclxuICAgICAgICAgICAgPHA+XHJcbiAgICAgICAgICAgICAgU3luYyB5b3VyIHBlcnNvbmFsIE1QMyBjb2xsZWN0aW9uIHdpdGggRmFybWluZyBTaW11bGF0b3IgMjUgYW5kIHVzZSB5b3VyIHRyYWN0b3IncyBjb250cm9scyB0byBza2lwIHRyYWNrcy5cclxuICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaGVhZGVyLWFjdGlvbnNcIj5cclxuICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsMjU1LDI1NSwwLjA1KScsIHBhZGRpbmc6ICc0cHgnLCBib3JkZXJSYWRpdXM6ICd2YXIoLS1yYWRpdXMtbWQpJywgbWFyZ2luUmlnaHQ6ICd2YXIoLS1zcC00KScgfX0+XHJcbiAgICAgICAgICAgICA8YnV0dG9uIFxyXG4gICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0QWN0aXZlVGFiKCdsb2NhbCcpfVxyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgYnRuLW11c2ljICR7YWN0aXZlVGFiID09PSAnbG9jYWwnID8gJ2J0bi1tdXNpYy0tb3V0bGluZScgOiAnJ31gfVxyXG4gICAgICAgICAgICAgICAgc3R5bGU9e3sgYmFja2dyb3VuZDogYWN0aXZlVGFiID09PSAnbG9jYWwnID8gJ3JnYmEoMjU1LDI1NSwyNTUsMC4xKScgOiAndHJhbnNwYXJlbnQnLCBib3JkZXI6ICdub25lJywgZm9udFNpemU6ICcxMnB4JyB9fVxyXG4gICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICBMb2NhbCBNdXNpY1xyXG4gICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgICA8YnV0dG9uIFxyXG4gICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0QWN0aXZlVGFiKCdzcG90aWZ5Jyl9XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2BidG4tbXVzaWMgJHthY3RpdmVUYWIgPT09ICdzcG90aWZ5JyA/ICdidG4tbXVzaWMtLW91dGxpbmUnIDogJyd9YH1cclxuICAgICAgICAgICAgICAgIHN0eWxlPXt7IGJhY2tncm91bmQ6IGFjdGl2ZVRhYiA9PT0gJ3Nwb3RpZnknID8gJ3JnYmEoMjU1LDI1NSwyNTUsMC4xKScgOiAndHJhbnNwYXJlbnQnLCBib3JkZXI6ICdub25lJywgZm9udFNpemU6ICcxMnB4JywgY29sb3I6IGFjdGl2ZVRhYiA9PT0gJ3Nwb3RpZnknID8gJyMxZGI5NTQnIDogJycgfX1cclxuICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgU3BvdGlmeVxyXG4gICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICB7YWN0aXZlVGFiID09PSAnbG9jYWwnICYmIChcclxuICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZVNlbGVjdEZvbGRlcn0gY2xhc3NOYW1lPVwiYnRuLW11c2ljIGJ0bi1tdXNpYy0tb3V0bGluZVwiPlxyXG4gICAgICAgICAgICAgICAgPEZvbGRlck9wZW4gc2l6ZT17MTh9IC8+XHJcbiAgICAgICAgICAgICAgICA8c3Bhbj5TZWxlY3QgRm9sZGVyPC9zcGFuPlxyXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHtpc011c2ljU3luY2VkID8gKFxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtoYW5kbGVVbmxpbmt9IGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLWRhbmdlclwiPlxyXG4gICAgICAgICAgICAgICAgICA8VW5saW5rIHNpemU9ezE4fSAvPlxyXG4gICAgICAgICAgICAgICAgICA8c3Bhbj5VbmxpbmsgR2FtZTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICkgOiAoXHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9e2hhbmRsZVN5bmN9XHJcbiAgICAgICAgICAgICAgICAgIGRpc2FibGVkPXtzeW5jaW5nIHx8ICFtdXNpY0ZvbGRlclBhdGh9XHJcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLXByaW1hcnlcIlxyXG4gICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICA8UmVmcmVzaEN3IHNpemU9ezE4fSBjbGFzc05hbWU9e3N5bmNpbmcgPyAnYW5pbWF0ZS1zcGluJyA6ICcnfSAvPlxyXG4gICAgICAgICAgICAgICAgICA8c3Bhbj5TeW5jIHdpdGggR2FtZTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICl9XHJcbiAgICAgICAgICAgIDwvPlxyXG4gICAgICAgICAgKX1cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9kaXY+XHJcblxyXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm11c2ljLWdyaWRcIj5cclxuICAgICAgICB7LyogTWFpbiBDb250ZW50IEFyZWEgKi99XHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0cmFjay1zZWN0aW9uXCI+XHJcbiAgICAgICAgICB7YWN0aXZlVGFiID09PSAnbG9jYWwnID8gKFxyXG4gICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi10aXRsZVwiPlxyXG4gICAgICAgICAgICAgICAgPGgyPlxyXG4gICAgICAgICAgICAgICAgICA8RGlzYzMgc2l6ZT17MjB9IHN0eWxlPXt7IGNvbG9yOiAndmFyKC0tYWNjZW50MiknIH19IC8+XHJcbiAgICAgICAgICAgICAgICAgIERldGVjdGVkIFRyYWNrc1xyXG4gICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBmb250U2l6ZTogJ3ZhcigtLWZzLXNtKScsIGNvbG9yOiAndmFyKC0tdGV4dC1tdXRlZCknLCBmb250V2VpZ2h0OiAnbm9ybWFsJywgbWFyZ2luTGVmdDogJ3ZhcigtLXNwLTIpJyB9fT5cclxuICAgICAgICAgICAgICAgICAgICAoe3RyYWNrcy5sZW5ndGh9IGZpbGVzKVxyXG4gICAgICAgICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8L2gyPlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRyYWNrLWNvbnRhaW5lclwiPlxyXG4gICAgICAgICAgICAgICAge2xvYWRpbmcgPyAoXHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktc3RhdGVcIj5cclxuICAgICAgICAgICAgICAgICAgICA8UmVmcmVzaEN3IHNpemU9ezQwfSBjbGFzc05hbWU9XCJhbmltYXRlLXNwaW5cIiBzdHlsZT17eyBvcGFjaXR5OiAwLjMgfX0gLz5cclxuICAgICAgICAgICAgICAgICAgICA8cCBzdHlsZT17eyBtYXJnaW5Ub3A6ICd2YXIoLS1zcC00KScsIGNvbG9yOiAndmFyKC0tdGV4dC1tdXRlZCknIH19PlNjYW5uaW5nIHlvdXIgbXVzaWMuLi48L3A+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKSA6IHRyYWNrcy5sZW5ndGggPiAwID8gKFxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRyYWNrLWxpc3RcIj5cclxuICAgICAgICAgICAgICAgICAgICB7dHJhY2tzLnNsaWNlKDAsIDEwMCkubWFwKCh0cmFjaywgaWR4KSA9PiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17aWR4fSBjbGFzc05hbWU9XCJ0cmFjay1pdGVtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidHJhY2staW5mb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidHJhY2stcGxheS1pY29uXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8UGxheSBzaXplPXsxNH0gLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRyYWNrLWRldGFpbHNcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRyYWNrLW5hbWVcIj57dHJhY2submFtZX08L3A+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0cmFjay1wYXRoXCI+e3RyYWNrLnJlbGF0aXZlUGF0aH08L3A+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8TXVzaWMgc2l6ZT17MTR9IHN0eWxlPXt7IG9wYWNpdHk6IDAuMiB9fSAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgKSl9XHJcbiAgICAgICAgICAgICAgICAgICAge3RyYWNrcy5sZW5ndGggPiAxMDAgJiYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBwYWRkaW5nOiAndmFyKC0tc3AtNCknLCB0ZXh0QWxpZ246ICdjZW50ZXInLCBjb2xvcjogJ3ZhcigtLXRleHQtbXV0ZWQpJywgZm9udFNpemU6ICd2YXIoLS1mcy14cyknLCBmb250U3R5bGU6ICdpdGFsaWMnIH19PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBBbmQge3RyYWNrcy5sZW5ndGggLSAxMDB9IG1vcmUgdHJhY2tzLi4uXHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICApfVxyXG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICkgOiAoXHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktc3RhdGVcIj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImVtcHR5LWljb25cIj5cclxuICAgICAgICAgICAgICAgICAgICAgIDxGb2xkZXJPcGVuIHNpemU9ezMyfSAvPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDxoMyBzdHlsZT17eyBjb2xvcjogJ3ZhcigtLXRleHQtc2Vjb25kYXJ5KScgfX0+Tm8gTXVzaWMgU2VsZWN0ZWQ8L2gzPlxyXG4gICAgICAgICAgICAgICAgICAgIDxwIHN0eWxlPXt7IGNvbG9yOiAndmFyKC0tdGV4dC1tdXRlZCknLCBtYXJnaW5Ub3A6ICd2YXIoLS1zcC0yKScsIG1heFdpZHRoOiAnMjUwcHgnIH19PlxyXG4gICAgICAgICAgICAgICAgICAgICAgQ2xpY2sgXCJTZWxlY3QgRm9sZGVyXCIgdG8gY2hvb3NlIHdoZXJlIHlvdSBrZWVwIHlvdXIgbXVzaWMuXHJcbiAgICAgICAgICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9e2hhbmRsZVNlbGVjdEZvbGRlcn1cclxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImJ0bi1tdXNpYyBidG4tbXVzaWMtLW91dGxpbmVcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgbWFyZ2luVG9wOiAndmFyKC0tc3AtNiknLCBib3JkZXJSYWRpdXM6ICd2YXIoLS1yYWRpdXMtZnVsbCknIH19XHJcbiAgICAgICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgICAgU2VsZWN0IGEgZm9sZGVyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKX1cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC8+XHJcbiAgICAgICAgICApIDogKFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRyYWNrLWNvbnRhaW5lclwiPlxyXG4gICAgICAgICAgICAgICB7cmVuZGVyU3BvdGlmeVRhYigpfVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICl9XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgIHsvKiBTdGF0dXMgJiBJbmZvICovfVxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLXNlY3Rpb25cIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLWNhcmRcIj5cclxuICAgICAgICAgICAgPGgyIHN0eWxlPXt7IGZvbnRTaXplOiAndmFyKC0tZnMtbWQpJywgY29sb3I6ICd2YXIoLS10ZXh0LXByaW1hcnkpJywgbWFyZ2luQm90dG9tOiAndmFyKC0tc3AtNiknIH19PlN5c3RlbSBTdGF0dXM8L2gyPlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzdGF0dXMtaXRlbVwiPlxyXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLWxhYmVsXCI+U291cmNlIFBhdGg8L2Rpdj5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInN0YXR1cy12YWx1ZVwiPnttdXNpY0ZvbGRlclBhdGggfHwgJ05vdCBzZXQnfTwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLWl0ZW1cIj5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInN0YXR1cy1sYWJlbFwiPkdhbWUgTXVzaWMgUGF0aDwvZGl2PlxyXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLXZhbHVlXCI+e2dhbWVNdXNpY1BhdGggfHwgJ0F1dG8tZGV0ZWN0aW5nLi4uJ308L2Rpdj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YHN5bmMtYmFkZ2UgJHtpc011c2ljU3luY2VkID8gJ3N5bmMtYmFkZ2UtLWFjdGl2ZScgOiAnc3luYy1iYWRnZS0taW5hY3RpdmUnfWB9PlxyXG4gICAgICAgICAgICAgIHtpc011c2ljU3luY2VkID8gKFxyXG4gICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgPENoZWNrQ2lyY2xlMiBzaXplPXsyMH0gLz5cclxuICAgICAgICAgICAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAndmFyKC0tZnMtc20pJyB9fT5BY3RpdmUgU3luYzwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZm9udFNpemU6ICcxMHB4Jywgb3BhY2l0eTogMC43LCBmb250V2VpZ2h0OiAnbm9ybWFsJyB9fT5GaWxlcyBhcmUgbGlua2VkIHRvIGdhbWU8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8Lz5cclxuICAgICAgICAgICAgICApIDogKFxyXG4gICAgICAgICAgICAgICAgPD5cclxuICAgICAgICAgICAgICAgICAgPEFsZXJ0Q2lyY2xlIHNpemU9ezIwfSAvPlxyXG4gICAgICAgICAgICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZm9udFNpemU6ICd2YXIoLS1mcy1zbSknIH19Pk5vdCBTeW5jZWQ8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGZvbnRTaXplOiAnMTBweCcsIG9wYWNpdHk6IDAuNywgZm9udFdlaWdodDogJ25vcm1hbCcgfX0+Q2xpY2sgU3luYyB0byBlbmFibGU8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8Lz5cclxuICAgICAgICAgICAgICApfVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgIHsvKiBLZXlib2FyZCBDb250cm9scyBHdWlkZSAqL31cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3RhdHVzLWNhcmRcIiBzdHlsZT17eyBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsMjU1LDI1NSwwLjAyKScgfX0+XHJcbiAgICAgICAgICAgIDxoMiBzdHlsZT17eyBmb250U2l6ZTogJ3ZhcigtLWZzLW1kKScsIGNvbG9yOiAndmFyKC0tdGV4dC1wcmltYXJ5KScsIG1hcmdpbkJvdHRvbTogJ3ZhcigtLXNwLTQpJyB9fT5Jbi1HYW1lIENvbnRyb2xzPC9oMj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTNcIiBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLCBnYXA6ICd2YXIoLS1zcC0zKScgfX0+XHJcbiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBqdXN0aWZ5Q29udGVudDogJ3NwYWNlLWJldHdlZW4nLCBwYWRkaW5nOiAndmFyKC0tc3AtMikgdmFyKC0tc3AtMyknLCBiYWNrZ3JvdW5kOiAncmdiYSgyNTUsMjU1LDI1NSwwLjAzKScsIGJvcmRlclJhZGl1czogJ3ZhcigtLXJhZGl1cy1tZCknIH19PlxyXG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZm9udFNpemU6ICd2YXIoLS1mcy14cyknLCBjb2xvcjogJ3ZhcigtLXRleHQtc2Vjb25kYXJ5KScgfX0+VG9nZ2xlIFJhZGlvPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPGtiZCBzdHlsZT17eyBiYWNrZ3JvdW5kOiAnIzMzNDE1NScsIGNvbG9yOiAnd2hpdGUnLCBwYWRkaW5nOiAnMnB4IDhweCcsIGJvcmRlclJhZGl1czogJzRweCcsIGZvbnRTaXplOiAnMTBweCcsIGZvbnRXZWlnaHQ6ICdib2xkJywgYm9yZGVyQm90dG9tOiAnMnB4IHNvbGlkICMxZTI5M2InIH19PjU8L2tiZD5cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGp1c3RpZnlDb250ZW50OiAnc3BhY2UtYmV0d2VlbicsIHBhZGRpbmc6ICd2YXIoLS1zcC0yKSB2YXIoLS1zcC0zKScsIGJhY2tncm91bmQ6ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpJywgYm9yZGVyUmFkaXVzOiAndmFyKC0tcmFkaXVzLW1kKScgfX0+XHJcbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT17eyBmb250U2l6ZTogJ3ZhcigtLWZzLXhzKScsIGNvbG9yOiAndmFyKC0tdGV4dC1zZWNvbmRhcnkpJyB9fT5OZXh0IFN0YXRpb248L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8a2JkIHN0eWxlPXt7IGJhY2tncm91bmQ6ICcjMzM0MTU1JywgY29sb3I6ICd3aGl0ZScsIHBhZGRpbmc6ICcycHggOHB4JywgYm9yZGVyUmFkaXVzOiAnNHB4JywgZm9udFNpemU6ICcxMHB4JywgZm9udFdlaWdodDogJ2JvbGQnLCBib3JkZXJCb3R0b206ICcycHggc29saWQgIzFlMjkzYicgfX0+Ljwva2JkPlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJywgcGFkZGluZzogJ3ZhcigtLXNwLTIpIHZhcigtLXNwLTMpJywgYmFja2dyb3VuZDogJ3JnYmEoMjU1LDI1NSwyNTUsMC4wMyknLCBib3JkZXJSYWRpdXM6ICd2YXIoLS1yYWRpdXMtbWQpJyB9fT5cclxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGZvbnRTaXplOiAndmFyKC0tZnMteHMpJywgY29sb3I6ICd2YXIoLS10ZXh0LXNlY29uZGFyeSknIH19Pk5leHQgVHJhY2s8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgZ2FwOiAnNHB4JyB9fT5cclxuICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZm9udFNpemU6ICc5cHgnLCBjb2xvcjogJ3ZhcigtLXRleHQtbXV0ZWQpJywgYWxpZ25TZWxmOiAnY2VudGVyJywgbWFyZ2luUmlnaHQ6ICc0cHgnIH19Pk5VTTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgPGtiZCBzdHlsZT17eyBiYWNrZ3JvdW5kOiAnIzMzNDE1NScsIGNvbG9yOiAnd2hpdGUnLCBwYWRkaW5nOiAnMnB4IDhweCcsIGJvcmRlclJhZGl1czogJzRweCcsIGZvbnRTaXplOiAnMTBweCcsIGZvbnRXZWlnaHQ6ICdib2xkJywgYm9yZGVyQm90dG9tOiAnMnB4IHNvbGlkICMxZTI5M2InIH19PjY8L2tiZD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJywgcGFkZGluZzogJ3ZhcigtLXNwLTIpIHZhcigtLXNwLTMpJywgYmFja2dyb3VuZDogJ3JnYmEoMjU1LDI1NSwyNTUsMC4wMyknLCBib3JkZXJSYWRpdXM6ICd2YXIoLS1yYWRpdXMtbWQpJyB9fT5cclxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPXt7IGZvbnRTaXplOiAndmFyKC0tZnMteHMpJywgY29sb3I6ICd2YXIoLS10ZXh0LXNlY29uZGFyeSknIH19PlByZXYgVHJhY2s8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgZ2FwOiAnNHB4JyB9fT5cclxuICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZm9udFNpemU6ICc5cHgnLCBjb2xvcjogJ3ZhcigtLXRleHQtbXV0ZWQpJywgYWxpZ25TZWxmOiAnY2VudGVyJywgbWFyZ2luUmlnaHQ6ICc0cHgnIH19Pk5VTTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgPGtiZCBzdHlsZT17eyBiYWNrZ3JvdW5kOiAnIzMzNDE1NScsIGNvbG9yOiAnd2hpdGUnLCBwYWRkaW5nOiAnMnB4IDhweCcsIGJvcmRlclJhZGl1czogJzRweCcsIGZvbnRTaXplOiAnMTBweCcsIGZvbnRXZWlnaHQ6ICdib2xkJywgYm9yZGVyQm90dG9tOiAnMnB4IHNvbGlkICMxZTI5M2InIH19PjQ8L2tiZD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGlwLWNhcmRcIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0aXAtaGVhZGVyXCI+XHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0aXAtaWNvblwiPlxyXG4gICAgICAgICAgICAgICAgPE1pYzIgc2l6ZT17MjB9IC8+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZm9udFdlaWdodDogJ3ZhcigtLWZ3LWJvbGQpJyB9fT5Qcm8gVGlwPC9zcGFuPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPHA+XHJcbiAgICAgICAgICAgICAgT25jZSBzeW5jZWQsIHN0YXJ0IHRoZSBnYW1lIGFuZCBlbnRlciBhIHZlaGljbGUuIEN5Y2xlIHlvdXIgcmFkaW8gc291cmNlcyB1bnRpbCB5b3UgcmVhY2ggXHJcbiAgICAgICAgICAgICAgPHN0cm9uZyBzdHlsZT17eyBjb2xvcjogJ3doaXRlJyB9fT4gXCJNdXNpY1wiPC9zdHJvbmc+LiBcclxuICAgICAgICAgICAgICBVc2UgeW91ciBrZXlib2FyZCAoTnVtcGFkIDQvNikgdG8gc2tpcCB0aHJvdWdoIHlvdXIgcGVyc29uYWwgdHJhY2tzIVxyXG4gICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB3aW5kb3cuYXBpLnNoZWxsLm9wZW5FeHRlcm5hbCgnaHR0cHM6Ly9naXRodWIuY29tL01hcmtUaG9yMTEvZnMyNS1tdC1tb2QtbWFuYWdlci93aWtpJyl9XHJcbiAgICAgICAgICAgICAgc3R5bGU9e3sgYmFja2dyb3VuZDogJ25vbmUnLCBib3JkZXI6ICdub25lJywgY29sb3I6ICd3aGl0ZScsIGZvbnRTaXplOiAnMTBweCcsIGZvbnRXZWlnaHQ6ICdib2xkJywgdGV4dFRyYW5zZm9ybTogJ3VwcGVyY2FzZScsIGxldHRlclNwYWNpbmc6ICcwLjFlbScsIG1hcmdpblRvcDogJ3ZhcigtLXNwLTQpJywgY3Vyc29yOiAncG9pbnRlcicsIGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGdhcDogJzRweCcgfX1cclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIFZpZXcgRnVsbCBHdWlkZSA8RXh0ZXJuYWxMaW5rIHNpemU9ezEwfSAvPlxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gICk7XHJcbn1cclxuIl0sImZpbGUiOiJDOi9Vc2Vycy9NYXJrL0Rlc2t0b3AvR29vZ2xlTW9kTWFuYWdlci9zcmMvcmVuZGVyZXIvcGFnZXMvTXVzaWNQYWdlLmpzeCJ9