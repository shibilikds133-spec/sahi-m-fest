-- Add standard audit columns to all tenant/festival scoped tables
-- Columns: created_at (if missing), updated_at, created_by, updated_by

-- 1. tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2. festival_calendar
ALTER TABLE festival_calendar ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE festival_calendar ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE festival_calendar ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE festival_calendar ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 3. categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS festival_id uuid REFERENCES festival_calendar(id);

-- 4. items
ALTER TABLE items ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 5. points_config
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 6. scoring_criteria
ALTER TABLE scoring_criteria ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE scoring_criteria ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE scoring_criteria ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE scoring_criteria ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 7. participants
ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE participants ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 8. registrations
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 9. group_members
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 10. venues
ALTER TABLE venues ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE venues ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE venues ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 11. schedules
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 12. judges
ALTER TABLE judges ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE judges ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE judges ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE judges ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 13. mark_entries
ALTER TABLE mark_entries ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE mark_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE mark_entries ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE mark_entries ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 14. results
ALTER TABLE results ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE results ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE results ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE results ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 15. point_table
ALTER TABLE point_table ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE point_table ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE point_table ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE point_table ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Create an auto-update timestamp function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to core tables to auto-update the updated_at column
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'tenants', 'festival_calendar', 'categories', 'items', 'points_config', 
            'scoring_criteria', 'participants', 'registrations', 'group_members', 
            'venues', 'schedules', 'judges', 'mark_entries', 'results', 'point_table'
        ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_modtime ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_modtime BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_modified_column()', t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
