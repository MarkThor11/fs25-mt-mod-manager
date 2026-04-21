import React, { useEffect, useState } from 'react';
import { Map, Trash2, RefreshCw, Zap, Search, Info, ExternalLink, MapPin, HardDrive } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useMapStore } from '../store/useMapStore';
import MapImage from '../components/common/MapImage';


export default function MapsPage() {
    const { mods } = useLocalModsStore();
    const { templates, isLoading: loading, fetchTemplates, deleteTemplate } = useMapStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('automated'); // 'automated' or 'installed'

    const handleDelete = async (folderName, title) => {
        const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
        if (skipConfirm || window.confirm(`Delete the automation template for "${title}"? This map will require a manual initialization the next time you use it.`)) {
            try {
                const result = await deleteTemplate(folderName);
                if (result.success) {
                    useToastStore.getState().success(`Deleted automation for ${title}`);
                }
            } catch (err) {
                useToastStore.getState().error('Failed to delete template: ' + err.message);
            }
        }
    };

    const installedMaps = mods.filter(m => m.isMap);

    const filteredTemplates = templates.filter(t => 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredInstalled = installedMaps.filter(m => 
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.modName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="page animate-fade-in">
            <div className="page__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <h1 className="page__title">Map Library</h1>
                    <p className="page__subtitle">
                        {templates.length} Automated • {installedMaps.length} Installed Mod Maps
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: 4, borderRadius: 8, marginRight: 12 }}>
                        <button 
                            onClick={() => setActiveTab('automated')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: 6, 
                                fontSize: 12, 
                                fontWeight: 800,
                                background: activeTab === 'automated' ? 'var(--accent)' : 'transparent',
                                color: activeTab === 'automated' ? 'white' : 'var(--text-secondary)',
                                transition: 'all 0.2s'
                            }}
                        >
                            AUTOMATED
                        </button>
                        <button 
                            onClick={() => setActiveTab('installed')}
                            style={{ 
                                padding: '6px 16px', 
                                borderRadius: 6, 
                                fontSize: 12, 
                                fontWeight: 800,
                                background: activeTab === 'installed' ? 'var(--accent)' : 'transparent',
                                color: activeTab === 'installed' ? 'white' : 'var(--text-secondary)',
                                transition: 'all 0.2s'
                            }}
                        >
                            INSTALLED
                        </button>
                    </div>
                    <button className="btn btn--secondary btn--sm" onClick={fetchTemplates}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: 'var(--sp-6)', display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input 
                    type="text" 
                    placeholder={activeTab === 'automated' ? "Search learned maps..." : "Search installed map mods..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '10px 40px 10px 40px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }} 
                />
                {searchTerm && (
                    <X 
                        size={14} 
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5 }} 
                        onClick={() => setSearchTerm('')}
                        className="hover-opacity-1"
                    />
                )}
            </div>
            </div>

            {activeTab === 'automated' ? (
                /* AUTOMATED TAB */
                <>
                {templates.length === 0 && !loading ? (
                    <div className="empty-state" style={{ marginTop: 'var(--sp-10)', padding: 'var(--sp-10)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}>
                        <Map size={48} style={{ opacity: 0.2, marginBottom: 'var(--sp-4)' }} />
                        <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>Library is Empty</h3>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto', fontSize: 'var(--fs-sm)' }}>
                            The Mod Manager automatically 'learns' maps as you play them. Start a new career on any map, save once, and it will appear here!
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 'var(--sp-4)' }}>
                        {filteredTemplates.map(template => (
                            <div key={template.id} className="save-card" style={{ padding: 'var(--sp-4)', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 180, overflow: 'hidden' }}>
                                {/* Map Preview Background */}
                                <div style={{ 
                                    position: 'absolute', 
                                    top: 0, 
                                    left: 0, 
                                    width: '100%', 
                                    height: '100%', 
                                    opacity: 0.15, 
                                    zIndex: 0,
                                    pointerEvents: 'none',
                                    maskImage: 'linear-gradient(to bottom, black, transparent)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)'
                                }}>
                                    <MapImage mapTitle={template.title} mapId={template.mapId} mods={mods} />
                                </div>

                                <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--accent)', zIndex: 1, filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb), 0.5))' }}>
                                    <Zap size={20} fill="var(--accent)" />
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', zIndex: 1, position: 'relative' }}>
                                    <div style={{ width: 44, height: 44, background: 'var(--accent-dim)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                        <Map size={24} />
                                    </div>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>{template.title}</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-accent)', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, fontWeight: 600 }} title={template.id}>ID: <span style={{ color: 'white' }}>{template.id}</span></div>
                                            {template.author && (
                                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, fontWeight: 700 }} title={template.author}>BY: <span style={{ color: 'var(--text-primary)' }}>{template.author}</span></div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 'var(--sp-4)', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 1, position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: 'var(--sp-6)' }}>
                                        {template.isModMap && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 800, marginBottom: 4 }}>HARVESTED DATA</div>
                                                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <HardDrive size={12} /> {template.filesCount} components
                                                </div>
                                            </div>
                                        )}
                                        {template.version && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 800, marginBottom: 4 }}>VERSION</div>
                                                <div style={{ fontWeight: 800, fontSize: 13, color: 'white' }}>v{template.version}</div>
                                            </div>
                                        )}
                                        {template.isModMap && (
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 800, marginBottom: 4 }}>LEARNED ON</div>
                                                <div style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>{new Date(template.created).toLocaleDateString()}</div>
                                            </div>
                                        )}
                                    </div>
                                    {template.isModMap && (
                                        <button 
                                            className="btn btn--danger btn--sm btn--icon" 
                                            style={{ width: 32, height: 32 }}
                                            onClick={() => handleDelete(template.id, template.title)}
                                            title="Delete Template"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </>
            ) : (
                /* INSTALLED TAB */
                <>
                {installedMaps.length === 0 ? (
                    <div className="empty-state" style={{ marginTop: 'var(--sp-10)', padding: 'var(--sp-10)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}>
                        <HardDrive size={48} style={{ opacity: 0.2, marginBottom: 'var(--sp-4)' }} />
                        <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>No Map Mods Found</h3>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto', fontSize: 'var(--fs-sm)' }}>
                            You don't have any modded maps installed yet. Download some from the ModHub!
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 'var(--sp-4)' }}>
                        {filteredInstalled.map(mod => {
                            const hasAutomated = templates.some(t => t.mapId === mod.mapId || t.title === mod.title);
                            return (
                                <div key={mod.fileName} className="save-card" style={{ padding: 'var(--sp-4)', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 180, overflow: 'hidden' }}>
                                    {/* Map Preview Background */}
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: 0, 
                                        left: 0, 
                                        width: '100%', 
                                        height: '100%', 
                                        opacity: 0.15, 
                                        zIndex: 0,
                                        pointerEvents: 'none',
                                        maskImage: 'linear-gradient(to bottom, black, transparent)',
                                        WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)'
                                    }}>
                                        <MapImage mapTitle={mod.title} mapId={mod.mapId} mods={mods} />
                                    </div>

                                    {hasAutomated && (
                                        <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--accent)', zIndex: 1, filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb), 0.5))' }}>
                                            <Zap size={20} fill="var(--accent)" />
                                        </div>
                                    )}
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', zIndex: 1, position: 'relative' }}>
                                        <div style={{ width: 44, height: 44, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                            <Map size={24} />
                                        </div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }}>{mod.title}</h3>
                                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, fontWeight: 700 }} title={mod.author}>BY: <span style={{ color: 'var(--text-primary)' }}>{mod.author}</span></div>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 'var(--sp-4)', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 1, position: 'relative' }}>
                                        <div style={{ display: 'flex', gap: 'var(--sp-6)' }}>
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 800, marginBottom: 4 }}>FILE INFO</div>
                                                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    v{mod.version}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 800, marginBottom: 4 }}>STATUS</div>
                                                <div style={{ fontWeight: 800, fontSize: 11, color: hasAutomated ? 'var(--accent)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {hasAutomated ? <><Zap size={10} fill="var(--accent)" /> READY FOR AUTO-LAUNCH</> : 'REQUIRES INITIALIZATION'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                </>
            )}
            <div style={{ marginTop: 'var(--sp-10)', padding: 'var(--sp-6)', background: 'var(--accent-dim)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-dim)', color: 'var(--accent)' }}>
                <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                    <Info size={24} style={{ flexShrink: 0 }} />
                    <div>
                        <h4 style={{ fontWeight: 700, marginBottom: 'var(--sp-2)' }}>How Map Automation Works</h4>
                        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5, opacity: 0.9 }}>
                            Farming Simulator requires binary world data to initialize a save. For maps you see here, the Manager has already harvested these binaries. 
                            This allows us to <strong>bypass all in-game menus</strong> and inject your custom Money and Difficulty settings instantly. 
                            Maps not in this library require one manual launch (Initialization) to be learned.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
