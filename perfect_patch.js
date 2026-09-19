const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Remove dead modal
content = content.replace(/<AdminMarkEntryModal\s+visible=\{markModalVisible\}[\s\S]*?\/>/m, "");

// 2. Add editingRegistration state
content = content.replace(
    "const [published, setPublished] = useState(false);",
    "const [published, setPublished] = useState(false);\n  const [editingRegistration, setEditingRegistration] = useState<any>(null);"
);

// 3. Replace Judge Marks Block
const oldJudgeMarksBlock = `{false && mode === 'marks' && judgeMarks.length > 0 && (
                <View className="border-l-2 border-blue-200 pl-3 py-1 mb-2">
                  <Text className="font-poppins-bold text-[10px] text-ssf-text-muted mb-1">
                    Judge Marks:
                  </Text>
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
                  {judgeMarks.length < expectedJudges && (
                    <Text className="font-poppins text-[10px] text-orange-600 mt-1">
                      ?? Only {judgeMarks.length}/{expectedJudges} judges submitted
                    </Text>
                  )}
                </View>
              )}`;

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

content = content.replace(oldJudgeMarksBlock, newJudgeMarksBlock);

// 4. Replace Unlock Marks Prompt
const oldUnlockBlock = `if (Platform.OS === 'web') {
                  const ans = window.prompt("To unlock all marks for this event, type 'UNLOCK' in uppercase:");
                  if (ans === 'UNLOCK') {
                    unlockScheduleMarks.mutate(scheduleId);
                  } else if (ans !== null) {
                    window.alert("Invalid input. Marks were not unlocked.");
                  }
                } else {
                  Alert.alert(
                    "Unlock All Marks",
                    "Are you sure you want to unlock ALL marks for this event? Results will be unpublished and judges can edit marks again.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Yes, Unlock All", style: "destructive", onPress: () => unlockScheduleMarks.mutate(scheduleId) }
                    ]
                  );
                }`;

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

content = content.replace(oldUnlockBlock, newUnlockBlock);

// 5. Add Modal at the end
const oldEnd = `      </View>
    </View>
  );
}`;

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

content = content.replace(oldEnd, newEnd);

// 6. Fix Republish Web bug (Missing return)
content = content.replace(
  "setForceRepublishConfirmed(true);\n      } else {",
  "setForceRepublishConfirmed(true);\n        return;\n      } else {"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Perfect patch complete.");
