const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/\r\n/g, "\n");

const injectMarker = `<span className="material-symbols-outlined text-base font-bold">north_east</span>
                     </button>
                  </div>
                </div>

              </div>`;

const injectPoint = content.indexOf(injectMarker);
if (injectPoint !== -1) {
  console.log("Found injection point.");
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
                  {topUnits.slice(0,3).map((unit, index) => (
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
  fs.writeFileSync(filePath, content, "utf8");
} else {
  console.log("Still not found.");
}
