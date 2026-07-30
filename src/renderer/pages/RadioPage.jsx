import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Radio as RadioIcon, ExternalLink, Music, Globe, Heart, Check, Play, Pause, Volume2, Info, AlertCircle, RefreshCw, Disc, Link as LinkIcon, Sparkles } from 'lucide-react';
import { useRadioStore } from '../store/useRadioStore';
import { useToastStore } from '../store/useToastStore';

const PRESET_TAGS = ['Rock', 'Pop', 'Country', 'Jazz', 'Dance', 'Metal', 'Classical', 'Oldies', 'News', 'Chill'];
const PRESET_COUNTRIES = [
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'CA', name: 'Canada' },
];

const OFFICIAL_PRESETS = [
    { name: 'Simulation Radio', url: 'http://217.151.151.144:8000/stream', tags: 'Official, Simulation, Pop', language: 'English', country: 'Germany' },
    { name: 'Farming Simulator Radio', url: 'http://217.151.151.144:8001/stream', tags: 'Official, Country, Folk', language: 'English', country: 'Germany' },
];

const SPOTIFY_PRESETS = [
    {
        name: 'Country Farming Hits',
        desc: 'Upbeat country classics and modern hits for working the fields',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1lVhivE98y9',
        openUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX1lVhivE98y9',
        category: 'Country'
    },
    {
        name: 'Farming Chill & Acoustic',
        desc: 'Relaxing acoustic tunes for harvesting and livestock care',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0SM0LYsmbMT',
        openUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0SM0LYsmbMT',
        category: 'Acoustic'
    },
    {
        name: 'Classic Trucker Rock',
        desc: 'High energy classic rock for long hauls and heavy transport',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWEc0B1Y7seG',
        openUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWWEc0B1Y7seG',
        category: 'Rock'
    },
    {
        name: 'Lofi Beats for Farming',
        desc: 'Cozy, chill instrumental lofi beats for night shifts',
        embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM',
        openUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXdLEN7aqioXM',
        category: 'Lofi'
    }
];

const parseSpotifyEmbedUrl = (input) => {
    if (!input) return null;
    let str = input.trim();
    if (str.startsWith('spotify:')) {
        const parts = str.split(':');
        if (parts.length >= 3) {
            return `https://open.spotify.com/embed/${parts[1]}/${parts[2]}`;
        }
    }
    if (str.includes('open.spotify.com/')) {
        const urlWithoutQuery = str.split('?')[0];
        if (urlWithoutQuery.includes('/embed/')) return urlWithoutQuery;
        return urlWithoutQuery.replace('open.spotify.com/', 'open.spotify.com/embed/');
    }
    return null;
};

