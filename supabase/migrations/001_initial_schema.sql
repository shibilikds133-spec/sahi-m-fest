-- Tenant isolation
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text, -- unit/sector/division/district
  subscription_status text DEFAULT 'trial',
  subscription_end timestamptz,
  contact_phone text,
  contact_email text,
  created_at timestamptz DEFAULT now()
);

-- Festival instance per level
CREATE TABLE festival_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_year int DEFAULT 2025,
  level text, -- unit/sector/division/district
  custom_name text,
  start_date date,
  end_date date,
  registration_open date,
  registration_close date,
  result_publish_date date,
  is_active boolean DEFAULT true,
  source text DEFAULT 'handbook' -- handbook/custom
);

-- Categories (9 categories from handbook)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code text, -- LP/UP/HS/HSS/JR/SR/GN/CA/CG/CGP
  name_ml text,
  class_min int,
  class_max int,
  age_min int,
  age_max int,
  gender text DEFAULT 'both', -- both/boys/girls
  is_active boolean DEFAULT true
);

-- Items (183 from handbook)
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  item_code text,
  item_name_ml text,
  item_name_en text,
  item_type text, -- stage/offstage
  participation_type text, -- individual/group
  category_codes text[], -- ['LP','UP'] etc
  gender text DEFAULT 'both',
  duration_minutes int,
  group_min_members int,
  group_max_members int,
  level_availability text[], -- ['unit','sector','division','district']
  -- Handbook-specific flags
  daf_allowed boolean DEFAULT false,
  white_dress_required boolean DEFAULT false,
  organizer_provides_material boolean DEFAULT false,
  paper_size text, -- A4/Demi/null
  drawing_topic text,
  speech_topics jsonb,
  book_by_level jsonb, -- {"unit": "book1", "district": "book2"}
  originality_required boolean DEFAULT false,
  regional_dialect_blocked boolean DEFAULT false,
  calligraphy_style text, -- khatt_suluth
  ishal_required boolean DEFAULT false, -- Mappilappattu
  members_locked_after text, -- division level
  -- Custom
  source text DEFAULT 'handbook',
  is_active boolean DEFAULT true,
  custom_rules text
);

-- Points config (flexible)
CREATE TABLE points_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  rank_1_points int DEFAULT 10,
  rank_2_points int DEFAULT 7,
  rank_3_points int DEFAULT 5,
  grade_a_plus_points int DEFAULT 4,
  grade_a_points int DEFAULT 3,
  grade_b_points int DEFAULT 2,
  grade_c_points int DEFAULT 1,
  participation_points int DEFAULT 0,
  less_than_3_teams_rule boolean DEFAULT true
);

-- Scoring criteria (flexible per item)
CREATE TABLE scoring_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  item_id uuid REFERENCES items(id),
  criteria_name text,
  max_marks int,
  display_order int,
  is_active boolean DEFAULT true,
  source text DEFAULT 'handbook'
);

-- Participants
CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  unit_org_id uuid,
  name text NOT NULL,
  gender text,
  dob date,
  category_code text,
  photo_url text,
  chest_number text, -- Auto-generated: LP-001
  unique_code text,
  registered_by text DEFAULT 'admin', -- admin/self
  status text DEFAULT 'pending', -- pending/approved/rejected
  plagiarism_ban_until date, -- Rule 1: 2-year ban
  id_card_uploaded boolean DEFAULT false,
  residence_changed boolean DEFAULT false, -- Rule 31
  sector_certificate_url text, -- Rule 31 residence change
  is_campus_parallel boolean DEFAULT false, -- Rule 29
  institution_name text, -- Campus Parallel institution
  created_at timestamptz DEFAULT now()
);

-- Item Registrations
CREATE TABLE registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  item_id uuid REFERENCES items(id),
  participant_id uuid REFERENCES participants(id),
  unit_org_id uuid,
  status text DEFAULT 'pending',
  approved_by uuid,
  code_letter text, -- A/B/C... (random draw)
  is_group_registration boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Group members
CREATE TABLE group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES registrations(id),
  participant_id uuid REFERENCES participants(id),
  is_locked boolean DEFAULT false -- Locked after Division
);

-- Venues
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  name text,
  venue_type text, -- stage/hall/open
  capacity int,
  location text
);

-- Schedules
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  item_id uuid REFERENCES items(id),
  venue_id uuid REFERENCES venues(id),
  start_time timestamptz,
  end_time timestamptz,
  judge_panel_id uuid,
  status text DEFAULT 'scheduled', -- scheduled/live/completed
  buffer_minutes int DEFAULT 15
);

-- Judges
CREATE TABLE judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  name text,
  phone text,
  specialization text[],
  login_user_id uuid,
  handbook_received boolean DEFAULT false -- Handbook Page 9
);

-- Mark entries (3 judges minimum)
CREATE TABLE mark_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  schedule_id uuid REFERENCES schedules(id),
  judge_id uuid REFERENCES judges(id),
  registration_id uuid REFERENCES registrations(id),
  criteria_scores jsonb, -- {"content": 40, "delivery": 30}
  total_mark numeric,
  is_draft boolean DEFAULT true,
  is_final boolean DEFAULT false,
  submitted_at timestamptz,
  -- 30 min rule: records_ready_at = competition_end + 30min
  competition_end_time timestamptz
);

-- Results
CREATE TABLE results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  item_id uuid REFERENCES items(id),
  registration_id uuid REFERENCES registrations(id),
  total_score numeric,
  rank int, -- null if < 3 teams (Rule 12)
  grade text, -- A+/A/B/C (≥90/≥75/≥60/≥50)
  points_awarded int,
  grade_only boolean DEFAULT false, -- < 3 teams rule
  published boolean DEFAULT false,
  published_at timestamptz,
  published_by uuid,
  meets_state_standard boolean, -- Rule 25
  audit_log jsonb
);

-- Point table
CREATE TABLE point_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  org_id uuid,
  category_code text,
  total_points int DEFAULT 0,
  gold_count int DEFAULT 0,
  silver_count int DEFAULT 0,
  bronze_count int DEFAULT 0,
  last_updated timestamptz
);

-- Announcements
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  title text,
  message text,
  type text, -- general/result/venue_change/emergency
  target_role text, -- all/admin/judge/participant/volunteer
  created_at timestamptz DEFAULT now()
);

-- Attendance/Check-in
CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  participant_id uuid REFERENCES participants(id),
  schedule_id uuid REFERENCES schedules(id),
  checkin_time timestamptz,
  checkin_method text, -- qr/manual
  status text DEFAULT 'present'
);

-- Certificates
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  participant_id uuid REFERENCES participants(id),
  item_id uuid REFERENCES items(id),
  certificate_type text, -- participation/winner/merit
  pdf_url text,
  grade text,
  generated_at timestamptz
);

-- Data transfer log
CREATE TABLE transfer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id uuid,
  to_tenant_id uuid,
  transfer_method text, -- api/qr/file/manual
  transferred_by uuid,
  participant_count int,
  status text,
  errors_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Audit log
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  action text,
  table_name text,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz DEFAULT now()
);
