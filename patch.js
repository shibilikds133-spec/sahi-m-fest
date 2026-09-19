const fs = require('fs');
let file = fs.readFileSync('src/app/(admin)/schedule/[id]/results.tsx', 'utf8');

// 1. Add import
file = file.replace(
  /import \{ AdminMarkEntryModal \} from '..\/..\/..\/..\/components\/ui\/AdminMarkEntryModal';/,
  `import { AdminMarkEntryModal } from '../../../../components/ui/AdminMarkEntryModal';\nimport { DirectMarkEntryModal } from '../../../../components/ui/DirectMarkEntryModal';`
);

// 2. Add types and state
file = file.replace(
  /type ResultEntry = \{/,
  `type DirectMarkState = {\n  marks: Record<number, number>;\n  maxMark: number;\n};\n\ntype ResultEntry = {`
);

file = file.replace(
  /const \[results, setResults\] = useState<Record<string, ResultEntry>>\(\{\}\);/,
  `const [results, setResults] = useState<Record<string, ResultEntry>>({});\n  const [directMarks, setDirectMarks] = useState<Record<string, DirectMarkState>>({});\n  const [directEntryModal, setDirectEntryModal] = useState<{ visible: boolean, regId: string, judgeIndex: number, participantName: string, codeLetter: string } | null>(null);`
);

// 3. Add getDirectMarkSummary and update getAvgMark
file = file.replace(
  /const getAvgMark = React\.useCallback\(\s*\(regId: string\) => getMarkSummary\(regId\)\?\.rawAverage \?\? null,\s*\[getMarkSummary\],\s*\);/,
  `const getDirectMarkSummary = React.useCallback((regId: string) => {
    const entry = directMarks[regId];
    if (!entry || !entry.marks) return null;
    const values = Object.values(entry.marks);
    if (values.length === 0) return null;
    
    const sum = values.reduce((a, b) => a + b, 0);
    const rawAverage = sum / values.length;
    const maxMark = entry.maxMark || 100;
    const percentageAverage = (rawAverage / maxMark) * 100;
    
    return {
      rawAverage: Math.round(rawAverage * 100) / 100,
      percentageAverage: Math.round(percentageAverage * 100) / 100,
      commonMaximum: maxMark,
      count: values.length,
    };
  }, [directMarks]);

  const getAvgMark = React.useCallback(
    (regId: string) => {
      if (mode === 'direct') return getDirectMarkSummary(regId)?.rawAverage ?? null;
      return getMarkSummary(regId)?.rawAverage ?? null;
    },
    [getMarkSummary, getDirectMarkSummary, mode],
  );`
);

// 4. Update overallReadiness
file = file.replace(
  /regs\.forEach\(reg => \{\s*const marks = getJudgeMarks\(reg\.id\)\.filter\(m => m\.is_final \|\| m\.total_mark != null\);\s*if \(marks\.length > 0\) anySubmissions = true;\s*if \(marks\.length >= expectedJudges\) fullyReadyCount\+\+;\s*\}\);/,
  `regs.forEach(reg => {
      if (mode === 'direct') {
         const marksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;
         if (marksCount > 0) anySubmissions = true;
         if (marksCount >= expectedJudges) fullyReadyCount++;
      } else {
         const marks = getJudgeMarks(reg.id).filter((m: any) => m.is_final || m.total_mark != null);
         if (marks.length > 0) anySubmissions = true;
         if (marks.length >= expectedJudges) fullyReadyCount++;
      }
    });`
);
file = file.replace(
  /\[registrations, expectedJudges, published, getJudgeMarks\]\);/,
  `[registrations, expectedJudges, published, getJudgeMarks, mode, directMarks]);`
);

