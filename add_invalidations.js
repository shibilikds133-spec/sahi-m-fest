const fs = require("fs");
const filePath = "src/core/hooks/useJudges.ts";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    "queryClient.invalidateQueries({ queryKey: ['judges', variables.scheduleId] });",
    "queryClient.invalidateQueries({ queryKey: ['judges', variables.scheduleId] });\n        queryClient.invalidateQueries({ queryKey: ['markEntries', variables.scheduleId] });\n        queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary', variables.scheduleId] });"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added invalidations to adminUpsertMark");
