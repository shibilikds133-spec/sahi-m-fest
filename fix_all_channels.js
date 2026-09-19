const fs = require("fs");
const files = [
  "src/app/(admin)/judges/approvals.tsx",
  "src/app/(admin)/judges/index.tsx",
  "src/app/(public)/leaderboard.tsx",
  "src/app/judge/index.tsx",
  "src/components/leaderboard/AlvioraCustomRenderer.tsx",
  "src/core/contexts/NotificationContext.tsx"
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    
    // Replace .channel(`...`) with .channel(`..._${Math.random().toString(36).substring(7)}`)
    // Replace .channel('...') with .channel(`..._${Math.random().toString(36).substring(7)}`)
    
    // Using a regex to find .channel(`...`) or .channel('...')
    content = content.replace(/\.channel\(`([^`]+)`\)/g, ".channel(`$1_${Math.random().toString(36).substring(7)}`)");
    content = content.replace(/\.channel\('([^']+)'\)/g, ".channel(`$1_${Math.random().toString(36).substring(7)}`)");
    
    fs.writeFileSync(file, content, "utf8");
    console.log("Fixed", file);
  }
}
