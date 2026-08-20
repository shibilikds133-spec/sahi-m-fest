-- Archived organisations are retained for history, but must never be returned
-- by the active organisation visibility RPC used by participant selectors.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_visible_organisations(p_tenant_id uuid)
RETURNS TABLE (id uuid, name text, org_type text, parent_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE org_tree AS (
    SELECT o.id, o.name, o.org_type, o.parent_id, o.tenant_id
    FROM public.organisations o
    LEFT JOIN public.tenants t ON t.id = p_tenant_id
    WHERE (o.tenant_id = p_tenant_id OR o.id = t.organisation_id)
      AND o.archived_at IS NULL

    UNION ALL

    SELECT child.id, child.name, child.org_type, child.parent_id, child.tenant_id
    FROM public.organisations child
    INNER JOIN org_tree parent ON child.parent_id = parent.id
    WHERE child.archived_at IS NULL
  )
  SELECT DISTINCT * FROM org_tree ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_organisations(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
