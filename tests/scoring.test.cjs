const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isNewerResult } = require('../src/core/utils/currentResult.ts');

test('downward corrections select latest publication rather than highest historical award', () => {
  assert.ok(isNewerResult({ published_at: '2026-10-19T10:00:00Z', points_awarded: 2 }, { published_at: '2026-10-18T10:00:00Z', points_awarded: 25 }));
  assert.equal(isNewerResult({ published_at: null }, { published_at: '2026-10-18T10:00:00Z' }), false);
});
const { normalizePointsConfig, calculateFlexiblePoints, calculateGradeFromConfig, resolvePointBracket, validateFlexiblePointsConfig, serializePointsConfig } = require('../src/core/utils/flexiblePointsEngine.ts');

function stored() {
  return {
    points_mode: 'official', config_version: 8,
    rank_1_points: 7, rank_2_points: 4, rank_3_points: 2,
    grade_thresholds: { a_plus: 91, a: 78, b: 63, c: 42 },
    point_brackets: [{ key: 'shared', label: '1–20', min: 1, max: 20, points: [9, 6, 3, 1], enabled: true }],
    group_point_brackets: [], separate_group_brackets: false, auto_bracket_selection: true,
    allow_bracket_override: true, less_than_3_teams_rule: true, rule12_min_teams: 3, rule12_behavior: 'grade_only',
    enable_grace_marks: true, grade_boost_points: { shared: [17, 14, 11, 8] }, group_grade_boost_points: {},
    rank_boost_points: [13, 10, 5], grade_boost_item_ids: ['grade', 'both'], rank_boost_item_ids: ['rank', 'both'],
    grace_fields: [{ id: 'attendance-field', name: 'Test field', max_marks: 11 }],
  };
}
function award(config, itemId, overrides = {}) {
  return calculateFlexiblePoints({ grade: 'A+', rank: 1, groupSize: 1, competingTeamsCount: 3, isGroup: false, config, itemId, ...overrides });
}
test('all four profiles compose exactly once using stored values, even in legacy official mode', () => {
  const config = normalizePointsConfig(stored());
  assert.deepEqual(validateFlexiblePointsConfig(config), []);
  for (const [item, points] of [['baseline', 16], ['grade', 24], ['rank', 22], ['both', 30]]) assert.equal(award(config, item).total, points);
  assert.equal(award(config, 'both').profile, 'both');
});
test('threshold boundaries use the configured percentage and actual maximum', () => {
  const config = normalizePointsConfig(stored());
  assert.equal(calculateGradeFromConfig(91, 100, config), 'A+');
  assert.equal(calculateGradeFromConfig(90.999, 100, config), 'A');
  assert.equal(calculateGradeFromConfig(62.4, 80, config), 'A');
  assert.equal(calculateGradeFromConfig(33.6, 80, config), 'C');
  assert.equal(calculateGradeFromConfig(33.599, 80, config), null);
  assert.equal(calculateGradeFromConfig(1, 0, config), null);
  config.thresholds.c = 0;
  assert.equal(calculateGradeFromConfig(0, 80, config), 'C', 'An explicit zero threshold is respected');
});
test('missing configuration, malformed numbers and unknown brackets never become fallback awards', () => {
  const empty = normalizePointsConfig();
  assert.ok(Number.isNaN(empty.rankPoints[0]));
  assert.ok(validateFlexiblePointsConfig(empty).length);
  assert.throws(() => award(empty, 'baseline'));
  const raw = stored(); raw.rank_1_points = null;
  assert.throws(() => award(normalizePointsConfig(raw), 'both'));
  const config = normalizePointsConfig(stored());
  assert.equal(resolvePointBracket(config, 21, false), null);
  assert.throws(() => award(config, 'baseline', { groupSize: 21 }));
  assert.throws(() => award(config, 'baseline', { bracketOverride: 'unknown' }));
});
test('configured minimum-team behaviour applies to every profile without inventing rank awards', () => {
  const config = normalizePointsConfig(stored());
  assert.equal(award(config, 'both', { competingTeamsCount: 2 }).total, 17);
  config.rule12Behavior = 'rank_and_grade';
  assert.equal(award(config, 'both', { competingTeamsCount: 2 }).total, 30);
  config.rule12Behavior = 'no_points';
  assert.equal(award(config, 'both', { competingTeamsCount: 2 }).total, 0);
});
test('boosted grades share baseline bracket identity/ranges, and incomplete boost values block scoring', () => {
  const config = normalizePointsConfig(stored());
  config.brackets[0].max = 30;
  assert.equal(award(config, 'both', { groupSize: 25 }).total, 30);
  delete config.gradeBoostPoints.shared;
  assert.throws(() => award(config, 'grade'));
});
test('grace field definitions have no default names/marks and validate explicit maxima', () => {
  assert.deepEqual(normalizePointsConfig().graceFields, []);
  const config = normalizePointsConfig(stored());
  config.graceFields[0].maxMarks = NaN;
  assert.ok(validateFlexiblePointsConfig(config).some(message => message.includes('Grace')));
});

