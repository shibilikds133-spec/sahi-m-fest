import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfSelectMenu, SsfSelectOption } from '@/components/ui/SsfSelectMenu';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';

const TimeSelect = ({ value, onChange, fullWidth = false }: { value: string, onChange: (val: string) => void, fullWidth?: boolean }) => {
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':');
      const hNum = parseInt(h, 10);
      setAmpm(hNum >= 12 ? 'PM' : 'AM');
      setHour((hNum % 12 || 12).toString().padStart(2, '0'));
      setMinute(m);
    }
  }, [value]);

  const handleChange = (newHour: string, newMinute: string, newAmpm: string) => {
    let h = parseInt(newHour, 10);
    if (newAmpm === 'PM' && h < 12) h += 12;
    if (newAmpm === 'AM' && h === 12) h = 0;
    const timeStr = `${h.toString().padStart(2, '0')}:${newMinute}`;
    onChange(timeStr);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: fullWidth ? undefined : 1.5, width: fullWidth ? '100%' : undefined, gap: 4 }}>
      <SsfSelectMenu 
        value={hour} 
        onValueChange={(val) => {
          setHour(val);
          handleChange(val, minute, ampm);
        }}
        options={Array.from({length: 12}, (_, i) => {
          const v = (i + 1).toString().padStart(2, '0');
          return { label: v, value: v };
        })}
        style={{ flex: 1 }}
      />
      <Text style={{ marginHorizontal: 2, fontWeight: 'bold', color: '#333' }}>:</Text>
      <SsfSelectMenu 
        value={minute} 
        onValueChange={(val) => {
          setMinute(val);
          handleChange(hour, val, ampm);
        }}
        options={Array.from({length: 60}, (_, i) => {
          const m = i.toString().padStart(2, '0');
          return { label: m, value: m };
        })}
        style={{ flex: 1 }}
      />
      <SsfSelectMenu 
        value={ampm} 
        onValueChange={(val) => {
          setAmpm(val);
          handleChange(hour, minute, val);
        }}
        options={[{label: 'AM', value: 'AM'}, {label: 'PM', value: 'PM'}]}
        style={{ flex: 1.2 }}
      />
    </View>
  );
};

