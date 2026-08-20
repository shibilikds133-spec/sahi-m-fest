-- =============================================================================
-- Migration 093: Secure token-bound judge registrations and mark submission
-- -----------------------------------------------------------------------------
-- P0 security batch:
--   1. Judge registration access becomes token-bound. The judge portal must
--      present an approved, active, unexpired, unrevoked, unused token. The
--      judge, schedule, tenant and festival are all derived server-side from
--      that token; a client-supplied schedule id is never authoritative.
--   2. Draft and final mark writes move behind a token-bound RPC. The database
--      records the authorising token row (never the plaintext token) as an
--      audit reference on mark_entries.token_id.
--   3. Direct anonymous mark_entries writes are closed. Public/anonymous
--      SELECT/INSERT/UPDATE policies on mark_entries are dropped and the anon
--      and public roles lose table privileges.
--   4. The legacy schedule-id based registration RPC is retained for the
--      authenticated admin mark-entry screen but anon/public execution is
--      revoked and the caller must belong to the schedule tenant hierarchy.
--
-- Existing judge workflow is preserved:
--   * judge assignment checks (schedule_judge_assignments)
--   * admin token generation / regeneration / revocation
--   * approval / rejection workflow
--   * judge audit logs (judge_activity_logs, log_judge_activity)
--   * criteria and total_only scoring modes
--   * draft saving / reopening, final immutability
--   * scoring validation triggers (validate_mark_entry_scoring)
--   * active judge assignment trigger (enforce_active_judge_assignment_for_marks)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Audit reference for the token that authorised a mark write.
--    Stores only the safe internal judge_tokens row id. Plaintext tokens and
--    token hashes are never written to mark_entries.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mark_entries
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES public.judge_tokens(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.mark_entries.token_id IS
  'Judge token row that authorised this mark write (internal audit reference; never a plaintext token).';

-- ---------------------------------------------------------------------------
-- 2. Token-bound judge registration retrieval (judge portal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_token text)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  tenant_id uuid,
  code_letter text,
  participant_name text,
  chest_number text,
  photo_url text,
  category_code text,
  is_verified boolean,
  existing_mark jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  -- Token must exist, be exactly approved, unused, unrevoked and unexpired.
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

  -- The judge must remain actively assigned to the token-derived schedule.
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

  -- Schedule context is derived from the token only.
  SELECT s.tenant_id, s.festival_id, s.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules s
  WHERE s.id = v_token.schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Event schedule was not found.';
  END IF;

  SELECT t.organisation_id
  INTO v_root_org_id
  FROM public.tenants t
  WHERE t.id = v_schedule_tenant_id;

  RETURN QUERY
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
  SELECT
    registration.id,
    registration.item_id,
    registration.tenant_id,
    registration.code_letter,
    participant.name AS participant_name,
    participant.chest_number,
    participant.photo_url,
    participant.category_code,
    registration.is_verified,
    mark.existing_mark
  FROM public.registrations registration
  LEFT JOIN public.participants participant
    ON participant.id = registration.participant_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', me.id,
      'criteria_scores', me.criteria_scores,
      'total_mark', me.total_mark,
      'entry_mode_snapshot', me.entry_mode_snapshot,
      'max_mark_snapshot', me.max_mark_snapshot,
      'criteria_snapshot', me.criteria_snapshot,
      'is_draft', me.is_draft,
      'is_final', me.is_final
    ) AS existing_mark
    FROM public.mark_entries me
    WHERE me.schedule_id = v_token.schedule_id
      AND me.judge_id = v_token.judge_id
      AND me.registration_id = registration.id
    ORDER BY me.created_at DESC
    LIMIT 1
  ) mark ON true
  WHERE registration.item_id = v_schedule_item_id
    AND registration.festival_id = v_schedule_festival_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND COALESCE(
      registration.organisation_id,
      participant.organisation_id
    ) IN (SELECT id FROM organisation_tree)
  ORDER BY registration.code_letter;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_registrations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Harden the legacy schedule-id based read used by the admin mark-entry
--    screen. Anonymous/public execution is revoked and the caller must be a
--    superadmin or a member of the schedule tenant. Registrations still come
--    from the schedule's festival and permitted organisation tree, preserving
--    parent-child (Sector->Unit, Division->Sector, District->Division)
--    participation while excluding sibling and unrelated organisations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  tenant_id uuid,
  code_letter text,
  participant_name text,
  chest_number text,
  photo_url text,
  category_code text,
  is_verified boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
BEGIN
  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Schedule id is required.';
  END IF;

  SELECT s.tenant_id, s.festival_id, s.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_schedule_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view this event.';
  END IF;

  SELECT t.organisation_id
  INTO v_root_org_id
  FROM public.tenants t
  WHERE t.id = v_schedule_tenant_id;

  RETURN QUERY
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
  SELECT
    registration.id,
    registration.item_id,
    registration.tenant_id,
    registration.code_letter,
    participant.name AS participant_name,
    participant.chest_number,
    participant.photo_url,
    participant.category_code,
    registration.is_verified
  FROM public.registrations registration
  INNER JOIN public.schedules s ON s.id = p_schedule_id
  LEFT JOIN public.participants participant
    ON participant.id = registration.participant_id
  WHERE registration.item_id = v_schedule_item_id
    AND registration.festival_id = v_schedule_festival_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND COALESCE(
      registration.organisation_id,
      participant.organisation_id
    ) IN (SELECT id FROM organisation_tree)
  ORDER BY registration.code_letter;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Secure token-bound mark RPC (draft and final)
-- ---------------------------------------------------------------------------
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
  SELECT s.tenant_id, s.festival_id, s.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules s
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
      submitted_at = EXCLUDED.submitted_at,
      token_id = EXCLUDED.token_id,
      updated_at = now()
    RETURNING *
  )
  SELECT to_jsonb(saved_mark)
  INTO v_result
  FROM saved_mark;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_judge_mark(
  text, uuid, jsonb, numeric, text, text, numeric, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_judge_mark(
  text, uuid, jsonb, numeric, text, text, numeric, jsonb
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Close direct anonymous mark_entries access.
--    The judge portal now writes only through the token-bound RPC above.
--    Existing authenticated admin workflows (admin mark-entry screen, judge
--    audit, result calculation) keep their tenant/hierarchy-scoped access.
-- ---------------------------------------------------------------------------

-- Drop public/anonymous and unrestricted SELECT/INSERT/UPDATE policies.
DROP POLICY IF EXISTS "Public select for mark entries"
  ON public.mark_entries;
DROP POLICY IF EXISTS "Public insert for judge tokens"
  ON public.mark_entries;
DROP POLICY IF EXISTS "Public update for mark entries"
  ON public.mark_entries;
DROP POLICY IF EXISTS "Enable read access for all authenticated users"
  ON public.mark_entries;

-- Revoke direct table privileges from anonymous/public roles (defense in depth;
-- RLS alone would already block anonymous writes, this also blocks future
-- accidental policy re-additions at the privilege level).
REVOKE ALL ON public.mark_entries FROM anon, public;

-- Re-add an explicit tenant-scoped authenticated read so realtime judge/admin
-- screens keep working. The existing "Admins can manage mark entries" and
-- "Admins and judges can manage mark entries" policies already provide
-- tenant-scoped SELECT/INSERT/UPDATE/DELETE for authenticated members.
DROP POLICY IF EXISTS "Tenant members can read mark entries"
  ON public.mark_entries;
CREATE POLICY "Tenant members can read mark entries"
ON public.mark_entries FOR SELECT TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
