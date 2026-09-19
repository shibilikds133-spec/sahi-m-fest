const fs = require('fs'); let c = fs.readFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', 'utf8');
c = c.replace(
  '<Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>',
  \<Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>
                      {itemDetailsMap.get(group.item_id)?.item_code && (
                        <View style={[styles.itemTypeBadge, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 }]}>
                          <Text style={[styles.itemTypeBadgeText, { color: '#4b5563' }]}>{itemDetailsMap.get(group.item_id).item_code}</Text>
                        </View>
                      )}\
);
fs.writeFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', c);

