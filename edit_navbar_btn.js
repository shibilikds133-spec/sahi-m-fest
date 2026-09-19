const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /<button className="hover-lift bg-\[#c69a53\] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch<\/button>/,
  `<button className="hidden md:block hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch</button>
              <button 
                className="md:hidden text-white p-2"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="material-symbols-outlined text-3xl">
                  {isMobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated navbar buttons.");
