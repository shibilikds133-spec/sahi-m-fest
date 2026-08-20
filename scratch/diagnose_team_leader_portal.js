const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Authenticating...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  if (authErr) {
    console.error('Auth Error:', authErr.message);
    return;
  }
  
  // Hardcode a festival known to have participants
  const festivalId = '550e8400-e29b-41d4-a716-446655440000';
  const tenantId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  // A. festival-only participant count
  const { count: countA, error: errA } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('festival_id', festivalId);

  // B. tenant-only participant count
  const { count: countB, error: errB } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // C. festival+tenant participant count
  const { count: countC, error: errC } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('festival_id', festivalId)
    .eq('tenant_id', tenantId);

  // D. working listParticipants count
  const { count: countD, error: errD } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true });

  console.log('festival-only row count:', countA, errA ? errA.message : '');
  console.log('tenant-only row count:', countB, errB ? errB.message : '');
  console.log('festival+tenant row count:', countC, errC ? errC.message : '');
  console.log('working listParticipants row count:', countD, errD ? errD.message : '');
  
  // Teams
  const { count: teamsCount } = await supabase
    .from('festival_teams')
    .select('*', { count: 'exact', head: true })
    .eq('festival_id', festivalId);
    
  const { count: activeTeamsCount } = await supabase
    .from('festival_teams')
    .select('*', { count: 'exact', head: true })
    .eq('festival_id', festivalId)
    .eq('is_active', true);
    
  console.log('Festival teams count:', teamsCount);
  console.log('Active teams count:', activeTeamsCount);
  
}

run();
