const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/schedule/[id]/checkin.tsx', 'utf8');

const jsxToInject = `
      {/* 🔴 RED WARNING MODAL */}
      {warningModal.visible && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: 'rgba(220, 38, 38, 0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999,
          }}
        >
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#FEF2F2', borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <XCircle size={48} color="#DC2626" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#991B1B', textAlign: 'center', marginBottom: 12 }}>
              {warningModal.title}
            </Text>
            <Text style={{ fontSize: 16, color: '#7F1D1D', textAlign: 'center', marginBottom: 24, lineHeight: 24 }}>
              {warningModal.message}
            </Text>
            
            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ backgroundColor: '#EF4444', padding: 16, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Cancel (Safe)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={warningCountdown > 5}
                onPress={() => {
                  if (warningModal.action) warningModal.action();
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ 
                  backgroundColor: warningCountdown > 5 ? '#FECACA' : '#991B1B', 
                  padding: 16, borderRadius: 12, alignItems: 'center',
                  borderWidth: 2, borderColor: '#7F1D1D'
                }}
              >
                <Text style={{ color: warningCountdown > 5 ? '#F87171' : 'white', fontWeight: 'bold', fontSize: 16 }}>
                  {warningCountdown > 5 ? \`Wait \${warningCountdown - 5}s...\` : 'Skip & Proceed'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
`;

const lastViewIndex = c.lastIndexOf('</View>');
if (lastViewIndex !== -1) {
    c = c.substring(0, lastViewIndex) + jsxToInject + c.substring(lastViewIndex);
    fs.writeFileSync('src/app/(admin)/schedule/[id]/checkin.tsx', c);
    console.log('Successfully injected warning modal UI.');
} else {
    console.error('Could not find injection point.');
}
