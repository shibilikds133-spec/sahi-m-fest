const fs = require('fs');

const mappings = {
  lp: `const EVENT_MAPPING: Record<string, string> = {
  'MADH SONG': 'LP-001',
  'ELOCUTION': 'LP-002',
  'QUIZ': 'LP-003',
  'STORYTELLING': 'LP-004',
  'PENCIL DRAWING': 'LP-005',
  'WATERCOLOUR PAINTING': 'LP-006',
  'LANGUAGE GAME': 'LP-007',
  'MALAYALAM READING': 'LP-008',
  'READING ARABIC-MALAYALAM': 'LP-009',
  'BOOK TEST': 'LP-010',
  'PENCIL DRAWING (GIRLS ONLY)': 'LP-011',
  'WATERCOLOR PAINTING (GIRLS ONLY)': 'LP-012',
  'MALAYALAM HANDWRITING (GIRLS ONLY)': 'LP-013',
  'JOURNAL ART (GIRLS ONLY)': 'LP-014'
};`,
  hs: `const EVENT_MAPPING: Record<string, string> = {
  'MALAYALAM ELOCUTION': 'HS-001',
  'ENGLISH ELOCUTION': 'HS-002',
  'MAPPILA SONG': 'HS-003',
  'MADH SONG': 'HS-004',
  'ARABIC POEM RECITATION': 'HS-005',
  'MALAYALAM POETRY RECITATION': 'HS-006',
  'URDU POETRY RECITATION': 'HS-007',
  'QUIZ': 'HS-008',
  'STORY WRITING': 'HS-009',
  'POETRY WRITING': 'HS-010',
  'PENCIL DRAWING': 'HS-011',
  'WATERCOLOR PAINTING': 'HS-012',
  'BOOK TEST': 'HS-013',
  'MALAYALAM ESSAY WRITING': 'HS-014',
  'NEWS READING': 'HS-015',
  'CAPTION WRITING': 'HS-016',
  'LANGUAGE GAME ENGLISH': 'HS-017',
  'EMBROIDERY (GIRLS ONLY)': 'HS-018',
  'BOOK TEST (GIRLS)': 'HS-019',
  'PENCIL DRAWING (GIRLS ONLY)': 'HS-020',
  'WATERCOLOR PAINTING (GIRLS ONLY)': 'HS-021',
  'STORY WRITING (GIRLS ONLY)': 'HS-022',
  'POETRY WRITING (GIRLS ONLY)': 'HS-023'
};`,
  hss: `const EVENT_MAPPING: Record<string, string> = {
  'URDU POETRY RECITATION': 'HSS-001',
  'MAPPILA PATTU': 'HSS-002',
  'DEVOTIONAL SONG': 'HSS-003',
  'ELOCUTION': 'HSS-004',
  'DIGITAL PAINTING': 'HSS-005',
  'STORY WRITING': 'HSS-006',
  'POETRY WRITING': 'HSS-007',
  'MALAYALAM ESSAY': 'HSS-008',
  'ENGLISH ESSAY': 'HSS-009',
  'QUIZ': 'HSS-010',
  'PENCIL DRAWING': 'HSS-011',
  'WATERCOLOR PAINTING': 'HSS-012',
  'BOOK TEST': 'HSS-013',
  'NEWS WRITING': 'HSS-014',
  'ARABIC CALLIGRAPHY': 'HSS-015',
  'REEL MAKING': 'HSS-016',
  'ARABIC CALLIGRAPHY (GIRLS ONLY)': 'HSS-017',
  'BOOK TEST (GIRLS)': 'HSS-018',
  'STORY WRITING (GIRLS ONLY)': 'HSS-019',
  'POETRY WRITING (GIRLS ONLY)': 'HSS-020'
};`
};

['lp', 'hs', 'hss'].forEach(type => {
  const pathStr = 'c:/Users/hp/Downloads/web-for-sahi--main (1)/web-for-sahi--main/src/app/(admin)/participants/import-' + type + '.tsx';
  let content = fs.readFileSync(pathStr, 'utf8');
  content = content.replace(/const UP_EVENT_MAPPING[\s\S]*?\};\r?\n/g, mappings[type] + '\n');
  content = content.replace(/UP_EVENT_MAPPING/g, 'EVENT_MAPPING');
  content = content.replace(/participants: chunk/g, 'participants: chunk.map(p => ({ ...p, events: p.events.map(e => ({ ...e, item_code: EVENT_MAPPING[e.event_name?.trim().toUpperCase() || e.event_name] || e.event_name })) }))');
  fs.writeFileSync(pathStr, content);
  console.log('Fixed', type);
});
