const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Remove the post-hero background image
content = content.replace(
  `className="relative w-full md:bg-[url('/images/post-hero-bg.png')] bg-cover bg-top bg-no-repeat"`,
  `className="relative w-full bg-cover bg-top bg-no-repeat"`
);

// 2. Replace the Stats section with the new Stats Bar
const statsSectionRegex = /\{\/\* Stats Section \*\/\}\s*<section className="bg-transparent py-8 md:py-12 relative z-20 overflow-hidden handjet-wrapper">[\s\S]*?<\/section>/;

const newStatsBar = `{/* Stats Section */}
        <div className="relative z-20 max-w-5xl mx-auto px-4 -mt-10 mb-20 fade-in-up visible">
          <div className="bg-[#0a121c]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 md:p-8 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl">
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.campuses}+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Teams</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-white/10"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">100+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Items</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-white/10"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.days}</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Days of Digital</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-white/10"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">40+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Participants</div>
            </div>
          </div>
        </div>`;

content = content.replace(statsSectionRegex, newStatsBar);

// 3. Replace the Leaderboard section with the new Bento box design
const leaderboardSectionRegex = /\{\/\* Top Leaderboard \*\/\}\s*\{\(page === 'landing' \|\| page === 'units'\) && \([\s\S]*?<\/section>\s*\)}/m;

const newLeaderboard = `{/* Top Leaderboard */}
        {(page === 'landing' || page === 'units') && (
        <section id="leaderboard" className={\`py-section-gap px-gutter fade-in-up visible \${page === 'units' ? '' : 'border-none'}\`}>
          <div className="max-w-[1200px] mx-auto">
            {/* The main container */}
            <div className="bg-[#0d1723]/90 md:bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 p-8 md:p-12 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row gap-12">
              
              {/* Left Side: Text and List */}
              <div className="flex-1 relative z-10 flex flex-col justify-center">
                {/* Rotated Badge */}
                <div className="hidden lg:block absolute -left-[5.5rem] top-24 -rotate-90 origin-bottom-right">
                  <span className="bg-[#c69a53] text-black text-[12px] font-bold uppercase tracking-[0.3em] px-4 py-1.5 rounded-sm shadow-md">
                    LEADERBOARD
                  </span>
                </div>
                
                <div className="pl-0 lg:pl-12">
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
                    Team <span className="inline-block bg-[#1C5FA8] text-white px-4 py-1 rounded-2xl -translate-y-1 shadow-lg">Rankings</span>
                  </h2>
                  <p className="text-white/60 text-sm md:text-base mb-10 max-w-md leading-relaxed">
                    Current point standings for the top institutions. Witness the creative and competitive spirit unfold on the grand stage.
                  </p>

                  {/* Top Teams List */}
                  <div className="space-y-4 max-w-md">
                    {topUnits.slice(0, 4).map((unit: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between border border-white/10 bg-black/20 hover:bg-white/5 hover:border-white/20 transition-all rounded-[2rem] px-6 py-4 cursor-pointer group">
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
                      <div className="text-white/50 text-sm italic py-8 text-center border border-white/5 rounded-3xl bg-black/20">Leaderboard data will appear here once results are published.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Bento Grid */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">
                {/* Main Large Image */}
                <div className="col-span-1 md:col-span-1 md:row-span-2 rounded-[2.5rem] overflow-hidden border border-white/10 relative h-[350px] md:h-auto group">
                   <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-110" style={{ backgroundImage: "url('/images/schedule/bg-1.jpg')", filter: "grayscale(100%) brightness(0.8)" }}></div>
                   <div className="absolute inset-0 bg-[#1C5FA8]/20 mix-blend-overlay"></div>
                   
                   {/* Graphic text overlay like in the image */}
                   <div className="absolute inset-0 flex items-center justify-center p-6 opacity-30">
                     <div className="w-[85%] h-[85%] border-2 border-[#1C5FA8]/50 rounded-[1.5rem] transform rotate-3 transition-transform group-hover:rotate-6"></div>
                   </div>
                </div>

                {/* Top Right Card */}
                <div className="bg-[#121f2d]/90 backdrop-blur-md rounded-[2.5rem] border border-white/10 p-8 flex flex-col justify-center gap-6 items-center text-center shadow-lg hover:border-white/20 transition-colors">
                  <p className="text-white/70 text-sm leading-relaxed">Ever wondered how the complete standings look?</p>
                  <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="flex items-center gap-3 text-white font-bold text-lg group/btn">
                    See how
                    <br/>they perform
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover/btn:bg-[#1C5FA8] transition-colors shrink-0">
                      <span className="material-symbols-outlined text-sm">north_east</span>
                    </div>
                  </button>
                </div>

                {/* Bottom Right Highlight Card */}
                <div className="bg-[#1C5FA8] rounded-[2.5rem] p-8 flex flex-col justify-between shadow-[0_0_40px_rgba(28,95,168,0.3)] relative overflow-hidden group">
                  <div className="absolute -right-12 -top-12 w-40 h-40 bg-white/20 rounded-full blur-3xl group-hover:bg-white/30 transition-colors"></div>
                  
                  <p className="text-white/90 text-sm mb-6 relative z-10 font-medium leading-relaxed">
                    Looking for the leading champions who dominate the festival?
                  </p>
                  
                  <div className="flex items-center justify-between relative z-10">
                     <span className="text-white font-bold text-xl tracking-wide max-w-[100px]">
                       Meet our leader
                     </span>
                     <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-12 h-12 rounded-full bg-white text-[#1C5FA8] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform shrink-0 hover:bg-[#c69a53] hover:text-black">
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

// Add the marquee at the bottom of the landing page content (inside {page === 'landing' && (<> ... </>)})
const footerRegex = /\{\/\* Footer \*\/\}/;
const marqueeHtml = `
        {/* Marquee Section */}
        {page === 'landing' && (
          <div className="w-full overflow-hidden bg-transparent py-16 border-t border-white/5">
            <div className="flex whitespace-nowrap animate-marquee">
              <span className="text-5xl md:text-7xl font-bold text-white/90 mx-4 font-['Handjet'] tracking-wider">Innovate <span className="text-[#1C5FA8] mx-2">+</span> Inspire <span className="text-[#c69a53] mx-2">+</span> Create <span className="text-[#1C5FA8] mx-2">+</span> Discover <span className="text-[#c69a53] mx-2">+</span></span>
              <span className="text-5xl md:text-7xl font-bold text-white/90 mx-4 font-['Handjet'] tracking-wider">Innovate <span className="text-[#1C5FA8] mx-2">+</span> Inspire <span className="text-[#c69a53] mx-2">+</span> Create <span className="text-[#1C5FA8] mx-2">+</span> Discover <span className="text-[#c69a53] mx-2">+</span></span>
            </div>
          </div>
        )}

        {/* Footer */}`;
content = content.replace(footerRegex, marqueeHtml);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Leaderboard layout to match the provided image");
