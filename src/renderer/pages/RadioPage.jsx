import { CustomSlider } from '../components/common/CustomSlider';
import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Radio as RadioIcon, Music, Globe, Check, Volume2, AlertCircle, RefreshCw, Play, Pause, Filter, X, Edit2 } from 'lucide-react';
import { useRadioStore } from '../store/useRadioStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useToastStore } from '../store/useToastStore';

const PRESET_TAGS = ['Rock', 'Pop', 'Country', 'Jazz', 'Dance', 'Metal', 'Classical', 'Oldies', 'News', 'Chill', '80s', '90s', 'Electronic', 'House', 'Hip Hop', 'Rap', 'Blues', 'Folk', 'Reggae', 'Indie', 'Ambient', 'Talk', 'Top 40', 'Other'];

const PRESET_LANGUAGES = [
    { code: 'english', name: 'English' },
    { code: 'german', name: 'German' },
    { code: 'french', name: 'French' },
    { code: 'spanish', name: 'Spanish' },
    { code: 'italian', name: 'Italian' },
    { code: 'polish', name: 'Polish' },
    { code: 'russian', name: 'Russian' },
    { code: 'ukrainian', name: 'Ukrainian' },
    { code: 'dutch', name: 'Dutch' },
];

const PRESET_COUNTRIES = [
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'CA', name: 'Canada' },
    { code: 'PL', name: 'Poland' },
    { code: 'AU', name: 'Australia' },
];

const OFFICIAL_PRESETS = [
    { name: 'GIANTS Country', url: 'giants_preset_country', tags: 'Base Game, Country', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Rock', url: 'giants_preset_rock', tags: 'Base Game, Rock', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Pop', url: 'giants_preset_pop', tags: 'Base Game, Pop', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Dance', url: 'giants_preset_dance', tags: 'Base Game, Dance', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Hip Hop', url: 'giants_preset_hiphop', tags: 'Base Game, Hip-Hop', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Oldies', url: 'giants_preset_oldies', tags: 'Base Game, Oldies', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS Classical', url: 'giants_preset_classical', tags: 'Base Game, Classical', language: 'English', country: 'GIANTS Engine' },
    { name: 'GIANTS News', url: 'giants_preset_news', tags: 'Base Game, News', language: 'English', country: 'GIANTS Engine' },
    { name: 'Simulator Radio', url: 'https://simulatorradio.stream/stream.mp3', tags: 'Official, Simulation, Pop', language: 'English', country: 'United Kingdom' },
    { name: 'Truckers FM', url: 'https://live.truckers.fm/', tags: 'Official, Simulation, Variety', language: 'English', country: 'United Kingdom' },
    { name: 'TruckStopRadio Country', url: 'https://oreo.truckstopradio.co.uk/listen/tsr_country/radio.mp3', tags: 'Simulation, Country', language: 'English', country: 'United Kingdom' },
    { name: 'TruckStopRadio Rock', url: 'https://oreo.truckstopradio.co.uk/listen/tsr_rock/radio.mp3', tags: 'Simulation, Rock', language: 'English', country: 'United Kingdom' },
];

