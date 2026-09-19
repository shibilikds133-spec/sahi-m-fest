const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/\r\n/g, "\n");

// 1. Add 'media' to page prop type
content = content.replace(
  /export function SahithyolsavLandingPage\(\{ page = 'landing' \}: \{ page\?: 'landing' \| 'schedule' \| 'units' \| 'items' \}\) \{/,
  `export function SahithyolsavLandingPage({ page = 'landing' }: { page?: 'landing' | 'schedule' | 'units' | 'items' | 'media' }) {`
);

// 2. Add Media link in Desktop Navbar
const desktopNavLinks = `<Link className={\`transition-colors duration-200 font-bold text-lg uppercase tracking-widest \${page === 'items' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}\`} href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`}>Results</Link>`;
const desktopNavLinksReplacement = `<Link className={\`transition-colors duration-200 font-bold text-lg uppercase tracking-widest \${page === 'items' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}\`} href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`}>Results</Link>
              <Link className={\`transition-colors duration-200 font-bold text-lg uppercase tracking-widest \${page === 'media' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}\`} href={\`/leaderboard/media?tenant_id=\${tenantId}\`}>Posters</Link>`;
content = content.replace(desktopNavLinks, desktopNavLinksReplacement);

// 3. Add Media link in Mobile Navbar
const mobileNavLinks = `<Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'items' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Results
            </Link>`;
const mobileNavLinksReplacement = `<Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'items' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Results
            </Link>
            <Link 
              className={\`transition-colors duration-200 border-b border-white/10 pb-4 \${page === 'media' ? 'text-[#c69a53]' : 'text-white'}\`} 
              href={\`/leaderboard/media?tenant_id=\${tenantId}\`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Posters
            </Link>`;
content = content.replace(mobileNavLinks, mobileNavLinksReplacement);

// 4. Team Point Posters Window on Right Side
const desktopRightEnd = `              )}
              </div>
              
              {/* Mobile Leaderboard Layout */}`;
const teamPointPostersHtml = `              )}

              {/* Right Side: Team Point Posters (Units Page) */}
              {page === 'units' && (
              <div className="flex-1 relative z-10 flex flex-col justify-center items-center bg-[#1A1A1A]/40 rounded-[2.5rem] border border-[#333]/50 p-6 min-h-[400px]">
                <div className="w-full text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Team Point Posters</h3>
                  <p className="text-white/50 text-sm">Latest updates from the media center</p>
                </div>
                <div className="w-full max-w-sm aspect-square bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
                  {/* Placeholder for now. We will integrate R2 swipeable carousel here later. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 p-8 text-center gap-4">
                     <span className="material-symbols-outlined text-5xl">imagesmode</span>
                     <p>Posters will appear here</p>
                  </div>
                </div>
              </div>
              )}
              </div>
              
              {/* Mobile Leaderboard Layout */}`;
content = content.replace(desktopRightEnd, teamPointPostersHtml);

// 5. Team Point Posters for Mobile Layout (under Top Units)
const mobileTopUnitsEnd = `                  )}
                </div>

                {page === 'landing' && (`;
const mobileTeamPostersHtml = `                  )}
                </div>

                {page === 'units' && (
                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative aspect-square border border-[#333] shadow-lg flex flex-col items-center justify-center p-6">
                  <span className="material-symbols-outlined text-4xl text-white/30 mb-2">imagesmode</span>
                  <p className="text-white/30 text-sm">Team Posters</p>
                </div>
                )}

                {page === 'landing' && (`;
content = content.replace(mobileTopUnitsEnd, mobileTeamPostersHtml);


fs.writeFileSync(filePath, content, "utf8");
console.log("Updated public layout for media and posters");
