const fs = require('fs');
let code = fs.readFileSync('src/app/(admin)/schedule/[id]/results.tsx', 'utf8');

if(!code.includes('AdminMarkEntryModal')) {
  code = "import AdminMarkEntryModal from '@/components/ui/AdminMarkEntryModal';\n" + code;
  
  code = code.replace(/const \[forceRepublishConfirmed, setForceRepublishConfirmed\] = useState\(false\);/, match => match + '\n  const [editingMarkRegId, setEditingMarkRegId] = useState<string | null>(null);');
  
  const avgBlock = `{/* Show avg only in marks mode */}
                {mode === 'marks' && avg !== null && (
                  <View className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                    <Text className="font-poppins-bold text-emerald-700 text-[10px]">
                      {markSummary?.commonMaximum
                        ? \`Avg: \${avg}/\${markSummary.commonMaximum}\`
                        : \`Avg: \${markSummary?.percentageAverage}%\`}
                    </Text>
                  </View>
                )}
              </View>`;
              
  const avgBlockNew = `{/* Show avg only in marks mode */}
                {mode === 'marks' && (
                  <View className="items-end gap-y-1">
                    {avg !== null && (
                      <View className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">
                        <Text className="font-poppins-bold text-emerald-700 text-[10px]">
                          {markSummary?.commonMaximum
                            ? \`Avg: \${avg}/\${markSummary.commonMaximum}\`
                            : \`Avg: \${markSummary?.percentageAverage}%\`}
                        </Text>
                      </View>
                    )}
                    {!published && (
                      <TouchableOpacity
                        onPress={() => setEditingMarkRegId(reg.id)}
                        className="bg-orange-50 border border-orange-200 px-2 py-1 rounded-md"
                      >
                        <Text className="font-poppins-bold text-orange-700 text-[10px]">📝 Edit Mark</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>`;

  code = code.replace(avgBlock, avgBlockNew);

  const modalBlock = `{/* Action buttons */}
      <AdminMarkEntryModal
        visible={editingMarkRegId !== null}
        onClose={() => setEditingMarkRegId(null)}
        scheduleId={scheduleId}
        registrationId={editingMarkRegId ?? ''}
        participantName={(registrations as any[]).find(r => r.id === editingMarkRegId)?.participants?.name || 'Participant'}
        codeLetter={(registrations as any[]).find(r => r.id === editingMarkRegId)?.code_letter || ''}
        tenantId={schedule?.tenant_id || ''}
        itemNameEn={schedule?.items?.item_name_en || ''}
        itemNameMl={schedule?.items?.item_name_ml || ''}
        itemType={schedule?.items?.item_type || ''}
        existingMarks={editingMarkRegId ? getJudgeMarks(editingMarkRegId) : []}
      />`;
      
  code = code.replace('{/* Action buttons */}', modalBlock);
  fs.writeFileSync('src/app/(admin)/schedule/[id]/results.tsx', code);
  console.log('Fixed results.tsx');
}
