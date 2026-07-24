import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, UserCheck, Save, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useJudges } from '../../../../core/hooks/useJudges';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { calculateGrade } from '../../../../services/judgeService';
import { useAuthStore } from '../../../../core/store/authStore';

import { getScoringRulesForItem, formatCriteriaForUI } from '../../../../core/utils/scoringRules';

export default function MarkEntryPage() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  const { tenant_id } = useAuthStore();

  const { schedules } = useSchedule();
  const schedule = schedules?.find((s: any) => s.id === scheduleId);

  const {
    judges,
    useScheduleRegistrations,
    useMarkEntries,
    saveMarkEntry,
    finalizeMarkEntry,
    useJudgeSubmissionSummary,
  } = useJudges();

  const { data: registrations, isLoading: loadingRegs } = useScheduleRegistrations(scheduleId);
  const { data: markEntries, refetch: refetchMarks } = useMarkEntries(scheduleId);
  const { data: judgeSummary } = useJudgeSubmissionSummary(scheduleId);

  // Local state: marks[registrationId][judgeId] = { criteria_scores, total_mark }
  const [marks, setMarks] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [selectedJudge, setSelectedJudge] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);

  // Sync loaded marks from database to local state so Admin can see judge inputs
  React.useEffect(() => {
    if (markEntries && Array.isArray(markEntries)) {
      setMarks(prev => {
        // Use deep clone to ensure React re-renders correctly on nested changes
        const newMarks = JSON.parse(JSON.stringify(prev));
        let hasChanges = false;
        
        markEntries.forEach(entry => {
          if (!newMarks[entry.registration_id]) {
            newMarks[entry.registration_id] = {};
            hasChanges = true;
          }
          
          const currentScores = newMarks[entry.registration_id][entry.judge_id];
          const dbScores = entry.criteria_scores || {};
          
          // If the scores in local state differ from DB, sync them!
          if (JSON.stringify(currentScores) !== JSON.stringify(dbScores)) {
            newMarks[entry.registration_id][entry.judge_id] = dbScores;
            hasChanges = true;
          }
        });
        
        return hasChanges ? newMarks : prev;
      });
    }
  }, [markEntries]);

  // Load criteria based on schedule item
  React.useEffect(() => {
    const fetchRules = async () => {
      if (schedule?.items) {
        const itemNameEn = schedule.items.item_name_en || '';
        const itemNameMl = schedule.items.item_name_ml || '';
        const itemType = schedule.items.item_type || 'stage';
        const rules = await getScoringRulesForItem(itemNameEn, itemNameMl, itemType as any, tenant_id);
        setEventCriteria(formatCriteriaForUI(rules.criteria));
      }
    };
    fetchRules();
  }, [schedule, tenant_id]);

  const judge = judges.find((j: any) => j.id === selectedJudge);

  const updateScore = (regId: string, judgeId: string, criteriaKey: string, value: number) => {
    setMarks(prev => ({
      ...prev,
      [regId]: {
        ...prev[regId],
        [judgeId]: {
          ...(prev[regId]?.[judgeId] ?? {}),
          [criteriaKey]: value,
        },
      },
    }));
  };

  const getTotal = (regId: string, judgeId: string) => {
    const scores = marks[regId]?.[judgeId] ?? {};
    return Object.values(scores).reduce((a, b) => a + b, 0);
  };

  const handleSaveAll = async () => {
    if (!selectedJudge) {
      Alert.alert('Select Judge', 'Please select a judge first.');
      return;
    }
    
    if (!registrations || (registrations as any[]).length === 0) return;

    setIsSavingAll(true);
    try {
      for (const reg of registrations as any[]) {
        const scores = marks[reg.id]?.[selectedJudge] ?? {};
        const total = Object.values(scores).reduce((a, b) => a + b, 0);

        await saveMarkEntry.mutateAsync({
          schedule_id: scheduleId,
          judge_id: selectedJudge,
          registration_id: reg.id,
          criteria_scores: scores,
          total_mark: total,
          is_draft: false,
        });
      }
      refetchMarks();
      if (Platform.OS === 'web') {
        window.alert('Success: All marks for this judge have been submitted successfully!');
      } else {
        Alert.alert('Success', 'All marks for this judge have been submitted successfully!');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('Error: ' + (e.message || 'Failed to save marks'));
      } else {
        Alert.alert('Error', e.message || 'Failed to save marks');
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  // Get existing entry for a reg + judge
  const getEntry = (regId: string, judgeId: string) =>
    (markEntries as any[])?.find(
      m => m.registration_id === regId && m.judge_id === judgeId
    );

  if (loadingRegs) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />;

  return (
    <View className="flex-1 bg-ssf-bg">
      {/* Header */}
      <View className="bg-ssf-primary pt-14 pb-6 px-5 rounded-b-[28px]">
        <View className="flex-row items-center mb-2">
          <TouchableOpacity onPress={goBack} className="mr-3 p-1.5 bg-white/10 rounded-full">
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-xl font-poppins-black text-white flex-1" numberOfLines={1}>
            Mark Entry
          </Text>
        </View>
        <Text className="text-white/70 font-poppins text-sm">
          {schedule?.items?.item_name_ml ?? 'Event'}
        </Text>

        {/* Judge Status Panel */}
        {judgeSummary && (judgeSummary as any[]).length > 0 && (
          <View className="mt-3 bg-white/10 rounded-2xl p-3 gap-y-1.5">
            <Text className="font-poppins-bold text-white/80 text-xs mb-1">Judge Status</Text>
            {(judgeSummary as any[]).map((j: any, idx: number) => {
              const total = Number(j.total_assigned) || 0;
              const submitted = Number(j.submitted_count) || 0;
              const allDone = submitted >= total && total > 0;
              const partial = submitted > 0 && !allDone;
              return (
                <View key={j.judge_id} className="flex-row items-center justify-between">
                  <Text className="font-poppins text-white text-xs flex-1" numberOfLines={1}>
                    {idx + 1}. {j.judge_name}
                  </Text>
                  <View className={`px-2 py-0.5 rounded-full ${
                    allDone ? 'bg-green-400/30' : partial ? 'bg-yellow-400/30' : 'bg-white/10'
                  }`}>
                    <Text className={`font-poppins-bold text-xs ${
                      allDone ? 'text-green-200' : partial ? 'text-yellow-200' : 'text-white/50'
                    }`}>
                      {allDone ? `✅ Submitted (${submitted}/${total})` :
                       partial ? `⏳ Partial (${submitted}/${total})` :
                       '❌ Pending'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Judge selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 -mx-1">
          {judges.map((j: any) => (
            <TouchableOpacity
              key={j.id}
              onPress={() => setSelectedJudge(j.id)}
              className={`mx-1 px-3 py-1.5 rounded-full border ${
                selectedJudge === j.id
                  ? 'bg-white border-white'
                  : 'border-white/40 bg-white/10'
              }`}
            >
              <Text className={`font-poppins-bold text-xs ${
                selectedJudge === j.id ? 'text-ssf-primary' : 'text-white'
              }`}>
                {j.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {!selectedJudge ? (
        <View className="flex-1 items-center justify-center px-6">
          <UserCheck size={48} color="#9CA3AF" />
          <Text className="font-poppins-bold text-ssf-text-muted mt-3 text-center">
            Select a judge above to start entering marks
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4">
          {(!registrations || registrations.length === 0) ? (
            <SsfCard className="items-center py-8">
              <AlertCircle size={36} color="#9CA3AF" />
              <Text className="font-poppins text-ssf-text-muted mt-2 text-center">
                No participants with code letters found.{'\n'}Complete the Code Letter Draw first.
              </Text>
            </SsfCard>
          ) : (
            (registrations as any[]).map((reg) => {
              const entry = getEntry(reg.id, selectedJudge);
              const total = getTotal(reg.id, selectedJudge);
              const grade = calculateGrade(total, 100);
              const isSaving = saving === reg.id;

              return (
                <SsfCard key={reg.id} className="mb-4">
                  {/* Code Letter header — judge sees CODE not name */}
                  <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-gray-100">
                    <View className="flex-row items-center gap-x-2">
                      <View className="w-10 h-10 rounded-full bg-ssf-primary items-center justify-center">
                        <Text className="font-poppins-black text-white text-lg">
                          {reg.code_letter}
                        </Text>
                      </View>
                      <View>
                        <Text className="font-poppins-bold text-ssf-text">
                          Code: {reg.code_letter}
                        </Text>
                        <Text className="font-poppins text-xs text-ssf-text-muted">
                          {/* Judges see code letter only, not name */}
                          Participant #{reg.participants?.chest_number ?? '?'}
                        </Text>
                      </View>
                    </View>
                    {/* Grade badge */}
                    <View className={`px-3 py-1 rounded-full ${
                      grade === 'A+' ? 'bg-green-100' :
                      grade === 'A' ? 'bg-blue-50' :
                      grade === 'B' ? 'bg-yellow-50' :
                      grade === 'C' ? 'bg-orange-50' : 'bg-gray-50'
                    }`}>
                      <Text className={`font-poppins-black text-lg ${
                        grade === 'A+' ? 'text-green-700' :
                        grade === 'A' ? 'text-blue-700' :
                        grade === 'B' ? 'text-yellow-700' :
                        grade === 'C' ? 'text-orange-700' : 'text-gray-400'
                      }`}>{total > 0 ? `${grade}` : '—'}</Text>
                    </View>
                  </View>

                  {/* Criteria inputs */}
                  {eventCriteria.map(c => (
                    <View key={c.key} className="mb-3">
                      <View className="flex-row justify-between mb-1">
                        <Text className="font-poppins text-ssf-text text-sm">{c.label}</Text>
                        <Text className="font-poppins-bold text-ssf-primary text-sm">
                          {marks[reg.id]?.[selectedJudge]?.[c.key] ?? 0} / {c.max}
                        </Text>
                      </View>
                      <View className="flex-row gap-x-1 flex-wrap">
                        {Array.from({ length: c.max / 5 + 1 }, (_, i) => i * 5).map(val => (
                          <TouchableOpacity
                            key={val}
                            onPress={() => updateScore(reg.id, selectedJudge, c.key, val)}
                            className={`px-2.5 py-1 rounded-lg mb-1 border ${
                              (marks[reg.id]?.[selectedJudge]?.[c.key] ?? -1) === val
                                ? 'bg-ssf-primary border-ssf-primary'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <Text className={`font-poppins-bold text-xs ${
                              (marks[reg.id]?.[selectedJudge]?.[c.key] ?? -1) === val
                                ? 'text-white' : 'text-gray-600'
                            }`}>{val}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}

                  {/* Total */}
                  <View className="bg-gray-50 rounded-xl p-3 mb-3 flex-row justify-between">
                    <Text className="font-poppins-bold text-ssf-text">Total Mark</Text>
                    <Text className="font-poppins-black text-ssf-primary text-lg">{total} / 100</Text>
                  </View>

                  {/* Status indicator */}
                  {entry && (
                    <View className={`flex-row items-center gap-x-2 mb-3 px-3 py-2 rounded-lg ${
                      entry.is_final ? 'bg-green-50' : 'bg-yellow-50'
                    }`}>
                      <CheckCircle2 size={14} color={entry.is_final ? '#16A34A' : '#D97706'} />
                      <Text className={`font-poppins text-xs ${entry.is_final ? 'text-green-700' : 'text-yellow-700'}`}>
                        {entry.is_final ? 'Finalized' : 'Draft saved'}
                      </Text>
                    </View>
                  )}

                </SsfCard>
              );
            })
          )}
          
          {registrations && (registrations as any[]).length > 0 && (
            <View className="mt-2 mb-8 px-1">
              <SsfButton
                label={isSavingAll ? 'Submitting...' : 'Submit All Marks for Judge'}
                onPress={handleSaveAll}
                isLoading={isSavingAll}
              />
            </View>
          )}
          
          <View className="h-16" />
        </ScrollView>
      )}
    </View>
  );
}
