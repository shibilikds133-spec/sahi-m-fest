const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    "unlockScheduleMarks.mutate(scheduleId)",
    "unlockScheduleMarks.mutate(scheduleId, { onSuccess: () => setPublished(false) })"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed mobile alert logic as well");
