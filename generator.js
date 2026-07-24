const fs = require('fs');
const path = require('path');
const base = 'c:/Users/hp/Downloads/web-for-sahi--main (1)/web-for-sahi--main/src/app/(admin)/participants';
const content = fs.readFileSync(path.join(base, 'import-up.tsx'), 'utf8');

const targets = [
  { name: 'lp', Name: 'Lp', TITLE: 'Lower Primary', FN: 'executeLpImportChunk', FILE: 'lpbulk.json' },
  { name: 'hs', Name: 'Hs', TITLE: 'High School', FN: 'executeHsImportChunk', FILE: 'hsbulk.json' },
  { name: 'hss', Name: 'Hss', TITLE: 'Higher Secondary', FN: 'executeHssImportChunk', FILE: 'hssbulk.json' }
];

const dryRunUI = `
          {/* DRY RUN PREVIEW */}
          {dataset && !isProcessing && report.importedParticipants === 0 && (
            <View style={{ backgroundColor: '#f0fdf4', padding: 16, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#166534', marginBottom: 8 }}>Dry Run Preview (Pre-import Audit)</Text>
              <Text style={{ color: '#15803d', marginBottom: 4 }}>• Participants to Create: {dataset.participants.length - dbConflicts.size}</Text>
              <Text style={{ color: '#15803d', marginBottom: 4 }}>• Registrations to Process: {dataset.participants.reduce((acc, p) => acc + (p.events ? p.events.length : 0), 0)}</Text>
              <Text style={{ color: '#15803d', marginBottom: 4 }}>• Duplicates Found: {dbConflicts.size}</Text>
              <Text style={{ color: '#15803d', marginBottom: 4 }}>• Missing Items: {unmappedEvents.length}</Text>
            </View>
          )}

          {/* FATAL ERRORS (Chest Conflicts) */}`;

targets.forEach(t => {
  let newContent = content
    .replace(/Upper Primary/g, t.TITLE)
    .replace(/UP Import/g, t.TITLE + ' Import')
    .replace(/UP Dataset/g, t.TITLE + ' Dataset')
    .replace(/upbulck\.json/g, t.FILE)
    .replace(/executeUpperPrimaryImportChunk/g, t.FN)
    .replace(/\{\/\* FATAL ERRORS \(Chest Conflicts\) \*\/\}/g, dryRunUI);
    
  fs.writeFileSync(path.join(base, 'import-' + t.name + '.tsx'), newContent);
  console.log('Created import-' + t.name + '.tsx');
});
