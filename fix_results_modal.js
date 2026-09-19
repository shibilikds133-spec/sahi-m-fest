const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    "existingMarks={getJudgeMarks(editingRegistration.id)}",
    "existingMarks={getJudgeMarks(editingRegistration.id)}\n          assignedJudges={(judgeSummary as any[]) || []}"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated results.tsx to pass assignedJudges");
