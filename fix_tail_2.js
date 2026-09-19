const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace("      </View>\n          </View>\n\n      {editingRegistration", "      </View>\n\n      {editingRegistration");

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed tail 2.");
