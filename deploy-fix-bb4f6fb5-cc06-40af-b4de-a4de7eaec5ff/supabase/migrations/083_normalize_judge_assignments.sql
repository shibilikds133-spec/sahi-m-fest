-- Normalize schedule judge assignments and make expected_judge_count the
-- single source of truth for panel capacity and marks readiness.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS expected_judge_count int NOT NULL DEFAULT 3;

ALTER TABLE public.judge_tokens
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS original_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'created';

UPDATE public.judge_tokens
SET token_hash = encode(
  extensions.digest(upper(trim(token)), 'sha256'),
  'hex'
)
WHERE token IS NOT NULL
  AND token_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_judge_tokens_hash
  ON public.judge_tokens (token_hash)
  WHERE is_revoked IS NOT TRUE;

CREATE TABLE IF NOT EXISTS public.schedule_judge_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  judge_id uuid NOT NULL REFERENCES public.judges(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  removed_at timestamptz,
  removed_by uuid,
  removal_reason text,
  UNIQUE (schedule_id, judge_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_judge_assignments_active
  ON public.schedule_judge_assignments (schedule_id, tenant_id)
  WHERE status = 'active';

ALTER TABLE public.schedule_judge_assignments ENABLE ROW LEVEL SECURITY;

DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'schedule_judge_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.schedule_judge_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mark_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.mark_entries;
  END IF;
END;
$realtime$;

DROP POLICY IF EXISTS "Tenant members can read schedule judge assignments"
  ON public.schedule_judge_assignments;
CREATE POLICY "Tenant members can read schedule judge assignments"
ON public.schedule_judge_assignments FOR SELECT TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

DROP POLICY IF EXISTS "Tenant admins can manage schedule judge assignments"
  ON public.schedule_judge_assignments;
CREATE POLICY "Tenant admins can manage schedule judge assignments"
ON public.schedule_judge_assignments FOR ALL TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
)
WITH CHECK (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

-- Backfill legacy judge_panel_id data. Older databases may have this column as
-- uuid while newer/manual databases may store JSON/JSONB arrays.
DO $backfill$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'schedules'
    AND c.column_name = 'judge_panel_id';

  IF v_data_type = 'uuid' THEN
    EXECUTE $sql$
      INSERT INTO public.schedule_judge_assignments
        (tenant_id, schedule_id, judge_id, status)
      SELECT s.tenant_id, s.id, s.judge_panel_id, 'active'
      FROM public.schedules s
      WHERE s.judge_panel_id IS NOT NULL
      ON CONFLICT (schedule_id, judge_id)
      DO UPDATE SET status = 'active', removed_at = NULL, removed_by = NULL
    $sql$;
  ELSIF v_data_type IN ('json', 'jsonb') THEN
    EXECUTE $sql$
      INSERT INTO public.schedule_judge_assignments
        (tenant_id, schedule_id, judge_id, status)
      SELECT s.tenant_id, s.id, panel.judge_id::uuid, 'active'
      FROM public.schedules s
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(s.judge_panel_id)) = 'array'
            THEN to_jsonb(s.judge_panel_id)
          ELSE jsonb_build_array(to_jsonb(s.judge_panel_id))
        END
      ) AS panel(judge_id)
      WHERE s.judge_panel_id IS NOT NULL
        AND panel.judge_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ON CONFLICT (schedule_id, judge_id)
      DO UPDATE SET status = 'active', removed_at = NULL, removed_by = NULL
    $sql$;
  ELSIF v_data_type = 'ARRAY' THEN
    EXECUTE $sql$
      INSERT INTO public.schedule_judge_assignments
        (tenant_id, schedule_id, judge_id, status)
      SELECT s.tenant_id, s.id, legacy.judge_id, 'active'
      FROM public.schedules s
      CROSS JOIN LATERAL unnest(s.judge_panel_id) AS legacy(judge_id)
      WHERE legacy.judge_id IS NOT NULL
      ON CONFLICT (schedule_id, judge_id)
      DO UPDATE SET status = 'active', removed_at = NULL, removed_by = NULL
    $sql$;
  END IF;
END;
$backfill$;

-- Preserve assignments that were represented only by a currently active
-- access code in databases where the legacy panel column could not store an
-- array reliably.
INSERT INTO public.schedule_judge_assignments (
  tenant_id,
  schedule_id,
  judge_id,
  status
)
SELECT DISTINCT
  jt.tenant_id,
  jt.schedule_id,
  jt.judge_id,
  'active'
FROM public.judge_tokens jt
JOIN public.schedules s
  ON s.id = jt.schedule_id
 AND s.tenant_id = jt.tenant_id
