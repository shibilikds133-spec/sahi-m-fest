-- ============================================================
-- Migration 015: Add rejection reason to participants
-- Allows storing the reason when an admin rejects a participant.
-- ============================================================

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS rejection_reason text;

NOTIFY pgrst, 'reload schema';
