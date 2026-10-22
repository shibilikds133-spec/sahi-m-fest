-- Run against a database containing the scoring migrations. No saved config rows
-- are changed; all test helpers are rolled back at the end.
BEGIN;
SET LOCAL plpgsql.variable_conflict = 'error';

CREATE FUNCTION pg_temp.expect_boost_rejection(payload jsonb, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM scoring_private.validate_boost_sections(payload);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF strpos(SQLERRM, expected) = 0 THEN RAISE; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected validation rejection: %', expected;
END $$;

DO $$
DECLARE
  base jsonb := '{"grade_boost_sections":[],"rank_boost_sections":[],"grade_boost_item_ids":[],"rank_boost_item_ids":[],"separate_group_brackets":false,"point_brackets":[{"key":"default","enabled":true}],"group_point_brackets":[{"key":"group","enabled":true}]}';
  grade_section jsonb := '{"id":"grade-one","item_ids":["11111111-1111-4111-8111-111111111111"],"points":{"default":[10,8,6,4]},"group_points":{}}';
  rank_section jsonb := '{"id":"rank-one","item_ids":["11111111-1111-4111-8111-111111111111"],"points":[5,3,1]}';
  grades jsonb;
  ranks jsonb;
  combined jsonb;
BEGIN
  -- Empty lists must reach the equality checks without an ambiguous SQL column.
  PERFORM scoring_private.validate_boost_sections(base);
  grades := base || jsonb_build_object('grade_boost_sections',jsonb_build_array(grade_section),'grade_boost_item_ids',grade_section->'item_ids');
  ranks := base || jsonb_build_object('rank_boost_sections',jsonb_build_array(rank_section),'rank_boost_item_ids',rank_section->'item_ids');
  PERFORM scoring_private.validate_boost_sections(grades);
  PERFORM scoring_private.validate_boost_sections(ranks);
  combined := grades || jsonb_build_object('rank_boost_sections',ranks->'rank_boost_sections','rank_boost_item_ids',ranks->'rank_boost_item_ids');
  PERFORM scoring_private.validate_boost_sections(combined);
  PERFORM scoring_private.validate_boost_sections(grades || jsonb_build_object(
    'grade_boost_sections',jsonb_build_array(grade_section,grade_section || '{"id":"grade-two","item_ids":["22222222-2222-4222-8222-222222222222"]}'::jsonb),
    'grade_boost_item_ids','["22222222-2222-4222-8222-222222222222","11111111-1111-4111-8111-111111111111"]'::jsonb));
  PERFORM scoring_private.validate_boost_sections(grades || jsonb_build_object(
    'separate_group_brackets',true,'grade_boost_sections',jsonb_build_array(grade_section || '{"group_points":{"group":[20,16,12,8]}}'::jsonb)));

  PERFORM pg_temp.expect_boost_rejection(grades || '{"grade_boost_item_ids":[]}'::jsonb,'Grade Boost competition list does not match');
  PERFORM pg_temp.expect_boost_rejection(ranks || '{"rank_boost_item_ids":[]}'::jsonb,'Rank Boost competition list does not match');
  PERFORM pg_temp.expect_boost_rejection(grades || jsonb_build_object('grade_boost_sections',jsonb_build_array(grade_section,grade_section || '{"id":"grade-two"}'::jsonb)), 'only one Grade Boost section');
  PERFORM pg_temp.expect_boost_rejection(ranks || jsonb_build_object('rank_boost_sections',jsonb_build_array(rank_section,rank_section || '{"id":"rank-two"}'::jsonb)), 'only one Rank Boost section');
  PERFORM pg_temp.expect_boost_rejection(grades || jsonb_build_object('grade_boost_sections',jsonb_build_array(grade_section || '{"points":{"default":[10]}}'::jsonb)), 'Complete Grade Boost points');
  PERFORM pg_temp.expect_boost_rejection(ranks || jsonb_build_object('rank_boost_sections',jsonb_build_array(rank_section || '{"points":[5]}'::jsonb)), 'Complete Rank Boost points');
  RAISE NOTICE 'PASS: 6 valid configurations and 6 invalid configurations';
END $$;

ROLLBACK;
