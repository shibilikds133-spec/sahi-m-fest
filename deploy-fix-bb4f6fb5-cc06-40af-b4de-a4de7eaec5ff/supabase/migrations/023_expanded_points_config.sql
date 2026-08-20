-- Migration: Add group points to points_config
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS ind_a_plus_points int DEFAULT 6;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS ind_a_points int DEFAULT 5;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS ind_b_points int DEFAULT 3;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS ind_c_points int DEFAULT 1;

ALTER TABLE points_config ADD COLUMN IF NOT EXISTS grp_a_plus_points int DEFAULT 18;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS grp_a_points int DEFAULT 15;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS grp_b_points int DEFAULT 10;
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS grp_c_points int DEFAULT 5;
