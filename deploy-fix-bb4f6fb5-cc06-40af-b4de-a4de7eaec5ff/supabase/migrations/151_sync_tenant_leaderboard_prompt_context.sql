-- Keep generated leaderboard prompts aligned when a tenant name or active
-- festival changes after tenant creation.

BEGIN;

CREATE OR REPLACE FUNCTION public._sync_tenant_leaderboard_agent_prompt_context(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name text;
  v_festival_id uuid;
BEGIN
  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  SELECT f.id INTO v_festival_id
  FROM public.festival_calendar f
  WHERE f.tenant_id = p_tenant_id
    AND COALESCE(f.is_active, false) = true
  ORDER BY f.id DESC
  LIMIT 1;

  UPDATE public.tenant_agent_prompts p
  SET festival_id = v_festival_id,
      prompt_version = 2,
      prompt_text = public._tenant_leaderboard_agent_prompt_v2(
        p.tenant_id, v_festival_id, v_tenant_name
      ),
      contract_manifest = p.contract_manifest || jsonb_build_object(
        'tenant_id', p.tenant_id,
        'festival_id', v_festival_id,
        'context_synced_at', now(),
        'contract_version', 2
      ),
      updated_at = now()
  WHERE p.tenant_id = p_tenant_id
    AND p.prompt_type = 'leaderboard_ui';
END;
$$;

CREATE OR REPLACE FUNCTION public._sync_prompt_after_festival_context_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._sync_tenant_leaderboard_agent_prompt_context(NEW.tenant_id);
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     AND OLD.tenant_id IS NOT NULL THEN
    PERFORM public._sync_tenant_leaderboard_agent_prompt_context(OLD.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS festival_sync_leaderboard_prompt_context ON public.festival_calendar;
CREATE TRIGGER festival_sync_leaderboard_prompt_context
  AFTER INSERT OR UPDATE OF is_active, tenant_id ON public.festival_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_prompt_after_festival_context_change();

CREATE OR REPLACE FUNCTION public._sync_prompt_after_tenant_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public._sync_tenant_leaderboard_agent_prompt_context(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_sync_leaderboard_prompt_name ON public.tenants;
CREATE TRIGGER tenant_sync_leaderboard_prompt_name
  AFTER UPDATE OF name ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_prompt_after_tenant_name_change();

REVOKE ALL ON FUNCTION public._sync_tenant_leaderboard_agent_prompt_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._sync_prompt_after_festival_context_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._sync_prompt_after_tenant_name_change() FROM PUBLIC, anon, authenticated;

-- Synchronise all existing prompts once so older tenants also have the current
-- active festival context.
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN SELECT id FROM public.tenants LOOP
    PERFORM public._sync_tenant_leaderboard_agent_prompt_context(v_tenant_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
