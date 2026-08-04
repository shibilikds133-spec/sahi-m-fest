-- ============================================================================
-- MIGRATION 102: FESTIVAL TEMPLATE FOUNDATION (BATCH 2A)
-- ============================================================================
-- STATUS: REVIEW-READY DRAFT. THIS MIGRATION HAS NEVER BEEN APPLIED.
-- This file REPLACES the obsolete, never-applied draft that shipped in this
-- workspace (which introduced `category_auto_detection` and a seven-argument
-- `finalise_tenant_provisioning` overload). The obsolete draft is fully
-- superseded below; nothing from it is retained.
--
-- SCOPE (Batch 2A only):
--   A. `tenants.festival_template`  -> tenant default; applies to new
--      festivals and to new child tenants.
--   B. `festival_calendar.festival_template` -> authoritative, immutable
--      festival snapshot taken at insert time from the owning tenant.
--   C. No client/API write path can set or change any festival template;
--      snapshots and defaults are server-side only.
--   D. New six-argument `finalise_tenant_provisioning` overload (root
--      provisioning with explicit template) delegating to the preserved
--      five-argument function.
--   E. Child tenants inherit the parent tenant's template server-side inside
--      `finalise_child_organisation_provisioning` (minimal change only).
--   F. Authorization: `PUBLIC`/`anon` denied everywhere; only `authenticated`
--      (Edge Function) may call the provisioning RPCs; ordinary tenant admins
--      cannot alter tenant defaults (no UPDATE RLS policy exists on tenants).
--
-- EXPLICITLY EXCLUDED FROM BATCH 2A (later batches): participant/registration/
-- item enforcement of template rules, festival template conversion tooling,
-- category auto-detection (REJECTED design), and any DOB/class/education
-- inference. This migration performs NO data reclassification: every existing
-- festival and every tenant created outside the template-aware provisioning
-- path remains `sahithyolsav` (the column default).
--
-- The snapshot column is IMMUTABLE after insert (v1). There is deliberately
-- no conversion function in this batch: a future superadmin-only conversion
-- tool can UPDATE via a SECURITY DEFINER function that temporarily disables
-- `trg_festival_template_immutable`; until then any change attempt fails.
-- ============================================================================

BEGIN;

--------------------------------------------------------------------------------
-- 1. PREFLIGHT CHECKS
-- -----------------------------------------------------------------------------
-- Fail fast if the target schema does not match the reconciled history
-- (001-101) or if a partial/foreign implementation already exists. These
-- checks make accidental application against a different schema impossible.
--------------------------------------------------------------------------------
DO $$
DECLARE
  v_col_ok boolean;
  v_constraint_def text;
  v_has_non_default_rows boolean;
