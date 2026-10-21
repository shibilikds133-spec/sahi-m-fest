-- Participant updates can run inside SECURITY DEFINER routines with an empty
-- search_path. Qualify the audit table so the existing trigger can still log
-- those changes without relying on caller search_path.
CREATE OR REPLACE FUNCTION public.audit_participant_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.audit_logs (table_name, record_id, action, old_value, new_value)
  VALUES (
    'participants',
    NEW.id,
    TG_OP,
    pg_catalog.row_to_json(OLD),
    pg_catalog.row_to_json(NEW)
  );
  RETURN NEW;
END;
$$;
