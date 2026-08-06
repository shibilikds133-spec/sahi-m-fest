-- Team Leader Portal security/data foundation.
-- This migration creates only the festival-scoped mapping and read-only
-- access contracts. It does not create Team/House/Department master rows.

BEGIN;

-- The existing organisations hierarchy remains the canonical identity source.
-- Team Leaders are a distinct application role, but their access is always
-- mediated by a festival_team mapping and an active assignment.
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.profiles'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%team_leader%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_allowed_check
  CHECK (role IN ('admin', 'judge', 'volunteer', 'participant', 'team_leader'));

CREATE TABLE public.festival_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT festival_teams_unique_mapping UNIQUE (festival_id, organisation_id)
);

CREATE INDEX festival_teams_parent_festival_idx
  ON public.festival_teams(parent_tenant_id, festival_id)
  WHERE is_active;

CREATE TABLE public.team_leader_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_team_id uuid NOT NULL REFERENCES public.festival_teams(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'revoked')),
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_leader_assignment_valid_window
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX team_leader_one_active_per_team_idx
  ON public.team_leader_assignments(festival_team_id)
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE UNIQUE INDEX team_leader_one_active_assignment_per_festival_idx
  ON public.team_leader_assignments(user_id, (festival_team_id))
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE INDEX team_leader_assignments_user_status_idx
  ON public.team_leader_assignments(user_id, status, valid_from, valid_until);

CREATE TABLE public.team_portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id),
  is_enabled boolean NOT NULL DEFAULT false,
  opens_at timestamptz,
  closes_at timestamptz,
  maintenance_message text,
  access_disabled_message text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_portal_settings_unique_festival UNIQUE (parent_tenant_id, festival_id),
  CONSTRAINT team_portal_settings_window_check
    CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at),
  CONSTRAINT team_portal_settings_configuration_object
    CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE OR REPLACE FUNCTION public.validate_festival_team_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_festival_tenant uuid;
  v_root_org uuid;
  v_valid_org boolean;
BEGIN
  SELECT f.tenant_id, t.organisation_id
    INTO v_festival_tenant, v_root_org
  FROM public.festival_calendar f
  LEFT JOIN public.tenants t ON t.id = NEW.parent_tenant_id
  WHERE f.id = NEW.festival_id;

  IF v_festival_tenant IS NULL OR v_festival_tenant IS DISTINCT FROM NEW.parent_tenant_id THEN
    RAISE EXCEPTION 'Festival team must use the festival parent tenant.';
  END IF;

  IF v_root_org IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = NEW.organisation_id
        AND o.tenant_id = NEW.parent_tenant_id
        AND o.archived_at IS NULL
    ) INTO v_valid_org;
  ELSE
    WITH RECURSIVE org_tree AS (
      SELECT o.id
      FROM public.organisations o
      WHERE o.id = v_root_org AND o.archived_at IS NULL
      UNION ALL
      SELECT child.id
      FROM public.organisations child
      JOIN org_tree parent ON parent.id = child.parent_id
      WHERE child.archived_at IS NULL
    )
    SELECT EXISTS (
      SELECT 1 FROM org_tree WHERE id = NEW.organisation_id
    ) INTO v_valid_org;
  END IF;

  IF NOT COALESCE(v_valid_org, false) THEN
    RAISE EXCEPTION 'Organisation is not an active organisation in the parent tenant hierarchy.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_festival_team_mapping
  BEFORE INSERT OR UPDATE OF parent_tenant_id, festival_id, organisation_id
  ON public.festival_teams
  FOR EACH ROW EXECUTE FUNCTION public.validate_festival_team_mapping();

CREATE OR REPLACE FUNCTION public.validate_team_leader_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role text;
  v_team_active boolean;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF v_role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'Assigned user must have the team_leader role.';
  END IF;

  SELECT ft.is_active INTO v_team_active
  FROM public.festival_teams ft
  WHERE ft.id = NEW.festival_team_id;

  IF NOT COALESCE(v_team_active, false) THEN
    RAISE EXCEPTION 'Team Leader assignment requires an active festival team.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_leader_assignments existing
    JOIN public.festival_teams existing_team
      ON existing_team.id = existing.festival_team_id
    WHERE existing.user_id = NEW.user_id
      AND existing_team.festival_id = (
        SELECT festival_id FROM public.festival_teams WHERE id = NEW.festival_team_id
      )
      AND existing.status = 'active'
      AND existing.revoked_at IS NULL
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'A Team Leader may have only one active team assignment per festival.';
  END IF;

  IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_team_leader_assignment
  BEFORE INSERT OR UPDATE OF festival_team_id, user_id, status, valid_from, valid_until
  ON public.team_leader_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_leader_assignment();

CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role = 'team_leader'
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_context()
RETURNS TABLE (
  assignment_id uuid,
  parent_tenant_id uuid,
  festival_id uuid,
  festival_team_id uuid,
  organisation_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id, ft.parent_tenant_id, ft.festival_id, ft.id, ft.organisation_id
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid()
    AND p.role = 'team_leader'
    AND a.status = 'active'
    AND a.revoked_at IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active
    AND f.is_active
    AND COALESCE(s.is_enabled, false)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_participants()
RETURNS TABLE (
  id uuid,
  name text,
  gender text,
  category_code text,
  chest_number text,
  status text,
  festival_id uuid,
  organisation_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.name, p.gender, p.category_code, p.chest_number,
         p.status, p.festival_id, p.organisation_id
  FROM public.participants p
  JOIN public.get_team_leader_context() c
    ON c.festival_id = p.festival_id AND c.organisation_id = p.organisation_id;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_schedule()
RETURNS TABLE (
  schedule_id uuid,
  item_id uuid,
  item_code text,
  item_name text,
  category_codes text[],
  venue_name text,
  start_time timestamptz,
  end_time timestamptz,
  event_status text,
  participant_count bigint,
  checked_in_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.item_id, i.item_code,
         COALESCE(i.item_name_en, i.item_name_ml), i.category_codes,
         v.name, s.start_time, s.end_time, s.status,
         COUNT(DISTINCT p.id),
         COUNT(DISTINCT r.id) FILTER (WHERE r.is_verified IS TRUE)
  FROM public.schedules s
  JOIN public.get_team_leader_context() c
    ON c.festival_id = s.festival_id
  JOIN public.items i ON i.id = s.item_id
  LEFT JOIN public.venues v ON v.id = s.venue_id
  LEFT JOIN public.registrations r
    ON r.festival_id = s.festival_id
   AND r.item_id = s.item_id
   AND r.organisation_id = c.organisation_id
   AND r.status NOT IN ('rejected', 'cancelled')
  LEFT JOIN public.participants p ON p.id = r.participant_id
  -- Check-in UI uses registrations.is_verified as the canonical signal.
  GROUP BY s.id, s.item_id, i.item_code, i.item_name_en, i.item_name_ml,
           i.category_codes, v.name, s.start_time, s.end_time, s.status
  ORDER BY s.start_time NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
RETURNS TABLE (
  result_id uuid,
  item_code text,
  item_name text,
  participant_name text,
  rank int,
  grade text,
  points_awarded int,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT res.id, i.item_code,
         COALESCE(i.item_name_en, i.item_name_ml), p.name,
         res.rank, res.grade, res.points_awarded, res.published_at
  FROM public.results res
  JOIN public.get_team_leader_context() c ON c.festival_id = res.festival_id
  JOIN public.items i ON i.id = res.item_id
  JOIN public.registrations r ON r.id = res.registration_id
  LEFT JOIN public.participants p ON p.id = r.participant_id
  WHERE res.published IS TRUE
    AND res.result_status = 'published'
    AND res.public_visible IS TRUE
    AND r.organisation_id = c.organisation_id
  ORDER BY res.published_at DESC NULLS LAST, res.rank NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_standings()
RETURNS TABLE (
  rank bigint,
  organisation_id uuid,
  team_name text,
  total_points bigint,
  is_own_team boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH ctx AS (SELECT * FROM public.get_team_leader_context()),
  official AS (
    SELECT * FROM public.get_public_leaderboard(
      (SELECT parent_tenant_id FROM ctx),
      (SELECT festival_id FROM ctx)
    )
  ),
  teams AS (
    SELECT ft.organisation_id, o.name
    FROM public.festival_teams ft
    JOIN public.organisations o ON o.id = ft.organisation_id
    JOIN ctx ON ctx.festival_id = ft.festival_id
    WHERE ft.is_active
  )
  SELECT DENSE_RANK() OVER (
           ORDER BY COALESCE(official.total_points, 0) DESC,
                    COALESCE(official.first_place_count, 0) DESC,
                    COALESCE(official.second_place_count, 0) DESC,
                    teams.name ASC
         ),
         teams.organisation_id,
         teams.name,
         COALESCE(official.total_points, 0)::bigint,
         (teams.organisation_id = (SELECT organisation_id FROM ctx))
  FROM teams
  LEFT JOIN official ON official.organisation_id = teams.organisation_id
  ORDER BY 1, teams.name;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_announcements()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  type text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id, a.title, a.message, a.type, a.created_at
  FROM public.announcements a
  JOIN public.get_team_leader_context() c
    ON c.festival_id = a.festival_id AND c.parent_tenant_id = a.tenant_id
  WHERE a.target_role IN ('all', 'team_leader', 'participant')
  ORDER BY a.created_at DESC;
$$;

-- These tables previously had RLS disabled. Add the existing tenant-scoped
-- authenticated access paths before enabling RLS; the Team Leader
-- RESTRICTIVE policies below still block direct access for that role.
CREATE POLICY team_foundation_schedules_tenant_access ON public.schedules
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY team_foundation_venues_tenant_access ON public.venues
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY team_foundation_attendance_tenant_access ON public.attendance
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY team_foundation_point_table_tenant_access ON public.point_table
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY team_foundation_announcements_tenant_access ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY team_foundation_group_members_tenant_access ON public.group_members
  FOR ALL TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = group_members.registration_id
        AND r.tenant_id = public.get_my_tenant_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = group_members.registration_id
        AND r.tenant_id = public.get_my_tenant_id()
    )
  );

-- Public schedule pages query schedules/venues directly. Expose only rows
-- that the existing public schedule contract treats as visible; no writes.
CREATE POLICY team_foundation_public_schedule_read ON public.schedules
  FOR SELECT TO anon
  USING (
    status IN ('scheduled', 'ongoing', 'in_progress')
    AND EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = schedules.festival_id AND f.is_active IS TRUE
    )
  );

CREATE POLICY team_foundation_public_venue_read ON public.venues
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.venue_id = venues.id
      AND s.status IN ('scheduled', 'ongoing', 'in_progress')
      AND EXISTS (
        SELECT 1 FROM public.festival_calendar f
        WHERE f.id = s.festival_id AND f.is_active IS TRUE
      )
  ));

