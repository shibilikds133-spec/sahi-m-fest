-- Team Leader login needs to read its own role/tenant profile after Auth sign-in.
-- Recreate the narrow self-read policy without widening cross-tenant access.
DROP POLICY IF EXISTS "Users can see their own profile" ON public.profiles;

CREATE POLICY "Users can see their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
