const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace("import { AdminAppShell } from '@/components/layout/AdminAppShell';", "");
content = content.replace("<AdminAppShell>", "");
content = content.replace("</AdminAppShell>", "");

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed smart-announcer layout");
