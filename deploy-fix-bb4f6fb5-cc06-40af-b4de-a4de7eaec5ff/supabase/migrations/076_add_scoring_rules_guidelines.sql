-- Add guidelines column to scoring_rules
ALTER TABLE scoring_rules
ADD COLUMN IF NOT EXISTS guidelines text;

-- Update RLS policies (Not strictly necessary for new columns if table has policies, but good practice to verify)
-- Re-run the get_rule functions or views if they do SELECT * (not needed as Postgres handles this)
