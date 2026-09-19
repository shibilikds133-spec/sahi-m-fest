const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szhwkngspodujiqzblab.supabase.co';
// Need the anon key, I can just use fetch or find it in the env.
// Let's just grep for anon key in .env
