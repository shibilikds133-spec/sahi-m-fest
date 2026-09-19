const fs = require("fs");
const filePath = "src/components/ui/AdminMarkEntryModal.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Fix Props
content = content.replace(
    "  existingMarks: any[];\n}",
    "  existingMarks: any[];\n  assignedJudges?: { judge_id: string; judge_name: string }[];\n}"
);

// Fix types
content = content.replace(
    "assignedJudges.map(j => j.judge_id)",
    "assignedJudges.map((j: any) => j.judge_id)"
);
content = content.replace(
    "judges.map((jId, idx) =>",
    "judges.map((jId: string, idx: number) =>"
);
content = content.replace(
    "assignedJudges.find(j => j.judge_id === jId)",
    "assignedJudges.find((j: any) => j.judge_id === jId)"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed AdminMarkEntryModal types");
