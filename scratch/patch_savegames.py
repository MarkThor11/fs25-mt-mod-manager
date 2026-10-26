import sys

with open('src/renderer/pages/SavegamesPage.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_block = """const MiniModIcon = React.memo(({ mod, size = 64 }) => {
    const [error, setError] = React.useState(false);
    const [proxiedUrl, setProxiedUrl] = React.useState(null);
    let imageUrl = null;
    
    if (mod?.iconData && !mod.iconData.startsWith('CATEGORY:')) {
        imageUrl = mod.iconData.startsWith('http') || mod.iconData.startsWith('data:') ? mod.iconData : `data:image/png;base64,${mod.iconData}`;
    } else {
        const filePath = mod?.filePath || (mod?.fileName ? useLocalModsStore.getState().mods.find(m => m.fileName === mod.fileName || m.modName === mod.modName)?.filePath : null);
        if (filePath) {
            imageUrl = `mod-icon://icon?path=${encodeURIComponent(filePath)}`;
        }
    }

    React.useEffect(() => {
        let isMounted = true;
        if (imageUrl && imageUrl.startsWith('http')) {
            if (window.api?.images?.proxy) {
                window.api.images.proxy(imageUrl).then(res => {
                    if (isMounted) setProxiedUrl(res || imageUrl);
                }).catch(() => {
                    if (isMounted) setProxiedUrl(imageUrl);
                });
            } else {
                setProxiedUrl(imageUrl);
            }
        } else {
            setProxiedUrl(null);
        }
        return () => { isMounted = false; };
    }, [imageUrl]);

    const activeImageUrl = proxiedUrl || imageUrl;
    
    return (
        <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {activeImageUrl && !error ? (
                <img 
                    src={activeImageUrl} 
                    alt={mod?.title || mod?.modName || ""} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    loading="lazy"
                    decoding="async"
                    onError={() => setError(true)} 
                />
            ) : (
                <div style={{ fontSize: size * 0.4, fontWeight: 900, color: 'var(--text-secondary)' }}>
                    {(mod?.title || mod?.modName || 'M').charAt(0).toUpperCase()}
                </div>
            )}
        </div>
    );
});
"""

start_idx = None
for i, l in enumerate(lines):
    if 'const MiniModIcon = React.memo' in l:
        start_idx = i
        break

assert start_idx is not None, "Could not find start of MiniModIcon"
end_idx = start_idx
while not lines[end_idx].strip() == '});':
    end_idx += 1
end_idx += 1

print(f"Replacing lines {start_idx} to {end_idx}")
lines[start_idx:end_idx] = [new_block]

with open('src/renderer/pages/SavegamesPage.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Successfully written SavegamesPage.jsx")
