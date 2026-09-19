-- 175_public_read_generated_assets.sql
DROP POLICY IF EXISTS "Public can view generated_assets" ON public.generated_assets;
CREATE POLICY "Public can view generated_assets" ON public.generated_assets FOR SELECT TO anon USING (true);