test('separate group boosts reuse the exact configured group ranges and explicit override', () => {
  const config = normalizePointsConfig(stored());
  config.separateGroupBrackets = true;
  config.groupBrackets = [{ key: 'g', label: 'Group range', min: 2, max: 8, enabled: true, points: [15,12,8,3] }];
  config.groupGradeBoostPoints = { g: [25,21,16,10] };
  assert.equal(award(config, 'both', { isGroup: true, groupSize: 8 }).total,38);
  assert.throws(()=>award(config,'both',{isGroup:true,groupSize:9}));
  assert.equal(award(config,'both',{isGroup:true,groupSize:9,bracketOverride:'g'}).total,38);
});
test('serialization preserves numerical rules and independent item memberships', () => {
  const config = normalizePointsConfig(stored());
  const roundTrip = normalizePointsConfig({ ...serializePointsConfig(config), config_version: config.version });
  assert.deepEqual(roundTrip, { ...config, groupBrackets: config.brackets });
});

test('member-count OFF uses the smallest configured range, without a fixed member number', () => {
  const config = normalizePointsConfig(stored());
  config.brackets[0].min = 4;
  config.brackets.push({ key: 'large', label: '21–40', min: 21, max: 40, enabled: true, points: [5, 4, 3, 2] });
  config.gradeBoostPoints.large = [12, 10, 8, 6];
  config.brackets.reverse();
  config.memberBracketsEnabled = false;
  assert.deepEqual(validateFlexiblePointsConfig(config), []);
  for (const size of [1, 25, 100]) {
    assert.equal(award(config, 'baseline', { groupSize: size }).total, 16);
    assert.equal(award(config, 'both', { groupSize: size }).total, 30);
    assert.equal(award(config, 'both', { groupSize: size }).bracketKey, 'shared');
  }
  assert.throws(() => award(config, 'both', { bracketOverride: 'large' }));
  config.memberBracketsEnabled = true;
  assert.equal(award(config, 'baseline', { groupSize: 25 }).bracketKey, 'large');
});

test('a disabled boost cannot retain assigned competitions or award its points', () => {
  const config = normalizePointsConfig(stored());
  config.gradeBoostEnabled = false;
  assert.ok(validateFlexiblePointsConfig(config).some(message => message.includes('Grade Boost competitions')));
  assert.throws(() => award(config, 'grade'));
  config.gradeBoostItemIds = [];
  assert.equal(award(config, 'grade').total, 16);
  config.rankBoostEnabled = false;
  assert.ok(validateFlexiblePointsConfig(config).some(message => message.includes('Rank Boost competitions')));
  config.rankBoostItemIds = [];
  assert.equal(award(config, 'rank').total, 16);
});
