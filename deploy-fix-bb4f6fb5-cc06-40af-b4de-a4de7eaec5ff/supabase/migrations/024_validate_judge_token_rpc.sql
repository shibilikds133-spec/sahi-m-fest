-- Migration 022: validate_judge_token RPC
-- Judge portal is accessed by unauthenticated users.
-- Direct table query with joins fails due to RLS on schedules/judges/venues.
-- This SECURITY DEFINER function bypasses RLS safely, returns only what's needed.

CREATE OR REPLACE FUNCTION public.validate_judge_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'id',          jt.id,
    'token',       jt.token,
    'is_used',     jt.is_used,
    'judge_id',    jt.judge_id,
    'schedule_id', jt.schedule_id,
    'tenant_id',   jt.tenant_id,
    'judges',      json_build_object('name', j.name),
    'schedules',   json_build_object(
      'id',         s.id,
      'start_time', s.start_time,
      'items',      json_build_object(
        'item_name_ml', i.item_name_ml,
        'item_name_en', i.item_name_en
      ),
      'venues',     json_build_object('name', v.name)
    )
  )
  INTO v_result
  FROM public.judge_tokens jt
  LEFT JOIN public.judges    j  ON j.id = jt.judge_id
  LEFT JOIN public.schedules s  ON s.id = jt.schedule_id
  LEFT JOIN public.items     i  ON i.id = s.item_id
  LEFT JOIN public.venues    v  ON v.id = s.venue_id
  WHERE jt.token   = upper(trim(p_token))
    AND jt.is_used = false
  LIMIT 1;

  RETURN v_result; -- returns NULL if not found / already used
END;
$$;

-- Allow anyone (including anon) to call this function
GRANT EXECUTE ON FUNCTION public.validate_judge_token(TEXT) TO anon, authenticated;
