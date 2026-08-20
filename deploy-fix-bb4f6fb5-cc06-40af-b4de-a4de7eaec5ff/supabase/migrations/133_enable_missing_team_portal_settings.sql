-- Ensure an assigned Team Leader has a portal context when a festival has no
-- settings row yet. Explicitly configured settings are never overwritten.
INSERT INTO public.team_portal_settings (parent_tenant_id, festival_id, is_enabled)
SELECT DISTINCT ft.parent_tenant_id, ft.festival_id, true
FROM public.team_leader_assignments a
JOIN public.festival_teams ft ON ft.id = a.festival_team_id
WHERE a.status = 'active'
  AND a.revoked_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_portal_settings existing
    WHERE existing.parent_tenant_id = ft.parent_tenant_id
      AND existing.festival_id = ft.festival_id
  )
ON CONFLICT (parent_tenant_id, festival_id) DO NOTHING;
