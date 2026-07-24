import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { SsfInput } from '../../../components/ui/SsfInput';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useFestival } from '../../../core/hooks/useFestival';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Calendar } from 'lucide-react-native';

export default function FestivalCalendarSettings() {
  const router = useRouter();
  const { useActiveFestival, useUpdateFestival } = useFestival();
  const { data: festival, isLoading } = useActiveFestival();
  const updateFestival = useUpdateFestival();

  const [formData, setFormData] = useState({
    custom_name: '',
    start_date: '',
    end_date: '',
    registration_open: '',
    registration_close: '',
  });

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (festival) {
      setFormData({
        custom_name: festival.custom_name || '',
        start_date: festival.start_date ? festival.start_date.split('T')[0] : '',
        end_date: festival.end_date ? festival.end_date.split('T')[0] : '',
        registration_open: festival.registration_open ? festival.registration_open.split('T')[0] : '',
        registration_close: festival.registration_close ? festival.registration_close.split('T')[0] : '',
      });
    }
  }, [festival]);

  const handleSave = async () => {
    setError('');
    setSaved(false);

    if (!formData.start_date || !formData.end_date) {
      setError('Start Date and End Date are required.');
      return;
    }
    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError('End Date cannot be before Start Date.');
      return;
    }

    try {
      await updateFestival.mutateAsync({ id: festival?.id, ...formData });
      setSaved(true);
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to update calendar');
    }
  };

  // Date input component — uses native HTML date picker on web
  const DateField = ({
    label, value, onChange, hint
  }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) => (
    <View className="mb-5">
      <View className="flex-row items-center gap-x-2 mb-1">
        <Calendar size={14} color="#1B6B3A" />
        <Text className="font-poppins-bold text-ssf-text text-sm">{label}</Text>
      </View>
      {Platform.OS === 'web' ? (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1.5px solid #D1D5DB',
            fontFamily: 'inherit',
            fontSize: '15px',
            color: value ? '#111827' : '#9CA3AF',
            outline: 'none',
            backgroundColor: '#F9FAFB',
            cursor: 'pointer',
          }}
        />
      ) : (
        <SsfInput
          label=""
          placeholder="YYYY-MM-DD"
          value={value}
          onChangeText={onChange}
        />
      )}
      {hint && <Text className="font-poppins text-xs text-ssf-text-muted mt-1">{hint}</Text>}
    </View>
  );

  if (isLoading) return (
    <View className="flex-1 bg-ssf-bg items-center justify-center">
      <Text className="font-poppins text-ssf-text">Loading...</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-ssf-bg">
      <LinearGradient
        colors={['#065F46', '#044230']}
        className="pt-16 pb-12 px-6 rounded-b-[40px] shadow-sm mb-6"
      >
        <Text className="text-3xl font-poppins-black text-white">Festival Calendar</Text>
        <Text className="text-ssf-surface opacity-80 font-poppins mt-1">Set the timeline for Sahithyolsav</Text>
      </LinearGradient>

      <ScrollView className="px-5">
        <Animated.View entering={FadeInUp.duration(800).springify()}>

          {/* Success Banner */}
          {saved && (
            <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
              <CheckCircle2 size={20} color="#16A34A" />
              <View>
                <Text className="font-poppins-bold text-green-800">Calendar Updated!</Text>
                <Text className="font-poppins text-green-700 text-xs">Festival dates saved successfully.</Text>
              </View>
            </View>
          )}

          {/* Error Banner */}
          {error !== '' && (
            <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <Text className="font-poppins-bold text-red-700">⚠️ {error}</Text>
            </View>
          )}

          <SsfCard className="mb-6">
            <SsfInput
              label="Festival Name (Optional)"
              placeholder="e.g., Sahithyolsav 2025"
              value={formData.custom_name}
              onChangeText={(text) => setFormData({ ...formData, custom_name: text })}
              className="mb-5"
            />

            <DateField
              label="Festival Start Date *"
              value={formData.start_date}
              onChange={(v) => setFormData({ ...formData, start_date: v })}
            />

            <DateField
              label="Festival End Date *"
              value={formData.end_date}
              onChange={(v) => setFormData({ ...formData, end_date: v })}
            />

            <DateField
              label="Registration Opens"
              value={formData.registration_open}
              onChange={(v) => setFormData({ ...formData, registration_open: v })}
              hint="Leave blank if registration is already open"
            />

            <DateField
              label="Registration Deadline"
              value={formData.registration_close}
              onChange={(v) => setFormData({ ...formData, registration_close: v })}
              hint="Last date to register participants"
            />

            <SsfButton
              label={updateFestival.isPending ? 'Saving...' : 'Save Calendar'}
              onPress={handleSave}
              isLoading={updateFestival.isPending}
              className="w-full shadow-lg mt-2"
            />
          </SsfCard>

          <SsfButton
            label="← Back"
            variant="ghost"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/settings' as any)}
            className="w-full mb-10"
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
