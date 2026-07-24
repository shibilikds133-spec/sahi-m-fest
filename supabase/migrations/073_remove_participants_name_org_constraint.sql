-- Migration: 072_remove_participants_name_org_constraint.sql
-- Description: Drop the unique constraint on (name, organisation_id) to allow participants with the same name in the same organisation, 
-- provided their chest numbers are unique (chest_number is already unique across the festival).

DROP INDEX IF EXISTS idx_participants_name_org;
