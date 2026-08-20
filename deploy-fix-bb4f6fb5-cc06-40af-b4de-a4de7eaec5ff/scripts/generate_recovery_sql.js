const fs = require('fs');
const path = require('path');

const schedule27Path = path.join(__dirname, '../importjson/schedule27.json');
const losted27ResPath = path.join(__dirname, '../importjson/losted27res.json');
const outputPath = path.join(__dirname, '../restore_schedules.sql');

function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00:00";
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }
  return `${String(hours).padStart(2, '0')}:${minutes}:00`;
}

try {
  if (!fs.existsSync(schedule27Path)) throw new Error(`Missing ${schedule27Path}`);
  if (!fs.existsSync(losted27ResPath)) throw new Error(`Missing ${losted27ResPath}`);

  const schedules = JSON.parse(fs.readFileSync(schedule27Path, 'utf8'));
  const mappings = JSON.parse(fs.readFileSync(losted27ResPath, 'utf8'));

  let sql = `DO $$\n`;
  sql += `DECLARE\n`;
  sql += `    v_item_id UUID;\n`;
  sql += `    v_venue_id UUID;\n`;
  sql += `    v_tenant_id UUID;\n`;
  sql += `    v_festival_id UUID;\n`;
  sql += `    v_participant_id UUID;\n`;
  sql += `    v_inserted_count INT := 0;\n`;
  sql += `    v_updated_count INT := 0;\n`;
  sql += `BEGIN\n`;

  sql += `    -- ==========================================\n`;
  sql += `    -- 1. RECREATE SCHEDULES\n`;
  sql += `    -- ==========================================\n`;

  schedules.forEach((sch, index) => {
    const startTimeISO = `${sch.date} ${convertTo24Hour(sch.start_time)}+05:30`;
    const endTimeISO = `${sch.date} ${convertTo24Hour(sch.end_time)}+05:30`;
    const stageOrder = sch.stage_order || (index + 1);

    sql += `    -- Schedule [${index + 1}]: ${sch.item_name} (${sch.item_code})\n`;
    sql += `    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = '${sch.item_code}' LIMIT 1;\n`;
    sql += `    SELECT id INTO v_venue_id FROM public.venues WHERE name = '${sch.venue}' LIMIT 1;\n`;
    
    // Add deletion of existing matching schedules on the first iteration to clear wrong timezone entries
    if (index === 0) {
      sql += `    -- Clear previous entries for this festival and tenant to reload with correct +05:30 Indian Time\n`;
      sql += `    DELETE FROM public.schedules \n`;
      sql += `    WHERE tenant_id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1' \n`;
      sql += `      AND festival_id = 'e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6' \n`;
      sql += `      AND start_time::date = '2026-05-27'::date;\n\n`;
    }

    sql += `    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN\n`;
    sql += `        IF NOT EXISTS (\n`;
    sql += `            SELECT 1 FROM public.schedules \n`;
    sql += `            WHERE item_id = v_item_id AND start_time = '${startTimeISO}'::timestamp with time zone\n`;
    sql += `        ) THEN\n`;
    sql += `            INSERT INTO public.schedules (\n`;
    sql += `                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count\n`;
    sql += `            ) VALUES (\n`;
    sql += `                v_item_id, v_venue_id, v_tenant_id, v_festival_id,\n`;
    sql += `                '${startTimeISO}'::timestamp with time zone, \n`;
    sql += `                '${endTimeISO}'::timestamp with time zone, \n`;
    sql += `                '${sch.status || 'scheduled'}', 3\n`;
    sql += `            );\n`;
    sql += `            v_inserted_count := v_inserted_count + 1;\n`;
    sql += `        END IF;\n`;
    sql += `    END IF;\n\n`;
  });

  sql += `    -- ==========================================\n`;
  sql += `    -- 2. RESTORE CODE LETTERS (Without touching status)\n`;
  sql += `    -- ==========================================\n`;

  mappings.forEach((map, index) => {
    sql += `    -- Mapping [${index + 1}]: Chest ${map.chest_number} for Item ${map.item_code} -> Code ${map.code_letter}\n`;
    sql += `    SELECT id INTO v_item_id FROM public.items WHERE item_code = '${map.item_code}' LIMIT 1;\n`;
    sql += `    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '${map.chest_number}' LIMIT 1;\n`;
    
    sql += `    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN\n`;
    // We only update the code_letter, we DO NOT touch the status field.
    sql += `        UPDATE public.registrations \n`;
    sql += `        SET code_letter = '${map.code_letter}'\n`;
    sql += `        WHERE participant_id = v_participant_id AND item_id = v_item_id;\n`;
    sql += `        \n`;
    sql += `        IF FOUND THEN\n`;
    sql += `            v_updated_count := v_updated_count + 1;\n`;
    sql += `        END IF;\n`;
    sql += `    END IF;\n\n`;
  });

  sql += `    RAISE NOTICE 'SUCCESS: % Schedules Inserted, % Code Letters Restored/Updated', v_inserted_count, v_updated_count;\n`;
  sql += `END $$;\n`;

  fs.writeFileSync(outputPath, sql, 'utf8');
  console.log(`✅ SQL generated successfully at ${outputPath}`);
} catch (err) {
  console.error('❌ Error generating SQL:', err);
}
