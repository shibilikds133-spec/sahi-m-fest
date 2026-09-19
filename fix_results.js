const fs = require("fs");
const path = "src/app/(admin)/schedule/[id]/results.tsx";
let code = fs.readFileSync(path, "utf-8");

// Change filters
code = code.replace(/filter\(\(e: any\) => e\.is_final\)/g, "filter((e: any) => e.is_final || e.total_mark != null)");
code = code.replace(/filter\(m => m\.is_final\)/g, "filter(m => m.is_final || m.total_mark != null)");
code = code.replace(/filter\(\(m: any\) => m\.is_final\)/g, "filter((m: any) => m.is_final || m.total_mark != null)");

// Change UI display for draft
code = code.replace(/{m\.is_final \? '?' : '\(draft\)'}/g, "{m.is_final ? '?' : (m.total_mark != null ? '? (admin unlocked)' : '(draft)')}");

fs.writeFileSync(path, code, "utf-8");
console.log("Filters updated!");
