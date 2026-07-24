-- Add phone and org_name to participants table
ALTER TABLE participants
ADD COLUMN phone text,
ADD COLUMN org_name text;
