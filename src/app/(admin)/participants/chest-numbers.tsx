import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { ArrowLeft, KeyRound, AlertTriangle, CheckCircle } from 'lucide-react-native';

const CATEGORIES = ['LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS'];

export default function ChestNumberGeneration() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/participants');
  const { participants, isLoadingList, updateParticipant } = useParticipants();
  
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  // Calculate stats per category
  const stats = useMemo(() => {
    const result: Record<string, { total: number; approvedWithoutNo: number; withNo: number; participantsToUpdate: any[] }> = {};
    CATEGORIES.forEach(cat => {
      result[cat] = { total: 0, approvedWithoutNo: 0, withNo: 0, participantsToUpdate: [] };
    });

    participants.forEach((p: any) => {
      const cat = p.category_code;
      if (result[cat]) {
        result[cat].total++;
        if (p.chest_number) {
          result[cat].withNo++;
        } else if (p.status === 'approved') {
          result[cat].approvedWithoutNo++;
          result[cat].participantsToUpdate.push(p);
        }
      }
    });

    return result;
  }, [participants]);

  const handleGenerate = async (categoryCode: string) => {
    const data = stats[categoryCode];
    if (data.approvedWithoutNo === 0) return;

    const msg = `Generate chest numbers for ${data.approvedWithoutNo} approved participants in ${categoryCode}?`;
    
    const doGenerate = async () => {
      setIsGenerating(categoryCode);
      try {
        // Find the maximum existing chest number number for this category
        let maxNo = 0;
        participants.forEach((p: any) => {
          if (p.category_code === categoryCode && p.chest_number && p.chest_number.startsWith(`${categoryCode}-`)) {
            const numPart = parseInt(p.chest_number.split('-')[1] || '0', 10);
            if (!isNaN(numPart) && numPart > maxNo) {
              maxNo = numPart;
            }
          }
        });

        // Assign sequentially
        let currentNo = maxNo + 1;
        
        // We do sequential updates to ensure stable numbering. 
        // In a real robust system, this should be an RPC call to avoid race conditions.
        // For now, doing it sequentially via the repository.
        const promises = data.participantsToUpdate.map((p, index) => {
          const newChestNo = `${categoryCode}-${(currentNo + index).toString().padStart(3, '0')}`;
          return updateParticipant({ id: p.id, updates: { chest_number: newChestNo } });
        });

        await Promise.all(promises);

        if (Platform.OS === 'web') window.alert('Successfully generated chest numbers!');
        else Alert.alert('Success', 'Successfully generated chest numbers!');
      } catch (error: any) {
        if (Platform.OS === 'web') window.alert(error.message);
        else Alert.alert('Error', error.message);
      } finally {
        setIsGenerating(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doGenerate();
    } else {
      Alert.alert('Generate Chest Numbers', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: doGenerate },
      ]);
    }
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-white rounded-full border border-ssf-border">
          <ArrowLeft size={20} color="#333" />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Chest Numbers</Text>
      </View>

      <View className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex-row gap-x-3">
        <AlertTriangle size={24} color="#1D4ED8" />
        <View className="flex-1">
          <Text className="font-poppins-bold text-blue-800">Auto-Generation Rules</Text>
          <Text className="font-poppins text-xs text-blue-700 mt-1">
            Chest numbers (e.g. LP-001) can only be generated for participants whose status is "Approved". Pending or Rejected participants will be skipped.
          </Text>
        </View>
      </View>

      {isLoadingList ? (
        <ActivityIndicator color="#1B6B3A" size="large" className="my-10" />
      ) : (
        CATEGORIES.map(cat => {
          const data = stats[cat];
          const isProcessing = isGenerating === cat;
          
          return (
            <SsfCard key={cat} className="mb-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-x-3">
                  <View className="w-12 h-12 bg-gray-100 rounded-full items-center justify-center border border-gray-200">
                    <Text className="font-poppins-black text-lg text-ssf-primary">{cat}</Text>
                  </View>
                  <View>
                    <Text className="font-poppins-bold text-ssf-text">Category {cat}</Text>
                    <Text className="font-poppins text-xs text-ssf-text-muted">Total: {data.total} • Assigned: {data.withNo}</Text>
                  </View>
                </View>

                {data.approvedWithoutNo > 0 ? (
                  <View className="items-end">
                    <Text className="font-poppins-bold text-orange-600 text-xs mb-2">
                      {data.approvedWithoutNo} needs number
                    </Text>
                    <SsfButton 
                      label={isProcessing ? "Processing..." : "Generate"} 
                      size="sm" 
                      icon={!isProcessing ? <KeyRound size={14} color="white" /> : undefined}
                      onPress={() => handleGenerate(cat)}
                      disabled={isProcessing}
                    />
                  </View>
                ) : (
                  <View className="items-center justify-center flex-row gap-x-2 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                    <CheckCircle size={16} color="#15803D" />
                    <Text className="font-poppins-bold text-xs text-green-700">All Set</Text>
                  </View>
                )}
              </View>
            </SsfCard>
          );
        })
      )}
    </ScrollView>
  );
}
