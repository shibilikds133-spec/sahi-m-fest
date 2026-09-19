const fs = require("fs");
let code = fs.readFileSync("src/app/(admin)/smart-announcer/index.tsx", "utf-8");

const jsxStartStr = "{results.map((res, index) => {";
const jsxEndStr = "            })}";
const jsxStart = code.indexOf(jsxStartStr);
const jsxEnd = code.indexOf(jsxEndStr, jsxStart) + jsxEndStr.length;

if (jsxStart !== -1 && jsxEnd !== -1) {
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
  code = code.substring(0, jsxStart) + replacementJsx + code.substring(jsxEnd);
  console.log("JSX replaced");
  fs.writeFileSync("src/app/(admin)/smart-announcer/index.tsx", code, "utf-8");
} else {
  console.log("JSX NOT FOUND", jsxStart, code.indexOf(jsxEndStr));
}
