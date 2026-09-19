const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(/<AdminMarkEntryModal\s+visible=\{markModalVisible\}[\s\S]*?\/>/m, "");

fs.writeFileSync(filePath, content, "utf8");
console.log("Removed dead modal.");
