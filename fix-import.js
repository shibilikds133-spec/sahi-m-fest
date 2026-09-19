const fs = require('fs');

let c = fs.readFileSync('src/app/(admin)/schedule/[id]/results.tsx', 'utf8'); 
if(!c.includes('import { AdminMarkEntryModal }')) { 
  c = c.replace(/import \{ ui \} from '@\/constants\/designSystem';/, "import { AdminMarkEntryModal } from '@/components/ui/AdminMarkEntryModal';\nimport { ui } from '@/constants/designSystem';"); 
  fs.writeFileSync('src/app/(admin)/schedule/[id]/results.tsx', c); 
}
