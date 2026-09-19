const fs = require("fs");
const filePath = "src/app/(admin)/settings/leaderboard/controls.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/\r\n/g, "\n");

// 1. Add imports if missing
const importTarget = `import { Switch } from 'react-native';`;
if (content.includes(importTarget)) {
  content = content.replace(importTarget, `import { Switch, TouchableOpacity, ActivityIndicator } from 'react-native';\nimport * as DocumentPicker from 'expo-document-picker';\nimport { storageService } from '@/services/storage/storageService';\nimport { useActiveFestival } from '@/core/hooks/useFestival';`);
} else {
  content = content.replace(/import React/, `import * as DocumentPicker from 'expo-document-picker';\nimport { storageService } from '@/services/storage/storageService';\nimport { useActiveFestival } from '@/core/hooks/useFestival';\nimport React`);
}

// 2. Add state inside the component
const componentStartTarget = `const queryClient = useQueryClient();`;
const stateInjection = `  const { data: festival } = useActiveFestival();\n  const [isUploadingPoster, setIsUploadingPoster] = React.useState(false);\n  \n  const handleUploadPoster = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploadingPoster(true);
        const currentConfig = settingsQuery.data?.theme_config || {};
        const currentPosters = currentConfig.team_point_posters || [];
        const newPosters = [...currentPosters];
        
        for (const asset of result.assets) {
          const res = await fetch(asset.uri);
          const blob = await res.blob();
          const ext = asset.name.split('.').pop() || 'jpg';
          const objectKey = \`public/point_posters/\${festival?.id || 'default'}/\${Date.now()}_\${Math.random().toString(36).substring(7)}.\${ext}\`;
          
          const uploadRes = await storageService.upload(blob, objectKey, blob.type || 'image/jpeg', 'public');
          if (uploadRes.fileUrl) {
            newPosters.push(uploadRes.fileUrl);
          } else {
            // fallback for r2
            newPosters.push(\`r2://\${objectKey}\`);
          }
        }
        
        await persistSetting({ theme_config: { ...currentConfig, team_point_posters: newPosters } });
        alert('Posters uploaded successfully!');
      }
    } catch (e: any) {
      alert('Upload failed: ' + e.message);
    } finally {
      setIsUploadingPoster(false);
    }
  };
  
  const handleRemovePoster = async (index: number) => {
    const currentConfig = settingsQuery.data?.theme_config || {};
    const currentPosters = currentConfig.team_point_posters || [];
    const newPosters = currentPosters.filter((_: any, i: number) => i !== index);
    await persistSetting({ theme_config: { ...currentConfig, team_point_posters: newPosters } });
  };
`;
content = content.replace(componentStartTarget, componentStartTarget + "\n" + stateInjection);

// 3. Add UI row inside controlList
const uiInjectionTarget = `<View style={styles.controlRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>Freeze Leaderboard</Text>`;

const uiInjection = `
              {/* Team Point Posters */}
              <View style={[styles.controlRow, { flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 24 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.controlLabel}>Team Point Posters</Text>
                    <Text style={styles.controlHint}>Upload images to show in the Public Team Rankings page carousel.</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={handleUploadPoster}
                    disabled={isUploadingPoster}
                    style={{ backgroundColor: '#1C5FA8', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, opacity: isUploadingPoster ? 0.7 : 1 }}
                  >
                    {isUploadingPoster ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Upload Images</Text>}
                  </TouchableOpacity>
                </View>
                
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' }}>
                  {(settingsQuery.data?.theme_config?.team_point_posters || []).map((url: string, idx: number) => (
                    <View key={idx} style={{ width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0', overflow: 'hidden', position: 'relative' }}>
                      <Text style={{ position: 'absolute', top: 30, left: 10, fontSize: 10, color: '#666' }}>Image {idx+1}</Text>
                      {/* For web, if it's r2:// we might need a presigned url, but for now we just show a placeholder if we can't render it directly. */}
                      {!url.startsWith('r2://') && <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <TouchableOpacity 
                        onPress={() => handleRemovePoster(idx)}
                        style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'red', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {(settingsQuery.data?.theme_config?.team_point_posters || []).length === 0 && (
                    <Text style={{ color: '#888', fontSize: 14, fontStyle: 'italic', paddingVertical: 12 }}>No posters uploaded yet.</Text>
                  )}
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: '#eee', width: '100%', marginVertical: 12 }} />\n
              <View style={styles.controlRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>Freeze Leaderboard</Text>`;

content = content.replace(uiInjectionTarget, uiInjection);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated controls.tsx");
