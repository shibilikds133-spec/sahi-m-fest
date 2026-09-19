const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "  return (\n    \n      <Stack.Screen options={{ title: 'Smart Announcer' }} />",
  "  return (\n    <>\n      <Stack.Screen options={{ title: 'Smart Announcer' }} />"
);

content = content.replace(
  "      </ScrollView>\n    \n  );",
  "      </ScrollView>\n    </>\n  );"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed JSX wrapper in smart-announcer");
