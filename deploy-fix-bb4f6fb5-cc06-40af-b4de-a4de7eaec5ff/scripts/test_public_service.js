const { buildPublicFestivalContext } = require('../src/services/publicAiService');

// Setup environment variables before importing supabase client
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://szhwkngspodujiqzblab.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

async function run() {
  const festivalId = 'e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6';
  console.log('Calling buildPublicFestivalContext...');
  const context = await buildPublicFestivalContext(festivalId);
  console.log('Resulting Context:\n', context);
}

run();
