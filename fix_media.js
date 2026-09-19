const fs = require("fs");
let content = fs.readFileSync("src/app/(public)/leaderboard/media.tsx", "utf8");

content = content.replace("      </div>\\n      </SahithyolsavLandingPage>\\n\\n      {isFullscreen && (", "      </div>\n      </SahithyolsavLandingPage>\n\n      {isFullscreen && (");
content = content.replace("\\n  );\\n}", "\n  );\n}");

// Actually wait, let's just properly fix the end of the file.
content = content.replace(/      <\/div>\r?\n\r?\n      \{isFullscreen && \(/, "      </div>\n      </SahithyolsavLandingPage>\n\n      {isFullscreen && (");
content = content.replace(/\r?\n    <\/div>\r?\n  \);\r?\n\}/, "\n  );\n}");

fs.writeFileSync("src/app/(public)/leaderboard/media.tsx", content);
