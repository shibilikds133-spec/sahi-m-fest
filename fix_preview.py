import re

with open('src/app/(admin)/settings/leaderboard/controls.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
if 'usePublicLeaderboard' not in content:
    content = content.replace("import { useAdminLeaderboard }", "import { useAdminLeaderboard }\nimport { usePublicLeaderboard } from '../../../../core/hooks/useLeaderboard';")

# 2. Add hook call
hook_pos = content.find("const { data: settings, isLoading }")
if hook_pos != -1 and 'publicPreview' not in content:
    new_hook = "const { data: publicPreview, isFetching: isPreviewFetching } = usePublicLeaderboard(tenant_id, festivalId);\n  "
    content = content[:hook_pos] + new_hook + content[hook_pos:]

# 3. Add Preview Panel UI
preview_ui = '''        </View>

        <View style={[styles.controlPanel, { flex: 1, minWidth: 300 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.controlTitle}>Live Points Preview</Text>
            {isPreviewFetching && <RefreshCw size={16} color={colors.teal} />}
          </View>
          <Text style={styles.controlSub}>
            Current {rankingMode === 'LIMITED' ? (Limited to \ items) : '(All Items)'} standings.
          </Text>

          <View style={styles.previewContainer}>
            {publicPreview?.map((row: any, i: number) => (
              <View key={row.organisation_id} style={styles.previewRow}>
                <View style={styles.previewRank}>
                  <Text style={styles.previewRankText}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewOrgName}>{row.organisation_name}</Text>
                </View>
                <Text style={styles.previewPoints}>{row.total_points} pts</Text>
              </View>
            ))}
            {(!publicPreview || publicPreview.length === 0) && (
              <Text style={{ textAlign: 'center', marginTop: 20, color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                No public items match this logic.
              </Text>
            )}
          </View>
        </View>
      </View>'''

content = content.replace('      </View>\n\n      <View style={styles.infoStrip}>', preview_ui + '\n\n      <View style={styles.infoStrip}>')
# Wait, the closing tags might not exactly match '      </View>\n\n      <View style={styles.infoStrip}>'
# Let's do a more robust replace.

old_close = '''          </View>
        </View>
  
        <View style={styles.infoStrip}>'''

new_close = '''          </View>
        </View>

        <View style={[styles.controlPanel, { flex: 1, minWidth: 300 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.controlTitle}>Live Points Preview</Text>
            {isPreviewFetching && <RefreshCw size={16} color={colors.teal} />}
          </View>
          <Text style={styles.controlSub}>
            Current {rankingMode === 'LIMITED' ? (Limited to  items) : '(All Items)'} standings.
          </Text>

          <View style={styles.previewContainer}>
            {publicPreview?.map((row: any, i: number) => (
              <View key={row.organisation_id} style={styles.previewRow}>
                <View style={styles.previewRank}>
                  <Text style={styles.previewRankText}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewOrgName} numberOfLines={1}>{row.organisation_name}</Text>
                </View>
                <Text style={styles.previewPoints}>{row.total_points} pts</Text>
              </View>
            ))}
            {(!publicPreview || publicPreview.length === 0) && (
              <Text style={{ textAlign: 'center', marginTop: 20, color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                No published items available.
              </Text>
            )}
          </View>
        </View>
      </View>
  
      <View style={styles.infoStrip}>'''

content = content.replace(old_close, new_close)

# 4. Add Styles
styles_insert = '''
  previewContainer: {
    marginTop: 10,
    backgroundColor: ui.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  previewRank: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  previewRankText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: colors.muted,
  },
  previewOrgName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: colors.text,
  },
  previewPoints: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: colors.teal,
  },'''

if 'previewContainer' not in content:
    content = content.replace("  controlPanel: {", styles_insert + "\n  controlPanel: {")

with open('src/app/(admin)/settings/leaderboard/controls.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("UI updated successfully")
