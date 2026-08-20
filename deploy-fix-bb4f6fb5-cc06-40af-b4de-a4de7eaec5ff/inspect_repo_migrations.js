const fs = require('fs');
const path = require('path');

const repoDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main\\supabase\\migrations';
const rootDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main';

const files = fs.readdirSync(repoDir);
console.log('=== ALL FILES IN supabase/migrations ===');
files.forEach(f => {
  if (f.includes('018') || f.includes('022') || f.includes('063')) {
    console.log(`MATCH: ${f}`);
  }
});

// Check if any 063 exists at root or elsewhere
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(rf => {
  if (rf.includes('063')) {
    console.log(`ROOT MATCH: ${rf}`);
  }
});
