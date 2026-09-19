const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else {
      if (dirFile.endsWith('.tsx') || dirFile.endsWith('.ts')) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
};

const files = walkSync('src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const replaceLucideImport = (oldName, newName) => {
    // Check if the oldName is explicitly imported from lucide-react-native
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${oldName}\\b[^}]*\\}\\s*from\\s*['"]lucide-react-native['"]`);
    if (importRegex.test(content)) {
      content = content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
      changed = true;
      console.log(`Replaced ${oldName} with ${newName} in ${file}`);
    }
  };

  replaceLucideImport('CheckCircle2', 'CircleCheck'); 
  replaceLucideImport('BarChart3', 'ChartBar');
  replaceLucideImport('UserCircle', 'CircleUser');
  replaceLucideImport('Home', 'House');
  
  if (changed) {
    fs.writeFileSync(file, content);
  }
});
