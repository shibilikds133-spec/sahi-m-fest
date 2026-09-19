
with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

target = '''<Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>
                      {itemDetailsMap.get(group.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: '#4b5563' }]}>{itemDetailsMap.get(group.item_id).item_code}</Text>
                        </View>
                      )}'''
                      
replacement = '''<Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>
                      {itemDetailsMap.get(group.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: '#4b5563' }]}>{itemDetailsMap.get(group.item_id).item_code}</Text>
                        </View>
                      )}
                      {(itemDetailsMap.get(group.item_id)?.category_codes || []).map((code) => {
                        const cat = festivalCategories.find(c => c.code.toLowerCase() === code.toLowerCase());
                        const catName = cat ? cat.name_en : (code.charAt(0).toUpperCase() + code.slice(1));
                        return (
                          <View key={code} style={styles.itemTypeBadge}>
                            <Text style={styles.itemTypeBadgeText}>{catName}</Text>
                          </View>
                        );
                      })}'''

c = c.replace(target, replacement)

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

