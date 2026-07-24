DO $$
DECLARE
    v_item_id UUID;
    v_venue_id UUID;
    v_tenant_id UUID;
    v_festival_id UUID;
    v_participant_id UUID;
    v_inserted_count INT := 0;
    v_updated_count INT := 0;
BEGIN
    -- ==========================================
    -- 1. RECREATE SCHEDULES
    -- ==========================================
    -- Schedule [1]: Story Writing (SR-011)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-011' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    -- Clear previous entries for this festival and tenant to reload with correct +05:30 Indian Time
    DELETE FROM public.schedules 
    WHERE tenant_id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1' 
      AND festival_id = 'e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6' 
      AND start_time::date = '2026-05-27'::date;

    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 09:00:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 09:00:00+05:30'::timestamp with time zone, 
                '2026-05-27 09:40:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [2]: Poetry Writing – Malayalam (SR-009)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 09:45:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 09:45:00+05:30'::timestamp with time zone, 
                '2026-05-27 10:25:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [3]: Slogan Writing (SR-018)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 10:30:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 10:30:00+05:30'::timestamp with time zone, 
                '2026-05-27 11:10:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [4]: Essay – Malayalam (SR-013)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 11:15:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 11:15:00+05:30'::timestamp with time zone, 
                '2026-05-27 11:45:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [5]: Poetry Writing – English (SR-010)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-010' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 12:30:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 12:30:00+05:30'::timestamp with time zone, 
                '2026-05-27 13:10:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [6]: Essay – English (SR-014)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-014' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 13:15:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 13:15:00+05:30'::timestamp with time zone, 
                '2026-05-27 13:45:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [7]: Essay – Urdu (SR-015)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-015' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 13:50:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 13:50:00+05:30'::timestamp with time zone, 
                '2026-05-27 14:20:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [8]: Translation – English (SR-016)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-016' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 14:25:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 14:25:00+05:30'::timestamp with time zone, 
                '2026-05-27 15:05:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [9]: Madh Song Composition (SR-017)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 1' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 15:10:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 15:10:00+05:30'::timestamp with time zone, 
                '2026-05-27 15:50:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [10]: Poetry Writing (JR-006)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 09:00:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 09:00:00+05:30'::timestamp with time zone, 
                '2026-05-27 09:10:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [11]: Essay – Malayalam (JR-009)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 09:15:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 09:15:00+05:30'::timestamp with time zone, 
                '2026-05-27 09:45:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [12]: Essay – Arabic (JR-010)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 09:50:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 09:50:00+05:30'::timestamp with time zone, 
                '2026-05-27 10:20:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [13]: Madh Song Composition (JR-012)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 10:25:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 10:25:00+05:30'::timestamp with time zone, 
                '2026-05-27 11:05:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [14]: Translation – Arabic (JR-014)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 11:10:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 11:10:00+05:30'::timestamp with time zone, 
                '2026-05-27 11:50:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [15]: Arabic Calligraphy (JR-015)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-015' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 12:00:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 12:00:00+05:30'::timestamp with time zone, 
                '2026-05-27 13:00:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [16]: Social Text (JR-016)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 13:05:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 13:05:00+05:30'::timestamp with time zone, 
                '2026-05-27 13:35:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- Schedule [17]: AI Poetry Writing (JR-018)
    SELECT id, tenant_id, festival_id INTO v_item_id, v_tenant_id, v_festival_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_venue_id FROM public.venues WHERE name = 'OFF STAGE 2' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_venue_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.schedules 
            WHERE item_id = v_item_id AND start_time = '2026-05-27 13:40:00+05:30'::timestamp with time zone
        ) THEN
            INSERT INTO public.schedules (
                item_id, venue_id, tenant_id, festival_id, start_time, end_time, status, expected_judge_count
            ) VALUES (
                v_item_id, v_venue_id, v_tenant_id, v_festival_id,
                '2026-05-27 13:40:00+05:30'::timestamp with time zone, 
                '2026-05-27 14:10:00+05:30'::timestamp with time zone, 
                'scheduled', 3
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END IF;

    -- ==========================================
    -- 2. RESTORE CODE LETTERS (Without touching status)
    -- ==========================================
    -- Mapping [1]: Chest 1020 for Item JR-006 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1020' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [2]: Chest 1009 for Item JR-006 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1009' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [3]: Chest 1039 for Item JR-006 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1039' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [4]: Chest 1014 for Item JR-006 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1014' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [5]: Chest 1044 for Item JR-006 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1044' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [6]: Chest 1018 for Item JR-006 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-006' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1018' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [7]: Chest 1003 for Item JR-009 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1003' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [8]: Chest 1015 for Item JR-009 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1015' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [9]: Chest 1041 for Item JR-009 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1041' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [10]: Chest 1042 for Item JR-009 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1042' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [11]: Chest 1031 for Item JR-009 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1031' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [12]: Chest 1010 for Item JR-009 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1010' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [13]: Chest 1028 for Item JR-009 -> Code G
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1028' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'G'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [14]: Chest 1020 for Item JR-009 -> Code H
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1020' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'H'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [15]: Chest 1022 for Item JR-009 -> Code I
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1022' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'I'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [16]: Chest 1037 for Item JR-009 -> Code J
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1037' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'J'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [17]: Chest 1013 for Item JR-009 -> Code K
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1013' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'K'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [18]: Chest 1030 for Item JR-010 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [19]: Chest 1029 for Item JR-010 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1029' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [20]: Chest 1011 for Item JR-010 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1011' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [21]: Chest 1019 for Item JR-010 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1019' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [22]: Chest 1043 for Item JR-010 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1043' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [23]: Chest 1004 for Item JR-010 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1004' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [24]: Chest 1013 for Item JR-010 -> Code G
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1013' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'G'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [25]: Chest 1038 for Item JR-010 -> Code H
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1038' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'H'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [26]: Chest 1018 for Item JR-010 -> Code I
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1018' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'I'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [27]: Chest 1039 for Item JR-012 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1039' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [28]: Chest 1043 for Item JR-012 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1043' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [29]: Chest 1011 for Item JR-012 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1011' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [30]: Chest 1033 for Item JR-012 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1033' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [31]: Chest 1018 for Item JR-012 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1018' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [32]: Chest 1025 for Item JR-012 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-012' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1025' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [33]: Chest 1019 for Item JR-014 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1019' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [34]: Chest 1029 for Item JR-014 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1029' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [35]: Chest 1037 for Item JR-014 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1037' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [36]: Chest 1002 for Item JR-014 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1002' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [37]: Chest 1044 for Item JR-014 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1044' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [38]: Chest 1010 for Item JR-014 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1010' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [39]: Chest 1006 for Item JR-015 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-015' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1006' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [40]: Chest 1029 for Item JR-015 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-015' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1029' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [41]: Chest 1021 for Item JR-015 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-015' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1021' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [42]: Chest 1009 for Item JR-015 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-015' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1009' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [43]: Chest 1028 for Item JR-016 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1028' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [44]: Chest 1022 for Item JR-016 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1022' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [45]: Chest 1015 for Item JR-016 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1015' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [46]: Chest 1004 for Item JR-016 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1004' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [47]: Chest 1038 for Item JR-016 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1038' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [48]: Chest 1030 for Item JR-018 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [49]: Chest 1022 for Item JR-018 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1022' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [50]: Chest 1041 for Item JR-018 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1041' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [51]: Chest 1040 for Item JR-018 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1040' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [52]: Chest 1014 for Item JR-018 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'JR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '1014' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [53]: Chest 2009 for Item SR-009 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2009' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [54]: Chest 2035 for Item SR-009 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2035' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [55]: Chest 2006 for Item SR-009 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2006' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [56]: Chest 2029 for Item SR-009 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2029' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [57]: Chest 2016 for Item SR-009 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-009' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2016' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [58]: Chest 2030 for Item SR-010 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [59]: Chest 2003 for Item SR-010 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2003' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [60]: Chest 2019 for Item SR-010 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-010' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2019' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [61]: Chest 2009 for Item SR-011 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-011' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2009' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [62]: Chest 2035 for Item SR-011 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-011' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2035' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [63]: Chest 2031 for Item SR-011 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-011' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2031' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [64]: Chest 2006 for Item SR-011 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-011' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2006' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [65]: Chest 2030 for Item SR-013 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [66]: Chest 2023 for Item SR-013 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2023' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [67]: Chest 2005 for Item SR-013 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2005' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [68]: Chest 2015 for Item SR-013 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2015' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [69]: Chest 2017 for Item SR-013 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2017' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [70]: Chest 2034 for Item SR-013 -> Code F
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2034' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'F'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [71]: Chest 2008 for Item SR-013 -> Code G
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-013' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2008' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'G'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [72]: Chest 2015 for Item SR-014 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2015' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [73]: Chest 2017 for Item SR-014 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2017' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [74]: Chest 2030 for Item SR-014 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-014' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [75]: Chest 2030 for Item SR-015 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-015' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2030' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [76]: Chest 2015 for Item SR-016 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2015' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [77]: Chest 2021 for Item SR-016 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2021' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [78]: Chest 2002 for Item SR-016 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2002' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [79]: Chest 2029 for Item SR-016 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-016' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2029' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [80]: Chest 2002 for Item SR-017 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2002' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [81]: Chest 2041 for Item SR-017 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2041' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [82]: Chest 2026 for Item SR-017 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2026' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [83]: Chest 2031 for Item SR-017 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2031' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [84]: Chest 2008 for Item SR-017 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-017' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2008' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [85]: Chest 2005 for Item SR-018 -> Code A
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2005' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'A'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [86]: Chest 2027 for Item SR-018 -> Code B
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2027' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'B'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [87]: Chest 2016 for Item SR-018 -> Code C
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2016' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'C'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [88]: Chest 2011 for Item SR-018 -> Code D
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2011' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'D'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    -- Mapping [89]: Chest 2036 for Item SR-018 -> Code E
    SELECT id INTO v_item_id FROM public.items WHERE item_code = 'SR-018' LIMIT 1;
    SELECT id INTO v_participant_id FROM public.participants WHERE chest_number = '2036' LIMIT 1;
    IF v_item_id IS NOT NULL AND v_participant_id IS NOT NULL THEN
        UPDATE public.registrations 
        SET code_letter = 'E'
        WHERE participant_id = v_participant_id AND item_id = v_item_id;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END IF;

    RAISE NOTICE 'SUCCESS: % Schedules Inserted, % Code Letters Restored/Updated', v_inserted_count, v_updated_count;
END $$;
