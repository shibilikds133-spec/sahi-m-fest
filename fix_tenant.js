const fs = require("fs");
const path = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(path, "utf-8");

// Fix const { user } = useAuthStore(); to const { user, tenant_id } = useAuthStore();
content = content.replace("const { user } = useAuthStore();", "const { user, tenant_id } = useAuthStore();");

// Fix !user?.tenant_id to !tenant_id in both places
content = content.replace("!user?.tenant_id", "!tenant_id");
content = content.replace("!user?.tenant_id", "!tenant_id");

// Fix p_tenant_id: user.tenant_id to p_tenant_id: tenant_id
content = content.replace("p_tenant_id: user.tenant_id", "p_tenant_id: tenant_id");

// Fix tenant_id: user.tenant_id to tenant_id: tenant_id
content = content.replace("tenant_id: user.tenant_id", "tenant_id");

// Fix created_by: user.id to created_by: user?.id
content = content.replace("created_by: user.id", "created_by: user?.id");

fs.writeFileSync(path, content, "utf-8");
console.log("Fixed!");
