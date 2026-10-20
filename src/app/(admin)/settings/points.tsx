import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, Eye, ListChecks, Plus, Trash2 } from 'lucide-react-native';
import { ui } from '@/constants/designSystem';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfInput } from '../../../components/ui/SsfInput';
import { SsfSheet } from '../../../components/ui/SsfSheet';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/config/supabase';
import { createRequestId } from '../../../core/utils/requestId';
import {
  configurationNumber as numberValue, displayConfigurationNumber as numberText,
  FlexiblePointsConfig, GradePoints, PointBracket, GradeBoostSection, normalizePointsConfig, serializePointsConfig,
  setDefaultGradePoint, validateFlexiblePointsConfig,
} from '../../../core/utils/flexiblePointsEngine';

const grades = ['A+', 'A', 'B', 'C'];
const ranks = ['1st', '2nd', '3rd'];
const emptyGrades = (): GradePoints => [NaN, NaN, NaN, NaN];
const Numeric = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => (
  <SsfInput label={label} accessibilityLabel={label} keyboardType="numeric" value={numberText(value)}
    onChangeText={value => onChange(numberValue(value))} className="flex-1 min-w-[65px] mb-2"
    style={{ minHeight: 40, minWidth: 0, width: 0, paddingHorizontal: 10 }} />
);

