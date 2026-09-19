const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /return \(\s+<Stack\.Screen/g,
  "return (\n    <>\n      <Stack.Screen"
);

content = content.replace(
  /<\/ScrollView>\s+\);\s+}/g,
  "</ScrollView>\n    </>\n  );\n}"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed JSX wrapper in smart-announcer properly");
