-- READ ONLY. Run on the explicitly confirmed target before applying the migration.
-- Results require human review; this script does not repair, copy, seed or delete data.
BEGIN READ ONLY;
SELECT tenant_id,festival_id,count(*) AS configuration_rows
FROM public.points_config GROUP BY tenant_id,festival_id HAVING count(*)>1;

SELECT f.id AS festival_id,f.tenant_id,pc.id AS config_id,pc.points_mode,
  pc.grade_thresholds,pc.point_brackets,pc.group_point_brackets,
  pc.rank_1_points,pc.rank_2_points,pc.rank_3_points,
  pc.less_than_3_teams_rule,pc.rule12_min_teams,pc.rule12_behavior
FROM public.festival_calendar f LEFT JOIN public.points_config pc ON pc.festival_id=f.id AND pc.tenant_id=f.tenant_id
WHERE f.is_active IS TRUE;
-- Inspect ALL active configurations above against previously effective behaviour.
-- Old "official" mode ignored some stored settings and supplied constants from code.
-- Missing values, official-mode differences and bracket gaps are release gates, not auto-seeds.

SELECT id,tenant_id,festival_id,item_code,category_codes
FROM public.items WHERE festival_id IS NOT NULL AND
  (cardinality(category_codes) IS DISTINCT FROM 1 OR nullif(btrim(category_codes[1]),'') IS NULL);

SELECT id,tenant_id,schedule_id,registration_id,entry_mode_snapshot,total_mark,max_mark_snapshot
FROM public.mark_entries WHERE max_mark_snapshot IS NULL OR max_mark_snapshot<=0 OR total_mark<0 OR total_mark>max_mark_snapshot;
-- A legacy maximum populated by an old migration is not proof of its historical correctness.
SELECT tenant_id,entry_mode_snapshot,max_mark_snapshot,count(*) AS marks_to_review
FROM public.mark_entries GROUP BY tenant_id,entry_mode_snapshot,max_mark_snapshot ORDER BY tenant_id;

SELECT t.id AS tenant_id,t.organisation_id,count(o.id) FILTER(WHERE o.archived_at IS NULL) AS current_child_teams
FROM public.tenants t LEFT JOIN public.organisations o ON o.parent_id=t.organisation_id
GROUP BY t.id,t.organisation_id;

SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef AS security_definer,
  has_function_privilege('anon',p.oid,'execute') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') AS authenticated_execute,
  pg_get_functiondef(p.oid) AS installed_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('unlock_schedule_marks','unlock_judge_marks','admin_upsert_mark','upsert_judge_mark','expire_judge_token','validate_mark_entry_scoring');
ROLLBACK;