// 5. Update autoFillFromMarks to autoFill and use direct summary
file = file.replace(
  /const autoFillFromMarks = React\.useCallback\(\(\) => \{/g,
  `const autoFill = React.useCallback(() => {`
);
file = file.replace(
  /if \(!registrations \|\| !markEntries\) return;/g,
  `if (!registrations) return;`
);
file = file.replace(
  /const markSummary = getMarkSummary\(reg\.id\);/g,
  `const markSummary = mode === 'direct' ? getDirectMarkSummary(reg.id) : getMarkSummary(reg.id);`
);
file = file.replace(
  /\[registrations, markEntries, getMarkSummary, flexiblePointsConfig\]\);/g,
  `[registrations, markEntries, getMarkSummary, getDirectMarkSummary, flexiblePointsConfig, mode]);`
);

file = file.replace(
  /\/\/\s*Run auto-calculation whenever in marks mode and data is available\s*React\.useEffect\(\(\) => \{\s*if \(mode === 'marks'\) \{\s*autoFillFromMarks\(\);\s*\}\s*\}, \[mode, autoFillFromMarks\]\);/g,
  `// Run auto-calculation whenever in marks or direct mode and data is available\n  React.useEffect(() => {\n    if (mode === 'marks' || mode === 'direct') {\n      autoFill();\n    }\n  }, [mode, autoFill, directMarks, markEntries]);`
);

// 6. Update publish checks for direct mode
file = file.replace(
  /if \(mode === 'marks'\) \{\s*const regs = \(registrations as any\[\]\) \|\| \[\];/g,
  `if (mode === 'marks' || mode === 'direct') {\n      const regs = (registrations as any[]) || [];`
);
file = file.replace(
  /regs\.forEach\(reg => \{\s*const marks = getJudgeMarks\(reg\.id\)\.filter\(\(m: any\) => m\.is_final \|\| m\.total_mark != null\);\s*if \(marks\.length === 0\) \{\s*missingMarksCount\+\+;\s*\} else \{\s*anySubmissions = true;\s*\}\s*\}\);/g,
  `regs.forEach(reg => {\n        let count = 0;\n        if (mode === 'direct') {\n          count = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;\n        } else {\n          count = getJudgeMarks(reg.id).filter((m: any) => m.is_final || m.total_mark != null).length;\n        }\n        \n        if (count === 0) {\n          missingMarksCount++;\n        } else {\n          anySubmissions = true;\n        }\n      });`
);
file = file.replace(
  /have NOT received any marks from the judges, while others have! Are you absolutely sure/g,
  `have NOT received any marks! Are you absolutely sure`
);

// 7. Update UI to render direct entry UI
file = file.replace(
  /const markSummary = mode === 'direct' \? getDirectMarkSummary\(reg\.id\) : getMarkSummary\(reg\.id\);\s*const avg = markSummary\?\.rawAverage \?\? null;\s*const ptsPreview = getPointsPreview\(entry\?\.grade \?\? null, entry\?\.rank \?\? null\);/,
  `const markSummary = mode === 'direct' ? getDirectMarkSummary(reg.id) : getMarkSummary(reg.id);\n          const avg = markSummary?.rawAverage ?? null;\n          const ptsPreview = getPointsPreview(entry?.grade ?? null, entry?.rank ?? null);\n          const directEntryMarksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;`
);

file = file.replace(
  /const markSummary = getMarkSummary\(reg\.id\);\s*const avg = markSummary\?\.rawAverage \?\? null;\s*const ptsPreview = getPointsPreview\(entry\?\.grade \?\? null, entry\?\.rank \?\? null\);/,
  `const markSummary = mode === 'direct' ? getDirectMarkSummary(reg.id) : getMarkSummary(reg.id);\n          const avg = markSummary?.rawAverage ?? null;\n          const ptsPreview = getPointsPreview(entry?.grade ?? null, entry?.rank ?? null);\n          const directEntryMarksCount = directMarks[reg.id] ? Object.keys(directMarks[reg.id].marks).length : 0;`
);


file = file.replace(
  /\{\/\*\s*Show avg only in marks mode\s*\*\/\}\s*\{mode === 'marks' && avg !== null && \(/g,
  `{/* Show avg for both marks and direct mode */}\n                {(mode === 'marks' || mode === 'direct') && avg !== null && (`
);

file = file.replace(
  /\{\/\*\s*Judge marks breakdown — marks mode only\s*\*\/\}/g,
  `{/* Judge marks breakdown — marks mode */}`
);
file = file.replace(
  /text-blue-700 font-poppins-bold text-\[10px\]">\?\? Edit Marks<\/Text>/g,
  `text-blue-700 font-poppins-bold text-[10px]">?? Edit Marks</Text>`
);


file = file.replace(
  /\{judgeMarks\.length > 0 && judgeMarks\.length < expectedJudges && \([\s\S]*?<\/View>\s*\)\s*\}/,
  `{judgeMarks.length > 0 && judgeMarks.length < expectedJudges && (\n                    <Text className="font-poppins text-[10px] text-orange-600 mt-1">\n                      ?? Only {judgeMarks.length}/{expectedJudges} judges submitted\n                    </Text>\n                  )}\n                </View>\n              )}\n\n              {/* Direct Entry Marks breakdown */}\n              {mode === 'direct' && (\n                <View className="border-l-2 border-purple-200 pl-3 py-1 mb-3">\n                  <View className="flex-row justify-between items-center mb-2">\n                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">\n                      Enter Marks ({directEntryMarksCount}/{expectedJudges} Judges)\n                    </Text>\n                  </View>\n                  <View className="flex-row flex-wrap gap-2">\n                    {Array.from({ length: expectedJudges }).map((_, i) => {\n                      const judgeIndex = i + 1;\n                      const hasMark = directMarks[reg.id]?.marks?.[judgeIndex] !== undefined;\n                      const markValue = directMarks[reg.id]?.marks?.[judgeIndex];\n                      const maxVal = directMarks[reg.id]?.maxMark || 100;\n                      \n                      return (\n                        <TouchableOpacity\n                          key={judgeIndex}\n                          onPress={() => setDirectEntryModal({\n                            visible: true,\n                            regId: reg.id,\n                            judgeIndex,\n                            participantName: reg.participants?.name ?? 'Unknown',\n                            codeLetter: reg.code_letter,\n                          })}\n                          disabled={published}\n                          className={\`flex-row items-center justify-between px-3 py-1.5 rounded-lg border \${hasMark ? 'bg-purple-50 border-purple-200' : 'bg-white border-dashed border-gray-300'} \${published ? 'opacity-70' : ''}\`}\n                        >\n                          <Text className={\`font-poppins text-[10px] \${hasMark ? 'text-purple-800' : 'text-gray-500'}\`}>\n                            Judge {judgeIndex}\n                          </Text>\n                          {hasMark && (\n                            <Text className="font-poppins-bold text-[10px] text-purple-900 ml-2">\n                              {markValue}/{maxVal}\n                            </Text>\n                          )}\n                        </TouchableOpacity>\n                      );\n                    })}\n                  </View>\n                </View>\n              )}`
);

// Rank selector
file = file.replace(
  /\{mode === 'marks' \? \(\s*<View className="h-9 flex-row items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3">\s*<Text className="font-poppins-bold text-\[11px\] text-emerald-800">\s*\{entry\?\.rank && entry\.rank !== '-' \? entry\.rank : 'No rank'\}\s*<\/Text>\s*<Text className="font-poppins text-\[9px\] text-emerald-700">Calculated from judge marks<\/Text>\s*<\/View>\s*\) : \(\s*<View className="flex-row flex-wrap gap-1\.5">\s*\{RANKS\.map\(rank => \([\s\S]*?<Text className="font-poppins-bold text-\[10px\] text-gray-500">No Rank<\/Text>\s*<\/TouchableOpacity>\s*<\/View>\s*\)\}/,
  `{(mode === 'marks' || mode === 'direct') ? (
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3">
                    <Text className="font-poppins-bold text-[11px] text-emerald-800">
                      {entry?.rank && entry.rank !== '-' ? entry.rank : 'No rank'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-emerald-700">Calculated from marks</Text>
                  </View>
                ) : (
                  <View />
                )}`
);

// Grade selector
file = file.replace(
  /\{mode === 'marks' \? \(\s*<View className="h-9 flex-row items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3">\s*<Text className="font-poppins-black text-\[11px\] text-blue-800">\s*\{entry\?\.grade && entry\.grade !== '-' \? entry\.grade : 'No grade'\}\s*<\/Text>\s*<Text className="font-poppins text-\[9px\] text-blue-700">Calculated from judge marks<\/Text>\s*<\/View>\s*\) : \(\s*<View className="flex-row flex-wrap gap-1\.5">\s*\{GRADES\.map\(grade => \([\s\S]*?<\/View>\s*\)\}/,
  `{(mode === 'marks' || mode === 'direct') ? (
                  <View className="h-9 flex-row items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3">
                    <Text className="font-poppins-black text-[11px] text-blue-800">
                      {entry?.grade && entry.grade !== '-' ? entry.grade : 'No grade'}
                    </Text>
                    <Text className="font-poppins text-[9px] text-blue-700">Calculated from marks</Text>
                  </View>
                ) : (
                  <View />
                )}`
);

// Add Modal and footer
file = file.replace(
  /\{editingRegistration && \(\s*<AdminMarkEntryModal[\s\S]*?assignedJudges=\{\(judgeSummary as any\[\]\) \|\| \[\]\}\s*\/>\s*\)\}/,
  `{/* Admin Re-Entry Modal */}
      {editingRegistration && schedule && activeFestival && (
        <AdminMarkEntryModal
          visible={true}
          onClose={() => setEditingRegistration(null)}
          scheduleId={scheduleId as string}
          registrationId={editingRegistration.id}
          participantName={editingRegistration.participants?.name ?? 'Unknown'}
          codeLetter={editingRegistration.code_letter}
          tenantId={schedule.tenant_id}
          itemNameEn={schedule.items?.item_name_en}
          itemNameMl={schedule.items?.item_name_ml}
          itemType={schedule.items?.type}
          existingMarks={getJudgeMarks(editingRegistration.id)}
          assignedJudges={schedule.assigned_judges}
        />
      )}

      {/* Direct Mark Entry Modal */}
      {directEntryModal && schedule && activeFestival && (
        <DirectMarkEntryModal
          visible={true}
          onClose={() => setDirectEntryModal(null)}
          onSave={(totalMark, maxMark) => {
             setDirectMarks(prev => {
                const regState = prev[directEntryModal.regId] || { marks: {}, maxMark: 100 };
                return {
                   ...prev,
                   [directEntryModal.regId]: {
                      ...regState,
                      marks: {
                         ...regState.marks,
                         [directEntryModal.judgeIndex]: totalMark
                      },
                      maxMark
                   }
                };
             });
          }}
          participantName={directEntryModal.participantName}
          codeLetter={directEntryModal.codeLetter}
          tenantId={schedule.tenant_id}
          itemNameEn={schedule.items?.item_name_en}
          itemNameMl={schedule.items?.item_name_ml}
          itemType={schedule.items?.type}
          judgeIndex={directEntryModal.judgeIndex}
          initialTotal={directMarks[directEntryModal.regId]?.marks?.[directEntryModal.judgeIndex]}
        />
      )}`
);

fs.writeFileSync('src/app/(admin)/schedule/[id]/results.tsx', file);
