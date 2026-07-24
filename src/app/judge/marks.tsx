import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Platform, useWindowDimensions, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, AlertCircle, LogOut, Info, X, Bell } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { databaseProvider } from '../../providers/database';
import { judgeTokenService } from '../../services/judgeTokenService';
import { calculateGrade } from '../../services/judgeService';
import { SsfCard } from '../../components/ui/SsfCard';
import { SsfButton } from '../../components/ui/SsfButton';
import { getScoringRulesForItem, formatCriteriaForUI } from '../../core/utils/scoringRules';

export default function JudgeMarksPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [session, setSession] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, number>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [eventCriteria, setEventCriteria] = useState<any[]>([]);
  const [eventGuidelines, setEventGuidelines] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(false);

  // Mobile states
  const [activeRegIndex, setActiveRegIndex] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');
  const [syncQueue, setSyncQueue] = useState<string[]>([]);

  useEffect(() => {
    loadSession();
  }, []);

  const saveLocalDraft = async (currentMarks: any) => {
    try {
      if (session?.schedule_id && session?.judge_id) {
        await AsyncStorage.setItem(
          `judge_draft_marks_${session.schedule_id}_${session.judge_id}`,
          JSON.stringify(currentMarks)
        );
      }
    } catch (e) {
      console.error('Failed to save local draft:', e);
    }
  };

  const queueSync = (regId: string, updatedMarks: any) => {
    saveLocalDraft(updatedMarks);
    setSyncQueue(prev => {
      if (prev.includes(regId)) return prev;
      return [...prev, regId];
    });
  };

  useEffect(() => {
    if (syncQueue.length === 0) return;
    
    // Process queue
    const processQueue = async () => {
      setSyncStatus('saving');
      const regId = syncQueue[0];
      const scores = marks[regId] ?? {};
      const total = Object.values(scores).reduce((a, b) => a + b, 0);

      try {
        if (!session) return;
        const res = await databaseProvider.upsertMarkEntry({
          schedule_id: session.schedule_id,
          judge_id: session.judge_id,
          registration_id: regId,
          criteria_scores: scores,
          total_mark: total,
          tenant_id: session.tenant_id,
          is_draft: true,
          is_final: false,
        });

        if (res.error) throw new Error(res.error.message);

        try {
          // Fire and forget log
          databaseProvider.logJudgeActivity({
            judgeId: session.judge_id,
            scheduleId: session.schedule_id,
            tenantId: session.tenant_id,
            actionType: 'MARKS_UPDATED',
            actionDetails: {
              registrationId: regId,
              timestamp: new Date().toISOString()
            }
          });
        } catch(e) {}

        // Success! Remove from queue
        setSyncQueue(prev => prev.filter(id => id !== regId));
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Sync failed, will retry:', err);
        setSyncStatus('offline');
        // Wait 4 seconds and retry
        setTimeout(() => {
          setSyncQueue(prev => [...prev]);
        }, 4000);
      }
    };

    processQueue();
  }, [syncQueue, marks, session]);

  const loadSession = async () => {
    try {
      const sessionStr = await AsyncStorage.getItem('judge_session_data');
      const token = await AsyncStorage.getItem('judge_session_token');
      if (!sessionStr || !token) {
        router.replace('/judge' as any);
        return;
      }
      const sessionData = JSON.parse(sessionStr);
      setSession({ ...sessionData, token });

      // Load registrations for this schedule
      const { data } = await databaseProvider.getRegistrationsBySchedule<any>(sessionData.schedule_id);
      const regs = data ?? [];
      setRegistrations(regs);

      // Load criteria for this item
      const itemNameEn = sessionData.schedules?.items?.item_name_en || '';
      const itemNameMl = sessionData.schedules?.items?.item_name_ml || '';
      const itemType = sessionData.schedules?.items?.item_type || 'stage';
      const tenantId = sessionData.tenant_id;
      const rules = await getScoringRulesForItem(itemNameEn, itemNameMl, itemType as any, tenantId);
      setEventCriteria(formatCriteriaForUI(rules.criteria));
      if (rules.guidelines) {
        setEventGuidelines(rules.guidelines);
        setShowGuidelines(true); // Automatically show on first load
      }

      // Pre-fill marks: 1. Try local storage draft
      const localDraftKey = `judge_draft_marks_${sessionData.schedule_id}_${sessionData.judge_id}`;
      const localDraftStr = await AsyncStorage.getItem(localDraftKey);
      let loadedMarks: Record<string, Record<string, number>> = {};
      
      if (localDraftStr) {
        try {
          loadedMarks = JSON.parse(localDraftStr);
        } catch (_) {}
      }

      // 2. Fetch marks from database to merge/overwrite
      try {
        const { data: dbMarkEntries } = await databaseProvider.listMarkEntries<any>(sessionData.schedule_id);
        if (dbMarkEntries) {
          dbMarkEntries.forEach((entry: any) => {
            if (entry.judge_id === sessionData.judge_id) {
              loadedMarks[entry.registration_id] = entry.criteria_scores || {};
            }
          });
        }
      } catch (dbErr) {
        console.warn('Could not load marks from DB, using local only:', dbErr);
      }

      setMarks(loadedMarks);

    } catch (e) {
      router.replace('/judge' as any);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = (regId: string, key: string, value: number) => {
    setMarks(prev => {
      const updated = {
        ...prev,
        [regId]: { ...(prev[regId] ?? {}), [key]: value },
      };
      // Queue sync
      queueSync(regId, updated);
      return updated;
    });
  };

  const handleScoreChange = (regId: string, key: string, text: string, max: number) => {
    const numericText = text.replace(/[^0-9]/g, '');
    
    if (numericText === '') {
      setMarks(prev => {
        const newMarks = { ...prev };
        if (newMarks[regId]) {
          const { [key]: _, ...rest } = newMarks[regId];
          newMarks[regId] = rest;
        }
        queueSync(regId, newMarks);
        return newMarks;
      });
      return;
    }

    const val = parseInt(numericText, 10);
    
    if (val > max) {
      if (Platform.OS === 'web') {
        window.alert(`Maximum mark for this criteria is ${max}`);
      } else {
        Alert.alert('Invalid Mark', `Maximum mark for this criteria is ${max}`);
      }
      return;
    }
    
    updateScore(regId, key, val);
  };

  const getTotal = (regId: string) =>
    Object.values(marks[regId] ?? {}).reduce((a, b) => a + b, 0);

  const submitMarks = async () => {
    setSubmitting(true);
    try {
      // Save each mark entry
      for (const reg of registrations) {
        const scores = marks[reg.id] ?? {};
        const total = Object.values(scores).reduce((a, b) => a + b, 0);
        const res = await databaseProvider.upsertMarkEntry({
          schedule_id: session.schedule_id,
          judge_id: session.judge_id,
          registration_id: reg.id,
          criteria_scores: scores,
          total_mark: total,
          tenant_id: session.tenant_id,
          is_draft: false,
          is_final: true,
          submitted_at: new Date().toISOString(),
        });
        if (res.error) {
          throw new Error(`Failed to save mark entry: ${res.error.message}`);
        }
      }

      // Log the activity
      try {
        await databaseProvider.logJudgeActivity({
          judgeId: session.judge_id,
          scheduleId: session.schedule_id,
          tenantId: session.tenant_id,
          actionType: 'MARKS_SUBMITTED',
          actionDetails: {
            participantsCount: registrations.length,
            timestamp: new Date().toISOString()
          }
        });
      } catch (logErr) {
        console.error('Failed to log MARKS_SUBMITTED', logErr);
      }

      // Expire the token — cannot reuse
      await judgeTokenService.expireToken(session.token);

      // Clear local session
      await AsyncStorage.removeItem('judge_session_token');
      await AsyncStorage.removeItem('judge_session_data');

      setSubmitted(true);
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAll = async () => {
    const incomplete = registrations.filter(reg =>
      Object.keys(marks[reg.id] ?? {}).length < eventCriteria.length
    );
    if (incomplete.length > 0) {
      if (Platform.OS === 'web') {
        window.alert(`Incomplete Marks: ${incomplete.length} participant(s) still need marks in all criteria.`);
      } else {
        Alert.alert(
          'Incomplete Marks',
          `${incomplete.length} participant(s) still need marks in all criteria.`
        );
      }
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('⚠️ Final Submission\n\nOnce submitted, you cannot change the marks. This access code will expire.\n\nAre you sure?');
      if (confirmed) {
        await submitMarks();
      }
    } else {
      Alert.alert(
        '⚠️ Final Submission',
        'Once submitted, you cannot change the marks. This access code will expire.\n\nAre you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit Final',
            style: 'destructive',
            onPress: submitMarks,
          },
        ]
      );
    }
  };

  // ─── Submitted success screen ─────────────────────────────────────────────
  if (submitted) {
    return (
      <LinearGradient colors={['#030E21', '#0B1F33', '#120E2D']} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-24 h-24 rounded-full bg-white/5 border border-white/10 items-center justify-center mb-6">
            <CheckCircle2 size={56} color="#06B6D4" />
          </View>
          <Text className="text-3xl font-poppins-black text-white text-center mb-3">
            Marks Submitted!
          </Text>
          <Text className="text-white/60 font-poppins text-center leading-5">
            Your marks have been successfully recorded.{'\n'}
            This access code is now expired.{'\n\n'}
            Thank you for your service.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (loading) {
    return (
      <LinearGradient colors={['#030E21', '#0B1F33', '#120E2D']} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#06B6D4" size="large" />
          <Text className="text-white/60 font-poppins mt-3">Loading...</Text>
        </View>
      </LinearGradient>
    );
  }

  const scheduleInfo = session?.schedules;
  const judgeName = session?.judges?.name;
  const eventName = scheduleInfo?.items?.item_name_ml ?? scheduleInfo?.items?.item_name_en ?? 'Event';
  const venueName = scheduleInfo?.venues?.name ?? '';

  const GuidelinesModal = () => (
    <Modal visible={showGuidelines} transparent animationType="fade">
      <View className="flex-1 bg-black/80 justify-center px-4 py-10">
        <View 
          className="rounded-3xl overflow-hidden max-h-full flex-shrink-1 border border-white/20"
          style={{ backgroundColor: '#0B1F33' }}
        >
          <View className="px-5 py-4 flex-row justify-between items-center border-b border-white/10" style={{ backgroundColor: '#120E2D' }}>
            <Text className="font-poppins-bold text-lg text-white">Guidelines / കുറിപ്പുകൾ</Text>
            <TouchableOpacity onPress={() => setShowGuidelines(false)} className="p-2 bg-white/10 rounded-full">
              <X size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView className="px-5 py-6 flex-shrink-1">
            <Text className="font-poppins text-white/80 text-sm leading-[30px]" style={{ textAlign: 'left', writingDirection: 'ltr' }}>
              {eventGuidelines}
            </Text>
            <View className="h-10" />
          </ScrollView>
          <View className="p-4 border-t border-white/10 bg-white/5">
            <TouchableOpacity onPress={() => setShowGuidelines(false)}>
              <LinearGradient
                colors={['#06B6D4', '#3B82F6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                className="rounded-xl py-3 items-center"
              >
                <Text className="font-poppins-black text-white text-base">Got it</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderMobileLayout = () => {
    const activeReg = registrations[activeRegIndex];
    const total = activeReg ? getTotal(activeReg.id) : 0;
    const grade = activeReg ? calculateGrade(total, 100) : '—';
    const allDone = activeReg ? Object.keys(marks[activeReg.id] ?? {}).length === eventCriteria.length : false;
    const allMarked = registrations.length > 0 && registrations.every(reg =>
      Object.keys(marks[reg.id] ?? {}).length === eventCriteria.length
    );

    return (
      <View className="flex-1" style={{ backgroundColor: '#030E21' }}>
        {/* Mobile Header */}
        <View className="pt-12 pb-3 px-4 flex-row justify-between items-center border-b border-white/10" style={{ backgroundColor: '#120E2D' }}>
          <View className="flex-1">
            <Text className="text-white/60 font-poppins-bold text-[10px] uppercase tracking-wider">Judging Event</Text>
            <Text className="text-white font-poppins-black text-base" numberOfLines={1} ellipsizeMode="tail">
              {eventName}
            </Text>
          </View>
          <View className="flex-row items-center gap-x-2">
            {/* Sync Badge */}
            <View className={`px-2.5 py-1 rounded-full flex-row items-center gap-x-1 ${
              syncStatus === 'synced' ? 'bg-green-900/60 border border-green-600' :
              syncStatus === 'saving' ? 'bg-blue-900/60 border border-blue-600' :
              'bg-amber-900/60 border border-amber-600'
            }`}>
              <View className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === 'synced' ? 'bg-green-400' :
                syncStatus === 'saving' ? 'bg-blue-400' :
                'bg-amber-400'
              }`} />
              <Text className="text-white font-poppins-bold text-[10px]">
                {syncStatus === 'synced' ? 'Synced' :
                 syncStatus === 'saving' ? 'Saving' : 'Offline'}
              </Text>
            </View>

            {eventGuidelines && (
              <TouchableOpacity
                onPress={() => setShowGuidelines(true)}
                className="p-2 bg-white/10 rounded-full"
              >
                <Info size={14} color="#FFF" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push('/notifications' as any)}
              className="p-2 bg-white/10 rounded-full"
            >
              <Bell size={14} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/judge' as any)}
              className="p-2 bg-white/10 rounded-full"
            >
              <LogOut size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Participant Navigation Chips */}
        <View className="border-b border-white/10 py-2.5 shadow-sm" style={{ backgroundColor: '#0B1F33' }}>
          <View className="px-4 flex-row justify-between items-center mb-1.5">
            <Text className="font-poppins-bold text-[11px] text-white/50 uppercase tracking-wider">Participants list</Text>
            <Text className="font-poppins-bold text-[11px] text-cyan-400">
              {Object.keys(marks).length}/{registrations.length} Marked
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {registrations.map((reg, idx) => {
              const isCurrent = idx === activeRegIndex;
              const isRegMarked = Object.keys(marks[reg.id] ?? {}).length === eventCriteria.length;
              return (
                <TouchableOpacity
                  key={reg.id}
                  onPress={() => setActiveRegIndex(idx)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: isCurrent ? '#06B6D4' : isRegMarked ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginHorizontal: 4,
                    borderWidth: 1,
                    borderColor: isCurrent ? '#3B82F6' : isRegMarked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    position: 'relative',
                  }}
                >
                  <Text style={{
                    color: isCurrent ? '#FFF' : '#E5E7EB',
                    fontFamily: isCurrent ? 'Poppins_900Black' : 'Poppins_700Bold',
                    fontSize: 16,
                  }}>
                    {reg.code_letter}
                  </Text>
                  {isRegMarked && (
                    <View style={{
                      position: 'absolute',
                      bottom: 4,
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: isCurrent ? '#FFF' : '#10B981',
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Form Content */}
        <ScrollView className="flex-1 px-4 pt-3" keyboardShouldPersistTaps="handled">
          {registrations.length === 0 ? (
            <View className="items-center py-10 rounded-2xl border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <Text className="font-poppins text-white/50 text-center">
                No participants found for this event.
              </Text>
            </View>
          ) : (
            <View>
              {/* Note about code letters */}
              <View className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2.5 flex-row gap-x-2 items-center mb-3">
                <AlertCircle size={14} color="#FBBF24" />
                <Text className="font-poppins text-amber-200 text-[10px] leading-4 flex-1">
                  Confidential evaluation by Code Letter. Participant names are hidden.
                </Text>
              </View>

              {/* Active Participant Info Header */}
              <View 
                className="rounded-2xl p-4 border border-white/10 shadow-sm mb-4 flex-row justify-between items-center"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              >
                <View className="flex-row items-center gap-x-3">
                  <View className="w-14 h-14 rounded-2xl items-center justify-center shadow-sm" style={{ backgroundColor: '#06B6D4' }}>
                    <Text className="font-poppins-black text-white text-2xl">{activeReg?.code_letter}</Text>
                  </View>
                  <View>
                    <Text className="font-poppins-bold text-white text-sm">Code: {activeReg?.code_letter}</Text>
                    <Text className="font-poppins text-xs text-white/50">
                      {allDone ? '🎉 Marked completely' : '⚠️ Pending scores'}
                    </Text>
                  </View>
                </View>

                {/* Score / Grade summary */}
                <View className="items-end">
                  <Text className="font-poppins-black text-cyan-400 text-lg">{total} / 100</Text>
                  {total > 0 ? (
                    <Text className="font-poppins-bold text-[10px] text-white/40">Grade: {grade}</Text>
                  ) : null}
                </View>
              </View>

              {/* Criteria Mark Entry Fields */}
              {eventCriteria.map(c => {
                const currentValStr = activeReg && marks[activeReg.id]?.[c.key] !== undefined 
                  ? String(marks[activeReg.id]?.[c.key]) 
                  : '';
                return (
                  <View key={c.key} className="rounded-2xl p-4 border border-white/10 shadow-sm mb-3" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                    <Text className="font-poppins-bold text-white/90 text-xs mb-3">{c.label}</Text>
                    
                    <View className="flex-row items-center justify-between">
                      {/* Touch adjustments (- / +) */}
                      <View className="flex-row items-center gap-x-3">
                        <TouchableOpacity
                          onPress={() => {
                            if (!activeReg) return;
                            const currentVal = marks[activeReg.id]?.[c.key] ?? 0;
                            if (currentVal > 0) handleScoreChange(activeReg.id, c.key, String(currentVal - 1), c.max);
                          }}
                          style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                          className="items-center justify-center border border-white/10"
                        >
                          <Text className="font-poppins-black text-2xl text-white/70">-</Text>
                        </TouchableOpacity>

                        <TextInput
                          className="border-2 rounded-xl px-2 py-2 font-poppins-black text-2xl w-20 text-center"
                          style={{ 
                            backgroundColor: 'rgba(6, 182, 212, 0.1)', 
                            borderColor: currentValStr ? '#06B6D4' : 'rgba(255, 255, 255, 0.1)',
                            color: '#06B6D4'
                          }}
                          keyboardType="numeric"
                          inputMode="numeric"
                          placeholder="0"
                          placeholderTextColor="rgba(255, 255, 255, 0.3)"
                          value={currentValStr}
                          onChangeText={(text) => activeReg && handleScoreChange(activeReg.id, c.key, text, c.max)}
                        />

                        <TouchableOpacity
                          onPress={() => {
                            if (!activeReg) return;
                            const currentVal = marks[activeReg.id]?.[c.key] ?? 0;
                            if (currentVal < c.max) handleScoreChange(activeReg.id, c.key, String(currentVal + 1), c.max);
                          }}
                          style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                          className="items-center justify-center border border-white/10"
                        >
                          <Text className="font-poppins-black text-2xl text-white/70">+</Text>
                        </TouchableOpacity>
                      </View>

                      <Text className="font-poppins-bold text-[11px] text-white/30 ml-2">
                        Max: {c.max}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View className="h-28" />
        </ScrollView>

        {/* Mobile Sticky Bottom Bar */}
        {registrations.length > 0 && (
          <View 
            style={{ 
              position: 'absolute', 
              bottom: 0, 
              left: 0, 
              right: 0,
              paddingBottom: Platform.OS === 'ios' ? 24 : 12,
              backgroundColor: 'rgba(11, 31, 51, 0.95)',
            }} 
            className="border-t border-white/10 px-4 py-3 flex-row gap-x-2 shadow-lg"
          >
            <TouchableOpacity
              disabled={activeRegIndex === 0}
              onPress={() => setActiveRegIndex(prev => prev - 1)}
              style={{ height: 48 }}
              className={`flex-1 rounded-xl items-center justify-center border ${
                activeRegIndex === 0 ? 'border-white/5 bg-white/5 opacity-40' : 'border-white/20 bg-white/10'
              }`}
            >
              <Text className="font-poppins-bold text-white text-sm">◀ Prev</Text>
            </TouchableOpacity>

            {activeRegIndex === registrations.length - 1 && allMarked ? (
              <TouchableOpacity
                onPress={handleSubmitAll}
                disabled={submitting}
                style={{ height: 48, flex: 2 }}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  className="w-full h-full rounded-xl items-center justify-center shadow-lg"
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text className="font-poppins-black text-white text-sm">✅ Submit All Marks</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                disabled={activeRegIndex === registrations.length - 1}
                onPress={() => setActiveRegIndex(prev => prev + 1)}
                style={{ height: 48 }}
                className={`flex-1 rounded-xl items-center justify-center ${
                  activeRegIndex === registrations.length - 1 ? 'bg-white/5 opacity-40' : 'bg-[#06B6D4]'
                }`}
              >
                <Text className={`font-poppins-black text-sm ${
                  activeRegIndex === registrations.length - 1 ? 'text-white/30' : 'text-white'
                }`}>Next ▶</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      {GuidelinesModal()}
    </View>
  );
};

  if (isMobile) {
    return renderMobileLayout();
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#030E21' }}>
      {/* Header */}
      <LinearGradient colors={['#030E21', '#0B1F33', '#120E2D']} style={{ paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
        <View className="flex-row justify-between items-start mb-1">
          <View className="flex-1">
            <Text className="text-white/60 font-poppins text-xs mb-0.5">Judge</Text>
            <Text className="text-white font-poppins-black text-xl">{judgeName}</Text>
          </View>
          <View className="flex-row items-center gap-x-2">
            {eventGuidelines && (
              <TouchableOpacity
                onPress={() => setShowGuidelines(true)}
                className="p-2 bg-white/5 border border-white/10 rounded-full flex-row items-center gap-x-1"
              >
                <Info size={16} color="#06B6D4" />
                <Text className="text-cyan-400 font-poppins-bold text-xs ml-1">Guidelines</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.replace('/judge' as any)}
              className="p-2 bg-white/5 border border-white/10 rounded-full"
            >
              <LogOut size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="rounded-2xl p-3 mt-3 border border-white/10" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <Text className="text-white font-poppins-bold text-base">{eventName}</Text>
          {venueName ? <Text className="text-white/60 font-poppins text-xs mt-0.5">📍 {venueName}</Text> : null}
        </View>

        {/* Progress */}
        <Text className="text-white/50 font-poppins text-xs mt-2 text-right">
          {Object.keys(marks).length}/{registrations.length} participants marked
        </Text>
      </LinearGradient>

      {/* Note about code letters */}
      <View className="mx-4 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 flex-row gap-x-2 items-center">
        <AlertCircle size={16} color="#FBBF24" />
        <Text className="font-poppins text-amber-200 text-xs flex-1">
          You are evaluating by Code Letter only. Participant identities are confidential.
        </Text>
      </View>

      {/* Marks entry list */}
      <ScrollView className="flex-1 px-4 pt-4">
        {registrations.length === 0 ? (
          <View className="items-center py-10 rounded-2xl border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <Text className="font-poppins text-white/50 text-center">
              No participants found for this event.
            </Text>
          </View>
        ) : (
          registrations.map(reg => {
            const total = getTotal(reg.id);
            const grade = calculateGrade(total, 100);
            const allDone = Object.keys(marks[reg.id] ?? {}).length === eventCriteria.length;

            return (
              <View key={reg.id} className="mb-4 rounded-3xl p-5 border border-white/10" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                {/* Code Letter header */}
                <View className="flex-row justify-between items-center mb-4 pb-3 border-b border-white/10">
                  <View className="flex-row items-center gap-x-3">
                    <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: '#06B6D4' }}>
                      <Text className="font-poppins-black text-white text-xl">{reg.code_letter}</Text>
                    </View>
                    <View>
                      <Text className="font-poppins-bold text-white text-base">Code: {reg.code_letter}</Text>
                      {allDone && (
                        <View className="flex-row items-center gap-x-1 mt-0.5">
                          <CheckCircle2 size={12} color="#10B981" />
                          <Text className="font-poppins text-xs text-green-400">Marked</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {/* Grade badge */}
                  <View className={`px-3 py-1.5 rounded-full border ${
                    grade === 'A+' ? 'bg-green-500/10 border-green-500/30' :
                    grade === 'A' ? 'bg-blue-500/10 border-blue-500/30' :
                    grade === 'B' ? 'bg-yellow-500/10 border-yellow-500/30' :
                    grade === 'C' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10'
                  }`}>
                    <Text className={`font-poppins-black text-base ${
                      grade === 'A+' ? 'text-green-400' :
                      grade === 'A' ? 'text-blue-400' :
                      grade === 'B' ? 'text-yellow-400' :
                      grade === 'C' ? 'text-orange-400' : 'text-white/30'
                    }`}>{total > 0 ? grade : '—'}</Text>
                  </View>
                </View>

                {/* Criteria */}
                {eventCriteria.map(c => (
                  <View key={c.key} className="mb-3">
                    <View className="flex-row justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                      <Text className="font-poppins text-white/90 text-sm flex-1">{c.label}</Text>
                      <View className="flex-row items-center">
                        <TextInput
                          className="border rounded-lg px-3 py-1.5 font-poppins-black text-cyan-400 text-base min-w-[60px] text-center"
                          style={{ 
                            backgroundColor: 'rgba(6, 182, 212, 0.1)', 
                            borderColor: marks[reg.id]?.[c.key] !== undefined ? '#06B6D4' : 'rgba(255, 255, 255, 0.1)'
                          }}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="rgba(255, 255, 255, 0.3)"
                          value={marks[reg.id]?.[c.key] !== undefined ? String(marks[reg.id]?.[c.key]) : ''}
                          onChangeText={(text) => handleScoreChange(reg.id, c.key, text, c.max)}
                        />
                        <Text className="font-poppins-bold text-white/30 text-sm ml-3 w-10">
                          / {c.max}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                {/* Total */}
                <View className="rounded-xl px-4 py-3 flex-row justify-between items-center mt-2 border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <Text className="font-poppins-bold text-white">Total</Text>
                  <Text className="font-poppins-black text-cyan-400 text-xl">{total} / 100</Text>
                </View>
              </View>
            );
          })
        )}
        <View className="h-32" />
      </ScrollView>

      {/* Submit all button */}
      <View className="absolute bottom-6 left-4 right-4">
        <TouchableOpacity
          onPress={handleSubmitAll}
          disabled={submitting}
        >
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            className="rounded-2xl py-4 items-center shadow-xl border-t border-white/20"
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text className="font-poppins-black text-white text-base">
                ✅ Submit All Marks & Close Session
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      {GuidelinesModal()}
    </View>
  );
}
