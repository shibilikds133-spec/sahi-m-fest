import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import {
  ArrowLeft, ClipboardList, PenLine,
} from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useJudges } from '../../../../core/hooks/useJudges';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useFestival } from '../../../../core/hooks/useFestival';
import { calculatePoints, calculateGrade } from '../../../../core/utils/pointCalculator';

// ─── Constants ────────────────────────────────────────────────────────────────
const OFFICIAL_BRACKETS: Record<string, number[]> = {
  '1': [6, 5, 3, 1],
  '2': [7, 6, 4, 2],
  '3': [10, 9, 6, 3],
  '4-5': [18, 15, 10, 5],
  '6-10': [25, 20, 12, 6],
};

// ─── Constants ────────────────────────────────────────────────────────────────
const RANKS = ['1st', '2nd', '3rd', '4th', '5th'] as const;
const GRADES = ['A+', 'A', 'B', 'C', '-'] as const;

type ResultEntry = {
  registration_id: string;
  code_letter: string;
  rank: string | null;
  grade: string | null;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/(admin)/schedule');

  const { schedules } = useSchedule();
  const schedule = schedules?.find((s: any) => s.id === scheduleId);
  const { usePointsConfig, useActiveFestival } = useFestival();

  // Resolve festival_id: use schedule's festival_id if set, else fall back to active festival
  const { data: activeFestival } = useActiveFestival();
  const resolvedFestivalId: string | null = schedule?.festival_id ?? activeFestival?.id ?? null;

  const {
    useScheduleRegistrations,
    useMarkEntries,
    useResults,
    publishResults: publishResultsMutation,
    useJudgeSubmissionSummary,
  } = useJudges();

  const { updateSchedule } = useSchedule();

  const { data: registrations, isLoading } = useScheduleRegistrations(scheduleId);
  const { data: markEntries } = useMarkEntries(scheduleId);
  const { data: existingResults } = useResults(scheduleId);
  const { data: pointsConfig } = usePointsConfig(resolvedFestivalId ?? undefined);
  const { data: judgeSummary } = useJudgeSubmissionSummary(scheduleId);

  // ── Mode selection ────────────────────────────────────────────────────────
  // 'none' = not chosen, 'marks' = judges used system, 'direct' = direct entry
  const [mode, setMode] = useState<'none' | 'marks' | 'direct'>('none');

  // ── Result state ──────────────────────────────────────────────────────────
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  
  const [officialBracket, setOfficialBracket] = useState<string>('1');
  const [forceRepublishConfirmed, setForceRepublishConfirmed] = useState(false);
  
  const hasInitialized = React.useRef(false);

  // Init results from existing results or registrations
  React.useEffect(() => {
    if (schedule) {
      setOfficialBracket(schedule.official_participant_bracket || '1');
    }
    
    if (registrations && existingResults && !hasInitialized.current) {
      const init: Record<string, ResultEntry> = {};
      
      // First populate with registrations
      (registrations as any[]).forEach(reg => {
        init[reg.id] = {
          registration_id: reg.id,
          code_letter: reg.code_letter,
          rank: null,
          grade: null,
        };
      });
      
      const existingRows = existingResults as any[];
      const hasPublishedRows = existingRows.some(res =>
        res.published === true || res.result_status === 'published'
      );
      setPublished(hasPublishedRows);
      
      const savedMethod = existingRows.find(res => res.collection_method)?.collection_method;
      if (savedMethod === 'manual' || savedMethod === 'judges') {
        setMode(savedMethod === 'manual' ? 'direct' : 'marks');
      }
      
      existingRows.forEach(res => {
        if (init[res.registration_id]) {
          init[res.registration_id] = {
            ...init[res.registration_id],
            rank: res.rank ? res.rank.toString() + (res.rank === 1 ? 'st' : res.rank === 2 ? 'nd' : res.rank === 3 ? 'rd' : 'th') : null,
            grade: res.grade,
          };
        }
      });
      
      setResults(init);
      hasInitialized.current = true;
    }
  }, [registrations, existingResults, schedule]);

  // ── Judge marks helper ─────────────────────────────────────────────────────
  const getJudgeMarks = (regId: string) =>
    (markEntries as any[])?.filter(m => m.registration_id === regId) ?? [];

  const getAvgMark = (regId: string) => {
    const entries = getJudgeMarks(regId).filter((e: any) => e.is_final);
    if (!entries.length) return null;
    const avg = entries.reduce((sum: number, e: any) => sum + (e.total_mark ?? 0), 0) / entries.length;
    return Math.round(avg);
  };

  const getPointsPreview = (grade: string | null, rank: string | null) => {
    let rankPts = 0;
    let gradePts = 0;

    const rankNum = typeof rank === 'string' ? parseInt(rank.replace(/\D/g, ''), 10) : null;
    
    // Calculate Rank points (use config from DB)
    if (rankNum === 1) rankPts = pointsConfig?.rank_1_points ?? 5;
    else if (rankNum === 2) rankPts = pointsConfig?.rank_2_points ?? 3;
    else if (rankNum === 3) rankPts = pointsConfig?.rank_3_points ?? 1;

    // Calculate Grade points (use official hardcoded table)
    if (grade && grade !== '-') {
      const gIndex = grade === 'A+' ? 0 : grade === 'A' ? 1 : grade === 'B' ? 2 : grade === 'C' ? 3 : -1;
      if (gIndex !== -1 && OFFICIAL_BRACKETS[officialBracket]) {
        gradePts = OFFICIAL_BRACKETS[officialBracket][gIndex];
      }
    }

    return { rankPts, gradePts, total: rankPts + gradePts };
  };

  const expectedJudges = Array.isArray(schedule?.judge_panel_id)  
    ? Math.max(1, schedule.judge_panel_id.length) 
    : (schedule?.expected_judge_count || 3);

  // Overall readiness banner for the schedule
  const overallReadiness = React.useMemo(() => {
    if (published) return { label: '✅ Results Published', color: 'bg-green-100', textColor: 'text-green-800' };
    
    const regs = (registrations as any[]) || [];
    if (!regs.length) return null;
    
    let fullyReadyCount = 0;
    let anySubmissions = false;

    regs.forEach(reg => {
      const marks = getJudgeMarks(reg.id).filter(m => m.is_final);
      if (marks.length > 0) anySubmissions = true;
      if (marks.length >= expectedJudges) fullyReadyCount++;
    });

    if (fullyReadyCount === regs.length && regs.length > 0) {
      return { label: '🟢 All judges submitted — Ready for Calculation', color: 'bg-green-50', textColor: 'text-green-700' };
    }
    if (anySubmissions) {
      return { label: `🟠 ${fullyReadyCount}/${regs.length} participants ready`, color: 'bg-orange-50', textColor: 'text-orange-700' };
    }
    return { label: '🟡 Waiting for judge submissions', color: 'bg-yellow-50', textColor: 'text-yellow-700' };
  }, [registrations, markEntries, expectedJudges, published]);

  const autoFillFromMarks = () => {
    if (!registrations || !markEntries) return;

    // 1. Calculate avgs and grades
    const scores = (registrations as any[]).map(reg => {
      const avg = getAvgMark(reg.id);
      let grade = avg ? calculateGrade(avg, 100) : null;
      // Convert null to '-'
      if (!grade) grade = '-';
      return {
        id: reg.id,
        avg: avg ?? 0,
        grade,
      };
    });

    // 2. Sort to assign ranks (standard competition ranking: 1, 2, 2, 4)
    const sorted = [...scores].sort((a, b) => b.avg - a.avg);
    
    let currentRank = 1;
    let previousAvg = -1;
    const rankMapping: Record<string, string> = {};
    
    sorted.forEach((item, index) => {
      if (item.avg === 0) {
        rankMapping[item.id] = '-';
        return;
      }
      if (item.avg !== previousAvg) {
        currentRank = index + 1;
      }
      previousAvg = item.avg;
      
      let rStr = '-';
      if (currentRank === 1) rStr = '1st';
      else if (currentRank === 2) rStr = '2nd';
      else if (currentRank === 3) rStr = '3rd';
      else if (currentRank === 4) rStr = '4th';
      else if (currentRank === 5) rStr = '5th';
      
      rankMapping[item.id] = rStr;
    });

    setResults(prev => {
      const next = { ...prev };
      scores.forEach(s => {
        if (next[s.id]) {
          next[s.id] = {
            ...next[s.id],
            grade: s.grade,
            rank: rankMapping[s.id]
          };
        }
      });
      return next;
    });
  };

  // Run auto-calculation whenever in marks mode and data is available
  React.useEffect(() => {
    if (mode === 'marks') {
      autoFillFromMarks();
    }
  }, [mode, registrations, markEntries]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!officialBracket) {
      if (Platform.OS === 'web') window.alert('Validation Error: Please select the Official Participant Bracket before publishing.');
      else Alert.alert('Validation Error', 'Please select the Official Participant Bracket before publishing.');
      return;
    }

    const unset = [];
    
    // Lock guard for republishing
    if (published && !forceRepublishConfirmed) {
      const warnMsg = 'Republishing will recalculate grade points using the currently selected official participant bracket. Are you sure you want to republish?';
      if (Platform.OS === 'web') {
        const confirmed = window.confirm(warnMsg);
        if (!confirmed) return;
        setForceRepublishConfirmed(true);
      } else {
        Alert.alert('Republish Warning', warnMsg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Republish', style: 'destructive', onPress: () => setForceRepublishConfirmed(true) }
        ]);
        return;
      }
    }
    
    setSaving(true);
    try {
      const payloads = Object.values(results).map(r => {
        const cleanedRank = typeof r.rank === 'string' ? r.rank.replace(/\D/g, '') : '';
        const rankNum = cleanedRank && cleanedRank.length > 0 ? parseInt(cleanedRank, 10) : null;
        
        // Full recalculation rule using newly constructed preview utility
        const { total } = getPointsPreview(r.grade, r.rank);
        const avgMark = getAvgMark(r.registration_id);

        return {
          tenant_id: schedule?.tenant_id,
          festival_id: resolvedFestivalId,   // always populated via fallback
          item_id: schedule?.item_id,
          registration_id: r.registration_id,
          total_score: avgMark,
          rank: rankNum,
          grade: r.grade,
          points_awarded: total,
          published: true,
          published_at: new Date().toISOString(),
          result_status: 'published',
          public_visible: false,
          collection_method: mode === 'direct' ? 'manual' : 'judges',
        };
      });

      // Update both results and the schedule's official bracket together
      await Promise.all([
        publishResultsMutation.mutateAsync(payloads),
        updateSchedule({ id: scheduleId, payload: { official_participant_bracket: officialBracket } })
      ]);
      
      setPublished(true);
      setForceRepublishConfirmed(false); // reset lock
      if (Platform.OS === 'web') {
        window.alert('✅ Results Published: Results have been saved. (Posters can be generated from Media Center -> Poster Studio)');
      } else {
        Alert.alert('✅ Results Published', 'Results have been saved. (Posters can be generated from Media Center -> Poster Studio)');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('Error: ' + e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const setField = (regId: string, field: 'rank' | 'grade', value: string) => {
    setResults(prev => ({
      ...prev,
      [regId]: { ...prev[regId], [field]: value === '-' ? null : value },
    }));
  };

  if (isLoading) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />;

  // ── Mode selector screen ───────────────────────────────────────────────────
  if (mode === 'none') {
    return (
      <View className="flex-1 bg-ssf-bg">
        <View className="bg-ssf-primary pt-14 pb-8 px-5 rounded-b-[28px]">
          <View className="flex-row items-center mb-2">
            <TouchableOpacity onPress={goBack} className="mr-3 p-1.5 bg-white/10 rounded-full">
              <ArrowLeft size={20} color="#FFF" />
            </TouchableOpacity>
            <Text className="text-xl font-poppins-black text-white flex-1" numberOfLines={1}>
              Result Entry
            </Text>
          </View>
          <Text className="text-white/70 font-poppins text-sm">
            {schedule?.items?.item_name_ml ?? 'Event'}
          </Text>
        </View>

        <View className="flex-1 px-5 pt-8 gap-y-4">
          <Text className="font-poppins-bold text-ssf-text text-lg mb-2 text-center">
            How were marks collected?
          </Text>

          {/* Mode A: Judges used the system */}
          <TouchableOpacity
            onPress={() => setMode('marks')}
            className="bg-white border-2 border-ssf-primary rounded-2xl p-5"
          >
            <View className="flex-row items-center gap-x-3 mb-2">
              <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center">
                <ClipboardList size={20} color="#1B6B3A" />
              </View>
              <Text className="font-poppins-black text-ssf-text text-base">
                Judges Used the System
              </Text>
            </View>
            <Text className="font-poppins text-ssf-text-muted text-sm">
              ജഡ്ജിമാർ system-ൽ marks enter ചെയ്തിട്ടുണ്ട്. 3 judges-ന്റെ marks കണ്ട് final rank + grade confirm ചെയ്യാം.
            </Text>
          </TouchableOpacity>

          {/* Mode B: Direct entry */}
          <TouchableOpacity
            onPress={() => setMode('direct')}
            className="bg-white border-2 border-gray-200 rounded-2xl p-5"
          >
            <View className="flex-row items-center gap-x-3 mb-2">
              <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                <PenLine size={20} color="#6B7280" />
              </View>
              <Text className="font-poppins-black text-ssf-text text-base">
                Direct Entry (Manual)
              </Text>
            </View>
            <Text className="font-poppins text-ssf-text-muted text-sm">
              ജഡ്ജിമാർ system use ചെയ്തിട്ടില്ല. Committee തീരുമാനിച്ച rank + grade directly enter ചെയ്യുക.
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Entry screen (shared for both modes) ──────────────────────────────────
  return (
    <View className="flex-1 bg-ssf-bg">
      {/* Header */}
      <View className="bg-ssf-primary pt-14 pb-5 px-5 rounded-b-[24px]">
        <View className="flex-row items-center mb-1">
          <TouchableOpacity onPress={() => setMode('none')} className="mr-3 p-1.5 bg-white/10 rounded-full">
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-lg font-poppins-black text-white flex-1" numberOfLines={1}>
            {mode === 'marks' ? '📊 Mark-Based Result' : '✏️ Direct Entry'}
          </Text>
        </View>
        <Text className="text-white/70 font-poppins text-xs ml-10">
          {schedule?.items?.item_name_ml ?? 'Event'} · {Object.keys(results).length} participants
          {published && schedule?.official_participant_bracket && ` · Official Bracket: ${schedule.official_participant_bracket}`}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {/* Readiness Banner (marks mode only) */}
        {mode === 'marks' && overallReadiness && (
          <View className={`${overallReadiness.color} border border-gray-200 rounded-2xl px-4 py-3 mb-4`}>
            <Text className={`font-poppins-bold text-sm ${overallReadiness.textColor}`}>
              {overallReadiness.label}
            </Text>
            {judgeSummary && (judgeSummary as any[]).length > 0 && (
              <View className="mt-2 gap-y-1">
                {(judgeSummary as any[]).map((j: any, idx: number) => {
                  const submitted = Number(j.submitted_count) || 0;
                  const total = Number(j.total_assigned) || 0;
                  return (
                    <Text key={j.judge_id} className="font-poppins text-xs text-gray-600">
                      {idx + 1}. {j.judge_name}:{' '}
                      {submitted >= total && total > 0 ? '✅ Submitted' : submitted > 0 ? `⏳ ${submitted}/${total}` : '❌ Pending'}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Official Participant Bracket Configuration */}
        <SsfCard className="mb-4 bg-blue-50/50 border-blue-100 p-4">
          <Text className="font-poppins-bold text-blue-900 text-sm mb-1">
            🎭 Official Participant Bracket
          </Text>
          <Text className="font-poppins text-xs text-blue-700 mb-3 leading-relaxed">
            Select the participant bracket for grade calculation. This will be permanently locked upon publication.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {Object.keys(OFFICIAL_BRACKETS).map((bracket) => {
              const isSelected = officialBracket === bracket;
              // If published, strictly disable other buttons unless forceRepublish is toggled
              const isDisabled = published && !forceRepublishConfirmed && !isSelected;
              return (
                <TouchableOpacity
                  key={bracket}
                  onPress={() => setOfficialBracket(bracket)}
                  disabled={isDisabled}
                  className={`px-4 py-2 rounded-lg border ${
                    isSelected 
                      ? 'bg-blue-600 border-blue-600' 
                      : isDisabled 
                        ? 'bg-gray-100 border-gray-200 opacity-50' 
                        : 'bg-white border-blue-200'
                  }`}
                >
                  <Text className={`font-poppins-bold text-sm ${isSelected ? 'text-white' : isDisabled ? 'text-gray-400' : 'text-blue-800'}`}>
                    {bracket} {bracket === '1' ? 'Person' : 'People'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SsfCard>

        {(registrations as any[])?.map(reg => {
          const entry = results[reg.id];
          const judgeMarks = getJudgeMarks(reg.id);
          const avg = getAvgMark(reg.id);
          const ptsPreview = getPointsPreview(entry?.grade ?? null, entry?.rank ?? null);

          return (
            <SsfCard key={reg.id} className="mb-4 p-4">
              {/* Code Letter + avg (if marks mode) */}
              <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-gray-100">
                <View className="flex-row items-center gap-x-2">
                  <View className="w-10 h-10 rounded-full bg-ssf-primary items-center justify-center">
                    <Text className="font-poppins-black text-white text-lg">
                      {reg.code_letter}
                    </Text>
                  </View>
                  <View>
                    <Text className="font-poppins-bold text-ssf-text">Code: {reg.code_letter}</Text>
                    <Text className="font-poppins text-xs text-ssf-text-muted">
                      Chest #{reg.participants?.chest_number}
                    </Text>
                  </View>
                </View>

                {/* Show avg only in marks mode */}
                {mode === 'marks' && avg !== null && (
                  <View className="bg-ssf-primary/10 px-3 py-1 rounded-full">
                    <Text className="font-poppins-bold text-ssf-primary text-sm">
                      Avg: {avg}/100
                    </Text>
                  </View>
                )}
              </View>

              {/* Judge marks breakdown — marks mode only */}
              {mode === 'marks' && judgeMarks.length > 0 && (
                <View className="bg-gray-50 rounded-xl p-3 mb-3">
                  <Text className="font-poppins-bold text-xs text-ssf-text-muted mb-2">
                    Judge Marks:
                  </Text>
                  {judgeMarks.map((m: any, i: number) => (
                    <View key={m.id} className="flex-row justify-between mb-1">
                      <Text className="font-poppins text-xs text-ssf-text">
                        {m.judges?.name ?? `Judge ${i + 1}`}
                      </Text>
                      <Text className="font-poppins-bold text-xs text-ssf-primary">
                        {m.total_mark}/100 {m.is_final ? '✓' : '(draft)'}
                      </Text>
                    </View>
                  ))}
                  {judgeMarks.length < expectedJudges && (
                    <Text className="font-poppins text-xs text-orange-600 mt-1">
                      ⚠️ Only {judgeMarks.length}/{expectedJudges} judges submitted
                    </Text>
                  )}
                </View>
              )}

              {/* Rank selector */}
              <View className="mb-3">
                <Text className="font-poppins-bold text-ssf-text text-sm mb-2">
                  🏆 Final Rank
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {RANKS.map(rank => (
                    <TouchableOpacity
                      key={rank}
                      onPress={() => setField(reg.id, 'rank', rank)}
                      className={`px-4 py-2 rounded-full border ${
                        entry?.rank === rank
                          ? 'bg-ssf-primary border-ssf-primary'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <Text className={`font-poppins-bold text-sm ${
                        entry?.rank === rank ? 'text-white' : 'text-gray-600'
                      }`}>
                        {rank}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setField(reg.id, 'rank', '-')}
                    className={`px-4 py-2 rounded-full border ${
                      (!entry?.rank || entry?.rank === '-') ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className="font-poppins-bold text-sm text-gray-500">No Rank</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Grade selector */}
              <View>
                <Text className="font-poppins-bold text-ssf-text text-sm mb-2">
                  📊 Final Grade
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {GRADES.map(grade => (
                    <TouchableOpacity
                      key={grade}
                      onPress={() => setField(reg.id, 'grade', grade)}
                      className={`px-4 py-2 rounded-full border ${
                        (entry?.grade === grade || (!entry?.grade && grade === '-'))
                          ? grade === 'A+' ? 'bg-green-500 border-green-500'
                          : grade === 'A' ? 'bg-blue-500 border-blue-500'
                          : grade === 'B' ? 'bg-yellow-500 border-yellow-500'
                          : grade === 'C' ? 'bg-orange-500 border-orange-500'
                          : 'bg-gray-400 border-gray-400'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <Text className={`font-poppins-black text-sm ${
                        (entry?.grade === grade || (!entry?.grade && grade === '-'))
                          ? 'text-white' : 'text-gray-600'
                      }`}>
                        {grade}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Point Preview per Participant for Audit Visibility */}
              <View className="mt-4 pt-3 border-t border-gray-100 flex-row justify-between items-center">
                <Text className="font-poppins-bold text-xs text-ssf-text-muted">
                  Points Preview:
                </Text>
                <View className="flex-row items-center gap-x-2">
                  <Text className="font-poppins text-xs text-gray-600">
                    Rnk: <Text className="font-poppins-bold">{ptsPreview.rankPts}</Text>
                  </Text>
                  <Text className="font-poppins text-xs text-gray-400">+</Text>
                  <Text className="font-poppins text-xs text-gray-600">
                    Grd: <Text className="font-poppins-bold text-green-700">{ptsPreview.gradePts}</Text>
                  </Text>
                  <Text className="font-poppins text-xs text-gray-400">=</Text>
                  <View className="bg-ssf-primary/10 px-2 py-0.5 rounded">
                    <Text className="font-poppins-bold text-sm text-ssf-primary">
                      {ptsPreview.total} pts
                    </Text>
                  </View>
                </View>
              </View>

            </SsfCard>
          );
        })}
        <View className="h-28" />
      </ScrollView>

      {/* Publish button */}
      <View className="absolute bottom-6 left-4 right-4">
        {published && forceRepublishConfirmed && (
          <View className="bg-red-50 border border-red-200 p-2 rounded-t-xl -mb-2 z-0 flex-row items-center justify-center">
            <Text className="font-poppins-bold text-[10px] text-red-600 text-center">
              ⚠️ Republishing is unlocked. Points will be re-calculated with new bracket!
            </Text>
          </View>
        )}
        <SsfButton
          label={(published && !forceRepublishConfirmed) ? '✅ Results Published' : '🚀 Publish Results'}
          onPress={handlePublish}
          isLoading={saving}
          className={`shadow-xl relative z-10 ${published && !forceRepublishConfirmed ? 'opacity-80' : ''}`}
        />
      </View>
    </View>
  );
}
