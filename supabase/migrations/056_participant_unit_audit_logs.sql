-- ============================================================
-- Migration 055: Safe Bulk Unit Reassignment System
-- ============================================================

-- 1. Structural changes on participants table
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS lock_scope text, -- results, judging, certificate, manual, export
ADD COLUMN IF NOT EXISTS lock_reason text,
ADD COLUMN IF NOT EXISTS import_source text; -- portal_import, manual, csv, api_sync

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_participants_org_category 
ON public.participants(organisation_id, category_code);

CREATE INDEX IF NOT EXISTS idx_registrations_participant 
ON public.registrations(participant_id);

-- 3. Create participant_unit_batches table
CREATE TABLE public.participant_unit_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, rolled_back, failed, partial
  total_records int DEFAULT 0,
  success_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  skipped_count int DEFAULT 0,
  skip_reasons jsonb DEFAULT '[]'::jsonb,
  processed_count int DEFAULT 0,
  last_processed_participant_id uuid,
  created_by uuid,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_unit_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  rolled_back_at timestamptz,
  rollback_batch_id uuid,
  notes text
);

-- Index for tenant query performance
CREATE INDEX IF NOT EXISTS idx_participant_unit_batches_tenant_id 
ON public.participant_unit_batches(tenant_id);

-- 4. Create participant_unit_audit_logs table
CREATE TABLE public.participant_unit_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  old_unit_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  new_unit_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  changed_by uuid,
  changed_at timestamptz DEFAULT now(),
  batch_id uuid NOT NULL REFERENCES public.participant_unit_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_reverted boolean DEFAULT false,
  reverted_at timestamptz,
  reverted_by uuid
);

-- Duplicate execution guard index (unique per participant per batch)
CREATE UNIQUE INDEX IF NOT EXISTS unique_batch_participant 
ON public.participant_unit_audit_logs (batch_id, participant_id);

-- Index for audit logs lookup performance
CREATE INDEX IF NOT EXISTS idx_participant_unit_audit_logs_batch_id 
ON public.participant_unit_audit_logs(batch_id);

-- 5. Create system_events table
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- BULK_UNIT_REASSIGNMENT_STARTED, BULK_UNIT_REASSIGNMENT_COMPLETED, ROLLBACK_PARTIAL, ROLLBACK_FAILED
  event_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- Index for system events lookup
CREATE INDEX IF NOT EXISTS idx_system_events_tenant_id 
ON public.system_events(tenant_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.participant_unit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_unit_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies
-- Batches
CREATE POLICY "Select policy for participant_unit_batches" ON public.participant_unit_batches
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "Insert policy for participant_unit_batches" ON public.participant_unit_batches
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "Update policy for participant_unit_batches" ON public.participant_unit_batches
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- Audit Logs
CREATE POLICY "Select policy for participant_unit_audit_logs" ON public.participant_unit_audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "Insert policy for participant_unit_audit_logs" ON public.participant_unit_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "Update policy for participant_unit_audit_logs" ON public.participant_unit_audit_logs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- System Events
CREATE POLICY "Select policy for system_events" ON public.system_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "Insert policy for system_events" ON public.system_events
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- 8. Stored Procedures (RPCs)

-- A. Preview RPC
CREATE OR REPLACE FUNCTION public.preview_bulk_unit_assignment(
  p_participant_ids uuid[],
  p_target_unit_id uuid,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  chest_number text,
  category_code text,
  organisation_id uuid,
  is_locked boolean,
  lock_scope text,
  lock_reason text,
  integrity_hash text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
BEGIN
  -- Verify target organisation belongs to the selected tenant hierarchy
  IF NOT (
    public.is_superadmin() OR 
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p_target_unit_id)
  ) THEN
    RAISE EXCEPTION 'Target organisation does not belong to the selected tenant hierarchy';
  END IF;

  -- Verify caller manages target organisation
  IF NOT (public.is_superadmin() OR public.is_org_visible(p_target_unit_id)) THEN
    RAISE EXCEPTION 'Permission denied: Cannot read target organisation';
  END IF;

  RETURN QUERY
  SELECT 
    p.id, 
    p.name, 
    p.chest_number, 
    p.category_code, 
    p.organisation_id, 
    p.is_locked,
    p.lock_scope,
    p.lock_reason,
    md5(
      coalesce(p.id::text, '') || 
      coalesce(p.updated_at::text, '') || 
      coalesce(p.name, '') || 
      coalesce(p.chest_number, '') || 
      coalesce(p.category_code, '') || 
      coalesce(p.organisation_id::text, '')
    ) AS integrity_hash
  FROM participants p
  WHERE p.id = any(p_participant_ids)
  AND (
    public.is_superadmin() OR 
    p.organisation_id IS NULL OR
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p.organisation_id)
  );
