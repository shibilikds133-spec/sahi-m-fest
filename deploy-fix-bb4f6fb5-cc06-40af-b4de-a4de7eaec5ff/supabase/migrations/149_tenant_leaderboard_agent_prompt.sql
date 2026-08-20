-- Tenant leaderboard agent contract
-- Creates a safe, versioned, copy-only prompt automatically for every tenant.
-- This migration is intentionally forward-only and does not contain secrets.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid REFERENCES public.festival_calendar(id) ON DELETE SET NULL,
  prompt_type text NOT NULL DEFAULT 'leaderboard_ui',
  prompt_version integer NOT NULL DEFAULT 1,
  prompt_text text NOT NULL,
  contract_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_agent_prompts_type_check CHECK (prompt_type = 'leaderboard_ui'),
  CONSTRAINT tenant_agent_prompts_version_check CHECK (prompt_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_tenant_leaderboard_agent_prompt
  ON public.tenant_agent_prompts (tenant_id, prompt_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tenant_agent_prompts_tenant
  ON public.tenant_agent_prompts (tenant_id, generated_at DESC);

ALTER TABLE public.tenant_agent_prompts ENABLE ROW LEVEL SECURITY;

-- Prompt text is an internal Super Admin contract. It contains identifiers and
-- endpoint names only; it is never readable by anon/public or tenant users.
DROP POLICY IF EXISTS "Superadmins read tenant agent prompts"
  ON public.tenant_agent_prompts;
CREATE POLICY "Superadmins read tenant agent prompts"
  ON public.tenant_agent_prompts FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE OR REPLACE FUNCTION public._tenant_leaderboard_agent_prompt(
  p_tenant_id uuid,
  p_festival_id uuid DEFAULT NULL,
  p_tenant_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN format($prompt$
You are implementing the public Leaderboard UI for the following tenant.

TENANT CONTEXT
- Tenant ID: %s
- Tenant name: %s
- Festival ID: %s
- Festival rule: resolve the active festival belonging to TENANT_ID when FESTIVAL_ID is null.
- Prompt version: 1

PRODUCT GOAL
Build a professional, responsive public leaderboard experience. You may redesign
the visual presentation completely: layout, cards, colors, typography, spacing,
responsive behavior, podiums, tables, charts and animations.

PARALLEL RENDERING RULE
- The existing/default Leaderboard renderer is the safe baseline and must keep
  working unchanged for every tenant.
- A custom renderer is an optional parallel layer for this tenant only.
- Never replace or remove the default renderer. If custom rendering fails, is
  disabled, or has incomplete data, fall back to the default renderer.
- Do not change public routes or existing admin/judge/team workflows.

APPROVED READ-ONLY DATA CONTRACT
- Public leaderboard: get_public_leaderboard_scoped(tenant_id, festival_id)
- Public published results: get_public_published_results_scoped(tenant_id, festival_id)
- Public settings: get_public_leaderboard_settings(tenant_id, festival_id)
- Public schedule: approved tenant/festival-scoped public schedule source
- Public chatbot: use the application server proxy only; never call a provider secret directly.

REQUIRED SAFE CONTRACT KEYS
- TENANT_ID: the exact tenant UUID above
- FESTIVAL_ID: the exact festival UUID above, or the approved active-festival resolver
- LEADERBOARD_RPC: get_public_leaderboard_scoped
- PUBLISHED_RESULTS_RPC: get_public_published_results_scoped
- LEADERBOARD_SETTINGS_RPC: get_public_leaderboard_settings
- SCHEDULE_SOURCE: approved tenant/festival-scoped public schedule source
- REALTIME_SCOPE: tenant_id + festival_id only
- SUPABASE_URL: read from the host application's environment
- SUPABASE_PUBLISHABLE_KEY: read from the host application's environment
- CHATBOT_PROXY: application server proxy only
- CUSTOM_RENDERER_ENABLED: tenant configuration flag; default renderer remains fallback

DATA RULES
- Every request must carry both TENANT_ID and FESTIVAL_ID, or use the approved
  active-festival resolver for this tenant.
- Show only public/published records.
- Never read, cache, infer or display another tenant's data.
- Preserve organisation/team, item, category, ranking, points and schedule scope.
- Realtime subscriptions must be tenant/festival scoped, never global.

IMMUTABLE BACKEND RULES
- Do not change database tables, migrations, RPC names, RLS policies, auth rules,
  result publication rules, marks, historical results or existing portal workflows.
- Do not create a second assignment, results or leaderboard data model.
- Do not add write operations to a public leaderboard.
- Do not use service-role keys, database passwords, JWT secrets or AI provider secrets.
- Resolve public environment values from the host application's environment only.

REALTIME BEHAVIOUR
Subscribe only through the host application's approved realtime layer. On a
tenant/festival-scoped published result, schedule, settings or access change,
invalidate the related read-only query and update the UI without a full reload.
When tenant access is revoked, stop subscriptions and show the revoked state.

ACCEPTANCE CHECKLIST
- Desktop, tablet and mobile layouts are usable.
- Empty, loading, stale, revoked and error states are visible.
- Published results never expose private marks or unpublished rows.
- Existing admin, judge, participant, schedule and team workflows are unchanged.
- Verify tenant isolation with at least two tenants before delivery.
$prompt$, p_tenant_id::text, COALESCE(p_tenant_name, 'Resolve from tenant context'),
    COALESCE(p_festival_id::text, 'Resolve active festival'));
END;
$$;

CREATE OR REPLACE FUNCTION public._create_default_tenant_agent_prompt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
  v_prompt text;
BEGIN
  SELECT f.id INTO v_festival_id
  FROM public.festival_calendar f
  WHERE f.tenant_id = NEW.id AND COALESCE(f.is_active, false) = true
  ORDER BY f.id DESC
  LIMIT 1;

  v_prompt := public._tenant_leaderboard_agent_prompt(NEW.id, v_festival_id, NEW.name);

  INSERT INTO public.tenant_agent_prompts (
    tenant_id, festival_id, prompt_type, prompt_version, prompt_text,
    contract_manifest, generated_by
  ) VALUES (
    NEW.id,
    v_festival_id,
    'leaderboard_ui',
    1,
    v_prompt,
    jsonb_build_object(
      'tenant_id', NEW.id,
      'festival_id', v_festival_id,
      'scope', 'tenant_festival',
      'mode', 'read_only_public',
      'ui_customization', true,
      'backend_customization', false,
      'realtime', true,
      'secrets_included', false,
      'contract_version', 1
    ),
    NULL
  )
  ON CONFLICT (tenant_id, prompt_type) WHERE is_active = true DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_create_default_leaderboard_prompt ON public.tenants;
CREATE TRIGGER tenants_create_default_leaderboard_prompt
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public._create_default_tenant_agent_prompt();

-- Revoke/disable immediately invalidates the prompt and closes the realtime
-- contract. Data is preserved and re-enable can safely restore access later.
CREATE OR REPLACE FUNCTION public._revoke_tenant_leaderboard_prompt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_disabled IS DISTINCT FROM OLD.access_disabled THEN
    UPDATE public.tenant_agent_prompts
    SET is_active = NOT COALESCE(NEW.access_disabled, false),
        revoked_at = CASE WHEN COALESCE(NEW.access_disabled, false) THEN now() ELSE NULL END,
        updated_at = now()
    WHERE tenant_id = NEW.id AND prompt_type = 'leaderboard_ui';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_sync_leaderboard_prompt_access ON public.tenants;
CREATE TRIGGER tenants_sync_leaderboard_prompt_access
  AFTER UPDATE OF access_disabled ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public._revoke_tenant_leaderboard_prompt();

-- Backfill tenants created before this migration. Existing tenants receive the
-- same default contract as newly created tenants; no user data is changed.
INSERT INTO public.tenant_agent_prompts (
  tenant_id, festival_id, prompt_type, prompt_version, prompt_text,
  contract_manifest, is_active
)
SELECT
  t.id,
  f.id,
  'leaderboard_ui',
  1,
  public._tenant_leaderboard_agent_prompt(t.id, f.id, t.name),
  jsonb_build_object(
    'tenant_id', t.id,
    'festival_id', f.id,
    'scope', 'tenant_festival',
    'mode', 'read_only_public',
    'ui_customization', true,
    'backend_customization', false,
    'realtime', true,
    'secrets_included', false,
    'contract_version', 1
  ),
  NOT COALESCE(t.access_disabled, false)
FROM public.tenants t
LEFT JOIN LATERAL (
  SELECT fc.id
  FROM public.festival_calendar fc
  WHERE fc.tenant_id = t.id AND COALESCE(fc.is_active, false) = true
  ORDER BY fc.id DESC
  LIMIT 1
) f ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_agent_prompts p
  WHERE p.tenant_id = t.id AND p.prompt_type = 'leaderboard_ui'
);

-- Super Admin-only read RPC. The prompt is copyable but not publicly exposed.
CREATE OR REPLACE FUNCTION public.get_tenant_leaderboard_agent_prompt(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'tenant_id', p.tenant_id,
    'festival_id', p.festival_id,
    'prompt_type', p.prompt_type,
    'prompt_version', p.prompt_version,
    'prompt_text', p.prompt_text,
    'contract_manifest', p.contract_manifest,
    'is_active', p.is_active,
    'generated_at', p.generated_at,
    'revoked_at', p.revoked_at
  ) INTO v_prompt
  FROM public.tenant_agent_prompts p
  WHERE p.tenant_id = p_tenant_id
    AND p.prompt_type = 'leaderboard_ui'
  ORDER BY p.is_active DESC, p.generated_at DESC
  LIMIT 1;

  RETURN COALESCE(v_prompt, jsonb_build_object('prompt', NULL));
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_leaderboard_agent_prompt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_leaderboard_agent_prompt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_leaderboard_agent_prompt(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._tenant_leaderboard_agent_prompt(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._tenant_leaderboard_agent_prompt(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._create_default_tenant_agent_prompt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._revoke_tenant_leaderboard_prompt() FROM PUBLIC, anon, authenticated;

-- Realtime is used only for the internal prompt/access status and not as a
-- replacement for the public read-only leaderboard RPCs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tenant_agent_prompts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_agent_prompts;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['results', 'schedules', 'festival_leaderboard_settings', 'festival_calendar'] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
