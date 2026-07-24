const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace all words starting with dark: avoiding replacing text-ssf-dark initially if any exist, wait text-ssf-dark isn't dark:
    let newContent = content.replace(/\bdark:[a-zA-Z0-9-\[\]#]+/g, '');
    // Also remove any rogue double spaces created by the removal
    newContent = newContent.replace(/  +/g, ' ');
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log('Updated ' + filePath);
    }
  }
});
