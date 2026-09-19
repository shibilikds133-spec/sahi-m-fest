const fs = require("fs");
const filePath = "src/services/leaderboardSettingsService.ts";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace("theme_config?: Record<string, any>;\n  theme_config?: Record<string, any>;", "theme_config?: Record<string, any>;");
fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed duplicate theme_config");
