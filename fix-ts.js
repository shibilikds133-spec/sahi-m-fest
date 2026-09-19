const fs = require('fs');

// 1. Fix item-results.tsx
let itemCode = fs.readFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', 'utf8');
itemCode = itemCode.replace(/ui\.colors\.destructive/g, 'ui.colors.danger');
fs.writeFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', itemCode);

// 2. Fix AdminMarkEntryModal.tsx
let modalCode = fs.readFileSync('src/components/ui/AdminMarkEntryModal.tsx', 'utf8');
modalCode = modalCode.replace(/criteriaScores: currentScores/g, 'criteriaMarks: currentScores');
fs.writeFileSync('src/components/ui/AdminMarkEntryModal.tsx', modalCode);

// 3. Fix useJudges.ts import
let judgesCode = fs.readFileSync('src/core/hooks/useJudges.ts', 'utf8');
if (!judgesCode.includes('import { supabase }')) {
    judgesCode = judgesCode.replace(/import \{ useFestival \} from '\.\/useFestival';/, "import { useFestival } from './useFestival';\nimport { supabase } from '@/core/supabase';");
}
// also fix criteriaMarks vs criteriaScores mismatch in useJudges.ts
judgesCode = judgesCode.replace(/criteriaScores: any/, "criteriaMarks: any");
judgesCode = judgesCode.replace(/criteriaScores, totalMark, isAbsent }: { scheduleId: string, judgeId: string, registrationId: string, criteriaMarks: any/, "criteriaMarks, totalMark, isAbsent }: { scheduleId: string, judgeId: string, registrationId: string, criteriaMarks: any");
judgesCode = judgesCode.replace(/p_criteria_marks: criteriaScores/, "p_criteria_marks: criteriaMarks");

fs.writeFileSync('src/core/hooks/useJudges.ts', judgesCode);
console.log('Fixed TS errors');
