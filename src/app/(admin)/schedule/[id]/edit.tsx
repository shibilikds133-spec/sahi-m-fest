import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { SsfSelectMenu } from '../../../../components/ui/SsfSelectMenu';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useFestival } from '../../../../core/hooks/useFestival';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';
import { isoToScheduleTimeParts, localDateTimeToIso, ScheduleTimeParts, timePartsTo24Hour } from '../../../../services/scheduleTime';

const TimeSelect = ({ value, onChange }: { value: ScheduleTimeParts; onChange: (value: ScheduleTimeParts) => void }) => {
  const update = (patch: Partial<ScheduleTimeParts>) => onChange({ ...value, ...patch });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
      <SsfSelectMenu
        value={value.hour}
        onValueChange={(val) => update({ hour: val })}
        options={Array.from({ length: 12 }, (_, index) => {
          const hour = String(index + 1).padStart(2, '0');
          return { label: hour, value: hour };
        })}
        style={{ flex: 1 }}
      />
      <Text className="font-poppins-bold text-ui-text-muted">:</Text>
      <SsfSelectMenu
        value={value.minute}
        onValueChange={(val) => update({ minute: val })}
        options={Array.from({ length: 60 }, (_, index) => {
          const minute = String(index).padStart(2, '0');
          return { label: minute, value: minute };
        })}
        style={{ flex: 1 }}
      />
      <SsfSelectMenu
        value={value.period}
        onValueChange={(val) => update({ period: val as 'AM' | 'PM' })}
        options={[{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]}
        style={{ flex: 1.2 }}
      />
    </View>
  );
};

