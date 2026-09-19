const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Add imports for QR Code and Modal
content = content.replace(
  "import { RefreshCcw, Radio, Trophy, CheckCircle } from 'lucide-react-native';",
  "import { RefreshCcw, Radio, Trophy, CheckCircle, QrCode, Copy, Share, ExternalLink } from 'lucide-react-native';\nimport { Modal, Platform } from 'react-native';\nimport QRCode from 'react-native-qrcode-svg';\nimport { SsfButton } from '@/components/ui/SsfButton';"
);

// Add state for Modal and Token
const stateMatch = content.match(/const \[publishing, setPublishing\] = useState<string \| null>\(null\);/);
if (stateMatch) {
  content = content.replace(
    stateMatch[0],
    stateMatch[0] + "\n  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);\n  const [announcerToken, setAnnouncerToken] = useState<string | null>(null);\n  const [generatingToken, setGeneratingToken] = useState(false);\n"
  );
}

// Add function to generate token
const fetchQueueMatch = content.match(/const fetchQueue = async \(\) => {/);
if (fetchQueueMatch) {
  const generateFunc = `
  const handleGenerateToken = async () => {
    if (!currentFestival?.id || !user?.tenant_id) return;
    setGeneratingToken(true);
    try {
      // Check if active token exists
      const { data: existing } = await supabase
        .from('announcer_tokens')
        .select('token')
        .eq('festival_id', currentFestival.id)
        .eq('is_active', true)
        .single();
        
      if (existing?.token) {
        setAnnouncerToken(existing.token);
      } else {
        // Generate new token (6 chars)
        const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { error } = await supabase
          .from('announcer_tokens')
          .insert({
            tenant_id: user.tenant_id,
            festival_id: currentFestival.id,
            token: newToken,
            created_by: user.id
          });
        if (error) throw error;
        setAnnouncerToken(newToken);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not generate announcer token.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const openTokenModal = () => {
    setIsTokenModalOpen(true);
    handleGenerateToken();
  };
`;
  content = content.replace(fetchQueueMatch[0], generateFunc + "\n  " + fetchQueueMatch[0]);
}

// Add "Generate Access" button to the header
const headerMatch = content.match(/<Pressable \n\s*style={\[styles\.refreshBtn, loading && styles\.disabledBtn\]}/);
if (headerMatch) {
  const newHeader = `<TouchableOpacity 
            style={[styles.refreshBtn, { backgroundColor: '#0f766e', marginRight: 10 }]} 
            onPress={openTokenModal}
          >
            <QrCode size={20} color="white" />
            <Text style={styles.refreshText}>QR Code</Text>
          </TouchableOpacity>
          ` + headerMatch[0].replace(/<Pressable/, "<TouchableOpacity").replace(/<\/Pressable>/, "</TouchableOpacity>");
  
  content = content.replace(headerMatch[0], newHeader);
  // Also need to close the tag properly later, but wait, it's easier to just do string replacement
}

content = content.replace(/<Pressable /g, "<TouchableOpacity ").replace(/<\/Pressable>/g, "</TouchableOpacity>");

// Add Modal to the bottom
const returnEndMatch = content.match(/<\/ScrollView>\s*<\/>\s*\);\s*}/);
if (returnEndMatch) {
  const modalUI = `
      {/* QR Code Modal */}
      <Modal visible={isTokenModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: 'white', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 20, fontFamily: 'Poppins_900Black', color: '#1e293b', marginBottom: 16 }}>Announcer Access</Text>
            
            {generatingToken ? (
              <ActivityIndicator size="large" color="#0f766e" style={{ marginVertical: 32 }} />
            ) : announcerToken ? (
              <View style={{ alignItems: 'center' }}>
                <View style={{ padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 }}>
                  <QRCode
                    value={typeof window !== 'undefined' ? \`\${window.location.origin}/announcer/\${announcerToken}\` : \`https://sahi-app.com/announcer/\${announcerToken}\`}
                    size={160}
                    color="#0f766e"
                    backgroundColor="white"
                  />
                </View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Access Code</Text>
                <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 28, color: '#0f766e', letterSpacing: 4, marginBottom: 24 }}>{announcerToken}</Text>
                
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
                  Scan this QR code or use the link to access the Announcer Portal. No login required.
                </Text>
              </View>
            ) : null}
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <SsfButton label="Close" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
  `;
  content = content.replace(returnEndMatch[0], modalUI + "\n" + returnEndMatch[0]);
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Added QR Code generation to Smart Announcer Admin UI");
