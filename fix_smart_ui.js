const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "leader_name: string;\n}",
  "leader_name: string;\n  is_public: boolean;\n}"
);

// We need to add "Hide" button capability
// First, find the handlePublish function
const publishRegex = /const handlePublish = async.*?};/s;
const handlePublishMatch = content.match(publishRegex);

if (handlePublishMatch) {
  const newHandlers = `
  const handlePublish = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Publish Result",
      \`Are you sure you want to publish the result for \${itemName}? This will immediately update the public leaderboard.\`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          style: "default",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: true, published_at: new Date().toISOString() })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result published successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to publish result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };

  const handleHide = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Hide Result",
      \`Are you sure you want to hide the result for \${itemName} from the public leaderboard?\`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: false })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result hidden successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to hide result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };
  `;
  content = content.replace(handlePublishMatch[0], newHandlers);
}

// Update UI to show Publish/Hide
content = content.replace(
  `<TouchableOpacity \n                  style={[styles.publishBtn, publishing === item.result_id && styles.disabledBtn]}\n                  onPress={() => handlePublish(item.result_id, item.item_name)}\n                  disabled={publishing === item.result_id}\n                >\n                  {publishing === item.result_id ? (\n                    <ActivityIndicator color="white" size="small" />\n                  ) : (\n                    <>\n                      <Radio size={16} color="white" />\n                      <Text style={styles.publishBtnText}>Publish Now</Text>\n                    </>\n                  )}\n                </TouchableOpacity>`,
  `{item.is_public ? (
                  <TouchableOpacity 
                    style={[styles.publishBtn, { backgroundColor: '#ef4444' }, publishing === item.result_id && styles.disabledBtn]}
                    onPress={() => handleHide(item.result_id, item.item_name)}
                    disabled={publishing === item.result_id}
                  >
                    {publishing === item.result_id ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Radio size={16} color="white" />
                        <Text style={styles.publishBtnText}>Hide Result</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.publishBtn, publishing === item.result_id && styles.disabledBtn]}
                    onPress={() => handlePublish(item.result_id, item.item_name)}
                    disabled={publishing === item.result_id}
                  >
                    {publishing === item.result_id ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Radio size={16} color="white" />
                        <Text style={styles.publishBtnText}>Publish Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Smart Announcer handlers and UI");
