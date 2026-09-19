const fs = require("fs");
const filePath = "src/app/(admin)/schedule/[id]/results.tsx";
let content = fs.readFileSync(filePath, "utf8");

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

content = content.replace(/<\/View>\s*\);\s*}\s*$/, modalCode);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added modal at end of file.");
