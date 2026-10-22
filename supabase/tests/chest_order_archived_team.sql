BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);

UPDATE public.organisations
SET archived_at='2026-10-22T00:00:00Z'
WHERE id='00000000-0000-4000-8000-000000000022';

-- Leave a reserved slot gap to prove active ordering does not compact archived
-- teams or historical ranges after older team rows have been deleted.
DELETE FROM public.festival_team_chest_slots
WHERE festival_id='00000000-0000-4000-8000-000000000011';
INSERT INTO public.festival_team_chest_slots(festival_id,organisation_id,slot_number) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021',1),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000022',3),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000023',4);
SELECT public.regenerate_festival_chest_numbers_internal(
  '00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000101'
);

DO $$
DECLARE
  v_state jsonb;
  v_team jsonb;
BEGIN
  v_state:=public.get_festival_chest_order('00000000-0000-4000-8000-000000000011');
  SELECT entry INTO v_team
  FROM jsonb_array_elements(v_state->'teams') AS entries(entry)
  WHERE entry->>'id'='00000000-0000-4000-8000-000000000022';
  IF v_team IS NULL OR v_team->>'archived_at' IS NULL THEN
    RAISE EXCEPTION 'Archived team state must remain available in the saved-order snapshot.';
  END IF;

  -- Reorder visible teams A/C while retaining archived team B at slot 3 and
  -- preserving the unused gap at slot 2.
  PERFORM public.save_festival_chest_order(
    '00000000-0000-4000-8000-000000000011',
    ARRAY['00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000021']::uuid[],
    ARRAY['00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023']::uuid[],
    0,100
  );

  IF (SELECT slot_number FROM public.festival_team_chest_slots
      WHERE festival_id='00000000-0000-4000-8000-000000000011'
        AND organisation_id='00000000-0000-4000-8000-000000000022') <> 3
     OR (SELECT slot_number FROM public.festival_team_chest_slots
         WHERE festival_id='00000000-0000-4000-8000-000000000011'
           AND organisation_id='00000000-0000-4000-8000-000000000023') <> 1
     OR (SELECT slot_number FROM public.festival_team_chest_slots
         WHERE festival_id='00000000-0000-4000-8000-000000000011'
           AND organisation_id='00000000-0000-4000-8000-000000000021') <> 4
     OR (SELECT chest_number FROM public.participants
         WHERE id='00000000-0000-4000-8000-000000000203') <> '300' THEN
    RAISE EXCEPTION 'Active reorder must preserve archived slots, chest numbers and slot gaps.';
  END IF;
  RAISE NOTICE 'PASS: archived teams remain hidden from the active list while their slots and numbers survive active-team reordering.';
END $$;

ROLLBACK;
