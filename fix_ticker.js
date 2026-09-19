const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

const oldTickerRegex = /<div className="flex items-center gap-4 w-full max-w-container-max mx-auto marquee-container">[\s\S]*?<\/div>/;

const newTicker = `<div className="flex items-center gap-3 w-full max-w-container-max mx-auto">
            <span className="material-symbols-outlined text-alviora-accent shrink-0 z-10" style={{fontVariationSettings:"'FILL' 1", fontSize: "18px"}}>sensors</span>
            <div className="marquee-container flex-1 overflow-hidden relative" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="marquee-content whitespace-nowrap">{tickerString}</span>
            </div>
          </div>`;

content = content.replace(oldTickerRegex, newTicker);
fs.writeFileSync(filePath, content, "utf8");
console.log("Ticker fixed with regex!");