END;
$$;

-- B. Execute Batch RPC
CREATE OR REPLACE FUNCTION public.execute_bulk_unit_assignment(
  p_participant_ids uuid[],
  p_expected_hashes text[],
  p_target_unit_id uuid,
  p_batch_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_expected_hash text;
  v_actual_hash text;
  v_updated_count int := 0;
  v_skipped_count int := 0;
  v_failed_count int := 0;
  v_participant_record record;
  v_target_org_tenant_id uuid;
  v_changed_by uuid;
  i int;
BEGIN
  -- Get active user ID
  v_changed_by := auth.uid();

  -- 1. Server-side validation: Verify user manages target organisation
  IF NOT (public.is_superadmin() OR public.is_org_visible(p_target_unit_id)) THEN
    RAISE EXCEPTION 'Permission denied: Cannot reassign to target organisation';
  END IF;

  -- 2. Verify target organisation belongs to the selected tenant hierarchy
  SELECT tenant_id INTO v_target_org_tenant_id FROM organisations o WHERE o.id = p_target_unit_id;
  IF NOT (
    public.is_superadmin() OR 
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p_target_unit_id)
  ) THEN
    RAISE EXCEPTION 'Target organisation does not belong to the selected tenant hierarchy';
  END IF;

  -- 3. Loop and update with locking & validation
  FOR i IN 1..array_length(p_participant_ids, 1) LOOP
    v_pid := p_participant_ids[i];
    v_expected_hash := p_expected_hashes[i];

    -- Select with lock to avoid race conditions (FOR UPDATE SKIP LOCKED)
    SELECT id, name, category_code, chest_number, organisation_id, is_locked, tenant_id, updated_at
    INTO v_participant_record
    FROM participants
    WHERE id = v_pid
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Validate that the caller manages the participant's current organisation
    IF NOT (
      public.is_superadmin() OR 
      v_participant_record.organisation_id IS NULL OR
      EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = v_participant_record.organisation_id)
    ) THEN
      v_failed_count := v_failed_count + 1;
      CONTINUE;
    END IF;

    -- Validate integrity hash
    v_actual_hash := md5(
      coalesce(v_participant_record.id::text, '') ||
      coalesce(v_participant_record.updated_at::text, '') ||
      coalesce(v_participant_record.name, '') ||
      coalesce(v_participant_record.chest_number, '') ||
      coalesce(v_participant_record.category_code, '') ||
      coalesce(v_participant_record.organisation_id::text, '')
    );

    IF v_actual_hash IS DISTINCT FROM v_expected_hash THEN
      RAISE EXCEPTION 'Data integrity check failed: Participant data mutated during reassignment.';
    END IF;

    -- If locked, skip
    IF v_participant_record.is_locked THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- If already in target unit, skip
    IF v_participant_record.organisation_id = p_target_unit_id THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Log audit entry
    INSERT INTO participant_unit_audit_logs (
      participant_id,
      old_unit_id,
      new_unit_id,
      changed_by,
      batch_id,
      tenant_id
    ) VALUES (
      v_pid,
      v_participant_record.organisation_id,
      p_target_unit_id,
      v_changed_by,
      p_batch_id,
      p_tenant_id
    );

    -- Update participant unit and tenant
    UPDATE participants
    SET organisation_id = p_target_unit_id,
        tenant_id = v_target_org_tenant_id,
        updated_at = now()
    WHERE id = v_pid;

    -- Update registrations unit and tenant
    UPDATE registrations
    SET organisation_id = p_target_unit_id,
        tenant_id = v_target_org_tenant_id
    WHERE participant_id = v_pid;

    -- Touch old organisation to trigger realtime / cache bump
    IF v_participant_record.organisation_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_participant_record.organisation_id;
    END IF;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  -- Touch target organisation to trigger realtime / cache bump
  UPDATE organisations SET name = name WHERE id = p_target_unit_id;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'batch_id', p_batch_id
  );
