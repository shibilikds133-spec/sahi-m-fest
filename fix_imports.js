const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("AdminMarkEntryModal")) {
    content = "import { AdminMarkEntryModal } from '../../../../components/ui/AdminMarkEntryModal';\n" + content;
} else if (!content.includes("import { AdminMarkEntryModal")) {
    content = "import { AdminMarkEntryModal } from '../../../../components/ui/AdminMarkEntryModal';\n" + content;
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Added import.");
