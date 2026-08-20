-- Migration 121: Canonical link between participant and auth.users
-- This allows one human to be canonically linked to all their historical and current participant records.

ALTER TABLE participants ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial unique index to prevent an Auth user from being registered twice in the same festival.
-- It allows the same Auth user to have participant rows in *different* festivals.
CREATE UNIQUE INDEX idx_participants_festival_user 
ON participants(festival_id, user_id) 
WHERE user_id IS NOT NULL;
