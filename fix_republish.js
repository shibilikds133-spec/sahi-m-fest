const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "setForceRepublishConfirmed(true);\n      } else {",
  "setForceRepublishConfirmed(true);\n        return;\n      } else {"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed republish unlock logic for web.");
