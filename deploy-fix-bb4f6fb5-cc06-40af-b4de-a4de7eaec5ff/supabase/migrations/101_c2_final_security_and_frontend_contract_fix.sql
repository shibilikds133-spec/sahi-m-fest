BEGIN;

-- 101_c2_final_security_and_frontend_contract_fix.sql
-- Forward-only correction. Migrations 099 and 100 are already live and are
-- intentionally left unchanged. This migration performs no data deletion or
-- credential mutation.

--------------------------------------------------------------------------------
-- 1. USERNAME UNIQUENESS: fail safely before adding the normalized constraint.
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organisations
    WHERE admin_email IS NOT NULL
    GROUP BY lower(btrim(admin_email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'C2 migration blocked: duplicate normalized organisation usernames exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) ~ '^[a-z0-9_]{3,40}_[0-9a-f]{4}@sahi\.local$'
    GROUP BY regexp_replace(
      lower(email),
      '_[0-9a-f]{4}@sahi\.local$',
      ''
    )
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'C2 migration blocked: ambiguous synthetic username mappings exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_unique_normalized_admin_email
  ON public.organisations (lower(btrim(admin_email)))
  WHERE admin_email IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. REMOVE THE ANONYMOUS/AUTHENTICATED SQL ENUMERATION SURFACE.
--------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.lookup_email_by_username(text)
  FROM PUBLIC, anon, authenticated;

-- Internal resolver used only by the login Edge Function through service_role.
-- It deliberately returns NULL for zero OR multiple matches, never LIMIT 1.
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_username text := lower(btrim(p_username));
  v_pattern text;
  v_match_count integer;
  v_email text;
BEGIN
  IF v_username IS NULL OR v_username !~ '^[a-z0-9_]{3,40}$' THEN
    RETURN NULL;
  END IF;

  v_pattern := replace(replace(replace(v_username, '\', '\\'), '%', '\%'), '_', '\_')
               || '\_%@sahi.local';

  SELECT count(*), min(lower(email))
    INTO v_match_count, v_email
  FROM auth.users
  WHERE lower(email) LIKE v_pattern ESCAPE '\';

  IF v_match_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO service_role;

--------------------------------------------------------------------------------
-- 3. DATABASE-BACKED LOGIN RATE LIMITING (shared across Edge workers).
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.username_login_rate_limits (
  scope text NOT NULL CHECK (scope IN ('ip', 'username')),
  subject_hash text NOT NULL CHECK (length(subject_hash) = 64),
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope, subject_hash)
);

ALTER TABLE public.username_login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.username_login_rate_limits
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_username_login_attempt(
  p_scope text,
  p_subject_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_scope NOT IN ('ip', 'username')
     OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  v_limit := CASE p_scope WHEN 'ip' THEN 30 ELSE 8 END;

  INSERT INTO public.username_login_rate_limits AS rate_limit (
    scope, subject_hash, window_started_at, attempt_count, updated_at
  ) VALUES (
    p_scope, p_subject_hash, v_now, 1, v_now
  )
  ON CONFLICT (scope, subject_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN rate_limit.window_started_at <= v_now - interval '1 minute' THEN v_now
      ELSE rate_limit.window_started_at
    END,
    attempt_count = CASE
      WHEN rate_limit.window_started_at <= v_now - interval '1 minute' THEN 1
      ELSE rate_limit.attempt_count + 1
    END,
    updated_at = v_now
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_username_login_attempt(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_username_login_attempt(text, text)
  TO service_role;

--------------------------------------------------------------------------------
-- 4. REPLACE THE UNSAFE RESET GATE WITH ONE INTERNAL, DETERMINISTIC RESOLVER.
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_reset_credential_access(uuid);

CREATE OR REPLACE FUNCTION public.resolve_reset_target(
  p_actor_id uuid,
  p_target_type text,
  p_organisation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_actor_tenant public.tenants%ROWTYPE;
  v_actor_org public.organisations%ROWTYPE;
  v_target public.organisations%ROWTYPE;
  v_target_tenant public.tenants%ROWTYPE;
  v_is_descendant boolean := false;
  v_admin_count integer;
  v_admin_user_id uuid;
  v_auth_email text;
  v_login_identifier text;
BEGIN
  IF p_actor_id IS NULL OR p_organisation_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_target_type NOT IN ('root_admin', 'child_admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TARGET_TYPE');
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_target
  FROM public.organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_target.tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_LINKED');
  END IF;

  SELECT * INTO v_target_tenant
  FROM public.tenants
  WHERE id = v_target.tenant_id;

  -- Every reset target must have an exact two-way tenant/organisation link.
  IF NOT FOUND OR v_target_tenant.organisation_id IS DISTINCT FROM v_target.id THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_LINKED');
  END IF;

  -- Target type must describe the actual hierarchy position.
  IF (p_target_type = 'root_admin' AND v_target.parent_id IS NOT NULL)
     OR (p_target_type = 'child_admin' AND v_target.parent_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TARGET_TYPE_MISMATCH');
  END IF;

  IF COALESCE(v_actor.is_superadmin, false) THEN
    -- Explicit recovery policy: superadmins may reset disabled or archived
    -- root/child tenant admins. Superadmin accounts remain ineligible below.
    NULL;
  ELSE
    -- The actual profiles CHECK constraint supports only `admin` as the
    -- privileged tenant role; admin_leader is not a valid project role.
    IF v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    SELECT * INTO v_actor_tenant
    FROM public.tenants
    WHERE id = v_actor.tenant_id;

    IF NOT FOUND OR COALESCE(v_actor_tenant.access_disabled, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DISABLED');
    END IF;

    -- Deterministic caller organisation: use tenants.organisation_id, and
    -- verify the reciprocal link. Never resolve by tenant_id + LIMIT 1.
    SELECT * INTO v_actor_org
    FROM public.organisations
    WHERE id = v_actor_tenant.organisation_id
      AND tenant_id = v_actor_tenant.id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    IF v_actor_org.archived_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARCHIVED');
    END IF;

    IF p_target_type = 'root_admin' THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    -- All descendant depths are intentionally supported. The target's
    -- ancestor chain must contain the caller; self, sibling, parent/ancestor,
    -- and unrelated organisations therefore fail.
    WITH RECURSIVE ancestor_chain AS (
      SELECT o.id, o.parent_id, ARRAY[o.id]::uuid[] AS visited
      FROM public.organisations AS o
      WHERE o.id = v_target.id
      UNION ALL
      SELECT parent.id, parent.parent_id, chain.visited || parent.id
      FROM public.organisations AS parent
      JOIN ancestor_chain AS chain ON parent.id = chain.parent_id
      WHERE NOT parent.id = ANY(chain.visited)
    )
    SELECT EXISTS (
      SELECT 1 FROM ancestor_chain
      WHERE id = v_actor_org.id AND id <> v_target.id
    ) INTO v_is_descendant;

    IF NOT v_is_descendant THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    IF v_target.archived_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARCHIVED');
    END IF;

    IF COALESCE(v_target_tenant.access_disabled, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DISABLED');
    END IF;
  END IF;

  SELECT count(*)
    INTO v_admin_count
  FROM public.profiles
  WHERE tenant_id = v_target_tenant.id
    AND role = 'admin'
    AND NOT COALESCE(is_superadmin, false);

  IF v_admin_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_ADMIN');
  ELSIF v_admin_count > 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'AMBIGUOUS_ADMIN');
  END IF;

  SELECT id INTO v_admin_user_id
  FROM public.profiles
  WHERE tenant_id = v_target_tenant.id
    AND role = 'admin'
    AND NOT COALESCE(is_superadmin, false);

  SELECT lower(email) INTO v_auth_email
  FROM auth.users
  WHERE id = v_admin_user_id;

  IF NOT FOUND OR v_auth_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_AUTH_USER');
  END IF;

  -- Child admins log in with the public username, not the synthetic email.
  v_login_identifier := CASE
    WHEN p_target_type = 'child_admin' THEN lower(btrim(v_target.admin_email))
    ELSE v_auth_email
  END;

  IF v_login_identifier IS NULL OR v_login_identifier = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_LOGIN_IDENTIFIER');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_admin_user_id,
    'actor_tenant_id', v_actor.tenant_id,
    'tenant_id', v_target_tenant.id,
    'organisation_id', v_target.id,
    'login_identifier', v_login_identifier,
    'username', CASE WHEN p_target_type = 'child_admin' THEN v_login_identifier ELSE NULL END,
    'target_type', p_target_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_reset_target(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reset_target(uuid, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