export default function CreateSchedule() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  const { width } = useWindowDimensions();
  const isCompactLayout = width < 640;
  
  const { venues, schedules, createSchedule, isCreatingSchedule } = useSchedule();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: items, isLoading: isLoadingItems } = useItems(festival?.id);

  const [itemId, setItemId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [judgeCount, setJudgeCount] = useState(3);
  
  // Custom dropdown state
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  const checkForConflicts = () => {
    if (!venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) return null;
    
    const start = new Date(`${startDate}T${startTimeStr}`).getTime();
    const end = new Date(`${endDate}T${endTimeStr}`).getTime();

    const conflicts = schedules.filter((s: any) => {
      if (s.venue_id !== venueId) return false;
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      // Overlap condition: start1 < end2 AND start2 < end1
      return start < sEnd && sStart < end;
    });

    return conflicts.length > 0 ? conflicts : null;
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    if (!itemId || !venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) {
      return showAlert('Error', 'Please fill all fields');
    }

    const startDateTime = new Date(`${startDate}T${startTimeStr}`);
    const endDateTime = new Date(`${endDate}T${endTimeStr}`);

    if (startDateTime >= endDateTime) {
      return showAlert('Error', 'End time must be after start time');
    }

    const conflicts = checkForConflicts();
    if (conflicts) {
      const msg = `Venue is already booked for ${conflicts.map((c: any) => c.items?.item_name_en).join(', ')}`;
      if (Platform.OS === 'web') {
        if (!window.confirm(`Conflict Detected: ${msg}.\nDo you still want to proceed?`)) return;
      } else {
         // React Native Alert can't pause execution easily without wrapping in Promise,
         // so we block it strictly here for simplicity unless explicitly bypassed.
         return Alert.alert('Conflict Detected', msg);
      }
    }

    try {
      await createSchedule({
        item_id: itemId,
        venue_id: venueId,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        status: 'scheduled',
        expected_judge_count: judgeCount,
      });
      goBack();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  if (isLoadingItems) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;

  const conflicts = checkForConflicts();

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-3 px-3">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Create Schedule</Text>
      </View>

      <SsfCard className="gap-y-4">
        <View style={{ position: 'relative', zIndex: 100 }}>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Item *</Text>
          <SsfSelectMenu
            value={itemId}
            onValueChange={setItemId}
            placeholder="-- Choose an Item --"
            searchable={true}
            searchPlaceholder="Search by name, code or category..."
            options={items ? items.map((i: any) => ({
              label: `[${i.item_code}] ${i.item_name_en} (${Array.isArray(i.category_codes) ? i.category_codes.join(',') : i.category_codes})`,
              value: i.id
            })) : []}
          />
        </View>

        <View style={{ zIndex: 90 }}>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Venue *</Text>
          <SsfSelectMenu
            value={venueId}
            onValueChange={setVenueId}
            placeholder="-- Choose a Venue --"
            options={venues.map((v: any) => ({
              label: `${v.name} ${v.capacity ? `(Cap: ${v.capacity})` : ''}`,
              value: v.id
            }))}
          />
        </View>

        <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 16 }}>
          <View style={{ flex: isCompactLayout ? undefined : 1 }}>
            <Text className="font-poppins text-ssf-text-muted mb-2">Start Time *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ flex: isCompactLayout ? undefined : 1, width: isCompactLayout ? '100%' : undefined, boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                />
                <TimeSelect value={startTimeStr} onChange={setStartTimeStr} fullWidth={isCompactLayout} />
              </View>
            ) : (
              <Text className="text-red-500">Use Web for Date/Time picking</Text>
            )}
          </View>
          <View style={{ flex: isCompactLayout ? undefined : 1 }}>
            <Text className="font-poppins text-ssf-text-muted mb-2">End Time *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: isCompactLayout ? 'column' : 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ flex: isCompactLayout ? undefined : 1, width: isCompactLayout ? '100%' : undefined, boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                />
                <TimeSelect value={endTimeStr} onChange={setEndTimeStr} fullWidth={isCompactLayout} />
              </View>
            ) : (
              <Text className="text-red-500">Use Web for Date/Time picking</Text>
            )}
          </View>
        </View>

        {/* Judge Count Selector */}
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Number of Judges *</Text>
          <View className="flex-row gap-x-2">
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setJudgeCount(n)}
                className={`flex-1 py-3 rounded-xl border items-center ${
                  judgeCount === n
                    ? 'bg-ssf-primary border-ssf-primary'
                    : 'bg-white border-ssf-border'
                }`}
              >
                <Text className={`font-poppins-black text-base ${
                  judgeCount === n ? 'text-white' : 'text-ssf-text'
                }`}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {conflicts && conflicts.length > 0 && (
          <View className="bg-red-50 border border-red-200 p-3 rounded-xl flex-row items-start gap-x-2 mt-2">
            <AlertTriangle size={18} color="#DC2626" className="mt-0.5" />
            <View className="flex-1">
              <Text className="font-poppins-bold text-red-700 text-sm">Venue Conflict Detected</Text>
              <Text className="font-poppins text-red-600 text-xs">
                This venue is already booked for {conflicts.map((c: any) => c.items?.item_name_en).join(', ')} during this time.
              </Text>
            </View>
          </View>
        )}

        <SsfButton 
          label={isCreatingSchedule ? 'Saving...' : 'Create Schedule'} 
          onPress={handleSave} 
          disabled={isCreatingSchedule || !!(conflicts && Platform.OS !== 'web')}
          className="mt-4"
        />
      </SsfCard>
    </ScrollView>
  );
}
