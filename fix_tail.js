const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

const brokenEnd = `      </View>
          </View>

      {editingRegistration && (`;

const fixedEnd = `      </View>

      {editingRegistration && (`;

content = content.replace(brokenEnd, fixedEnd);
fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed tail.");