BEGIN
  -- 1a. tenants.festival_template must not already exist with an
  --     incompatible definition (type/default/nullability).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'festival_template'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
        AND column_name = 'festival_template'
        AND data_type = 'text'
        AND is_nullable = 'NO'
        AND column_default = '''sahithyolsav''::text'
    ) INTO v_col_ok;
    IF NOT v_col_ok THEN
      RAISE EXCEPTION 'Pre-existing tenants.festival_template is incompatible with migration 102 (expected text NOT NULL DEFAULT ''sahithyolsav'')';
    END IF;
  END IF;

  -- 1b. Same compatibility requirement for festival_calendar.festival_template.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'festival_calendar'
      AND column_name = 'festival_template'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'festival_calendar'
        AND column_name = 'festival_template'
        AND data_type = 'text'
        AND is_nullable = 'NO'
        AND column_default = '''sahithyolsav''::text'
    ) INTO v_col_ok;
    IF NOT v_col_ok THEN
      RAISE EXCEPTION 'Pre-existing festival_calendar.festival_template is incompatible with migration 102 (expected text NOT NULL DEFAULT ''sahithyolsav'')';
    END IF;
  END IF;

  -- 1c. If a named CHECK constraint already exists it must be exactly ours
  --     (never silently absorb a foreign constraint definition).
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'ck_tenants_festival_template'
    AND conrelid = 'public.tenants'::regclass;
  IF v_constraint_def IS NOT NULL
     AND v_constraint_def <> 'CHECK ((festival_template = ANY (ARRAY[''sahithyolsav''::text, ''college_fest''::text])))' THEN
    RAISE EXCEPTION 'Existing CHECK constraint ck_tenants_festival_template has an unexpected definition: %', v_constraint_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'ck_festival_calendar_festival_template'
    AND conrelid = 'public.festival_calendar'::regclass;
  IF v_constraint_def IS NOT NULL
     AND v_constraint_def <> 'CHECK ((festival_template = ANY (ARRAY[''sahithyolsav''::text, ''college_fest''::text])))' THEN
    RAISE EXCEPTION 'Existing CHECK constraint ck_festival_calendar_festival_template has an unexpected definition: %', v_constraint_def;
  END IF;

  -- 1d. Data-state guard: no festival template other than the default may
  --     already exist (this migration was never applied; `college_fest`
  --     before this point would indicate a foreign/partial implementation).
  --     The columns are created later in this migration, so the existence of
  --     each column is checked first and the actual data probe runs only via
  --     constant dynamic SQL (EXECUTE ... USING) inside the exists-branch;
  --     column resolution is deferred and the parser never sees a static
  --     reference to a column that may not exist yet.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'festival_template'
  ) THEN
    EXECUTE
      'SELECT EXISTS (
         SELECT 1
         FROM public.tenants
         WHERE festival_template IS DISTINCT FROM $1
       )'
      INTO v_has_non_default_rows
      USING 'sahithyolsav';

    IF v_has_non_default_rows THEN
      RAISE EXCEPTION 'Migration 102 was never applied, but tenants.festival_template is already set to a non-default value';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'festival_calendar'
      AND column_name = 'festival_template'
  ) THEN
    EXECUTE
      'SELECT EXISTS (
         SELECT 1
         FROM public.festival_calendar
         WHERE festival_template IS DISTINCT FROM $1
       )'
      INTO v_has_non_default_rows
      USING 'sahithyolsav';

    IF v_has_non_default_rows THEN
      RAISE EXCEPTION 'Migration 102 was never applied, but festival_calendar.festival_template is already set to a non-default value';
    END IF;
  END IF;

  -- 1e. Dependencies on the reconciled history (001-101) must exist, so a
  --     missing migration is caught here instead of at runtime.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'finalise_tenant_provisioning'
      AND pg_get_function_identity_arguments(oid) = 'uuid, uuid, text, text, text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: five-argument finalise_tenant_provisioning not found (is migration 100 applied?)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'finalise_child_organisation_provisioning'
      AND pg_get_function_identity_arguments(oid) = 'uuid, uuid, text, text, text, text'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: finalise_child_organisation_provisioning not found (is migration 100 applied?)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'organisation_id'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: tenants.organisation_id not found (is migration 029 applied?)';
  END IF;

  -- 1f. Objects this migration creates must not already exist (a partial
  --     application of 102 or an unrelated collision must fail loudly).
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'finalise_tenant_provisioning'
      AND pg_get_function_identity_arguments(oid) = 'uuid, uuid, text, text, text, text'
  ) THEN
    RAISE EXCEPTION 'Unexpected pre-existing six-argument finalise_tenant_provisioning overload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('snapshot_festival_template_from_tenant', 'reject_festival_template_change')
  ) THEN
    RAISE EXCEPTION 'Unexpected pre-existing migration-102 helper function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname IN ('trg_festival_template_snapshot', 'trg_festival_template_immutable')
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Unexpected pre-existing migration-102 trigger';
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 2. tenants.festival_template
-- -----------------------------------------------------------------------------
-- Tenant-level default template. Used by the festival snapshot trigger and by
-- child-tenant inheritance. Only the provisioning path (SECURITY DEFINER)
-- writes it; no UPDATE RLS policy exists on tenants, so ordinary tenant
-- admins cannot change it. Root tenants provisioned without an explicit
-- template (the preserved five-argument function) fall back to this default.
--------------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS festival_template text NOT NULL DEFAULT 'sahithyolsav';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_tenants_festival_template'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT ck_tenants_festival_template
      CHECK (festival_template IN ('sahithyolsav', 'college_fest'));
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 3. festival_calendar.festival_template (authoritative snapshot)
-- -----------------------------------------------------------------------------
-- This column is the authoritative template for a festival. Existing rows
-- (all `sahithyolsav` per section 1d) are untouched; the snapshot is taken
-- server-side at insert time and is immutable afterwards.
--------------------------------------------------------------------------------
ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS festival_template text NOT NULL DEFAULT 'sahithyolsav';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_festival_calendar_festival_template'
      AND conrelid = 'public.festival_calendar'::regclass
  ) THEN
    ALTER TABLE public.festival_calendar
      ADD CONSTRAINT ck_festival_calendar_festival_template
      CHECK (festival_template IN ('sahithyolsav', 'college_fest'));
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 4. SERVER-SIDE SNAPSHOT ON INSERT
-- -----------------------------------------------------------------------------
-- A BEFORE INSERT trigger resolves the owning tenant's default template at
-- insert time and unconditionally overrides any client-supplied value, so
-- the client can never choose a template. Global festivals (tenant_id NULL,
-- handbook data) remain `sahithyolsav`. The template is snapshot-only: a
-- later change of `tenant_id` does NOT re-snapshot (superadmin-only edge;
-- the snapshot stays at the insert-time template).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_festival_template_from_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_template text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      SELECT festival_template INTO v_template
      FROM public.tenants
      WHERE id = NEW.tenant_id;

      IF v_template IS NULL THEN
        RAISE EXCEPTION 'Cannot snapshot festival template: owning tenant % not found', NEW.tenant_id;
      END IF;

      NEW.festival_template := v_template;
    ELSE
      NEW.festival_template := 'sahithyolsav';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_festival_template_snapshot
  BEFORE INSERT ON public.festival_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_festival_template_from_tenant();

