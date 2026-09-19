const fs = require('fs');
let file = fs.readFileSync('src/app/(admin)/schedule/[id]/marks.tsx', 'utf8');

// Remove updateScore and handleSaveAll functions
file = file.replace(/const updateScore = \([\s\S]*?\}\);/g, '');
file = file.replace(/const handleSaveAll = async \(\) => \{[\s\S]*?finally \{\s*setIsSavingAll\(false\);\s*\}\s*\};/g, '');

// Disable the score buttons
file = file.replace(
  /onPress=\{\(\) => \{\s*if \(!isFinalized\) updateScore\(reg\.id, selectedJudge, c\.key, val\);\s*\}\}/g,
  `disabled={true}` // replaces onPress entirely
);
file = file.replace(/disabled=\{isFinalized\}/g, ''); // remove the old disabled

// Make the score button style always look readonly (or keep original style but just disabled)
// original: isFinalized ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-200'
file = file.replace(
  /isFinalized \? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-200'/g,
  `'bg-gray-100 border-gray-200 opacity-80'`
);

// Remove the submit button block
file = file.replace(
  /\{registrations && \(registrations as any\[\]\)\.some\([\s\S]*?<\/View>\s*\)\}/g,
  ''
);

fs.writeFileSync('src/app/(admin)/schedule/[id]/marks.tsx', file);