const RadioPage = () => {
    const { 
        stations, searchResults, isSearching, 
        fetchRadios, searchStations, addStation, removeStation,
        playingStationUrl, setPlayingStation,
        activeSpotifyEmbed, setActiveSpotifyEmbed
    } = useRadioStore();
    const { toast } = useToastStore();
    
    const [query, setQuery] = useState('');
    const [viewMode, setViewMode] = useState('search'); 
    const [isBuffering, setIsBuffering] = useState(false);
    const [volume, setVolume] = useState(0.8);

    const audioRef = React.useRef(null);

    useEffect(() => {
        fetchRadios();
        searchStations({ order: 'votes', limit: 30 });
        
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, []);

    useEffect(() => {
        if (playingStationUrl && audioRef.current) {
            setIsBuffering(true);
            const attemptPlay = (url) => {
                if (!audioRef.current) return;
                let proxyUrl = url;
                if (url.startsWith('https://')) proxyUrl = 'radio-proxy://https/' + url.replace('https://', '');
                else if (url.startsWith('http://')) proxyUrl = 'radio-proxy://http/' + url.replace('http://', '');
                audioRef.current.src = proxyUrl;
                audioRef.current.load();
                audioRef.current.play().then(() => setIsBuffering(false)).catch(() => setIsBuffering(false));
            };
            attemptPlay(playingStationUrl);
        } else if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            setIsBuffering(false);
        }
    }, [playingStationUrl]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        searchStations({ query });
    };

    const handleAdd = async (station) => {
        const result = await addStation(station.url_resolved || station.url);
        if (result.success) toast.success(`Added ${station.name} to game!`);
        else toast.error(result.error || 'Failed to add station');
    };

    const handleRemove = async (href) => {
        if (!confirm('Remove this station from your game?')) return;
        const result = await removeStation(href);
        if (result.success) toast.success('Station removed');
    };

    const handleClearAll = async () => {
        if (!confirm('Remove ALL custom stations?')) return;
        await window.api.radio.remove('__ALL__');
        fetchRadios();
        toast.success('All custom stations cleared');
    };

    const handleOpenSpotifyApp = () => {
        try {
            if (window.api?.shell?.openExternal) {
                window.api.shell.openExternal('spotify://');
                toast.success('Opening Spotify App...');
            } else window.open('https://open.spotify.com', '_blank');
        } catch (e) { window.open('https://open.spotify.com', '_blank'); }
    };

    const handleOpenSpotifyWeb = () => {
        try {
            if (window.api?.shell?.openExternal) window.api.shell.openExternal('https://open.spotify.com');
            else window.open('https://open.spotify.com', '_blank');
        } catch (e) {}
    };

    return (
        <div className="page animate-fade-in custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
            {/* Header Area */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '10px', background: 'rgba(29, 185, 84, 0.15)', color: '#1DB954', borderRadius: '12px' }}>
                            <Disc size={24} />
                        </div>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Spotify & Radio</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '650px', margin: 0 }}>
                        Stream Spotify music while you farm, or add internet radio stations directly to Farming Simulator 25.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={handleOpenSpotifyWeb} style={{ padding: '10px 16px', background: '#1DB954', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(29, 185, 84, 0.3)' }}>
                        <LogIn size={16} /> Sign In / Open Spotify Web
                    </button>
                    <button onClick={handleOpenSpotifyApp} style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} title="Launch installed Spotify Desktop App">
                        <ExternalLink size={16} /> Launch Spotify App
                    </button>
                </div>
            </div>

            {/* Spotify Embedded Player Section */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(29, 185, 84, 0.3)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Disc size={20} style={{ color: '#1DB954' }} />
                        <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Spotify Player & Account</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {SPOTIFY_PRESETS.map((preset, idx) => (
                            <button key={idx} onClick={() => { setActiveSpotifyEmbed(preset.embedUrl); toast.success(`Playing ${preset.name}`); }} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: activeSpotifyEmbed === preset.embedUrl ? '#1DB954' : 'var(--bg-tertiary)', color: activeSpotifyEmbed === preset.embedUrl ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>
                <iframe src={activeSpotifyEmbed || 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1lVhivE98y9'} width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ borderRadius: '12px', border: 'none' }} />
            </div>

            {/* In-Game Radio Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <RadioIcon size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>In-Game Internet Radio</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setViewMode('search')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: viewMode === 'search' ? 'var(--accent)' : 'var(--bg-tertiary)', color: viewMode === 'search' ? 'white' : 'var(--text-secondary)', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Find Stations</button>
                        <button onClick={() => setViewMode('mine')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: viewMode === 'mine' ? 'var(--accent)' : 'var(--bg-tertiary)', color: viewMode === 'mine' ? 'white' : 'var(--text-secondary)', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Added to FS25 ({stations.length})</button>
                    </div>
                </div>

                {viewMode === 'search' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                                <input type="text" placeholder="Search stations by name..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px' }} />
                            </div>
                            <button onClick={handleSearch} style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', border: 'none' }}>Search</button>
                            {playingStationUrl && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--accent-dim)', padding: '6px 16px', borderRadius: '10px', marginLeft: 'auto' }}>
                                    <Volume2 size={16} style={{ color: 'var(--accent)' }} />
                                    <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ width: '80px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', minWidth: '35px' }}>{Math.round(volume * 100)}%</span>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {isSearching ? (
                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                    <RefreshCw className="animate-spin" size={28} style={{ marginBottom: '12px' }} />
                                    <span>Searching radio stations...</span>
                                </div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((station) => {
                                    const resolvedUrl = station.url_resolved || station.url;
                                    const normalizedUrl = resolvedUrl.replace('https://', 'http://');
                                    const isAdded = stations.some(s => s.href.replace('https://', 'http://') === normalizedUrl);
                                    return (
                                        <StationCard key={station.stationuuid} station={station} isAdded={isAdded} isPlaying={playingStationUrl === resolvedUrl} isBuffering={isBuffering && playingStationUrl === resolvedUrl} onPreview={() => setPlayingStation(playingStationUrl === resolvedUrl ? null : resolvedUrl)} onAdd={() => handleAdd(station)} />
                                    );
                                })
                            ) : (
                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                                    <Globe size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)' }}>Find Radio Stations</h3>
                                    <p style={{ margin: 0, textAlign: 'center' }}>Type a station name or genre to search.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {stations.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                <button onClick={handleClearAll} className="btn btn--danger btn--sm" style={{ padding: '6px 12px', fontSize: '12px' }}><Trash2 size={14} /> Clear All</button>
                            </div>
                        )}
                        {stations.length > 0 ? (
                            stations.map((station, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <div style={{ width: '40px', height: '40px', background: 'var(--accent-dim)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><Music size={20} /></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{station.href}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Internet Stream</div>
                                    </div>
                                    <button onClick={() => handleRemove(station.href)} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                </div>
                            ))
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                                <AlertCircle size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)' }}>No Custom Stations Yet</h3>
                                <p style={{ margin: 0 }}>Search for stations to add them to your game.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Hidden Audio Element */}
            <audio 
                ref={audioRef} 
                onEnded={() => setPlayingStation(null)}
                onError={(e) => {
                    const code = audioRef.current?.error?.code;
                    const message = getAudioErrorMessage(code);
                    console.error('Audio Native Error:', code, message);
                    if (playingStationUrl) {
                        toast.error(`Playback Error: ${message}`);
                        setPlayingStation(null);
                    }
                }}
            />
        </div>
    );
};

const StationCard = ({ station, isAdded, isPlaying, isBuffering, onAdd, onPreview }) => {
    return (
        <div className="station-card" style={{ 
            background: 'var(--bg-card)', 
            borderRadius: '16px', 
            border: isPlaying ? '1px solid var(--accent)' : '1px solid var(--border)', 
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s',
            boxShadow: isPlaying ? '0 0 20px rgba(var(--accent-rgb), 0.2)' : '0 4px 12px rgba(0,0,0,0.1)'
        }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-tertiary)', flexShrink: 0, overflow: 'hidden', position: 'relative', cursor: 'pointer' }} onClick={onPreview}>
                    {station.favicon ? (
                        <img src={station.favicon} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: (isPlaying || isBuffering) ? 0.3 : 1 }} alt="" onError={(e) => e.target.style.display='none'} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            <RadioIcon size={24} />
                        </div>
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', opacity: (isPlaying || isBuffering) ? 1 : 0, transition: 'opacity 0.2s' }}>
                        {isBuffering ? <RefreshCw size={24} className="animate-spin" /> : isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {station.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {station.tags ? station.tags.split(',').slice(0, 2).join(', ') : station.country || 'Unknown'}
                    </div>
                </div>
                <button 
                    onClick={onPreview}
                    style={{ padding: '8px', borderRadius: '8px', background: isPlaying ? 'var(--accent)' : 'var(--bg-tertiary)', color: isPlaying ? 'white' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    {isBuffering ? <RefreshCw size={16} className="animate-spin" /> : isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
            </div>

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {station.language && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{station.language.split(',')[0]}</span>}
                {station.bitrate && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{station.bitrate}kbps</span>}
                {station.votes && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{station.votes} votes</span>}
            </div>

            <button 
                onClick={onAdd}
                disabled={isAdded}
                style={{ 
                    marginTop: '4px',
                    padding: '10px', 
                    borderRadius: '10px', 
                    border: 'none', 
                    background: isAdded ? 'var(--bg-tertiary)' : 'var(--accent)',
                    color: isAdded ? 'var(--text-secondary)' : 'white',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: isAdded ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                }}
            >
                {isAdded ? (
                    <><Check size={16} /> In Game</>
                ) : (
                    <><Plus size={16} /> Add to Game</>
                )}
            </button>
        </div>
    );
};

export default RadioPage;
