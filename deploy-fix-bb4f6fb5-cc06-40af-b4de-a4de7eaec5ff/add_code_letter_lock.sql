-- Adds safety lock fields for code letter shuffling
ALTER TABLE schedules
ADD COLUMN IF NOT EXISTS is_shuffle_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shuffle_locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS shuffle_locked_by UUID REFERENCES auth.users(id);

-- Also add it to schedule_template if needed, though this is primarily runtime state