export default function PointsSettings() {
  const router = useRouter();
  const { role, is_superadmin } = useAuthStore();
  const { useActiveFestival, usePointsConfig, useUpdatePoints, useItems } = useFestival();
  const { data: festival, isLoading: isFestivalLoading } = useActiveFestival();
  const { data: record, isLoading, isFetching, error, refetch } = usePointsConfig(festival?.id);
  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useItems(festival?.id);
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: enabledCategories = [], isLoading: categoriesLoading, error: categoriesError } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
    true,
  );
  const update = useUpdatePoints();
  const [form, setForm] = useState<FlexiblePointsConfig>(() => normalizePointsConfig());
  const [hydratedFestivalId, setHydratedFestivalId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [versions, setVersions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [competitionPanel, setCompetitionPanel] = useState<{
    mode: 'select' | 'preview' | 'both';
    boost?: 'gradeBoostItemIds' | 'rankBoostItemIds';
    sectionId?: string;
  } | null>(null);
  useEffect(() => {
    if (!festival?.id || isLoading || isFetching || error || hydratedFestivalId === festival.id) return;
    setForm(normalizePointsConfig(record));
    setHydratedFestivalId(festival.id);
  }, [festival?.id, record, isLoading, isFetching, error, hydratedFestivalId]);
  useEffect(() => {
    if (!festival?.id) return;
    let active = true;
    supabase.from('points_config_versions').select('id,config_version,change_reason,created_at')
      .eq('festival_id', festival.id).order('config_version', { ascending: false }).limit(5)
      .then(({ data }) => { if (active) setVersions(data ?? []); });
    return () => { active = false; };
  }, [festival?.id, record?.config_version]);
  const errors = useMemo(() => validateFlexiblePointsConfig(form), [form]);
  const enabledCategoryCodes = useMemo(() => new Set(enabledCategories
    .filter(category => category.code.toUpperCase() !== 'GN' || festival?.general_category_enabled === true)
    .map(category => category.code.trim().toUpperCase())), [enabledCategories, festival?.general_category_enabled]);
  const isEnabledCompetition = (item: any) => {
    if (!Array.isArray(item.category_codes) || item.category_codes.length !== 1) return false;
    return !isCollegeFest || enabledCategoryCodes.has(String(item.category_codes[0]).trim().toUpperCase());
  };
  const selectableItems = (items as any[]).filter(isEnabledCompetition);
  const visibleItems = selectableItems.filter(item => [item.item_code, item.item_name_en, item.item_name_ml, ...(item.category_codes ?? [])]
    .join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const allGradeBoostIds = form.gradeBoostSections.flatMap(section => section.itemIds);
  const allRankBoostIds = form.rankBoostSections.flatMap(section => section.itemIds);
  const bothBoostIds = [...new Set(allGradeBoostIds.filter(id => allRankBoostIds.includes(id)))];
  const bothBoostItems = (items as any[]).filter(item => bothBoostIds.includes(item.id));
  const patch = (changes: Partial<FlexiblePointsConfig>) => setForm(current => ({ ...current, ...changes }));
  const editBracket = (group: boolean, index: number, change: Partial<PointBracket>) => {
    const key = group ? 'groupBrackets' : 'brackets';
    patch({ [key]: form[key].map((row, i) => i === index ? { ...row, ...change } : row) });
  };
  const addBracket = (group: boolean) => {
    const key = group ? 'groupBrackets' : 'brackets';
    patch({ [key]: [...form[key], { key: createRequestId(), label: '', min: NaN, max: NaN, points: emptyGrades(), enabled: true }] });
  };
  const defaultBracket = (group: boolean) => (group ? form.groupBrackets : form.brackets)
    .filter(bracket => bracket.enabled)
    .slice()
    .sort((left, right) => left.min - right.min)[0] ?? null;
  const renderDefaultGradePoints = (group: boolean) => {
    const bracket = defaultBracket(group);
    return <View className="mb-3">
      <Text className="font-poppins-bold text-xs text-ui-text mb-2">
        {group ? 'Default group grade points' : 'Default participant grade points'}
      </Text>
      <View className="flex-row flex-wrap gap-2">{grades.map((label, gradeIndex) =>
        <Numeric key={label} label={label} value={bracket?.points[gradeIndex] ?? NaN}
          onChange={value => setForm(current => setDefaultGradePoint(current, group, gradeIndex, value, createRequestId()))} />
      )}</View>
    </View>;
  };
  const renderBrackets = (group: boolean) => {
    const key = group ? 'groupBrackets' : 'brackets';
    const allRows = form[key];
    const rows = form.memberBracketsEnabled ? allRows : [defaultBracket(group)].filter((row): row is PointBracket => row !== null);
    if (!rows.length) return <View>
      <Text className="font-poppins text-xs text-ui-text-muted mb-3">No member range is configured yet.</Text>
      {form.memberBracketsEnabled && <SsfButton label="Add bracket" size="sm" variant="outline"
        icon={<Plus size={15} color={ui.colors.primary} />} onPress={() => addBracket(group)} />}
    </View>;
    return <View>
      {rows.map(b => {
        const index = allRows.findIndex(row => row.key === b.key);
        return <View key={b.key} className="border border-ui-border rounded-xl p-3 mb-3">
        {form.memberBracketsEnabled ? <View className="flex-row items-center gap-2">
          <Numeric label="Members from" value={b.min} onChange={min => editBracket(group, index, { min })} />
          <Numeric label="Members to" value={b.max ?? NaN} onChange={max => editBracket(group, index, { max })} />
          <TouchableOpacity onPress={() => patch({ [key]: allRows.filter((_, i) => i !== index) })}
            accessibilityRole="button" accessibilityLabel="Remove bracket" className="p-3">
            <Trash2 size={17} color={ui.colors.textMuted} />
          </TouchableOpacity>
        </View> : <Text className="font-poppins-bold text-xs text-ui-text mb-2">
          {group ? 'Default group grade points' : 'Default participant grade points'}
        </Text>}
        {form.memberBracketsEnabled && <View className="flex-row flex-wrap gap-x-5 gap-y-1 mb-2">
          <View className="flex-row items-center justify-between flex-1 min-w-[180px]">
            <Text className="font-poppins text-xs text-ui-text-muted">No upper limit (∞)</Text>
            <Switch accessibilityLabel="No upper limit for member range" value={b.max === null}
              onValueChange={open => editBracket(group, index, { max: open ? null : NaN })} />
          </View>
          <View className="flex-row items-center justify-between flex-1 min-w-[180px]">
            <Text className="font-poppins text-xs text-ui-text-muted">Use this bracket</Text>
            <Switch accessibilityLabel="Use this bracket in scoring" value={b.enabled}
              onValueChange={enabled => editBracket(group, index, { enabled })} />
          </View>
        </View>}
        <View className="flex-row flex-wrap gap-2">{grades.map((label, gi) =>
          <Numeric key={label} label={label} value={b.points[gi]} onChange={value => {
            const points = [...b.points] as GradePoints; points[gi] = value;
            editBracket(group, index, { points, label: numberText(b.min) + '–' + (b.max === null ? '∞' : numberText(b.max)) });
          }} />)}</View>
      </View>})}
      {form.memberBracketsEnabled && <SsfButton label="Add bracket" size="sm" variant="outline" icon={<Plus size={15} color={ui.colors.primary} />} onPress={() => addBracket(group)} />}
    </View>;
  };
  const addGradeSection = () => patch({ gradeBoostSections: [...form.gradeBoostSections,
    { id: createRequestId(), itemIds: [], points: {}, groupPoints: {} }] });
  const addRankSection = () => patch({ rankBoostSections: [...form.rankBoostSections,
    { id: createRequestId(), itemIds: [], points: [NaN, NaN, NaN] }] });
  const toggleSectionItem = (id: string, kind: 'gradeBoostItemIds' | 'rankBoostItemIds', sectionId: string) => {
    if (kind === 'gradeBoostItemIds') patch({ gradeBoostSections: form.gradeBoostSections.map(section => section.id !== sectionId ? section : {
      ...section, itemIds: section.itemIds.includes(id) ? section.itemIds.filter(value => value !== id) : [...section.itemIds, id],
    }) });
    else patch({ rankBoostSections: form.rankBoostSections.map(section => section.id !== sectionId ? section : {
      ...section, itemIds: section.itemIds.includes(id) ? section.itemIds.filter(value => value !== id) : [...section.itemIds, id],
    }) });
  };
  const assignments = (kind: 'gradeBoostItemIds' | 'rankBoostItemIds') => kind === 'gradeBoostItemIds' ? form.gradeBoostSections : form.rankBoostSections;
  const assignedInOtherSection = (id: string, kind: 'gradeBoostItemIds' | 'rankBoostItemIds', sectionId: string) =>
    assignments(kind).findIndex(section => section.id !== sectionId && section.itemIds.includes(id));
  const panelItems = competitionPanel?.mode === 'both'
    ? bothBoostItems
    : competitionPanel?.mode === 'preview'
      ? (items as any[]).filter(item => competitionPanel.boost === 'gradeBoostItemIds'
        ? form.gradeBoostSections.find(section => section.id === competitionPanel.sectionId)?.itemIds.includes(item.id)
        : form.rankBoostSections.find(section => section.id === competitionPanel.sectionId)?.itemIds.includes(item.id))
      : visibleItems;
  const panelSection = competitionPanel?.boost === 'gradeBoostItemIds'
    ? form.gradeBoostSections.find(section => section.id === competitionPanel.sectionId)
    : form.rankBoostSections.find(section => section.id === competitionPanel?.sectionId);
  const panelSelectedIds = panelSection?.itemIds ?? [];
  const competitionOptionsLoading = itemsLoading || (isCollegeFest && categoriesLoading);
  const competitionOptionsError = itemsError || (isCollegeFest && categoriesError);
  const panelTitle = competitionPanel?.mode === 'both'
    ? 'Both Boosting Competitions'
    : competitionPanel?.mode === 'preview'
      ? 'Selected Competitions'
      : 'Select Competitions';
  const panelDescription = competitionPanel?.mode === 'both'
    ? 'These competitions are selected in both Grade Boost and Rank Boost.'
    : competitionPanel?.mode === 'preview'
      ? `${panelSelectedIds.length} competitions selected for ${competitionPanel.boost === 'gradeBoostItemIds' ? 'Grade Boost' : 'Rank Boost'} · Section ${(assignments(competitionPanel.boost!).findIndex(section => section.id === competitionPanel.sectionId) + 1) || ''}.`
      : 'Choose enabled, single-category competitions that receive this boost.';
  const renderItems = (kind: 'gradeBoostItemIds' | 'rankBoostItemIds', sectionId: string) => <View className="mt-3">
    {competitionOptionsError ? <Text className="font-poppins text-xs text-red-700 mb-2">Could not load enabled competitions or categories. Reload before editing assignments.</Text> : <>
      <View className="flex-row flex-wrap items-end gap-2">
        <SsfButton size="sm" variant="outline" label="Select Competitions" icon={<ListChecks size={16} color={ui.colors.primary} />}
          disabled={competitionOptionsLoading || !(kind === 'gradeBoostItemIds' ? form.gradeBoostEnabled : form.rankBoostEnabled)}
          onPress={() => { setSearch(''); setCompetitionPanel({ mode: 'select', boost: kind, sectionId }); }} />
        <View className="items-start">
          <Text className="font-poppins-bold text-[10px] text-ui-text-muted mb-1">{assignments(kind).find(section => section.id === sectionId)?.itemIds.length ?? 0} selected</Text>
          <SsfButton size="sm" variant="ghost" label="Selected Competitions" icon={<Eye size={15} color={ui.colors.primary} />}
            onPress={() => setCompetitionPanel({ mode: 'preview', boost: kind, sectionId })} />
        </View>
      </View>
      {competitionOptionsLoading && <ActivityIndicator className="self-start mt-2" />}
    </>}
  </View>;
  const renderBoostValues = (section: GradeBoostSection, group: boolean) => {
    const pointsMap = group ? section.groupPoints : section.points;
    const rows = (group ? form.groupBrackets : form.brackets).filter(b => b.enabled);
    const visibleRows = form.memberBracketsEnabled ? rows : [defaultBracket(group)].filter((row): row is PointBracket => row !== null);
    if (!visibleRows.length) return <View className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <Text className="font-poppins-bold text-xs text-amber-900">
        {group ? 'Group' : 'Participant'} Grade Boost points need a baseline bracket.
      </Text>
      <Text className="font-poppins text-xs text-amber-800 mt-1 mb-2">
        No enabled bracket is configured. Add a bracket here, then enter its range and points in Baseline grade points. Nothing is prefilled.
      </Text>
      <SsfButton size="sm" variant="outline" label={`Add ${group ? 'group' : 'participant'} bracket`}
        icon={<Plus size={15} color={ui.colors.primary} />} onPress={() => addBracket(group)} />
    </View>;
    return visibleRows.map(b => <View key={b.key} className="mb-3">
      <Text className="font-poppins-bold text-xs text-ui-text mb-2">{form.memberBracketsEnabled
        ? `${group ? 'Group' : 'Participant'}: ${numberText(b.min)}–${b.max === null ? '∞' : numberText(b.max)} members`
        : `Default ${group ? 'group' : 'participant'} grade boost points · ${numberText(b.min)}–${b.max === null ? '∞' : numberText(b.max)} members`}</Text>
      <View className="flex-row flex-wrap gap-2">{grades.map((label, gi) =>
        <Numeric key={label} label={label} value={pointsMap[b.key]?.[gi] ?? NaN} onChange={value => {
          const values = [...(pointsMap[b.key] ?? emptyGrades())] as GradePoints; values[gi] = value;
          patch({ gradeBoostSections: form.gradeBoostSections.map(candidate => candidate.id !== section.id ? candidate : group
            ? { ...candidate, groupPoints: { ...candidate.groupPoints, [b.key]: values } }
            : { ...candidate, points: { ...candidate.points, [b.key]: values } }) });
        }} />)}</View>
    </View>);
  };
  const save = async () => {
    setNotice('');
    if (!festival || errors.length) return;
    try {
      const savedRecord = await update.mutateAsync({ ...serializePointsConfig(form), festival_id: festival.id, expected_version: form.version, change_reason: reason.trim() || null });
      setForm(normalizePointsConfig(savedRecord));
      setReason(''); setNotice('Points configuration saved. Published awards retain their recorded version.');
    } catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Please reload and try again.'); }
  };
  if (isFestivalLoading || isLoading || (!!festival?.id && hydratedFestivalId !== festival.id && !error))
    return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (role !== 'admin' && !is_superadmin) return <View className="p-5"><Text>Administrator access is required.</Text></View>;
  if (error) return <View className="p-5"><Text className="text-red-700">Could not load points configuration.</Text><SsfButton label="Retry" onPress={() => refetch()} /></View>;
  return <ScrollView className="flex-1 bg-ssf-bg px-4 py-5" contentContainerStyle={{ paddingBottom: 36 }}>
    <View className="mb-5"><Text className="font-poppins-black text-2xl text-ui-text">Points Configuration</Text>
      <Text className="font-poppins text-xs text-ui-text-muted mt-1">Version {form.version || 'not configured'} · Baseline, grade boost, rank boost and grace fields</Text></View>
    {!!notice && <Text accessibilityRole="alert" className="font-poppins text-green-800 mb-4">{notice}</Text>}
    {!record && <Text className="font-poppins text-ui-text-muted mb-4">Enter the baseline rules to enable scoring. No scoring values are filled automatically.</Text>}
    <SsfCard className="mb-4"><Text className="font-poppins-bold text-lg text-ui-text mb-3">Baseline points</Text>
      <Text className="font-poppins-bold text-sm text-ui-text mb-2">Rank points</Text>
      <View className="flex-row gap-3">{ranks.map((label, i) => <Numeric key={label} label={label} value={form.rankPoints[i]} onChange={value => {
        const values = [...form.rankPoints] as typeof form.rankPoints; values[i] = value; patch({ rankPoints: values });
      }} />)}</View>
    </SsfCard>
    <SsfCard className="mb-4"><Text className="font-poppins-bold text-lg text-ui-text mb-3">Grade percentages</Text>
      <View className="flex-row flex-wrap gap-3">{(['aPlus', 'a', 'b', 'c'] as const).map((key, i) =>
        <Numeric key={key} label={grades[i] + ' minimum %'} value={form.thresholds[key]} onChange={value => patch({ thresholds: { ...form.thresholds, [key]: value } })} />)}</View>
    </SsfCard>
    <SsfCard className="mb-4"><Text className="font-poppins-bold text-lg text-ui-text mb-1">Baseline grade points</Text>
      <Text className="font-poppins text-xs text-ui-text-muted mb-3">These rules are locked for now.</Text>
      <View className="flex-row justify-between items-center rounded-xl bg-ui-muted/40 px-3 py-2 mb-3">
        <Text className="font-poppins text-sm text-ui-text flex-1 mr-3">Member count changes grade points</Text>
        <Switch accessibilityLabel="Member count changes grade points" value={form.memberBracketsEnabled} disabled />
      </View>
      {form.memberBracketsEnabled && <>{renderBrackets(false)}
        <View className="flex-row justify-between items-center mt-2"><Text className="font-poppins text-sm text-ui-text flex-1 mr-3">Separate group member ranges</Text>
          <Switch accessibilityLabel="Use separate group member ranges" value={form.separateGroupBrackets} disabled /></View>
        {form.separateGroupBrackets && <View className="mt-3">{renderBrackets(true)}</View>}
        {(['autoBracketSelection', 'allowBracketOverride'] as const).map((key, i) => <View key={key} className="flex-row justify-between items-center mt-3">
          <Text className="font-poppins text-xs text-ui-text">{i === 0 ? 'Automatically choose range from member count' : 'Allow administrator to override the range'}</Text>
          <Switch accessibilityLabel={i === 0 ? 'Automatically choose range from member count' : 'Allow administrator to override the range'}
            value={form[key]} onValueChange={value => patch({ [key]: value })} /></View>)}
      </>}
      {!form.memberBracketsEnabled && <>
        {renderDefaultGradePoints(false)}
        <View className="flex-row justify-between items-center mt-2"><Text className="font-poppins text-sm text-ui-text flex-1 mr-3">Use separate group grade points</Text>
          <Switch accessibilityLabel="Use separate group grade points" value={form.separateGroupBrackets} disabled /></View>
        {form.separateGroupBrackets && <View className="mt-3">{renderDefaultGradePoints(true)}</View>}
      </>}
    </SsfCard>
    <SsfCard className="mb-4"><View className="flex-row items-center justify-between mb-2"><Text className="font-poppins-bold text-lg text-ui-text">Grade boost</Text>
      <Switch accessibilityLabel="Grade boost enabled" value={form.gradeBoostEnabled} disabled /></View>
      <Text className="font-poppins text-xs text-ui-text-muted mb-3">Uses the baseline ranges when member-count scoring is on. When off, it uses the default bracket values.</Text>
      {form.gradeBoostSections.map((section, index) => <View key={section.id} className="border border-ui-border rounded-xl p-3 mb-3">
        <View className="flex-row items-center justify-between"><Text className="font-poppins-bold text-sm text-ui-text">Section {index + 1}</Text>
          {section.itemIds.length === 0 && form.gradeBoostSections.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove Grade Boost Section ${index + 1}`}
            onPress={() => patch({ gradeBoostSections: form.gradeBoostSections.filter(row => row.id !== section.id) })} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity>}</View>
        {renderBoostValues(section, false)}{form.separateGroupBrackets && renderBoostValues(section, true)}{renderItems('gradeBoostItemIds', section.id)}
        {!!section.itemIds.length && <View className="mt-2">{(items as any[]).filter(item => section.itemIds.includes(item.id)).map(item =>
          <View key={item.id} className="flex-row items-center justify-between py-2 border-b border-ui-border"><Text className="font-poppins text-xs text-ui-text flex-1">{item.item_name_en || item.item_name_ml}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${item.item_name_en || item.item_name_ml} from Section ${index + 1}`} onPress={() => toggleSectionItem(item.id, 'gradeBoostItemIds', section.id)} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity></View>)}
          {section.itemIds.filter(id => !(items as any[]).some(item => item.id === id)).map(id => <View key={id} className="flex-row items-center justify-between py-2 border-b border-ui-border">
            <Text className="font-poppins text-xs text-ui-text-muted flex-1">Unavailable competition</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove unavailable competition from Section ${index + 1}`} onPress={() => toggleSectionItem(id, 'gradeBoostItemIds', section.id)} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity>
          </View>)}</View>}
      </View>)}
      <SsfButton size="sm" variant="outline" label="Add Grade Boost section" icon={<Plus size={15} color={ui.colors.primary} />} onPress={addGradeSection} />
    </SsfCard>
    <SsfCard className="mb-4"><View className="flex-row items-center justify-between mb-3"><Text className="font-poppins-bold text-lg text-ui-text">Rank boost</Text>
      <Switch accessibilityLabel="Rank boost enabled" value={form.rankBoostEnabled} disabled /></View>
      {form.rankBoostSections.map((section, index) => <View key={section.id} className="border border-ui-border rounded-xl p-3 mb-3">
        <View className="flex-row items-center justify-between"><Text className="font-poppins-bold text-sm text-ui-text">Section {index + 1}</Text>
          {section.itemIds.length === 0 && form.rankBoostSections.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove Rank Boost Section ${index + 1}`}
            onPress={() => patch({ rankBoostSections: form.rankBoostSections.filter(row => row.id !== section.id) })} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity>}</View>
        <View className="flex-row gap-3">{ranks.map((label, i) => <Numeric key={label} label={label} value={section.points[i]} onChange={value => {
          const values = [...section.points] as typeof section.points; values[i] = value;
          patch({ rankBoostSections: form.rankBoostSections.map(row => row.id === section.id ? { ...row, points: values } : row) });
        }} />)}</View>{renderItems('rankBoostItemIds', section.id)}
        {!!section.itemIds.length && <View className="mt-2">{(items as any[]).filter(item => section.itemIds.includes(item.id)).map(item =>
          <View key={item.id} className="flex-row items-center justify-between py-2 border-b border-ui-border"><Text className="font-poppins text-xs text-ui-text flex-1">{item.item_name_en || item.item_name_ml}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${item.item_name_en || item.item_name_ml} from Section ${index + 1}`} onPress={() => toggleSectionItem(item.id, 'rankBoostItemIds', section.id)} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity></View>)}
          {section.itemIds.filter(id => !(items as any[]).some(item => item.id === id)).map(id => <View key={id} className="flex-row items-center justify-between py-2 border-b border-ui-border">
            <Text className="font-poppins text-xs text-ui-text-muted flex-1">Unavailable competition</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove unavailable competition from Section ${index + 1}`} onPress={() => toggleSectionItem(id, 'rankBoostItemIds', section.id)} className="p-2"><Trash2 size={16} color={ui.colors.textMuted} /></TouchableOpacity>
          </View>)}</View>}
      </View>)}
      <SsfButton size="sm" variant="outline" label="Add Rank Boost section" icon={<Plus size={15} color={ui.colors.primary} />} onPress={addRankSection} />
      <Text className="font-poppins text-xs text-ui-text-muted mt-3">Neither list: baseline. Both lists: boosted grade and rank components.</Text></SsfCard>
    <SsfCard className="mb-4"><Text className="font-poppins-bold text-lg text-ui-text mb-2">Both Boosting</Text>
      <Text className="font-poppins text-xs text-ui-text-muted mb-3">Competitions selected in both enabled lists receive both configured boost components. There is no separate switch or point value.</Text>
      <Text className="font-poppins-bold text-xs text-ui-text mb-2">{bothBoostIds.length} competitions selected in both</Text>
      <SsfButton size="sm" variant="outline" label="View Both Boosting Competitions" icon={<Eye size={15} color={ui.colors.primary} />}
        onPress={() => setCompetitionPanel({ mode: 'both' })} />
    </SsfCard>
    <SsfCard className="mb-4"><View className="flex-row items-center justify-between mb-3"><Text className="font-poppins-bold text-lg text-ui-text">Minimum-team rule</Text>
      <Switch value={form.rule12Enabled} onValueChange={value => patch({ rule12Enabled: value })} /></View>
      <Numeric label="Minimum competing teams" value={form.rule12MinTeams} onChange={value => patch({ rule12MinTeams: value })} />
      <View className="flex-row flex-wrap gap-2">{(['grade_only', 'rank_and_grade', 'no_points'] as const).map(value =>
        <SsfButton key={value} size="sm" label={value.replace(/_/g, ' ')} variant={form.rule12Behavior === value ? 'primary' : 'outline'} onPress={() => patch({ rule12Behavior: value })} />)}</View>
    </SsfCard>
    <SsfCard className="mb-4"><View className="flex-row items-center justify-between mb-3"><Text className="font-poppins-bold text-lg text-ui-text">Grace Marks</Text>
      <Switch value={form.enableGraceMarks} onValueChange={value => patch({ enableGraceMarks: value })} /></View>
      {form.graceFields.map((field, i) => <View key={field.id} className="flex-row flex-wrap items-center gap-2 mb-2">
        <SsfInput label="Field name" accessibilityLabel="Grace field name" value={field.name} className="flex-1 min-w-[140px] mb-2" style={{ minHeight: 40, minWidth: 0, width: 0 }}
          onChangeText={name => patch({ graceFields: form.graceFields.map((f, j) => i === j ? { ...f, name } : f) })} />
        <Numeric label="Maximum marks" value={field.maxMarks} onChange={maxMarks => patch({ graceFields: form.graceFields.map((f, j) => i === j ? { ...f, maxMarks } : f) })} />
        <TouchableOpacity className="p-3" accessibilityRole="button" accessibilityLabel="Remove grace field" onPress={() => patch({ graceFields: form.graceFields.filter(f => f.id !== field.id) })}><Trash2 size={17} color={ui.colors.textMuted} /></TouchableOpacity>
      </View>)}
      {!form.graceFields.length && <Text className="font-poppins text-xs text-ui-text-muted mb-3">Add the fields needed for this festival.</Text>}
      <SsfButton size="sm" variant="outline" label="Add field" icon={<Plus size={16} color={ui.colors.primary} />}
        onPress={() => patch({ graceFields: [...form.graceFields, { id: createRequestId(), name: '', maxMarks: NaN }] })} />
      <SsfButton size="sm" variant="ghost" label="Open Grace Marks entry" onPress={() => router.push('/(admin)/grace-marks' as any)} className="mt-3" />
    </SsfCard>
    {!!errors.length && <View className="mb-4">{errors.map(message => <Text key={message} className="font-poppins text-xs text-red-700 mb-1">{message}</Text>)}</View>}
    <SsfInput label="Change reason" value={reason} onChangeText={setReason} style={{ minHeight: 40, minWidth: 0, width: 0 }} />
    <View className="flex-row flex-wrap gap-3 mb-4"><SsfButton label="Save configuration" onPress={save} isLoading={update.isPending} disabled={!festival || !!errors.length || !!itemsError} />
      <SsfButton label="Cancel" variant="ghost" onPress={() => router.back()} /></View>
    {!!versions.length && <SsfCard><Text className="font-poppins-bold text-sm text-ui-text mb-2">Configuration history</Text>{versions.map(v =>
      <Text key={v.id} className="font-poppins text-xs text-ui-text-muted py-1">Version {v.config_version} · {v.change_reason || new Date(v.created_at).toLocaleString()}</Text>)}</SsfCard>}
    <SsfSheet visible={!!competitionPanel} onClose={() => setCompetitionPanel(null)} title={panelTitle} description={panelDescription}
      footer={<SsfButton label={competitionPanel?.mode === 'select' ? 'Done' : 'Close'} onPress={() => setCompetitionPanel(null)} />}>
      {competitionPanel?.mode === 'select' && <SsfInput label="Find competitions" value={search} onChangeText={setSearch}
        placeholder="Name, code or category" autoCapitalize="none" style={{ minHeight: 40, minWidth: 0, width: 0 }} />}
      {competitionOptionsLoading ? <ActivityIndicator className="py-5" /> : competitionOptionsError
        ? <Text className="font-poppins text-sm text-red-700">Could not load enabled competitions or categories. Close and reload before editing assignments.</Text>
        : <>
          {competitionPanel?.mode === 'select' && <Text className="font-poppins-bold text-xs text-ui-text mb-2">{panelSelectedIds.length} competitions selected</Text>}
          {panelItems.map((item: any) => {
            const selected = panelSelectedIds.includes(item.id), valid = isEnabledCompetition(item);
            const otherSectionIndex = competitionPanel?.mode === 'select' && competitionPanel.boost
              ? assignedInOtherSection(item.id, competitionPanel.boost, competitionPanel.sectionId!) : -1;
            const unavailableCategory = isCollegeFest && !enabledCategoryCodes.has(String(item.category_codes?.[0] ?? '').trim().toUpperCase());
            const row = <>
              {selected || competitionPanel?.mode !== 'select'
                ? <CheckCircle2 size={18} color={ui.colors.primary} />
                : <Circle size={18} color={ui.colors.textMuted} />}
              <View className="flex-1">
                <Text className="font-poppins text-sm text-ui-text">{item.item_name_en || item.item_name_ml}</Text>
                <Text className="font-poppins text-xs text-ui-text-muted">{item.item_code} · {(item.category_codes ?? []).join(' / ')}{!valid ? ` · ${unavailableCategory ? 'category disabled' : 'category review required'}` : ''}{otherSectionIndex >= 0 ? ` · Already in Section ${otherSectionIndex + 1}` : ''}</Text>
              </View>
            </>;
            return competitionPanel?.mode === 'select'
              ? <TouchableOpacity key={item.id} disabled={(!valid && !selected) || otherSectionIndex >= 0} onPress={() => toggleSectionItem(item.id, competitionPanel.boost!, competitionPanel.sectionId!)}
                accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: (!valid && !selected) || otherSectionIndex >= 0 }}
                className="flex-row items-center gap-3 py-3 border-b border-ui-border">{row}</TouchableOpacity>
              : <View key={item.id} className="flex-row items-center gap-3 py-3 border-b border-ui-border">{row}</View>;
          })}
          {!panelItems.length && <Text className="font-poppins text-sm text-ui-text-muted py-4">
            {competitionPanel?.mode === 'select' ? 'No matching competitions.' : 'No competitions in this selection yet.'}
          </Text>}
          {competitionPanel?.mode === 'both' && bothBoostIds.length > bothBoostItems.length &&
            <Text className="font-poppins text-xs text-ui-text-muted mt-3">{bothBoostIds.length - bothBoostItems.length} selected item(s) are unavailable in the current competition list.</Text>}
        </>}
    </SsfSheet>
  </ScrollView>;
}
