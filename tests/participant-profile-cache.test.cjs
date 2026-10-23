/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/core/utils/invalidateParticipantProfiles.ts'),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: moduleObject.exports, module: moduleObject });
const { invalidateParticipantProfiles } = moduleObject.exports;
test('profile changes refresh names, shifted neighbours and award readers without touching marks or other festivals', async () => {
  const keys = [
    ['participant','shifted-neighbour'], ['participants'], ['scheduleRegistrations','event'],
    ['publicCandidateProfile','candidate-slug'], ['public-published-results','tenant','festival'],
    ['festival-results','tenant','festival'], ['admin-leaderboard','tenant','festival'],
    ['general-team-entries','festival'], ['team-leader-programs','festival','participant'],
    ['public-published-results','other','other-festival'], ['general-team-entries','other-festival'],
    ['markEntries','event'], ['points-config','festival'], ['judges'],
  ];
  let matched;
  await invalidateParticipantProfiles({ invalidateQueries: ({ predicate }) => {
    matched = keys.map(queryKey => predicate({ queryKey }));
  } },'festival');
  assert.deepEqual(Array.from(matched),[true,true,true,true,true,true,true,true,true,false,false,false,false,false]);
});

test('multiple consumers of one hint issue a single refresh, while a later hint is retained', async () => {
  let calls = 0;
  const client = { invalidateQueries: () => { calls++; } };
  await Promise.all([invalidateParticipantProfiles(client,'festival'),invalidateParticipantProfiles(client,'festival')]);
  assert.equal(calls,1);
  await invalidateParticipantProfiles(client,'festival');
  assert.equal(calls,2);
});
