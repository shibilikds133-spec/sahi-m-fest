const fs = require("fs");
let code = fs.readFileSync("src/app/(admin)/smart-announcer/index.tsx", "utf-8");

// 1. Replace JSX
const jsxRegex = /\{results\.map\(\(res, index\) => \{[\s\S]*?\}\)\}/;
const replacementJsx = `{results.map((res, index) => {
                const isTop = index === 0;
                return (
                  <View key={res.result_id} style={[styles.row, isTop && styles.topRow]}>
                    <View style={styles.rowLeft}>
                      {isTop && (
                        <View style={styles.badgeSmall}>
                          <Text style={styles.badgeTextSmall}>? Recommended Next</Text>
                        </View>
                      )}
                      <Text style={styles.itemName}>{res.item_name}</Text>
                      <Text style={styles.orderTextSmall}>Order: {res.recommended_order} • Suspense Score: {res.suspense_score}</Text>
                    </View>
                    
                    <View style={styles.rowMiddle}>
                      <Text style={styles.impactTitleSmall}>Projected Leaderboard</Text>
                      <View style={styles.statsCompact}>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#fbbf24" /> 1st: {res.new_1st_points}</Text>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#64748b" /> 2nd: {res.new_2nd_points}</Text>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#b45309" /> 3rd: {res.new_3rd_points}</Text>
                      </View>
                      <Text style={styles.leaderTextSmall}>
                        Leader: <Text style={styles.leaderHighlight}>{res.leader_name}</Text>
                      </Text>
                    </View>

                    <View style={styles.rowRight}>
                      <TouchableOpacity 
                        style={[styles.publishBtnSmall, publishing === res.result_id && styles.disabledBtn]}
                        onPress={() => handlePublish(res.result_id, res.item_name)}
                        disabled={publishing === res.result_id}
                      >
                        {publishing === res.result_id ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <CheckCircle size={16} color="white" />
                            <Text style={styles.publishTextSmall}>Announce</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}`;

code = code.replace(jsxRegex, replacementJsx);
console.log("JSX Replaced:", jsxRegex.test(code) ? "YES" : "NO");

// 2. Replace Styles
const stylesRegex = /card: \{[\s\S]*?publishText: \{[\s\S]*?\},/;
const replacementStyles = `row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    shadowColor: ui.shadow.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 16,
    flexWrap: 'wrap',
  },
  topRow: {
    borderColor: ui.colors.primary,
    borderWidth: 2,
  },
  rowLeft: {
    flex: 1,
    minWidth: 200,
  },
  badgeSmall: {
    backgroundColor: ui.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  badgeTextSmall: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.colors.text,
    marginBottom: 4,
  },
  orderTextSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.colors.textMuted,
  },
  rowMiddle: {
    flex: 2,
    minWidth: 250,
    backgroundColor: ui.colors.surfaceMuted,
    padding: 12,
    borderRadius: 8,
  },
  impactTitleSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.colors.textMuted,
    marginBottom: 8,
  },
  statsCompact: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  statCompactText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.colors.text,
  },
  leaderTextSmall: {
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  leaderHighlight: {
    fontWeight: '700',
    color: ui.colors.text,
  },
  rowRight: {
    justifyContent: 'center',
  },
  publishBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  publishTextSmall: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },`;

code = code.replace(stylesRegex, replacementStyles);
console.log("STYLES Replaced:", stylesRegex.test(code) ? "YES" : "NO");

fs.writeFileSync("src/app/(admin)/smart-announcer/index.tsx", code, "utf-8");
console.log("Done");
