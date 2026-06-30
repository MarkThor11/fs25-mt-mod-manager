const fs = require('fs');
const file = 'C:\\Users\\Mark\\Desktop\\GoogleModManager\\src\\renderer\\pages\\InstalledModsPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const virtualComponent = `// --- GLOBAL VIRTUALIZATION OBSERVER ---
const observerCallbacks = new Map();
let globalObserver = null;

const getGlobalObserver = () => {
  if (!globalObserver) {
    globalObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callback = observerCallbacks.get(entry.target);
          if (callback) callback(entry.isIntersecting);
        });
      },
      { rootMargin: '600px' } // Preload 600px ahead to prevent blank flashes
    );
  }
  return globalObserver;
};

const VirtualModCard = React.memo((props) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const containerRef = React.useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = getGlobalObserver();
    observerCallbacks.set(el, (intersecting) => {
      setIsVisible(intersecting);
      if (intersecting && !hasRendered) setHasRendered(true);
    });
    observer.observe(el);

    return () => {
      observerCallbacks.delete(el);
      observer.unobserve(el);
    };
  }, [hasRendered]);

  const height = props.isIconOnly ? (props.zoom || 180) : 320;

  return (
    <div ref={containerRef} style={{ minHeight: height, width: '100%', contentVisibility: 'auto' }}>
      {isVisible || hasRendered ? <ModCard {...props} /> : null}
    </div>
  );
});

// --- MAIN COMPONENT ---
const LocalModIcon`;

content = content.replace('// --- MAIN COMPONENT ---\nconst LocalModIcon', virtualComponent);

// Now replace only the ModCard inside LazyModList
content = content.replace(
  '<ModCard \n                  mod={mod}',
  '<VirtualModCard \n                  mod={mod}'
);

fs.writeFileSync(file, content);
console.log("Patched successfully!");
