-- Archive-first organisation lifecycle.
-- Active rows must be archived before permanent deletion. Permanent deletion
-- is refused while hierarchy or business-history records still reference the
-- organisation; this migration never detaches or deletes those records.

CREATE OR REPLACE FUNCTION public.delete_archived_organisation(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_archived_at timestamptz;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.name, o.archived_at
    INTO v_tenant_id, v_name, v_archived_at
  FROM public.organisations o
  WHERE o.id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION 'Only archived organisations can be permanently deleted';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organisations WHERE parent_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.tenants WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participants WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.registrations WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.festival_teams WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.grace_marks WHERE org_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_batches WHERE target_unit_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_audit_logs WHERE old_unit_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_audit_logs WHERE new_unit_id = p_org_id)
  THEN
    RAISE EXCEPTION 'Cannot permanently delete this organisation: child organisations or linked tenant, participant, registration, team, or grace-mark records still exist. Reactivate it if needed; existing history was preserved.';
  END IF;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id,
    p_org_id,
    'organisation_permanently_deleted',
    'Deleted from archived organisation management',
    jsonb_build_object('name', v_name, 'archived_at', v_archived_at),
    NULL,
    true
  );

  DELETE FROM public.organisations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'deleted',
    'message', 'Archived organisation permanently deleted.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_organisation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_archived_organisation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_archived_organisation(uuid) TO authenticated;