export default function EditSchedule() {
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const goBack = useGoBack('/(admin)/schedule');
  
  const { venues, schedules, updateSchedule, isUpdatingSchedule, isLoadingSchedules } = useSchedule();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: items, isLoading: isLoadingItems } = useItems(festival?.id);

  const schedule = schedules.find((s: any) => s.id === scheduleId);

  const [itemId, setItemId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState<ScheduleTimeParts>({ hour: '09', minute: '00', period: 'AM' });
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState<ScheduleTimeParts>({ hour: '10', minute: '00', period: 'AM' });
  const [judgeCount, setJudgeCount] = useState(3);

  useEffect(() => {
    if (schedule) {
      setItemId(schedule.item_id || '');
      setVenueId(schedule.venue_id || '');
      
      if (schedule.start_time) {
        const startDt = new Date(schedule.start_time);
        const yyyy = startDt.getFullYear();
        const mm = String(startDt.getMonth() + 1).padStart(2, '0');
        const dd = String(startDt.getDate()).padStart(2, '0');
        setStartDate(`${yyyy}-${mm}-${dd}`);
        
        setStartTime(isoToScheduleTimeParts(schedule.start_time));
      }
      
      if (schedule.end_time) {
        const endDt = new Date(schedule.end_time);
        const yyyy = endDt.getFullYear();
        const mm = String(endDt.getMonth() + 1).padStart(2, '0');
        const dd = String(endDt.getDate()).padStart(2, '0');
        setEndDate(`${yyyy}-${mm}-${dd}`);
        
        setEndTime(isoToScheduleTimeParts(schedule.end_time));
      }
      
      setJudgeCount(schedule.expected_judge_count || 3);
    }
  }, [schedule]);

  const checkForConflicts = () => {
    const startTimeStr = timePartsTo24Hour(startTime);
    const endTimeStr = timePartsTo24Hour(endTime);
    if (!venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) return null;
    
    const start = new Date(`${startDate}T${startTimeStr}`).getTime();
    const end = new Date(`${endDate}T${endTimeStr}`).getTime();

    const conflicts = schedules.filter((s: any) => {
      if (s.id === scheduleId) return false;
      if (s.venue_id !== venueId) return false;
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
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
    const startTimeStr = timePartsTo24Hour(startTime);
    const endTimeStr = timePartsTo24Hour(endTime);
    if (!itemId || !venueId || !startDate || !startTimeStr || !endDate || !endTimeStr) {
      return showAlert('Error', 'Please fill all fields');
    }

    const startIso = localDateTimeToIso(startDate, startTime);
    const endIso = localDateTimeToIso(endDate, endTime);
    if (!startIso || !endIso) return showAlert('Error', 'Please select valid 12-hour times with AM/PM.');
    const startDateTime = new Date(startIso);
    const endDateTime = new Date(endIso);

    if (startDateTime >= endDateTime) {
      return showAlert('Error', 'End time must be after start time');
    }

    const conflicts = checkForConflicts();
    if (conflicts) {
      const msg = `Venue is already booked for ${conflicts.map((c: any) => c.items?.item_name_en).join(', ')}`;
      if (Platform.OS === 'web') {
        if (!window.confirm(`Conflict Detected: ${msg}.\nDo you still want to proceed?`)) return;
      } else {
         return Alert.alert('Conflict Detected', msg);
      }
    }

    try {
      await updateSchedule({
        id: scheduleId!,
        payload: {
          item_id: itemId,
          venue_id: venueId,
          start_time: startIso,
          end_time: endIso,
          status: schedule?.status || 'scheduled',
          expected_judge_count: judgeCount,
        }
      });
      goBack();
    } catch (error: any) {
      showAlert('Error', error.message);
    }
  };

  if (isLoadingItems || isLoadingSchedules) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;

  if (!schedule) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center p-6">
        <Text className="font-poppins text-ssf-text">Schedule not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
    );
  }

  const conflicts = checkForConflicts();

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-3 px-3">
      <View className="flex-row items-center mb-4">
        <TouchableOpacity onPress={goBack} className="mr-3 h-9 w-9 bg-white border border-ui-border rounded-lg items-center justify-center">
          <ArrowLeft size={18} color="#334155" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-poppins-black text-ui-text">Edit Schedule</Text>
          <Text className="font-poppins text-xs text-ui-text-muted mt-0.5">Update event, venue and judging requirements.</Text>
        </View>
      </View>

      <SsfCard className="gap-y-4 p-4 border border-ui-border shadow-none">
        <View className="flex-row flex-wrap gap-4">
          <View className="flex-1 min-w-[280px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Item *</Text>
            <SsfSelectMenu
              value={itemId}
              onValueChange={setItemId}
              accessibilityLabel="Select schedule item"
              searchable
              searchPlaceholder="Search item name or code..."
              options={[
                { label: 'Choose an item', value: '' },
                ...(items ?? []).map((item: any) => ({ label: `[${item.item_code}] ${item.item_name_en}`, value: item.id })),
              ]}
            />
          </View>

          <View className="flex-1 min-w-[280px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Venue *</Text>
            <SsfSelectMenu
              value={venueId}
              onValueChange={setVenueId}
              accessibilityLabel="Select schedule venue"
              searchable
              searchPlaceholder="Search venue..."
              options={[
                { label: 'Choose a venue', value: '' },
                ...venues.map((venue: any) => ({ label: `${venue.name}${venue.capacity ? ` (Cap: ${venue.capacity})` : ''}`, value: venue.id })),
              ]}
            />
          </View>
        </View>

        <View className="flex-row flex-wrap gap-4 pt-1">
          <View className="flex-1 min-w-[300px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Start *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  style={dateTimeInputStyle}
                />
                <TimeSelect value={startTime} onChange={setStartTime} />
              </View>
            ) : (
              <Text className="text-red-500">Use Web for Date/Time picking</Text>
            )}
          </View>
          <View className="flex-1 min-w-[300px]">
            <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">End *</Text>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  style={dateTimeInputStyle}
                />
                <TimeSelect value={endTime} onChange={setEndTime} />
              </View>
            ) : (
              <Text className="text-red-500">Use Web for Date/Time picking</Text>
            )}
          </View>
        </View>

        {/* Judge Count Selector */}
        <View className="pt-1">
          <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted mb-1.5">Number of Judges *</Text>
          <View className="flex-row gap-x-2 max-w-xl">
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setJudgeCount(n)}
                className={`h-10 flex-1 rounded-lg border items-center justify-center ${
                  judgeCount === n
                    ? 'bg-ssf-primary border-ssf-primary'
                    : 'bg-white border-ssf-border'
                }`}
              >
                <Text className={`font-poppins-bold text-xs ${
                  judgeCount === n ? 'text-white' : 'text-ssf-text'
                }`}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {schedule?.assigned_judge_ids?.length > judgeCount && (
            <View className="bg-red-50 border border-red-200 p-3 rounded-xl mt-3">
              <Text className="font-poppins-bold text-red-700 text-xs">
                {schedule.assigned_judge_ids.length} judges are currently assigned, but the new requirement is {judgeCount}.
                {' '}Remove {schedule.assigned_judge_ids.length - judgeCount} extra judge(s) from Judge Panel.
              </Text>
            </View>
          )}
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

        <View className="flex-row justify-end pt-2 border-t border-ui-border">
          <SsfButton
            label={isUpdatingSchedule ? 'Saving...' : 'Update Schedule'}
            onPress={handleSave}
            disabled={isUpdatingSchedule || !!(conflicts && Platform.OS !== 'web')}
          />
        </View>
      </SsfCard>
    </ScrollView>
  );
}

const dateTimeInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 42,
  padding: '0 12px',
  borderRadius: 9,
  border: '1px solid #D8E0EA',
  background: '#FFFFFF',
  color: '#0F172A',
  fontFamily: 'Poppins_400Regular',
  outline: 'none',
};
