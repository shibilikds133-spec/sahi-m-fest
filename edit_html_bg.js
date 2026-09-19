const fs = require("fs");
const filePath = "public/index.html";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /<body style="background-color: #011635;">/,
  `<body style="background-color: #050505;">`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Changed index.html background to #050505.");
