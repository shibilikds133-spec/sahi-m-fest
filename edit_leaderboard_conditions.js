const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Hide Desktop Right Side (Bento Grid) on units page
const desktopRightSideStart = `{/* Right Side: Bento Grid */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">`;
const desktopRightSideReplacement = `{/* Right Side: Bento Grid */}
              {page === 'landing' && (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">`;

// It ends at:
const desktopRightSideEnd = `                     </button>
                  </div>
                </div>

              </div>`;
const desktopRightSideEndReplacement = `                     </button>
                  </div>
                </div>

              </div>
              )}`;

if (content.indexOf(desktopRightSideStart) !== -1) {
  content = content.replace(desktopRightSideStart, desktopRightSideReplacement);
  // Find the exact end tag to append )}
  const endIdx = content.indexOf(desktopRightSideEnd, content.indexOf(desktopRightSideReplacement));
  if (endIdx !== -1) {
    content = content.slice(0, endIdx) + desktopRightSideEndReplacement + content.slice(endIdx + desktopRightSideEnd.length);
  } else {
    console.log("Could not find desktop end");
  }
} else {
  console.log("Could not find desktop start");
}

// 2. Hide Mobile Video and Button on units page
const mobileVideo = `<div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>`;
const mobileVideoReplacement = `{page === 'landing' && (
                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>
                )}`;

const mobileButton = `<button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-full mt-2 bg-white text-[#1C5FA8] font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                  See full standings
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>`;
const mobileButtonReplacement = `{page === 'landing' && (
                <button onClick={() => router.push(\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`)} className="w-full mt-2 bg-white text-[#1C5FA8] font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                  See full standings
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                )}`;

content = content.replace(mobileVideo, mobileVideoReplacement);
content = content.replace(mobileButton, mobileButtonReplacement);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated leaderboard visibility conditions.");
