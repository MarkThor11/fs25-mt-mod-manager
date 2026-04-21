import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Radio as RadioIcon, ExternalLink, Music, Globe, Heart, Check, Play, Pause, Volume2, Info, AlertCircle, RefreshCw } from 'lucide-react';
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

const RadioPage = () => {
    const { 
        stations, searchResults, isSearching, isLoading, 
        fetchRadios, searchStations, addStation, removeStation,
        playingStationUrl, setPlayingStation
    } = useRadioStore();
    const { toast } = useToastStore();
    
    const [query, setQuery] = useState('');
    const [country, setCountry] = useState('');
    const [language, setLanguage] = useState('');
    const [tag, setTag] = useState('');
    const [activeTab, setActiveTab] = useState('search'); 
    const [playbackError, setPlaybackError] = useState(null);
    const [isBuffering, setIsBuffering] = useState(false);
    const [volume, setVolume] = useState(0.8);

    const audioRef = React.useRef(null);

    useEffect(() => {
        fetchRadios();
        // Initial search to populate the page
        searchStations({ order: 'votes', limit: 30 });
        
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, []);

    const toggleTag = (t) => {
        const newTag = tag === t.toLowerCase() ? '' : t.toLowerCase();
        setTag(newTag);
        searchStations({ query, country, language, tag: newTag });
    };

    const toggleCountry = (c) => {
        const newCountry = country === c ? '' : c;
        setCountry(newCountry);
        searchStations({ query, country: newCountry, language, tag });
    };

    useEffect(() => {
        if (playingStationUrl && audioRef.current) {
            setPlaybackError(null);
            setIsBuffering(true);
            
            const attemptPlay = (url) => {
                if (!audioRef.current) return;
                
                // Use radio-proxy protocol to bypass CORS/Mixed Content
                // Format: radio-proxy://https/domain.com/path
                let proxyUrl = url;
                if (url.startsWith('https://')) {
                    proxyUrl = 'radio-proxy://https/' + url.replace('https://', '');
                } else if (url.startsWith('http://')) {
                    proxyUrl = 'radio-proxy://http/' + url.replace('http://', '');
                }

                console.log('[RADIO] Playing through proxy:', proxyUrl);
                audioRef.current.src = proxyUrl;
                audioRef.current.load();
                
                const playPromise = audioRef.current.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        setIsBuffering(false);
                    }).catch(err => {
                        console.error('Proxy playback failed:', err);
                        setIsBuffering(false);
                        setPlayingStation(null);
                        toast.error(`Station unavailable: ${err.message || 'Stream error'}`);
                    });
                }
            };

            attemptPlay(playingStationUrl);
        } else if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            setIsBuffering(false);
        }
    }, [playingStationUrl]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const getAudioErrorMessage = (e) => {
        const error = e?.target?.error;
        if (!error) return "Unknown playback error";
        
        console.error('[AUDIO-ERROR] Code:', error.code, 'Message:', error.message);
        
        switch (error.code) {
            case 1: return "Playback aborted by the browser.";
            case 2: return "Network error: The stream was interrupted or the server is down.";
            case 3: return "Decoding error: This audio format/codec is not supported by the app.";
            case 4: return "Format not supported: The stream URL might be invalid or restricted.";
            default: return `Playback error (Code ${error.code})`;
        }
    };

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        searchStations({ query, country, language, tag });
    };

    const handleAdd = async (station) => {
        const result = await addStation(station.url_resolved || station.url);
        if (result.success) {
            toast.success(`Added ${station.name} to game!`);
        } else {
            toast.error(result.error || 'Failed to add station');
        }
    };

    const handleRemove = async (href) => {
        if (!confirm('Remove this station from your game?')) return;
        const result = await removeStation(href);
        if (result.success) {
            toast.success('Station removed');
        }
    };

    const handleClearAll = async () => {
        if (!confirm('This will remove ALL custom stations. The game will revert to its internal defaults unless you add new ones. Proceed?')) return;
        // In radioManager.js, saveRadios([]) will clear the file
        const result = await window.api.radio.remove('__ALL__'); // We'll handle this in backend
        fetchRadios();
        toast.success('All custom stations cleared');
    };

    return (
        <div className="page animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            {/* Header Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '10px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '12px' }}>
                        <RadioIcon size={24} />
                    </div>
                    <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Radio Manager</h1>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '600px' }}>
                    Farming Simulator 25 allows you to listen to real internet radio stations while driving. Search for your favorite stations here and add them directly to your game.
                </p>
            </div>

            {/* Tabs & Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <button 
                    onClick={() => setActiveTab('search')}
                    className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
                    style={{ 
                        padding: '8px 16px', 
                        borderRadius: '8px', 
                        border: 'none', 
                        background: activeTab === 'search' ? 'var(--accent)' : 'transparent',
                        color: activeTab === 'search' ? 'white' : 'var(--text-secondary)',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Discover Stations
                </button>
                <button 
                    onClick={() => setActiveTab('mine')}
                    className={`tab-button ${activeTab === 'mine' ? 'active' : ''}`}
                    style={{ 
                        padding: '8px 16px', 
                        borderRadius: '8px', 
                        border: 'none', 
                        background: activeTab === 'mine' ? 'var(--accent)' : 'transparent',
                        color: activeTab === 'mine' ? 'white' : 'var(--text-secondary)',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    In-Game Stations ({stations.length})
                </button>

                <div style={{ flex: 1 }} />

                {activeTab === 'search' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                                <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                                <input 
                                    type="text"
                                    placeholder="Search stations by name..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px 10px 36px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '10px',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                        fontSize: '13px'
                                    }}
                                />
                            </div>
                            
                            <button 
                                onClick={handleSearch}
                                style={{ padding: '10px 24px', background: 'var(--accent)', color: 'white', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
                            >
                                Search
                            </button>

                            <button 
                                onClick={() => {
                                    setQuery(''); setTag(''); setCountry(''); setLanguage('');
                                    searchStations({ order: 'votes' });
                                }}
                                style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border)' }}
                            >
                                Reset Filters
                            </button>

                            {playingStationUrl && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--accent-dim)', padding: '6px 16px', borderRadius: '10px', marginLeft: 'auto' }}>
                                    <Volume2 size={16} style={{ color: 'var(--accent)' }} />
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.05" 
                                        value={volume} 
                                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                                        style={{ width: '80px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', minWidth: '35px' }}>{Math.round(volume * 100)}%</span>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--accent)', marginRight: '8px', fontWeight: '700' }}>Official Game Presets:</span>
                            {OFFICIAL_PRESETS.map(p => {
                                const isAdded = stations.some(s => s.href === p.url);
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
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '8px', fontWeight: '600' }}>Countries:</span>
                            {PRESET_COUNTRIES.map(c => (
                                <button 
                                    key={c.code}
                                    onClick={() => toggleCountry(c.code)}
                                    style={{ 
                                        padding: '6px 12px', 
                                        borderRadius: '20px', 
                                        fontSize: '12px', 
                                        fontWeight: '600',
                                        background: country === c.code ? 'var(--accent)' : 'var(--bg-tertiary)',
                                        color: country === c.code ? 'white' : 'var(--text-secondary)',
                                        border: country === c.code ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                {activeTab === 'search' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {isSearching ? (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                                <RefreshCw className="animate-spin" size={32} style={{ marginBottom: '16px' }} />
                                <span>Scanning the airwaves...</span>
                            </div>
                        ) : searchResults.length > 0 ? (
                            searchResults.map((station) => {
                                const resolvedUrl = station.url_resolved || station.url;
                                const normalizedUrl = resolvedUrl.replace('https://', 'http://');
                                const isAdded = stations.some(s => s.href.replace('https://', 'http://') === normalizedUrl);

                                return (
                                    <StationCard 
                                        key={station.stationuuid} 
                                        station={station} 
                                        isAdded={isAdded}
                                        isPlaying={playingStationUrl === resolvedUrl}
                                        isBuffering={isBuffering && playingStationUrl === resolvedUrl}
                                        onPreview={() => setPlayingStation(playingStationUrl === resolvedUrl ? null : resolvedUrl)}
                                        onAdd={() => handleAdd(station)} 
                                    />
                                );
                            })
                        ) : (
                            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                                <Globe size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Find New Radio Stations</h3>
                                <p style={{ margin: 0, textAlign: 'center', maxWidth: '300px' }}>Type a station name or genre (like "Rock", "Country", or "BBC") to get started.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {stations.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                <button 
                                    onClick={handleClearAll}
                                    className="btn btn--danger btn--sm"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                >
                                    <Trash2 size={14} /> Clear All Custom Stations
                                </button>
                            </div>
                        )}
                        {stations.length > 0 ? (
                            stations.map((station, idx) => (
                                <div key={idx} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '16px', 
                                    padding: '16px', 
                                    background: 'var(--bg-card)', 
                                    borderRadius: '12px', 
                                    border: '1px solid var(--border)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}>
                                    <div style={{ width: '40px', height: '40px', background: 'var(--accent-dim)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                        <Music size={20} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px', wordBreak: 'break-all' }}>
                                            {station.href}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Internet Stream</div>
                                    </div>
                                    <button 
                                        onClick={() => handleRemove(station.href)}
                                        style={{ 
                                            padding: '8px', 
                                            background: 'rgba(239, 68, 68, 0.1)', 
                                            color: '#ef4444', 
                                            border: 'none', 
                                            borderRadius: '8px', 
                                            cursor: 'pointer' 
                                        }}
                                        title="Remove from Game"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                                <AlertCircle size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No Custom Stations Yet</h3>
                                <p style={{ margin: 0 }}>Use the "Discover" tab to add some music to your farm!</p>
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
