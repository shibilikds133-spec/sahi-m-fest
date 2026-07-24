import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, RefreshCw, Lock, Edit2, AlertTriangle } from 'lucide-react-native';
import { Modal, TextInput } from 'react-native';

export default function CodeLetterGeneration() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/(admin)/schedule');

  const { schedules, isLoadingSchedules } = useSchedule();
  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const { useItemRegistrations, generateCodeLetters, isGeneratingCodeLetters, updateCodeLetter, isUpdatingCodeLetter, useParticipantConflicts } = useParticipants();
  const { data: registrations, isLoading: isLoadingRegs } = useItemRegistrations(schedule?.item_id);

  const activeRegistrations = React.useMemo(() => {
    return registrations?.filter((r: any) => r.status !== 'rejected') || [];
  }, [registrations]);

  const participantIds = React.useMemo(() => activeRegistrations.map((r:any) => r.participant_id), [activeRegistrations]);
  const { data: conflictsMap } = useParticipantConflicts(participantIds, scheduleId);

  const [editingReg, setEditingReg] = React.useState<any>(null);
  const [newLetter, setNewLetter] = React.useState<string>('');
  const [editError, setEditError] = React.useState<string>('');

  if (isLoadingSchedules || isLoadingRegs) {
    return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;
  }

  if (!schedule) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center p-6">
        <Text className="font-poppins text-ssf-text">Schedule not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
    );
  }

  const isShuffleLocked = schedule?.is_shuffle_locked;

  const handleGenerate = async () => {
    const hasExistingLetters = activeRegistrations.some((r: any) => r.code_letter);
    const allHaveLetters = activeRegistrations.every((r: any) => r.code_letter);

    const action = async () => {
      try {
        const result = await generateCodeLetters({ scheduleId, itemId: schedule.item_id });
        const isSmart = result && (result as any).smartPriorityApplied;
        const msg = isSmart 
          ? '✅ Code letters assigned successfully!\n(Smart conflict-safe priority applied)' 
          : '✅ Code letters assigned successfully!';

        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Success', msg);
        }
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert('❌ Error: ' + (error.message || 'Failed to generate code letters'));
        } else {
          Alert.alert('Error', error.message || 'Failed to generate code letters');
        }
      }
    };

    if (allHaveLetters) {
      const msg = '⚠️ Code letters have already been assigned for ALL participants. Drawing again will shuffle and OVERWRITE existing code letters. Are you sure you want to proceed?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) {
          await action();
        }
      } else {
        Alert.alert(
          'Confirm Re-shuffle',
          msg,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Draw Letters (Overwrite)', style: 'destructive', onPress: action }
          ]
        );
      }
    } else if (hasExistingLetters) {
      // Partial assignment case
      const msg = 'Some participants already have code letters. Do you want to assign new code letters to the remaining unassigned participants?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) {
          await action();
        }
      } else {
        Alert.alert(
          'Assign New Participants',
          msg,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Assign Remaining', style: 'default', onPress: action }
          ]
        );
      }
    } else {
      await action();
    }
  };

  const validateAndSaveEdit = async () => {
    setEditError('');
    const letter = newLetter.trim().toUpperCase();
    if (!letter.match(/^[A-Z]$/)) {
      setEditError('Please enter a single valid letter (A-Z).');
      return;
    }

    // Check for duplicate in current event
    const isDuplicate = activeRegistrations.some((r:any) => r.id !== editingReg.id && r.code_letter === letter);
    if (isDuplicate) {
      setEditError('This letter is already assigned in this event.');
      return;
    }

    // Check for conflict
    const pConflicts = conflictsMap?.[editingReg.participant_id] || new Set();
    if (pConflicts.has(letter)) {
      setEditError('⚠️ This code letter conflicts with another simultaneous event assignment.');
      return;
    }

    try {
      await updateCodeLetter({ registrationId: editingReg.id, codeLetter: letter, itemId: schedule.item_id });
      setEditingReg(null);
      setNewLetter('');
    } catch (err: any) {
      setEditError(err.message || 'Failed to update code letter.');
    }
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-poppins-black text-ssf-text">Code Letters</Text>
          <Text className="font-poppins text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
        </View>
      </View>

      {isShuffleLocked && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <Lock size={20} color="#B45309" />
          <Text className="font-poppins-bold text-amber-700">🔒 Code Letter Shuffle Locked by Stage Portal</Text>
        </View>
      )}

      <SsfCard className="mb-6">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="font-poppins-bold text-lg text-ssf-text">
            Participants ({activeRegistrations.length})
          </Text>
          {!isShuffleLocked && (
            <SsfButton
              label={isGeneratingCodeLetters ? 'Drawing...' : 'Draw Letters'}
              onPress={handleGenerate}
              disabled={isGeneratingCodeLetters || activeRegistrations.length === 0}
              icon={<RefreshCw size={14} color="#FFF" />}
            />
          )}
        </View>

        {activeRegistrations.length === 0 ? (
          <Text className="font-poppins text-ssf-text-muted">No active participants registered for this item yet.</Text>
        ) : (
          <View className="border border-ssf-border rounded-xl overflow-hidden">
            <View className="flex-row bg-ssf-surface p-3 border-b border-ssf-border">
              <Text className="flex-[3] font-poppins-bold text-xs text-ssf-text-muted uppercase">Participant</Text>
              <Text className="flex-1 font-poppins-bold text-xs text-ssf-text-muted uppercase text-center">Chest No</Text>
              <Text className="flex-1 font-poppins-bold text-xs text-ssf-text-muted uppercase text-center">Code Letter</Text>
              {!isShuffleLocked && (
                <Text className="w-10 text-center"></Text>
              )}
            </View>
            {activeRegistrations.map((reg: any, idx: number) => (
              <View
                key={reg.id}
                className={`flex-row p-3 items-center ${idx !== activeRegistrations.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <Text className="flex-[3] font-poppins text-sm text-ssf-text">{reg.participants?.name}</Text>
                <Text className="flex-1 font-poppins-bold text-sm text-center text-ssf-text">{reg.participants?.chest_number}</Text>
                <Text className="flex-1 font-poppins-black text-lg text-center text-ssf-primary">
                  {reg.code_letter || '-'}
                </Text>
                {!isShuffleLocked && (
                  <TouchableOpacity 
                    className="w-10 items-center justify-center p-2 rounded-full bg-blue-50"
                    onPress={() => {
                      setEditingReg(reg);
                      setNewLetter(reg.code_letter || '');
                    }}
                  >
                    <Edit2 size={16} color="#2563EB" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </SsfCard>

      {/* Manual Edit Modal */}
      <Modal visible={!!editingReg} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <Text className="font-poppins-bold text-xl mb-2">Edit Code Letter</Text>
            <Text className="font-poppins text-ssf-text-muted mb-4">{editingReg?.participants?.name}</Text>
            
            <TextInput
              value={newLetter}
              onChangeText={setNewLetter}
              placeholder="Enter letter (A-Z)"
              className="border border-ssf-border rounded-xl p-4 font-poppins-black text-2xl text-center uppercase mb-2"
              maxLength={1}
              autoCapitalize="characters"
            />
            
            {!!editError && (
              <View className="bg-red-50 p-3 rounded-lg flex-row items-start gap-x-2 mb-4">
                <AlertTriangle size={16} color="#DC2626" style={{ marginTop: 2 }} />
                <Text className="font-poppins text-sm text-red-700 flex-1">{editError}</Text>
              </View>
            )}

            <View className="flex-row gap-x-3 mt-2">
              <SsfButton 
                label="Cancel" 
                variant="outline" 
                className="flex-1" 
                onPress={() => { setEditingReg(null); setEditError(''); }} 
              />
              <SsfButton 
                label={isUpdatingCodeLetter ? 'Saving...' : 'Save'} 
                className="flex-1" 
                onPress={validateAndSaveEdit} 
                disabled={isUpdatingCodeLetter}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
