const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Import BentoVideo if not already imported
if (!content.includes("BentoVideo")) {
  content = content.replace(
    /import \{ VideoBackground \} from '\.\/VideoBackground';/,
    `import { VideoBackground } from './VideoBackground';\nimport { BentoVideo } from './BentoVideo';`
  );
}

// Replace the Main Large Image with BentoVideo
content = content.replace(
  /<div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105" style={{ backgroundImage: "url\('\/images\/schedule\/bg-1\.jpg'\)", filter: "grayscale\(100%\)" }}><\/div>/,
  `<BentoVideo />`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Bento box to use BentoVideo.");
