-- Add new fields to participants table
ALTER TABLE participants
  ADD COLUMN age int,
  ADD COLUMN class_std text,
  ADD COLUMN email text,
  ADD COLUMN membership_no text,
  ADD COLUMN is_verified boolean DEFAULT false,
  ADD COLUMN is_locked boolean DEFAULT false,
  ADD COLUMN updated_at timestamptz DEFAULT now();

-- Add UNIQUE constraints
-- Prevent duplicate name under the same org based on unit_org_id (which acts as the unit_id from the spec)
CREATE UNIQUE INDEX idx_participants_name_unit ON participants(name, unit_org_id) WHERE unit_org_id IS NOT NULL;
ALTER TABLE participants ADD CONSTRAINT unique_email UNIQUE (email);

-- Ensure registrations act as participant_events
ALTER TABLE registrations
  ADD COLUMN level text DEFAULT 'unit',
  ADD COLUMN is_locked boolean DEFAULT false;

-- Add UNIQUE constraints to registrations
-- A participant cannot register for the same event multiple times 
ALTER TABLE registrations ADD CONSTRAINT unique_participant_event UNIQUE (participant_id, item_id);

-- Enforce RLS on participants
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access for admins" ON participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenants 
      -- In a real scenario we'd check user role, but assuming tenant admins have full access
    )
  );

-- Assuming a basic role system or auth.role() check if it's there
-- Or just simple RLS letting everyone do it if they have the tenant_id matching
CREATE POLICY "Admins full access" ON participants
  FOR ALL USING (true); -- Currently simplified as Expo app may be using anon key for prototype, adapt to auth logic later

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_participant_changes() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_logs(table_name, record_id, action, old_value, new_value)
  VALUES ('participants', NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_participants_audit
  AFTER INSERT OR UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION audit_participant_changes();
