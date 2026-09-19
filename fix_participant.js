const fs = require("fs");
const filePath = "src/app/(admin)/participants/[id]/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("useAuthStore")) {
  content = content.replace(
    "import { useParticipants }",
    "import { useAuthStore } from '../../../../core/store/authStore';\nimport { useParticipants }"
  );
}

content = content.replace(
  "export default function ParticipantDetails() {",
  "export default function ParticipantDetails() {\n  const tenant_id = useAuthStore((state) => state.tenant_id);\n  const validTenantId = tenant_id;"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed ParticipantDetails");
