
-- Migration 062: Production Audit Views
-- Read-only normal views for production integrity checks.

-- 1. Duplicate Chest Numbers (same festival, same chest, different normalized name)
CREATE OR REPLACE VIEW public.vw_audit_duplicate_chest_numbers AS
SELECT 
  p1.festival_id,
  p1.chest_number,
  p1.id AS participant_1_id,
  p1.name AS participant_1_name,
  p2.id AS participant_2_id,
  p2.name AS participant_2_name
FROM public.participants p1
JOIN public.participants p2 
  ON p1.festival_id = p2.festival_id 
 AND p1.chest_number = p2.chest_number 
 AND p1.id != p2.id
WHERE p1.chest_number IS NOT NULL
  AND p1.status IS DISTINCT FROM 'rejected'
  AND p2.status IS DISTINCT FROM 'rejected'
  AND UPPER(TRIM(p1.name)) != UPPER(TRIM(p2.name))
  AND p1.id < p2.id;

-- 2. Duplicate Registrations (same participant, same item)
CREATE OR REPLACE VIEW public.vw_audit_duplicate_registrations AS
SELECT 
  participant_id,
  item_id,
  COUNT(id) as reg_count,
  ARRAY_AGG(id) as registration_ids
FROM public.registrations
WHERE status IS DISTINCT FROM 'rejected'
GROUP BY participant_id, item_id
HAVING COUNT(id) > 1;

-- 3. Schedule Overlaps (using tstzrange for proper interval logic)
CREATE OR REPLACE VIEW public.vw_audit_schedule_overlaps AS
SELECT 
  s1.id AS schedule_1_id,
  s2.id AS schedule_2_id,
  s1.stage_id,
  s1.start_time AS s1_start,
  s1.end_time AS s1_end,
  s2.start_time AS s2_start,
  s2.end_time AS s2_end
FROM public.schedules s1
JOIN public.schedules s2 
  ON s1.stage_id = s2.stage_id 
 AND s1.id < s2.id
WHERE s1.start_time IS NOT NULL AND s1.end_time IS NOT NULL
  AND s2.start_time IS NOT NULL AND s2.end_time IS NOT NULL
  AND tstzrange(s1.start_time, s1.end_time, '[)') && tstzrange(s2.start_time, s2.end_time, '[)');

-- 4. Missing Item Mappings (schedules or registrations pointing to invalid item_id)
CREATE OR REPLACE VIEW public.vw_audit_missing_item_mappings AS
SELECT 
  'registration' AS source_type,
  r.id AS source_id,
  r.item_id
FROM public.registrations r
LEFT JOIN public.items i ON r.item_id = i.id
WHERE i.id IS NULL AND r.item_id IS NOT NULL
  AND r.status IS DISTINCT FROM 'rejected'
UNION ALL
SELECT 
  'schedule' AS source_type,
  s.id AS source_id,
  s.item_id
FROM public.schedules s
LEFT JOIN public.items i ON s.item_id = i.id
WHERE i.id IS NULL AND s.item_id IS NOT NULL;

-- 5. Broken Participant References (registration points to non-existent participant, excludes rejected)
CREATE OR REPLACE VIEW public.vw_audit_broken_participant_refs AS
SELECT 
  r.id AS registration_id,
  r.participant_id
FROM public.registrations r
LEFT JOIN public.participants p ON r.participant_id = p.id
WHERE p.id IS NULL
  AND r.status IS DISTINCT FROM 'rejected';

-- 6. Invalid Result Rows (published but missing rank or score)
CREATE OR REPLACE VIEW public.vw_audit_invalid_results AS
SELECT 
  id AS result_id,
  registration_id,
  published,
  rank,
  total_score
FROM public.results
WHERE published = true 
  AND (rank IS NULL OR total_score IS NULL);

-- 7. Queue Stuck States (processing > 5 mins)
CREATE OR REPLACE VIEW public.vw_audit_stuck_export_jobs AS
SELECT 
  id AS job_id,
  festival_id,
  status,
  created_at,
  updated_at
FROM public.export_jobs
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';

-- 8. Null Critical Fields (active rows missing tenant/festival IDs)
CREATE OR REPLACE VIEW public.vw_audit_null_critical_fields AS
SELECT 
  'results' AS table_name,
  id AS record_id,
  tenant_id,
  festival_id
FROM public.results
WHERE (tenant_id IS NULL OR festival_id IS NULL)
  AND result_status IS DISTINCT FROM 'draft'
UNION ALL
SELECT 
  'schedules' AS table_name,
  id AS record_id,
  tenant_id,
  festival_id
FROM public.schedules
WHERE (tenant_id IS NULL OR festival_id IS NULL)
  AND status IS DISTINCT FROM 'draft'
UNION ALL
SELECT 
  'registrations' AS table_name,
  id AS record_id,
  tenant_id,
  festival_id
FROM public.registrations
WHERE (tenant_id IS NULL OR festival_id IS NULL)
  AND status IS DISTINCT FROM 'rejected'
  AND status IS DISTINCT FROM 'draft';


