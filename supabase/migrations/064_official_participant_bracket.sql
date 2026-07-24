-- Migration to add official_participant_bracket to schedules table
-- This allows the system to permanently store the official grading bracket chosen
-- by the admin when publishing results, preventing calculation mismatch on reopen.

ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS official_participant_bracket TEXT DEFAULT '1';

-- Enforce allowed values for database safety
ALTER TABLE schedules
ADD CONSTRAINT chk_official_participant_bracket
CHECK (official_participant_bracket IN ('1', '2', '3', '4-5', '6-10'));
