const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /                     <\/button>\n                  <\/div>\n                <\/div>\n              <\/div>\n              <\/div>\n              \n              \{\/\* Mobile Leaderboard Layout \*\/\}/g,
  `                     </button>
                  </div>
                </div>
              </div>
              </div>
              
              {/* Mobile Leaderboard Layout */}`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed JSX closing tag.");
