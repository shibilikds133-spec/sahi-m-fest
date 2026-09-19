const fs = require("fs");
const content = fs.readFileSync("src/core/store/authStore.ts", "utf-8");
console.log(content.substring(0, 1000));
