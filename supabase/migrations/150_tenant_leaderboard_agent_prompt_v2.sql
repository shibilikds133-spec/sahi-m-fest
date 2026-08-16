-- Expand the tenant leaderboard agent contract without changing the backend.
-- This updates prompt content only; no secrets are stored or exposed.

BEGIN;

CREATE OR REPLACE FUNCTION public._tenant_leaderboard_agent_prompt_v2(
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
  RETURN public._tenant_leaderboard_agent_prompt(p_tenant_id, p_festival_id, p_tenant_name)
    || format($detail$

IMPLEMENTATION CONTRACT
- Work only inside the existing public Leaderboard feature boundary.
- Reuse the repository's existing React Native/Expo Router components, hooks,
  query client and Supabase client. Do not introduce a second data layer.
- Keep the current default renderer mounted and working. Add custom rendering as
  a tenant-scoped, feature-flagged adapter with an error boundary and fallback.
- Do not change the public URL shape: /leaderboard?tenant_id=TENANT_ID.

SAFE TENANT CONFIGURATION KEYS
- TENANT_ID = %s
- TENANT_NAME = %s
- FESTIVAL_ID = %s
- ACTIVE_FESTIVAL_RESOLVER = tenant_id + is_active festival only
- CUSTOM_RENDERER_ENABLED = false by default unless approved by the host app
- LEADERBOARD_MODE = public_read_only
- RESULT_VISIBILITY = published_only
- REALTIME_CHANNEL_SCOPE = TENANT_ID + FESTIVAL_ID

APPROVED DATA KEYS
- LEADERBOARD_RPC = get_public_leaderboard_scoped(p_tenant_id, p_festival_id)
- PUBLISHED_RESULTS_RPC = get_public_published_results_scoped(p_tenant_id, p_festival_id)
- SETTINGS_RPC = get_public_leaderboard_settings(p_tenant_id, p_festival_id)
- SCHEDULE_SOURCE = the existing tenant/festival-scoped public schedule query
- RESULT_FIELDS = item, category, organisation, participant-safe display fields,
  rank, points, grade, published_at and public visibility fields only
- SCHEDULE_FIELDS = item, category, date, start/end time, venue and public status
- SETTINGS_FIELDS = public festival name, branding/theme values and visibility flags
- REALTIME_TABLES = results, schedules, festival_leaderboard_settings,
  festival_calendar (through the host realtime layer only)

ENVIRONMENT KEY POLICY
- SUPABASE_URL = read from the host app environment
- SUPABASE_PUBLISHABLE_KEY = read from the host app environment
- CHATBOT_PROXY = existing application server proxy only
- Never place actual values for any environment key in source code or this prompt.
- Never request or use service-role keys, database passwords, JWT signing secrets,
  private auth tokens, payment secrets or AI provider secrets.

DATA AND SECURITY IMPLEMENTATION
- Every query, cache key, prefetch and realtime channel must include TENANT_ID.
- Every festival query must include FESTIVAL_ID or the approved active resolver.
- Reject missing, malformed or mismatched tenant/festival context before rendering.
- Do not trust a tenant_id supplied by UI alone; the approved RPC/RLS contract is
  authoritative.
- Do not display unpublished results, judge marks, private participant fields,
  admin credentials, internal audit data or another tenant's records.
- Do not write from the public leaderboard. All mutations remain in existing admin
  workflows and existing services.
- Stop subscriptions and clear tenant-scoped cache when access is revoked.

REALTIME IMPLEMENTATION
- Subscribe through the existing Supabase realtime client only.
- Use a unique channel per TENANT_ID and FESTIVAL_ID.
- On an approved change, invalidate only the matching leaderboard, result,
  settings and schedule query keys; do not globally invalidate other tenants.
- Handle SUBSCRIBED, CLOSED, CHANNEL_ERROR and TIMEOUT states.
- Reconnect safely with bounded retry/backoff and no duplicate channels.
- Re-fetch through approved read-only RPCs after an event; never trust payloads
  as authorization.

UI REQUIREMENTS
- Preserve the current default layout as a complete fallback.
- Custom layout must work on mobile, tablet and desktop.
- Include loading, empty, error, stale, offline, revoked and no-active-festival states.
- Make tenant name, festival name, last updated time and publication state clear.
- Keep keyboard navigation, readable contrast, reduced-motion support and screen
  reader labels.
- Do not hide an error behind a blank screen.

DELIVERY REQUIREMENTS
- First inspect the existing leaderboard implementation and reuse its contracts.
- Before editing, list the exact files to change and why.
- Do not create migrations, RPCs, tables or policies.
- Do not modify admin, judge, participant, team leader, schedule or result workflows.
- Run lint and the existing web build after implementation.
- Test at least two tenant IDs and a mismatched festival ID.
- Test default mode, custom mode, feature-flag off, realtime update, revoked tenant,
  empty data and RPC failure.
- Report changed files, tests, fallback behavior and any unresolved issue.
$detail$, p_tenant_id::text, COALESCE(p_tenant_name, 'Resolve from tenant context'),
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

  v_prompt := public._tenant_leaderboard_agent_prompt_v2(NEW.id, v_festival_id, NEW.name);

  INSERT INTO public.tenant_agent_prompts (
    tenant_id, festival_id, prompt_type, prompt_version, prompt_text,
    contract_manifest, generated_by
  ) VALUES (
    NEW.id, v_festival_id, 'leaderboard_ui', 2, v_prompt,
    jsonb_build_object(
      'tenant_id', NEW.id, 'festival_id', v_festival_id,
      'scope', 'tenant_festival', 'mode', 'public_read_only',
      'ui_customization', true, 'backend_customization', false,
      'default_renderer_fallback', true, 'realtime', true,
      'secrets_included', false, 'contract_version', 2
    ), NULL
  )
  ON CONFLICT (tenant_id, prompt_type) WHERE is_active = true DO NOTHING;

  RETURN NEW;
END;
$$;

UPDATE public.tenant_agent_prompts p
SET prompt_version = 2,
    prompt_text = public._tenant_leaderboard_agent_prompt_v2(
      p.tenant_id, p.festival_id, t.name
    ),
    contract_manifest = p.contract_manifest || jsonb_build_object(
      'default_renderer_fallback', true,
      'custom_renderer_opt_in', true,
      'contract_version', 2,
      'secrets_included', false
    ),
    updated_at = now()
FROM public.tenants t
WHERE t.id = p.tenant_id
  AND p.prompt_type = 'leaderboard_ui';

NOTIFY pgrst, 'reload schema';
COMMIT;
