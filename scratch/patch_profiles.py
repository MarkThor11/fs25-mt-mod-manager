with open('src/renderer/pages/ProfilesPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

target = """const ProfileModImage = ({ mod, zoom, isList }) => {
  
  
  const modIdStr = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
  const cachedImg = modIdStr ? useModHubStore.getState().modCache?.[modIdStr]?.image : null;
  const [imgSrc, setImgSrc] = useState(cachedImg || mod.iconData || null);

  useEffect(() => {
    let active = true;
    if (!imgSrc && mod.filePath && window.api?.mods?.getIcon) {
        window.api.mods.getIcon({ filePath: mod.filePath, iconFile: mod.iconFile }).then(b64 => {
            if (active && b64) setImgSrc(b64);
        });
    }
    return () => { active = false; };
  }, [imgSrc, mod.filePath, mod.iconFile]);

  if (!imgSrc) {
      return <Package size={isList ? Math.floor(zoom / 2) : Math.floor(zoom / 4)} style={{ opacity: 0.2 }} />;
  }

  const finalUrl = imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
  return <img src={finalUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};"""

replacement = """const ProfileModImage = ({ mod, zoom, isList }) => {
  
  
  const modIdStr = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
  const cachedImg = modIdStr ? useModHubStore.getState().modCache?.[modIdStr]?.image : null;
  const rawSrc = cachedImg || mod.iconData || null;
  const [imgSrc, setImgSrc] = useState(rawSrc);
  const [proxiedSrc, setProxiedSrc] = useState(null);

  useEffect(() => {
    let active = true;
    if (!imgSrc && mod.filePath && window.api?.mods?.getIcon) {
        window.api.mods.getIcon({ filePath: mod.filePath, iconFile: mod.iconFile }).then(b64 => {
            if (active && b64) setImgSrc(b64);
        });
    }
    return () => { active = false; };
  }, [imgSrc, mod.filePath, mod.iconFile]);

  const activeRaw = imgSrc || rawSrc;
  useEffect(() => {
    let active = true;
    if (activeRaw && activeRaw.startsWith('http')) {
      if (window.api?.images?.proxy) {
        window.api.images.proxy(activeRaw).then(res => {
          if (active) setProxiedSrc(res || activeRaw);
        }).catch(() => {
          if (active) setProxiedSrc(activeRaw);
        });
      } else {
        setProxiedSrc(activeRaw);
      }
    } else {
      setProxiedSrc(null);
    }
    return () => { active = false; };
  }, [activeRaw]);

  const finalSource = proxiedSrc || activeRaw;
  if (!finalSource) {
      return <Package size={isList ? Math.floor(zoom / 2) : Math.floor(zoom / 4)} style={{ opacity: 0.2 }} />;
  }

  const finalUrl = finalSource.startsWith('//') ? 'https:' + finalSource : finalSource;
  return <img src={finalUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};"""

assert target in text, "Target not found in ProfilesPage.jsx"
new_text = text.replace(target, replacement, 1)
with open('src/renderer/pages/ProfilesPage.jsx', 'w', encoding='utf-8') as f:
    f.write(new_text)
print("Successfully updated ProfilesPage.jsx")
