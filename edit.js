const fs = require("fs");
const file = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(file, "utf8");

const idx1 = content.indexOf("        {/* Stats Section */}");
if (idx1 === -1) {
    console.log("Could not find stats section");
    process.exit(1);
}

const beforeStats = `
          </>)}
          
          {/* POST-HERO BACKGROUND WRAPPER */}
          <div className="relative w-full md:bg-[url('/images/post-hero-bg.png')] bg-cover bg-top bg-no-repeat">
            <div className="absolute inset-0 bg-alviora-bg/40 z-0 pointer-events-none transition-colors duration-300"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-alviora-bg via-transparent to-alviora-bg z-0 pointer-events-none md:block hidden"></div>
            
            <div className="relative z-10 flex flex-col">
              {page === 'landing' && (<>
`;
content = content.substring(0, idx1) + beforeStats + content.substring(idx1);

const idx2 = content.indexOf("      </main>\r\n\r\n      {/* Footer */}");
if (idx2 === -1) {
    const idx3 = content.indexOf("      </main>\n\n      {/* Footer */}");
    if (idx3 === -1) {
        console.log("Could not find end of main");
        process.exit(1);
    } else {
        content = content.substring(0, idx3) + "            </div>\n          </div>\n" + content.substring(idx3);
    }
} else {
    content = content.substring(0, idx2) + "            </div>\r\n          </div>\r\n" + content.substring(idx2);
}

fs.writeFileSync(file, content, "utf8");
console.log("Successfully applied updates synchronously");

