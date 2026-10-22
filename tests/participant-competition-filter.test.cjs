const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  require.resolve('../src/core/utils/participantCompetitionFilter.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });

const {
  isGeneralCategoryCode,
  buildParticipantCategoryOptions,
  participantHasCompetitionRegistration,
  participantHasGeneralTeamRegistration,
} = exportsObject;

test('filters an individual registration by item and category', () => {
  const registrations = [{ item_id: 'item-1', participant_id: 'person-1', status: 'approved' }];
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-1', 'item-1', 'HS', 'hs'), true);
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-1', 'item-1', 'UP', 'HS'), false);
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-1', 'item-2', 'HS', 'HS'), false);
});

test('matches members of General team entries without treating them as participant registrations', () => {
  const registrations = [{
    item_id: 'general-item',
    participant_id: null,
    entry_kind: 'general_team',
    status: 'approved',
    group_members: [{ participant_id: 'person-1' }, { participant_id: 'person-2' }],
  }];
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-1', 'general-item', 'GN', 'LP'), true);
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-3', 'general-item', 'GN', 'LP'), false);
  assert.equal(participantHasGeneralTeamRegistration(registrations, 'person-1'), true);
  assert.equal(participantHasGeneralTeamRegistration(registrations, 'person-3'), false);
  assert.equal(isGeneralCategoryCode('GN'), true);
  assert.equal(isGeneralCategoryCode('general'), true);
  assert.equal(isGeneralCategoryCode('HSS'), false);
});

test('does not match rejected entries', () => {
  const registrations = [{ item_id: 'item-1', participant_id: 'person-1', status: 'rejected' }];
  assert.equal(participantHasCompetitionRegistration(registrations, 'person-1', 'item-1'), false);
});

test('category filter options come from current festival data, not a hard-coded category catalog', () => {
  const options = buildParticipantCategoryOptions(
    [{ category_code: 'up' }, { category_code: 'UP' }, { category_code: 'HS' }],
    [],
    false,
    true,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(options)), [
    { id: 'All', label: 'Category: All' },
    { id: 'GN', label: 'General' },
    { id: 'HS', label: 'HS' },
    { id: 'UP', label: 'UP' },
  ]);
});

test('College Fest filter uses configured active categories and their labels', () => {
  const options = buildParticipantCategoryOptions(
    [{ category_code: 'stale_archived_code' }],
    [{ code: 'dance', name: 'Dance' }, { code: 'GN', name: 'General' }],
    true,
    true,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(options)), [
    { id: 'All', label: 'Category: All' },
    { id: 'DANCE', label: 'Dance' },
    { id: 'GN', label: 'General' },
  ]);
});