const RadioPage = () => {
    const { 
        stations, searchResults, isSearching, 
        fetchRadios, searchStations, addStation, removeStation, updateStationName,
        playingStationUrl, setPlayingStation,
        overrideBuiltins, isCompanionInstalled, setOverrideBuiltins,
        query, country, language, tag, sortOrder, viewMode,
        setFilterQuery, setFilterCountry, setFilterLanguage, setFilterTag, setSortOrder, setViewMode, resetFilters
    } = useRadioStore();
    const { toast } = useToastStore();
    
    const [isBuffering, setIsBuffering] = useState(false);
    const [volume, setVolume] = useState(0.8);

    const audioRef = React.useRef(null);

    const executeSearch = (newQuery = query, newCountry = country, newLanguage = language, newTag = tag, newSort = sortOrder) => {
        searchStations({ 
            query: newQuery, 
            country: newCountry, 
            language: newLanguage, 
            tag: newTag, 
            order: newSort === 'name' ? 'name' : 'votes', 
            limit: 60 
        });
    };

    useEffect(() => {
        fetchRadios();
        executeSearch(query, country, language, tag, sortOrder);
        
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
        setFilterTag(newTag);
        executeSearch(query, country, language, newTag, sortOrder);
    };

    const handleLanguageChange = (langCode) => {
        setFilterLanguage(langCode);
        executeSearch(query, country, langCode, tag, sortOrder);
    };

    const handleCountryChange = (countryCode) => {
        setFilterCountry(countryCode);
        executeSearch(query, countryCode, language, tag, sortOrder);
    };

    const handleSortChange = (newSort) => {
        setSortOrder(newSort);
        executeSearch(query, country, language, tag, newSort);
    };

    const handleQueryChange = (val) => {
        setFilterQuery(val);
    };

    const handleClearFilters = () => {
        resetFilters();
        searchStations({ order: 'name', limit: 60 });
    };

    const hasActiveFilters = query || country || language || tag;

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
        executeSearch(query, country, language, tag);
    };

    const handleAdd = async (station) => {
        const result = await addStation(station);
        if (result.success) toast.success(`Added ${station.name || 'Station'} to game!`);
        else toast.error(result.error || 'Failed to add station');
    };

    const handleRemove = async (href) => {
        const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
        if (!skipConfirm && !confirm('Remove this station from your game?')) return;
        const result = await removeStation(href);
        if (result.success) {
            fetchRadios();
            toast.success('Station removed');
        }
    };

    const handleRename = async (href, currentName) => {
        const newName = prompt('Enter new station name:', currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            const res = await updateStationName(href, newName.trim());
            if (res.success) toast.success('Station renamed');
            else toast.error(res.error || 'Failed to rename station');
        }
    };

    const handleClearAll = async () => {
        const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
        if (!skipConfirm && !confirm('Remove ALL custom stations from FS25?')) return;
        await window.api.radio.remove('__ALL__');
        fetchRadios();
        toast.success('All custom stations cleared');
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
                        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>FS25 Radio Stations</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '650px', margin: 0 }}>
                        Search, preview, and add live internet radio stations directly into your Farming Simulator 25 tractor radio.
                    </p>
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
                        {/* Search & Volume Toolbar */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search stations by name..." 
                                    value={query} 
                                    onChange={(e) => handleQueryChange(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                                    style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px' }} 
                                />
                            </div>

                            {/* Language Filter */}
                            <div style={{ minWidth: '140px' }}>
                                <select 
                                    value={language} 
                                    onChange={(e) => handleLanguageChange(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px', cursor: 'pointer' }}
                                >
                                    <option value="">All Languages</option>
                                    {PRESET_LANGUAGES.map(l => (
                                        <option key={l.code} value={l.code}>{l.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Country Filter */}
                            <div style={{ minWidth: '150px' }}>
                                <select 
                                    value={country} 
                                    onChange={(e) => handleCountryChange(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px', cursor: 'pointer' }}
                                >
                                    <option value="">All Countries</option>
                                    {PRESET_COUNTRIES.map(c => (
                                        <option key={c.code} value={c.code}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Sort Order Dropdown */}
                            <div style={{ minWidth: '160px' }}>
                                <select 
                                    value={sortOrder} 
                                    onChange={(e) => handleSortChange(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    <option value="name">Sort: A to Z</option>
                                    <option value="votes">Sort: Most Popular</option>
                                </select>
                            </div>

                            <button onClick={handleSearch} style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', border: 'none' }}>Search</button>

                            {hasActiveFilters && (
                                <button 
                                    onClick={handleClearFilters}
                                    style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    title="Reset all filters"
                                >
                                    <X size={14} /> Reset
                                </button>
                            )}

                            {playingStationUrl && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--accent-dim)', padding: '6px 16px', borderRadius: '10px', marginLeft: 'auto' }}>
                                    <Volume2 size={16} style={{ color: 'var(--accent)' }} />
                                    <CustomSlider min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ width: '80px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', minWidth: '35px' }}>{Math.round(volume * 100)}%</span>
                                </div>
                            )}
                        </div>

                        {/* Presets */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: '700' }}>Official Game Presets</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                {OFFICIAL_PRESETS.map(p => {
                                    const matchedStation = stations.find(s => s.href && s.href.replace(/^https?:\/\//, '').replace(/\/$/, '') === p.url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
                                    const isAdded = !!matchedStation;
                                    return (
                                        <button 
                                            key={p.name}
                                            onClick={() => isAdded ? handleRemove(matchedStation.href) : handleAdd(p)}
                                            style={{ 
                                                padding: '6px 12px', 
                                                borderRadius: '20px', 
                                                fontSize: '11px', 
                                                fontWeight: '700',
                                                background: isAdded ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-dim)',
                                                color: isAdded ? '#ef4444' : 'var(--accent)',
                                                border: isAdded ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--accent-dim)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s'
                                            }}
                                            title={isAdded ? "Click to remove from game" : "Click to add to game"}
                                        >
                                            {isAdded ? <Trash2 size={12} /> : <Plus size={12} />} {p.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Genre Filter Pills */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '700' }}>Genres</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
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
                                    const matchedStation = stations.find(s => s.href && s.href.replace(/^https?:\/\//, '').replace(/\/$/, '') === normalizedUrl);
                                    const isAdded = !!matchedStation;
                                    return (
                                        <StationCard 
                                            key={station.stationuuid} 
                                            station={station} 
                                            isAdded={isAdded} 
                                            activeTag={tag}
                                            isPlaying={playingStationUrl === resolvedUrl} 
                                            isBuffering={isBuffering && playingStationUrl === resolvedUrl} 
                                            onPreview={() => setPlayingStation(playingStationUrl === resolvedUrl ? null : resolvedUrl)} 
                                            onAdd={() => handleAdd(station)} 
                                            onRemove={() => handleRemove(matchedStation ? matchedStation.href : resolvedUrl)} 
                                            onSelectPopularity={() => handleSortChange('votes')}
                                        />
                                    );
                                })
                            ) : (
                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                                    <Globe size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)' }}>Find Radio Stations</h3>
                                    <p style={{ margin: 0, textAlign: 'center' }}>Type a station name or choose language/country/genre filters to search.</p>
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
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div style={{ width: '44px', height: '44px', background: 'var(--accent-dim)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0, overflow: 'hidden' }}>
                                            {station.favicon ? (
                                                <img src={station.favicon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={(e) => e.target.style.display = 'none'} />
                                            ) : (
                                                <Music size={20} />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {station.name || station.href}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {station.href}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button onClick={() => handleRename(station.href, station.name || station.href)} style={{ padding: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Rename Station"><Edit2 size={16} /></button>
                                            <button onClick={() => handleRemove(station.href)} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove from Game"><Trash2 size={16} /></button>
                                        </div>
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

const StationCard = ({ station, isAdded, isPlaying, isBuffering, activeTag, onAdd, onRemove, onPreview, onSelectPopularity }) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [station.favicon]);

    const getTagList = () => {
        if (!station.tags) return [];
        const tagList = station.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length === 0) return [];

        let sorted = [...tagList];
        if (activeTag) {
            const lowerFilter = activeTag.toLowerCase();
            const idx = sorted.findIndex(t => t.toLowerCase() === lowerFilter);
            if (idx > 0) {
                const [matched] = sorted.splice(idx, 1);
                sorted.unshift(matched);
            }
        }
        return sorted.slice(0, 6);
    };

    const tags = getTagList();

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
                    {station.favicon && !imgError ? (
                        <img 
                            src={station.favicon} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: (isPlaying || isBuffering) ? 0.3 : 1 }} 
                            alt="" 
                            onError={() => setImgError(true)} 
                        />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', opacity: (isPlaying || isBuffering) ? 0.3 : 0.8 }}>
                            <RadioIcon size={24} />
                        </div>
                    )}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', opacity: (isPlaying || isBuffering) ? 1 : 0, transition: 'opacity 0.2s' }}>
                        {isBuffering ? <RefreshCw size={24} className="animate-spin" /> : isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div 
                        title={station.name}
                        style={{ 
                            margin: '0 0 4px 0', 
                            overflow: 'hidden', 
                            position: 'relative',
                            cursor: 'default'
                        }}
                    >
                        <h3 
                            className="station-title-text"
                            style={{ 
                                margin: 0, 
                                fontSize: '15px', 
                                fontWeight: '700', 
                                color: 'var(--text-primary)', 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                transition: 'transform 0.3s ease'
                            }}
                        >
                            {station.name}
                        </h3>
                    </div>
                    <div style={{ 
                        fontSize: '12px', 
                        color: 'var(--text-secondary)', 
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word'
                    }}>
                        {tags.length > 0 ? tags.join(', ') : (station.country || 'Unknown')}
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
                {station.language && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--accent)', fontWeight: '600' }}>{station.language.split(',')[0]}</span>}
                {station.countrycode && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{station.countrycode}</span>}
                {station.bitrate && <span style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>{station.bitrate}kbps</span>}
                {station.votes !== undefined && station.votes !== null && (
                    <span 
                        onClick={onSelectPopularity}
                        title="Click to sort stations by popularity (votes)"
                        style={{ 
                            padding: '2px 6px', 
                            background: 'var(--bg-tertiary)', 
                            borderRadius: '4px', 
                            fontSize: '10px', 
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent-dim)';
                            e.currentTarget.style.color = 'var(--accent)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-tertiary)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                    >
                        {station.votes} votes
                    </span>
                )}
            </div>

            <button 
                onClick={isAdded ? onRemove : onAdd}
                style={{ 
                    marginTop: '4px',
                    padding: '10px', 
                    borderRadius: '10px', 
                    border: isAdded ? '1px solid rgba(239, 68, 68, 0.4)' : 'none', 
                    background: isAdded ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent)',
                    color: isAdded ? '#ef4444' : 'white',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                }}
                title={isAdded ? "Click to remove station from game" : "Click to add station to game"}
            >
                {isAdded ? (
                    <><Trash2 size={16} /> Remove from Game</>
                ) : (
                    <><Plus size={16} /> Add to Game</>
                )}
            </button>
        </div>
    );
};

export default RadioPage;

