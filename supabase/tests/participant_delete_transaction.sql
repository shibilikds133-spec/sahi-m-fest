CREATE TRIGGER general_group_members_guard BEFORE DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000091',false);

DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000031'::uuid,'00000000-0000-0000-0000-000000000031'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'removed' OR (result->>'deleted_count')::int<>1 THEN RAISE EXCEPTION 'Single delete failed: %',result; END IF;
  IF EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000031')
     OR EXISTS(SELECT 1 FROM public.registrations WHERE id='00000000-0000-0000-0000-000000000071')
     OR EXISTS(SELECT 1 FROM public.group_members WHERE registration_id='00000000-0000-0000-0000-000000000071')
     OR NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000032') THEN
    RAISE EXCEPTION 'Participant delete did not remove the whole group while preserving the teammate record';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='GROUP_ENTRY_DELETE' AND record_id='00000000-0000-0000-0000-000000000071')
     OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='PARTICIPANT_DELETE' AND record_id='00000000-0000-0000-0000-000000000031') THEN
    RAISE EXCEPTION 'Successful participant/group removal was not audited';
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000033'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->>'message' NOT ILIKE '%history exists%' THEN RAISE EXCEPTION 'History block missing: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000033')
     OR NOT EXISTS(SELECT 1 FROM public.registrations WHERE id='00000000-0000-0000-0000-000000000072')
     OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE registration_id='00000000-0000-0000-0000-000000000072')
     OR EXISTS(SELECT 1 FROM public.audit_logs WHERE action='GROUP_ENTRY_DELETE' AND record_id='00000000-0000-0000-0000-000000000072') THEN
    RAISE EXCEPTION 'Blocked group deletion changed data or left a success audit';
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000035'::uuid,'00000000-0000-0000-0000-000000000037'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' THEN RAISE EXCEPTION 'Bulk delete should block atomically: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.registrations WHERE id='00000000-0000-0000-0000-000000000073')
     OR NOT EXISTS(SELECT 1 FROM public.registrations WHERE id='00000000-0000-0000-0000-000000000074')
     OR (SELECT count(*) FROM public.participants WHERE id=ANY(ARRAY[
       '00000000-0000-0000-0000-000000000035'::uuid,'00000000-0000-0000-0000-000000000036'::uuid,
       '00000000-0000-0000-0000-000000000037'::uuid,'00000000-0000-0000-0000-000000000038'::uuid]))<>4
     OR EXISTS(SELECT 1 FROM public.audit_logs WHERE action='GROUP_ENTRY_DELETE' AND record_id='00000000-0000-0000-0000-000000000073') THEN
    RAISE EXCEPTION 'Bulk deletion was not rolled back completely';
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000039'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->'dependencies' ? 'individual_competition_registrations' IS NOT TRUE
     OR NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000039') THEN
    RAISE EXCEPTION 'Individual competition history was not protected: %',result;
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000040'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->'dependencies' ? 'attendance_or_check_in' IS NOT TRUE
     OR NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000040') THEN
    RAISE EXCEPTION 'Attendance history was not protected: %',result;
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000044'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->'dependencies' ? 'certificates' IS NOT TRUE
     OR NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000044') THEN
    RAISE EXCEPTION 'Certificate history was not protected: %',result;
  END IF;
END $$;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000042'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->'dependencies' ? 'chest_number_change_history' IS NOT TRUE THEN
    RAISE EXCEPTION 'Chest-number audit history was not protected: %',result;
  END IF;
  result:=public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000043'::uuid]);
  IF result->>'status' IS DISTINCT FROM 'blocked' OR result->'dependencies' ? 'organisation_transfer_history' IS NOT TRUE THEN
    RAISE EXCEPTION 'Organisation-transfer audit history was not protected: %',result;
  END IF;
END $$;
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000092',false);
DO $$ BEGIN
  BEGIN
    PERFORM public.safe_delete_participants(ARRAY['00000000-0000-0000-0000-000000000041'::uuid]);
    RAISE EXCEPTION 'Cross-tenant delete unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.participants WHERE id='00000000-0000-0000-0000-000000000041') THEN RAISE EXCEPTION 'Cross-tenant participant was deleted'; END IF;
END $$;
DO $$ BEGIN
  RAISE NOTICE 'PASS: participant delete removes whole safe groups, preserves teammate/history, rolls back batches, and enforces tenant scope';
END $$;
