const fs = require("fs");
const filePath = "src/services/leaderboardSettingsService.ts";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace("team_point_status?: string | null;", "team_point_status?: string | null;\n  theme_config?: Record<string, any>;");
fs.writeFileSync(filePath, content, "utf8");
console.log("Updated PublicLeaderboardSettings type");
