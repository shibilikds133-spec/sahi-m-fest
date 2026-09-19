const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/\r\n/g, "\n");

// 1. Add hook to resolve r2:// to signed url if needed, and carousel state
const stateTarget = `const [searchQuery, setSearchQuery] = useState('');`;
const stateInjection = `const [searchQuery, setSearchQuery] = useState('');
  
  const [resolvedPosters, setResolvedPosters] = useState<string[]>([]);
  const [activePosterIdx, setActivePosterIdx] = useState(0);

  React.useEffect(() => {
    const rawPosters = settingsQuery.data?.theme_config?.team_point_posters || [];
    if (rawPosters.length === 0) {
      setResolvedPosters([]);
      return;
    }
    
    // Resolve any r2:// urls
    const resolveUrls = async () => {
      const urls = await Promise.all(rawPosters.map(async (p: string) => {
        if (p.startsWith('r2://')) {
          const key = p.replace('r2://', '');
          try {
             const signed = await storageService.getPresignedUrl(key, 'image/jpeg', 'download');
             return signed;
          } catch(e) {
             return p;
          }
        }
        return p;
      }));
      setResolvedPosters(urls);
    };
    resolveUrls();
  }, [settingsQuery.data?.theme_config?.team_point_posters]);

  React.useEffect(() => {
    if (resolvedPosters.length > 1) {
      const timer = setInterval(() => {
        setActivePosterIdx(prev => (prev + 1) % resolvedPosters.length);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [resolvedPosters.length]);
`;

if (content.indexOf("const [resolvedPosters") === -1) {
  content = content.replace(stateTarget, stateInjection);
}

// 2. Replace Desktop placeholder
const desktopPlaceholderTarget = `<div className="w-full max-w-sm aspect-square bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
                  {/* Placeholder for now. We will integrate R2 swipeable carousel here later. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 p-8 text-center gap-4">
                     <span className="material-symbols-outlined text-5xl">imagesmode</span>
                     <p>Posters will appear here</p>
                  </div>
                </div>`;
                
const desktopPlaceholderReplacement = `<div className="w-full max-w-sm aspect-square bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center group">
                  {resolvedPosters.length > 0 ? (
                    <>
                      {resolvedPosters.map((url, idx) => (
                        <div 
                          key={idx} 
                          className={\`absolute inset-0 transition-opacity duration-1000 \${idx === activePosterIdx ? 'opacity-100 z-10' : 'opacity-0 z-0'}\`}
                        >
                          <img src={url} alt="Team Points" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {/* Carousel Indicators */}
                      {resolvedPosters.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          {resolvedPosters.map((_, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActivePosterIdx(idx)}
                              className={\`w-2 h-2 rounded-full transition-all duration-300 \${idx === activePosterIdx ? 'bg-alviora-primary w-4' : 'bg-white/40 hover:bg-white/60'}\`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 p-8 text-center gap-4">
                       <span className="material-symbols-outlined text-5xl">imagesmode</span>
                       <p>Posters will appear here</p>
                    </div>
                  )}
                </div>`;

content = content.replace(desktopPlaceholderTarget, desktopPlaceholderReplacement);

// 3. Replace Mobile placeholder
const mobilePlaceholderTarget = `<div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative aspect-square border border-[#333] shadow-lg flex flex-col items-center justify-center p-6">
                  <span className="material-symbols-outlined text-4xl text-white/30 mb-2">imagesmode</span>
                  <p className="text-white/30 text-sm">Team Posters</p>
                </div>`;
                
const mobilePlaceholderReplacement = `<div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative aspect-square border border-[#333] shadow-lg flex flex-col items-center justify-center">
                  {resolvedPosters.length > 0 ? (
                    <>
                      {resolvedPosters.map((url, idx) => (
                        <div 
                          key={idx} 
                          className={\`absolute inset-0 transition-opacity duration-1000 \${idx === activePosterIdx ? 'opacity-100 z-10' : 'opacity-0 z-0'}\`}
                        >
                          <img src={url} alt="Team Points" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {resolvedPosters.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          {resolvedPosters.map((_, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActivePosterIdx(idx)}
                              className={\`w-2 h-2 rounded-full transition-all duration-300 \${idx === activePosterIdx ? 'bg-alviora-primary w-4' : 'bg-white/40 hover:bg-white/60'}\`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <span className="material-symbols-outlined text-4xl text-white/30 mb-2">imagesmode</span>
                      <p className="text-white/30 text-sm">Team Posters</p>
                    </div>
                  )}
                </div>`;

content = content.replace(mobilePlaceholderTarget, mobilePlaceholderReplacement);

// Also missing storageService import!
const storageImport = `import { storageService } from '../../../services/storage/storageService';`;
if (!content.includes(storageImport)) {
  content = content.replace(/import \{ useAuthStore \} from '\.\.\/\.\.\/core\/store\/authStore';/, `import { useAuthStore } from '../../core/store/authStore';\nimport { storageService } from '../../services/storage/storageService';`);
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated public landing with carousel.");
