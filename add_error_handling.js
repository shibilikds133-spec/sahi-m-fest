const fs = require("fs");
const filePath = "src/core/hooks/useJudges.ts";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    "const unlockScheduleMarks = useMutation({",
    "const unlockScheduleMarks = useMutation({\n      onError: (err: any) => {\n        window.alert(\"Error unlocking marks: \" + err.message);\n      },"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added error handling to useJudges.ts");
