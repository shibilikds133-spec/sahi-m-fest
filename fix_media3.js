const fs = require("fs");
let content = fs.readFileSync("src/app/(public)/leaderboard/media.tsx", "utf8");

content = content.replace("</>\\n  );\\n}", "</>\n  );\n}");
fs.writeFileSync("src/app/(public)/leaderboard/media.tsx", content);
