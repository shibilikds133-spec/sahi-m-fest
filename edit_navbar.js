const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Add state
const stateTarget = `const [searchQuery, setSearchQuery] = useState('');`;
content = content.replace(stateTarget, `const [searchQuery, setSearchQuery] = useState('');\n  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);`);

// Modify navbar buttons
const navTarget = `<div className="flex gap-4 handjet-wrapper">
              
              <button className="hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch</button>
            </div>`;
const navReplacement = `<div className="flex gap-4 handjet-wrapper">
              <button className="hidden md:block hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch</button>
              <button 
                className="md:hidden text-white p-2"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="material-symbols-outlined text-3xl">
                  {isMobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>
            </div>`;
content = content.replace(navTarget, navReplacement);

// Add the mobile menu HTML right after </nav>
const navEndTarget = `</nav>`;
const mobileMenuHtml = `</nav>

        {/* Mobile Menu Overlay */}
        <div 
          className={\`md:hidden fixed inset-0 bg-black/95 backdrop-blur-3xl z-40 transition-all duration-300 ease-in-out flex flex-col pt-32 px-6 \${
            isMobileMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
          }\`}
        >
          <div className="flex flex-col gap-6 font-['Handjet'] text-3xl uppercase tracking-widest">
            <Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'landing' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard?tenant_id=\${tenantId}&bypass_html=true\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'schedule' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/schedule?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Schedule
            </Link>
            <Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'units' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/unit-rankings?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Teams
            </Link>
            <Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'items' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Results
            </Link>
            <button className="mt-8 bg-[#c69a53] text-black px-6 py-4 rounded-xl font-bold text-2xl uppercase tracking-widest shadow-sm">
              Get In Touch
            </button>
          </div>
        </div>`;

content = content.replace(navEndTarget, mobileMenuHtml);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added mobile menu.");
