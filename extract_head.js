const fs = require('fs');
const html = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/a74b5e36-3c2e-404e-86e0-8cb0aecfa4f6/scratch/stitch_code.html', 'utf8');
const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
if (head) {
  console.log(head[1]);
} else {
  // Try to find tailwind config manually
  const tw = html.match(/tailwind\.config = \{([\s\S]*?)\}/i);
  if (tw) console.log(tw[1]);
}
