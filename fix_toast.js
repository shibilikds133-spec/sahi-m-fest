const fs = require("fs");
const filePath = "src/components/ui/JudgeApprovalToast.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
    /supabase\.channel\(`judge_approvals_global_\$\{tenant_id\}`\)/,
    "supabase.channel(`judge_approvals_global_${tenant_id}_${Math.random().toString(36).substring(7)}`)"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed channel strict mode error");
