const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/\r\n/g, "\n");

const toReplace = `                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>

                <div className="flex flex-col gap-3 w-full">`;

const replacement = `                <div className="flex flex-col gap-3 w-full">`;

const endOfList = `                  {topUnits.length === 0 && (
                    <div className="text-white/50 text-sm italic py-6 text-center border border-[#333] rounded-2xl bg-black/40">Leaderboard data will appear here.</div>
                  )}
                </div>`;

const newEndOfList = `                  {topUnits.length === 0 && (
                    <div className="text-white/50 text-sm italic py-6 text-center border border-[#333] rounded-2xl bg-black/40">Leaderboard data will appear here.</div>
                  )}
                </div>

                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>`;

// Check if these strings exist
if (content.indexOf(toReplace) !== -1 && content.indexOf(endOfList) !== -1) {
  content = content.replace(toReplace, replacement);
  content = content.replace(endOfList, newEndOfList);
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Swapped mobile leaderboard and video.");
} else {
  console.log("Could not find the blocks to swap.");
}
