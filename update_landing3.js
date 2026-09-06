const fs = require('fs');
let code = fs.readFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'utf8');

const headTags = `
      <Head>
        <title>Sahithyolsav Festival</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@800&amp;display=swap" rel="stylesheet"/>
        <style>{\`
          .marquee-container { overflow: hidden; white-space: nowrap; }
          .marquee-content { display: inline-block; animation: marquee 20s linear infinite; }
          @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
          .bg-pattern { background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px; }
          @media (prefers-reduced-motion: no-preference) {
              .fade-in-up { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
              .fade-in-up.visible { opacity: 1; transform: translateY(0); }
              .hover-lift { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
              .hover-lift:hover { transform: scale(1.05); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
              @keyframes subtle-motion {
                  0%, 100% { color: #1C5FA8; text-shadow: 0 0 0 rgba(28,95,168,0); }
                  50% { color: #3b82f6; text-shadow: 0 0 12px rgba(59,130,246,0.3); }
              }
              .animate-subtle-motion { animation: subtle-motion 3s ease-in-out infinite; display: inline-block; }
          }
          @media (prefers-reduced-motion: reduce) {
              .fade-in-up { opacity: 1; transform: none; }
              .hover-lift { transition: none; }
              .hover-lift:hover { transform: none; }
              .animate-subtle-motion { animation: none; }
          }
        \`}</style>
      </Head>
`;

// It seems I never replaced the <> properly, so it's still <>
if (code.includes('<>')) {
  code = code.replace('<>', '<div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-transparent text-alviora-body font-body-md antialiased">\n' + headTags);
  code = code.replace('</>', '</div>');
} else {
  // If it already has the wrapper, replace it
  code = code.replace(/<div style=\{\{ flex: 1, width: "100%", minHeight: "100vh" \}\} className="bg-white">/, '<div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-transparent text-alviora-body font-body-md antialiased">\n' + headTags);
}

fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', code);
console.log('landing page updated');
