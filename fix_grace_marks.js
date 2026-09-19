const fs = require("fs");
const filePath = "src/app/(admin)/grace-marks/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "const { childOrganisationsQuery } = useOrganisations();",
  "const { childOrganisations, isLoadingChildren } = useOrganisations();"
);

content = content.replace(
  "const groups = childOrganisationsQuery.data || [];",
  "const groups = childOrganisations || [];"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed Grace Marks Screen");
