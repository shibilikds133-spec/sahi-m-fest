const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Remove dead modal (safe regex, it's just one JSX tag)
content = content.replace(/<AdminMarkEntryModal\s+visible=\{markModalVisible\}[\s\S]*?\/>/m, "");

// 2. Add state
content = content.replace(
    "const [published, setPublished] = useState(false);",
    "const [published, setPublished] = useState(false);\n  const [editingRegistration, setEditingRegistration] = useState<any>(null);"
);

// 3. Fix Judge marks block (Line by line string replace, very safe)
content = content.replace("{false && mode === 'marks' && judgeMarks.length > 0 && (", "{mode === 'marks' && (");
content = content.replace(
    "Judge Marks:\n                  </Text>",
    "Judge Marks:\n                    </Text>\n                    {!published && (\n                      <TouchableOpacity onPress={() => setEditingRegistration(reg)} className=\"bg-blue-50 border border-blue-200 px-2 py-1 rounded shadow-sm\">\n                        <Text className=\"text-blue-700 font-poppins-bold text-[10px]\">?? Edit Marks</Text>\n                      </TouchableOpacity>\n                    )}\n                  </View>"
);
content = content.replace(
    "<Text className=\"font-poppins-bold text-[10px] text-ssf-text-muted mb-1\">",
    "<View className=\"flex-row justify-between items-center mb-1\">\n                    <Text className=\"font-poppins-bold text-[10px] text-ssf-text-muted\">"
);

// Add the missing judgeMarks logic just before the closing tag of the judge marks view
content = content.replace(
    "{judgeMarks.length < expectedJudges && (",
    "{judgeMarks.length === 0 && (\n                     <Text className=\"font-poppins text-[10px] text-gray-500 italic mt-1\">No marks submitted yet.</Text>\n                  )}\n                  {judgeMarks.length > 0 && judgeMarks.length < expectedJudges && ("
);

// 4. Unlock Marks logic
content = content.replace(
    `const ans = window.prompt("To unlock all marks for this event, type 'UNLOCK' in uppercase:");`,
    `const ans = window.prompt("Security Check: Enter Admin Password (Tenant ID) to unlock marks:");`
);
content = content.replace(
    `if (ans === 'UNLOCK') {`,
    `if (ans === schedule?.tenant_id) {`
);
content = content.replace(
    `window.alert("Invalid input. Marks were not unlocked.");`,
    `window.alert("Incorrect Password! Marks were not unlocked.");`
);
content = content.replace(
    `"Are you sure you want to unlock ALL marks for this event? Results will be unpublished and judges can edit marks again.",`,
    `"Security Notice: Unlocking will unpublish results and allow mark edits. Proceed?",`
);

// 5. Web republish fix
content = content.replace(
    "setForceRepublishConfirmed(true);\n      } else {",
    "setForceRepublishConfirmed(true);\n        return;\n      } else {"
);

// 6. Append Modal safely at the absolute end of the string
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

content = content.substring(0, content.lastIndexOf("</View>")) + newEnd;

fs.writeFileSync(filePath, content, "utf8");
console.log("Safe patch final complete.");
