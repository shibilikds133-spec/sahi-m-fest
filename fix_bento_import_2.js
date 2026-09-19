const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /import Head from 'expo-router\/head';/,
  `import Head from 'expo-router/head';\nimport { BentoVideo } from './BentoVideo';`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully added BentoVideo import.");
