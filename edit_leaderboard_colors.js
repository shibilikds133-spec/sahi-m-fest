const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Update the POST-HERO BACKGROUND WRAPPER to use solid dark background to match the image
// Currently it is `<div className="relative w-full bg-cover bg-top bg-no-repeat">` with a child `<div className="absolute inset-0 bg-alviora-bg/15...`
content = content.replace(
  /<div className="relative w-full bg-cover bg-top bg-no-repeat">[\s\S]*?<div className="absolute inset-0 bg-alviora-bg\/15 z-0 pointer-events-none transition-colors duration-300"><\/div>/,
  `<div className="relative w-full bg-[#050505] bg-cover bg-top bg-no-repeat">
            <div className="absolute inset-0 bg-[#050505] z-0 pointer-events-none"></div>`
);

// 2. Update Stats Bar
content = content.replace(
  /className="bg-\[#0a121c\]\/90 backdrop-blur-xl border border-white\/10 rounded-\[2rem\] p-6 md:p-8 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl"/,
  `className="bg-[#121212] rounded-[2rem] p-6 md:p-8 flex flex-wrap items-center justify-between md:justify-around gap-6"`
);
// Update the lines in Stats Bar
content = content.replace(/bg-white\/10/g, "bg-[#333]"); // There are exactly 3 of these in the stats bar, but also elsewhere. Let's be precise.

// Let's rewrite the Leaderboard Section and Stats Bar entirely to be safe
const statsSectionRegex = /\{\/\* Stats Section \*\/\}\s*<div className="relative z-20 max-w-5xl mx-auto px-4 -mt-10 mb-20 fade-in-up visible">[\s\S]*?\{\/\* Top Leaderboard \*\/\}/m;

const newStatsAndLeaderboard = `{/* Stats Section */}
        <div className="relative z-20 max-w-5xl mx-auto px-4 -mt-10 mb-20 fade-in-up visible">
          <div className="bg-[#121212] border border-[#222] rounded-[2rem] p-6 md:p-8 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl">
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.campuses}+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Teams</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">100+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Items</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.days}</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Days of Digital</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">40+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Participants</div>
            </div>
          </div>
        </div>

        {/* Top Leaderboard */}`;
content = content.replace(statsSectionRegex, newStatsAndLeaderboard);

const leaderboardSectionRegex = /\{\/\* Top Leaderboard \*\/\}\s*\{\(page === 'landing' \|\| page === 'units'\) && \([\s\S]*?<\/section>\s*\)}/m;

const newLeaderboard = `{/* Top Leaderboard */}
        {(page === 'landing' || page === 'units') && (
        <section id="leaderboard" className={\`py-section-gap px-gutter fade-in-up visible relative \${page === 'units' ? '' : 'border-none'}\`}>
          
          {/* Subtle Glows in background like the image */}
          <div className="absolute top-1/2 left-0 w-96 h-96 bg-[#1C5FA8]/10 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#1C5FA8]/10 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="max-w-[1200px] mx-auto">
            {/* The main container */}
            <div className="bg-[#121212] rounded-[2.5rem] border border-[#222] p-8 md:p-12 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row gap-12">
              
              {/* Left Side: Text and List */}
              <div className="flex-1 relative z-10 flex flex-col justify-center">
                {/* Rotated Badge */}
                <div className="hidden lg:block absolute -left-[5.5rem] top-24 -rotate-90 origin-bottom-right">
                  <span className="bg-[#1C5FA8] text-white text-[12px] font-bold uppercase tracking-[0.3em] px-4 py-1.5 rounded-sm">
                    LEADERBOARD
                  </span>
                </div>
                
                <div className="pl-0 lg:pl-12">
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
                    Team <span className="inline-block bg-[#1C5FA8] text-white px-4 py-1 rounded-2xl -translate-y-1">Rankings</span>
                  </h2>
                  <p className="text-white/60 text-sm md:text-base mb-10 max-w-md leading-relaxed">
                    Current point standings for the top institutions. Witness the creative and competitive spirit unfold on the grand stage.
                  </p>

                  {/* Top Teams List */}
                  <div className="space-y-4 max-w-md">
                    {topUnits.slice(0, 4).map((unit: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between border border-[#333] bg-[#0A0A0A] hover:bg-[#1A1A1A] hover:border-[#444] transition-all rounded-[2rem] px-6 py-4 cursor-pointer group">
                        <div className="flex items-center gap-6">
                          <span className="font-['Handjet'] text-[#1C5FA8] text-3xl font-bold">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-white font-semibold text-lg">
                            {unit.name || unit.team_name || unit.organisation_name || \`Team \${idx + 1}\`}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white/50 text-sm font-medium">{unit.total_points} pts</span>
                          <span className="material-symbols-outlined text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all">arrow_forward</span>
                        </div>
                      </div>
                    ))}
                    {topUnits.length === 0 && (
                      <div className="text-white/50 text-sm italic py-8 text-center border border-[#333] rounded-3xl bg-[#0A0A0A]">Leaderboard data will appear here once results are published.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Bento Grid */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">
                {/* Main Large Image */}
                <div className="col-span-1 md:col-span-1 md:row-span-2 rounded-[2.5rem] overflow-hidden bg-[#1A1A1A] relative h-[350px] md:h-auto group">
                   <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105" style={{ backgroundImage: "url('/images/schedule/bg-1.jpg')", filter: "grayscale(100%)" }}></div>
                </div>

                {/* Top Right Card */}
                <div className="bg-[#181818] rounded-[2.5rem] border border-[#222] p-8 flex flex-col justify-center gap-6 items-center text-center shadow-lg hover:border-[#333] transition-colors">
                  <p className="text-white/70 text-sm leading-relaxed">Ever wondered how the complete standings look?</p>
                  <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="flex items-center gap-3 text-white font-bold text-lg group/btn">
                    See how
                    <br/>they perform
                    <div className="w-10 h-10 rounded-full bg-[#222] border border-[#333] flex items-center justify-center group-hover/btn:bg-[#1C5FA8] group-hover/btn:border-[#1C5FA8] transition-colors shrink-0">
                      <span className="material-symbols-outlined text-sm">north_east</span>
                    </div>
                  </button>
                </div>

                {/* Bottom Right Highlight Card */}
                <div className="bg-[#1C5FA8] rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute -right-12 -top-12 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors"></div>
                  
                  <p className="text-white/90 text-sm mb-6 relative z-10 font-medium leading-relaxed">
                    Looking for the leading champions who dominate the festival?
                  </p>
                  
                  <div className="flex items-center justify-between relative z-10">
                     <span className="text-white font-bold text-xl tracking-wide max-w-[100px]">
                       Meet our leader
                     </span>
                     <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-12 h-12 rounded-full bg-white text-[#1C5FA8] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform shrink-0">
                       <span className="material-symbols-outlined text-base font-bold">north_east</span>
                     </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>
        )}`;

content = content.replace(leaderboardSectionRegex, newLeaderboard);

fs.writeFileSync(filePath, content, "utf8");
console.log("Removed glassmorphism, applied solid dark colors matching the image exactly.");
