const fs = require("fs");
const path = require("path");

function replaceInFile(filePath, searchRegex, replacement) {
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(searchRegex, replacement);
  fs.writeFileSync(filePath, content, "utf8");
}

replaceInFile(
  "src/app/(admin)/stage-management/index.tsx",
  /from '\.\.\/\.\.\//g,
  "from '../../../"
);

replaceInFile(
  "src/app/(admin)/stage-management/[id]/checkin.tsx",
  /from '\.\.\/\.\.\/\.\.\//g,
  "from '../../../../"
);

replaceInFile(
  "src/app/(admin)/stage-management/[id]/code-letter.tsx",
  /from '\.\.\/\.\.\/\.\.\//g,
  "from '../../../../"
);

console.log("Fixed stage management imports");
