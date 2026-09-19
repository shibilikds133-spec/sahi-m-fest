const fs = require('fs');
let file = fs.readFileSync('src/services/participantItemsPdfService.ts', 'utf8');

// Replace textColor: DARK_BLUE with textColor: [18, 59, 99] in autoTable options
file = file.replace(/textColor:\s*DARK_BLUE,/g, 'textColor: [18, 59, 99],');

fs.writeFileSync('src/services/participantItemsPdfService.ts', file);
