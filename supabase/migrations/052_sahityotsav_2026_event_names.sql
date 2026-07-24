-- Migration 051: Sahityotsav 2026 — Update item names from Malayalam to English
-- Matches by item_code (per-category sequential codes: LP-001, UP-001, HS-001, etc.)
-- Only updates item_name_ml and item_name_en fields.
-- Deactivates any old items whose codes are not in the 170-item Sahityotsav 2026 list.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Update English & Malayalam display names by item_code
-- ─────────────────────────────────────────────────────────────

-- Lower Primary (LP) — 14 items
UPDATE items SET item_name_en = 'Madh Song',                      item_name_ml = item_name_en WHERE item_code = 'LP-001';
UPDATE items SET item_name_en = 'Speech',                         item_name_ml = item_name_en WHERE item_code = 'LP-002';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'LP-003';
UPDATE items SET item_name_en = 'Story Narration',                item_name_ml = item_name_en WHERE item_code = 'LP-004';
UPDATE items SET item_name_en = 'Drawing – Pencil',               item_name_ml = item_name_en WHERE item_code = 'LP-005';
UPDATE items SET item_name_en = 'Drawing – Watercolour',          item_name_ml = item_name_en WHERE item_code = 'LP-006';
UPDATE items SET item_name_en = 'Language Game',                  item_name_ml = item_name_en WHERE item_code = 'LP-007';
UPDATE items SET item_name_en = 'Reading – Malayalam',            item_name_ml = item_name_en WHERE item_code = 'LP-008';
UPDATE items SET item_name_en = 'Reading – Arabi-Malayalam',      item_name_ml = item_name_en WHERE item_code = 'LP-009';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'LP-010';
UPDATE items SET item_name_en = 'Drawing – Pencil (Girls)',       item_name_ml = item_name_en WHERE item_code = 'LP-011';
UPDATE items SET item_name_en = 'Drawing – Watercolour (Girls)',  item_name_ml = item_name_en WHERE item_code = 'LP-012';
UPDATE items SET item_name_en = 'Handwriting – Malayalam (Girls)',item_name_ml = item_name_en WHERE item_code = 'LP-013';
UPDATE items SET item_name_en = 'Journal Art (Girls)',            item_name_ml = item_name_en WHERE item_code = 'LP-014';

-- Upper Primary (UP) — 16 items
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'UP-001';
UPDATE items SET item_name_en = 'Story Narration',                item_name_ml = item_name_en WHERE item_code = 'UP-002';
UPDATE items SET item_name_en = 'Speech',                         item_name_ml = item_name_en WHERE item_code = 'UP-003';
UPDATE items SET item_name_en = 'Mathematics Game',               item_name_ml = item_name_en WHERE item_code = 'UP-004';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'UP-005';
UPDATE items SET item_name_en = 'Drawing – Pencil',               item_name_ml = item_name_en WHERE item_code = 'UP-006';
UPDATE items SET item_name_en = 'Drawing – Watercolour',          item_name_ml = item_name_en WHERE item_code = 'UP-007';
UPDATE items SET item_name_en = 'Story Writing',                  item_name_ml = item_name_en WHERE item_code = 'UP-008';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'UP-009';
UPDATE items SET item_name_en = 'Spelling Bee',                   item_name_ml = item_name_en WHERE item_code = 'UP-010';
UPDATE items SET item_name_en = 'Sudoku',                         item_name_ml = item_name_en WHERE item_code = 'UP-011';
UPDATE items SET item_name_en = 'Drawing – Pencil (Girls)',       item_name_ml = item_name_en WHERE item_code = 'UP-012';
UPDATE items SET item_name_en = 'Drawing – Watercolour (Girls)',  item_name_ml = item_name_en WHERE item_code = 'UP-013';
UPDATE items SET item_name_en = 'Book Test (Girls)',              item_name_ml = item_name_en WHERE item_code = 'UP-014';
UPDATE items SET item_name_en = 'Story Writing (Girls)',          item_name_ml = item_name_en WHERE item_code = 'UP-015';
UPDATE items SET item_name_en = 'Origami (Girls)',                item_name_ml = item_name_en WHERE item_code = 'UP-016';

