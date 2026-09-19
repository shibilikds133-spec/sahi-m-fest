const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Fix Judge marks block
const oldJudgeMarksRegex = /\{false && mode === 'marks' && judgeMarks\.length > 0 && \([\s\S]*?\)\}/m;

const newJudgeMarksBlock = `{mode === 'marks' && (
                <View className="border-l-2 border-blue-200 pl-3 py-1 mb-2">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                      Judge Marks:
                    </Text>
                    {!published && (
                      <TouchableOpacity onPress={() => setEditingRegistration(reg)} className="bg-blue-50 border border-blue-200 px-2 py-1 rounded shadow-sm">
                        <Text className="text-blue-700 font-poppins-bold text-[10px]">?? Edit Marks</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {judgeMarks.map((m: any, i: number) => (
                    <View key={m.id} className="flex-row justify-between mb-1">
                      <Text className="font-poppins text-[10px] text-ssf-text">
                        {m.judges?.name ?? \`Judge \${i + 1}\`}
                      </Text>
                      <Text className="font-poppins-bold text-[10px] text-ssf-primary">
                        {m.total_mark}/{m.max_mark_snapshot || 100} {m.is_final ? '?' : '(draft)'}
                      </Text>
                    </View>
                  ))}
                  {judgeMarks.length === 0 && (
                     <Text className="font-poppins text-[10px] text-gray-500 italic mt-1">No marks submitted yet.</Text>
                  )}
                  {judgeMarks.length > 0 && judgeMarks.length < expectedJudges && (
                    <Text className="font-poppins text-[10px] text-orange-600 mt-1">
                      ?? Only {judgeMarks.length}/{expectedJudges} judges submitted
                    </Text>
                  )}
                </View>
              )}`;

if (content.match(oldJudgeMarksRegex)) {
    content = content.replace(oldJudgeMarksRegex, newJudgeMarksBlock);
    console.log("Judge marks block patched.");
} else {
    console.log("Could not find Judge marks block to patch!");
}

// 2. Fix Unlock Marks button
const oldUnlockRegex = /if \(Platform\.OS === 'web'\) \{\s*const ans = window\.prompt\("To unlock all marks for this event, type 'UNLOCK' in uppercase:"\);\s*if \(ans === 'UNLOCK'\) \{\s*unlockScheduleMarks\.mutate\(scheduleId\);\s*\} else if \(ans !== null\) \{\s*window\.alert\("Invalid input\. Marks were not unlocked\."\);\s*\}\s*\} else \{\s*Alert\.alert\([\s\S]*?\]\s*\);\s*\}/m;

const newUnlockBlock = `if (Platform.OS === 'web') {
                  const ans = window.prompt("Security Check: Enter Admin Password (Tenant ID) to unlock marks:");
                  if (ans === schedule?.tenant_id) {
                    unlockScheduleMarks.mutate(scheduleId);
                  } else if (ans !== null) {
                    window.alert("Incorrect Password! Marks were not unlocked.");
                  }
                } else {
                  Alert.alert(
                    "Unlock All Marks",
                    "Security Notice: Unlocking will unpublish results and allow mark edits. Proceed?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Yes, Unlock All", style: "destructive", onPress: () => unlockScheduleMarks.mutate(scheduleId) }
                    ]
                  );
                }`;

if (content.match(oldUnlockRegex)) {
    content = content.replace(oldUnlockRegex, newUnlockBlock);
    console.log("Unlock Marks button patched.");
} else {
    console.log("Could not find Unlock Marks block to patch!");
}

fs.writeFileSync(filePath, content, "utf8");
