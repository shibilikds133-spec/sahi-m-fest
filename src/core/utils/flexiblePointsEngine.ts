export type PointsMode = 'official' | 'hybrid' | 'custom';
export type Rule12Behavior = 'grade_only' | 'rank_and_grade' | 'no_points';
export type GradeThresholds = { aPlus: number; a: number; b: number; c: number };
export type GradePoints = [number, number, number, number];
export type PointBracket = { key: string; label: string; min: number; max: number | null; points: GradePoints; enabled: boolean };
export type GraceField = { id: string; name: string; maxMarks: number };
export type PointsProfile = 'baseline' | 'grade_boost' | 'rank_boost' | 'both';
export type FlexiblePointsConfig = {
  mode: PointsMode; rankPoints: [number, number, number]; thresholds: GradeThresholds;
  brackets: PointBracket[]; groupBrackets: PointBracket[]; separateGroupBrackets: boolean;
  gradeBoostEnabled: boolean; rankBoostEnabled: boolean; memberBracketsEnabled: boolean;
  autoBracketSelection: boolean; allowBracketOverride: boolean; rule12Enabled: boolean;
  rule12MinTeams: number; rule12Behavior: Rule12Behavior; enableGraceMarks: boolean; version: number;
  gradeBoostPoints: Record<string, GradePoints>; groupGradeBoostPoints: Record<string, GradePoints>;
  rankBoostPoints: [number, number, number]; gradeBoostItemIds: string[]; rankBoostItemIds: string[];
  graceFields: GraceField[];
};
// NaN represents a missing editor input, never an award. Validation must succeed before save/calculation.
export const configurationNumber = (value: unknown): number => {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};
export const displayConfigurationNumber = (value: number) => Number.isFinite(value) ? String(value) : '';
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const gradePoints = (value: unknown): GradePoints =>
  [0, 1, 2, 3].map(index => configurationNumber(array(value)[index])) as GradePoints;
