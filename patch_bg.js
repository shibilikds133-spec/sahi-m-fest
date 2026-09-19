const fs = require('fs');
const path = 'src/components/leaderboard/PosterStudio/Properties/BackgroundBlock.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("import useImage from 'use-image';", "import useImage from 'use-image';\nimport { useResolvedImageUrl } from '../../../../../core/hooks/useResolvedImageUrl';");
content = content.replace("const [image] = useImage(activeTemplate?.background_url || '', 'anonymous');", "const resolvedBgUrl = useResolvedImageUrl(activeTemplate?.background_url);\n  const [image] = useImage(resolvedBgUrl || '', 'anonymous');");

fs.writeFileSync(path, content);
