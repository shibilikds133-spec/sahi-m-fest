const fs = require("fs");
const { execSync } = require("child_process");

const oldContent = execSync("git show HEAD~3:src/components/publicLanding/SahithyolsavLandingPage.web.tsx", { encoding: "utf8" });
let newContent = fs.readFileSync("src/components/publicLanding/SahithyolsavLandingPage.web.tsx", "utf8");

const startStr = "{/* Live Schedule */}";
const endStr = "{/* Top Leaderboard */}";

const startIndex = oldContent.indexOf(startStr);
const endIndex = oldContent.indexOf(endStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const missingCode = oldContent.substring(startIndex, endIndex).trim();
  
  newContent = newContent.replace(
    /\{\/\* Top Leaderboard \*\/\}/,
    missingCode + "\n\n        {/* Top Leaderboard */}"
  );
  
  fs.writeFileSync("src/components/publicLanding/SahithyolsavLandingPage.web.tsx", newContent, "utf8");
  console.log("Restored missing schedule section.");
} else {
  console.log("Could not find the section in old file. Start:", startIndex, "End:", endIndex);
}