ALTER TABLE public.festival_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_leader_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY festival_teams_admin_manage ON public.festival_teams
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR parent_tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR parent_tenant_id = public.get_my_tenant_id());

CREATE POLICY festival_teams_team_leader_read ON public.festival_teams
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_leader_assignments a
    WHERE a.festival_team_id = id
      AND a.user_id = auth.uid()
      AND a.status = 'active'
      AND a.revoked_at IS NULL
  ));

CREATE POLICY team_leader_assignments_admin_manage ON public.team_leader_assignments
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.festival_teams ft
    WHERE ft.id = festival_team_id AND ft.parent_tenant_id = public.get_my_tenant_id()
  ))
  WITH CHECK (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.festival_teams ft
    WHERE ft.id = festival_team_id AND ft.parent_tenant_id = public.get_my_tenant_id()
  ));

CREATE POLICY team_leader_assignments_self_read ON public.team_leader_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY team_portal_settings_admin_manage ON public.team_portal_settings
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR parent_tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR parent_tenant_id = public.get_my_tenant_id());

CREATE POLICY team_portal_settings_team_leader_read ON public.team_portal_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.team_leader_assignments a
    JOIN public.festival_teams ft ON ft.id = a.festival_team_id
    WHERE a.user_id = auth.uid()
      AND a.status = 'active'
      AND a.revoked_at IS NULL
      AND ft.parent_tenant_id = parent_tenant_id
      AND ft.festival_id = festival_id
  ));

-- Existing permissive tenant policies must not grant Team Leaders direct
-- access to core tables. Their secure RPCs above are the only data path.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'profiles', 'tenants', 'organisations', 'festival_calendar', 'participants',
    'registrations', 'group_members', 'items', 'categories', 'schedules',
    'venues', 'attendance', 'results', 'mark_entries', 'point_table',
    'announcements'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_team_leader()) WITH CHECK (NOT public.is_team_leader())',
      'deny_team_leader_direct_' || v_table, v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_festival_team_mapping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_team_leader_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_team_leader() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_participants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_published_results() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_standings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_announcements() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_team_leader_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_published_results() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_standings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_announcements() TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
