import { CustomSlider } from '../components/common/CustomSlider';
import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Radio as RadioIcon, ExternalLink, Music, Globe, Check, Volume2, AlertCircle, RefreshCw, Disc, LogIn, Play, Pause, UserCheck, Link2, X } from 'lucide-react';
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
    { name: 'Simulator Radio', url: 'https://simulatorradio.stream/stream.mp3', tags: 'Official, Simulation, Pop', language: 'English', country: 'United Kingdom' },
    { name: 'Truckers FM', url: 'https://live.truckers.fm/', tags: 'Official, Simulation, Variety', language: 'English', country: 'United Kingdom' },
    { name: 'TruckStopRadio Country', url: 'https://oreo.truckstopradio.co.uk/listen/tsr_country/radio.mp3', tags: 'Simulation, Country', language: 'English', country: 'United Kingdom' },
    { name: 'TruckStopRadio Rock', url: 'https://oreo.truckstopradio.co.uk/listen/tsr_rock/radio.mp3', tags: 'Simulation, Rock', language: 'English', country: 'United Kingdom' },
];

const RadioPage = () => {
    const { 
        stations, searchResults, isSearching, 
        fetchRadios, searchStations, addStation, removeStation,
        playingStationUrl, setPlayingStation,
        spotifyAccount, setSpotifyAccount, clearSpotifyAccount,
        overrideBuiltins, isCompanionInstalled, setOverrideBuiltins
    } = useRadioStore();
    const { toast } = useToastStore();
    
    const [query, setQuery] = useState('');
    const [country, setCountry] = useState('');
    const [tag, setTag] = useState('');
    const [viewMode, setViewMode] = useState('search'); // 'search' or 'mine'
    const [isBuffering, setIsBuffering] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [spotifyInput, setSpotifyInput] = useState('');

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

    // Automatically purge broken localhost/spotify placeholder streams if present
    useEffect(() => {
        if (stations && stations.length > 0) {
            const broken = stations.filter(s => s.href && (s.href.includes('localhost:8000') || s.href.includes('/spotify_account')));
            broken.forEach(s => removeStation(s.href));
        }
    }, [stations]);

    const toggleTag = (t) => {
        const newTag = tag === t.toLowerCase() ? '' : t.toLowerCase();
        setTag(newTag);
        searchStations({ query, country, tag: newTag });
    };

    const toggleCountry = (c) => {
        const newCountry = country === c ? '' : c;
        setCountry(newCountry);
        searchStations({ query, country: newCountry, tag });
    };

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
        searchStations({ query, country, tag });
    };

    const handleAdd = async (station) => {
        const result = await addStation(station.url_resolved || station.url || station.href);
        if (result.success) toast.success(`Added ${station.name || 'Station'} to game!`);
        else toast.error(result.error || 'Failed to add station');
    };

    const handleSaveSpotifyAccount = async () => {
        if (!spotifyInput.trim()) {
            toast.error('Please enter your Spotify profile URL or username.');
            return;
        }
        const accountData = {
            username: spotifyInput.trim().replace('https://open.spotify.com/user/', '').split('?')[0],
            url: spotifyInput.trim().startsWith('http') ? spotifyInput.trim() : `https://open.spotify.com/user/${spotifyInput.trim()}`,
            linkedAt: new Date().toISOString()
        };
        setSpotifyAccount(accountData);
        setSpotifyInput('');
        toast.success(`Spotify account linked (${accountData.username})!`);
    };

    const handleRemove = async (href) => {
        if (!confirm('Remove this station from your game?')) return;
        const result = await removeStation(href);
        if (result.success) {
            fetchRadios();
            toast.success('Station removed');
        }
    };

    const handleClearAll = async () => {
        if (!confirm('Remove ALL custom stations from FS25?')) return;
        await window.api.radio.remove('__ALL__');
        fetchRadios();
        toast.success('All custom stations cleared');
    };

    const handleOpenSpotifyApp = async () => {
        try {
            if (window.api?.radio?.launchSpotify) {
                const res = await window.api.radio.launchSpotify();
                if (res?.success) {
                    if (res.method === 'app') {
                        toast.success('Opening Spotify App...');
                    } else {
                        toast.info('Spotify desktop app not found. Opened Spotify in browser.');
                    }
                    return;
                }
            }
            if (window.api?.shell?.openExternal) {
                await window.api.shell.openExternal('https://open.spotify.com');
            } else {
                window.open('https://open.spotify.com', '_blank');
            }
        } catch (e) {
            console.error('Failed to launch Spotify:', e);
            window.open('https://open.spotify.com', '_blank');
        }
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
                        <div style={{ padding: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '12px' }}>
                            <RadioIcon size={24} />
                        </div>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Radio Stations & Spotify</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '650px', margin: 0 }}>
                        Link your Spotify account, add in-game radio channels to FS25, and operate playback externally.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button 
                        onClick={handleOpenSpotifyApp} 
                        style={{ 
                            padding: '10px 18px', 
                            background: '#1DB954', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '10px', 
                            fontWeight: '700', 
                            fontSize: '13px', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            boxShadow: '0 4px 14px rgba(29, 185, 84, 0.3)' 
                        }} 
                        title="Open Spotify Desktop App (falls back to web if not installed)"
                    >
                        <Disc size={18} /> Launch Spotify App
                    </button>
                </div>
            </div>

            {/* In-Game Companion Mod & Station Override Card */}
            <div style={{ 
                background: 'var(--bg-card)', 
                borderRadius: '16px', 
                padding: '18px 20px', 
                border: overrideBuiltins ? '1px solid var(--accent)' : '1px solid var(--border)', 
                boxShadow: overrideBuiltins ? '0 0 20px rgba(var(--accent-rgb, 59, 130, 246), 0.12)' : '0 4px 16px rgba(0, 0, 0, 0.08)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '14px' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <RadioIcon size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>In-Game Radio Station Override</h3>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Overrides built-in game stations so pressing Next/Previous station in-game cycles strictly through your custom stations.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none', background: 'var(--bg-tertiary)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: overrideBuiltins ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                {overrideBuiltins ? 'Override Active (Custom Only)' : 'Default (Appended to Built-ins)'}
                            </span>
                            <input 
                                type="checkbox"
                                checked={overrideBuiltins}
                                onChange={(e) => {
                                    setOverrideBuiltins(e.target.checked);
                                    toast.success(e.target.checked ? 'In-game radio override enabled' : 'In-game radio override disabled');
                                }}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Spotify Account Sign-In & Link Box */}
            <div style={{ 
                background: 'var(--bg-card)', 
                borderRadius: '16px', 
                padding: '20px', 
                border: spotifyAccount ? '1px solid #1DB954' : '1px solid rgba(29, 185, 84, 0.35)', 
                boxShadow: spotifyAccount ? '0 0 20px rgba(29, 185, 84, 0.15)' : '0 8px 32px rgba(0, 0, 0, 0.15)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(29, 185, 84, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1DB954', flexShrink: 0 }}>
                            <Disc size={24} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Spotify Integration (External App)</h3>
                                {spotifyAccount ? (
                                    <span style={{ padding: '2px 10px', borderRadius: '12px', background: 'rgba(29, 185, 84, 0.2)', color: '#1DB954', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <UserCheck size={12} /> Account Linked
                                    </span>
                                ) : (
                                    <span style={{ padding: '2px 10px', borderRadius: '12px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '600' }}>
                                        Not Linked
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Operate your Spotify playback in the desktop app while playing FS25.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                            onClick={handleOpenSpotifyApp}
                            style={{ 
                                padding: '8px 16px', 
                                borderRadius: '10px', 
                                border: 'none', 
                                background: '#1DB954', 
                                color: 'white', 
                                fontWeight: '700', 
                                fontSize: '12px', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px' 
                            }}
                        >
                            <ExternalLink size={14} /> Open Spotify Player
                        </button>
                    </div>
                </div>

                {spotifyAccount ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(29, 185, 84, 0.08)', borderRadius: '12px', border: '1px solid rgba(29, 185, 84, 0.2)', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Link2 size={16} style={{ color: '#1DB954' }} />
                            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Linked Account:</span>
                            <a href={spotifyAccount.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1DB954', fontWeight: '700', textDecoration: 'underline' }}>
                                {spotifyAccount.username}
                            </a>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={clearSpotifyAccount} style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <X size={14} /> Unlink
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <input 
                            type="text"
                            placeholder="Enter Spotify Profile URL or Username (e.g. https://open.spotify.com/user/...)"
                            value={spotifyInput}
                            onChange={(e) => setSpotifyInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveSpotifyAccount()}
                            style={{
                                flex: 1,
                                minWidth: '280px',
                                padding: '10px 14px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '13px'
                            }}
                        />
                        <button 
                            onClick={handleSaveSpotifyAccount}
                            style={{ padding: '10px 18px', background: '#1DB954', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Link2 size={16} /> Save & Link Account
                        </button>
                        <button 
                            onClick={handleOpenSpotifyWeb}
                            style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <LogIn size={16} /> Sign In on Web
                        </button>
                    </div>
                )}
            </div>

            {/* In-Game Radio Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <RadioIcon size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>FS25 Internet Radio Stations</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setViewMode('search')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: viewMode === 'search' ? 'var(--accent)' : 'var(--bg-tertiary)', color: viewMode === 'search' ? 'white' : 'var(--text-secondary)', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Discover Stations</button>
                        <button onClick={() => setViewMode('mine')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: viewMode === 'mine' ? 'var(--accent)' : 'var(--bg-tertiary)', color: viewMode === 'mine' ? 'white' : 'var(--text-secondary)', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>In-Game Stations ({stations.length})</button>
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
                                    <CustomSlider min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ width: '80px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', minWidth: '35px' }}>{Math.round(volume * 100)}%</span>
                                </div>
                            )}
                        </div>

                        {/* Presets */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--accent)', marginRight: '8px', fontWeight: '700' }}>Official Game Presets:</span>
                            {OFFICIAL_PRESETS.map(p => {
                                const isAdded = stations.some(s => s.href && s.href.replace(/^https?:\/\//, '').replace(/\/$/, '') === p.url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
                                return (
                                    <button 
                                        key={p.name}
                                        onClick={() => handleAdd(p)}
                                        disabled={isAdded}
                                        style={{ 
                                            padding: '6px 12px', 
                                            borderRadius: '20px', 
                                            fontSize: '11px', 
                                            fontWeight: '700',
                                            background: isAdded ? 'var(--bg-tertiary)' : 'var(--accent-dim)',
                                            color: isAdded ? 'var(--text-tertiary)' : 'var(--accent)',
                                            border: '1px solid var(--accent-dim)',
                                            cursor: isAdded ? 'default' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {isAdded ? <Check size={12} /> : <Plus size={12} />} {p.name}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '8px', fontWeight: '600' }}>Genres:</span>
                            {PRESET_TAGS.map(t => (
                                <button 
                                    key={t}
                                    onClick={() => toggleTag(t)}
                                    style={{ 
                                        padding: '6px 12px', 
                                        borderRadius: '20px', 
                                        fontSize: '12px', 
                                        fontWeight: '600',
                                        background: tag === t.toLowerCase() ? 'var(--accent)' : 'var(--bg-tertiary)',
                                        color: tag === t.toLowerCase() ? 'white' : 'var(--text-secondary)',
                                        border: tag === t.toLowerCase() ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
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
                                    const normalizedUrl = resolvedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                    const isAdded = stations.some(s => s.href && s.href.replace(/^https?:\/\//, '').replace(/\/$/, '') === normalizedUrl);
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
                            stations.map((station, idx) => {
                                const isSpotify = station.href && station.href.toLowerCase().includes('spotify');
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: isSpotify ? '1px solid #1DB954' : '1px solid var(--border)' }}>
                                        <div style={{ width: '40px', height: '40px', background: isSpotify ? 'rgba(29, 185, 84, 0.15)' : 'var(--accent-dim)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSpotify ? '#1DB954' : 'var(--accent)' }}>
                                            {isSpotify ? <Disc size={20} /> : <Music size={20} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                                {isSpotify ? 'Spotify Account Radio Channel (External App)' : station.href}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {isSpotify ? (spotifyAccount ? `Linked Account: ${spotifyAccount.username}` : 'External Spotify App Control') : 'Internet Stream'}
                                            </div>
                                        </div>
                                        {isSpotify && (
                                            <button 
                                                onClick={handleOpenSpotifyApp}
                                                style={{ padding: '8px 14px', background: '#1DB954', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                <ExternalLink size={14} /> Open Spotify
                                            </button>
                                        )}
                                        <button onClick={() => handleRemove(station.href)} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }} title="Remove from Game"><Trash2 size={18} /></button>
                                    </div>
                                );
                            })
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

            <audio 
                ref={audioRef} 
                onEnded={() => setPlayingStation(null)}
                onError={() => setPlayingStation(null)}
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
