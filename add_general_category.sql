-- 1. Update the participants table constraint
ALTER TABLE participants DROP CONSTRAINT IF EXISTS chk_category_code;

ALTER TABLE participants ADD CONSTRAINT chk_category_code 
CHECK (category_code IN ('LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'));

-- 2. Update the point_table constraint if it exists (just in case)
ALTER TABLE point_table DROP CONSTRAINT IF EXISTS point_table_category_code_check;

ALTER TABLE point_table ADD CONSTRAINT point_table_category_code_check 
CHECK (category_code IN ('LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'));

-- 3. Also add it to the categories master table if not present
INSERT INTO categories (code, name_ml, age_min, age_max, gender, is_active)
SELECT 'GENERAL', 'ജനറൽ', NULL, NULL, 'both', true
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'GENERAL');
