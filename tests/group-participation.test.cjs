const test=require('node:test'),assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const exported={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/core/utils/groupParticipation.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:exported});
test('category does not determine group participation',()=>{
  for(const code of ['GN','HS','UP','dance']) {
    assert.equal(exported.isGroupCompetition({participation_type:'group',category_codes:[code]}),true);
    assert.equal(exported.isGroupCompetition({participation_type:'individual',category_codes:[code]}),false);
  }
});
test('General accepts other categories while category groups retain eligibility',()=>{
  assert.equal(exported.matchesCompetitionCategory('HS','GN'),true);
  assert.equal(exported.matchesCompetitionCategory('UP','GENERAL'),true);
  assert.equal(exported.matchesCompetitionCategory('JUNIOR','JR'),true);
  assert.equal(exported.matchesCompetitionCategory('HS','UP'),false);
  assert.equal(exported.matchesCompetitionCategory('HS','JR',true),true);
  assert.equal(exported.matchesCompetitionCategory('HS','HS',true),false);
});
test('group display follows the leader and retains legacy fallback',()=>{
  assert.equal(exported.groupEntryChest({leader:{chest_number:'102'},entry_chest_number:'GE-1'}),'102');
  assert.equal(exported.groupEntryChest({leader:null,entry_chest_number:'GE-1'}),'GE-1');
});
test('legacy group completion survives until a current group status is explicitly saved',()=>{
  const legacy={item_id:'item',category_code:'HS',entry_kind:'participant',is_complete:true};
  assert.equal(exported.programIntakeComplete([legacy],'item','HS','general_team'),true);
  assert.equal(exported.programIntakeComplete([legacy,{...legacy,entry_kind:'general_team',is_complete:false}],'item','HS','general_team'),false);
  assert.equal(exported.programIntakeComplete([legacy],'other','HS','general_team'),false);
});
