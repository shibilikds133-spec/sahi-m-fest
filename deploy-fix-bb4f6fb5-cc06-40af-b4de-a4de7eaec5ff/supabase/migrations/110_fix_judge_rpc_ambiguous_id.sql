-- 110_fix_judge_rpc_ambiguous_id.sql
-- Qualify organisation_tree.id in the token-bound judge registration RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_token text)
RETURNS TABLE (
  id uuid, item_id uuid, tenant_id uuid, code_letter text,
  participant_name text, chest_number text, photo_url text,
  category_code text, is_verified boolean, existing_mark jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.';
  END IF;

  SELECT jt.* INTO v_token
  FROM public.judge_tokens jt
  WHERE (jt.token_hash = encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex')
      OR jt.token = upper(trim(p_token)))
    AND jt.status = 'approved'
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC LIMIT 1;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_judge_assignments assignment
    WHERE assignment.schedule_id = v_token.schedule_id
      AND assignment.judge_id = v_token.judge_id
      AND assignment.tenant_id = v_token.tenant_id
      AND assignment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  SELECT schedule.tenant_id, schedule.festival_id, schedule.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules schedule WHERE schedule.id = v_token.schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Event schedule was not found.';
  END IF;

  SELECT tenant.organisation_id INTO v_root_org_id
  FROM public.tenants tenant WHERE tenant.id = v_schedule_tenant_id;

  RETURN QUERY
  WITH RECURSIVE organisation_tree AS (
    SELECT organisation.id
    FROM public.organisations organisation
    WHERE organisation.id = v_root_org_id
       OR (v_root_org_id IS NULL AND organisation.tenant_id = v_schedule_tenant_id)
    UNION
    SELECT child.id
    FROM public.organisations child
    INNER JOIN organisation_tree parent ON child.parent_id = parent.id
  )
  SELECT registration.id, registration.item_id, registration.tenant_id,
    registration.code_letter, participant.name, participant.chest_number,
    participant.photo_url, participant.category_code, registration.is_verified,
    mark.existing_mark
  FROM public.registrations registration
  LEFT JOIN public.participants participant ON participant.id = registration.participant_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', mark_entry.id,
      'criteria_scores', mark_entry.criteria_scores,
      'total_mark', mark_entry.total_mark,
      'entry_mode_snapshot', mark_entry.entry_mode_snapshot,
      'max_mark_snapshot', mark_entry.max_mark_snapshot,
      'criteria_snapshot', mark_entry.criteria_snapshot,
      'is_draft', mark_entry.is_draft,
      'is_final', mark_entry.is_final
    ) AS existing_mark
    FROM public.mark_entries mark_entry
    WHERE mark_entry.schedule_id = v_token.schedule_id
      AND mark_entry.judge_id = v_token.judge_id
      AND mark_entry.registration_id = registration.id
    ORDER BY mark_entry.updated_at DESC NULLS LAST,
      mark_entry.submitted_at DESC NULLS LAST, mark_entry.id DESC
    LIMIT 1
  ) mark ON true
  WHERE registration.item_id = v_schedule_item_id
    AND registration.festival_id = v_schedule_festival_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND (
      registration.organisation_id IN (SELECT organisation_tree.id FROM organisation_tree)
      OR participant.organisation_id IN (SELECT organisation_tree.id FROM organisation_tree)
    )
  ORDER BY registration.code_letter;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_registrations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
