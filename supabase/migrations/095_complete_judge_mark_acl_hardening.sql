-- Complete the defense-in-depth hardening started in migration 093.
-- Earlier migrations granted privileges directly to anon and created policies
-- whose names differ from the ones 093 removed. REVOKE FROM PUBLIC alone does
-- not remove a role-specific anon grant.

BEGIN;

-- The schedule-id overload is an authenticated admin workflow only.
REVOKE ALL ON FUNCTION public.get_judge_registrations(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(uuid)
  TO authenticated;

-- Judge portal reads/writes use the token-bound SECURITY DEFINER RPCs, never
-- direct anonymous access to mark_entries.
REVOKE ALL ON public.mark_entries FROM PUBLIC, anon;

-- Remove legacy permissive policies, including the anon write policies and
-- authenticated USING (true) policies that could cross tenant boundaries.
DROP POLICY IF EXISTS mark_entries_select_policy ON public.mark_entries;
DROP POLICY IF EXISTS mark_entries_insert_policy ON public.mark_entries;
DROP POLICY IF EXISTS mark_entries_update_policy ON public.mark_entries;
DROP POLICY IF EXISTS mark_entries_delete_policy ON public.mark_entries;
DROP POLICY IF EXISTS "Tenant members can read mark entries" ON public.mark_entries;
DROP POLICY IF EXISTS "Tenant members can manage mark entries" ON public.mark_entries;

CREATE POLICY "Tenant members can manage mark entries"
ON public.mark_entries
FOR ALL TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
)
WITH CHECK (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
