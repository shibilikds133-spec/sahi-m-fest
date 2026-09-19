const fs = require('fs');

// 1. Restore AdminMarkEntryModal to results.tsx
let resultsCode = fs.readFileSync('src/app/(admin)/schedule/[id]/results.tsx', 'utf8');
if (!resultsCode.includes('AdminMarkEntryModal')) {
    resultsCode = resultsCode.replace(/import \{ View, Text/, "import { AdminMarkEntryModal } from '@/components/ui/AdminMarkEntryModal';\nimport { View, Text");
    
    // Add state variables
    const stateVars = `  const [markModalVisible, setMarkModalVisible] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<any>(null);`;
    resultsCode = resultsCode.replace(/const \{ id \} \= useLocalSearchParams/, stateVars + "\n  const { id } = useLocalSearchParams");
    
    // Add the modal component
    const modalJSX = `      <AdminMarkEntryModal 
        visible={markModalVisible}
        onClose={() => setMarkModalVisible(false)}
        scheduleId={id as string}
        judgeId={selectedJudgeId!}
        registration={selectedRegistration!}
        criteria={activeCriteria || []}
      />
    </View>
  );
}`;
    resultsCode = resultsCode.replace(/<\/View>\s*?\);\s*?\}/, modalJSX);
    fs.writeFileSync('src/app/(admin)/schedule/[id]/results.tsx', resultsCode);
}
console.log('Restored results.tsx modal');

// 2. Restore useJudges.ts hooks
// (Run the restore-hooks.js script)

// 3. Fix theme colors (Run the fix-*.js scripts)

// 4. Restore Theme Picker (Run restore-theme-picker.js & move-themepicker.js)