-- High School (HS) — 23 items
UPDATE items SET item_name_en = 'Speech – Malayalam',             item_name_ml = item_name_en WHERE item_code = 'HS-001';
UPDATE items SET item_name_en = 'Speech – English',               item_name_ml = item_name_en WHERE item_code = 'HS-002';
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'HS-003';
UPDATE items SET item_name_en = 'Madh Song',                      item_name_ml = item_name_en WHERE item_code = 'HS-004';
UPDATE items SET item_name_en = 'Arabic Poem Recitation',         item_name_ml = item_name_en WHERE item_code = 'HS-005';
UPDATE items SET item_name_en = 'Poem Recitation – Malayalam',    item_name_ml = item_name_en WHERE item_code = 'HS-006';
UPDATE items SET item_name_en = 'Poem Recitation – Urdu',         item_name_ml = item_name_en WHERE item_code = 'HS-007';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'HS-008';
UPDATE items SET item_name_en = 'Story Writing',                  item_name_ml = item_name_en WHERE item_code = 'HS-009';
UPDATE items SET item_name_en = 'Poetry Writing',                 item_name_ml = item_name_en WHERE item_code = 'HS-010';
UPDATE items SET item_name_en = 'Drawing – Pencil',               item_name_ml = item_name_en WHERE item_code = 'HS-011';
UPDATE items SET item_name_en = 'Drawing – Watercolour',          item_name_ml = item_name_en WHERE item_code = 'HS-012';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'HS-013';
UPDATE items SET item_name_en = 'Essay – Malayalam',              item_name_ml = item_name_en WHERE item_code = 'HS-014';
UPDATE items SET item_name_en = 'News Reading',                   item_name_ml = item_name_en WHERE item_code = 'HS-015';
UPDATE items SET item_name_en = 'Caption Writing',                item_name_ml = item_name_en WHERE item_code = 'HS-016';
UPDATE items SET item_name_en = 'Language Game – English',        item_name_ml = item_name_en WHERE item_code = 'HS-017';
UPDATE items SET item_name_en = 'Embroidery (Girls)',             item_name_ml = item_name_en WHERE item_code = 'HS-018';
UPDATE items SET item_name_en = 'Book Test (Girls)',              item_name_ml = item_name_en WHERE item_code = 'HS-019';
UPDATE items SET item_name_en = 'Drawing – Pencil (Girls)',       item_name_ml = item_name_en WHERE item_code = 'HS-020';
UPDATE items SET item_name_en = 'Drawing – Watercolour (Girls)',  item_name_ml = item_name_en WHERE item_code = 'HS-021';
UPDATE items SET item_name_en = 'Story Writing (Girls)',          item_name_ml = item_name_en WHERE item_code = 'HS-022';
UPDATE items SET item_name_en = 'Poetry Writing (Girls)',         item_name_ml = item_name_en WHERE item_code = 'HS-023';

-- Higher Secondary (HSS) — 20 items
UPDATE items SET item_name_en = 'Urdu Poem Recitation',           item_name_ml = item_name_en WHERE item_code = 'HSS-001';
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'HSS-002';
UPDATE items SET item_name_en = 'Devotional Song',                item_name_ml = item_name_en WHERE item_code = 'HSS-003';
UPDATE items SET item_name_en = 'Speech',                         item_name_ml = item_name_en WHERE item_code = 'HSS-004';
UPDATE items SET item_name_en = 'Digital Painting',               item_name_ml = item_name_en WHERE item_code = 'HSS-005';
UPDATE items SET item_name_en = 'Story Writing',                  item_name_ml = item_name_en WHERE item_code = 'HSS-006';
UPDATE items SET item_name_en = 'Poetry Writing',                 item_name_ml = item_name_en WHERE item_code = 'HSS-007';
UPDATE items SET item_name_en = 'Essay – Malayalam',              item_name_ml = item_name_en WHERE item_code = 'HSS-008';
UPDATE items SET item_name_en = 'Essay – English',                item_name_ml = item_name_en WHERE item_code = 'HSS-009';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'HSS-010';
UPDATE items SET item_name_en = 'Drawing – Pencil',               item_name_ml = item_name_en WHERE item_code = 'HSS-011';
UPDATE items SET item_name_en = 'Drawing – Watercolour',          item_name_ml = item_name_en WHERE item_code = 'HSS-012';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'HSS-013';
UPDATE items SET item_name_en = 'News Writing',                   item_name_ml = item_name_en WHERE item_code = 'HSS-014';
UPDATE items SET item_name_en = 'Arabic Calligraphy',             item_name_ml = item_name_en WHERE item_code = 'HSS-015';
UPDATE items SET item_name_en = 'Reel Making',                    item_name_ml = item_name_en WHERE item_code = 'HSS-016';
UPDATE items SET item_name_en = 'Arabic Calligraphy (Girls)',     item_name_ml = item_name_en WHERE item_code = 'HSS-017';
UPDATE items SET item_name_en = 'Book Test (Girls)',              item_name_ml = item_name_en WHERE item_code = 'HSS-018';
UPDATE items SET item_name_en = 'Story Writing (Girls)',          item_name_ml = item_name_en WHERE item_code = 'HSS-019';
UPDATE items SET item_name_en = 'Poetry Writing (Girls)',         item_name_ml = item_name_en WHERE item_code = 'HSS-020';

