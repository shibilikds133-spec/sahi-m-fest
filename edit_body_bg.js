const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /className="bg-alviora-bg text-alviora-body font-body-md antialiased"/,
  `className="bg-[#050505] text-alviora-body font-body-md antialiased"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Changed root background to #050505.");
