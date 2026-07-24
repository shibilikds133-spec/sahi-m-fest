BEGIN;

-- Allow users to see global notifications (tenant_id IS NULL)
DROP POLICY IF EXISTS "Users can view notifications for their tenant" ON public.notifications;
CREATE POLICY "Users can view notifications for their tenant" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin()
    );

-- Allow users to update their own logs (to mark as read)
DROP POLICY IF EXISTS "Users can update own logs" ON public.notification_logs;
CREATE POLICY "Users can update own logs" ON public.notification_logs
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

COMMIT;