-- Junior (JR) — 21 items
UPDATE items SET item_name_en = 'Literary Debate',                item_name_ml = item_name_en WHERE item_code = 'JR-001';
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'JR-002';
UPDATE items SET item_name_en = 'Speech – Malayalam',             item_name_ml = item_name_en WHERE item_code = 'JR-003';
UPDATE items SET item_name_en = 'Speech – Arabic',                item_name_ml = item_name_en WHERE item_code = 'JR-004';
UPDATE items SET item_name_en = 'Speech – English',               item_name_ml = item_name_en WHERE item_code = 'JR-005';
UPDATE items SET item_name_en = 'Poetry Writing',                 item_name_ml = item_name_en WHERE item_code = 'JR-006';
UPDATE items SET item_name_en = 'Story Writing',                  item_name_ml = item_name_en WHERE item_code = 'JR-007';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'JR-008';
UPDATE items SET item_name_en = 'Essay – Malayalam',              item_name_ml = item_name_en WHERE item_code = 'JR-009';
UPDATE items SET item_name_en = 'Essay – Arabic',                 item_name_ml = item_name_en WHERE item_code = 'JR-010';
UPDATE items SET item_name_en = 'Slogan Writing',                 item_name_ml = item_name_en WHERE item_code = 'JR-011';
UPDATE items SET item_name_en = 'Madh Song Composition',          item_name_ml = item_name_en WHERE item_code = 'JR-012';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'JR-013';
UPDATE items SET item_name_en = 'Translation – Arabic',           item_name_ml = item_name_en WHERE item_code = 'JR-014';
UPDATE items SET item_name_en = 'Arabic Calligraphy',             item_name_ml = item_name_en WHERE item_code = 'JR-015';
UPDATE items SET item_name_en = 'Social Text',                    item_name_ml = item_name_en WHERE item_code = 'JR-016';
UPDATE items SET item_name_en = 'Hadith Competition',             item_name_ml = item_name_en WHERE item_code = 'JR-017';
UPDATE items SET item_name_en = 'AI Poetry Writing',              item_name_ml = item_name_en WHERE item_code = 'JR-018';
UPDATE items SET item_name_en = 'Reel Making',                    item_name_ml = item_name_en WHERE item_code = 'JR-019';
UPDATE items SET item_name_en = 'Podcast',                        item_name_ml = item_name_en WHERE item_code = 'JR-020';
UPDATE items SET item_name_en = 'Socio Synapse',                  item_name_ml = item_name_en WHERE item_code = 'JR-021';

