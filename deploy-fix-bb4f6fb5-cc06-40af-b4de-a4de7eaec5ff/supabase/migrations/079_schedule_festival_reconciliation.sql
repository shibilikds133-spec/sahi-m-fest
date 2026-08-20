-- PORTABLE SUPABASE MIGRATION 078 — SCHEDULE FESTIVAL RECONCILIATION
-- Safe for both Fresh Supabase Projects and Existing Production Databases

BEGIN;

-- Conditional Production Data Repair: Exact 35 Schedule Reconciliation
-- Safely performs a NO-OP on fresh or third-party Supabase projects where reviewed production records do not exist.
DO $$
DECLARE
  v_present_reviewed_count INTEGER;
  v_matching_count INTEGER;
BEGIN
  -- Check if any of the 35 reviewed production schedule UUIDs exist in this database
  SELECT COUNT(*) INTO v_present_reviewed_count
  FROM public.schedules
  WHERE id IN (
    'a6987fe7-55ba-44a8-a413-c8cb62b2ffc1'::uuid,
    '0e875e5a-dcb4-4518-bf80-05bee2d2e4b3'::uuid,
    '5fcac952-29e7-43c1-9a16-ae37e289579c'::uuid,
    '3bdabb69-aad4-4588-87fa-87ad9035bf5e'::uuid,
    '8a6c05ad-71fe-47b2-a432-45b758d07d60'::uuid,
    'bee0e0cf-0a99-4804-be41-b8cf5f68f1dd'::uuid,
    'b764cd5c-233a-4203-bd57-63e85fc47419'::uuid,
    'da263ebb-5ffc-44a8-b00f-cf95370c5c14'::uuid,
    'f6b6b243-d965-4170-867d-df27a8afe3e7'::uuid,
    '54f81359-ba45-421d-b1d8-201b79c6f32f'::uuid,
    'cd33f1dd-3bf8-4013-9c91-71442419ec8e'::uuid,
    '75bdfd2a-55e9-40dd-896f-05c28c1f3456'::uuid,
    'f771cd3d-02be-409b-8187-a00e0d289450'::uuid,
    'c90885e2-f563-408d-9ac5-d0275c3d5378'::uuid,
    '181b7d50-d97f-4d51-b7ad-33bdbfe2a96d'::uuid,
    'ebbb1f78-d3ed-4948-8902-94825265df5c'::uuid,
    'e5c260dc-7c23-4cb4-9948-9bf36cdf5875'::uuid,
    '9c889ea2-e5d7-4bd6-8974-5228ab3f218c'::uuid,
    '78fb0129-2f1d-412b-b67b-425bbfcb1ddc'::uuid,
    'e7cd5c09-33c6-42fb-8d8d-540bfe617223'::uuid,
    '2d35e7c5-0f0d-45cb-bdce-fe52373a49e6'::uuid,
    'c7675fd9-90e6-487e-8219-a6d54184a0ab'::uuid,
    '05edea90-0f01-4896-b79e-30bdf9096259'::uuid,
    '5517be60-23a5-4ebf-948b-fd8a44bce746'::uuid,
    '4106d0db-7a2d-4210-be7e-360fca6aeb0c'::uuid,
    'acbca0ab-6811-4442-9fbb-5cbe50a69d40'::uuid,
    '67c37f3c-97db-4de2-8e2d-67de3ff6aabc'::uuid,
    '3127313d-f879-4743-929d-9fc135f12093'::uuid,
    '385d0ab5-f521-4bcd-bb7a-af329ca3bc15'::uuid,
    '76c627db-e75c-49fa-b834-7c258de3739a'::uuid,
    '7debe50b-01fc-4be6-a050-2c6e1ff8f9ff'::uuid,
    '8f3d984a-cf5c-4d95-bfd1-4d2833572964'::uuid,
    '6dfa1376-8021-414b-ba7c-ab5ad19848a5'::uuid,
    '9ac569a7-ebf3-4eef-b4df-4096d89eb89a'::uuid,
    'b94c9859-60bd-4c1e-8722-d96a673d30cf'::uuid
  );

  IF v_present_reviewed_count = 0 THEN
    -- FRESH / OTHER PROJECT DETECTED: Perform documented safe NO-OP
    RAISE NOTICE 'Migration 078: Fresh or third-party database detected. None of the 35 production schedule UUIDs exist. Skipping data repair (NO-OP).';
  ELSIF v_present_reviewed_count = 35 THEN
    -- TARGET PRODUCTION DATASET DETECTED: Perform strict precondition assertion and update
    SELECT COUNT(*) INTO v_matching_count
    FROM public.schedules s
    JOIN public.items i ON s.item_id = i.id
    WHERE s.id IN (
      'a6987fe7-55ba-44a8-a413-c8cb62b2ffc1'::uuid,
    '0e875e5a-dcb4-4518-bf80-05bee2d2e4b3'::uuid,
    '5fcac952-29e7-43c1-9a16-ae37e289579c'::uuid,
    '3bdabb69-aad4-4588-87fa-87ad9035bf5e'::uuid,
    '8a6c05ad-71fe-47b2-a432-45b758d07d60'::uuid,
    'bee0e0cf-0a99-4804-be41-b8cf5f68f1dd'::uuid,
    'b764cd5c-233a-4203-bd57-63e85fc47419'::uuid,
    'da263ebb-5ffc-44a8-b00f-cf95370c5c14'::uuid,
    'f6b6b243-d965-4170-867d-df27a8afe3e7'::uuid,
    '54f81359-ba45-421d-b1d8-201b79c6f32f'::uuid,
    'cd33f1dd-3bf8-4013-9c91-71442419ec8e'::uuid,
    '75bdfd2a-55e9-40dd-896f-05c28c1f3456'::uuid,
    'f771cd3d-02be-409b-8187-a00e0d289450'::uuid,
    'c90885e2-f563-408d-9ac5-d0275c3d5378'::uuid,
    '181b7d50-d97f-4d51-b7ad-33bdbfe2a96d'::uuid,
    'ebbb1f78-d3ed-4948-8902-94825265df5c'::uuid,
    'e5c260dc-7c23-4cb4-9948-9bf36cdf5875'::uuid,
    '9c889ea2-e5d7-4bd6-8974-5228ab3f218c'::uuid,
    '78fb0129-2f1d-412b-b67b-425bbfcb1ddc'::uuid,
    'e7cd5c09-33c6-42fb-8d8d-540bfe617223'::uuid,
    '2d35e7c5-0f0d-45cb-bdce-fe52373a49e6'::uuid,
    'c7675fd9-90e6-487e-8219-a6d54184a0ab'::uuid,
    '05edea90-0f01-4896-b79e-30bdf9096259'::uuid,
    '5517be60-23a5-4ebf-948b-fd8a44bce746'::uuid,
    '4106d0db-7a2d-4210-be7e-360fca6aeb0c'::uuid,
    'acbca0ab-6811-4442-9fbb-5cbe50a69d40'::uuid,
    '67c37f3c-97db-4de2-8e2d-67de3ff6aabc'::uuid,
    '3127313d-f879-4743-929d-9fc135f12093'::uuid,
    '385d0ab5-f521-4bcd-bb7a-af329ca3bc15'::uuid,
    '76c627db-e75c-49fa-b834-7c258de3739a'::uuid,
    '7debe50b-01fc-4be6-a050-2c6e1ff8f9ff'::uuid,
    '8f3d984a-cf5c-4d95-bfd1-4d2833572964'::uuid,
    '6dfa1376-8021-414b-ba7c-ab5ad19848a5'::uuid,
    '9ac569a7-ebf3-4eef-b4df-4096d89eb89a'::uuid,
    'b94c9859-60bd-4c1e-8722-d96a673d30cf'::uuid
    )
    AND s.tenant_id = i.tenant_id
    AND i.festival_id IS NOT NULL;

    IF v_matching_count <> 35 THEN
      RAISE EXCEPTION 'Migration 078 Abort: Target dataset present but precondition failed. Matching count % <> 35.', v_matching_count;
    END IF;

    -- Execute update on exact 35 reviewed schedule UUIDs
    UPDATE public.schedules s
    SET festival_id = i.festival_id
    FROM public.items i
    WHERE s.item_id = i.id
      AND s.id IN (
        'a6987fe7-55ba-44a8-a413-c8cb62b2ffc1'::uuid,
    '0e875e5a-dcb4-4518-bf80-05bee2d2e4b3'::uuid,
    '5fcac952-29e7-43c1-9a16-ae37e289579c'::uuid,
    '3bdabb69-aad4-4588-87fa-87ad9035bf5e'::uuid,
    '8a6c05ad-71fe-47b2-a432-45b758d07d60'::uuid,
    'bee0e0cf-0a99-4804-be41-b8cf5f68f1dd'::uuid,
    'b764cd5c-233a-4203-bd57-63e85fc47419'::uuid,
    'da263ebb-5ffc-44a8-b00f-cf95370c5c14'::uuid,
    'f6b6b243-d965-4170-867d-df27a8afe3e7'::uuid,
    '54f81359-ba45-421d-b1d8-201b79c6f32f'::uuid,
    'cd33f1dd-3bf8-4013-9c91-71442419ec8e'::uuid,
    '75bdfd2a-55e9-40dd-896f-05c28c1f3456'::uuid,
    'f771cd3d-02be-409b-8187-a00e0d289450'::uuid,
    'c90885e2-f563-408d-9ac5-d0275c3d5378'::uuid,
    '181b7d50-d97f-4d51-b7ad-33bdbfe2a96d'::uuid,
    'ebbb1f78-d3ed-4948-8902-94825265df5c'::uuid,
    'e5c260dc-7c23-4cb4-9948-9bf36cdf5875'::uuid,
    '9c889ea2-e5d7-4bd6-8974-5228ab3f218c'::uuid,
    '78fb0129-2f1d-412b-b67b-425bbfcb1ddc'::uuid,
    'e7cd5c09-33c6-42fb-8d8d-540bfe617223'::uuid,
    '2d35e7c5-0f0d-45cb-bdce-fe52373a49e6'::uuid,
    'c7675fd9-90e6-487e-8219-a6d54184a0ab'::uuid,
    '05edea90-0f01-4896-b79e-30bdf9096259'::uuid,
    '5517be60-23a5-4ebf-948b-fd8a44bce746'::uuid,
    '4106d0db-7a2d-4210-be7e-360fca6aeb0c'::uuid,
    'acbca0ab-6811-4442-9fbb-5cbe50a69d40'::uuid,
    '67c37f3c-97db-4de2-8e2d-67de3ff6aabc'::uuid,
    '3127313d-f879-4743-929d-9fc135f12093'::uuid,
    '385d0ab5-f521-4bcd-bb7a-af329ca3bc15'::uuid,
    '76c627db-e75c-49fa-b834-7c258de3739a'::uuid,
    '7debe50b-01fc-4be6-a050-2c6e1ff8f9ff'::uuid,
    '8f3d984a-cf5c-4d95-bfd1-4d2833572964'::uuid,
    '6dfa1376-8021-414b-ba7c-ab5ad19848a5'::uuid,
    '9ac569a7-ebf3-4eef-b4df-4096d89eb89a'::uuid,
    'b94c9859-60bd-4c1e-8722-d96a673d30cf'::uuid
      )
      AND s.festival_id IS NULL
      AND i.festival_id IS NOT NULL
      AND s.tenant_id = i.tenant_id;

    RAISE NOTICE 'Migration 078: Successfully reconciled 35 schedule festival IDs on target dataset.';
  ELSE
    -- PARTIAL DATASET DETECTED: Abort and require operator evaluation
    RAISE EXCEPTION 'Migration 078 Abort: Partial production schedule dataset detected (% / 35 rows). Requires operator evaluation.', v_present_reviewed_count;
  END IF;
END $$;

COMMIT;