END;
$$;

-- C. Rollback RPC
CREATE OR REPLACE FUNCTION public.rollback_unit_assignment(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log record;
  v_reverted_count int := 0;
  v_skipped_count int := 0;
  v_batch_status text;
  v_changed_by uuid;
  v_skip_reasons jsonb := '[]'::jsonb;
BEGIN
  -- Get active user ID
  v_changed_by := auth.uid();

  -- 1. Check if the batch is already rolled back
  SELECT status INTO v_batch_status FROM participant_unit_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch_status = 'rolled_back' THEN
    RAISE EXCEPTION 'Rollback failed: Batch has already been rolled back';
  END IF;

  -- 2. Loop through the audit logs for this batch (FOR UPDATE SKIP LOCKED)
  FOR v_log IN 
    SELECT l.id, l.participant_id, l.old_unit_id, l.new_unit_id, p.name, p.is_locked, p.lock_scope, p.lock_reason
    FROM participant_unit_audit_logs l
    JOIN participants p ON p.id = l.participant_id
    WHERE l.batch_id = p_batch_id AND l.is_reverted = false
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Double check if participant is locked
    IF v_log.is_locked THEN
      v_skipped_count := v_skipped_count + 1;
      -- Append to reasons
      v_skip_reasons := v_skip_reasons || jsonb_build_object(
        'participant_id', v_log.participant_id,
        'name', v_log.name,
        'reason', coalesce(v_log.lock_reason, 'Locked') || ' (' || coalesce(v_log.lock_scope, 'all') || ')'
      );
      CONTINUE;
    END IF;

    -- Update participant back to old unit
    UPDATE participants
    SET organisation_id = v_log.old_unit_id,
        tenant_id = (SELECT tenant_id FROM organisations WHERE id = v_log.old_unit_id),
        updated_at = now()
    WHERE id = v_log.participant_id;

    -- Update registrations back to old unit
    UPDATE registrations
    SET organisation_id = v_log.old_unit_id,
        tenant_id = (SELECT tenant_id FROM organisations WHERE id = v_log.old_unit_id)
    WHERE participant_id = v_log.participant_id;

    -- Touch old and new organisations to trigger realtime / cache bump
    IF v_log.old_unit_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_log.old_unit_id;
    END IF;
    IF v_log.new_unit_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_log.new_unit_id;
    END IF;

    -- Mark this specific audit log row as reverted
    UPDATE participant_unit_audit_logs
    SET is_reverted = true,
        reverted_at = now(),
        reverted_by = v_changed_by
    WHERE id = v_log.id;

    v_reverted_count := v_reverted_count + 1;
  END LOOP;

  -- 3. Update the batch status
  UPDATE participant_unit_batches
  SET status = CASE 
                 WHEN v_skipped_count > 0 THEN 'partial'
                 ELSE 'rolled_back'
               END,
      rolled_back_at = now(),
      completed_at = now(),
      skipped_count = v_skipped_count,
      skip_reasons = v_skip_reasons
  WHERE id = p_batch_id;

  -- Log system event
  INSERT INTO system_events (
    event_type,
    event_metadata,
    created_by,
    tenant_id
  )
  SELECT 
    CASE WHEN v_skipped_count > 0 THEN 'ROLLBACK_PARTIAL' ELSE 'ROLLBACK_COMPLETED' END,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'reverted_count', v_reverted_count,
      'skipped_count', v_skipped_count,
      'skip_reasons', v_skip_reasons
    ),
    v_changed_by,
    tenant_id
  FROM participant_unit_batches
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'reverted_count', v_reverted_count,
    'skipped_count', v_skipped_count,
    'skip_reasons', v_skip_reasons
  );
END;
$$;

-- Reload schema
NOTIFY pgrst, 'reload schema';
