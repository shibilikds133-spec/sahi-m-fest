const fs = require("fs");
const filePath = "src/app/(admin)/participants/[id]/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("import { useAuthStore } from '../../../../core/store/authStore';") && !content.includes("import { useAuthStore } from '@/core/store/authStore';")) {
  content = content.replace(
    "import { useParticipants }",
    "import { useAuthStore } from '../../../../core/store/authStore';\nimport { useParticipants }"
  );
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed import");
