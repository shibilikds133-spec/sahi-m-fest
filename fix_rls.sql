require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
); // Wait, this uses anon key. I need the service role key to execute raw SQL, or I can just tell the user to run it in the SQL Editor.
