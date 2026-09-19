const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    "const [published, setPublished] = useState(false);",
    "const [published, setPublished] = useState(false);\n  const [editingRegistration, setEditingRegistration] = useState<any>(null);"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added state.");
