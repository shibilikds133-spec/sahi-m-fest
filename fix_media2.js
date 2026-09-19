const fs = require("fs");
let content = fs.readFileSync("src/app/(public)/leaderboard/media.tsx", "utf8");

content = content.replace(/\\n/g, "\n");

if (!content.includes("</SahithyolsavLandingPage>")) {
  content = content.replace(/      <\/div>\s*\{isFullscreen/, "      </div>\n      </SahithyolsavLandingPage>\n\n      {isFullscreen");
}

fs.writeFileSync("src/app/(public)/leaderboard/media.tsx", content);
