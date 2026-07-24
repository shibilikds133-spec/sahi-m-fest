const fs = require('fs');
const path = require('path');

// ഫയലുകളുടെ പാത നിർവ്വചിക്കുന്നു
const schedule27Path = path.join(__dirname, '../schedule27.json');
const losted27ResPath = path.join(__dirname, '../losted27res.json');
const outputPath = path.join(__dirname, '../restore_schedules.sql');

try {
  // 1. ഫയലുകൾ റീഡ് ചെയ്യുന്നു
  if (!fs.existsSync(schedule27Path)) {
    console.error("❌ schedule27.json ഫയൽ പ്രോജക്റ്റ് റൂട്ടിൽ കണ്ടെത്താൻ കഴിഞ്ഞില്ല!");
    process.exit(1);
  }
  
  const schedules = JSON.parse(fs.readFileSync(schedule27Path, 'utf8'));
  console.log(`ℹ️ schedule27.json-ൽ നിന്ന് ${schedules.length} ഷെഡ്യൂളുകൾ കണ്ടെത്തി.`);

  let sqlContent = `-- =========================================================\n`;
  sqlContent += `-- EMERGENCY SCHEDULE RECOVERY MIGRATION\n`;
  sqlContent += `-- Generated on: ${new Date().toISOString()}\n`;
  sqlContent += `-- =========================================================\n\n`;
  sqlContent += `DO $$\n`;
  sqlContent += `DECLARE\n`;
  sqlContent += `    v_item_id UUID;\n`;
  sqlContent += `    v_venue_id UUID;\n`;
  sqlContent += `    v_tenant_id UUID;\n`;
  sqlContent += `    v_inserted_count INT := 0;\n`;
  sqlContent += `BEGIN\n`;
  sqlContent += `    -- നിങ്ങളുടെ പ്രൊജക്റ്റിലെ ആദ്യത്തെ ടെനന്റ് ഐഡി കണ്ടെത്തുന്നു\n`;
  sqlContent += `    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;\n\n`;

  // 2. ഓരോ ഷെഡ്യൂളിനും വേണ്ടിയുള്ള SQL തെയ്യാറാക്കുന്നു
  schedules.forEach((sch, index) => {
    // തീയതിയും സമയവും ISO ഫോർമാറ്റിലേക്ക് മാറ്റുന്നു
    const startTimeISO = `${sch.date} ${convertTo24Hour(sch.start_time)}`;
    const endTimeISO = `${sch.date} ${convertTo24Hour(sch.end_time)}`;

    sqlContent += `    -- [${index + 1}] Item: ${sch.item_name} (${sch.item_code}) at ${sch.venue}\n`;
    sqlContent += `    SELECT id INTO v_item_id FROM public.items WHERE item_code = '${sch.item_code}' LIMIT 1;\n`;
    sqlContent += `    SELECT id INTO v_venue_id FROM public.venues WHERE name = '${sch.venue}' LIMIT 1;\n\n`;
    
    sqlContent += `    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN\n`;
    sqlContent += `        IF NOT EXISTS (\n`;
    sqlContent += `            SELECT 1 FROM public.schedules \n`;
    sqlContent += `            WHERE item_id = v_item_id \n`;
    sqlContent += `              AND venue_id = v_venue_id \n`;
    sqlContent += `              AND start_time = '${startTimeISO}'::timestamp with time zone\n`;
    sqlContent += `        ) THEN\n`;
    sqlContent += `            INSERT INTO public.schedules (\n`;
    sqlContent += `                item_id, \n`;
    sqlContent += `                venue_id, \n`;
    sqlContent += `                tenant_id, \n`;
    sqlContent += `                start_time, \n`;
    sqlContent += `                end_time, \n`;
    sqlContent += `                status, \n`;
    sqlContent += `                expected_judge_count\n`;
    sqlContent += `            ) VALUES (\n`;
    sqlContent += `                v_item_id, \n`;
    sqlContent += `                v_venue_id, \n`;
    sqlContent += `                v_tenant_id, \n`;
    sqlContent += `                '${startTimeISO}'::timestamp with time zone, \n`;
    sqlContent += `                '${endTimeISO}'::timestamp with time zone, \n`;
    sqlContent += `                '${sch.status || 'scheduled'}', \n`;
    sqlContent += `                3\n`;
    sqlContent += `            );\n`;
    sqlContent += `            v_inserted_count := v_inserted_count + 1;\n`;
    sqlContent += `        END IF;\n`;
    sqlContent += `    END IF;\n\n`;
  });

  sqlContent += `    RAISE NOTICE 'Schedules Restored: %', v_inserted_count;\n`;
  sqlContent += `END $$;\n`;

  // 3. ഫയൽ റൈറ്റ് ചെയ്യുന്നു
  fs.writeFileSync(outputPath, sqlContent, 'utf8');
  console.log(`✅ വിജയകരം! SQL ക്വറികൾ ${outputPath}-ലേക്ക് സേവ് ചെയ്തിട്ടുണ്ട്.`);
  console.log("ℹ️ ഈ ഫയലിലെ കോഡുകൾ കോപ്പി ചെയ്ത് Supabase SQL Editor-ൽ റൺ ചെയ്യാവുന്നതാണ്.");

} catch (err) {
  console.error("❌ സ്ക്രിപ്റ്റ് റൺ ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു:", err);
}

// 12-hour AM/PM സമയത്തെ 24-hour ഫോർമാറ്റിലേക്ക് മാറ്റാനുള്ള ഫംഗ്ഷൻ
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