const parseBrackets = (value: unknown): PointBracket[] => array(value).map(row => ({
  key: String(row.key ?? ''), label: String(row.label ?? ''),
  min: configurationNumber(row.min), max: row.max === null ? null : configurationNumber(row.max),
  points: gradePoints(row.points), enabled: row.enabled !== false,
}));
const boostMap = (value: any): Record<string, GradePoints> => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    .map(([key, points]) => [key, gradePoints(points)]),
);
export const normalizePointsConfig = (record?: any): FlexiblePointsConfig => ({
  // Legacy mode remains metadata; it never supplies numerical scoring rules.
  mode: ['official', 'hybrid', 'custom'].includes(record?.points_mode) ? record.points_mode : 'custom',
  rankPoints: [record?.rank_1_points, record?.rank_2_points, record?.rank_3_points].map(configurationNumber) as [number, number, number],
  thresholds: {
    aPlus: configurationNumber(record?.grade_thresholds?.a_plus), a: configurationNumber(record?.grade_thresholds?.a),
    b: configurationNumber(record?.grade_thresholds?.b), c: configurationNumber(record?.grade_thresholds?.c),
  },
  brackets: parseBrackets(record?.point_brackets), groupBrackets: parseBrackets(record?.group_point_brackets),
  separateGroupBrackets: record?.separate_group_brackets === true,
  gradeBoostEnabled: record?.grade_boost_enabled !== false,
  rankBoostEnabled: record?.rank_boost_enabled !== false,
  memberBracketsEnabled: record?.member_brackets_enabled !== false,
  autoBracketSelection: record?.auto_bracket_selection === true, allowBracketOverride: record?.allow_bracket_override === true,
  rule12Enabled: record?.less_than_3_teams_rule === true, rule12MinTeams: configurationNumber(record?.rule12_min_teams),
  rule12Behavior: record?.rule12_behavior, enableGraceMarks: record?.enable_grace_marks === true,
  version: Number.isInteger(record?.config_version) ? record.config_version : 0,
  gradeBoostPoints: boostMap(record?.grade_boost_points), groupGradeBoostPoints: boostMap(record?.group_grade_boost_points),
  rankBoostPoints: [0, 1, 2].map(i => configurationNumber(record?.rank_boost_points?.[i])) as [number, number, number],
  gradeBoostItemIds: array(record?.grade_boost_item_ids), rankBoostItemIds: array(record?.rank_boost_item_ids),
  graceFields: array(record?.grace_fields).map(f => ({ id: String(f.id ?? ''), name: String(f.name ?? ''), maxMarks: configurationNumber(f.max_marks) })),
});
export const serializePointsConfig = (c: FlexiblePointsConfig) => ({
  points_mode: c.mode, rank_1_points: c.rankPoints[0], rank_2_points: c.rankPoints[1], rank_3_points: c.rankPoints[2],
  grade_thresholds: { a_plus: c.thresholds.aPlus, a: c.thresholds.a, b: c.thresholds.b, c: c.thresholds.c },
  point_brackets: c.brackets, group_point_brackets: c.separateGroupBrackets ? c.groupBrackets : c.brackets,
  separate_group_brackets: c.separateGroupBrackets, auto_bracket_selection: c.autoBracketSelection,
  grade_boost_enabled: c.gradeBoostEnabled, rank_boost_enabled: c.rankBoostEnabled,
  member_brackets_enabled: c.memberBracketsEnabled,
  allow_bracket_override: c.allowBracketOverride, less_than_3_teams_rule: c.rule12Enabled,
  rule12_min_teams: Number.isFinite(c.rule12MinTeams) ? c.rule12MinTeams : null, rule12_behavior: c.rule12Behavior ?? null,
  enable_grace_marks: c.enableGraceMarks, grade_boost_points: c.gradeBoostPoints, group_grade_boost_points: c.groupGradeBoostPoints,
  rank_boost_points: c.rankBoostPoints.every(Number.isFinite) ? c.rankBoostPoints : [],
  grade_boost_item_ids: c.gradeBoostItemIds, rank_boost_item_ids: c.rankBoostItemIds,
  grace_fields: c.graceFields.map(f => ({ id: f.id, name: f.name.trim(), max_marks: f.maxMarks })),
});
export const calculateGradeFromConfig = (total: number, maximum: number, config: Pick<FlexiblePointsConfig, 'thresholds'>): string | null => {
  if (!Number.isFinite(total) || !Number.isFinite(maximum) || maximum <= 0 || total < 0 || total > maximum) return null;
  const { aPlus, a, b, c } = config.thresholds;
  if (![aPlus, a, b, c].every(Number.isFinite) || !(aPlus > a && a > b && b > c)) return null;
  const pct = total / maximum * 100;
  return pct >= aPlus ? 'A+' : pct >= a ? 'A' : pct >= b ? 'B' : pct >= c ? 'C' : null;
};
export const resolvePointBracket = (config: FlexiblePointsConfig, size: number, group: boolean, override?: string | null) => {
  const enabled = (group && config.separateGroupBrackets ? config.groupBrackets : config.brackets).filter(b => b.enabled);
  if (!config.memberBracketsEnabled) {
    const bracket = [...enabled].sort((a, b) => a.min - b.min)[0] ?? null;
    if (override && override !== bracket?.key) return null;
    return bracket;
  }
  if (override && config.allowBracketOverride) return enabled.find(b => b.key === override) ?? null;
  return enabled.find(b => size >= b.min && (b.max === null || size <= b.max)) ?? null;
};
export const getPointsProfile = (config: FlexiblePointsConfig, itemId: string): PointsProfile => {
  const g = config.gradeBoostItemIds.includes(itemId), r = config.rankBoostItemIds.includes(itemId);
  return g && r ? 'both' : g ? 'grade_boost' : r ? 'rank_boost' : 'baseline';
};
export const calculateFlexiblePoints = ({ grade, rank, groupSize, competingTeamsCount, isGroup, config, bracketOverride, itemId }: {
  grade: string | null; rank: number | null; groupSize: number; competingTeamsCount: number; isGroup: boolean;
  config: FlexiblePointsConfig; bracketOverride?: string | null; itemId?: string;
}) => {
  const errors = validateFlexiblePointsConfig(config);
  if (errors.length) throw new Error(errors[0]);
  if (!itemId && (config.gradeBoostItemIds.length || config.rankBoostItemIds.length)) throw new Error('Competition identity is required.');
  if (!Number.isInteger(groupSize) || groupSize < 1 || !Number.isInteger(competingTeamsCount) || competingTeamsCount < 0) throw new Error('Invalid entry/team count.');
  const bracket = resolvePointBracket(config, groupSize, isGroup, bracketOverride);
  if (!bracket) throw new Error('No configured bracket matches this entry.');
  if (grade !== null && grade !== '-' && !['A+', 'A', 'B', 'C'].includes(grade)) throw new Error('Unknown grade.');
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new Error('Invalid rank.');
  const profile = getPointsProfile(config, itemId ?? '');
  const boosted = isGroup && config.separateGroupBrackets ? config.groupGradeBoostPoints : config.gradeBoostPoints;
  const values = profile === 'grade_boost' || profile === 'both' ? boosted[bracket.key] : bracket.points;
  const gi = ['A+', 'A', 'B', 'C'].indexOf(grade ?? '');
  let gradeAward = gi < 0 ? 0 : values[gi];
  const ranks = profile === 'rank_boost' || profile === 'both' ? config.rankBoostPoints : config.rankPoints;
  let rankAward = rank !== null && rank <= ranks.length ? ranks[rank - 1] : 0;
  const rule12Applies = config.rule12Enabled && competingTeamsCount < config.rule12MinTeams;
  if (rule12Applies && config.rule12Behavior !== 'rank_and_grade') rankAward = 0;
  if (rule12Applies && config.rule12Behavior === 'no_points') gradeAward = 0;
  return { total: rankAward + gradeAward, rankPoints: rankAward, gradePoints: gradeAward,
    bracketKey: bracket.key, bracketLabel: bracket.label, profile, rule12Applies,
    gradeOnly: rule12Applies && config.rule12Behavior === 'grade_only', configVersion: config.version };
};
export const validateFlexiblePointsConfig = (c: FlexiblePointsConfig): string[] => {
  const errors: string[] = [];
  if (!c.gradeBoostEnabled && c.gradeBoostItemIds.length) errors.push('Remove Grade Boost competitions before turning it off.');
  if (!c.rankBoostEnabled && c.rankBoostItemIds.length) errors.push('Remove Rank Boost competitions before turning it off.');
  const validPoints = (v: number[], n: number) => v.length === n && v.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 2147483647);
  const { aPlus, a, b, c: low } = c.thresholds;
  if (![aPlus, a, b, low].every(x => Number.isFinite(x) && x >= 0 && x <= 100) || !(aPlus > a && a > b && b > low))
    errors.push('Enter ordered grade percentages: A+ > A > B > C.');
  if (!validPoints(c.rankPoints, 3)) errors.push('Enter all baseline rank points as non-negative whole numbers.');
  if (!Number.isSafeInteger(c.rule12MinTeams) || c.rule12MinTeams < 1 || !['grade_only', 'rank_and_grade', 'no_points'].includes(c.rule12Behavior))
    errors.push('Complete the minimum-team rule.');
  const check = (rows: PointBracket[], label: string, boosts: Record<string, GradePoints>) => {
    const enabled = rows.filter(b => b.enabled).sort((a, b) => a.min - b.min), keys = new Set<string>();
    if (!enabled.length) errors.push(label + ': add an enabled bracket.');
    rows.forEach(b => {
      if (!b.key || keys.has(b.key)) errors.push(label + ': bracket keys must be unique.');
      keys.add(b.key);
      if (!Number.isSafeInteger(b.min) || b.min < 1 || (b.max !== null && (!Number.isSafeInteger(b.max) || b.max < b.min))) errors.push(label + ': complete bracket ranges.');
      if (!validPoints(b.points, 4)) errors.push(label + ': enter all grade points.');
      if (b.enabled && c.gradeBoostItemIds.length && !validPoints(boosts[b.key] ?? [], 4)) errors.push(label + ': complete boosted grade points for ' + (b.label || b.key) + '.');
    });
    enabled.forEach((b, i) => { const p = enabled[i - 1]; if (p && (p.max === null || p.max >= b.min)) errors.push(label + ': enabled ranges overlap.'); });
  };
  check(c.brackets, 'Participant', c.gradeBoostPoints);
  if (c.separateGroupBrackets) check(c.groupBrackets, 'Group', c.groupGradeBoostPoints);
  if (c.rankBoostItemIds.length && !validPoints(c.rankBoostPoints, 3)) errors.push('Complete all boosted rank points.');
  const ids = new Set<string>(), names = new Set<string>();
  c.graceFields.forEach(f => {
    const name = f.name.trim().toLowerCase();
    if (!f.id || ids.has(f.id) || !name || names.has(name) || !Number.isSafeInteger(f.maxMarks) || f.maxMarks <= 0)
      errors.push('Grace fields require unique names/IDs and a positive whole-number maximum.');
    ids.add(f.id); names.add(name);
  });
  return [...new Set(errors)];
};
