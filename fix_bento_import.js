const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("import { BentoVideo }")) {
  content = content.replace(
    /import React, \{ useState, useEffect, useRef \} from 'react';/,
    `import React, { useState, useEffect, useRef } from 'react';\nimport { BentoVideo } from './BentoVideo';`
  );
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Added BentoVideo import.");
}
