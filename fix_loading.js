const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "if (!currentFestival || !user?.tenant_id) return;",
  "if (!currentFestival || !user?.tenant_id) { setLoading(false); return; }"
);

content = content.replace(
  "useEffect(() => {\n    fetchQueue();\n  }, [currentFestival]);",
  "useEffect(() => {\n    if (!festivalLoading) { fetchQueue(); }\n  }, [currentFestival, festivalLoading, user?.tenant_id]);"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed infinite loading issue");
