// Synthetic API/session fixtures only. Build with general-group-test.invalid;
// every external request is intercepted, so this never touches a live project.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const web=path.resolve(__dirname,'../output/general-group-web');
const out=path.resolve(__dirname,'../output/general-group-validation');
const id=n=>String(n).padStart(32,'0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
const children=['Amina Abdulla','Hana Muhammed','Zara Ali'];
const festival={id:id(11),tenant_id:id(1),is_active:true,general_category_enabled:true,custom_name:'Test Festival',level:'unit',festival_year:2026};
const profile={profile:{id:id(31),slug:'amina',name:children[0],category_code:'HS',organisation_name:'Test Team'},
 participated_items:[{registration_id:id(61),item_id:id(42),item_name:'Solo competition',category_codes:['HS'],participation_type:'individual'},
 {registration_id:id(62),item_id:id(41),item_name:'General group competition',category_codes:['GN'],participation_type:'group',entry_kind:'general_team',entry_chest_number:'1001'}],
 published_results:[{result_id:id(71),item_name:'Solo competition',rank:1,grade:'A',points_awarded:5}]};
const entry={id:id(62),schedule_id:id(51),item_id:id(41),participant_id:null,organisation_id:id(21),status:'approved',is_verified:false,
 code_letter:null,entry_kind:'general_team',entry_chest_number:'1001',participant_name:'Test Team',participant_chest_number:'1001',participant_category_code:'GN',
 organisation_name:'Test Team',members:children.map((name,i)=>({name,chest_number:String(101+i)}))};
const groupCard={id:id(62),entry_chest_number:'1001',organisation_id:id(21),organisation:{name:'Test Team'},
 item:{id:id(41),item_code:'TRL',item_name_en:'General group competition',item_name_ml:null,group_min_members:2,group_max_members:3,gender:'both'},
 members:children.slice(0,2).map((name,i)=>({participant_id:id(31+i),participant:{id:id(31+i),name,chest_number:String(101+i)}}))};
let failCards=false,emptyCards=false,hiddenProfile=false,locked=false,verification;
const seen=[];
async function clickText(page,text){const ok=await page.evaluate(text=>{
 const el=[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0&&e.textContent===text).at(-1);
 if(!el)return false;(el.closest('[role="button"],button')||el.parentElement).click();return true;
},text);assert.ok(ok,'Missing action: '+text);}
async function text(page,value){try{await page.waitForFunction(v=>document.body.innerText.includes(v),{timeout:10000},value);}
 catch(e){throw new Error(e.message+' Expected '+value+'; body='+await page.evaluate(()=>document.body.innerText));}}
async function capture(page,label,focusText){for(const width of [320,375,768,1024,1440]){
 await page.setViewport({width,height:900});await new Promise(r=>setTimeout(r,300));
 if(focusText)await page.evaluate(text=>{const el=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent.includes(text));el?.scrollIntoView({block:'center'});},focusText);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 assert.equal(overflow,false,`${label} horizontal overflow at ${width}`);
 await page.screenshot({path:path.join(out,`${label}-${width}.png`),fullPage:true});
}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const server=http.createServer((req,res)=>{
 let file=path.resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(web+path.sep)&&file!==web){res.writeHead(403).end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(web,'index.html');
 res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(({uid})=>{
 const exp=Math.floor(Date.now()/1000)+3600;const token=btoa('{}')+'.'+btoa(JSON.stringify({sub:uid,exp}))+'.test';
 localStorage.setItem('sb-general-group-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only',token_type:'bearer',expires_at:exp,expires_in:3600,user:{id:uid,email:'test@example.invalid',app_metadata:{},user_metadata:{}}}));
 window.print=()=>{};
 },{uid:id(91)});
 await page.setRequestInterception(true);page.on('request',async req=>{
 if(req.url().startsWith(base)||req.url().startsWith('data:')){await req.continue();return;}
 seen.push(new URL(req.url()).host+new URL(req.url()).pathname);
 if(!req.url().startsWith('https://general-group-test.invalid/')){await req.abort();return;}
 const respond=(data,status=200)=>req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(data)});
 if(req.method()==='OPTIONS'){await respond(null,204);return;}
 const url=new URL(req.url()),rpc=url.pathname.split('/').at(-1);let result=[];
 if(rpc==='get_public_candidate_profile')result=hiddenProfile?null:profile;
 else if(rpc==='get_my_access_status')result={access_disabled:false};
 else if(rpc==='get_stage_management_context')result=[{tenant_id:id(1),festival_id:id(11),festival_name:'Test Festival'}];
 else if(rpc==='get_stage_management_schedules')result=[{id:id(51),item_id:id(41),tenant_id:id(1),festival_id:id(11),item_code:'TRL',item_name_en:'General group competition',category_codes:['GN'],is_shuffle_locked:locked}];
 else if(rpc==='get_stage_management_registrations_with_letters')result=[entry];
 else if(rpc==='stage_venue_portal_data_with_letters')result={venue:{id:id(21),name:'Test Stage'},schedules:[{id:id(51),item_id:id(41),tenant_id:id(1),festival_id:id(11),venue_id:id(21),item_code:'TRL',item_name_en:'General group competition',category_codes:['GN'],status:'scheduled',is_shuffle_locked:locked}],registrations:[entry]};
 else if(rpc==='stage_venue_portal_update_registration'||rpc==='stage_update_registration'){
   const input=JSON.parse(req.postData());assert.equal(input.p_registration_id,id(62));assert.equal(input.p_schedule_id,id(51));
   assert.equal('p_participant_id' in input,false);assert.equal(input.p_action,'verify');verification=input;entry.is_verified=true;result={};
 }else if(rpc==='profiles')result={role:'admin',tenant_id:id(1),is_superadmin:false};
 else if(rpc==='festival_calendar')result=festival;
  else if(rpc==='participants')result=children.map((name,i)=>({id:id(i===2?36:31+i),name,chest_number:String(101+i),profile_slug:'child-'+i,
    festival_id:id(11),organisation_id:id(21),status:'approved',gender:'male',category_code:'HS',organisations:{name:'Test Team'}}));
  else if(rpc==='items')result=[{...groupCard.item,category_codes:['GN'],participation_type:'group',is_active:true}];
  else if(rpc==='update_general_team_roster'){
    const input=JSON.parse(req.postData());assert.equal(input.p_registration_id,id(62));
    assert.deepEqual(input.p_expected_participant_ids,[id(31),id(32)]);
    assert.deepEqual(input.p_participant_ids,[id(31),id(36)]);
    groupCard.members=[{participant_id:id(31),participant:{id:id(31),name:children[0],chest_number:'101'}},
      {participant_id:id(36),participant:{id:id(36),name:children[2],chest_number:'103'}}];
    result={registration_id:id(62),entry_chest_number:'1001',member_count:2,changed:true};
  }
 else if(rpc==='registrations'){
   assert.ok(url.searchParams.get('entry_kind')==='eq.general_team');assert.equal(url.searchParams.get('festival_id'),'eq.'+id(11));
   if(failCards){await respond({message:'Group cards temporarily unavailable'},400);return;}result=emptyCards?[]:[groupCard];
 }
 await respond(result);
 });
 await page.goto(base+'/candidate/amina',{waitUntil:'networkidle0'});await text(page,'General group · Chest 1001 · Team points only');
 await capture(page,'candidate','Team points only');
 hiddenProfile=true;await page.reload({waitUntil:'networkidle0'});await text(page,'Profile not available');hiddenProfile=false;
 await page.setViewport({width:375,height:900});
 await page.goto(base+'/stage-management/venue/'+id(21),{waitUntil:'networkidle0'});await page.waitForSelector('input');await page.type('input','1234');await clickText(page,'Continue');
 await text(page,'General group competition');await clickText(page,'Check-In');await text(page,'General group · Check in this entry once');await text(page,children[0]);await text(page,children[1]);
 await capture(page,'group-checkin');await page.setViewport({width:375,height:900});await clickText(page,'Verify');await text(page,'Undo');assert.ok(verification);
 locked=true;await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('input');await page.type('input','1234');await clickText(page,'Continue');await text(page,'General group competition');await clickText(page,'Check-In');await text(page,'read-only');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('*')].some(e=>e.childElementCount===0&&e.textContent==='Undo')),false);
 locked=false;entry.is_verified=false;
 await page.goto(base+'/stage-management/'+id(51)+'/checkin',{waitUntil:'networkidle0'});await text(page,'Verify group');await clickText(page,'Verify group');
 await text(page,'Confirm this group entry');await text(page,'One representative can check in this entry.');await capture(page,'group-verification');
 await page.setViewport({width:375,height:667});
 const bounds=await page.evaluate(()=>{
  const label=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent==='Verify');
  label.scrollIntoView({block:'center'});const rect=label.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};
 });assert.ok(bounds.top>=0&&bounds.bottom<=667,'Group verification action must remain reachable on a short phone');
 await page.screenshot({path:path.join(out,'group-verification-short-phone.png'),fullPage:true});
 await clickText(page,'Verify');await text(page,'Undo verification');
 await page.goto(base+'/participants/chest-cards',{waitUntil:'networkidle0'});await text(page,'Student cards');await clickText(page,'Student cards');await clickText(page,'Group cards');await text(page,'1001');await text(page,'TRL');
 assert.equal(await page.$$eval('.qr-wrapper',els=>els.length),0,'Group cards must not link a child candidate QR');await capture(page,'group-cards','Group cards');
 await page.pdf({path:path.join(out,'group-card-print.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
 emptyCards=true;await page.reload({waitUntil:'networkidle0'});await clickText(page,'Student cards');await clickText(page,'Group cards');await text(page,'No General group entries match these filters.');assert.equal(await page.$$eval('.qr-wrapper',els=>els.length),0);emptyCards=false;
 failCards=true;await page.reload({waitUntil:'networkidle0'});await clickText(page,'Student cards');await clickText(page,'Group cards');await text(page,'Group cards temporarily unavailable');
  failCards=false;
  await page.goto(base+'/participants/general-entries',{waitUntil:'networkidle0'});
  await text(page,'Existing entries');await text(page,'Hana Muhammed');
  const entrySearch='input[placeholder="Chest, name or program"]';
  const searchEntries=async value=>{await page.click(entrySearch);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type(value);};
  await searchEntries('not-a-real-member');await text(page,'No entries match this search.');
  for(const value of ['Hana','1001','General group']){
    await searchEntries(value);
    await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Edit members of entry 1001"]').length===1);
  }
  await clickText(page,'Edit members');await text(page,'Entry #1001');await text(page,'Zara Ali');
  await capture(page,'general-entry-editor','Edit team members');
  await page.setViewport({width:375,height:900});
  await clickText(page,'Hana Muhammed');await clickText(page,'Zara Ali');await clickText(page,'Save members');
  await text(page,'Entry 1001 roster updated.');
  await page.reload({waitUntil:'networkidle0'});await text(page,'Amina Abdulla, Zara Ali');
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Amina Abdulla, Hana Muhammed')),false,'Removed member must disappear from saved roster');
  await page.goto(base+'/participants/general-entries?edit='+id(62),{waitUntil:'networkidle0'});
  await text(page,'Edit team members');await text(page,'Zara Ali');
  assert.deepEqual(errors,[]);console.log('PASS: group identity/locks, current-roster edit, dynamic entry search, and five responsive widths.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);console.error([...new Set(seen)]);process.exitCode=1;});
