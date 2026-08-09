-- 123_fix_upsert_judge_mark_null_festival.sql
-- Fixes P0001: "This registration does not belong to the scheduled event"
-- Matches the COALESCE logic introduced for reads in migration 112 so that writes also support legacy schedules with NULL festival_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_judge_mark(
  p_token text,
  p_registration_id uuid,
  p_criteria_scores jsonb DEFAULT '{}'::jsonb,
  p_total_mark numeric DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_entry_mode text DEFAULT 'criteria',
  p_max_mark numeric DEFAULT 100,
  p_criteria_snapshot jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
  v_existing_final_id uuid;
  v_result jsonb;
BEGIN
  -- 1. Token must exist, be exactly approved, unused, unrevoked, unexpired.
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.';
  END IF;

  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE (
        jt.token_hash = encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex')
     OR jt.token = upper(trim(p_token))
    )
    AND jt.status = 'approved'
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.';
  END IF;

  -- 2. The judge must remain actively assigned to the token-derived schedule.
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = v_token.schedule_id
      AND a.judge_id = v_token.judge_id
      AND a.tenant_id = v_token.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  -- 3. Registration must exist.
  SELECT r.*
  INTO v_registration
  FROM public.registrations r
  WHERE r.id = p_registration_id;

  IF v_registration.id IS NULL THEN
    RAISE EXCEPTION 'Registration was not found.';
  END IF;

  -- 4. Registration must belong to the token-derived schedule context
  --    (same item and festival). The schedule id is derived from the token,
  --    never accepted from the client.
  SELECT s.tenant_id, COALESCE(s.festival_id, i.festival_id), s.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules s
  LEFT JOIN public.items i ON i.id = s.item_id
  WHERE s.id = v_token.schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Event schedule was not found.';
  END IF;

  IF v_registration.item_id IS DISTINCT FROM v_schedule_item_id
     OR v_registration.festival_id IS DISTINCT FROM v_schedule_festival_id THEN
    RAISE EXCEPTION 'This registration does not belong to the scheduled event.';
  END IF;

  IF v_registration.status = 'rejected' THEN
    RAISE EXCEPTION 'This registration is no longer eligible.';
  END IF;

  -- 5. Registration must belong to the schedule owner's permitted organisation
  --    tree (parent competition may judge descendant organisations, but not
  --    siblings or unrelated trees).
  SELECT t.organisation_id
  INTO v_root_org_id
  FROM public.tenants t
  WHERE t.id = v_schedule_tenant_id;

  IF NOT EXISTS (
    WITH RECURSIVE organisation_tree AS (
      SELECT o.id
      FROM public.organisations o
      WHERE o.id = v_root_org_id
         OR (v_root_org_id IS NULL AND o.tenant_id = v_schedule_tenant_id)

      UNION

      SELECT child.id
      FROM public.organisations child
      INNER JOIN organisation_tree parent ON child.parent_id = parent.id
    )
    SELECT 1
    FROM public.registrations r
    LEFT JOIN public.participants p ON p.id = r.participant_id
    WHERE r.id = v_registration.id
      AND COALESCE(r.organisation_id, p.organisation_id)
          IN (SELECT id FROM organisation_tree)
  ) THEN
    RAISE EXCEPTION 'This registration is outside the permitted organisation scope.';
  END IF;

  -- 6. Status validation.
  IF p_status NOT IN ('draft', 'final') THEN
    RAISE EXCEPTION 'Mark status must be draft or final.';
  END IF;

  -- 7. Final marks remain immutable. If a final entry already exists for this
  --    judge/schedule/registration, reject the write before it reaches the
  --    scoring trigger.
  IF p_status = 'final' THEN
    SELECT me.id
    INTO v_existing_final_id
    FROM public.mark_entries me
    WHERE me.schedule_id = v_token.schedule_id
      AND me.judge_id = v_token.judge_id
      AND me.registration_id = v_registration.id
      AND me.is_final = true
    LIMIT 1;

    IF v_existing_final_id IS NOT NULL THEN
      RAISE EXCEPTION 'Final marks have already been submitted for this participant.';
    END IF;
  END IF;

  -- 8. Write the mark. Scoring shape/range validation and final immutability
  --    are enforced by the existing validate_mark_entry_scoring trigger, which
  --    runs before this insert/update. The authorising token row id is stored
  --    for audit; the plaintext token is never persisted here.
  WITH saved_mark AS (
    INSERT INTO public.mark_entries (
      tenant_id,
      schedule_id,
      judge_id,
      registration_id,
      criteria_scores,
      total_mark,
      entry_mode_snapshot,
      max_mark_snapshot,
      criteria_snapshot,
      is_draft,
      is_final,
      submitted_at,
      token_id,
      updated_at
    ) VALUES (
      v_token.tenant_id,
      v_token.schedule_id,
      v_token.judge_id,
      v_registration.id,
      COALESCE(p_criteria_scores, '{}'::jsonb),
      p_total_mark,
      CASE WHEN p_entry_mode = 'total_only' THEN 'total_only' ELSE 'criteria' END,
      COALESCE(p_max_mark, 100),
      COALESCE(p_criteria_snapshot, '[]'::jsonb),
      (p_status = 'draft'),
      (p_status = 'final'),
      CASE WHEN p_status = 'final' THEN now() ELSE NULL END,
      v_token.id,
      now()
    )
    ON CONFLICT (schedule_id, judge_id, registration_id)
    DO UPDATE SET
      criteria_scores = EXCLUDED.criteria_scores,
      total_mark = EXCLUDED.total_mark,
      entry_mode_snapshot = EXCLUDED.entry_mode_snapshot,
      max_mark_snapshot = EXCLUDED.max_mark_snapshot,
      criteria_snapshot = EXCLUDED.criteria_snapshot,
      is_draft = EXCLUDED.is_draft,
      is_final = EXCLUDED.is_final,
      submitted_at = COALESCE(public.mark_entries.submitted_at, EXCLUDED.submitted_at),
      token_id = EXCLUDED.token_id,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  )
  SELECT jsonb_build_object(
    'id', m.id,
    'schedule_id', m.schedule_id,
    'judge_id', m.judge_id,
    'registration_id', m.registration_id,
    'is_draft', m.is_draft,
    'is_final', m.is_final,
    'total_mark', m.total_mark,
    'updated_at', m.updated_at
  ) INTO v_result
  FROM saved_mark m;

  RETURN v_result;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