JOIN public.judges j
  ON j.id = jt.judge_id
 AND j.tenant_id = jt.tenant_id
WHERE jt.schedule_id IS NOT NULL
  AND jt.is_used = false
  AND jt.is_revoked IS NOT TRUE
ON CONFLICT (schedule_id, judge_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_schedule_judges(
  p_schedule_id uuid,
  p_judge_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_expected_count int;
  v_judge_ids uuid[] := COALESCE(p_judge_ids, ARRAY[]::uuid[]);
  v_removed_judge_ids uuid[];
  v_invalid_count int;
BEGIN
  SELECT s.tenant_id, s.expected_judge_count
  INTO v_tenant_id, v_expected_count
  FROM public.schedules s
  WHERE s.id = p_schedule_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage this schedule.';
  END IF;

  IF cardinality(v_judge_ids) <> (
    SELECT COUNT(DISTINCT selected.judge_id)
    FROM unnest(v_judge_ids) AS selected(judge_id)
  ) THEN
    RAISE EXCEPTION 'The panel contains duplicate judges.';
  END IF;

  IF cardinality(v_judge_ids) > v_expected_count THEN
    RAISE EXCEPTION
      'This event requires % judge(s). Remove % extra judge(s) before saving.',
      v_expected_count,
      cardinality(v_judge_ids) - v_expected_count;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_count
  FROM unnest(v_judge_ids) AS selected(selected_judge_id)
  LEFT JOIN public.judges j
    ON j.id = selected.selected_judge_id
   AND j.tenant_id = v_tenant_id
  WHERE j.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more selected judges do not belong to this tenant.';
  END IF;

  SELECT COALESCE(array_agg(a.judge_id), ARRAY[]::uuid[])
  INTO v_removed_judge_ids
  FROM public.schedule_judge_assignments a
  WHERE a.schedule_id = p_schedule_id
    AND a.status = 'active'
    AND NOT (a.judge_id = ANY(v_judge_ids));

  IF EXISTS (
    SELECT 1
    FROM public.mark_entries me
    WHERE me.schedule_id = p_schedule_id
      AND me.judge_id = ANY(v_removed_judge_ids)
      AND me.is_final = true
  ) THEN
    RAISE EXCEPTION
      'A selected judge has already submitted final marks and cannot be removed from the normal panel editor.';
  END IF;

  UPDATE public.schedule_judge_assignments
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = 'Removed by administrator'
  WHERE schedule_id = p_schedule_id
    AND status = 'active'
    AND judge_id = ANY(v_removed_judge_ids);

  UPDATE public.judge_tokens
  SET is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Judge removed from event panel',
      status = CASE
        WHEN status IN ('created', 'pending_approval', 'approved') THEN 'rejected'
        ELSE status
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = ANY(v_removed_judge_ids)
    AND is_used = false
    AND is_revoked IS NOT TRUE;

  INSERT INTO public.schedule_judge_assignments (
    tenant_id,
    schedule_id,
    judge_id,
    status,
    assigned_at,
    assigned_by,
    removed_at,
    removed_by,
    removal_reason
  )
  SELECT
    v_tenant_id,
    p_schedule_id,
    selected.selected_judge_id,
    'active',
    now(),
    auth.uid(),
    NULL,
    NULL,
    NULL
  FROM unnest(v_judge_ids) AS selected(selected_judge_id)
  ON CONFLICT (schedule_id, judge_id)
  DO UPDATE SET
    status = 'active',
    assigned_at = now(),
    assigned_by = auth.uid(),
    removed_at = NULL,
    removed_by = NULL,
    removal_reason = NULL;

  RETURN jsonb_build_object(
    'schedule_id', p_schedule_id,
    'expected_count', v_expected_count,
    'assigned_count', cardinality(v_judge_ids),
    'remaining_count', GREATEST(v_expected_count - cardinality(v_judge_ids), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_schedule_judges(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_schedule_judges(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_active_judge_assignment_for_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = NEW.schedule_id
      AND a.judge_id = NEW.judge_id
      AND a.tenant_id = NEW.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_judge_assignment_for_marks
  ON public.mark_entries;
CREATE TRIGGER trg_enforce_active_judge_assignment_for_marks
BEFORE INSERT OR UPDATE ON public.mark_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_judge_assignment_for_marks();

REVOKE ALL ON FUNCTION public.enforce_active_judge_assignment_for_marks()
  FROM PUBLIC;

-- Canonical token generator. A judge must be actively assigned before a code
-- can be created, and regenerated codes revoke every previous active code.
CREATE OR REPLACE FUNCTION public.generate_judge_token(
  p_judge_id uuid,
  p_schedule_id uuid,
  p_tenant_id uuid,
  p_created_by uuid DEFAULT NULL,
  p_force_refresh boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_existing_token text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = p_schedule_id
      AND a.judge_id = p_judge_id
      AND a.tenant_id = p_tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assign this judge to the event before generating an access code.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR p_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to generate this code.';
  END IF;

  IF NOT p_force_refresh THEN
    SELECT jt.token
    INTO v_existing_token
    FROM public.judge_tokens jt
    WHERE jt.judge_id = p_judge_id
      AND jt.schedule_id = p_schedule_id
      AND jt.tenant_id = p_tenant_id
      AND jt.is_used = false
      AND jt.is_revoked IS NOT TRUE
      AND (jt.expires_at IS NULL OR jt.expires_at > now())
    ORDER BY jt.created_at DESC
    LIMIT 1;

    IF v_existing_token IS NOT NULL THEN
      RETURN v_existing_token;
    END IF;
  ELSE
    UPDATE public.judge_tokens
    SET is_revoked = true,
        revoked_at = now(),
        revoked_by = COALESCE(p_created_by, auth.uid()),
        revocation_reason = 'Regenerated by administrator',
        status = CASE
          WHEN status IN ('created', 'pending_approval', 'approved') THEN 'rejected'
          ELSE status
        END
    WHERE judge_id = p_judge_id
      AND schedule_id = p_schedule_id
      AND tenant_id = p_tenant_id
      AND is_used = false
      AND is_revoked IS NOT TRUE;
  END IF;

  LOOP
    v_token := upper(encode(extensions.gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.judge_tokens WHERE token = v_token
    );
  END LOOP;

  v_token_hash := encode(
    extensions.digest(upper(trim(v_token)), 'sha256'),
    'hex'
  );

  INSERT INTO public.judge_tokens (
    judge_id,
    schedule_id,
    tenant_id,
    created_by,
    token,
    token_hash,
    created_at,
    is_used,
    is_revoked,
    status
  ) VALUES (
    p_judge_id,
    p_schedule_id,
    p_tenant_id,
    COALESCE(p_created_by, auth.uid()),
    v_token,
    v_token_hash,
    now(),
    false,
    false,
    'created'
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_judge_token(
  uuid, uuid, uuid, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_judge_token(
  uuid, uuid, uuid, uuid, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_judge_submission_summary(p_schedule_id uuid)
RETURNS TABLE (
  judge_id uuid,
  judge_name text,
  submitted_count bigint,
  draft_count bigint,
  total_assigned bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_regs AS (
    SELECT r.id
    FROM public.registrations r
    JOIN public.schedules s
      ON s.id = p_schedule_id
     AND r.item_id = s.item_id
    WHERE r.status IS DISTINCT FROM 'rejected'
      AND r.code_letter IS NOT NULL
  )
  SELECT
    j.id AS judge_id,
    j.name AS judge_name,
    COUNT(DISTINCT me.registration_id)
      FILTER (WHERE me.is_final = true) AS submitted_count,
    COUNT(DISTINCT me.registration_id)
      FILTER (WHERE me.is_draft = true) AS draft_count,
    (SELECT COUNT(*) FROM eligible_regs)::bigint AS total_assigned
  FROM public.schedule_judge_assignments a
  JOIN public.judges j ON j.id = a.judge_id
  LEFT JOIN public.mark_entries me
    ON me.judge_id = a.judge_id
   AND me.schedule_id = a.schedule_id
   AND me.registration_id IN (SELECT id FROM eligible_regs)
  WHERE a.schedule_id = p_schedule_id
    AND a.status = 'active'
    AND (
      a.tenant_id = public.get_my_tenant_id()
      OR public.is_superadmin()
    )
  GROUP BY j.id, j.name;
$$;

REVOKE ALL ON FUNCTION public.get_judge_submission_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_submission_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_schedule_readiness(p_schedule_id uuid)
RETURNS TABLE (
  registration_id uuid,
  code_letter text,
  submitted_count bigint,
  pending_count bigint,
  expected_count int,
  all_submitted boolean,
  readiness_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    reg.id AS registration_id,
    reg.code_letter,
    COUNT(DISTINCT me.judge_id)
      FILTER (WHERE me.is_final = true) AS submitted_count,
    GREATEST(
      s.expected_judge_count
        - COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true),
      0
    )::bigint AS pending_count,
    s.expected_judge_count AS expected_count,
    COUNT(DISTINCT a.judge_id) = s.expected_judge_count
      AND COUNT(DISTINCT me.judge_id)
        FILTER (WHERE me.is_final = true) >= s.expected_judge_count
      AS all_submitted,
    CASE
      WHEN COUNT(DISTINCT a.judge_id) = s.expected_judge_count
        AND COUNT(DISTINCT me.judge_id)
          FILTER (WHERE me.is_final = true) >= s.expected_judge_count
        THEN 'Ready for Calculation'
      WHEN COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) > 0
        THEN 'Partially Submitted'
      ELSE 'Waiting for Judges'
    END AS readiness_status
  FROM public.registrations reg
  JOIN public.schedules s
    ON s.id = p_schedule_id
   AND reg.item_id = s.item_id
  LEFT JOIN public.schedule_judge_assignments a
    ON a.schedule_id = s.id
   AND a.status = 'active'
  LEFT JOIN public.mark_entries me
    ON me.registration_id = reg.id
   AND me.schedule_id = s.id
   AND me.judge_id = a.judge_id
  WHERE reg.status IS DISTINCT FROM 'rejected'
    AND reg.code_letter IS NOT NULL
    AND (
      s.tenant_id = public.get_my_tenant_id()
      OR public.is_superadmin()
    )
  GROUP BY reg.id, reg.code_letter, s.expected_judge_count;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schedule_readiness(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_judge_management_status(p_tenant_id uuid)
RETURNS TABLE (
  schedule_id uuid,
  expected_count int,
  assigned_count bigint,
  eligible_registration_count bigint,
  completed_judge_count bigint,
  marks_completed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH schedule_base AS (
    SELECT s.id, s.item_id, s.expected_judge_count, s.status
    FROM public.schedules s
    WHERE s.tenant_id = p_tenant_id
      AND (
        s.tenant_id = public.get_my_tenant_id()
        OR public.is_superadmin()
      )
  ),
  eligible_registrations AS (
    SELECT
      sb.id AS schedule_id,
      r.id AS registration_id
    FROM schedule_base sb
    JOIN public.registrations r
      ON r.item_id = sb.item_id
     AND r.status IS DISTINCT FROM 'rejected'
     AND r.code_letter IS NOT NULL
  ),
  eligible_regs AS (
    SELECT
      sb.id AS schedule_id,
      COUNT(er.registration_id)::bigint AS eligible_count
    FROM schedule_base sb
    LEFT JOIN eligible_registrations er ON er.schedule_id = sb.id
    GROUP BY sb.id
  ),
  active_assignments AS (
    SELECT a.schedule_id, a.judge_id
    FROM public.schedule_judge_assignments a
    WHERE a.tenant_id = p_tenant_id
      AND a.status = 'active'
  ),
  judge_completion AS (
    SELECT
      aa.schedule_id,
      aa.judge_id,
      COUNT(DISTINCT me.registration_id)
        FILTER (WHERE me.is_final = true)::bigint AS final_count
    FROM active_assignments aa
    LEFT JOIN public.mark_entries me
      ON me.schedule_id = aa.schedule_id
     AND me.judge_id = aa.judge_id
     AND me.registration_id IN (
       SELECT er.registration_id
       FROM eligible_registrations er
       WHERE er.schedule_id = aa.schedule_id
     )
    GROUP BY aa.schedule_id, aa.judge_id
  ),
  panel_counts AS (
    SELECT
      sb.id AS schedule_id,
      COUNT(DISTINCT aa.judge_id)::bigint AS assigned_count,
      COUNT(DISTINCT gc.judge_id)
        FILTER (WHERE gc.final_count >= er.eligible_count AND er.eligible_count > 0)::bigint
        AS completed_judge_count
    FROM schedule_base sb
    JOIN eligible_regs er ON er.schedule_id = sb.id
    LEFT JOIN active_assignments aa ON aa.schedule_id = sb.id
    LEFT JOIN judge_completion gc
      ON gc.schedule_id = aa.schedule_id
     AND gc.judge_id = aa.judge_id
    GROUP BY sb.id, er.eligible_count
  )
  SELECT
    sb.id AS schedule_id,
    sb.expected_judge_count AS expected_count,
    pc.assigned_count,
    er.eligible_count AS eligible_registration_count,
    pc.completed_judge_count,
    (
      sb.status IN ('completed', 'published')
      OR (
        er.eligible_count > 0
        AND pc.assigned_count = sb.expected_judge_count
        AND pc.completed_judge_count >= sb.expected_judge_count
      )
      OR EXISTS (
        SELECT 1
        FROM public.results res
        WHERE res.item_id = sb.item_id
          AND (
            res.published = true
            OR res.result_status = 'published'
          )
      )
    ) AS marks_completed
  FROM schedule_base sb
  JOIN eligible_regs er ON er.schedule_id = sb.id
  JOIN panel_counts pc ON pc.schedule_id = sb.id;
$$;

REVOKE ALL ON FUNCTION public.get_judge_management_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_management_status(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
