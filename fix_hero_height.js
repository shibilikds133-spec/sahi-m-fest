const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

const oldStr = 'className="relative w-full rounded-[2.5rem] overflow-hidden min-h-fit md:min-h-[85vh] flex items-center justify-center shadow-2xl border border-white/5 bg-black"';
const newStr = 'className="relative w-full rounded-[2.5rem] overflow-hidden min-h-fit md:min-h-[85vh] flex items-center shadow-2xl border border-white/5 bg-black"';

if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync(filePath, content, "utf8");
    console.log("Hero height fixed to remove justify-center!");
} else {
    console.log("Could not find the string.");
}
