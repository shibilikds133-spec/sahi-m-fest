-- Migration 022: Scoring Rules Tables

DROP TABLE IF EXISTS scoring_criteria CASCADE;
DROP TABLE IF EXISTS scoring_rules CASCADE;

CREATE TABLE IF NOT EXISTS scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  event_name text NOT NULL,
  event_name_ml text,
  total_marks int DEFAULT 100,
  time_limit text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoring_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES scoring_rules(id) ON DELETE CASCADE,
  name text NOT NULL,
  marks int NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all" ON scoring_rules FOR SELECT USING (true);
CREATE POLICY "Enable all access for admins" ON scoring_rules FOR ALL USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY "Enable read access for all cr" ON scoring_criteria FOR SELECT USING (true);
CREATE POLICY "Enable all access for admins cr" ON scoring_criteria FOR ALL USING (public.is_superadmin() OR EXISTS (SELECT 1 FROM scoring_rules sr WHERE sr.id = scoring_criteria.rule_id AND sr.tenant_id = public.get_my_tenant_id()));

-- Seed data for global default rules (tenant_id is null)
DO $$
DECLARE
  v_rule_id uuid;
BEGIN
  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Speech', 'പ്രസംഗം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Confidence & Presentation', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 15, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Language Quality', 15, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Clarity of Ideas', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Creativity', 15, 4);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice Modulation', 15, 5);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Political Debate', 'രാഷ്ട്രീയ സംവാദം', 100, NULL, false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Communication Skill', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Language', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Body Language', 15, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Argument Quality', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Confidence', 15, 4);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Time Management', 10, 5);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Literary Discussion', 'സാഹിത്യ ചർച്ച', 100, NULL, false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Reading Quality', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Literary Knowledge', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Participation', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Analytical Ability', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Communication', 15, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Reading Competition', 'വായനാ മത്സരം', 100, '3m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Reading Flow', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Understanding', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice Clarity', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Expression', 20, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('News Reading', 'വാർത്താ വായന', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'News Structuring', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Reading Flow', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation & Language', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'News Priority Selection', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Story Telling', 'കഥ പറച്ചിൽ', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Memorization', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation Style', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Expression', 15, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Completeness', 15, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Mappilappattu', 'മാപ്പിളപ്പാട്ട്', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Lyrics', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Traditional Style', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch Accuracy', 20, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Madh Song', 'മദ്ഹ് ഗാനം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Lyrics', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Bhakthi Ganam', 'ഭക്തിഗാനം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Lyrics', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Group Song', 'സംഘഗാനം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 30, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Song Rhythm', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Daf / Instrument Rhythm', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Team Coordination', 30, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Mala Pattu', 'മാലപ്പാട്ട്', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Team Coordination', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Moulood Recitation', 'മൗലൂദ് പാരായണം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Coordination', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 20, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Qaseeda Recitation', 'ഖസീദ പാരായണം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Coordination', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 20, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Hamd Urdu', 'ഹംദ് ഉറുദു', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Lyrics', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Nasheed', 'നഷീദ്', 100, '7m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Team Coordination', 30, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation Beauty', 30, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm', 20, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Qawwali', 'ഖവാലി', 100, '10m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Clarity', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation Beauty', 30, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Team Coordination', 30, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm & Song', 20, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Daf Mutt', 'ദഫ് മുട്ട്', 100, '10m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Baith / Madh', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Rhythm Variation', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Instrument Performance', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Aravana Mutt', 'അറവന മുട്ട്', 100, '10m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Baith', 20, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 20, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Expression', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Instrument Skill', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 20, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Poem Recitation / Arabic Poem', 'കവിതാ പാരായണം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Memorization', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pronunciation', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Expression', 25, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Meaning Clarity', 25, 3);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Revolutionary Song', 'വിപ്ലവ ഗാനം', 100, '5m', false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Lyrics', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Pitch', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Coordination', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Voice', 20, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Creativity', 10, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Quiz', 'ക്വിസ്', 100, NULL, false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'General Knowledge / Current Affairs / History', 50, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Science / Mental Ability', 30, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Islam / Organizational Topics', 20, 2);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('Language Game', 'ഭാഷാ കളി', 100, NULL, false)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Word chain', 50, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Sentence creation', 50, 1);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('DEFAULT_CREATIVE', NULL, 100, NULL, true)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Creativity', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Content Quality', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Technical Quality', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 15, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Originality', 15, 4);

  INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, is_default)
  VALUES ('DEFAULT_PERFORMANCE', NULL, 100, NULL, true)
  RETURNING id INTO v_rule_id;

  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Presentation', 25, 0);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Skill Quality', 25, 1);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Accuracy', 20, 2);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Creativity', 15, 3);
  INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
  VALUES (v_rule_id, 'Confidence', 15, 4);

END $$;
