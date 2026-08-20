const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../importjson/ruls.json');
const outPath = path.join(__dirname, '../supabase/migrations/076_seed_scoring_rules.sql');

try {
  const rawData = fs.readFileSync(jsonPath, 'utf8');
  // Check if valid JSON
  const parsed = JSON.parse(rawData);

  // Escape single quotes for SQL string literal
  const escapedJson = rawData.replace(/'/g, "''");

  const sql = `-- Migration 076: Seed Scoring Rules from JSON
-- Note: This deletes existing global default rules and re-inserts them from the JSON.

DO $$
DECLARE
  v_json json := '${escapedJson}';
  v_item json;
  v_rule_id uuid;
  v_crit json;
BEGIN
  -- Delete old global defaults to avoid duplicates
  DELETE FROM scoring_rules WHERE tenant_id IS NULL;

  FOR v_item IN SELECT * FROM json_array_elements(v_json)
  LOOP
    INSERT INTO scoring_rules (event_name, event_name_ml, total_marks, time_limit, guidelines, is_default)
    VALUES (
      v_item->>'event_name',
      v_item->>'event_name_ml',
      (v_item->>'total_marks')::int,
      v_item->>'time_limit',
      v_item->>'guidelines',
      true -- these are global defaults now
    )
    RETURNING id INTO v_rule_id;

    IF v_item->'criteria' IS NOT NULL THEN
      FOR v_crit IN SELECT * FROM json_array_elements(v_item->'criteria')
      LOOP
        INSERT INTO scoring_criteria (rule_id, name, marks, sort_order)
        VALUES (
          v_rule_id,
          v_crit->>'name',
          (v_crit->>'marks')::int,
          COALESCE((v_crit->>'sort_order')::int, 0)
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;
`;

  fs.writeFileSync(outPath, sql);
  console.log('Successfully generated 076_seed_scoring_rules.sql');
} catch (e) {
  console.error('Error:', e);
}
