-- 074_communication_center.sql

-- Add notification_enabled to profiles
ALTER TABLE public.profiles 
ADD COLUMN notification_enabled BOOLEAN DEFAULT TRUE;

-- Create user_notification_tokens table
CREATE TABLE public.user_notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    device_type TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- Enable RLS for tokens
ALTER TABLE public.user_notification_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own tokens" ON public.user_notification_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Create notifications table
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'reminder', 'announcement', 'result', 'schedule_update', 'emergency'
    priority TEXT NOT NULL DEFAULT 'NORMAL', -- 'LOW', 'NORMAL', 'HIGH', 'URGENT'
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view and create notifications" ON public.notifications
    FOR ALL TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id() 
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('admin', 'admin_leader', 'superadmin')
            )
            OR public.is_superadmin()
        )
    );

CREATE POLICY "Users can view notifications for their tenant" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_my_tenant_id() OR public.is_superadmin()
    );

-- Create notification_logs table
CREATE TABLE public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" ON public.notification_logs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs in their tenant" ON public.notification_logs
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.id = notification_logs.notification_id
            AND n.tenant_id = public.get_my_tenant_id()
        )
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('admin', 'admin_leader', 'superadmin')
            )
            OR public.is_superadmin()
        )
    );

-- Add notification_sent to schedules
ALTER TABLE public.schedules
ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE;

-- Trigger to reset notification_sent when start_time changes
CREATE OR REPLACE FUNCTION reset_schedule_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
        NEW.notification_sent = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reset_schedule_notification_trigger
BEFORE UPDATE ON public.schedules
FOR EACH ROW
EXECUTE FUNCTION reset_schedule_notification();
