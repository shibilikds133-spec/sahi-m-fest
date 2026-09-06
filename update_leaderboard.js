const fs = require('fs');
let code = fs.readFileSync('src/app/(public)/leaderboard.tsx', 'utf8');

// Change the target tenant ID
code = code.replace(/const TARGET_TENANT_ID = 'f247b04f-a6d0-4b36-896d-efae2b7e3b30';/g, "const TARGET_TENANT_ID = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';");

// Import the new Landing Page at the top if it's not there
if (!code.includes('SahithyolsavLandingPage')) {
  code = code.replace(
    "import { AlvioraCustomRenderer } from '../../components/leaderboard/AlvioraCustomRenderer';",
    "import { AlvioraCustomRenderer } from '../../components/leaderboard/AlvioraCustomRenderer';\nimport { SahithyolsavLandingPage } from '../../components/publicLanding/SahithyolsavLandingPage';"
  );
}

// Replace AlvioraCustomRenderer with SahithyolsavLandingPage in the custom rendering block
code = code.replace(/<AlvioraCustomRenderer page=\{page\} \/>/g, '<SahithyolsavLandingPage />');

fs.writeFileSync('src/app/(public)/leaderboard.tsx', code);
console.log('leaderboard.tsx updated');
