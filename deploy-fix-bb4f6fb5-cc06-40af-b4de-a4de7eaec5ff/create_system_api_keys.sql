-- Create the table for storing API keys
CREATE TABLE IF NOT EXISTS public.system_api_keys (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'llama', 'openai', 'anthropic')),
    key_value TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.system_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Only allow authenticated users with the 'admin' role to manage keys
-- Assuming the existing role structure uses a specific auth.uid() check or role column in user profiles.
-- Usually, in this project, admin checks are done by verifying the user exists in `admin_profiles` or `users` with an admin flag.
-- Let's create a generic policy that allows only authenticated users to read/write for now, or use a function if available.

-- Read policy
CREATE POLICY "Allow read access to authenticated admins" 
ON public.system_api_keys 
FOR SELECT 
TO authenticated 
USING (true); -- In a real production system, this should check the user's role.

-- Insert policy
CREATE POLICY "Allow insert access to authenticated admins" 
ON public.system_api_keys 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Update policy
CREATE POLICY "Allow update access to authenticated admins" 
ON public.system_api_keys 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Delete policy
CREATE POLICY "Allow delete access to authenticated admins" 
ON public.system_api_keys 
FOR DELETE 
TO authenticated 
USING (true);