-- Senior (SR) — 27 items
UPDATE items SET item_name_en = 'Political Debate',               item_name_ml = item_name_en WHERE item_code = 'SR-001';
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'SR-002';
UPDATE items SET item_name_en = 'Hamd – Urdu',                    item_name_ml = item_name_en WHERE item_code = 'SR-003';
UPDATE items SET item_name_en = 'Poem Recitation – English',      item_name_ml = item_name_en WHERE item_code = 'SR-004';
UPDATE items SET item_name_en = 'Speech – Malayalam',             item_name_ml = item_name_en WHERE item_code = 'SR-005';
UPDATE items SET item_name_en = 'Speech – English',               item_name_ml = item_name_en WHERE item_code = 'SR-006';
UPDATE items SET item_name_en = 'Speech – Urdu',                  item_name_ml = item_name_en WHERE item_code = 'SR-007';
UPDATE items SET item_name_en = 'Musaara Alfiyya',                item_name_ml = item_name_en WHERE item_code = 'SR-008';
UPDATE items SET item_name_en = 'Poetry Writing – Malayalam',     item_name_ml = item_name_en WHERE item_code = 'SR-009';
UPDATE items SET item_name_en = 'Poetry Writing – English',       item_name_ml = item_name_en WHERE item_code = 'SR-010';
UPDATE items SET item_name_en = 'Story Writing',                  item_name_ml = item_name_en WHERE item_code = 'SR-011';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'SR-012';
UPDATE items SET item_name_en = 'Essay – Malayalam',              item_name_ml = item_name_en WHERE item_code = 'SR-013';
UPDATE items SET item_name_en = 'Essay – English',                item_name_ml = item_name_en WHERE item_code = 'SR-014';
UPDATE items SET item_name_en = 'Essay – Urdu',                   item_name_ml = item_name_en WHERE item_code = 'SR-015';
UPDATE items SET item_name_en = 'Translation – English',          item_name_ml = item_name_en WHERE item_code = 'SR-016';
UPDATE items SET item_name_en = 'Madh Song Composition',          item_name_ml = item_name_en WHERE item_code = 'SR-017';
UPDATE items SET item_name_en = 'Slogan Writing',                 item_name_ml = item_name_en WHERE item_code = 'SR-018';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'SR-019';
UPDATE items SET item_name_en = 'Feature Writing',                item_name_ml = item_name_en WHERE item_code = 'SR-020';
UPDATE items SET item_name_en = 'Social Text',                    item_name_ml = item_name_en WHERE item_code = 'SR-021';
UPDATE items SET item_name_en = 'Poster Designing',               item_name_ml = item_name_en WHERE item_code = 'SR-022';
UPDATE items SET item_name_en = 'E-Poster',                       item_name_ml = item_name_en WHERE item_code = 'SR-023';
UPDATE items SET item_name_en = 'Digital Illustration',           item_name_ml = item_name_en WHERE item_code = 'SR-024';
UPDATE items SET item_name_en = 'Magazine Layout',                item_name_ml = item_name_en WHERE item_code = 'SR-025';
UPDATE items SET item_name_en = 'Digital Painting',               item_name_ml = item_name_en WHERE item_code = 'SR-026';
UPDATE items SET item_name_en = 'Podcast',                        item_name_ml = item_name_en WHERE item_code = 'SR-027';

-- General (GN) — 19 items
UPDATE items SET item_name_en = 'Spot Magazine',                  item_name_ml = item_name_en WHERE item_code = 'GN-001';
UPDATE items SET item_name_en = 'Daf (Percussion)',               item_name_ml = item_name_en WHERE item_code = 'GN-002';
UPDATE items SET item_name_en = 'Arabana (Percussion)',           item_name_ml = item_name_en WHERE item_code = 'GN-003';
UPDATE items SET item_name_en = 'Group Song A',                   item_name_ml = item_name_en WHERE item_code = 'GN-004';
UPDATE items SET item_name_en = 'Group Song B',                   item_name_ml = item_name_en WHERE item_code = 'GN-005';
UPDATE items SET item_name_en = 'Mawlid Recitation',              item_name_ml = item_name_en WHERE item_code = 'GN-006';
UPDATE items SET item_name_en = 'Qasida Recitation',              item_name_ml = item_name_en WHERE item_code = 'GN-007';
UPDATE items SET item_name_en = 'Revolutionary Song',             item_name_ml = item_name_en WHERE item_code = 'GN-008';
UPDATE items SET item_name_en = 'Wall Writing',                   item_name_ml = item_name_en WHERE item_code = 'GN-009';
UPDATE items SET item_name_en = 'Mala Song',                      item_name_ml = item_name_en WHERE item_code = 'GN-010';
UPDATE items SET item_name_en = 'Risala Quiz',                    item_name_ml = item_name_en WHERE item_code = 'GN-011';
UPDATE items SET item_name_en = 'Qawwali',                        item_name_ml = item_name_en WHERE item_code = 'GN-012';
UPDATE items SET item_name_en = 'Revolutionary Song Composition', item_name_ml = item_name_en WHERE item_code = 'GN-013';
UPDATE items SET item_name_en = 'Mappila Song Composition',       item_name_ml = item_name_en WHERE item_code = 'GN-014';
UPDATE items SET item_name_en = 'Social Story',                   item_name_ml = item_name_en WHERE item_code = 'GN-015';
UPDATE items SET item_name_en = 'Project',                        item_name_ml = item_name_en WHERE item_code = 'GN-016';
UPDATE items SET item_name_en = 'Collage',                        item_name_ml = item_name_en WHERE item_code = 'GN-017';
UPDATE items SET item_name_en = 'Nasheed',                        item_name_ml = item_name_en WHERE item_code = 'GN-018';
UPDATE items SET item_name_en = 'Family Magazine',                item_name_ml = item_name_en WHERE item_code = 'GN-019';

