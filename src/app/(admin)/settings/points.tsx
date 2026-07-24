import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Switch, ActivityIndicator } from 'react-native';
import { SsfInput } from '../../../components/ui/SsfInput';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useFestival } from '../../../core/hooks/useFestival';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function PointsSettings() {
  const router = useRouter();
  const { useActiveFestival, usePointsConfig, useUpdatePoints } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: config, isLoading } = usePointsConfig(festival?.id);
  const updatePoints = useUpdatePoints();

  const [formData, setFormData] = useState({
    rank_1_points: '5',
    rank_2_points: '3',
    rank_3_points: '1',
    ind_a_plus_points: '6',
    ind_a_points: '5',
    ind_b_points: '3',
    ind_c_points: '1',
    grp_a_plus_points: '18',
    grp_a_points: '15',
    grp_b_points: '10',
    grp_c_points: '5',
    less_than_3_teams_rule: true,
  });

  useEffect(() => {
    if (config) {
      setFormData({
        rank_1_points: (config.rank_1_points ?? 5).toString(),
        rank_2_points: (config.rank_2_points ?? 3).toString(),
        rank_3_points: (config.rank_3_points ?? 1).toString(),
        ind_a_plus_points: (config.ind_a_plus_points ?? 6).toString(),
        ind_a_points: (config.ind_a_points ?? 5).toString(),
        ind_b_points: (config.ind_b_points ?? 3).toString(),
        ind_c_points: (config.ind_c_points ?? 1).toString(),
        grp_a_plus_points: (config.grp_a_plus_points ?? 18).toString(),
        grp_a_points: (config.grp_a_points ?? 15).toString(),
        grp_b_points: (config.grp_b_points ?? 10).toString(),
        grp_c_points: (config.grp_c_points ?? 5).toString(),
        less_than_3_teams_rule: config.less_than_3_teams_rule ?? true,
      });
    }
  }, [config]);

  const handleSave = async () => {
    try {
      await updatePoints.mutateAsync({
        id: config?.id,
        festival_id: festival?.id,
        rank_1_points: parseInt(formData.rank_1_points),
        rank_2_points: parseInt(formData.rank_2_points),
        rank_3_points: parseInt(formData.rank_3_points),
        ind_a_plus_points: parseInt(formData.ind_a_plus_points),
        ind_a_points: parseInt(formData.ind_a_points),
        ind_b_points: parseInt(formData.ind_b_points),
        ind_c_points: parseInt(formData.ind_c_points),
        grp_a_plus_points: parseInt(formData.grp_a_plus_points),
        grp_a_points: parseInt(formData.grp_a_points),
        grp_b_points: parseInt(formData.grp_b_points),
        grp_c_points: parseInt(formData.grp_c_points),
        less_than_3_teams_rule: formData.less_than_3_teams_rule,
      });
      Alert.alert('Success', 'Points configuration saved successfully!');
      router.replace('/(admin)/settings' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update points');
    }
  };

  if (isLoading) return <View className="flex-1 bg-ssf-bg items-center justify-center"><ActivityIndicator color="#065F46" /></View>;

  return (
    <View className="flex-1 bg-ssf-bg">
      <LinearGradient 
        colors={['#065F46', '#044230']}
        className="pt-16 pb-12 px-6 rounded-b-[40px] shadow-sm mb-6"
      >
        <Text className="text-3xl font-poppins-black text-white">Points System</Text>
        <Text className="text-ssf-surface opacity-80 font-poppins mt-1">Configure scoring rules for Sahithyolsav</Text>
      </LinearGradient>

      <ScrollView className="px-5">
        <Animated.View entering={FadeInUp.duration(800).springify()}>
          <SsfCard className="mb-6">
            <Text className="font-poppins-black text-lg text-ssf-text mb-4">Rank Points (സ്ഥാനങ്ങൾ)</Text>
            <View className="flex-row justify-between gap-4 mb-6">
              <SsfInput label="1st" className="flex-1" value={formData.rank_1_points} onChangeText={(t) => setFormData({...formData, rank_1_points: t})} />
              <SsfInput label="2nd" className="flex-1" value={formData.rank_2_points} onChangeText={(t) => setFormData({...formData, rank_2_points: t})} />
              <SsfInput label="3rd" className="flex-1" value={formData.rank_3_points} onChangeText={(t) => setFormData({...formData, rank_3_points: t})} />
            </View>

            <View className="h-[1px] bg-slate-100 my-4" />

            <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6">
              <Text className="font-poppins-black text-emerald-900 text-lg mb-1">Official Grade Point Brackets</Text>
              <Text className="text-xs text-emerald-800 font-poppins mb-4">
                Grade points are now automatically resolved using the official SSF participant bracket system.
              </Text>
              
              <View className="bg-white rounded-lg overflow-hidden border border-emerald-100">
                <View className="flex-row bg-emerald-100 p-2 border-b border-emerald-200">
                  <Text className="flex-1 font-poppins-bold text-xs text-emerald-900 text-center">Participants</Text>
                  <Text className="flex-1 font-poppins-bold text-xs text-emerald-900 text-center">A+</Text>
                  <Text className="flex-1 font-poppins-bold text-xs text-emerald-900 text-center">A</Text>
                  <Text className="flex-1 font-poppins-bold text-xs text-emerald-900 text-center">B</Text>
                  <Text className="flex-1 font-poppins-bold text-xs text-emerald-900 text-center">C</Text>
                </View>
                {[
                  { p: '1', ap: 6, a: 5, b: 3, c: 1 },
                  { p: '2', ap: 7, a: 6, b: 4, c: 2 },
                  { p: '3', ap: 10, a: 9, b: 6, c: 3 },
                  { p: '4-5', ap: 18, a: 15, b: 10, c: 5 },
                  { p: '6-10', ap: 25, a: 20, b: 12, c: 6 },
                ].map((row, i) => (
                  <View key={i} className={`flex-row p-2 ${i !== 4 ? 'border-b border-slate-100' : ''}`}>
                    <Text className="flex-1 font-poppins-bold text-xs text-slate-700 text-center">{row.p}</Text>
                    <Text className="flex-1 font-poppins text-xs text-slate-600 text-center">{row.ap}</Text>
                    <Text className="flex-1 font-poppins text-xs text-slate-600 text-center">{row.a}</Text>
                    <Text className="flex-1 font-poppins text-xs text-slate-600 text-center">{row.b}</Text>
                    <Text className="flex-1 font-poppins text-xs text-slate-600 text-center">{row.c}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row justify-between items-center py-4 border-t border-slate-100 mt-2 mb-6">
              <View className="flex-1 pr-4">
                <Text className="font-poppins-black text-base text-ssf-text">Handbook Rule 12</Text>
                <Text className="text-xs text-ssf-text-muted mt-1">If less than 3 teams, only grade points are awarded. No rank points.</Text>
              </View>
              <Switch 
                value={formData.less_than_3_teams_rule} 
                onValueChange={(v) => setFormData({...formData, less_than_3_teams_rule: v})}
                trackColor={{ false: '#767577', true: '#065F46' }}
              />
            </View>

            <SsfButton 
              label="Update Points System"
              onPress={handleSave}
              isLoading={updatePoints.isPending}
              className="w-full shadow-lg shadow-ssf-primary/30"
            />
          </SsfCard>

          <SsfButton 
            label="Cancel"
            variant="ghost"
            onPress={() => router.back()}
            className="w-full mb-10"
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
