import { supabase } from './src/core/config/supabase.js';

async function checkSchema() {
  const { data, error } = await supabase.from('registrations').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample registration:', data[0]);
  }
}

checkSchema();
