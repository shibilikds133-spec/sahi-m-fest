/* global __dirname */
// Synthetic build and intercepted APIs only; no real accounts or network data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const root=path.resolve(__dirname,'../output/global-chest-edit-web');
const output=path.resolve(__dirname,'../output/global-chest-edit-validation');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tenant=id(1),festival=id(11),user=id(101),participant=id(201),team=id(21),destination=id(22);
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
    res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.ttf':'font/ttf','.otf':'font/otf'})[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage(),errors=[],writes=[],endpoints=[];
    let current={id:participant,tenant_id:tenant,festival_id:festival,organisation_id:team,name:'Student Original',
      chest_number:'100',category_code:'HS',gender:'boys',status:'approved',is_locked:false,updated_at:'2026-10-23T00:00:00Z',
      public_profile_enabled:true,show_organisation_public:true,organisations:{id:team,name:'Team A',org_type:'unit'}};
    let stale=false;
    let chestTemplate='team';
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.evaluateOnNewDocument(({user})=>{
      const exp=Math.floor(Date.now()/1000)+3600;
      const token=btoa('{}')+'.'+btoa(JSON.stringify({sub:user,role:'authenticated',exp}))+'.test';
      localStorage.setItem('sb-participant-edit-test-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-only',token_type:'bearer',expires_at:exp,user:{id:user,email:'test@example.invalid',app_metadata:{},user_metadata:{}}}));
    },{user});
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      if(request.url().startsWith(base)||request.url().startsWith('data:')){await request.continue();return;}
      if(!request.url().startsWith('https://participant-edit-test.invalid/')){await request.abort();return;}
      const endpoint=new URL(request.url()).pathname.split('/').at(-1);
      endpoints.push(endpoint);
      const respond=(data,status=200)=>request.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(data)});
      if(request.method()==='OPTIONS'){await respond(null,204);return;}
      let result=[];
      if(endpoint==='profiles')result={role:'admin',tenant_id:tenant,is_superadmin:false};
      else if(endpoint==='user')result={id:user,email:'test@example.invalid',app_metadata:{},user_metadata:{}};
      else if(endpoint==='get_my_access_status')result={access_disabled:false};
      else if(endpoint==='festival_calendar')result={id:festival,tenant_id:tenant,festival_year:2026,level:'sector',is_active:true,festival_template:'sahithyolsav',chest_number_template:chestTemplate,chest_number_category_range:100};
      else if(endpoint==='tenants')result={id:tenant,name:'Test Festival',is_active:true};
      else if(endpoint==='participants')result=new URL(request.url()).searchParams.has('id')?current:[current];
      else if(endpoint==='get_visible_organisations'||endpoint==='organisations')result=[
        {id:id(10),tenant_id:tenant,name:'Root',org_type:'sector'},
        {id:team,parent_id:id(10),tenant_id:tenant,name:'Team A',org_type:'unit'},
        {id:destination,parent_id:id(10),tenant_id:tenant,name:'Team B with a long name',org_type:'unit'},
      ];
      else if(endpoint==='edit_participant_profile'){
        const body=JSON.parse(request.postData());writes.push(body);
        assert.equal(body.p_participant_id,participant);
        if(stale){await respond({code:'40001',message:'Participant changed after opening. Reload before saving.'},400);return;}
        current={...current,...body.p_updates,organisation_id:body.p_new_org_id,chest_number:body.p_chest_number||'200',updated_at:'2026-10-23T01:00:00Z'};
        result=current;
      } else if(request.method()!=='GET'&&['transfer_participant_team','participants'].includes(endpoint)){
        throw new Error('Profile save must use one atomic RPC');
      }
      await respond(result);
    });
    const click=async text=>{
      const found=await page.evaluate(text=>{
        const candidates=[...document.querySelectorAll('*')].filter(el=>el.textContent.trim()===text||el.getAttribute('aria-label')===text)
          .sort((a,b)=>a.children.length-b.children.length);
        const el=candidates.find(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
        if(!el)return false;el.click();return true;
      },text);
      assert.ok(found,'Button '+text+' exists');
    };
    for(const width of [1440,1024,768,390,320]){
      await page.setViewport({width,height:900});
      await page.goto(base+'/participants/'+participant,{waitUntil:'networkidle0'});
      try {
        await page.waitForFunction(()=>document.body.textContent.includes('Student Original'),{timeout:15000});
      } catch(error) {
        await page.screenshot({path:path.join(output,'failed.png')});
        console.log({url:page.url(),body:await page.evaluate(()=>document.body.innerText.slice(0,1600)),errors,endpoints});
        throw error;
      }
      await click(width>=1000?'Edit':'Edit details');
      await page.waitForSelector('input[aria-label="Chest number"]');
      const metrics=await page.$eval('input[aria-label="Chest number"]',el=>{
        const r=el.getBoundingClientRect();return{height:r.height,left:r.left,right:r.right,width:innerWidth};
      });
      assert.ok(metrics.height>=36&&metrics.height<=44,JSON.stringify(metrics));
      assert.ok(metrics.left>=0&&metrics.right<=width,JSON.stringify(metrics));
      assert.ok(await page.$('[aria-label="Select team"]'));
      await new Promise(resolve=>setTimeout(resolve,450));
      await page.screenshot({path:path.join(output,'edit-'+width+'.png')});
      await click('Close');
    }
    await page.setViewport({width:390,height:900});
    await click('Edit details');
    await click('Select team');
    await page.waitForFunction(()=>document.body.textContent.includes('Team B with a long name'));
    await click('Team B with a long name');
    await page.$eval('input[aria-label="Chest number"]',el=>{el.focus();});
    await page.type('input[aria-label="Chest number"]','200');
    await click('Save changes');
    await page.waitForFunction(()=>document.body.textContent.includes('Save team / chest number?'));
    assert.equal(writes.length,0,'Confirmation has not saved');
    await new Promise(resolve=>setTimeout(resolve,450));
    await page.screenshot({path:path.join(output,'confirm-390.png')});
    await click('Proceed');
    await page.waitForFunction(()=>!document.querySelector('input[aria-label="Chest number"]'));
    assert.equal(writes.length,1);
    assert.equal(writes[0].p_expected_org_id,team);assert.equal(writes[0].p_expected_chest_number,'100');
    assert.equal(writes[0].p_new_org_id,destination);assert.equal(writes[0].p_chest_number,'200');
    // Stale save must retain the form instead of silently overwriting another edit.
    await click('Edit details');stale=true;
    await click('Save changes');
    await page.waitForFunction(()=>document.body.textContent.includes('Participant changed after opening. Reload before saving.'));
    await click('OK');
    assert.ok(await page.$('input[aria-label="Chest number"]'));
    await click('Close');
    stale=false;
    chestTemplate='category';
    current={...current,organisation_id:team,chest_number:'100',category_code:'HS'};
    await page.goto(base+'/participants/'+participant,{waitUntil:'networkidle0'});
    await click('Edit details');
    const categoryNumber=await page.$eval('input[aria-label="Chest number"]',el=>el.value);
    assert.equal(categoryNumber,'100','Category-mode festivals must expose the existing number');
    await page.click('input[aria-label="Chest number"]');
    await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');
    await page.type('input[aria-label="Chest number"]','101');
    await click('Save changes');
    await page.waitForFunction(()=>document.body.textContent.includes('Save team / chest number?'));
    await click('Proceed');
    await page.waitForFunction(()=>!document.querySelector('input[aria-label="Chest number"]'));
    assert.equal(writes.length,3);
    assert.equal(writes[2].p_chest_number,'101','Category-mode number reaches the atomic RPC');
    assert.equal(writes[2].p_new_org_id,team,'Category-mode number edit keeps the selected team');
    assert.deepEqual(errors,[]);
    console.log('PASS 1440/1024/768/390/320px edit sheet, team and category chest fields, atomic team transfer, category number save, stale-save draft retained');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
