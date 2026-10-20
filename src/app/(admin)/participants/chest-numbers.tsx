import { ui } from '@/constants/designSystem';
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react-native';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { Button } from '../../../components/ui/shadcn/button';

export default function ChestNumberGeneration() {
  const goBack = useGoBack('/(admin)/participants');
  const { participants, isLoadingList, regenerateChestNumbers, isRegeneratingChestNumbers } = useParticipants();
  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();
  const [notice, setNotice] = useState('');
  const isTeamTemplate = festival?.chest_number_template === 'team';

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { category: string; total: number; numeric: number }>();
    participants.filter((participant: any) => participant.festival_id === festival?.id).forEach((participant: any) => {
      const category = isTeamTemplate
        ? String(participant.organisations?.name || participant.organisation_id || 'No team').trim()
        : String(participant.category_code || 'Uncategorised').trim();
      const key = isTeamTemplate ? String(participant.organisation_id || 'no-team') : category;
      const current = stats.get(key) ?? { category, total: 0, numeric: 0 };
      current.total += 1;
      if (/^\d+$/.test(String(participant.chest_number || ''))) current.numeric += 1;
      stats.set(key, current);
    });
    return Array.from(stats.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [participants, isTeamTemplate, festival?.id]);

  const range = festival?.chest_number_category_range ?? 100;

  const confirmRegenerate = () => {
    if (!festival?.id || isRegeneratingChestNumbers) return;
    const run = async () => {
      setNotice('');
      try {
        const result = await regenerateChestNumbers(festival.id);
        setNotice(`Regenerated ${result.participant_count} chest numbers.`);
      } catch (error: any) {
        setNotice(error?.message || 'Chest-number regeneration failed. No numbers were changed.');
      }
    };
    const message = `Replace every existing chest number using the ${isTeamTemplate ? 'team' : 'category'} template? This cannot be undone automatically.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void run();
    } else {
      Alert.alert('Regenerate all chest numbers', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: () => { void run(); } },
      ]);
    }
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-white rounded-full border border-ssf-border">
          <ArrowLeft size={20} color={ui.colors.text} />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Chest Numbers</Text>
      </View>

      <View className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 flex-row gap-x-3">
        <AlertTriangle size={22} color={ui.colors.info} />
        <View className="flex-1">
          <Text className="font-poppins-bold text-blue-800">Numeric {isTeamTemplate ? 'team' : 'category'} ranges</Text>
          <Text className="font-poppins text-xs text-blue-700 mt-1">
            {isTeamTemplate ? 'Team' : 'Category'} 1 starts at {range}, {isTeamTemplate ? 'team' : 'category'} 2 starts at {range * 2}, and so on. Each {isTeamTemplate ? 'team' : 'category'} can contain up to {range} participants.
          </Text>
        </View>
      </View>

      <View className="mb-4 items-start">
        <Button onPress={confirmRegenerate} disabled={!festival?.id || isRegeneratingChestNumbers}>
          {isRegeneratingChestNumbers ? 'Regenerating...' : 'Regenerate All'}
        </Button>
        <Text className="mt-2 font-poppins text-xs text-ssf-text-muted">This manually reassigns all numbers. Saving a different template or range in Calendar also renumbers existing participants automatically.</Text>
        {!!notice && <Text className="mt-2 font-poppins text-sm text-ssf-text">{notice}</Text>}
      </View>

      {isLoadingList ? (
        <SsfTableSkeleton rows={6} columns={3} compact />
      ) : categoryStats.length === 0 ? (
        <SsfCard><Text className="font-poppins text-ssf-text-muted">No participants found for this festival.</Text></SsfCard>
      ) : categoryStats.map((stat) => (
        <SsfCard key={stat.category} className="mb-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-poppins-bold text-ssf-text">{isTeamTemplate ? 'Team' : 'Category'} {stat.category}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">{stat.total} participants · {stat.numeric}/{stat.total} numeric chest numbers</Text>
            </View>
            {stat.numeric === stat.total ? <CheckCircle size={20} color="#15803D" /> : <AlertTriangle size={20} color={ui.colors.warning} />}
          </View>
        </SsfCard>
      ))}
    </ScrollView>
  );
}
