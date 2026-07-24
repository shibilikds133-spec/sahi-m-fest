import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { useFestival } from '../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';

const TimeSelect = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
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
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1.5, gap: 4 }}>
      <select 
        value={hour} 
        onChange={(e) => {
          setHour(e.target.value);
          handleChange(e.target.value, minute, ampm);
        }}
        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB', flex: 1 }}
      >
        {Array.from({length: 12}, (_, i) => {
          const v = (i + 1).toString().padStart(2, '0');
          return <option key={v} value={v}>{v}</option>;
        })}
      </select>
      <Text style={{ marginHorizontal: 2, fontWeight: 'bold', color: '#333' }}>:</Text>
      <select 
        value={minute} 
        onChange={(e) => {
          setMinute(e.target.value);
          handleChange(hour, e.target.value, ampm);
        }}
        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB', flex: 1 }}
      >
        {['00', '15', '30', '45'].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select 
        value={ampm} 
        onChange={(e) => {
          setAmpm(e.target.value);
          handleChange(hour, minute, e.target.value);
        }}
        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB', flex: 1.2 }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </View>
  );
};

export default function CreateSchedule() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  
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
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-2xl font-poppins-black text-ssf-text">Create Schedule</Text>
      </View>

      <SsfCard className="gap-y-4">
        <View style={{ position: 'relative', zIndex: 100 }}>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Item *</Text>
          <View className="border border-ssf-border rounded-xl bg-ssf-surface overflow-hidden">
            <TextInput
              placeholder="-- Choose an Item --"
              value={isItemDropdownOpen ? itemSearchText : (itemId ? (() => {
                const sel = items?.find((i: any) => i.id === itemId);
                return sel ? `[${sel.item_code}] ${sel.item_name_en}` : '';
              })() : '')}
              onChangeText={(text) => {
                setItemSearchText(text);
                if (!isItemDropdownOpen) setIsItemDropdownOpen(true);
              }}
              onFocus={() => {
                setIsItemDropdownOpen(true);
                setItemSearchText('');
              }}
              className="p-3 font-poppins text-ssf-text"
            />
          </View>
          
          {isItemDropdownOpen && (
            <View className="absolute top-full left-0 right-0 mt-1 border border-ssf-border rounded-xl bg-white shadow-lg overflow-hidden" style={{ maxHeight: 250, zIndex: 999 }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {items?.filter((i: any) => {
                  if (!itemSearchText) return true;
                  const search = itemSearchText.toLowerCase();
                  const name = (i.item_name_en || '').toLowerCase();
                  const code = (i.item_code || '').toLowerCase();
                  const cats = Array.isArray(i.category_codes) ? i.category_codes.join(' ').toLowerCase() : (i.category_codes || '').toLowerCase();
                  return name.includes(search) || code.includes(search) || cats.includes(search);
                }).map((i: any) => (
                  <TouchableOpacity
                    key={i.id}
                    className="p-3 border-b border-gray-100 last:border-0"
                    onPress={() => {
                      setItemId(i.id);
                      setIsItemDropdownOpen(false);
                      setItemSearchText('');
                    }}
                  >
                    <Text className="font-poppins text-ssf-text">
                      [{i.item_code}] {i.item_name_en} ({Array.isArray(i.category_codes) ? i.category_codes.join(',') : i.category_codes})
                    </Text>
                  </TouchableOpacity>
                ))}
                {items?.filter((i: any) => {
                  if (!itemSearchText) return true;
                  const search = itemSearchText.toLowerCase();
                  const name = (i.item_name_en || '').toLowerCase();
                  const code = (i.item_code || '').toLowerCase();
                  const cats = Array.isArray(i.category_codes) ? i.category_codes.join(' ').toLowerCase() : (i.category_codes || '').toLowerCase();
                  return name.includes(search) || code.includes(search) || cats.includes(search);
                }).length === 0 && (
                  <View className="p-3">
                    <Text className="font-poppins text-ssf-text-muted text-sm">No items found</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Select Venue *</Text>
          <View className="border border-ssf-border rounded-xl bg-ssf-surface overflow-hidden">
            <select 
              style={{ width: '100%', padding: '12px', border: 'none', backgroundColor: 'transparent', outline: 'none', fontFamily: 'inherit', color: '#333' }}
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              <option value="">-- Choose a Venue --</option>
              {venues.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.capacity ? `(Cap: ${v.capacity})` : ''}
                </option>
              ))}
            </select>
          </View>
        </View>

        <View className="flex-row gap-x-4">
          <View className="flex-1">
            <Text className="font-poppins text-ssf-text-muted mb-2">Start Time *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                />
                <TimeSelect value={startTimeStr} onChange={setStartTimeStr} />
              </View>
            ) : (
              <Text className="text-red-500">Use Web for Date/Time picking</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="font-poppins text-ssf-text-muted mb-2">End Time *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                />
                <TimeSelect value={endTimeStr} onChange={setEndTimeStr} />
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