--------------------------------------------------------------------------------
-- 5. SNAPSHOT IMMUTABILITY
-- -----------------------------------------------------------------------------
-- Rejects any attempt to change the snapshot after insert. Upserts that
-- re-supply the identical value (PostgREST on_conflict) are allowed as a
-- no-op; any real change raises. There is intentionally no conversion
-- function in this batch (see header): conversion tooling is a later batch
-- and will disable this trigger inside a SECURITY DEFINER function.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_festival_template_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.festival_template IS DISTINCT FROM OLD.festival_template THEN
    RAISE EXCEPTION 'festival_calendar.festival_template is immutable; template conversion is not available in the current release';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_festival_template_immutable
  BEFORE UPDATE OF festival_template ON public.festival_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_festival_template_change();

--------------------------------------------------------------------------------
-- 6. ROOT PROVISIONING WITH EXPLICIT TEMPLATE (SIX ARGUMENTS)
-- -----------------------------------------------------------------------------
-- New six-argument overload of finalise_tenant_provisioning (without defaults). The preserved five-argument
-- function is untouched and remains the resolution target for all existing
-- callers (exact-signature match wins), so legacy callers stay Sahithyolsav
-- via the column default.
--
-- Behavior of the six-argument overload:
--   * validates the template against the allow-list;
--   * delegates to the preserved five-argument function (which enforces the
--     superadmin check, idempotency, ownership and compensation);
--   * sets tenants.festival_template for the provisioned tenant;
--   * NEVER silently changes the template of an ALREADY-completed operation
--     once dependent festival data exists for that tenant (retry guard);
--   * appends 'festival_template' to the returned JSON.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalise_tenant_provisioning(
  p_org_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_idempotency_key text,
  p_festival_template text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_tenant_id uuid;
  v_dependent_exists boolean;
BEGIN
  IF p_festival_template NOT IN ('sahithyolsav', 'college_fest') THEN
    RAISE EXCEPTION 'Invalid festival_template: %', p_festival_template;
  END IF;

  v_result := public.finalise_tenant_provisioning(
    p_org_id,
    p_user_id,
    p_org_name,
    p_org_type,
    p_idempotency_key
  );

  v_tenant_id := (v_result->>'tenant_id')::uuid;

  -- Retry guard: an already-completed provisioning must not silently move a
  -- tenant to a different template once festival data exists.
  IF v_result->>'message' = 'Already completed' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.festival_calendar WHERE tenant_id = v_tenant_id
    ) INTO v_dependent_exists;

    IF v_dependent_exists THEN
      RAISE EXCEPTION 'Cannot change festival template: festival data already exists for tenant %', v_tenant_id;
    END IF;
  END IF;

  UPDATE public.tenants
     SET festival_template = p_festival_template
   WHERE id = v_tenant_id;

  RETURN v_result || jsonb_build_object('festival_template', p_festival_template);
END;
$$;

