const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

const oldBlock = `{false && mode === 'marks' && judgeMarks.length > 0 && (
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

const newBlock = `{mode === 'marks' && (
                <View className="border-l-2 border-blue-200 pl-3 py-1 mb-2">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-poppins-bold text-[10px] text-ssf-text-muted">
                      Judge Marks:
                    </Text>
                    <TouchableOpacity onPress={() => setEditingRegistration(reg)} className="bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                      <Text className="text-blue-700 font-poppins-bold text-[9px]">Edit Marks</Text>
                    </TouchableOpacity>
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

// Remove funny characters from string literal replacement to avoid mismatch
content = content.replace(/\{false && mode === 'marks' && judgeMarks\.length > 0 && \([\s\S]*?\)\}/m, newBlock);

// Also add state variable
if (!content.includes("const [editingRegistration")) {
    content = content.replace(
        "const [published, setPublished] = useState(false);",
        "const [published, setPublished] = useState(false);\n  const [editingRegistration, setEditingRegistration] = useState<any>(null);"
    );
}

// Also add the modal component at the very end before the last </View>
const modalCode = `
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

content = content.replace(/<\/View>\s*<\/View>\s*\);\s*}\s*$/, `</View>\n${modalCode}`);

fs.writeFileSync(filePath, content, "utf8");
console.log("Patched judge marks block and added modal.");
