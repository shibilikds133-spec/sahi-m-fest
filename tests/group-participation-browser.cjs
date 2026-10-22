// Synthetic session/API fixtures. All non-local requests are intercepted.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('../output/group-flow-db/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'../output/group-flow-web'),out=path.resolve(__dirname,'../output/group-flow-validation');
const id=n=>String(n).padStart(32,'0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
const festival={id:id(11),tenant_id:id(1),is_active:true,general_category_enabled:true,custom_name:'Fixture Festival',level:'unit',festival_year:2026};
const people=['Amina','Hana'].map((name,index)=>({id:id(31+index),name,chest_number:String(101+index),profile_slug:name.toLowerCase(),tenant_id:id(1),festival_id:id(11),organisation_id:id(21),status:'approved',gender:'male',category_code:'HS',organisations:{name:'Test Team'}}));
const item=(n,name,type,code)=>({id:id(n),item_code:`TEST-${n}`,item_name_en:name,item_name_ml:name,participation_type:type,category_codes:[code],is_active:true,group_min_members:4,group_max_members:4,gender:'both'});
const items=[item(41,'HS group song','group','HS'),item(42,'General group song','group','GN'),item(43,'General solo speech','individual','GN'),item(44,'HS solo speech','individual','HS')];
let groupRows=[],createRequest,editRequest,portalRequest,portalMode=false;
async function waitText(page,text){try{await page.waitForFunction(t=>document.body.innerText.includes(t),{timeout:12000},text);}catch(error){throw new Error('Expected '+text+'; body: '+await page.evaluate(()=>document.body.innerText));}}
async function clickText(page,text){const found=await page.evaluate(t=>{
  const e=[...document.querySelectorAll('*')].filter(x=>x.childElementCount===0&&x.textContent===t&&x.getBoundingClientRect().height>0).at(-1);
  if(!e)return false;(e.closest('[role="button"],[role="checkbox"],[role="radio"],button')||e.parentElement).click();return true;
},text);assert.ok(found,'Missing action: '+text);}
async function clickCard(page,name,label){assert.ok(await page.evaluate(({name,label})=>{
  let e=[...document.querySelectorAll('*')].find(x=>x.childElementCount===0&&x.textContent===name);
  for(;e;e=e.parentElement){const target=[...e.querySelectorAll('*')].find(x=>x.childElementCount===0&&x.textContent===label);if(target){(target.closest('[role="button"],button')||target.parentElement).click();return true;}}return false;
},{name,label}));}
(async()=>{
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:375,height:800});
  await page.evaluateOnNewDocument(uid=>{const exp=Math.floor(Date.now()/1000)+3600,token=btoa('{}')+'.'+btoa(JSON.stringify({sub:uid,exp}))+'.test';
    localStorage.setItem('sb-group-flow-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only',token_type:'bearer',expires_at:exp,expires_in:3600,user:{id:uid,email:'test@example.invalid',app_metadata:{},user_metadata:{}}}));
  },id(91));
  await page.setRequestInterception(true);page.on('request',async request=>{
    if(request.url().startsWith(base)||request.url().startsWith('data:'))return request.continue();
    if(!request.url().startsWith('https://group-flow-test.invalid/'))return request.abort();
    const respond=(data,status=200)=>request.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(data)});
    if(request.method()==='OPTIONS')return respond(null,204);
    const url=new URL(request.url()),key=url.pathname.split('/').at(-1);let data=[];
    if(key==='profiles')data={id:id(91),role:portalMode?'team_leader':'admin',tenant_id:id(1),is_superadmin:false};
    else if(key==='get_my_access_status')data={access_disabled:false};
    else if(key==='festival_calendar')data=festival;
    else if(key==='participants')data=people;
    else if(key==='items')data=items;
    else if(key==='get_visible_organisations')data=[{id:id(21),tenant_id:id(1)}];
    else if(key==='registrations')data=url.searchParams.has('entry_kind')?groupRows:[{id:id(71),item_id:id(42),participant_id:id(31),status:'approved'}];
    else if(key==='get_team_leader_context_details')data=[{assignment_id:id(90),parent_tenant_id:id(1),festival_id:id(11),festival_team_id:id(22),organisation_id:id(21),team_name:'Test Team',festival_name:'Fixture Festival'}];
    else if(key==='get_team_leader_participants')data=people;
    else if(key==='get_team_leader_programs')data=items.map(i=>({...i,item_id:i.id,entry_kind:i.participation_type==='group'?'general_team':'participant',is_eligible:true,is_assigned:false,team_entry_count:0}));
    else if(key==='festival_teams')data={portal_primary_color:null,portal_accent_color:null};
    else if(key==='team_leader_create_general_entry'){
      portalRequest=JSON.parse(request.postData());assert.deepEqual(portalRequest.p_participant_ids,[id(32),id(31)]);
      data={registration_id:id(63),entry_chest_number:'102',member_count:2};
    }
    else if(key==='create_general_team_entry'){
      createRequest=JSON.parse(request.postData());assert.deepEqual(createRequest.p_participant_ids,[id(32),id(31)]);
      groupRows=[{id:id(61),entry_chest_number:null,group_leader_participant_id:id(32),leader:people[1],organisation_id:id(21),organisation:{name:'Test Team'},item:items[0],members:[people[1],people[0]].map(p=>({participant_id:p.id,participant:p}))}];
      data={registration_id:id(61),entry_chest_number:'102',member_count:2,leader_participant_id:id(32)};
    } else if(key==='update_group_team_roster') {
      editRequest=JSON.parse(request.postData());assert.equal(editRequest.p_leader_participant_id,id(31));assert.equal(editRequest.p_expected_leader_participant_id,id(32));
      assert.deepEqual(editRequest.p_participant_ids,[id(31)]);groupRows[0].members=[{participant_id:id(31),participant:people[0]}];groupRows[0].leader=people[0];groupRows[0].group_leader_participant_id=id(31);
      data={registration_id:id(61),entry_chest_number:'101',member_count:1,changed:true};
    }
    return respond(data);
  });
  await page.goto(base+'/participants/programs',{waitUntil:'networkidle0'});await waitText(page,'General solo speech');
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('HS group song')),false);
  await clickText(page,'Group');await waitText(page,'HS group song');await waitText(page,'General group song');
  await waitText(page,'legacy assignment(s)');await clickCard(page,'General group song','View participants');await waitText(page,'Legacy assignments — review before converting');await page.click('[aria-label="Close"]');
  await clickCard(page,'HS group song','Assign participants');await waitText(page,'The first selected member becomes Team Leader.');
  await clickText(page,'Hana');await clickText(page,'Amina');await waitText(page,'Team Leader: Hana');await clickText(page,'Create team entry');await waitText(page,'Team Leader chest number: 102');assert.ok(createRequest);
  await page.goto(base+'/participants/general-entries?edit='+id(61),{waitUntil:'networkidle0'});await waitText(page,'Edit team members');
  for(const width of [320,375,768,1024,1440]) {
    await page.setViewport({width,height:800});await new Promise(r=>setTimeout(r,200));
    const measurement=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      save:[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent==='Save members')?.getBoundingClientRect().toJSON()}));
    assert.equal(measurement.overflow,false,`Overflow at ${width}`);
    assert.ok(measurement.save&&measurement.save.top>=0&&measurement.save.bottom<=800,`Save action outside viewport at ${width}`);
    await page.screenshot({path:path.join(out,`group-roster-${width}.png`),fullPage:true});
  }
  await page.setViewport({width:320,height:568});await new Promise(r=>setTimeout(r,150));
  assert.ok(await page.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent==='Save members');const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));
  await page.screenshot({path:path.join(out,'group-roster-short-phone.png'),fullPage:true});
  await page.setViewport({width:375,height:800});await clickText(page,'Hana');await waitText(page,'Select a Team Leader from the saved members');
  assert.equal(editRequest,undefined);await clickText(page,'Set leader: Amina');await clickText(page,'Save members');await waitText(page,'roster updated.');assert.ok(editRequest);
  portalMode=true;await page.goto(base+'/team/programs',{waitUntil:'networkidle0'});await waitText(page,'General solo speech');
  await clickText(page,'Group');await waitText(page,'HS group song');await clickCard(page,'HS group song','Select team');
  await waitText(page,'Choose group members');await clickText(page,'Hana');await clickText(page,'Amina');await waitText(page,'Leader: Hana');
  await clickText(page,'Create group entry');await waitText(page,'Leader chest: 102');assert.ok(portalRequest);
  assert.deepEqual(errors,[]);
  console.log('PASS: admin/portal General individual + all-category group programs, legacy visibility, first-selected leader, explicit replacement, API payloads, roster layout at 320/375/768/1024/1440 widths and 320x568 phone.');
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
