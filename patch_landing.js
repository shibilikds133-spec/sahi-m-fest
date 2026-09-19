const fs = require('fs');
const path = 'src/components/publicLanding/SahithyolsavLandingPage.web.tsx';
let content = fs.readFileSync(path, 'utf8');

const dtLink = `\n                  <Link href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`} className="hover-lift w-full sm:w-auto border border-[#c69a53]/40 text-[#c69a53] px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#c69a53]/10 transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">\n                    <span className="material-symbols-outlined">format_list_numbered</span>\n                    Item Results\n                  </Link>`;
content = content.replace(/Today's Schedule\s*<\/a>/, `Today's Schedule</a>${dtLink}`);

const mobLink = `\n                  <Link href={\`/leaderboard/item-results?tenant_id=\${tenantId}\`} className="w-full border border-[#c69a53]/40 text-[#c69a53] py-4 rounded-2xl font-bold text-sm hover:bg-[#c69a53]/10 transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">\n                    <span className="material-symbols-outlined text-lg">format_list_numbered</span>\n                    Item Results\n                  </Link>`;
content = content.replace(/Live Schedule\s*<\/a>/, `Live Schedule</a>${mobLink}`);

fs.writeFileSync(path, content);
