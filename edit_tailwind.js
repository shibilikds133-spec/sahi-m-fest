const fs = require("fs");
const filePath = "tailwind.config.js";
let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("marquee:")) {
  content = content.replace(
    /extend:\s*\{/,
    `extend: {
      animation: {
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },`
  );
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Added marquee animation to tailwind.config.js");
} else {
  console.log("Marquee already exists");
}
