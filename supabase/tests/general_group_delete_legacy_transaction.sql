CREATE TRIGGER general_group_members_guard BEFORE DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000091',false);
CREATE TEMP TABLE legacy_delete_result AS
  SELECT public.safe_delete_general_team_entry('00000000-0000-0000-0000-000000000071') AS data;
DO $$ BEGIN
  IF (SELECT data->>'status' FROM legacy_delete_result) IS DISTINCT FROM 'removed' THEN
    RAISE EXCEPTION 'Legacy group entry was not safely removed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.registrations WHERE id='00000000-0000-0000-0000-000000000071')
     OR EXISTS(SELECT 1 FROM public.group_members WHERE registration_id='00000000-0000-0000-0000-000000000071') THEN
    RAISE EXCEPTION 'Legacy group roster cleanup was incomplete';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='GROUP_ENTRY_DELETE' AND record_id='00000000-0000-0000-0000-000000000071') THEN
    RAISE EXCEPTION 'Legacy group deletion was not audited';
  END IF;
  RAISE NOTICE 'PASS: legacy representative identity permits scoped, audited group deletion';
END $$;
