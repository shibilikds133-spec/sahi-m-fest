const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Fix 1: Show draft marks to admins
content = content.replace(
    "const judgeMarks = mode === 'marks' ? getJudgeMarks(reg.id).filter(m => m.is_final) : [];",
    "const judgeMarks = mode === 'marks' ? getJudgeMarks(reg.id) : [];"
);

// Fix 2: Force setPublished(false) immediately on unlock
content = content.replace(
    "unlockScheduleMarks.mutate(scheduleId);",
    "unlockScheduleMarks.mutate(scheduleId, { onSuccess: () => setPublished(false) });"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed results.tsx UI issues");