-- Campus (CA) — 30 items
UPDATE items SET item_name_en = 'Mappila Song',                   item_name_ml = item_name_en WHERE item_code = 'CA-001';
UPDATE items SET item_name_en = 'Madh Song',                      item_name_ml = item_name_en WHERE item_code = 'CA-002';
UPDATE items SET item_name_en = 'Speech – Malayalam',             item_name_ml = item_name_en WHERE item_code = 'CA-003';
UPDATE items SET item_name_en = 'Speech – English',               item_name_ml = item_name_en WHERE item_code = 'CA-004';
UPDATE items SET item_name_en = 'Essay – Malayalam',              item_name_ml = item_name_en WHERE item_code = 'CA-005';
UPDATE items SET item_name_en = 'Essay – English',                item_name_ml = item_name_en WHERE item_code = 'CA-006';
UPDATE items SET item_name_en = 'Story Writing – Malayalam',      item_name_ml = item_name_en WHERE item_code = 'CA-007';
UPDATE items SET item_name_en = 'Poetry Writing – Malayalam',     item_name_ml = item_name_en WHERE item_code = 'CA-008';
UPDATE items SET item_name_en = 'Poetry Writing – English',       item_name_ml = item_name_en WHERE item_code = 'CA-009';
UPDATE items SET item_name_en = 'Drawing – Pencil',               item_name_ml = item_name_en WHERE item_code = 'CA-010';
UPDATE items SET item_name_en = 'Drawing – Watercolour',          item_name_ml = item_name_en WHERE item_code = 'CA-011';
UPDATE items SET item_name_en = 'Quiz',                           item_name_ml = item_name_en WHERE item_code = 'CA-012';
UPDATE items SET item_name_en = 'Book Test',                      item_name_ml = item_name_en WHERE item_code = 'CA-013';
UPDATE items SET item_name_en = 'E-Poster',                       item_name_ml = item_name_en WHERE item_code = 'CA-014';
UPDATE items SET item_name_en = 'Vlog',                           item_name_ml = item_name_en WHERE item_code = 'CA-015';
UPDATE items SET item_name_en = 'Top Comment',                    item_name_ml = item_name_en WHERE item_code = 'CA-016';
UPDATE items SET item_name_en = 'Political Debate',               item_name_ml = item_name_en WHERE item_code = 'CA-017';
UPDATE items SET item_name_en = 'Campus Magazine',                item_name_ml = item_name_en WHERE item_code = 'CA-018';
UPDATE items SET item_name_en = 'DPR Presentation',               item_name_ml = item_name_en WHERE item_code = 'CA-019';
UPDATE items SET item_name_en = 'Capture the Flag',               item_name_ml = item_name_en WHERE item_code = 'CA-020';
UPDATE items SET item_name_en = 'Language Pro',                   item_name_ml = item_name_en WHERE item_code = 'CA-021';
UPDATE items SET item_name_en = 'Online Quiz',                    item_name_ml = item_name_en WHERE item_code = 'CA-022';
UPDATE items SET item_name_en = 'AI Prompting',                   item_name_ml = item_name_en WHERE item_code = 'CA-023';
UPDATE items SET item_name_en = 'Ideathon',                       item_name_ml = item_name_en WHERE item_code = 'CA-024';
UPDATE items SET item_name_en = 'Market Masters',                 item_name_ml = item_name_en WHERE item_code = 'CA-025';
UPDATE items SET item_name_en = 'Book Title',                     item_name_ml = item_name_en WHERE item_code = 'CA-026';
UPDATE items SET item_name_en = 'Essay – Malayalam (Girls)',      item_name_ml = item_name_en WHERE item_code = 'CA-027';
UPDATE items SET item_name_en = 'Essay – English (Girls)',        item_name_ml = item_name_en WHERE item_code = 'CA-028';
UPDATE items SET item_name_en = 'Story Writing – Malayalam (Girls)', item_name_ml = item_name_en WHERE item_code = 'CA-029';
UPDATE items SET item_name_en = 'Story Writing – English (Girls)',item_name_ml = item_name_en WHERE item_code = 'CA-030';


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Deactivate any item whose code is NOT in the 170-item
--         Sahityotsav 2026 list (old CGP, CG, and stray codes)
-- ─────────────────────────────────────────────────────────────
UPDATE items
SET is_active = false
WHERE item_code NOT IN (
  -- LP
  'LP-001','LP-002','LP-003','LP-004','LP-005','LP-006','LP-007',
  'LP-008','LP-009','LP-010','LP-011','LP-012','LP-013','LP-014',
  -- UP
  'UP-001','UP-002','UP-003','UP-004','UP-005','UP-006','UP-007',
  'UP-008','UP-009','UP-010','UP-011','UP-012','UP-013','UP-014',
  'UP-015','UP-016',
  -- HS
  'HS-001','HS-002','HS-003','HS-004','HS-005','HS-006','HS-007',
  'HS-008','HS-009','HS-010','HS-011','HS-012','HS-013','HS-014',
  'HS-015','HS-016','HS-017','HS-018','HS-019','HS-020','HS-021',
  'HS-022','HS-023',
  -- HSS
  'HSS-001','HSS-002','HSS-003','HSS-004','HSS-005','HSS-006',
  'HSS-007','HSS-008','HSS-009','HSS-010','HSS-011','HSS-012',
  'HSS-013','HSS-014','HSS-015','HSS-016','HSS-017','HSS-018',
  'HSS-019','HSS-020',
  -- JR
  'JR-001','JR-002','JR-003','JR-004','JR-005','JR-006','JR-007',
  'JR-008','JR-009','JR-010','JR-011','JR-012','JR-013','JR-014',
  'JR-015','JR-016','JR-017','JR-018','JR-019','JR-020','JR-021',
  -- SR
  'SR-001','SR-002','SR-003','SR-004','SR-005','SR-006','SR-007',
  'SR-008','SR-009','SR-010','SR-011','SR-012','SR-013','SR-014',
  'SR-015','SR-016','SR-017','SR-018','SR-019','SR-020','SR-021',
  'SR-022','SR-023','SR-024','SR-025','SR-026','SR-027',
  -- GN
  'GN-001','GN-002','GN-003','GN-004','GN-005','GN-006','GN-007',
  'GN-008','GN-009','GN-010','GN-011','GN-012','GN-013','GN-014',
  'GN-015','GN-016','GN-017','GN-018','GN-019',
  -- CA
  'CA-001','CA-002','CA-003','CA-004','CA-005','CA-006','CA-007',
  'CA-008','CA-009','CA-010','CA-011','CA-012','CA-013','CA-014',
  'CA-015','CA-016','CA-017','CA-018','CA-019','CA-020','CA-021',
  'CA-022','CA-023','CA-024','CA-025','CA-026','CA-027','CA-028',
  'CA-029','CA-030'
);


-- ─────────────────────────────────────────────────────────────
-- STEP 3: Verification — should return 170 active items
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM items WHERE is_active = true;
  IF v_count = 170 THEN
    RAISE NOTICE 'SUCCESS: % active items after migration (expected 170)', v_count;
  ELSE
    RAISE WARNING 'MISMATCH: % active items found — expected 170. Please review.', v_count;
  END IF;
END $$;
