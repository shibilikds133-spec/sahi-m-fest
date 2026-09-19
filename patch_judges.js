const fs = require('fs');
const path = 'src/app/(admin)/judges/index.tsx';
let content = fs.readFileSync(path, 'utf8');

// The HTML section starts around `Print Evaluation Sheet`
// I need to replace `#000` with `#000080` in the print HTML ONLY, or everywhere in the file?
// Actually, in `judges/index.tsx`, `#000` is only used for the table.
// And `ui.shadow.shadowColor` is used for the text 'ALVIORA 2K26', 'Judge name', 'Item name'.

content = content.replace(/ui\.shadow\.shadowColor/g, "'#000080'");
content = content.replace(/borderColor: '#000'/g, "borderColor: '#000080'");
content = content.replace(/color: '#000'/g, "color: '#000080'");

fs.writeFileSync(path, content);
console.log("Updated judges/index.tsx");
