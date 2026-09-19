const fs = require('fs');
const path = 'src/providers/storage/r2StorageProvider.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace: const fileUrl = verification.publicUrl || publicUrl || await this.getUrl(input.objectKey, input.visibility, input.contentType);
// With: 
// let fileUrl = verification.publicUrl || publicUrl;
// if (!fileUrl) {
//   fileUrl = (input.visibility === 'public' && R2_PUBLIC_DOMAIN) ? `https://${R2_PUBLIC_DOMAIN}/${input.objectKey}` : `r2://${input.objectKey}`;
// }

const searchStr = `const fileUrl = verification.publicUrl || publicUrl || await this.getUrl(input.objectKey, input.visibility, input.contentType);`;
const replaceStr = `let fileUrl = verification.publicUrl || publicUrl;
    if (!fileUrl) {
      fileUrl = (input.visibility === 'public' && R2_PUBLIC_DOMAIN) ? \`https://\${R2_PUBLIC_DOMAIN}/\${input.objectKey}\` : \`r2://\${input.objectKey}\`;
    }`;

content = content.replace(searchStr, replaceStr);
fs.writeFileSync(path, content);
