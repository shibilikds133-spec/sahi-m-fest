import re

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the item category badge to show the full name
old_category_badge = '''                    {itemCategoryCodes.get(group.item_id)?.map((code: string) => (
                      <View key={code} style={styles.itemTypeBadge}>
                        <Text style={styles.itemTypeBadgeText}>{code.charAt(0).toUpperCase() + code.slice(1)}</Text>
                      </View>
                    ))}'''

new_category_badge = '''                    {itemCategoryCodes.get(group.item_id)?.map((code: string) => {
                      const cat = festivalCategories.find(c => c.code.toLowerCase() === code);
                      const catName = cat ? cat.name_en : (code.charAt(0).toUpperCase() + code.slice(1));
                      return (
                        <View key={code} style={styles.itemTypeBadge}>
                          <Text style={styles.itemTypeBadgeText}>{catName}</Text>
                        </View>
                      );
                    })}'''

content = content.replace(old_category_badge, new_category_badge)

# 2. Update nestedResultRow JSX for better responsiveness
old_nested_row = '''                        <View key={r.result_id} style={[styles.nestedResultRow, !isLast && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                          <View style={{ width: 24, alignItems: 'center' }}>
                            {r.rank ? <Text style={styles.nestedRankText}>#{r.rank}</Text> : <Text style={styles.nestedRankText}>-</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.nestedParticipantName} numberOfLines={1}>
                                {status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? \Chest #\\ : '?'}
                              </Text>
                              <ResultStatusBadge status={status} />
                              <PublicVisibilityBadge visible={r.public_visible === true} />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                              <Text style={styles.nestedMeta}>{r.organisation_name}</Text>
                              {r.grade && <Text style={styles.nestedMeta}>• {r.grade}</Text>}
                              <Text style={styles.nestedMeta}>• {r.points_awarded} pts</Text>
                            </View>
                          </View>
                          {/* Individual Overrides */}
                          <View style={styles.nestedActions}>'''

new_nested_row = '''                        <View key={r.result_id} style={[styles.nestedResultRow, !isLast && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                          {/* Rank + Main Info Container */}
                          <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                            <View style={{ width: 28, alignItems: 'center', marginTop: 2 }}>
                              {r.rank ? <Text style={styles.nestedRankText}>#{r.rank}</Text> : <Text style={styles.nestedRankText}>-</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <Text style={styles.nestedParticipantName}>
                                  {status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? \Chest #\\ : '?'}
                                </Text>
                                <ResultStatusBadge status={status} />
                                <PublicVisibilityBadge visible={r.public_visible === true} />
                              </View>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <Text style={styles.nestedMeta}>{r.organisation_name}</Text>
                                {r.grade && <Text style={[styles.nestedMeta, { color: '#0F172A', fontWeight: '700' }]}>• Grade {r.grade}</Text>}
                                <Text style={[styles.nestedMeta, { color: '#0F766E', fontWeight: '700' }]}>• {r.points_awarded} pts</Text>
                              </View>
                            </View>
                          </View>
                          
                          {/* Individual Overrides */}
                          <View style={[styles.nestedActions, { flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }]}>'''

content = content.replace(old_nested_row, new_nested_row)

# 3. Update nestedResultRow style
old_style = '''    nestedResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
    },'''

new_style = '''    nestedResultRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 8,
      gap: 12,
    },'''

content = content.replace(old_style, new_style)

# 4. Update previewResultRow to wrap as well, since that's a modal that might overflow
old_preview_row = '''                      <View key={r.result_id} style={styles.previewResultRow}>
                         <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
                           <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.navy }}>
                             {r.rank ? \#\\ : '-'}
                           </Text>
                         </View>
                         <View style={{ flex: 1 }}>
                           <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.text }}>
                             {r.result_status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? \Chest #\\ : '?'}
                           </Text>
                           <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.muted }}>
                             {r.organisation_name}
                           </Text>
                         </View>
                         <View style={{ alignItems: 'flex-end' }}>
                           <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.teal }}>{r.points_awarded} pts</Text>
                           {r.grade && <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 11, color: colors.muted }}>Grade {r.grade}</Text>}
                         </View>
                      </View>'''

new_preview_row = '''                      <View key={r.result_id} style={[styles.previewResultRow, { flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }]}>
                         <View style={{ width: 28, alignItems: 'center', marginTop: 2 }}>
                           <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.navy }}>
                             {r.rank ? \#\\ : '-'}
                           </Text>
                         </View>
                         <View style={{ flex: 1, minWidth: 150 }}>
                           <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.text }}>
                             {r.result_status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? \Chest #\\ : '?'}
                           </Text>
                           <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.muted }}>
                             {r.organisation_name}
                           </Text>
                         </View>
                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                           {r.grade && <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: colors.navy }}>Grade {r.grade}</Text>}
                           <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.teal }}>• {r.points_awarded} pts</Text>
                         </View>
                      </View>'''

content = content.replace(old_preview_row, new_preview_row)

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("UI updated successfully")
