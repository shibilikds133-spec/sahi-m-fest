const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Remove Admin button
content = content.replace(
  /<button onClick=\{\(\) => router\.push\('\/\(auth\)\/login'\)\} className="hidden md:block px-4 py-2 font-bold text-lg uppercase tracking-widest text-white hover:text-gray-200 transition-colors">Admin<\/button>/,
  ""
);

// Change Register to Get in touch
content = content.replace(
  /<button className="hover-lift bg-\[#c69a53\] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Register<\/button>/,
  `<button className="hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch</button>`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Header buttons updated");