--------------------------------------------------------------------------------
-- 7. CHILD TENANT INHERITANCE
-- -----------------------------------------------------------------------------
-- finalise_child_organisation_provisioning is replaced with a verbatim copy
-- of the effective definition from migration 100 (identical authorization,
-- hierarchy, idempotency and compensation behavior) plus ONE minimal change:
-- the tenant INSERT now sources festival_template from the parent tenant
-- server-side. The parent tenant is already resolved earlier in the same
-- function, so this is deterministic and never trusts a client value.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalise_child_organisation_provisioning(
  p_parent_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_username text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_op jsonb;
  v_db_op public.tenant_provisioning_operations;
  v_parent_tenant uuid;
  v_parent_tenant_disabled boolean;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
  v_parent jsonb;
  v_parent_archived timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Lock operation
    SELECT * INTO v_db_op
    FROM public.tenant_provisioning_operations
    WHERE operation_type = 'child_organisation' AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Enforce ownership
      IF v_db_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: operation belongs to another user';
      END IF;

      IF v_db_op.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', true,
          'operation_id', v_db_op.id,
          'status', 'completed',
          'tenant_id', v_db_op.target_tenant_id,
          'org_id', v_db_op.target_organisation_id,
          'parent_id', p_parent_id,
          'target_user_id', v_db_op.target_user_id,
          'message', 'Already completed'
        );
      END IF;

      -- Enforce immutable target_user_id if already set
      IF v_db_op.target_user_id IS NOT NULL AND v_db_op.target_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation target user ID cannot change';
      END IF;
    END IF;
  END IF;

  v_op := public._provisioning_get_op('child_organisation', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_new_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;
  IF v_op IS NOT NULL AND (v_op->>'target_organisation_id') IS NOT NULL THEN
    v_new_org_id := (v_op->>'target_organisation_id')::uuid;
  END IF;

  v_parent := public._provisioning_get_org(p_parent_id);
  v_parent_tenant := (v_parent->>'tenant_id')::uuid;

  -- Check parent is not archived
  SELECT archived_at INTO v_parent_archived
  FROM public.organisations WHERE id = p_parent_id;
  IF v_parent_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Permission denied: parent organisation is archived';
  END IF;

  -- Hierarchy + tenant-enabled authorization (superadmin bypasses).
  IF NOT public.is_superadmin() THEN
    IF public.get_my_tenant_id() IS NULL THEN
      RAISE EXCEPTION 'Permission denied: tenant access required';
    END IF;
    IF NOT public.is_org_visible(p_parent_id) THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
    END IF;
  END IF;

  IF v_parent_tenant IS NULL THEN
    RAISE EXCEPTION 'Parent organisation is not linked to a tenant';
  END IF;
  SELECT COALESCE(access_disabled, false) INTO v_parent_tenant_disabled
  FROM public.tenants WHERE id = v_parent_tenant;
  IF v_parent_tenant_disabled THEN
    RAISE EXCEPTION 'Permission denied: parent tenant access is disabled';
  END IF;

  IF v_new_org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.organisations WHERE lower(admin_email) = lower(p_username)
  ) THEN
    RAISE EXCEPTION 'Username already in use';
  END IF;

  IF v_new_tenant_id IS NULL THEN
    -- Batch 2A change: inherit the parent tenant's festival template
    -- server-side. The parent tenant is guaranteed to exist (checked above)
    -- and its festival_template is NOT NULL; COALESCE is belt-and-braces.
    INSERT INTO public.tenants (name, org_type, subscription_status, festival_template)
    SELECT p_org_name, p_org_type, 'active',
           COALESCE(parent_t.festival_template, 'sahithyolsav')
    FROM public.tenants parent_t
    WHERE parent_t.id = v_parent_tenant
    RETURNING id INTO v_new_tenant_id;
  END IF;

  IF v_new_org_id IS NULL THEN
    INSERT INTO public.organisations (tenant_id, name, org_type, parent_id, admin_email)
    VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)
    RETURNING id INTO v_new_org_id;
    UPDATE public.tenants SET organisation_id = v_new_org_id
      WHERE id = v_new_tenant_id;
  END IF;

  PERFORM public._provisioning_link_profile(p_user_id, v_new_tenant_id, p_org_name || ' Admin');

  v_op_id := public._provisioning_upsert_op(
    'child_organisation', p_idempotency_key, 'completed', v_uid,
    v_new_org_id, v_new_tenant_id, p_user_id, p_username
  );

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid,
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_new_tenant_id, v_new_org_id,
    'child_organisation_provisioned', 'Child organisation provisioning finalised',
    jsonb_build_object('tenant_id', NULL, 'org_id', NULL),
    jsonb_build_object('tenant_id', v_new_tenant_id, 'org_id', v_new_org_id,
                       'parent_id', p_parent_id, 'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_new_tenant_id,
    'org_id', v_new_org_id,
    'parent_id', p_parent_id,
    'target_user_id', p_user_id,
    'message', 'Child organisation provisioning completed'
  );
EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL AND v_op_id IS NULL THEN
    BEGIN
      PERFORM public._provisioning_upsert_op(
        'child_organisation', p_idempotency_key, 'failed', v_uid,
        v_new_org_id, v_new_tenant_id, p_user_id, p_username, SQLSTATE
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$$;

--------------------------------------------------------------------------------
-- 8. AUTHORIZATION / GRANTS
-- -----------------------------------------------------------------------------
-- Every RPC entry point: denied for PUBLIC and anon; callable by
-- authenticated only (the provision-admin Edge Function calls these as the
-- signed-in user). The trigger helper functions are fire-and-forget via
-- triggers; direct execution is revoked everywhere.
-- Note: tenants has no UPDATE RLS policy, so tenant admins cannot change
-- their own default template through the API; the snapshot/immutability
-- triggers additionally protect the service-role path on festival_calendar.
--------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.snapshot_festival_template_from_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.snapshot_festival_template_from_tenant() FROM anon;
REVOKE ALL ON FUNCTION public.snapshot_festival_template_from_tenant() FROM authenticated;

REVOKE ALL ON FUNCTION public.reject_festival_template_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_festival_template_change() FROM anon;
REVOKE ALL ON FUNCTION public.reject_festival_template_change() FROM authenticated;

COMMIT;

-- END OF MIGRATION 102
