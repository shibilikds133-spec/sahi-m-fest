const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Hero Section
const heroTarget = `<section className="p-4 md:p-6 w-full max-w-full mx-auto fade-in-up visible hero-section">`;
if (content.includes(heroTarget)) {
  const desktopHero = `<section className="hidden md:block p-6 w-full max-w-full mx-auto fade-in-up visible hero-section">`;
  content = content.replace(heroTarget, desktopHero);
  
  const endHeroTarget = `</section>`;
  // Find the exact end of this hero section (first </section> after the hero starts)
  const heroStartIndex = content.indexOf(desktopHero);
  const heroEndIndex = content.indexOf(endHeroTarget, heroStartIndex) + endHeroTarget.length;
  
  const mobileHero = `
        {/* Mobile Hero Section */}
        <section className="block md:hidden p-4 w-full mx-auto fade-in-up visible hero-section">
          <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[80vh] flex flex-col items-center justify-center shadow-2xl border-[1px] border-white/10 ring-1 ring-white/5 bg-black shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]">
            <VideoBackground />
            <div className="absolute inset-0 backdrop-blur-[3px] bg-black/30 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 rounded-[2.5rem] border-[1px] border-white/10 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 z-10 pointer-events-none"></div>
            
            <div className="relative z-20 w-full p-6 flex flex-col items-center text-center mt-12">
              <div className="relative w-20 h-20 rounded-full bg-black/20 backdrop-blur-md border border-white/10 shadow-xl mb-6">
                <img src="/images/logo-9.png" alt="Logo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] object-contain mix-blend-screen" />
              </div>

              <div className="inline-flex items-center gap-2 bg-[#ffeedb]/10 text-[#f5d0a9] px-4 py-2 rounded-full mb-6 font-label-sm text-[10px] uppercase tracking-widest border border-[#f5d0a9]/20 shadow-sm backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5d0a9]"></span>
                ADSA ART FIESTA 2.0
              </div>
              
              <h1 className="text-[2.75rem] glass-text mb-4 leading-[1.1] font-bold">
                <span style={{fontFamily: "Barabara, sans-serif"}} className="uppercase tracking-wide text-[2rem]">ALVIORA</span><br />
                Between <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>Pixels</span><br />
                and <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>People</span>
              </h1>
              
              <p className="text-white/70 text-xs mb-10 max-w-[260px] leading-relaxed">
                Dive into the intersection of technology and humanity at the most anticipated art festival of the year.
              </p>
              
              <div className="flex flex-col gap-3 w-full px-2">
                <a href="#leaderboard" className="w-full bg-alviora-primary text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#154a85] transition-all flex items-center justify-center gap-2 shadow-md">
                  <span className="material-symbols-outlined text-lg">emoji_events</span>
                  View Leaderboard
                </a>
                <a href="#live-schedule" className="w-full border border-white/20 text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#333] transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                  <span className="material-symbols-outlined text-lg">calendar_today</span>
                  Live Schedule
                </a>
              </div>
            </div>
          </div>
        </section>
`;
  
  content = content.slice(0, heroEndIndex) + "\n" + mobileHero + content.slice(heroEndIndex);
}

// 2. Leaderboard Section
const leadTarget = `<div className="bg-[#121212]/70 backdrop-blur-3xl rounded-[2.5rem] border border-[#333] p-8 md:p-12 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row gap-12">`;
if (content.includes(leadTarget)) {
  const newLeadStart = `<div className="bg-[#121212]/70 backdrop-blur-3xl rounded-[2.5rem] border border-[#333] p-6 lg:p-12 relative overflow-hidden shadow-2xl flex flex-col">
              <div className="hidden lg:flex w-full flex-row gap-12 relative z-10">`;
  content = content.replace(leadTarget, newLeadStart);
  
  const injectMarker = `                     <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-12 h-12 rounded-full bg-white text-[#1C5FA8] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform shrink-0">
                       <span className="material-symbols-outlined text-base font-bold">north_east</span>
                     </button>
                  </div>
                </div>

              </div>`;
              
  const injectPoint = content.indexOf(injectMarker);
  if (injectPoint !== -1) {
    const mobileLeaderboard = `
              </div>
              
              {/* Mobile Leaderboard Layout */}
              <div className="flex lg:hidden flex-col w-full gap-8 relative z-10 mt-6">
                <div className="text-center">
                  <h2 className="text-4xl font-bold mb-3 leading-tight tracking-tight">
                    <span className="glass-text">Team</span> <span className="inline-block bg-[#1C5FA8] text-white px-3 py-1 rounded-2xl -translate-y-1 text-xl">Rankings</span>
                  </h2>
                  <p className="text-white/60 text-xs leading-relaxed max-w-[280px] mx-auto">
                    Current point standings for the top institutions.
                  </p>
                </div>

                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>

                <div className="flex flex-col gap-3 w-full">
                  {topUnits.slice(0,3).map((unit: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-[#222] backdrop-blur-md">
                      <div className="flex items-center gap-4">
                        <span className="text-[#1C5FA8] font-['Handjet'] font-bold text-3xl">{(index + 1).toString().padStart(2, '0')}</span>
                        <span className="text-white font-bold text-base">{unit.title || unit.name || unit.organisation_name || \`Team \${index + 1}\`}</span>
                      </div>
                      <span className="text-white/70 text-xs font-bold bg-white/10 px-3 py-1 rounded-full">{unit.total_points || 0} pts</span>
                    </div>
                  ))}
                  {topUnits.length === 0 && (
                    <div className="text-white/50 text-sm italic py-6 text-center border border-[#333] rounded-2xl bg-black/40">Leaderboard data will appear here.</div>
                  )}
                </div>

                <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-full mt-2 bg-white text-[#1C5FA8] font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                  See full standings
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
              </div>`;
              
    content = content.slice(0, injectPoint + injectMarker.length) + mobileLeaderboard + content.slice(injectPoint + injectMarker.length);
  } else {
    console.log("Could not find injection point");
  }
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Safely applied mobile UI");
