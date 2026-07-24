require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testUpload() {
  const provider = process.env.EXPO_PUBLIC_STORAGE_PROVIDER || 'r2';
  console.log('Resolved storage provider from env:', provider);

  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  if (authErr) throw authErr;
  
  const festivalId = 'test-festival';
  const participantId = 'test-participant';
  const objectKey = `festivals/${festivalId}/profiles/${participantId}/test-photo-${Date.now()}.png`;
  const contentType = 'image/png';
  const fileContent = Buffer.from('fake image content', 'utf-8');

  if (provider === 'r2') {
    console.log('Using R2 Storage Backend. Requesting presigned URL...');
    const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign', {
      body: { objectKey, contentType, operation: 'upload' }
    });
    
    if (presignError) throw presignError;
    
    console.log('R2 upload starting:');
    console.log('- bucket:', presignData.bucket || 'sahi-assets');
    console.log('- objectKey:', objectKey);
    
    const uploadUrl = presignData.url;
    console.log('- upload URL Host:', new URL(uploadUrl).host);
    console.log('- upload URL Path:', new URL(uploadUrl).pathname);
    
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: fileContent
    });
    
    console.log('\nUpload complete. Status:', res.status);
    console.log('Upload ETag:', res.headers.get('etag'));
    
    console.log('\nVerifying via R2...');
    const { data: verifyData } = await supabase.functions.invoke('r2-presign', {
      body: { objectKey, contentType, operation: 'verify' }
    });
    console.log('R2 upload verified:');
    console.log('- verifiedETag:', verifyData.eTag);
    console.log('- contentLength:', verifyData.contentLength);
    
    const publicUrl = verifyData.publicUrl || presignData.publicUrl;
    console.log('\nSaved photo_url:', publicUrl);
    
  } else {
    console.log('Using Supabase Storage Backend. Uploading directly...');
    const { data, error } = await supabase.storage.from('sahi-assets').upload(objectKey, fileContent, {
      contentType,
      upsert: true
    });
    
    if (error) throw error;
    console.log('Upload data:', data);
    
    const { data: pubData } = supabase.storage.from('sahi-assets').getPublicUrl(objectKey);
    console.log('Saved photo_url:', pubData.publicUrl);
  }
}

testUpload().catch(console.error);
