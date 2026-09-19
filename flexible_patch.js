const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 3. Fix Judge marks block using flexible regex
const blockRegex = /\{\s*false\s*&&\s*mode\s*===\s*'marks'\s*&&\s*judgeMarks\.length\s*>\s*0\s*&&\s*\([\s\S]*?\}\s*\)/;
if (content.match(blockRegex)) {
    const newBlock = `{mode === 'marks' && (
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
    content = content.replace(blockRegex, newBlock);
    console.log("Judge marks block patched with regex.");
} else {
    console.log("Could not match Judge marks block.");
}

// 4. Fix Unlock Marks Prompt using flexible regex
const unlockRegex = /if\s*\(Platform\.OS\s*===\s*'web'\)\s*\{\s*const\s*ans\s*=\s*window\.prompt\("To unlock all marks for this event, type 'UNLOCK' in uppercase:"\);\s*if\s*\(ans\s*===\s*'UNLOCK'\)\s*\{\s*unlockScheduleMarks\.mutate\(scheduleId\);\s*\}\s*else\s*if\s*\(ans\s*!==\s*null\)\s*\{\s*window\.alert\("Invalid input\.\s*Marks were not unlocked\."\);\s*\}\s*\}\s*else\s*\{\s*Alert\.alert\([\s\S]*?\]\s*\);\s*\}/;

if (content.match(unlockRegex)) {
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
    content = content.replace(unlockRegex, newUnlockBlock);
    console.log("Unlock Marks button patched with regex.");
} else {
    console.log("Could not match Unlock marks block.");
}

// 5. Add Modal at the end
const endRegex = /<\/View>\s*<\/View>\s*\);\s*\}/;
if (content.match(endRegex) && !content.includes("<AdminMarkEntryModal")) {
    const newEnd = `      </View>

      {editingRegistration && (
        <AdminMarkEntryModal
          visible={!!editingRegistration}
          onClose={() => setEditingRegistration(null)}
          scheduleId={id as string}
          registrationId={editingRegistration.id}
          participantName={editingRegistration.participants?.name || 'Unknown'}
          codeLetter={editingRegistration.code_letter}
          tenantId={schedule?.tenant_id || ''}
          itemNameEn={schedule?.items?.item_name_en || ''}
          itemNameMl={schedule?.items?.item_name_ml || ''}
          itemType={schedule?.items?.item_type || ''}
          existingMarks={getJudgeMarks(editingRegistration.id)}
        />
      )}
    </View>
  );
}`;
    content = content.replace(endRegex, newEnd);
    console.log("Modal block added with regex.");
} else {
    console.log("Could not match End block or already added.");
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Flexible patch complete.");
