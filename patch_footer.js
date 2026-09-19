const fs = require('fs');
let file = fs.readFileSync('src/app/(admin)/schedule/[id]/results.tsx', 'utf8');

file = file.replace(/<\/TouchableOpacity>[\s\S]*?}\)[\s\S]*?}\s*<\/View>\s*\);\s*}/g, 
`</TouchableOpacity>
          )}

          <View className="flex-1">
            <SsfButton
              label={saving ? "Saving..." : (published && !forceRepublishConfirmed ? "? Results Published" : "?? Publish Results")}
              onPress={handlePublish}
              disabled={saving || (!hasAtLeastOneResult) || (published && !forceRepublishConfirmed)}
              className={published && !forceRepublishConfirmed ? "opacity-80" : ""}
            />
          </View>
        </View>
      )}
    </View>
  );
}`);

// fix broken emoji
file = file.replace(/dY"" Unlock Marks/g, '?? Unlock Marks');
file = file.replace(/dYs\? Publish Results/g, '?? Publish Results');
file = file.replace(/o. Results Published/g, '? Results Published');
file = file.replace(/o. Published/g, '? Published');

fs.writeFileSync('src/app/(admin)/schedule/[id]/results.tsx', file);
