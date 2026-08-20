-- ============================================================
-- Migration 008: Superadmin Setup (Clean Fix)
-- Adds `is_superadmin` flag and securely resets the Ultimate Admin.
-- ============================================================

-- 1. Ensure `is_superadmin` column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean DEFAULT false;

-- 2. Secure Cleanup & Reset Block
DO $$ 
DECLARE
  super_email text := 'shibilikds938@gmail.com';
  super_id uuid;
BEGIN
  -- Cleanup existing broken record if any to ensure a clean state
  -- (Will naturally delete from auth.identities via foreign key if setup correctly)
  DELETE FROM auth.users WHERE email = super_email;

  -- Create fresh superadmin UUID
  super_id := gen_random_uuid();
  
  -- Insert into auth.users with explicit JSONB casting
  INSERT INTO auth.users (
    id, 
    instance_id, 
    email, 
    encrypted_password, 
    email_confirmed_at, 
    aud, 
    role, 
    raw_app_meta_data, 
    raw_user_meta_data, 
    created_at, 
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    is_super_admin
  ) VALUES (
    super_id, 
    '00000000-0000-0000-0000-000000000000', 
    super_email, 
    crypt('m1o2n3u4', gen_salt('bf')), 
    now(), 
    'authenticated', 
    'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb, 
    '{"full_name":"Ultimate Admin"}'::jsonb, 
    now(), 
    now(),
    '', '', '', false
  );

  -- Insert into auth.identities for password-login sync
  INSERT INTO auth.identities (
    id,
    user_id, 
    identity_data, 
    provider, 
    provider_id,
    last_sign_in_at,
    created_at, 
    updated_at
  ) VALUES (
    super_id,
    super_id, 
    format('{"sub":"%s","email":"%s"}', super_id, super_email)::jsonb, 
    'email', 
    super_email, -- identity provider_id for 'email' is usually the email address
    now(),
    now(), 
    now()
  );

  -- 3. Mark the user as a superadmin in public.profiles
  -- If the 'on_auth_user_created' trigger exists, it might have inserted a row.
  -- We use UPSERT/INSERT here just in case.
  INSERT INTO public.profiles (id, full_name, role, is_superadmin, tenant_id)
  VALUES (super_id, 'Ultimate Admin', 'admin', true, null)
  ON CONFLICT (id) DO UPDATE 
  SET is_superadmin = true,
      role = 'admin',
      tenant_id = null;

END $$;
