
const fs = require("fs");
let content = fs.readFileSync("src/constants/categories.ts", "utf8");

const replacementAliases = `const SAHITHYOLSAV_CATEGORY_ALIASES: Record<string, string> = {
  SBJ: "SBJ",
  SUB_JUNIOR: "SBJ",
  JNR: "JR",
  SNR: "SR",
  JUNIOR: "JR",
  SENIOR: "SR",
  CAMPUS: "CA",
  GENERAL: "GN",
};`;

content = content.replace(/const SAHITHYOLSAV_CATEGORY_ALIASES:[\s\S]*?};/, replacementAliases);

const replacementJr = `code: "JR",
    name_en: "Junior",
    name_ml: "??????",`;
content = content.replace(/code: .JR.,[\s\S]*?name_ml: .*?,/, replacementJr);

const replacementSr = `code: "SR",
    name_en: "Senior",
    name_ml: "??????",`;
content = content.replace(/code: .SR.,[\s\S]*?name_ml: .*?,/, replacementSr);

const newCat = `export const CATEGORIES = [
  {
    code: "SBJ",
    name_en: "Sub Junior",
    name_ml: "??? ??????",
    age_max: 14,
    gender: "boys"
  },`;
content = content.replace(/export const CATEGORIES = \[/, newCat);

fs.writeFileSync("src/constants/categories.ts", content, "utf8");
console.log("Categories updated successfully");

